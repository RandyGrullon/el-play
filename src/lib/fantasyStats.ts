// «Mi temporada» (Fantasy v3): la temporada completa de un fanático que calcula el servidor
// (/api/v2/fantasy/fan/:id/stats) con la misma puntuación de las tablas, y sus logros. Todo es opcional: con un
// servidor viejo (404), sin cuentas (503) o sin red se arma lo que se pueda con el perfil (/fan/:id) y los logros se
// calculan aquí como antes.
import { useQuery } from '@tanstack/react-query';
import type { LeagueId } from '../types';
import { achievements as clientAchievements } from './fantasyExtras';
import { getJson, isFanId, retry, type FanProfileData } from './fans';

export interface FanStatsDay {
    date: string;
    team: number;
    picks: number;
    total: number;
    /** Puesto compartido entre todos los fanáticos de ese día */
    rank: number | null;
    /** Cuántos fanáticos jugaron ese día */
    players: number;
}

export interface ServerAchievement {
    id: string;
    unlockedAt: string | null;
    progress: { value: number; goal: number } | null;
}

export interface FanStats {
    userId: string;
    league: LeagueId;
    season: number;
    /** Del más viejo al más nuevo */
    days: FanStatsDay[];
    totals: { days: number; total: number; avg: number; median: number; best: { date: string; total: number } | null; worst: { date: string; total: number } | null };
    /** Días de juego seguidos con equipo */
    streak: { current: number; longest: number };
    /** bonus = lo que sumó el ×1,5 */
    captain: { days: number; avg: number; bonus: number; best: { id: number; name: string; points: number; date: string } | null };
    picks: { made: number; hits: number; pct: number | null };
    players: { id: number; name: string; teamId: number | null; role: 'B' | 'P'; days: number; points: number }[];
    achievements: ServerAchievement[];
}

/** Lo que se muestra: la temporada del servidor (completa) o la armada con el perfil (sin capitán, pronósticos ni peloteros) */
export interface SeasonData {
    stats: FanStats;
    full: boolean;
}

// ---------------------------------------------------------------- servidor

const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const round1 = (value: number) => Math.round(value * 10) / 10;

