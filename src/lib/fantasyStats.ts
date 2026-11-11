// Fantasy v3 (igual que la web): «Mi temporada» (/api/v2/fantasy/fan/:id/stats), «Ideas para hoy»
// (/api/v2/fantasy/trends) y la tabla por semanas de una liga privada (/api/v2/fantasy/weeks). Todo es opcional: si el
// servidor no tiene la ruta (404), no tiene cuentas (503) o falla, la pantalla esconde esa sección. Los logros los da el
// servidor; sin él, se sacan del perfil como antes (achievementList), igual que la web.
import { useQuery } from '@tanstack/react-query';
import type { LeagueId } from '../types';
import { ApiError, networkErrorCode } from './api';
import { API_BASE } from './config';
import { RULES, type PlayerStatus } from './fantasy';
import type { FanProfileData } from '../components/fantasy/fans';

// ---------------------------------------------------------------- tipos (los del contrato)

export interface FanStatsDay {
    date: string;
    team: number;
    picks: number;
    total: number;
    /** Puesto compartido entre todos los fanáticos ese día */
    rank: number | null;
    /** Cuántos fanáticos jugaron ese día */
    players: number;
}

export interface AchievementState {
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
    streak: { current: number; longest: number };
    captain: { days: number; avg: number; bonus: number; best: { id: number; name: string; points: number; date: string } | null };
    picks: { made: number; hits: number; pct: number | null };
    players: { id: number; name: string; teamId: number | null; role: 'B' | 'P'; days: number; points: number }[];
    achievements: AchievementState[];
}

/** Todos los logros, en el orden en que se muestran */
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

/** El dibujo de cada logro (los mismos de la web) */
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
export const isAchievementId = (id: unknown): id is AchievementId => typeof id === 'string' && (ACHIEVEMENT_IDS as readonly string[]).includes(id);

export interface TrendItem {
    id: number;
    name: string;
    teamId: number;
    role: 'B' | 'P';
    price?: number;
    proj?: number;
    status?: PlayerStatus;
    /** Abridor estimado por la rotación (se ve «Le toca abrir») */
    estimated?: boolean;
    pos?: string;
    gamePk?: number;
    opp?: { id: number; abbrev: string; home: boolean } | null;
    last5?: number[];
    /** Lo que lo pone en la lista (según la lista) */
    avg?: number;
    value?: number;
    priceDelta?: number | null;
    matchup?: { oppOps: string | null; edge: 'good' | 'even' | 'tough' };
    owned?: number;
    /** Lanzadores: proyección por el duelo (con lo que se ordena) */
    score?: number;
}

export const TREND_LISTS = ['hot', 'bargains', 'risers', 'fallers', 'pitchers', 'popular'] as const;
export type TrendList = (typeof TREND_LISTS)[number];

export type FantasyTrends = { date: string } & Record<TrendList, TrendItem[]>;

export interface WeekRow {
    userId: string;
    total: number;
    days: number;
    rank: number;
}

export interface LeagueWeek {
    start: string;
    end: string;
    rows: WeekRow[];
    /** Solo cuando la semana ya terminó */
    champion: string | null;
}

// ---------------------------------------------------------------- lo que llega (puede venir a medias)

const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const numOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const dateOf = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value : null);

