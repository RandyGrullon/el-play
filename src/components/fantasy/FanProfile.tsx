import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Crown, Lock, Sparkles, User } from 'lucide-react';
import type { LeagueId } from '../../types';
import { BottomSheet } from '../ui/BottomSheet';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { TeamLogo } from '../ui/TeamLogo';
import { ErrorState, OfflineState, Skeleton, waitingForNetwork } from '../ui/States';
import { PlayerSheet } from '../stats/PlayerSheet';
import { formatTime, localeFor, seasonLabel, todayKey } from '../../lib/format';
import { inningName } from '../../lib/baseball';
import { useSession } from '../../lib/account';
import { RULES, effectiveEntry, entryKey, gameStarted, isLocked, lineText, pickPoints, pickResult, playerScore, teamPoints, useFantasyDay, useFantasyStore, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import { SEASON_TOP, useFanEntry, useFanProfile, useSeasonRanking, withRanks, type FanDay, type FanProfileData } from '../../lib/fans';
import { achievements } from '../../lib/fantasyExtras';

export const FAN_GRADIENT = 'linear-gradient(135deg, #1e4fd8 0%, #6d28d9 55%, #e11d48 100%)';

type T = (key: string, options?: Record<string, unknown>) => string;

const initialOf = (name: string | null | undefined) => (name ? Array.from(name.trim())[0]?.toLocaleUpperCase() : '') || '';
const round = (value: number) => Math.round(value * 10) / 10;
// En las cajitas de la cabecera: de 1000 en adelante sin decimal (en 320 px no cabe «2534.5»)
const statNumber = (value: number) => (Math.abs(value) >= 1000 ? Math.round(value) : round(value));

/** «vie, 16 oct» (los días vienen sin hora) */
const shortDay = (day: string, lang: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(localeFor(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Cómo se llama en la lista: «Tú» para la propia cuenta y «Fanático» si no se ha puesto nombre */
export const fanLabel = (t: T, name: string | null | undefined, own: boolean) => (own ? t('fantasy.you') : name || t('fantasy.fans.anonymous'));

/** La inicial en un círculo con el degradado de la marca */
export const FanAvatar: React.FC<{ name: string | null | undefined; size?: number; className?: string }> = ({ name, size = 40, className = '' }) => {
    const initial = initialOf(name);
    return (
        <span className={`flex shrink-0 items-center justify-center rounded-full font-display font-extrabold leading-none text-white ${className}`} style={{ width: size, height: size, background: FAN_GRADIENT, fontSize: size * 0.44 }} aria-hidden="true">
            {initial || <User style={{ width: size * 0.5, height: size * 0.5 }} />}
        </span>
    );
};

// ---------------------------------------------------------------- perfil

interface FanProfileProps {
    userId: string;
    league: LeagueId;
    onClose: () => void;
    /** El nombre que ya se conocía al abrirlo (la fila que se tocó): se usa mientras carga */
    knownName?: string | null;
}

// Perfil de un fanático: su temporada, sus últimos días, el equipo de hoy (lo que no ha empezado se esconde
// a los demás) y los días anteriores con su equipo.
export const FanProfile: React.FC<FanProfileProps> = ({ userId, league, onClose, knownName = null }) => {
    const { t, i18n } = useTranslation();
    const session = useSession();
    const own = session?.user.id === userId;
    const query = useFanProfile(userId, league);
    const season = useSeasonRanking(league);
    const today = useFantasyDay(league);
    const profile = query.data;

    const ranked = useMemo(() => withRanks(season.data?.ranking ?? []), [season.data]);
    const inTop = ranked.find((row) => row.userId === userId);
    // La tabla trae el top 200: si está llena y no sale, su puesto se pide aparte
    const outside = !!season.data && !inTop && season.data.ranking.length >= SEASON_TOP;
    const alone = useSeasonRanking(league, [userId], outside);
    const lone = alone.data?.ranking.find((row) => row.userId === userId);
    const place = inTop ?? (lone?.rank ? { ...lone, rank: lone.rank } : undefined);
    const name = (own ? session?.name : null) || profile?.name || place?.name || knownName || null;
    // Mientras carga sin nombre no se dice «Fanático» (parecería una cuenta sin nombre)
    const naming = !own && !name && query.isPending;
    const title = own ? name || t('fantasy.you') : naming ? t('fantasy.fans.eyebrow') : name || t('fantasy.fans.anonymous');
    // «2026‑27» con guion que no se parte (en 320 px quedaba «27» solo en otra línea)
    const seasonName = season.data ? seasonLabel(season.data.season, league).replace(/-/g, '\u2011') : '';
    const rankText = place
        ? t('fantasy.fans.rank', { rank: place.rank, season: seasonName })
        : !season.isSuccess || (outside && alone.isPending)
          ? ' '
          : outside && alone.isError
            ? t('fantasy.fans.outsideTop', { n: SEASON_TOP })
            : t('fantasy.fans.unranked');
    const todayDate = today.data?.date ?? todayKey();
    const days = profile?.days ?? [];
    const todayFan = days.find((day) => day.date === todayDate);
    const past = days.filter((day) => day.date < todayDate);
    const recent = days.slice(0, 10).reverse();

    return (
        <BottomSheet open onClose={onClose} title={title} tall>
            <div className="space-y-5 pb-4">
                {/* Cabecera: la inicial, el puesto y la temporada */}
                <section className="relative overflow-hidden rounded-card p-5 text-white shadow-float" style={{ background: FAN_GRADIENT }}>
                    <Sparkles className="absolute -right-3 -top-3 h-24 w-24 opacity-15" aria-hidden="true" />
                    <div className="flex items-center gap-4">
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white shadow-float min-[360px]:h-[76px] min-[360px]:w-[76px]" aria-hidden="true">
                            {naming ? (
                                <Skeleton className="h-9 w-9 rounded-full" />
                            ) : initialOf(name) ? (
                                <span className="bg-clip-text font-display text-[32px] font-extrabold leading-none text-transparent min-[360px]:text-[38px]" style={{ backgroundImage: FAN_GRADIENT }}>
                                    {initialOf(name)}
                                </span>
                            ) : (
                                <User className="h-9 w-9 text-[#6d28d9]" />
                            )}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-85">{own ? t('fantasy.fans.yourProfile') : t('fantasy.fans.eyebrow')}</p>
                            {naming ? (
                                <span className="my-1 block h-6 w-36 max-w-full animate-pulse rounded-full bg-white/30" aria-hidden="true" />
                            ) : (
                                <h3 className="font-display text-[26px] font-extrabold leading-[1.05] [overflow-wrap:anywhere]">{name || t('fantasy.fans.anonymous')}</h3>
                            )}
                            <p className="mt-0.5 text-sm font-semibold opacity-90">{rankText}</p>
                        </div>
                    </div>

                    {profile && (
                        <>
                            <dl className="mt-4 grid grid-cols-3 gap-2">
                                <Stat label={t('fantasy.fans.seasonPoints')} value={statNumber(profile.season.points)} />
                                <Stat label={t('fantasy.fans.daysPlayed')} value={profile.season.days} />
                                <Stat label={t('fantasy.fans.bestDay')} value={profile.season.best ? statNumber(profile.season.best.points) : '—'} hint={profile.season.best ? shortDay(profile.season.best.date, i18n.language) : undefined} />
                            </dl>
                            {recent.length > 1 && <RecentBars days={recent} />}
                        </>
                    )}
                </section>

                {waitingForNetwork(query) ? (
                    <OfflineState />
                ) : query.isPending ? (
                    <div className="space-y-3" aria-busy="true">
                        <Skeleton className="h-6 w-24 rounded-full" />
                        <Skeleton className="h-[220px] rounded-card" />
                        <Skeleton className="h-[140px] rounded-card" />
                    </div>
                ) : query.isError && !profile ? (
                    <ErrorState error={query.error} onRetry={() => query.refetch()} />
                ) : profile ? (
                    <>
                        <Achievements profile={profile} />

                        <section className="space-y-2" aria-label={t('games.today')}>
                            <h4 className="eyebrow">{own ? t('fantasy.fans.yourTeamToday') : t('fantasy.fans.teamToday')}</h4>
                            <DayDetail userId={userId} league={league} own={own} fanDay={todayFan} isToday />
                        </section>

                        <section className="space-y-2" aria-label={t('fantasy.fans.pastDays')}>
                            <h4 className="eyebrow">{t('fantasy.fans.pastDays')}</h4>
                            {past.length ? (
                                <ul className="card divide-y divide-line/10 overflow-hidden">
                                    {past.map((day) => (
                                        <PastDay key={day.date} userId={userId} league={league} own={own} day={day} />
                                    ))}
                                </ul>
                            ) : (
                                <p className="card p-4 text-sm text-muted">{own ? t('fantasy.fans.noPastDaysOwn') : t('fantasy.fans.noPastDays')}</p>
                            )}
                        </section>
                    </>
                ) : null}
            </div>
        </BottomSheet>
    );
};

const ACHIEVEMENT_ICONS: Record<string, string> = { firstTeam: '⚾', tenDays: '📅', fifty: '🔥', hundred: '💯', streak3: '⚡', streak7: '🏃', perfectPicks: '🎯', fiveHundred: '🏆' };

/** Logros: los que ya tiene en color y los que faltan apagados, con lo que lleva */
const Achievements: React.FC<{ profile: FanProfileData }> = ({ profile }) => {
    const { t } = useTranslation();
    const list = achievements(profile);
    const done = list.filter((item) => item.done).length;
    return (
        <section className="space-y-2" aria-label={t('fantasyMore.achievements')}>
            <h4 className="eyebrow">
                {t('fantasyMore.achievements')} · {done}/{list.length}
            </h4>
            <ul className="grid grid-cols-4 gap-2">
                {list.map((item) => (
                    <li key={item.key} className={`flex flex-col items-center gap-1 rounded-2xl p-2 text-center ${item.done ? 'bg-gold/15' : 'bg-raised opacity-60'}`} title={t(`fantasyMore.badges.${item.key}.hint`)}>
                        <span className={`text-2xl ${item.done ? '' : 'grayscale'}`} aria-hidden="true">
                            {ACHIEVEMENT_ICONS[item.key]}
                        </span>
                        <span className="text-[10px] font-extrabold leading-tight">{t(`fantasyMore.badges.${item.key}.name`)}</span>
                        <span className="sr-only">{t(`fantasyMore.badges.${item.key}.hint`)}</span>
                        {!item.done && item.progress && <span className="text-[10px] font-semibold tabular-nums text-muted">{item.progress.value}/{item.progress.goal}</span>}
                    </li>
                ))}
            </ul>
        </section>
    );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
    <div className="min-w-0 rounded-2xl bg-white/15 px-2.5 py-2">
        <dt className="truncate text-[11px] font-bold opacity-85">{label}</dt>
        {/* En 320 px las cajitas miden ~77 px: la cifra se achica con el ancho y nunca se sale */}
        <dd className="truncate font-display text-[clamp(19px,6.2vw,26px)] font-extrabold leading-tight tabular-nums">{value}</dd>
        {hint && <dd className="truncate text-[11px] font-semibold opacity-85">{hint}</dd>}
    </div>
);

/** Barras de los últimos días (del más viejo al más nuevo), como las del resumen del Fantasy */
const RecentBars: React.FC<{ days: FanDay[] }> = ({ days }) => {
    const { t, i18n } = useTranslation();
    const max = Math.max(...days.map((day) => day.total), 1);
    const summary = days.map((day) => `${shortDay(day.date, i18n.language)}: ${round(day.total)}`).join(', ');
    return (
        <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-bold opacity-85">{t('fantasy.fans.lastDays', { count: days.length })}</p>
            <div className="flex h-12 items-end gap-1.5" role="img" aria-label={t('fantasy.fans.barsLabel', { list: summary })}>
                {days.map((day) => (
                    <span key={day.date} className={`max-w-[40px] flex-1 rounded-t-md ${day.live ? 'bg-white' : 'bg-white/70'}`} style={{ height: `${Math.max(8, (Math.max(0, day.total) / max) * 100)}%` }} title={`${day.date}: ${round(day.total)}`} />
                ))}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------- días anteriores

const PastDay: React.FC<{ userId: string; league: LeagueId; own: boolean; day: FanDay }> = ({ userId, league, own, day }) => {
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const id = `fan-day-${day.date}`;
    return (
        <li>
            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={id} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-bold">
                        <span className="truncate first-letter:uppercase">{shortDay(day.date, i18n.language)}</span>
                        {day.live && <span className="shrink-0 rounded-full bg-live/10 px-2 py-0.5 text-[10px] font-extrabold uppercase text-live">{t('fantasy.liveNow')}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                        {t('fantasy.teamPts', { pts: round(day.team) })} · {t('fantasy.picksPts', { pts: round(day.picks) })}
                    </span>
                </span>
                <span className="font-display text-xl font-extrabold tabular-nums">{round(day.total)}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {open && (
                <div id={id} className="px-3 pb-3">
                    <DayDetail userId={userId} league={league} own={own} fanDay={day} date={day.date} flat />
                </div>
            )}
        </li>
    );
};

// ---------------------------------------------------------------- equipo de un día

const gameStatus = (day: FantasyDay, gamePk: number, lang: string, t: T) => {
    const game = day.games.find((g) => g.gamePk === gamePk);
    if (!game) return '';
    if (game.state === 'final') return t('fantasy.final');
    if (game.state === 'live' && game.live) return inningName({ n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState }, lang, true);
    return formatTime(game.date, lang);
};

interface DayDetailProps {
    userId: string;
    league: LeagueId;
    own: boolean;
    /** Lo que dice el perfil de ese día (respaldo si Supabase no responde) */
    fanDay?: FanDay;
    /** Sin fecha es hoy */
    date?: string;
    isToday?: boolean;
    /** Dentro de la lista de días: sin tarjeta propia */
    flat?: boolean;
}

/** Equipo y pronósticos de un día con los puntos de ese día; a los demás no se les muestra lo que no ha empezado */
const DayDetail: React.FC<DayDetailProps> = ({ userId, league, own, fanDay, date, isToday = false, flat = false }) => {
    const { t, i18n } = useTranslation();
    const dayQuery = useFantasyDay(league, date);
    const day = dayQuery.data;
    const key = date ?? day?.date;
    // La propia cuenta: lo del teléfono (lo más nuevo); los demás: lo de Supabase
    const store = useFantasyStore();
    const local = own && key ? store[entryKey(league, key)] : undefined;
    const useLocal = !!local && local.savedAt > 0;
    const remote = useFanEntry(userId, league, key, !useLocal);
    const [info, setInfo] = useState<FantasyPlayer | null>(null);

    // Lo de Supabase se puntúa como estaba al empezar cada juego (lo cambiado después no cuenta)
    const saved: DayEntry | null = useLocal ? local! : remote.data ?? (fanDay && remote.isError ? { lineup: fanDay.lineup, captain: fanDay.captain, picks: {}, savedAt: 0 } : null);
    const entry = saved && day ? effectiveEntry(day, saved) : saved;
    const picksKnown = useLocal || !!remote.data;
    const box = flat ? 'rounded-2xl bg-raised/60 p-3' : 'card p-4';

    if (waitingForNetwork(dayQuery)) return <OfflineState />;
    if (dayQuery.isPending || (!useLocal && remote.isPending && !!key)) return <Skeleton className={`${flat ? 'h-40' : 'h-[220px]'} rounded-card`} />;
    if (dayQuery.isError && !day) return <ErrorState error={dayQuery.error} onRetry={() => dayQuery.refetch()} compact />;
    if (!day) return null;

    if (!day.games.length && !entry?.lineup.length) return <p className={`${box} text-sm text-muted`}>{t('fantasy.noGames')}</p>;
    if (!entry || (!entry.lineup.length && !Object.keys(entry.picks).length && !(fanDay?.picksMade ?? 0))) {
        return <p className={`${box} text-sm text-muted`}>{isToday ? (own ? t('fantasy.fans.noTeamTodayOwn') : t('fantasy.fans.noTeamToday')) : t('fantasy.fans.noTeamDay')}</p>;
    }

    const players = entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    const hidden = (player: FantasyPlayer) => !own && !isLocked(day, player);
    const team = teamPoints(day, entry);
    const picks = picksKnown ? pickPoints(day, entry) : fanDay?.picks ?? 0;
    // Los pronósticos de los demás se ven cuando empieza el juego (a su hora, como el equipo)
    const games = day.games.filter((game) => entry.picks[game.gamePk] || gameStarted(game));

    return (
        <div className={`${box} space-y-3`}>
            <div className="flex items-end justify-between gap-3">
                <p className="min-w-0 text-xs font-semibold text-muted">
                    {t('fantasy.teamPts', { pts: team })} · {t('fantasy.picksPts', { pts: picks })}
                </p>
                <p className="shrink-0 text-right">
                    <span className="sr-only">{t('fantasy.fans.dayTotal')}: </span>
                    <span className="font-display text-[28px] font-extrabold leading-none tabular-nums">{round(team + picks)}</span>
                    <span className="ml-1 text-xs font-bold text-muted">{t('fantasy.fans.pts')}</span>
                </p>
            </div>

            {players.length > 0 && (
                <ul className="divide-y divide-line/10" aria-label={t('fantasy.fans.lineup')}>
                    {players.map((player) => {
                        if (hidden(player)) {
                            return (
                                <li key={player.id} className="flex items-center gap-3 py-2">
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised text-faint">
                                        <Lock className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0 flex-1 text-sm font-semibold text-muted">{t('fantasy.fans.hidden')}</span>
                                </li>
                            );
                        }
                        const club = day.teams[player.teamId];
                        const line = lineText(player, t);
                        const captain = entry.captain === player.id;
                        return (
                            <li key={player.id}>
                                <button type="button" onClick={() => setInfo(player)} className="flex w-full items-center gap-3 py-2 text-left" aria-label={t('statsPage.viewPlayer', { name: player.name })}>
                                    <PlayerPhoto personId={player.id} name={player.name} size={44} team={club ? { id: club.id, logo: club.logo, color: club.color } : null} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5 text-sm font-extrabold">
                                            {captain && <Crown className="h-4 w-4 shrink-0 text-gold" aria-label={t('fantasy.captain')} />}
                                            <span className="truncate">{player.name}</span>
                                        </span>
                                        <span className="block truncate text-xs text-muted">
                                            {club?.abbrev} · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')} · {gameStatus(day, player.gamePk, i18n.language, t)}
                                            {line ? ` · ${line}` : ''}
                                        </span>
                                    </span>
                                    <span className="font-display text-xl font-extrabold tabular-nums">{playerScore(entry, player)}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {picksKnown && games.length > 0 && (
                <div className="space-y-2">
                    <p className="eyebrow">{t('fantasy.picks')}</p>
                    <ul className="space-y-2">
                        {games.map((game) => {
                            const pick = entry.picks[game.gamePk];
                            const secret = !own && !gameStarted(game);
                            const result = pickResult(game, entry);
                            return (
                                <li key={game.gamePk} className={`rounded-2xl p-2 ${flat ? 'bg-surface shadow-card' : 'border border-line/10'}`}>
                                    <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-semibold text-muted">
                                        <span>{game.state === 'preview' ? formatTime(game.date, i18n.language) : game.state === 'final' ? t('fantasy.final') : t('fantasy.liveNow')}</span>
                                        {result === 'win' && <span className="font-extrabold text-ball">+{RULES.pick}</span>}
                                        {result === 'loss' && <span className="font-extrabold text-live">0</span>}
                                        {!pick && <span>{t('fantasy.noPick')}</span>}
                                    </div>
                                    {secret ? (
                                        <p className="flex items-center gap-2 rounded-xl bg-raised px-2.5 py-2 text-xs font-semibold text-muted">
                                            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                            <span className="min-w-0 flex-1">
                                                {game.away.abbrev} @ {game.home.abbrev} · {t('fantasy.fans.hidden')}
                                            </span>
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {[game.away, game.home].map((side) => {
                                                const chosen = pick === side.id;
                                                return (
                                                    <div
                                                        key={side.id}
                                                        className={`flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 ${chosen ? 'text-white' : 'bg-raised'} ${pick && !chosen ? 'opacity-60' : ''}`}
                                                        style={chosen ? { backgroundColor: side.color } : undefined}
                                                    >
                                                        <TeamLogo team={side} size={24} />
                                                        <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{side.abbrev}</span>
                                                        {game.state !== 'preview' && <span className="text-xs font-bold tabular-nums opacity-80">{side.score ?? 0}</span>}
                                                        {chosen && <span className="sr-only">{t(own ? 'fantasy.fans.pickedOwn' : 'fantasy.fans.picked')}</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            {info && <PlayerSheet id={info.id} name={info.name} team={day.teams[info.teamId] ? { id: day.teams[info.teamId].id, logo: day.teams[info.teamId].logo, color: day.teams[info.teamId].color } : null} onClose={() => setInfo(null)} />}
        </div>
    );
};
