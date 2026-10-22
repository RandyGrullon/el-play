import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Clock, Crown, Info, Lock, Plus, Search, Share2, Sparkles, Trophy, Users, Wand2, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLeague } from '../store/LeagueContext';
import { PlayerPhoto } from '../components/ui/PlayerPhoto';
import { TeamLogo } from '../components/ui/TeamLogo';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Segmented } from '../components/ui/Segmented';
import { ErrorState, OfflineState, Skeleton, waitingForNetwork } from '../components/ui/States';
import { AccountCard } from '../components/account/AccountCard';
import { PlayerSheet } from '../components/stats/PlayerSheet';
import { FanProfile } from '../components/fantasy/FanProfile';
import { FanRow, FanSearch, SeasonTable, type OpenFan } from '../components/fantasy/FanSearch';
import { ProBadge } from '../components/pro/ProBadge';
import { useIsPro } from '../lib/pro';
import { usePlayers } from '../lib/stats';
import { formatLongDate, formatTime } from '../lib/format';
import { inningName } from '../lib/baseball';
import { bestLineup, projectedPoints, valueOf } from '../lib/fantasyBest';
import { showToast } from '../lib/toast';
import {
    RULES,
    addPlayer,
    applyLineup,
    canAdd,
    creditsLeft,
    effectiveEntry,
    entryCost,
    perTeamLimit,
    entryKey,
    fetchFantasyDay,
    gameStarted,
    getStore,
    history,
    isLocked,
    lineText,
    nextLockAt,
    pickPoints,
    pickResult,
    playerScore,
    removePlayer,
    setCaptain,
    setPick,
    settleDay,
    teamPoints,
    unsettledDays,
    useEntry,
    useFantasyDay,
    useFantasyStore,
    type DayEntry,
    type FantasyDay,
    type FantasyGame,
    type FantasyPlayer
} from '../lib/fantasy';
import { accountEnabled, createLeague, dayEntries, joinLeague, myLeagues, pushEntry, syncFantasy, useSession, type PrivateLeague, type Rival } from '../lib/account';
import { isFanId, useFanProfile, useFantasyOwners } from '../lib/fans';

type Tab = 'team' | 'picks' | 'table' | 'fans';
const DAY_MS = 86400000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// ---------------------------------------------------------------- textos cortos del pelotero

const gameStatus = (day: FantasyDay, gamePk: number, lang: string, t: (key: string) => string) => {
    const game = day.games.find((g) => g.gamePk === gamePk);
    if (!game) return '';
    if (game.state === 'final') return t('fantasy.final');
    if (game.state === 'live' && game.live) return inningName({ n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState }, lang, true);
    return formatTime(game.date, lang);
};

// ---------------------------------------------------------------- página

