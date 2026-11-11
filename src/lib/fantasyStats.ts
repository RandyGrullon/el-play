// Fantasy v3 (igual que la web): «Mi temporada» (/api/v2/fantasy/fan/:id/stats), «Ideas para hoy»
// (/api/v2/fantasy/trends) y la tabla por semanas de una liga privada (/api/v2/fantasy/weeks). Todo es opcional: si el
// servidor no tiene la ruta (404), no tiene cuentas (503) o falla, la pantalla esconde esa sección. Los logros los da el
// servidor; sin él, se sacan del perfil como antes (achievementsOf).
import { useQuery } from '@tanstack/react-query';
import type { LeagueId } from '../types';
import { ApiError, networkErrorCode } from './api';
import { API_BASE } from './config';
import { RULES, type PlayerStatus } from './fantasy';
import type { FanDay, FanProfileData } from '../components/fantasy/fans';

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

// ---------------------------------------------------------------- logros

const DAY_MS = 86400000;
const playedDay = (day: FanDay) => day.lineup.length > 0 || day.picksMade > 0;

/** Racha más larga de días seguidos jugando (los del perfil: días del calendario, como antes) */
const longestStreak = (days: FanDay[]) => {
    const dates = days
        .filter(playedDay)
        .map((day) => Date.parse(`${day.date}T12:00:00Z`))
        .sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    let previous: number | null = null;
    for (const time of dates) {
        run = previous !== null && Math.round((time - previous) / DAY_MS) === 1 ? run + 1 : 1;
        best = Math.max(best, run);
        previous = time;
    }
    return best;
};

/** Lo que hace falta para calcular los logros en el teléfono (de /stats sin logros o del perfil de siempre) */
interface SeasonSummary {
    days: number;
    points: number;
    best: number;
    longest: number;
    /** null: no se sabe (no se muestra) */
    perfectPicks: boolean | null;
}

const fromSummary = (summary: SeasonSummary): AchievementState[] => {
    const count = (id: AchievementId, goal: number, value: number): AchievementState => ({ id, unlockedAt: null, progress: { value: Math.max(0, Math.min(Math.round(value * 10) / 10, goal)), goal } });
    const states = [
        count('firstTeam', 1, summary.days),
        count('days10', 10, summary.days),
        count('days30', 30, summary.days),
        count('day50', 50, summary.best),
        count('day100', 100, summary.best),
        count('day150', 150, summary.best),
        count('streak3', 3, summary.longest),
        count('streak7', 7, summary.longest),
        count('streak14', 14, summary.longest),
        // Los de sí o no van sin avance (como en el servidor); logrado, «1 de 1» para que cuente sin fecha
        ...(summary.perfectPicks === null ? [] : [{ id: 'perfectPicks', unlockedAt: null, progress: summary.perfectPicks ? { value: 1, goal: 1 } : null }]),
        count('season500', 500, summary.points),
        count('season1000', 1000, summary.points)
    ];
    return states;
};

/** Ya lo tiene: con fecha, o con lo que lleva igual o más que la meta */
export const achievementDone = (state: AchievementState) => !!state.unlockedAt || (!!state.progress && state.progress.value >= state.progress.goal);

/**
 * Los logros que se muestran: los del servidor (todas las definiciones, logradas o no) o, sin ellos, los que se pueden
 * calcular en el teléfono: con /stats sin logros, con sus totales; sin /stats, con el perfil (40 días, como antes).
 * Los que solo sabe el servidor (capitán estrella, top 10, líder del día, ganga, campeón de la semana) no salen.
 */
export const achievementsOf = (stats: FanStats | null | undefined, profile: Pick<FanProfileData, 'season' | 'days'> | null | undefined): { list: AchievementState[]; source: 'server' | 'client' } | null => {
    const known = (stats?.achievements ?? []).filter((item) => isAchievementId(item.id));
    if (known.length) return { list: [...known].sort((a, b) => ACHIEVEMENT_IDS.indexOf(a.id as AchievementId) - ACHIEVEMENT_IDS.indexOf(b.id as AchievementId)), source: 'server' };
    if (stats) {
        return {
            list: fromSummary({ days: stats.totals.days, points: stats.totals.total, best: stats.totals.best?.total ?? Math.max(0, ...stats.days.map((day) => day.total)), longest: stats.streak.longest, perfectPicks: null }),
            source: 'client'
        };
    }
    if (!profile) return null;
    const finished = profile.days.filter((day) => day.final);
    const best = Math.max(0, profile.season.best?.points ?? 0, ...finished.map((day) => day.total));
    return {
        list: fromSummary({
            days: profile.season.days,
            points: profile.season.points,
            best,
            longest: longestStreak(profile.days),
            // Todos los pronósticos de un día acertados (al menos 3)
            perfectPicks: finished.some((day) => day.picksMade >= 3 && day.picks === day.picksMade * RULES.pick)
        }),
        source: 'client'
    };
};

/** Las semanas que ganó en sus ligas privadas (el domingo de cada una), de la más vieja a la más nueva */
export const weekTitles = (leagues: LeagueWeek[][], userId: string) => [...new Set(leagues.flat().filter((week) => week.champion === userId).map((week) => week.end))].sort();

/**
 * «Campeón de la semana»: la base no deja que el servidor vea las ligas privadas, así que lo marca el teléfono cuando
 * /weeks dice que ganaste una semana en una de tus ligas (con el domingo de la primera como fecha).
 */
export const withWeekTitles = (list: AchievementState[], titles: string[]) =>
    titles.length ? list.map((item) => (item.id === 'weekChampion' && !achievementDone(item) ? { ...item, unlockedAt: titles[0] } : item)) : list;

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
        .map((week) => ({ start: week.start, end: week.end, champion: typeof week.champion === 'string' && week.champion ? week.champion : null, rows: list<WeekRow>(week.rows).filter((row) => row && typeof row.userId === 'string') }))
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