/** Lo de /stats con cada número en su lugar (un servidor viejo o a medias no rompe la pantalla) */
export const normalizeStats = (raw: Partial<FanStats> | null | undefined): FanStats | null => {
    if (!raw || typeof raw !== 'object') return null;
    const totals = (raw.totals ?? {}) as Partial<FanStats['totals']>;
    const captain = (raw.captain ?? {}) as Partial<FanStats['captain']>;
    const picks = (raw.picks ?? {}) as Partial<FanStats['picks']>;
    const streak = (raw.streak ?? {}) as Partial<FanStats['streak']>;
    const day = (value: { date?: unknown; total?: unknown } | null | undefined) => (value && dateOf(value.date) ? { date: value.date as string, total: num(value.total) } : null);
    const days = list<FanStatsDay>(raw.days)
        .filter((item) => item && dateOf(item.date))
        .map((item) => ({ date: item.date, team: num(item.team), picks: num(item.picks), total: num(item.total), rank: numOrNull(item.rank), players: num(item.players) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    const best = captain.best && typeof captain.best === 'object' && Number.isFinite(captain.best.id) ? { id: captain.best.id, name: String(captain.best.name ?? ''), points: num(captain.best.points), date: String(captain.best.date ?? '') } : null;
    return {
        userId: String(raw.userId ?? ''),
        league: raw.league as LeagueId,
        season: num(raw.season),
        days,
        totals: { days: num(totals.days, days.length), total: num(totals.total), avg: num(totals.avg), median: num(totals.median), best: day(totals.best), worst: day(totals.worst) },
        streak: { current: num(streak.current), longest: num(streak.longest) },
        captain: { days: num(captain.days), avg: num(captain.avg), bonus: num(captain.bonus), best },
        picks: { made: num(picks.made), hits: num(picks.hits), pct: numOrNull(picks.pct) },
        players: list<FanStats['players'][number]>(raw.players)
            .filter((item) => item && Number.isFinite(item.id))
            .map((item) => ({ id: item.id, name: String(item.name ?? ''), teamId: numOrNull(item.teamId), role: item.role === 'P' ? 'P' : 'B', days: num(item.days), points: num(item.points) })),
        achievements: list<AchievementState>(raw.achievements)
            .filter((item) => item && typeof item.id === 'string')
            .map((item) => ({
                id: item.id,
                unlockedAt: typeof item.unlockedAt === 'string' && item.unlockedAt ? item.unlockedAt : null,
                progress: item.progress && Number.isFinite(item.progress.value) && Number.isFinite(item.progress.goal) && item.progress.goal > 0 ? { value: item.progress.value, goal: item.progress.goal } : null
            }))
    };
};

/** Nunca jugó esta temporada (el estado vacío de «Mi temporada») */
export const statsEmpty = (stats: FanStats) => stats.totals.days === 0 && !stats.days.some((day) => day.total !== 0);

// ---------------------------------------------------------------- respaldo con el perfil (igual que la web)

const DAY_MS = 86400000;
const round1 = (value: number) => Math.round(value * 10) / 10;

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

/** Sin el servidor nuevo: lo que dice el perfil (sus últimos días y la temporada); capitán, pronósticos y peloteros no se saben */
export const statsFromProfile = (profile: FanProfileData): FanStats => {
    const played = profile.days.filter((day) => day.final && (day.lineup.length > 0 || day.picksMade > 0));
    const days = played.map((day) => ({ date: day.date, team: day.team, picks: day.picks, total: day.total, rank: null, players: 0 })).sort((a, b) => a.date.localeCompare(b.date));
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
            median: median(days.map((day) => day.total)),
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

/** La temporada que se muestra: la del servidor si llegó (`full`); si no (404, 503, error), la del perfil */
export const seasonData = (stats: FanStats | null | undefined, profile: FanProfileData | null | undefined): { stats: FanStats; full: boolean } | null => {
    if (stats) return { stats, full: true };
    if (profile) return { stats: statsFromProfile(profile), full: false };
    return null;
};

// ---------------------------------------------------------------- logros

/** Un logro como se muestra: logrado (con su día si se sabe) o con lo que lleva */
export interface AchievementView {
    id: AchievementId;
    done: boolean;
    /** Cuándo se desbloqueó (null si no se sabe: el cálculo de respaldo no lo dice) */
    date: string | null;
    progress: { value: number; goal: number } | null;
}

const cleanProgress = (progress: AchievementState['progress']) => (progress && progress.goal > 0 ? { value: Math.min(progress.value, progress.goal), goal: progress.goal } : null);

/** Los del servidor, en su orden (los que la app no conoce no se muestran) */
export const achievementsFromServer = (items: AchievementState[]): AchievementView[] => {
    const byId = new Map(items.filter((item) => isAchievementId(item.id)).map((item) => [item.id as AchievementId, item]));
    return ACHIEVEMENT_IDS.filter((id) => byId.has(id)).map((id) => {
        const item = byId.get(id)!;
        const done = typeof item.unlockedAt === 'string' && item.unlockedAt !== '';
        return { id, done, date: done ? item.unlockedAt : null, progress: cleanProgress(item.progress) };
    });
};

/**
 * Sin el servidor: el cálculo de siempre con los 40 días del perfil, con los ids del servidor (solo los que se pueden
 * saber así: primer equipo, 10 días, 50 y 100 en un día, rachas de 3 y 7, pronóstico perfecto y 500 puntos)
 */
export const achievementsFallback = (profile: Pick<FanProfileData, 'season' | 'days'>): AchievementView[] => {
    const finished = profile.days.filter((day) => day.final);
    const best = Math.max(0, ...finished.map((day) => day.total));
    const streak = calendarStreaks(profile.days.filter((day) => day.lineup.length > 0 || day.picksMade > 0).map((day) => day.date)).longest;
    const count = (id: AchievementId, goal: number, value: number): AchievementView => {
        const done = value >= goal;
        return { id, done, date: null, progress: done ? null : { value: Math.min(value, goal), goal } };
    };
    const flag = (id: AchievementId, done: boolean): AchievementView => ({ id, done, date: null, progress: null });
    return [
        count('firstTeam', 1, profile.season.days),
        count('days10', 10, profile.season.days),
        flag('day50', best >= 50),
        flag('day100', best >= 100),
        count('streak3', 3, streak),
        count('streak7', 7, streak),
        // Todos los pronósticos de un día acertados (al menos 3)
        flag('perfectPicks', finished.some((day) => day.picksMade >= 3 && day.picks === day.picksMade * RULES.pick)),
        count('season500', 500, Math.round(profile.season.points))
    ];
};

/**
 * «Campeón de la semana» lo dice la app: el servidor no ve las ligas privadas. Con la fecha de la primera semana que
 * ganó (de /weeks de sus ligas) el logro queda desbloqueado.
 */
export const withWeekTitle = (items: AchievementView[], date: string | null | undefined): AchievementView[] => {
    if (!date) return items;
    const unlocked: AchievementView = { id: 'weekChampion', done: true, date, progress: null };
    if (!items.some((item) => item.id === 'weekChampion')) return items.length ? [...items, unlocked] : items;
    return items.map((item) => (item.id === 'weekChampion' && !item.done ? unlocked : item));
};

/** Los logros que se muestran (perfil y Mi temporada): los del servidor y, si no llegaron, el cálculo de respaldo */
export const achievementList = (stats: FanStats | null | undefined, profile: Pick<FanProfileData, 'season' | 'days'> | null | undefined): AchievementView[] => {
    const server = stats ? achievementsFromServer(stats.achievements) : [];
    if (server.length) return server;
    return profile ? achievementsFallback(profile) : [];
};

// ---------------------------------------------------------------- semanas

/** «Esta semana», «La semana pasada», «Hace 2 semanas» (índice en la lista de la más nueva a la más vieja) */
export const weekName = (index: number, t: (key: string, options?: Record<string, unknown>) => string) =>
    index === 0 ? t('fantasyLeagues.thisWeek') : index === 1 ? t('fantasyLeagues.lastWeek') : t('fantasyLeagues.weeksAgo', { count: index });

/** El campeón de la semana pasada: el de la semana más nueva que ya tiene campeón (con sus puntos de esa semana) */
export const lastChampion = (weeks: LeagueWeek[]) => {
    const week = [...weeks].sort((a, b) => b.start.localeCompare(a.start)).find((item) => item.champion);
    if (!week) return null;
    const row = week.rows.find((item) => item.userId === week.champion);
    return { week, userId: week.champion!, total: row?.total ?? 0 };
};

/** El domingo de la primera semana que ganó en una de sus ligas (null si ninguna) */
export const weekTitle = (weeks: LeagueWeek[], userId: string) =>
    weeks
        .filter((week) => !!week.champion && week.champion.toLowerCase() === userId.toLowerCase())
        .map((week) => week.end)
        .sort()[0] ?? null;

// ---------------------------------------------------------------- servidor

const getJson = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const response = await fetch(`${API_BASE}${path}`, { signal, headers: { Accept: 'application/json' } }).catch(async (error: Error) => {
        if (error.name === 'AbortError') throw error;
        throw new ApiError(error.message, await networkErrorCode());
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ApiError(`HTTP ${response.status}`, typeof body.error === 'string' ? body.error : 'internal_error', response.status);
    }
    return (await response.json()) as T;
};

// La ruta que no existe (404) o las cuentas apagadas (503) no se arreglan reintentando
const retry = (failureCount: number, error: Error) => !(error instanceof ApiError && [400, 404, 503].includes(error.status)) && failureCount < 2;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const useFanStats = (userId: string | null | undefined, league: LeagueId, enabled = true) =>
    useQuery({
        queryKey: ['fantasy-stats', league, userId],
        queryFn: async ({ signal }) => normalizeStats(await getJson<Partial<FanStats>>(`/api/v2/fantasy/fan/${encodeURIComponent(userId!)}/stats?league=${league}`, signal)),
        enabled: enabled && !!userId && UUID.test(userId),
        staleTime: 5 * 60000,
        retry
    });

const trendItems = (value: unknown): TrendItem[] => list<TrendItem>(value).filter((item) => item && Number.isFinite(item.id) && typeof item.name === 'string');

export const useFantasyTrends = (league: LeagueId, date: string | undefined, enabled = true) =>
    useQuery({
        queryKey: ['fantasy-trends', league, date],
        queryFn: async ({ signal }) => {
            const raw = await getJson<Partial<FantasyTrends>>(`/api/v2/fantasy/trends?league=${league}&date=${date}`, signal);
            return { date: String(raw.date ?? date), ...(Object.fromEntries(TREND_LISTS.map((key) => [key, trendItems(raw[key])])) as Record<TrendList, TrendItem[]>) } as FantasyTrends;
        },
        enabled: enabled && !!date,
        staleTime: 5 * 60000,
        retry
    });

// Cuentas que se pueden pedir de una vez
const MAX_USERS = 100;

/** Los miembros en el orden de la dirección (la misma liga es la misma dirección y la misma copia en el CDN) */
const userIds = (users: string[] | undefined) => [...new Set((users ?? []).filter((id) => UUID.test(id)).map((id) => id.toLowerCase()))].sort().slice(0, MAX_USERS).join(',');

/** Semanas de lunes a domingo de una liga privada, de la actual (weeks[0]) hacia atrás */
export const fetchLeagueWeeks = async (league: LeagueId, users: string[], signal?: AbortSignal): Promise<LeagueWeek[]> => {
    const raw = await getJson<{ weeks?: LeagueWeek[] }>(`/api/v2/fantasy/weeks?league=${league}&users=${userIds(users)}`, signal);
    return list<LeagueWeek>(raw.weeks)
        .filter((week) => week && dateOf(week.start) && dateOf(week.end))
        .map((week) => ({
            start: week.start,
            end: week.end,
            champion: typeof week.champion === 'string' && week.champion ? week.champion : null,
            rows: list<WeekRow>(week.rows)
                .filter((row) => row && typeof row.userId === 'string')
                .map((row) => ({ userId: row.userId, total: num(row.total), days: num(row.days), rank: num(row.rank) }))
                .sort((a, b) => a.rank - b.rank || b.total - a.total)
        }))
        .sort((a, b) => b.start.localeCompare(a.start));
};

export const useLeagueWeeks = (league: LeagueId, users: string[] | undefined, enabled = true) => {
    const ids = userIds(users);
    return useQuery({
        queryKey: ['fantasy-weeks', league, ids],
        queryFn: ({ signal }) => fetchLeagueWeeks(league, ids.split(','), signal),
        enabled: enabled && ids !== '',
        staleTime: 5 * 60000,
        retry
    });
};