export const FantasyPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { activeLeague } = useLeague();
    const [date, setDate] = useState<string | undefined>(undefined);
    const [today, setToday] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('team');
    const [picking, setPicking] = useState<'B' | 'P' | null>(null);
    const query = useFantasyDay(activeLeague, date);
    const day = query.data;
    const entry = useEntry(activeLeague, day?.date);
    const store = useFantasyStore();
    const session = useSession();
    const client = useQueryClient();
    // El Fantasy se juega con cuenta; sin ella se ve la portada para entrar
    const playing = accountEnabled() && !!session;

    // Perfil de un fanático: `?fan=<id>` lo abre (se puede compartir el enlace) y atrás lo cierra
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const fanId = params.get('fan');
    const fanState = location.state as { fanSheet?: boolean; fanName?: string | null } | null;
    // El nombre que ya se conoce (el de la fila que se tocó) se pasa para no mostrar «Fanático» mientras carga
    const openFan = useCallback(
        (id: string, name?: string | null) =>
            setParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    next.set('fan', id);
                    return next;
                },
                { state: { fanSheet: true, fanName: name ?? null } }
            ),
        [setParams]
    );
    // Estable entre renders: la hoja no debe reaccionar a cada refresco de la página
    const closeFan = useCallback(() => {
        // Si se abrió desde aquí se vuelve atrás (así no queda repetido en el historial); si llegó por enlace se quita
        if (fanState?.fanSheet) navigate(-1);
        else
            setParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    next.delete('fan');
                    return next;
                },
                { replace: true }
            );
    }, [fanState?.fanSheet, navigate, setParams]);

    useEffect(() => {
        if (!date && day?.date) setToday(day.date);
    }, [date, day?.date]);
    useEffect(() => {
        setDate(undefined);
        setToday(null);
    }, [activeLeague]);

    // Al terminar el día se guarda el resultado; con cuenta, cada cambio se sube
    useEffect(() => {
        if (day) settleDay(day, entry);
    }, [day, entry]);
    useEffect(() => {
        if (session && day && entry.savedAt) pushEntry(day.league, day.date, entry);
    }, [session, day?.league, day?.date, entry.savedAt]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (session) syncFantasy().catch(() => undefined);
    }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Días pasados que llegaron de la cuenta sin resultado (jugados en otro teléfono): se cierran para el historial
    const unsettled = useMemo(() => (today ? unsettledDays(store, activeLeague, today).join(',') : ''), [store, activeLeague, today]);
    useEffect(() => {
        if (!session || !unsettled) return;
        let cancelled = false;
        (async () => {
            for (const past of unsettled.split(',')) {
                const data = await client
                    .fetchQuery({ queryKey: ['fantasy', activeLeague, past], queryFn: ({ signal }) => fetchFantasyDay(activeLeague, past, signal), staleTime: 3600000 })
                    .catch(() => null);
                if (cancelled) return;
                const saved = getStore()[entryKey(activeLeague, past)];
                if (data && saved) settleDay(data, saved);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [session?.user.id, activeLeague, unsettled]); // eslint-disable-line react-hooks/exhaustive-deps

    const past = useMemo(() => history(store, activeLeague), [store, activeLeague]);
    // La temporada la da el servidor (la misma de la tabla y del perfil); mientras carga o sin red, la del teléfono
    const mine = useFanProfile(playing ? session.user.id : null, activeLeague);
    const season = mine.data?.season ?? { points: Math.round(past.reduce((sum, d) => sum + d.points, 0) * 10) / 10, days: past.length };
    const points = day ? teamPoints(day, entry) : 0;
    const picks = day ? pickPoints(day, entry) : 0;
    const days = today ? [shift(today, -1), today, shift(today, 1)] : [];
    const dayLabel = (key: string) => (key === today ? t('games.today') : key < (today ?? '') ? t('games.yesterday') : t('games.tomorrow'));

    return (
        <div className="space-y-4 px-4 pt-5">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-muted first-letter:uppercase">{day ? formatLongDate(day.date, i18n.language) : t(`leagues.${activeLeague}.name`)}</p>
                    <h1 className="display text-[32px] leading-tight">
                        {t('fantasy.title')} <ProBadge auto />
                    </h1>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Link to="/estadisticas" className="flex h-12 items-center gap-1.5 rounded-2xl bg-surface px-3.5 text-sm font-bold shadow-card" aria-label={t('statsPage.title')}>
                        <BarChart3 className="h-5 w-5" />
                        <span className="hidden min-[400px]:inline">{t('statsPage.open')}</span>
                    </Link>
                    {playing && day && day.players.some((p) => entry.lineup.includes(p.id)) && <ShareTeam day={day} entry={entry} points={points + picks} />}
                </div>
            </header>

            {!playing ? (
                <FantasyGate day={day} loading={query.isPending} />
            ) : (
                <>
                    {days.length > 0 && (
                        <div className="flex gap-2" role="tablist" aria-label={t('games.selectDate')}>
                            {days.map((key) => {
                                const active = (date ?? today) === key;
                                return (
                                    <button key={key} type="button" role="tab" aria-selected={active} onClick={() => setDate(key === today ? undefined : key)} className={`rounded-full px-4 py-2 text-sm font-bold ${active ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card'}`}>
                                        {dayLabel(key)}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Resumen: puntos del día, pronósticos y temporada */}
                    <section className="relative overflow-hidden rounded-card p-5 text-white shadow-float" style={{ background: 'linear-gradient(135deg, #1e4fd8 0%, #6d28d9 55%, #e11d48 100%)' }}>
                        <Sparkles className="absolute -right-3 -top-3 h-24 w-24 opacity-15" aria-hidden="true" />
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-85">{t('fantasy.yourPoints')}</p>
                        <p className="mt-1 font-display text-[64px] font-extrabold leading-none tabular-nums">{credits(Math.round((points + picks) * 10) / 10, i18n.language)}</p>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
                            <span>{t('fantasy.teamPts', { pts: credits(points, i18n.language) })}</span>
                            <span>{t('fantasy.picksPts', { pts: credits(picks, i18n.language) })}</span>
                            <span>{t('fantasy.seasonPts', { pts: credits(Math.round(season.points * 10) / 10, i18n.language), count: season.days, days: season.days })}</span>
                        </div>
                        {past.length > 0 && <HistoryBars days={past.slice(0, 7).reverse()} />}
                    </section>

                    <FantasyTabs
                        value={tab}
                        onChange={setTab}
                        options={[
                            { value: 'team', label: t('fantasy.myTeam') },
                            { value: 'picks', label: t('fantasy.picks') },
                            { value: 'table', label: t('fantasy.table') },
                            { value: 'fans', label: t('fantasy.fans.tab') }
                        ]}
                    />

                    {tab === 'fans' ? (
                        <FanSearch league={activeLeague} onOpen={openFan} />
                    ) : waitingForNetwork(query) ? (
                        <OfflineState />
                    ) : query.isPending ? (
                        <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[88px] rounded-card" />)}</div>
                    ) : query.isError && !day ? (
                        <ErrorState error={query.error as Error} onRetry={() => query.refetch()} />
                    ) : day && !day.games.length && tab !== 'table' ? (
                        <div className="card p-6 text-center">
                            <p className="font-extrabold">{t('fantasy.noGames')}</p>
                            <p className="mt-1 text-sm text-muted">{t('fantasy.noGamesHint')}</p>
                        </div>
                    ) : day ? (
                        tab === 'team' ? (
                            <TeamTab day={day} entry={entry} onPick={setPicking} />
                        ) : tab === 'picks' ? (
                            <PicksTab day={day} entry={entry} />
                        ) : (
                            <TableTab day={day} dayName={dayLabel(day.date)} onOpenFan={openFan} />
                        )
                    ) : null}

                    {day && picking && <PlayerPicker day={day} entry={entry} role={picking} onClose={() => setPicking(null)} />}
                </>
            )}

            {isFanId(fanId) && <FanProfile userId={fanId} league={activeLeague} onClose={closeFan} knownName={fanState?.fanName ?? null} />}
        </div>
    );
};

/** Las cuatro pestañas como el Segmented, pero a todo lo ancho y cada una a la medida de su texto para que quepan en 320 px */
const FantasyTabs: React.FC<{ value: Tab; onChange: (tab: Tab) => void; options: { value: Tab; label: string }[] }> = ({ value, onChange, options }) => {
    const { t } = useTranslation();
    return (
        <div role="tablist" aria-label={t('fantasy.sections')} className="flex w-full rounded-full bg-raised p-1 sm:inline-flex sm:w-auto">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(option.value)}
                        className={`min-w-0 flex-auto truncate whitespace-nowrap rounded-full px-1.5 py-1.5 text-[13px] font-semibold transition-colors min-[400px]:px-2.5 min-[400px]:text-sm sm:flex-none sm:px-4 ${
                            active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
                        }`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
};

// ---------------------------------------------------------------- portada sin cuenta

const FantasyGate: React.FC<{ day?: FantasyDay; loading: boolean }> = ({ day, loading }) => {
    const { t, i18n } = useTranslation();
    const [rules, setRules] = useState(false);
    const [info, setInfo] = useState<FantasyPlayer | null>(null);
    const started = !!day?.games.some((game) => game.state !== 'preview');
    const top = day && started ? day.players.filter((p) => p.played).sort((a, b) => b.points - a.points).slice(0, 5) : [];
    const steps = [
        { Icon: Users, text: t('fantasy.gate.step1', { batters: RULES.batters, perTeam: RULES.perTeam, budget: RULES.budget }) },
        { Icon: Crown, text: t('fantasy.gate.step2', { x: RULES.captain }) },
        { Icon: Trophy, text: t('fantasy.gate.step3', { pts: RULES.pick }) }
    ];

    return (
        <>
            <section className="relative overflow-hidden rounded-card p-5 text-white shadow-float" style={{ background: 'linear-gradient(135deg, #1e4fd8 0%, #6d28d9 55%, #e11d48 100%)' }}>
                <Sparkles className="absolute -right-4 -top-4 h-28 w-28 opacity-15" aria-hidden="true" />
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-85">{t('fantasy.gate.eyebrow')}</p>
                <h2 className="mt-1 max-w-[18ch] font-display text-[28px] font-extrabold leading-[1.1] [text-wrap:balance]">{t('fantasy.gate.title')}</h2>
                <p className="mt-2 max-w-[42ch] text-sm opacity-90">{t('fantasy.gate.lead')}</p>
                <ol className="mt-4 space-y-2.5">
                    {steps.map(({ Icon, text }) => (
                        <li key={text} className="flex items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
                                <Icon className="h-4 w-4" />
                            </span>
                            <span className="pt-1.5 text-sm font-semibold leading-snug">{text}</span>
                        </li>
                    ))}
                </ol>
            </section>

            <AccountCard purpose="fantasy" />

            {loading ? (
                <Skeleton className="h-40 rounded-card" />
            ) : top.length > 0 ? (
                <section aria-label={t('fantasy.gate.topToday')}>
                    <h2 className="eyebrow mb-2">{t('fantasy.gate.topToday')}</h2>
                    <ol className="card divide-y divide-line/10 overflow-hidden">
                        {top.map((player, index) => {
                            const team = day?.teams[player.teamId];
                            const line = lineText(player, t);
                            return (
                                <li key={player.id}>
                                    <button type="button" onClick={() => setInfo(player)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-label={t('statsPage.viewPlayer', { name: player.name })}>
                                        <span className="w-5 text-center font-display text-lg font-extrabold text-muted">{index + 1}</span>
                                        <PlayerPhoto personId={player.id} name={player.name} size={44} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-extrabold">{player.name}</span>
                                            <span className="block truncate text-xs text-muted">
                                                {team?.abbrev} · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')}
                                                {line ? ` · ${line}` : ''}
                                            </span>
                                        </span>
                                        <span className="font-display text-xl font-extrabold tabular-nums">{player.points}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            ) : day && day.games.length > 0 ? (
                <section aria-label={t('fantasy.gate.playingToday')}>
                    <h2 className="eyebrow mb-2">{t('fantasy.gate.playingToday')}</h2>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {day.games.map((game) => (
                            <div key={game.gamePk} className="card flex items-center gap-2 p-3">
                                <TeamLogo team={game.away} size={30} />
                                <span className="text-sm font-extrabold">{game.away.abbrev}</span>
                                <span className="flex-1 text-center text-xs font-semibold text-muted">{formatTime(game.date, i18n.language)}</span>
                                <span className="text-sm font-extrabold">{game.home.abbrev}</span>
                                <TeamLogo team={game.home} size={30} />
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {day && (
                <>
                    <button type="button" onClick={() => setRules((v) => !v)} className="flex items-center gap-2 text-sm font-semibold text-accent-ink" aria-expanded={rules}>
                        <Info className="h-4 w-4" />
                        {t('fantasy.howPoints')}
                    </button>
                    {rules && <ScoringTable day={day} />}
                </>
            )}
            {info && <PlayerSheet id={info.id} name={info.name} team={teamOf(day, info)} onClose={() => setInfo(null)} />}
        </>
    );
};

/** Créditos con la coma o el punto del idioma (8,5 / 8.5) */
const credits = (value: number, language: string) => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
const valueText = (value: number, language: string) => new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

/** Barra de créditos del equipo: cuánto lleva gastado, cuánto le queda o por cuánto se pasó */
const CreditsMeter: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    if (!day.credits) return null;
    const spent = entryCost(day, entry);
    const left = creditsLeft(day, entry) ?? 0;
    const over = left < -1e-9;
    // Le faltan peloteros y lo que queda no alcanza ni para los más baratos: tiene que cambiar a alguien caro
    const missing = Math.max(0, RULES.batters + RULES.pitchers - entry.lineup.length);
    const short = !over && missing > 0 && left + 1e-9 < missing * day.credits.min;
    const share = Math.min(1, spent / day.credits.budget);
    return (
        <div className="card space-y-2 p-3.5">
            <div className="flex items-baseline justify-between gap-3">
                <p className="eyebrow">{t('fantasy.credits.label')}</p>
                <p className="text-sm font-bold tabular-nums">
                    {t('fantasy.credits.spent', { spent: credits(spent, i18n.language), budget: credits(day.credits.budget, i18n.language) })}
                </p>
            </div>
            <div
                className="h-2 overflow-hidden rounded-full bg-raised"
                role="meter"
                aria-label={t('fantasy.credits.label')}
                aria-valuemin={0}
                aria-valuemax={day.credits.budget}
                aria-valuenow={spent}
            >
                <div className={`h-full rounded-full transition-[width] duration-500 ${over ? 'bg-live' : 'bg-accent'}`} style={{ width: `${share * 100}%` }} />
            </div>
            <p className={`text-xs font-semibold ${over || short ? 'text-live' : 'text-muted'}`}>
                {over
                    ? t('fantasy.credits.over', { over: credits(-left, i18n.language) })
                    : short
                      ? t('fantasy.credits.short', { left: credits(left, i18n.language), count: missing, min: credits(day.credits.min, i18n.language) })
                      : t('fantasy.credits.left', { left: credits(left, i18n.language) })}
            </p>
        </div>
    );
};

/** Minutos u horas que faltan («25 min», «2 h 10 min») */
const untilText = (ms: number, t: (key: string, options?: Record<string, unknown>) => string) => {
    const minutes = Math.max(1, Math.round(ms / 60000));
    return minutes < 60 ? t('fantasy.smart.min', { n: minutes }) : t('fantasy.smart.hours', { h: Math.floor(minutes / 60), m: minutes % 60 });
};

/** % de elección del día: solo cuando hay juegos empezados (antes no se muestra para que nadie copie) */
const useOwners = (day: FantasyDay) => {
    const started = day.games.some((game) => gameStarted(game));
    const owners = useFantasyOwners(day.league, day.date, accountEnabled() && started);
    return useMemo(() => new Map((owners.data?.players ?? []).map((row) => [row.id, row])), [owners.data]);
};

/** Próximo cierre (cuenta regresiva al minuto) y cuántos peloteros faltan */
const LockNotice: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30000);
        return () => window.clearInterval(timer);
    }, []);
    const next = nextLockAt(day, now);
    if (next === null) return null;
    const missing = Math.max(0, RULES.batters + RULES.pitchers - entry.lineup.length);
    const game = day.games.find((g) => !g.startTimeTBD && Date.parse(g.date) === next);
    return (
        <div className={`flex items-start gap-2.5 rounded-2xl p-3 text-sm ${missing ? 'bg-live/10' : 'bg-raised'}`}>
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0">
                <span className="font-bold">{t('fantasy.smart.nextLock', { time: untilText(next - now, t) })}</span>
                {game && (
                    <span className="text-muted">
                        {' '}
                        · {game.away.abbrev}–{game.home.abbrev}, <span className="whitespace-nowrap">{formatTime(game.date, i18n.language)}</span>
                    </span>
                )}
                {missing > 0 && <span className="block font-semibold text-live">{t('fantasy.smart.missing', { count: missing })}</span>}
            </p>
        </div>
    );
};

/** Proyección del equipo y las ayudas: completar con los mejores y ver el equipo sugerido */
const SmartActions: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const hasProj = day.players.some((player) => player.proj !== undefined);
    const anyOpen = day.players.some((player) => !isLocked(day, player));
    if (!hasProj) return null;
    const missing = RULES.batters + RULES.pitchers - entry.lineup.length;
    const projected = projectedPoints(day, entry.lineup, entry.captain);
    const fill = () => {
        const best = bestLineup(day, { metric: 'proj', keep: entry.lineup, captain: entry.captain });
        if (best) applyLineup(day, best.lineup, best.captain);
        else showToast(t('fantasy.smart.none'));
    };
    const locked = entry.lineup.filter((id) => {
        const player = day.players.find((p) => p.id === id);
        return !!player && isLocked(day, player);
    });
    const lockedCaptain = entry.captain !== null && locked.includes(entry.captain) ? entry.captain : null;
    if (!anyOpen) return null;
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-sm">
                    <span className="text-muted">{t('fantasy.smart.teamProj')}</span>{' '}
                    <b className="tabular-nums">{t('fantasy.smart.pts', { pts: credits(projected, i18n.language) })}</b>
                </p>
                {anyOpen && missing > 0 && (
                    <button type="button" onClick={fill} className="flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-xs font-extrabold text-white">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        {t('fantasy.smart.fill')}
                    </button>
                )}
                {anyOpen && (
                    <button type="button" onClick={() => setOpen(true)} className="flex h-11 items-center gap-1.5 rounded-full bg-raised px-4 text-xs font-extrabold">
                        <Wand2 className="h-4 w-4" aria-hidden="true" />
                        {t('fantasy.smart.suggest')}
                    </button>
                )}
            </div>
            {open && <SuggestSheet day={day} keep={locked} captain={lockedCaptain} onClose={() => setOpen(false)} />}
        </>
    );
};

/** El equipo sugerido (el mejor según las proyecciones, con los créditos y las reglas): se ve antes de usarlo */
const SuggestSheet: React.FC<{ day: FantasyDay; keep: number[]; captain: number | null; onClose: () => void }> = ({ day, keep, captain, onClose }) => {
    const { t, i18n } = useTranslation();
    const best = useMemo(() => bestLineup(day, { metric: 'proj', keep, captain }), [day, keep, captain]);
    return (
        <BottomSheet open onClose={onClose} title={t('fantasy.smart.suggestTitle')}>
            <div className="space-y-3 pb-2">
                <p className="text-sm text-muted">{t('fantasy.smart.suggestHint')}</p>
                {best ? (
                    <>
                        <LineupList day={day} lineup={best.lineup} captain={best.captain} metric="proj" />
                        <p className="text-sm font-bold">
                            {t('fantasy.smart.suggestTotal', { pts: credits(best.total, i18n.language), cost: credits(best.cost, i18n.language), budget: credits(day.credits?.budget ?? 0, i18n.language) })}
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                applyLineup(day, best.lineup, best.captain);
                                onClose();
                            }}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-sm font-extrabold text-white"
                        >
                            <Wand2 className="h-4 w-4" aria-hidden="true" />
                            {t('fantasy.smart.use')}
                        </button>
                    </>
                ) : (
                    <p className="card p-4 text-sm text-muted">{t('fantasy.smart.none')}</p>
                )}
            </div>
        </BottomSheet>
    );
};

/** Lista corta de un equipo (sugerido o ideal): foto, nombre, equipo y sus puntos (proyectados o reales) */
const LineupList: React.FC<{ day: FantasyDay; lineup: number[]; captain: number | null; metric: 'proj' | 'points' }> = ({ day, lineup, captain, metric }) => {
    const { t, i18n } = useTranslation();
    const players = lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    return (
        <ul className="divide-y divide-line/10">
            {players.map((player) => {
                const team = day.teams[player.teamId];
                const points = metric === 'proj' ? player.proj ?? 0 : player.points;
                return (
                    <li key={player.id} className="flex items-center gap-3 py-2">
                        <PlayerPhoto personId={player.id} name={player.name} size={40} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                        <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 truncate text-sm font-extrabold">
                                {captain === player.id && <Crown className="h-3.5 w-3.5 shrink-0 text-gold" aria-label={t('fantasy.captain')} />}
                                <span className="truncate">{player.name}</span>
                            </p>
                            <p className="truncate text-xs text-muted">
                                {team?.abbrev} · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')}
                                {player.price !== undefined ? ` · ${t('fantasy.credits.price', { price: credits(player.price, i18n.language) })}` : ''}
                            </p>
                        </div>
                        <span className="text-right">
                            <span className="block font-display text-lg font-extrabold tabular-nums">{credits(captain === player.id ? Math.round(points * RULES.captain * 10) / 10 : points, i18n.language)}</span>
                            <span className="block text-[10px] font-semibold text-muted">{metric === 'proj' ? t('fantasy.smart.projShort') : t('fantasy.fans.pts')}</span>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
};

/** El equipo ideal del día (lo máximo que se podía sumar con los créditos y las reglas) y cuánto de eso hizo el tuyo */
const IdealCard: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const started = day.games.some((game) => game.state !== 'preview');
    const ideal = useMemo(() => (started ? bestLineup(day, { metric: 'points', ignoreLocks: true }) : null), [day, started]);
    const [open, setOpen] = useState(false);
    if (!ideal || ideal.total <= 0) return null;
    const mine = teamPoints(day, entry);
    const pct = Math.max(0, Math.min(100, Math.round((Math.max(0, mine) / ideal.total) * 100)));
    const live = day.games.some((game) => game.state === 'live');
    return (
        <section className="card space-y-3 p-4" aria-label={t('fantasy.smart.ideal')}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="eyebrow flex items-center gap-1.5">
                        <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('fantasy.smart.ideal')}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{t(live ? 'fantasy.smart.idealLive' : 'fantasy.smart.idealHint')}</p>
                </div>
                <p className="shrink-0 font-display text-3xl font-extrabold leading-none tabular-nums">{credits(ideal.total, i18n.language)}</p>
            </div>
            {entry.lineup.length > 0 && (
                <div>
                    <div className="h-2 overflow-hidden rounded-full bg-raised" role="meter" aria-label={t('fantasy.smart.ideal')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs font-semibold text-muted">{t('fantasy.smart.idealYou', { pts: credits(mine, i18n.language), ideal: credits(ideal.total, i18n.language), pct })}</p>
                </div>
            )}
            <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-accent-ink" aria-expanded={open}>
                {open ? t('fantasy.smart.idealHide') : t('fantasy.smart.idealShow')}
            </button>
            {open && <LineupList day={day} lineup={ideal.lineup} captain={ideal.captain} metric="points" />}
        </section>
    );
};

const teamOf = (day: FantasyDay | undefined, player: FantasyPlayer) => {
    const team = day?.teams[player.teamId];
    return team ? { id: team.id, logo: team.logo, color: team.color } : null;
};

// ---------------------------------------------------------------- mi equipo

const TeamTab: React.FC<{ day: FantasyDay; entry: DayEntry; onPick: (role: 'B' | 'P') => void }> = ({ day, entry, onPick }) => {
    const { t } = useTranslation();
    const [rules, setRules] = useState(false);
    const owners = useOwners(day);
    const chosen = entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    const batters = chosen.filter((p) => p.role === 'B');
    const pitchers = chosen.filter((p) => p.role === 'P');
    const slots: (FantasyPlayer | 'B' | 'P')[] = [
        ...batters,
        ...Array.from({ length: Math.max(0, RULES.batters - batters.length) }, () => 'B' as const),
        ...pitchers,
        ...Array.from({ length: Math.max(0, RULES.pitchers - pitchers.length) }, () => 'P' as const)
    ];

    return (
        <section className="space-y-3" aria-label={t('fantasy.myTeam')}>
            <p className="text-sm text-muted">{t(day.credits ? 'fantasy.rulesShortCredits' : 'fantasy.rulesShort', { batters: RULES.batters, perTeam: perTeamLimit(day) })}</p>
            <LockNotice day={day} entry={entry} />
            <CreditsMeter day={day} entry={entry} />
            <SmartActions day={day} entry={entry} />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {slots.map((slot, index) =>
                    typeof slot === 'string' ? (
                        <button key={`empty-${index}`} type="button" onClick={() => onPick(slot)} className="flex h-[84px] items-center gap-3 rounded-[22px] border-2 border-dashed border-line/20 px-4 text-left font-bold text-muted">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-raised">
                                <Plus className="h-5 w-5" />
                            </span>
                            {slot === 'P' ? t('fantasy.addPitcher') : t('fantasy.addBatter')}
                        </button>
                    ) : (
                        <PlayerSlot key={slot.id} day={day} entry={entry} player={slot} owned={owners.get(slot.id)} />
                    )
                )}
            </div>

            <IdealCard day={day} entry={entry} />

            <button type="button" onClick={() => setRules((v) => !v)} className="flex items-center gap-2 text-sm font-semibold text-accent-ink" aria-expanded={rules}>
                <Info className="h-4 w-4" />
                {t('fantasy.howPoints')}
            </button>
            {rules && <ScoringTable day={day} />}
        </section>
    );
};

const PlayerSlot: React.FC<{ day: FantasyDay; entry: DayEntry; player: FantasyPlayer; owned?: { pct: number; captainPct: number } }> = ({ day, entry, player, owned }) => {
    const { t, i18n } = useTranslation();
    const team = day.teams[player.teamId];
    const locked = isLocked(day, player);
    const captain = entry.captain === player.id;
    const line = lineText(player, t);
    const [info, setInfo] = useState(false);
    return (
        <div className="relative flex h-[84px] items-center gap-3 rounded-[22px] bg-surface px-3 shadow-card">
            <button type="button" onClick={() => setInfo(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t('statsPage.viewPlayer', { name: player.name })}>
                <PlayerPhoto personId={player.id} name={player.name} size={56} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-extrabold">
                        {captain && <Crown className="h-4 w-4 shrink-0 text-gold" aria-label={t('fantasy.captain')} />}
                        <span className="truncate">{player.name}</span>
                    </p>
                    <p className="truncate text-xs font-semibold text-muted">
                        {team?.abbrev} · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')} · {gameStatus(day, player.gamePk, i18n.language, t)}
                        {day.credits && player.price !== undefined ? ` · ${t('fantasy.credits.price', { price: credits(player.price, i18n.language) })}` : ''}
                    </p>
                    {line ? (
                        <p className="truncate text-xs text-muted">{line}</p>
                    ) : (
                        !locked &&
                        player.proj !== undefined && (
                            <p className="truncate text-xs font-semibold text-accent-ink">
                                {t('fantasy.smart.proj', { pts: credits(player.proj, i18n.language) })}
                                {player.rest ? ` · ${t('fantasy.smart.restShort')}` : player.startedAgo !== undefined ? ` · ${t('fantasy.smart.startedAgo', { count: player.startedAgo })}` : ''}
                            </p>
                        )
                    )}
                </div>
            </button>
            <div className="flex flex-col items-end gap-1">
                <span className="font-display text-2xl font-extrabold leading-none tabular-nums">{credits(playerScore(entry, player), i18n.language)}</span>
                {locked ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-faint">
                        {owned && <span title={t('fantasy.smart.owned', { pct: credits(owned.pct, i18n.language) })}>{credits(owned.pct, i18n.language)} %</span>}
                        <Lock className="h-3.5 w-3.5" aria-label={t('fantasy.locked')} />
                    </span>
                ) : (
                    <span className="flex gap-1">
                        <button type="button" onClick={() => setCaptain(day, entry, player)} className={`flex h-7 w-7 items-center justify-center rounded-full ${captain ? 'bg-gold text-white' : 'bg-raised text-muted'}`} aria-label={t('fantasy.makeCaptain')} aria-pressed={captain}>
                            <Crown className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => removePlayer(day, player)} className="flex h-7 w-7 items-center justify-center rounded-full bg-raised text-muted" aria-label={t('fantasy.remove', { name: player.name })}>
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </span>
                )}
            </div>
            {info && <PlayerSheet id={player.id} name={player.name} team={teamOf(day, player)} onClose={() => setInfo(false)} />}
        </div>
    );
};

const ScoringTable: React.FC<{ day: FantasyDay }> = ({ day }) => {
    const { t } = useTranslation();
    const row = (group: 'batter' | 'pitcher') =>
        Object.entries(day.scoring[group]).map(([key, value]) => (
            <li key={`${group}-${key}`} className="flex justify-between gap-3 py-1.5">
                <span>{t(`fantasy.scoring.${group}.${key}`)}</span>
                <span className={`font-bold tabular-nums ${value < 0 ? 'text-live' : ''}`}>{value > 0 ? `+${value}` : value}</span>
            </li>
        ));
    return (
        <div className="card grid gap-4 p-4 text-sm sm:grid-cols-2">
            <div>
                <p className="eyebrow mb-1">{t('fantasy.batters')}</p>
                <ul className="divide-y divide-line/10">{row('batter')}</ul>
            </div>
            <div>
                <p className="eyebrow mb-1">{t('fantasy.pitchers')}</p>
                <ul className="divide-y divide-line/10">{row('pitcher')}</ul>
                <p className="mt-3 text-xs text-muted">{t('fantasy.captainRule', { x: RULES.captain })}</p>
                <p className="mt-1 text-xs text-muted">{t('fantasy.pickRule', { pts: RULES.pick })}</p>
                {day.credits && <p className="mt-1 text-xs text-muted">{t('fantasy.credits.rule', { budget: day.credits.budget, min: day.credits.min, max: day.credits.max })}</p>}
            </div>
            <div className="sm:col-span-2">
                <p className="eyebrow mb-1">{t('fantasy.smart.howTitle')}</p>
                <p className="text-xs text-muted">{t('fantasy.smart.howProj')}</p>
                <p className="mt-1 text-xs text-muted">{t('fantasy.smart.howValue')}</p>
                <p className="mt-1 text-xs text-muted">{t('fantasy.smart.howOwned')}</p>
                <p className="mt-1 text-xs text-muted">{t('fantasy.smart.howBest')}</p>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------- elegir peloteros

const PlayerPicker: React.FC<{ day: FantasyDay; entry: DayEntry; role: 'B' | 'P'; onClose: () => void }> = ({ day, entry, role: initialRole, onClose }) => {
    const { t, i18n } = useTranslation();
    const [role, setRole] = useState<'B' | 'P'>(initialRole);
    const [teamId, setTeamId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [info, setInfo] = useState<FantasyPlayer | null>(null);
    const started = day.games.some((game) => game.state !== 'preview');
    // PRO: puntos de fantasy por juego en la temporada, para escoger con datos
    const pro = useIsPro();
    const season = usePlayers(day.league);
    const owners = useOwners(day);
    const hasProj = day.players.some((p) => p.proj !== undefined);
    type Sort = 'proj' | 'value' | 'price' | 'points';
    const [sort, setSort] = useState<Sort>(started ? 'points' : hasProj ? 'proj' : 'points');
    const metric = (p: FantasyPlayer) => (sort === 'proj' ? p.proj ?? -1 : sort === 'value' ? valueOf(p) ?? -1 : sort === 'price' ? p.price ?? 0 : p.points);
    const averages = useMemo(() => (pro ? new Map((season.data?.players ?? []).map((row) => [row.id, row])) : null), [pro, season.data]);
    const normalized = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    const list = useMemo(
        () =>
            day.players
                .filter((p) => p.role === role && (teamId === null || p.teamId === teamId) && (!search || normalized(p.name).includes(normalized(search))))
                .sort(
                    (a, b) =>
                        (hasProj ? metric(b) - metric(a) : started ? b.points - a.points : 0) ||
                        (averages ? (averages.get(b.id)?.ppg ?? 0) - (averages.get(a.id)?.ppg ?? 0) : 0) ||
                        Number(b.starter) - Number(a.starter) ||
                        a.name.localeCompare(b.name)
                ),
        [day.players, role, teamId, search, started, averages, hasProj, sort] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const left = creditsLeft(day, entry);
    const problemText = (problem: string | null) =>
        problem === 'locked'
            ? t('fantasy.problem.locked')
            : problem === 'full'
              ? role === 'P'
                  ? t('fantasy.problem.fullP')
                  : t('fantasy.problem.fullB')
              : problem === 'team'
                ? t('fantasy.problem.team', { n: perTeamLimit(day) })
                : problem === 'budget'
                  ? t('fantasy.problem.budget', { left: credits(Math.max(0, left ?? 0), i18n.language) })
                  : problem === 'already'
                    ? t('fantasy.problem.already')
                    : '';

    return (
        <BottomSheet open onClose={onClose} title={role === 'P' ? t('fantasy.choosePitcher') : t('fantasy.chooseBatters')} tall>
            <div className="space-y-3 pb-2">
                {pro && (
                    <p className="flex items-center gap-2 text-xs font-semibold text-muted">
                        <ProBadge /> {t('pro.fantasyHint')}
                    </p>
                )}
                {day.credits && left !== null && (
                    <p className={`text-sm font-bold tabular-nums ${left < -1e-9 ? 'text-live' : ''}`}>
                        {t('fantasy.credits.pickerLeft', { left: credits(left, i18n.language), budget: credits(day.credits.budget, i18n.language) })}
                    </p>
                )}
                <Segmented<'B' | 'P'>
                    size="sm"
                    label={t('fantasy.role')}
                    value={role}
                    onChange={setRole}
                    options={[
                        { value: 'B', label: t('fantasy.batters') },
                        { value: 'P', label: t('fantasy.pitchers') }
                    ]}
                />
                {hasProj && (
                    <Segmented<Sort>
                        size="sm"
                        label={t('fantasy.smart.sort')}
                        value={sort}
                        onChange={setSort}
                        options={[
                            { value: 'proj', label: t('fantasy.smart.sortProj') },
                            { value: 'value', label: t('fantasy.smart.sortValue') },
                            { value: 'price', label: t('fantasy.smart.sortPrice') },
                            ...(started ? [{ value: 'points' as Sort, label: t('fantasy.smart.sortPoints') }] : [])
                        ]}
                    />
                )}
                <label className="flex h-11 items-center gap-2 rounded-2xl bg-surface px-3 shadow-card">
                    <Search className="h-4 w-4 text-muted" />
                    <span className="sr-only">{t('fantasy.search')}</span>
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('fantasy.search')} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                </label>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none" role="group" aria-label={t('fantasy.filterTeam')}>
                    <button type="button" onClick={() => setTeamId(null)} aria-pressed={teamId === null} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${teamId === null ? 'bg-ink text-bg' : 'bg-raised text-muted'}`}>
                        {t('fantasy.allTeams')}
                    </button>
                    {Object.values(day.teams).map((team) => (
                        <button key={team.id} type="button" onClick={() => setTeamId(team.id)} aria-pressed={teamId === team.id} className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-bold ${teamId === team.id ? 'bg-ink text-bg' : 'bg-raised text-muted'}`}>
                            <TeamLogo team={{ ...team, name: team.abbrev }} size={22} />
                            {team.abbrev}
                        </button>
                    ))}
                </div>
                <ul className="divide-y divide-line/10">
                    {list.map((player) => {
                        const problem = canAdd(day, entry, player);
                        const inTeam = entry.lineup.includes(player.id);
                        // Ya en el equipo y su juego empezó: no se puede quitar (como en la ficha)
                        const lockedIn = inTeam && isLocked(day, player);
                        const team = day.teams[player.teamId];
                        return (
                            <li key={player.id} className="flex items-center gap-3 py-2.5">
                                <button type="button" onClick={() => setInfo(player)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t('statsPage.viewPlayer', { name: player.name })}>
                                    <PlayerPhoto personId={player.id} name={player.name} size={44} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-extrabold">
                                            {player.name}
                                            {player.starter && <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent-ink">{t('fantasy.starter')}</span>}
                                        </p>
                                        <p className="truncate text-xs text-muted">
                                            {team?.abbrev} · {player.pos || '—'} · {gameStatus(day, player.gamePk, i18n.language, t)}
                                            {lineText(player, t) ? ` · ${lineText(player, t)}` : ''}
                                        </p>
                                        {averages?.get(player.id) && (
                                            <p className="text-[11px] font-bold text-accent-ink">
                                                {t('pro.fantasyAvg', { ppg: averages.get(player.id)!.ppg, g: averages.get(player.id)!.g })}
                                            </p>
                                        )}
                                        {player.proj !== undefined && (
                                            <p className="truncate text-[11px] font-semibold text-muted">
                                                {t('fantasy.smart.proj', { pts: credits(player.proj, i18n.language) })}
                                                {valueOf(player) !== null ? ` · ${t('fantasy.smart.value', { v: valueText(valueOf(player)!, i18n.language) })}` : ''}
                                                {player.rest ? ` · ${t('fantasy.smart.restShort')}` : player.startedAgo !== undefined ? ` · ${t('fantasy.smart.startedAgo', { count: player.startedAgo })}` : ''}
                                                {owners.get(player.id) ? ` · ${t('fantasy.smart.owned', { pct: credits(owners.get(player.id)!.pct, i18n.language) })}` : ''}
                                            </p>
                                        )}
                                        {problem && problem !== 'already' && <p className="text-[11px] font-semibold text-faint">{problemText(problem)}</p>}
                                    </div>
                                </button>
                                {day.credits && player.price !== undefined && (
                                    <span className="shrink-0 rounded-full bg-raised px-2 py-1 text-xs font-extrabold tabular-nums" aria-label={t('fantasy.credits.priceLong', { price: credits(player.price, i18n.language) })}>
                                        {t('fantasy.credits.price', { price: credits(player.price, i18n.language) })}
                                    </span>
                                )}
                                {started && <span className="w-9 text-right font-display text-lg font-extrabold tabular-nums">{credits(player.points, i18n.language)}</span>}
                                <button
                                    type="button"
                                    disabled={inTeam ? lockedIn : !!problem}
                                    onClick={() => (inTeam ? removePlayer(day, player) : addPlayer(day, entry, player))}
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${inTeam ? 'bg-accent text-white disabled:opacity-60' : 'bg-raised text-ink disabled:opacity-30'}`}
                                    aria-label={inTeam ? t('fantasy.remove', { name: player.name }) : t('fantasy.add', { name: player.name })}
                                    aria-pressed={inTeam}
                                >
                                    {lockedIn || (!inTeam && problem === 'locked') ? <Lock className="h-4 w-4" /> : inTeam ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                </button>
                            </li>
                        );
                    })}
                    {!list.length && <li className="py-8 text-center text-sm text-muted">{t('fantasy.noPlayers')}</li>}
                </ul>
            </div>
            {info && (
                <PlayerSheet
                    id={info.id}
                    name={info.name}
                    team={teamOf(day, info)}
                    onClose={() => setInfo(null)}
                    action={<PickerAction day={day} entry={entry} player={info} problemText={problemText} onDone={() => setInfo(null)} />}
                />
            )}
        </BottomSheet>
    );
};

/** Botón de la ficha abierta desde el selector: agregar o quitar sin volver a la lista */
const PickerAction: React.FC<{ day: FantasyDay; entry: DayEntry; player: FantasyPlayer; problemText: (problem: string | null) => string; onDone: () => void }> = ({ day, entry, player, problemText, onDone }) => {
    const { t } = useTranslation();
    const inTeam = entry.lineup.includes(player.id);
    const problem = canAdd(day, entry, player);
    const blocked = inTeam ? isLocked(day, player) : !!problem;
    return (
        <button
            type="button"
            disabled={blocked}
            onClick={() => {
                if (inTeam ? removePlayer(day, player) : addPlayer(day, entry, player)) onDone();
            }}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-extrabold disabled:opacity-50 ${inTeam ? 'bg-raised text-ink' : 'bg-accent text-white'}`}
        >
            {inTeam ? <X className="h-4 w-4" /> : blocked ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {inTeam ? t('fantasy.remove', { name: player.name }) : blocked ? problemText(problem) : t('fantasy.add', { name: player.name })}
        </button>
    );
};

// ---------------------------------------------------------------- pronósticos

const PicksTab: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const started = day.games.some((game) => gameStarted(game));
    const owners = useFantasyOwners(day.league, day.date, accountEnabled() && started);
    return (
        <section className="space-y-2.5" aria-label={t('fantasy.picks')}>
            <p className="text-sm text-muted">{t('fantasy.picksHint', { pts: RULES.pick })}</p>
            {day.games.map((game: FantasyGame) => {
                const pick = entry.picks[game.gamePk];
                const result = pickResult(game, entry);
                // Se cierra a su hora aunque el servidor todavía diga «previa»
                const locked = gameStarted(game);
                return (
                    <div key={game.gamePk} className="card p-3">
                        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
                            <span>{game.state === 'preview' ? formatTime(game.date, i18n.language) : game.state === 'final' ? t('fantasy.final') : t('fantasy.liveNow')}</span>
                            {result === 'win' && <span className="font-extrabold text-ball">+{RULES.pick}</span>}
                            {result === 'loss' && <span className="font-extrabold text-live">0</span>}
                            {locked && !pick && <span>{t('fantasy.noPick')}</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {[game.away, game.home].map((side) => {
                                const chosen = pick === side.id;
                                return (
                                    <button
                                        key={side.id}
                                        type="button"
                                        disabled={locked}
                                        onClick={() => setPick(day, game, side.id)}
                                        aria-pressed={chosen}
                                        className={`flex items-center gap-2 rounded-2xl p-2.5 text-left transition-colors ${chosen ? 'text-white' : 'bg-raised'} ${locked && !chosen ? 'opacity-60' : ''}`}
                                        style={chosen ? { backgroundColor: side.color } : undefined}
                                    >
                                        <TeamLogo team={side} size={32} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-extrabold">{side.abbrev}</span>
                                            {game.state !== 'preview' && <span className="block text-xs font-bold opacity-80">{side.score ?? 0}</span>}
                                        </span>
                                        {locked && chosen && <Lock className="h-3.5 w-3.5 opacity-80" />}
                                    </button>
                                );
                            })}
                        </div>
                        {locked && owners.data?.picks[game.gamePk] && (
                            <div className="mt-2">
                                <div className="flex h-1.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={t('fantasy.smart.picksSplit', { away: game.away.abbrev, a: owners.data.picks[game.gamePk][game.away.id] ?? 0, home: game.home.abbrev, h: owners.data.picks[game.gamePk][game.home.id] ?? 0 })}>
                                    <span style={{ width: `${owners.data.picks[game.gamePk][game.away.id] ?? 0}%`, backgroundColor: game.away.color }} />
                                    <span style={{ width: `${owners.data.picks[game.gamePk][game.home.id] ?? 0}%`, backgroundColor: game.home.color }} />
                                </div>
                                <p className="mt-1 flex justify-between text-[11px] font-semibold text-muted">
                                    <span>{t('fantasy.smart.picksPct', { pct: credits(owners.data.picks[game.gamePk][game.away.id] ?? 0, i18n.language) })}</span>
                                    <span>{t('fantasy.smart.picksPct', { pct: credits(owners.data.picks[game.gamePk][game.home.id] ?? 0, i18n.language) })}</span>
                                </p>
                            </div>
                        )}
                    </div>
                );
            })}
        </section>
    );
};

// ---------------------------------------------------------------- tabla (con cuenta)

const TableTab: React.FC<{ day: FantasyDay; dayName: string; onOpenFan: OpenFan }> = ({ day, dayName, onOpenFan }) => {
    const { t } = useTranslation();
    const session = useSession();
    const [period, setPeriod] = useState<'day' | 'season'>('day');
    const [rivals, setRivals] = useState<Rival[] | null>(null);
    const [leagues, setLeagues] = useState<PrivateLeague[]>([]);
    const [scope, setScope] = useState<string>('all');
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [message, setMessage] = useState<string | null>(null);

    const load = async () => {
        if (!session) return;
        const mine = await myLeagues().catch(() => []);
        setLeagues(mine);
        const members = scope === 'all' ? undefined : mine.find((l) => l.id === scope)?.members;
        setRivals(await dayEntries(day.league, day.date, members).catch(() => []));
    };
    useEffect(() => {
        load();
    }, [session?.user.id, day.date, scope]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!session) return null;

    const ranking = (rivals || [])
        // Cada equipo como estaba al empezar cada juego (lo cambiado después no cuenta)
        .map((rival) => ({ ...rival, entry: effectiveEntry(day, rival.entry) }))
        .map((rival) => ({ ...rival, points: teamPoints(day, rival.entry) + pickPoints(day, rival.entry) }))
        .sort((a, b) => b.points - a.points);

    return (
        <section className="space-y-3">
            {!session.name && (
                <div className="space-y-2">
                    <p className="text-sm font-semibold">{t('fantasy.gate.nameTitle')}</p>
                    <AccountCard />
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <Segmented<'day' | 'season'>
                    size="sm"
                    label={t('fantasy.fans.period')}
                    value={period}
                    onChange={setPeriod}
                    options={[
                        { value: 'day', label: dayName },
                        { value: 'season', label: t('fantasy.fans.season') }
                    ]}
                />
                {leagues.length > 0 && (
                    <Segmented<string>
                        size="sm"
                        label={t('fantasy.leagues')}
                        value={scope}
                        onChange={setScope}
                        options={[{ value: 'all', label: t('fantasy.everyone') }, ...leagues.map((l) => ({ value: l.id, label: l.name }))]}
                    />
                )}
            </div>
            {period === 'season' ? (
                <SeasonTable league={day.league} members={scope === 'all' ? undefined : leagues.find((l) => l.id === scope)?.members} onOpen={onOpenFan} />
            ) : (
                <ol className="card divide-y divide-line/10 overflow-hidden">
                    {ranking.map((row, index) => (
                        <li key={row.userId}>
                            <FanRow userId={row.userId} name={row.name} own={row.userId === session.user.id} onOpen={onOpenFan} rank={index + 1} points={row.points} />
                        </li>
                    ))}
                    {!rivals && (
                        <li className="px-4 py-3">
                            <Skeleton className="h-9 rounded-full" />
                        </li>
                    )}
                    {rivals && !ranking.length && <li className="px-4 py-6 text-center text-sm text-muted">{t('fantasy.emptyTable')}</li>}
                </ol>
            )}
            {scope !== 'all' && <p className="select-text text-xs text-muted">{t('fantasy.leagueCode', { code: leagues.find((l) => l.id === scope)?.code })}</p>}

            <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                <form
                    className="flex gap-2"
                    onSubmit={async (event) => {
                        event.preventDefault();
                        const created = await createLeague(name).catch(() => null);
                        setMessage(created?.[0]?.code ? t('fantasy.created', { code: created[0].code }) : t('account.errors.unknown'));
                        setName('');
                        load();
                    }}
                >
                    <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder={t('fantasy.newLeague')} aria-label={t('fantasy.newLeague')} className="h-11 min-w-0 flex-1 rounded-2xl bg-raised px-3 text-sm outline-none focus:ring-2 focus:ring-accent" />
                    <button type="submit" className="h-11 rounded-2xl bg-ink px-4 text-sm font-bold text-bg">
                        {t('fantasy.create')}
                    </button>
                </form>
                <form
                    className="flex gap-2"
                    onSubmit={async (event) => {
                        event.preventDefault();
                        const ok = await joinLeague(code).then(() => true).catch(() => false);
                        setMessage(ok ? t('fantasy.joined') : t('fantasy.badCode'));
                        setCode('');
                        load();
                    }}
                >
                    <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={6} placeholder={t('fantasy.code')} aria-label={t('fantasy.code')} className="h-11 min-w-0 flex-1 rounded-2xl bg-raised px-3 text-sm uppercase tracking-widest outline-none focus:ring-2 focus:ring-accent" />
                    <button type="submit" className="h-11 rounded-2xl bg-accent px-4 text-sm font-bold text-white">
                        {t('fantasy.join')}
                    </button>
                </form>
                {message && <p className="select-text text-sm font-semibold sm:col-span-2">{message}</p>}
            </div>
        </section>
    );
};

// ---------------------------------------------------------------- extras

const HistoryBars: React.FC<{ days: { date: string; points: number }[] }> = ({ days }) => {
    const max = Math.max(...days.map((d) => d.points), 1);
    return (
        <div className="mt-4 flex h-12 items-end gap-1.5" aria-hidden="true">
            {days.map((d) => (
                <span key={d.date} className="flex-1 rounded-t-md bg-white/70" style={{ height: `${Math.max(8, (d.points / max) * 100)}%` }} title={`${d.date}: ${d.points}`} />
            ))}
        </div>
    );
};

const ShareTeam: React.FC<{ day: FantasyDay; entry: DayEntry; points: number }> = ({ day, entry, points }) => {
    const { t } = useTranslation();
    const share = async () => {
        const names = entry.lineup
            .map((id) => day.players.find((p) => p.id === id))
            .filter((p): p is FantasyPlayer => !!p)
            .map((p) => `${entry.captain === p.id ? '👑 ' : ''}${p.name} (${playerScore(entry, p)})`)
            .join(', ');
        const text = t('fantasy.shareText', { points: Math.round(points * 10) / 10, names });
        const url = `${window.location.origin}/fantasy`;
        try {
            if (navigator.share) await navigator.share({ title: 'El Play Fantasy', text, url });
            else window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener');
        } catch {
            /* el usuario cerró la lista de apps */
        }
    };
    return (
        <button type="button" onClick={share} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-card" aria-label={t('fantasy.share')}>
            <Share2 className="h-5 w-5" />
        </button>
    );
};