/** Lo que mande el servidor, con todo lo que falte en cero: un campo nuevo nunca rompe la pantalla */
export const cleanStats = (raw: Partial<FanStats> | null | undefined, userId: string, league: LeagueId): FanStats => {
    const totals: Partial<FanStats['totals']> = raw?.totals ?? {};
    const captain: Partial<FanStats['captain']> = raw?.captain ?? {};
    const picks: Partial<FanStats['picks']> = raw?.picks ?? {};
    const days = list<FanStatsDay>(raw?.days)
        .filter((day) => day && typeof day.date === 'string')
        .map((day) => ({ date: day.date, team: num(day.team), picks: num(day.picks), total: num(day.total), rank: typeof day.rank === 'number' ? day.rank : null, players: num(day.players) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    return {
        userId,
        league,
        season: num(raw?.season),
        days,
        totals: {
            days: num(totals.days, days.length),
            total: num(totals.total, round1(days.reduce((sum, day) => sum + day.total, 0))),
            avg: num(totals.avg),
            median: num(totals.median),
            best: totals.best && typeof totals.best.date === 'string' ? { date: totals.best.date, total: num(totals.best.total) } : null,
            worst: totals.worst && typeof totals.worst.date === 'string' ? { date: totals.worst.date, total: num(totals.worst.total) } : null
        },
        streak: { current: num(raw?.streak?.current), longest: num(raw?.streak?.longest) },
        captain: {
            days: num(captain.days),
            avg: num(captain.avg),
            bonus: num(captain.bonus),
            best: captain.best && typeof captain.best.id === 'number' ? { id: captain.best.id, name: String(captain.best.name ?? ''), points: num(captain.best.points), date: String(captain.best.date ?? '') } : null
        },
        picks: { made: num(picks.made), hits: num(picks.hits), pct: typeof picks.pct === 'number' && Number.isFinite(picks.pct) ? picks.pct : null },
        players: list<FanStats['players'][number]>(raw?.players)
            .filter((player) => player && typeof player.id === 'number')
            .map((player) => ({ id: player.id, name: String(player.name ?? ''), teamId: typeof player.teamId === 'number' ? player.teamId : null, role: player.role === 'P' ? 'P' : 'B', days: num(player.days), points: num(player.points) })),
        achievements: list<ServerAchievement>(raw?.achievements).filter((item) => item && typeof item.id === 'string')
    };
};

const fetchStats = async (userId: string, league: LeagueId, signal?: AbortSignal) =>
    cleanStats(await getJson<Partial<FanStats>>(`/api/v2/fantasy/fan/${encodeURIComponent(userId)}/stats?league=${league}`, signal), userId, league);

/**
 * La temporada de un fanático. En el modo de prueba (solo en desarrollo) sale de datos inventados que se cargan
 * aparte, así no pesan en la app.
 */
export const useFanStats = (userId: string | null, league: LeagueId, demo = false) =>
    useQuery({
        queryKey: ['fantasy-fan-stats', league, demo ? 'demo' : userId],
        queryFn: async ({ signal }) => (demo ? (await import('./fantasyDemoData')).demoStats(league) : fetchStats(userId!, league, signal)),
        enabled: demo || isFanId(userId),
        staleTime: 5 * 60000,
        retry
    });

// ---------------------------------------------------------------- respaldo con el perfil

const DAY_MS = 86400000;

/** Racha de días seguidos jugando (días del calendario, como los logros de antes): la actual y la más larga */
const calendarStreaks = (dates: string[]) => {
    const times = [...new Set(dates)].map((date) => Date.parse(`${date}T12:00:00Z`)).sort((a, b) => a - b);
    let longest = 0;
    let run = 0;
    let previous: number | null = null;
    for (const time of times) {
        run = previous !== null && Math.round((time - previous) / DAY_MS) === 1 ? run + 1 : 1;
        longest = Math.max(longest, run);
        previous = time;
    }
    return { current: run, longest };
};

const median = (values: number[]) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return round1(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
};

/** Sin el servidor nuevo: lo que dice el perfil (sus últimos días y la temporada) y los logros calculados aquí */
export const statsFromProfile = (profile: FanProfileData): FanStats => {
    const played = profile.days.filter((day) => day.final && (day.lineup.length > 0 || day.picksMade > 0));
    const days = played.map((day) => ({ date: day.date, team: day.team, picks: day.picks, total: day.total, rank: null, players: 0 })).sort((a, b) => a.date.localeCompare(b.date));
    const totals = days.map((day) => day.total);
    const best = profile.season.best ? { date: profile.season.best.date, total: profile.season.best.points } : null;
    const worst = days.length ? days.reduce((low, day) => (day.total < low.total ? day : low)) : null;
    return {
        userId: profile.userId,
        league: profile.league,
        season: 0,
        days,
        totals: {
            days: profile.season.days,
            total: round1(profile.season.points),
            avg: profile.season.days ? round1(profile.season.points / profile.season.days) : 0,
            median: median(totals),
            best,
            worst: worst ? { date: worst.date, total: worst.total } : null
        },
        streak: calendarStreaks(days.map((day) => day.date)),
        captain: { days: 0, avg: 0, bonus: 0, best: null },
        picks: { made: 0, hits: 0, pct: null },
        players: [],
        achievements: []
    };
};

/** La temporada que se muestra: la del servidor si llegó; si no (404, 503, error), la del perfil */
export const seasonData = (stats: FanStats | null | undefined, profile: FanProfileData | null | undefined): SeasonData | null => {
    if (stats) return { stats, full: true };
    if (profile) return { stats: statsFromProfile(profile), full: false };
    return null;
};

// ---------------------------------------------------------------- logros

/** Los logros, en el orden en que salen (los del servidor; los que el cliente no conoce no se muestran) */
export const ACHIEVEMENT_IDS = [
    'firstTeam',
    'days10',
    'days30',
    'day50',
    'day100',
    'day150',
    'streak3',
    'streak7',
    'streak14',
    'perfectPicks',
    'captainMvp',
    'season500',
    'season1000',
    'top10Day',
    'dayLeader',
    'bargain',
    'weekChampion'
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export const ACHIEVEMENT_ICONS: Record<AchievementId, string> = {
    firstTeam: '⚾',
    days10: '📅',
    days30: '🗓️',
    day50: '🔥',
    day100: '💯',
    day150: '🚀',
    streak3: '⚡',
    streak7: '🏃',
    streak14: '🏅',
    perfectPicks: '🎯',
    captainMvp: '👑',
    season500: '🏆',
    season1000: '💎',
    top10Day: '🔟',
    dayLeader: '🥇',
    bargain: '💰',
    weekChampion: '🏟️'
};

export interface AchievementView {
    id: AchievementId;
    done: boolean;
    /** Cuándo se desbloqueó (null si no se sabe: el cálculo de respaldo no lo dice) */
    date: string | null;
    progress: { value: number; goal: number } | null;
}

const isAchievementId = (id: string): id is AchievementId => (ACHIEVEMENT_IDS as readonly string[]).includes(id);

/** Los logros del cálculo de antes con los ids del servidor */
const FALLBACK_IDS: Record<string, AchievementId> = { firstTeam: 'firstTeam', tenDays: 'days10', fifty: 'day50', hundred: 'day100', streak3: 'streak3', streak7: 'streak7', perfectPicks: 'perfectPicks', fiveHundred: 'season500' };

const cleanProgress = (progress: unknown) => {
    const value = progress as { value?: unknown; goal?: unknown } | null;
    return value && typeof value.value === 'number' && typeof value.goal === 'number' && value.goal > 0 ? { value: Math.min(value.value, value.goal), goal: value.goal } : null;
};

export const achievementsFromServer = (items: ServerAchievement[]): AchievementView[] => {
    const byId = new Map(items.filter((item) => isAchievementId(item.id)).map((item) => [item.id as AchievementId, item]));
    return ACHIEVEMENT_IDS.filter((id) => byId.has(id)).map((id) => {
        const item = byId.get(id)!;
        const done = typeof item.unlockedAt === 'string' && item.unlockedAt !== '';
        return { id, done, date: done ? item.unlockedAt : null, progress: cleanProgress(item.progress) };
    });
};

/** Sin el servidor: el cálculo de siempre con los días del perfil (solo los logros que se pueden saber así) */
export const achievementsFallback = (profile: FanProfileData): AchievementView[] =>
    clientAchievements(profile)
        .filter((item) => FALLBACK_IDS[item.key])
        .map((item) => ({ id: FALLBACK_IDS[item.key], done: item.done, date: null, progress: item.progress && !item.done ? item.progress : null }));

/** Los logros que se muestran (perfil y Mi temporada): los del servidor y, si no llegaron, el cálculo de respaldo */
export const achievementList = (stats: FanStats | null | undefined, profile: FanProfileData | null | undefined): AchievementView[] => {
    const server = stats ? achievementsFromServer(stats.achievements) : [];
    if (server.length) return server;
    return profile ? achievementsFallback(profile) : [];
};
