// «Mi equipo»: las reglas del día, el guardado, el próximo cierre, los créditos, las ayudas (completar y sugerido),
// cada pelotero con su hora de cierre, su estado y lo que no cuenta, y el equipo ideal del día.
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Clock, CloudOff, Crown, Info, Loader2, Lock, Plus, RotateCw, Sparkles, Trophy, UserX, Wand2, X } from 'lucide-react';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { TeamLink } from '../ui/TeamLink';
import { PlayerLink } from '../ui/PlayerLink';
import { CardLink, OVER_CARD } from '../ui/CardLink';
import { BottomSheet } from '../ui/BottomSheet';
import { formatTime } from '../../lib/format';
import { playerPath } from '../../lib/links';
import { showToast } from '../../lib/toast';
import { bestLineup, projectedPoints } from '../../lib/fantasyBest';
import { pointsBreakdown } from '../../lib/fantasyExtras';
import { opponentOf, statusOf } from '../../lib/fantasyPicker';
import { retrySave, useSaveStatus } from '../../lib/fantasySave';
import {
    applyLineup,
    countedEntry,
    gameStarted,
    creditsLeft,
    entryCost,
    gameOf,
    isLocked,
    isPostponed,
    lineText,
    nextLockAt,
    notCounting,
    occupying,
    playerScore,
    removeId,
    removePlayer,
    rulesOf,
    setCaptain,
    slotsLeft,
    teamPoints,
    type DayEntry,
    type FantasyDay,
    type FantasyPlayer,
    type NotCounting
} from '../../lib/fantasy';
import { HelpButton, StatusBadge, credits, gameStatus, untilText, useOpenHelp, useOwners } from './fantasyUi';

// ---------------------------------------------------------------- guardado

