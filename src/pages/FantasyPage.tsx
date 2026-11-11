import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, HelpCircle, Share2, Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLeague } from '../store/LeagueContext';
import { ErrorState, OfflineState, Skeleton, waitingForNetwork } from '../components/ui/States';
import { FanProfile } from '../components/fantasy/FanProfile';
import { FanSearch } from '../components/fantasy/FanSearch';
import { FantasyGate } from '../components/fantasy/FantasyGate';
import { HowToPlay } from '../components/fantasy/HowToPlay';
import { PicksTab } from '../components/fantasy/PicksTab';
import { PlayerPicker } from '../components/fantasy/PlayerPicker';
import { TableTab } from '../components/fantasy/TableTab';
import { TeamTab } from '../components/fantasy/TeamTab';
import { FantasyProviders, credits } from '../components/fantasy/fantasyUi';
import { FirstTimeGuide } from '../components/fantasy/FirstTimeGuide';
import { SeasonView } from '../components/fantasy/SeasonView';
import { useShare } from '../share/ShareSheet';
import { fantasyTeamPost } from '../share/subjects';
import { useGuideDismissed } from '../lib/fantasyGuide';
import { ProBadge } from '../components/pro/ProBadge';
import { formatLongDate } from '../lib/format';
import {
    countedEntry,
    entryKey,
    fetchFantasyDay,
    getStore,
    history,
    pickPoints,
    playerScore,
    repairEntry,
    rulesOf,
    setStoreOwner,
    settleDay,
    teamPoints,
    unsettledDays,
    useEntry,
    useFantasyDay,
    useFantasyStore,
    type DayEntry,
    type FantasyDay,
    type FantasyPlayer
} from '../lib/fantasy';
import { accountEnabled, pushEntry, syncFantasy, useSession } from '../lib/account';
import { isFanId, useFanProfile } from '../lib/fans';
import { saveEntry } from '../lib/fantasySave';
import { DEMO_OWNER, demoPush, fantasyDemo } from '../lib/fantasyDemo';
import { isHelpTopic, type HelpTopic } from '../lib/fantasyHelp';