/** Guardando… / Guardado / Sin conexión: se guarda al volver / No se pudo guardar (con «Reintentar») */
export const SaveStatus: React.FC<{ day: FantasyDay }> = ({ day }) => {
    const { t } = useTranslation();
    const status = useSaveStatus(day.league, day.date);
    const icon =
        status === 'saving' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : status === 'saved' ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : status === 'offline' ? (
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        );
    return (
        <div role="status" aria-live="polite" className="flex min-h-7 shrink-0 items-center gap-1.5">
            {status !== 'idle' && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${status === 'offline' || status === 'error' ? 'bg-live/10 text-live' : status === 'saved' ? 'bg-ball/10 text-ink' : 'bg-raised text-muted'}`}>
                    {icon}
                    {t(`fantasyHelp.save.${status}`)}
                </span>
            )}
            {status === 'error' && (
                <button type="button" onClick={() => retrySave(day.league, day.date)} className="inline-flex h-7 items-center gap-1 rounded-full bg-raised px-2.5 text-xs font-bold">
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('fantasyHelp.save.retry')}
                </button>
            )}
        </div>
    );
};

// ---------------------------------------------------------------- reglas, cierre y créditos

/** «5 bateadores + 1 lanzador · Máx. 2 por equipo · Capitán ×1,5 (?)», con los números del día */
const RulesStrip: React.FC<{ day: FantasyDay }> = ({ day }) => {
    const { t, i18n } = useTranslation();
    const rules = rulesOf(day);
    const chip = 'rounded-full bg-raised px-2.5 py-1 text-xs font-bold';
    return (
        <div className="space-y-1.5">
            <ul className="flex flex-wrap items-center gap-1.5">
                <li className={chip}>{t('fantasyHelp.rules.roster', { batters: rules.batters, count: rules.pitchers })}</li>
                <li className={chip}>{t('fantasyHelp.rules.perTeam', { n: rules.perTeam })}</li>
                <li className={`${chip} inline-flex items-center gap-1 py-0 pr-0.5`}>
                    <Crown className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                    {t('fantasyHelp.rules.captain', { x: credits(rules.captain, i18n.language) })}
                    <HelpButton topic="captain" className="h-6 w-6" />
                </li>
                {rules.budget === null && <li className={chip}>{t('fantasyHelp.rules.noCap')}</li>}
            </ul>
            <p className="text-xs text-muted">{t('fantasyHelp.rules.lock')}</p>
        </div>
    );
};

/** Barra de créditos del equipo: cuánto lleva gastado, cuánto le queda o por cuánto se pasó */
const CreditsMeter: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const rules = rulesOf(day);
    if (rules.budget === null) return null;
    const budget = rules.budget;
    const spent = entryCost(day, entry);
    const left = creditsLeft(day, entry) ?? 0;
    const over = left < -1e-9;
    // Le faltan peloteros y lo que queda no alcanza ni para los más baratos: tiene que cambiar a alguien caro
    const slots = slotsLeft(day, entry);
    const missing = slots.batters + slots.pitchers;
    const short = !over && missing > 0 && left + 1e-9 < missing * rules.prices.min;
    const share = budget > 0 ? Math.min(1, spent / budget) : 1;
    return (
        <div className="card space-y-2 p-3.5">
            <div className="flex items-center justify-between gap-3">
                <p className="eyebrow flex items-center gap-0.5">
                    {t('fantasy.credits.label')}
                    <HelpButton topic="credits" className="-my-1.5" />
                </p>
                <p className="text-sm font-bold tabular-nums">{t('fantasy.credits.spent', { spent: credits(spent, i18n.language), budget: credits(budget, i18n.language) })}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-raised" role="meter" aria-label={t('fantasy.credits.label')} aria-valuemin={0} aria-valuemax={budget} aria-valuenow={spent}>
                <div className={`h-full rounded-full transition-[width] duration-500 ${over ? 'bg-live' : 'bg-accent'}`} style={{ width: `${share * 100}%` }} />
            </div>
            <p className={`text-xs font-semibold ${over || short ? 'text-live' : 'text-muted'}`}>
                {over
                    ? t('fantasy.credits.over', { over: credits(-left, i18n.language) })
                    : short
                      ? t('fantasy.credits.short', { left: credits(left, i18n.language), count: missing, min: credits(rules.prices.min, i18n.language) })
                      : t('fantasy.credits.left', { left: credits(left, i18n.language) })}
            </p>
        </div>
    );
};

/** Próximo cierre (cuenta regresiva al minuto) y cuántos peloteros faltan */
const LockNotice: React.FC<{ day: FantasyDay; entry: DayEntry; now: number }> = ({ day, entry, now }) => {
    const { t, i18n } = useTranslation();
    const next = nextLockAt(day, now);
    if (next === null) return null;
    const slots = slotsLeft(day, entry);
    const missing = slots.batters + slots.pitchers;
    const game = day.games.find((g) => !g.startTimeTBD && Date.parse(g.date) === next);
    return (
        <div className={`flex items-start gap-2.5 rounded-2xl p-3 text-sm ${missing ? 'bg-live/10' : 'bg-raised'}`}>
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0">
                <span className="font-bold">{t('fantasy.smart.nextLock', { time: untilText(next - now, t) })}</span>
                {game && (
                    <span className="text-muted">
                        {' '}
                        · <TeamLink id={game.away.id}>{game.away.abbrev}</TeamLink>–<TeamLink id={game.home.id}>{game.home.abbrev}</TeamLink>, <span className="whitespace-nowrap">{formatTime(game.date, i18n.language)}</span>
                    </span>
                )}
                {missing > 0 && <span className="block font-semibold text-live">{t('fantasy.smart.missing', { count: missing })}</span>}
            </p>
        </div>
    );
};

// ---------------------------------------------------------------- ayudas

/** Proyección del equipo y las ayudas: completar con los mejores y ver el equipo sugerido */
const SmartActions: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const hasProj = day.players.some((player) => player.proj !== undefined);
    const anyOpen = day.players.some((player) => !isLocked(day, player) && !isPostponed(day, player));
    if (!hasProj || !anyOpen) return null;
    // Un pospuesto (o uno que ya no sale) no se queda: «Completar» lo cambia
    const keep = entry.lineup.filter((id) => {
        const player = day.players.find((p) => p.id === id);
        return !!player && !isPostponed(day, player);
    });
    const missing = rulesOf(day).batters + rulesOf(day).pitchers - keep.length;
    const projected = projectedPoints(day, entry.lineup, entry.captain);
    const fill = () => {
        const best = bestLineup(day, { metric: 'proj', keep, captain: entry.captain !== null && keep.includes(entry.captain) ? entry.captain : null });
        if (best) applyLineup(day, best.lineup, best.captain);
        else showToast(t('fantasy.smart.none'));
    };
    const locked = entry.lineup.filter((id) => {
        const player = day.players.find((p) => p.id === id);
        return !!player && isLocked(day, player);
    });
    const lockedCaptain = entry.captain !== null && locked.includes(entry.captain) ? entry.captain : null;
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-sm">
                    <span className="text-muted">{t('fantasy.smart.teamProj')}</span> <b className="tabular-nums">{t('fantasy.smart.pts', { pts: credits(projected, i18n.language) })}</b>
                </p>
                {missing > 0 && (
                    <button type="button" onClick={fill} className="flex h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-xs font-extrabold text-white">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        {t('fantasy.smart.fill')}
                    </button>
                )}
                <button type="button" onClick={() => setOpen(true)} className="flex h-11 items-center gap-1.5 rounded-full bg-raised px-4 text-xs font-extrabold">
                    <Wand2 className="h-4 w-4" aria-hidden="true" />
                    {t('fantasy.smart.suggest')}
                </button>
            </div>
            {open && <SuggestSheet day={day} keep={locked} captain={lockedCaptain} onClose={() => setOpen(false)} />}
        </>
    );
};

/** El equipo sugerido (el mejor según las proyecciones, con los créditos y las reglas): se ve antes de usarlo */
const SuggestSheet: React.FC<{ day: FantasyDay; keep: number[]; captain: number | null; onClose: () => void }> = ({ day, keep, captain, onClose }) => {
    const { t, i18n } = useTranslation();
    const best = useMemo(() => bestLineup(day, { metric: 'proj', keep, captain }), [day, keep, captain]);
    const budget = rulesOf(day).budget;
    return (
        <BottomSheet open onClose={onClose} title={t('fantasy.smart.suggestTitle')}>
            <div className="space-y-3 pb-2">
                <p className="text-sm text-muted">{t('fantasy.smart.suggestHint')}</p>
                {best ? (
                    <>
                        <LineupList day={day} lineup={best.lineup} captain={best.captain} metric="proj" />
                        <p className="text-sm font-bold">{t('fantasy.smart.suggestTotal', { pts: credits(best.total, i18n.language), cost: credits(best.cost, i18n.language), budget: credits(budget ?? 0, i18n.language) })}</p>
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
    const times = rulesOf(day).captain;
    const players = lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    return (
        <ul className="divide-y divide-line/10">
            {players.map((player) => {
                const team = day.teams[player.teamId];
                const points = metric === 'proj' ? player.proj ?? 0 : player.points;
                return (
                    <li key={player.id} className="flex items-center gap-3 py-2">
                        <PlayerLink id={player.id} decorative className="flex shrink-0">
                            <PlayerPhoto personId={player.id} name={player.name} size={40} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                        </PlayerLink>
                        <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 truncate text-sm font-extrabold">
                                {captain === player.id && <Crown className="h-3.5 w-3.5 shrink-0 text-gold" aria-label={t('fantasy.captain')} />}
                                <PlayerLink id={player.id} className="truncate">
                                    {player.name}
                                </PlayerLink>
                            </p>
                            <p className="truncate text-xs text-muted">
                                <TeamLink id={team?.id}>{team?.abbrev}</TeamLink> · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')}
                                {player.price !== undefined ? ` · ${t('fantasy.credits.price', { price: credits(player.price, i18n.language) })}` : ''}
                            </p>
                        </div>
                        <span className="text-right">
                            <span className="block font-display text-lg font-extrabold tabular-nums">{credits(captain === player.id ? Math.round(points * times * 10) / 10 : points, i18n.language)}</span>
                            <span className="block text-[10px] font-semibold text-muted">{metric === 'proj' ? t('fantasy.smart.projShort') : t('fantasy.fans.pts')}</span>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
};

/** El equipo ideal del día (lo máximo que se podía sumar con los créditos y las reglas) y cuánto de eso hizo el tuyo */
const IdealCard: React.FC<{ day: FantasyDay; counted: DayEntry }> = ({ day, counted }) => {
    const { t, i18n } = useTranslation();
    const started = day.games.some((game) => gameStarted(game));
    const ideal = useMemo(() => (started ? bestLineup(day, { metric: 'points', ignoreLocks: true }) : null), [day, started]);
    const [open, setOpen] = useState(false);
    if (!ideal || ideal.total <= 0) return null;
    const mine = teamPoints(day, counted);
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
            {counted.lineup.length > 0 && (
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

// ---------------------------------------------------------------- mi equipo

/** El reloj al minuto (para la cuenta regresiva y para que cada tarjeta pase de «Cierra …» a sus puntos a su hora) */
const useMinuteClock = () => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30000);
        return () => window.clearInterval(timer);
    }, []);
    return now;
};

export const TeamTab: React.FC<{ day: FantasyDay; entry: DayEntry; onPick: (role: 'B' | 'P') => void }> = ({ day, entry, onPick }) => {
    const { t } = useTranslation();
    const openHelp = useOpenHelp();
    const owners = useOwners(day);
    const now = useMinuteClock();
    const rules = rulesOf(day);
    const counted = useMemo(() => countedEntry(day, entry), [day, entry]);
    const reasons = useMemo(() => notCounting(day, entry, counted, now), [day, entry, counted, now]);
    // Los pospuestos no ocupan cupo: su lugar se ve libre para escoger al que lo reemplaza (y agregarlo lo saca)
    const chosen = occupying(day, entry);
    const postponed = entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p && isPostponed(day, p));
    // Uno que ya no sale en el día (pospuesto con la API de antes): se ve para poder quitarlo
    const missing = entry.lineup.filter((id) => !day.players.some((p) => p.id === id));
    const batters = chosen.filter((p) => p.role === 'B');
    const pitchers = chosen.filter((p) => p.role === 'P');
    const slots: (FantasyPlayer | 'B' | 'P')[] = [
        ...batters,
        ...Array.from({ length: Math.max(0, rules.batters - batters.length) }, () => 'B' as const),
        ...pitchers,
        ...Array.from({ length: Math.max(0, rules.pitchers - pitchers.length) }, () => 'P' as const)
    ];

    return (
        <section className="space-y-3" aria-label={t('fantasy.myTeam')}>
            {/* Si el estado del guardado no cabe al lado de las reglas, baja a la línea siguiente */}
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-[220px]">
                    <RulesStrip day={day} />
                </div>
                <SaveStatus day={day} />
            </div>
            <LockNotice day={day} entry={entry} now={now} />
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
                        <PlayerSlot key={slot.id} day={day} entry={entry} counted={counted} player={slot} owned={owners.get(slot.id)} reason={reasons.get(slot.id)} now={now} />
                    )
                )}
                {postponed.map((player) => (
                    <PlayerSlot key={player.id} day={day} entry={entry} counted={counted} player={player} now={now} />
                ))}
                {missing.map((id) => (
                    <MissingSlot key={id} day={day} id={id} />
                ))}
            </div>

            <IdealCard day={day} counted={counted} />

            {openHelp && (
                <button type="button" onClick={() => openHelp('points')} className="flex items-center gap-2 text-sm font-semibold text-accent-ink">
                    <Info className="h-4 w-4" aria-hidden="true" />
                    {t('fantasy.howPoints')}
                </button>
            )}
        </section>
    );
};

const warningClass = 'flex items-center gap-1 text-[11px] font-bold text-live';

const PlayerSlot: React.FC<{ day: FantasyDay; entry: DayEntry; counted: DayEntry; player: FantasyPlayer; owned?: { pct: number; captainPct: number }; reason?: NotCounting; now: number }> = ({
    day,
    entry,
    counted,
    player,
    owned,
    reason,
    now
}) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const team = day.teams[player.teamId];
    const game = gameOf(day, player.gamePk);
    const rules = rulesOf(day);
    const locked = isLocked(day, player, now);
    const postponed = isPostponed(day, player);
    const status = statusOf(day, player, now);
    const captain = entry.captain === player.id;
    const counts = counted.lineup.includes(player.id);
    const score = counts ? playerScore(counted, player, rules.captain) : player.points;
    const line = lineText(player, t);
    const opp = opponentOf(day, player);
    const [breakdown, setBreakdown] = useState(false);
    const items = pointsBreakdown(player, rules.scoring);
    const lockText = game && !postponed ? (game.startTimeTBD ? t('fantasyHelp.card.locksTbd') : t('fantasyHelp.card.locksAt', { time: formatTime(game.date, lang) })) : null;
    const warning = postponed
        ? t('fantasyHelp.card.postponed')
        : status === 'dnp'
          ? t('fantasyHelp.card.dnp')
          : reason === 'late'
            ? t('fantasyHelp.card.notCountingLate')
            : reason === 'over'
              ? t('fantasyHelp.card.notCountingOver')
              : null;
    const scoreText = credits(score, lang);
    return (
        <div>
            <div className={`relative flex min-h-[84px] items-center gap-3 rounded-[22px] bg-surface px-3 py-2 shadow-card ${warning ? 'ring-1 ring-live/30' : ''}`}>
                {/* Su foto y su nombre abren su página (el enlace cubre esta parte); la sigla, la de su equipo */}
                <div className="relative isolate flex min-w-0 flex-1 items-center gap-3 self-stretch text-left">
                    <CardLink to={playerPath(player.id)} label={t('statsPage.viewPlayer', { name: player.name })} />
                    <PlayerPhoto personId={player.id} name={player.name} size={56} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                    <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 font-extrabold">
                            {captain && <Crown className="h-4 w-4 shrink-0 text-gold" aria-label={t('fantasy.captain')} />}
                            <span className="truncate">{player.name}</span>
                        </p>
                        <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted">
                            {/* Antes de su juego: Confirmado / Esperado / Banca / Abridor probable / Bullpen / Descansando */}
                            {!locked && status && status !== 'postponed' && status !== 'dnp' && <StatusBadge status={status} />}
                            <span className="truncate">
                                <TeamLink id={team?.id} className={OVER_CARD}>
                                    {team?.abbrev}
                                </TeamLink>
                                {opp ? ` ${opp.home ? 'vs' : '@'} ${opp.abbrev}` : ''} · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')}
                                {locked ? ` · ${gameStatus(day, player.gamePk, lang, t)}` : ''}
                                {rules.budget !== null && player.price !== undefined ? ` · ${t('fantasy.credits.price', { price: credits(player.price, lang) })}` : ''}
                            </span>
                        </p>
                        {warning ? (
                            <p className={warningClass}>
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{warning}</span>
                            </p>
                        ) : line ? (
                            <p className="truncate text-xs text-muted">{line}</p>
                        ) : (
                            !locked &&
                            player.proj !== undefined && (
                                <p className="truncate text-xs font-semibold text-accent-ink">
                                    {t('fantasy.smart.proj', { pts: credits(player.proj, lang) })}
                                    {player.rest ? ` · ${t('fantasy.smart.restShort')}` : player.startedAgo !== undefined ? ` · ${t('fantasy.smart.startedAgo', { count: player.startedAgo })}` : ''}
                                </p>
                            )
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    {!locked && lockText ? (
                        // Antes de su juego: a qué hora se cierra (después, sus puntos en vivo)
                        <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold text-muted">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {lockText}
                        </span>
                    ) : items.length ? (
                        <button
                            type="button"
                            onClick={() => setBreakdown((value) => !value)}
                            aria-expanded={breakdown}
                            aria-label={t('fantasyMore.breakdownOf', { name: player.name })}
                            className={`font-display text-2xl font-extrabold leading-none tabular-nums underline decoration-dotted decoration-2 underline-offset-4 ${counts ? '' : 'text-faint line-through'}`}
                        >
                            {scoreText}
                        </button>
                    ) : (
                        <span className={`font-display text-2xl font-extrabold leading-none tabular-nums ${counts ? '' : 'text-faint line-through'}`}>{scoreText}</span>
                    )}
                    {locked ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-faint">
                            {owned && <span title={t('fantasy.smart.owned', { pct: credits(owned.pct, lang) })}>{credits(owned.pct, lang)} %</span>}
                            <Lock className="h-3.5 w-3.5" aria-label={t('fantasy.locked')} />
                        </span>
                    ) : (
                        <span className="flex gap-1">
                            {!postponed && (
                                <button
                                    type="button"
                                    onClick={() => setCaptain(day, entry, player)}
                                    className={`flex h-7 w-7 items-center justify-center rounded-full ${captain ? 'bg-gold text-white' : 'bg-raised text-muted'}`}
                                    aria-label={t('fantasy.makeCaptain')}
                                    aria-pressed={captain}
                                >
                                    <Crown className="h-3.5 w-3.5" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => removePlayer(day, player)}
                                className={`flex h-7 w-7 items-center justify-center rounded-full ${postponed ? 'bg-live text-white' : 'bg-raised text-muted'}`}
                                aria-label={t('fantasy.remove', { name: player.name })}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </span>
                    )}
                </div>
            </div>
            {breakdown && items.length > 0 && (
                <ul className="mx-3 -mt-2 rounded-b-[18px] bg-raised px-4 pb-2.5 pt-4 text-sm" aria-label={t('fantasyMore.breakdownOf', { name: player.name })}>
                    {items.map((item) => (
                        <li key={item.key} className="flex justify-between gap-3 py-0.5">
                            <span className="text-muted">
                                {item.count} × {t(`fantasyHelp.points.${player.role === 'P' ? 'pitcher' : 'batter'}.${item.key}`)} ({item.each > 0 ? `+${item.each}` : item.each})
                            </span>
                            <b className={`tabular-nums ${item.total < 0 ? 'text-live' : ''}`}>{item.total > 0 ? `+${item.total}` : item.total}</b>
                        </li>
                    ))}
                    {counted.captain === player.id && (
                        <li className="flex justify-between gap-3 border-t border-line/10 pt-1 font-semibold">
                            <span>{t('fantasyMore.captainBonus', { x: rules.captain })}</span>
                            <b className="tabular-nums">{scoreText}</b>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
};

/** Uno de tu equipo que ya no sale en los juegos del día: se ve con su aviso y se puede quitar */
const MissingSlot: React.FC<{ day: FantasyDay; id: number }> = ({ day, id }) => {
    const { t } = useTranslation();
    const name = t('fantasyHelp.card.missingName');
    return (
        <div className="flex min-h-[84px] items-center gap-3 rounded-[22px] bg-surface px-3 py-2 shadow-card ring-1 ring-live/30">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-raised text-muted">
                <UserX className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">{name}</p>
                <p className={warningClass}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t('fantasyHelp.card.missing')}</span>
                </p>
            </div>
            <button type="button" onClick={() => removeId(day, id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-live text-white" aria-label={t('fantasy.remove', { name })}>
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
};