type Tab = 'team' | 'picks' | 'table' | 'fans' | 'season';
const DAY_MS = 86400000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

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
    // Solo en desarrollo, con ?demo=1: se juega sin cuenta (el equipo queda en este navegador) para probar y grabar
    const demo = fantasyDemo(!!session);
    // El Fantasy se juega con cuenta; sin ella se ve la portada para entrar
    const playing = (accountEnabled() && !!session) || demo;
    useLayoutEffect(() => {
        if (demo) setStoreOwner(DEMO_OWNER);
    }, [demo]);
    // Modo de prueba: un equipo de ayer para probar «Copiar mi equipo de ayer» (los datos se cargan aparte)
    useEffect(() => {
        if (demo && day && !date) import('../lib/fantasyDemoData').then((data) => data.seedDemoYesterday(day)).catch(() => undefined);
    }, [demo, day?.league, day?.date, date]); // eslint-disable-line react-hooks/exhaustive-deps
    const guideDismissed = useGuideDismissed();

    // Perfil de un fanático (`?fan=<id>`) y «Cómo se juega» (`?ayuda=<pregunta>`): se pueden compartir y atrás los cierra
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const fanId = params.get('fan');
    const helpParam = params.get('ayuda');
    const sheetState = location.state as { fanSheet?: boolean; fanName?: string | null; helpSheet?: boolean } | null;
    const openParam = useCallback(
        (name: string, value: string, state: Record<string, unknown>) =>
            setParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    next.set(name, value);
                    return next;
                },
                { state }
            ),
        [setParams]
    );
    const closeParam = useCallback(
        (name: string, openedHere: boolean | undefined) => {
            // Si se abrió desde aquí se vuelve atrás (así no queda repetido en el historial); si llegó por enlace se quita
            if (openedHere) navigate(-1);
            else
                setParams(
                    (current) => {
                        const next = new URLSearchParams(current);
                        next.delete(name);
                        return next;
                    },
                    { replace: true }
                );
        },
        [navigate, setParams]
    );
    // El nombre que ya se conoce (el de la fila que se tocó) se pasa para no mostrar «Fanático» mientras carga
    const openFan = useCallback((id: string, name?: string | null) => openParam('fan', id, { fanSheet: true, fanName: name ?? null }), [openParam]);
    // Estable entre renders: la hoja no debe reaccionar a cada refresco de la página
    const closeFan = useCallback(() => closeParam('fan', sheetState?.fanSheet), [closeParam, sheetState?.fanSheet]);
    const openHelp = useCallback((topic?: HelpTopic) => openParam('ayuda', topic ?? 'steps', { helpSheet: true }), [openParam]);
    const closeHelp = useCallback(() => closeParam('ayuda', sheetState?.helpSheet), [closeParam, sheetState?.helpSheet]);

    useEffect(() => {
        if (!date && day?.date) setToday(day.date);
    }, [date, day?.date]);
    // Al cambiar de liga se vuelve a hoy (al montar no: si el día ya estaba en caché, borraría el «hoy» recién puesto)
    const shownLeague = useRef(activeLeague);
    useEffect(() => {
        if (shownLeague.current === activeLeague) return;
        shownLeague.current = activeLeague;
        setDate(undefined);
        setToday(null);
    }, [activeLeague]);

    // Al terminar el día se guarda el resultado; con cuenta, cada cambio se sube (y se ve si se guardó)
    useEffect(() => {
        if (day) settleDay(day, entry);
    }, [day, entry]);
    // Supabase solo acepta días de hoy en adelante: los pasados no se suben (ni se arreglan)
    const current = !!day && (!today || day.date >= today);
    // Lo que la versión de antes dejó con 7 (uno que ya no salía en el día) la base no lo acepta: se arregla y se sube
    useEffect(() => {
        if (playing && day && current) repairEntry(day);
    }, [playing, day, current, entry.lineup.length]);
    useEffect(() => {
        if (playing && day && current && entry.savedAt) saveEntry(day.league, day.date, entry, demo ? demoPush : pushEntry);
    }, [playing, demo, day?.league, day?.date, current, entry.savedAt]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const mine = useFanProfile(playing && session ? session.user.id : null, activeLeague);
    const season = mine.data?.season ?? { points: Math.round(past.reduce((sum, d) => sum + d.points, 0) * 10) / 10, days: past.length };
    // El equipo que cuenta (como la tabla y el perfil): lo cambiado tarde o pasado del tope no suma
    const counted = useMemo(() => (day ? countedEntry(day, entry) : entry), [day, entry]);
    const points = day ? teamPoints(day, counted) : 0;
    const picks = day ? pickPoints(day, counted) : 0;
    const days = today ? [shift(today, -1), today, shift(today, 1)] : [];
    const dayLabel = (key: string) => (key === today ? t('games.today') : key < (today ?? '') ? t('games.yesterday') : t('games.tomorrow'));

    // Guía para empezar: hoy sin equipo y nunca cerrada
    const showGuide = playing && !!day && !date && !entry.lineup.length && !guideDismissed;

    return (
        <FantasyProviders help={openHelp} demo={demo}>
            <div className="space-y-4 px-4 pt-5">
                <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-muted first-letter:uppercase">{day ? formatLongDate(day.date, i18n.language) : t(`leagues.${activeLeague}.name`)}</p>
                        <h1 className="display text-[32px] leading-tight">
                            {t('fantasy.title')} <ProBadge auto />
                        </h1>
                        {/* Siempre a la vista, también sin cuenta: la ayuda completa */}
                        <button type="button" onClick={() => openHelp()} className="-ml-1 mt-0.5 inline-flex h-9 items-center gap-1.5 rounded-full px-1 text-sm font-bold text-accent-ink">
                            <HelpCircle className="h-4 w-4" aria-hidden="true" />
                            {t('fantasyHelp.open')}
                        </button>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <Link to="/estadisticas" className="flex h-12 items-center gap-1.5 rounded-2xl bg-surface px-3.5 text-sm font-bold shadow-card" aria-label={t('statsPage.title')}>
                            <BarChart3 className="h-5 w-5" />
                            <span className="hidden min-[400px]:inline">{t('statsPage.open')}</span>
                        </Link>
                        {playing && day && day.players.some((p) => entry.lineup.includes(p.id)) && <ShareTeam day={day} entry={counted} points={points + picks} />}
                    </div>
                </header>

                {!playing ? (
                    <FantasyGate day={day} loading={query.isPending} />
                ) : (
                    <>
                        {demo && <p className="rounded-2xl bg-gold/10 px-3 py-2 text-xs font-semibold">{t('fantasyHelp.demo')}</p>}
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

                        {/* Resumen: puntos del día (con el equipo que cuenta), pronósticos y temporada */}
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

                        {showGuide && <FirstTimeGuide day={day} onHow={() => openHelp()} />}

                        <FantasyTabs
                            value={tab}
                            onChange={setTab}
                            options={[
                                { value: 'team', label: t('fantasy.myTeam') },
                                { value: 'picks', label: t('fantasy.picks') },
                                { value: 'table', label: t('fantasy.table') },
                                { value: 'fans', label: t('fantasy.fans.tab') },
                                { value: 'season', label: t('fantasyStats.tab') }
                            ]}
                        />

                        {tab === 'season' ? (
                            // La temporada no depende del día: sale aunque hoy no haya juegos
                            <section aria-label={t('fantasyStats.title')}>
                                <SeasonView userId={session?.user.id ?? null} league={activeLeague} own profile={mine.data} demo={demo} demoPlayers={day?.players} onBuild={() => setTab('team')} />
                            </section>
                        ) : tab === 'fans' ? (
                            demo ? (
                                <p className="card p-4 text-sm text-muted">{t('fantasyHelp.demo')}</p>
                            ) : (
                                <FanSearch league={activeLeague} onOpen={openFan} />
                            )
                        ) : waitingForNetwork(query) ? (
                            <OfflineState />
                        ) : query.isPending ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {[0, 1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-[88px] rounded-card" />
                                ))}
                            </div>
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

                {isFanId(fanId) && <FanProfile userId={fanId} league={activeLeague} onClose={closeFan} knownName={sheetState?.fanName ?? null} />}
                {helpParam !== null && <HowToPlay day={day} topic={isHelpTopic(helpParam) ? helpParam : null} onClose={closeHelp} />}
            </div>
        </FantasyProviders>
    );
};

/**
 * Las pestañas como el Segmented, a todo lo ancho y cada una a la medida de su texto. Con la quinta («Mi temporada»)
 * en un teléfono angosto no caben todas: la fila se desliza y la pestaña escogida se pone a la vista.
 */
const FantasyTabs: React.FC<{ value: Tab; onChange: (tab: Tab) => void; options: { value: Tab; label: string }[] }> = ({ value, onChange, options }) => {
    const { t } = useTranslation();
    const row = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const list = row.current;
        const active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
        if (!list || !active) return;
        // Solo la fila se mueve (scrollIntoView movería también la página)
        const left = active.offsetLeft - list.offsetLeft;
        if (left < list.scrollLeft || left + active.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollTo({ left: Math.max(0, left - 16), behavior: 'smooth' });
    }, [value]);
    return (
        <div ref={row} role="tablist" aria-label={t('fantasy.sections')} className="flex w-full overflow-x-auto rounded-full bg-raised p-1 scrollbar-none sm:inline-flex sm:w-auto">
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(option.value)}
                        className={`flex-auto shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition-colors min-[400px]:text-sm sm:flex-none sm:px-4 ${
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

/**
 * Compartir el equipo que cuenta como imagen (historia o post, con la hoja de compartir de siempre): fotos, corona del
 * capitán, precios, créditos y, con juegos empezados, los puntos. El texto que acompaña dice los puntos del encabezado.
 */
const ShareTeam: React.FC<{ day: FantasyDay; entry: DayEntry; points: number }> = ({ day, entry, points }) => {
    const { t, i18n } = useTranslation();
    const openShare = useShare();
    const share = () => {
        const captain = rulesOf(day).captain;
        const names = entry.lineup
            .map((id) => day.players.find((p) => p.id === id))
            .filter((p): p is FantasyPlayer => !!p)
            .map((p) => `${entry.captain === p.id ? '👑 ' : ''}${p.name} (${playerScore(entry, p, captain)})`)
            .join(', ');
        openShare({
            data: fantasyTeamPost(day, entry, t(`leagues.${day.league}.name`), points, t, i18n.language),
            fileName: `el-play-fantasy-${day.date}`,
            text: t('fantasy.shareText', { points: Math.round(points * 10) / 10, names }),
            url: '/fantasy'
        });
    };
    return (
        <button type="button" onClick={share} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-card" aria-label={t('fantasy.share')}>
            <Share2 className="h-5 w-5" />
        </button>
    );
};
