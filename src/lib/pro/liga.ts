// Datos de liga del modo PRO (server/routes/pro/liga.js de la web): posiciones con situaciones y línea de corte,
// calendario de toda la temporada (carrera, cara a cara y forma), líderes por fase, equipos con los promedios de la liga,
// peloteros con sus últimos 5, ficha PRO, movimientos y el fantasy con lo de todos. Son rutas aparte: el Lite no las pide.
// Cada hook recibe `enabled` (por defecto true) para montarlo solo en PRO. Lo que MLB no manda llega en null.
// Mismos tipos y lógica que la web (el-play/src/lib/pro/liga.ts); la lectura va con API_BASE y aguanta que la ruta no
// exista todavía en producción (ver ./http.ts).
import { useQuery } from '@tanstack/react-query';
import type { LeagueId } from '../../types';
import type {
    FanProfilePro,
    FantasyDayStats,
    FantasyForm,
    LeagueHistory,
    PlayerPro,
    ProLeaders,
    ProPhaseId,
    ProPlayersData,
    ProStandings,
    SeasonCalendar,
    SeasonOverview,
    SeasonRankingPro,
    TeamStats,
    Transactions
} from '../../types/pro-liga';
import { MINUTE, SECOND, calmOn404, getPro, pollUnlessMissing, queryString, retryUnless } from './http';

const TIMEOUT_MS = 15 * SECOND;

// No reintentar lo que no se arregla solo (petición inválida, no existe) ni el fantasy sin cuentas (503)
const retry = retryUnless([400, 404, 503]);

const get = <T>(route: string, path: string, signal?: AbortSignal) => getPro<T>(route, path, signal, TIMEOUT_MS);

/** Rutas del PRO (también sirven para precargar con queryClient.prefetchQuery) */
export const proLigaApi = {
    standings: (league: LeagueId, signal?: AbortSignal) => get<ProStandings>('pro-standings', `/api/v2/pro/standings${queryString({ league })}`, signal),
    season: (league: LeagueId, signal?: AbortSignal) => get<SeasonOverview>('pro-season', `/api/v2/pro/season${queryString({ league })}`, signal),
    seasons: (signal?: AbortSignal) => get<{ leagues: SeasonOverview[] }>('pro-seasons', '/api/v2/pro/seasons', signal),
    calendar: (league: LeagueId, season?: number, signal?: AbortSignal) => get<SeasonCalendar>('pro-calendar', `/api/v2/pro/calendar${queryString({ league, season })}`, signal),
    leaders: (league: LeagueId, phase?: ProPhaseId, signal?: AbortSignal) => get<ProLeaders>('pro-leaders', `/api/v2/pro/leaders${queryString({ league, phase })}`, signal),
    teamStats: (league: LeagueId, phase?: ProPhaseId, season?: number, signal?: AbortSignal) =>
        get<TeamStats>('pro-team-stats', `/api/v2/pro/team-stats${queryString({ league, phase, season })}`, signal),
    players: (league: LeagueId, season?: number, phase?: ProPhaseId, signal?: AbortSignal) =>
        get<ProPlayersData>('pro-players', `/api/v2/pro/players${queryString({ league, season, phase })}`, signal),
    player: (id: number, league: LeagueId, season?: number, signal?: AbortSignal) => get<PlayerPro>('pro-player', `/api/v2/pro/player/${id}${queryString({ league, season })}`, signal),
    transactions: (league: LeagueId, days?: number, signal?: AbortSignal) => get<Transactions>('pro-transactions', `/api/v2/pro/transactions${queryString({ league, days })}`, signal),
    history: (league: LeagueId, signal?: AbortSignal) => get<LeagueHistory>('pro-history', `/api/v2/pro/history${queryString({ league })}`, signal),
    fantasyStats: (league: LeagueId, date?: string, signal?: AbortSignal) => get<FantasyDayStats>('pro-fantasy-stats', `/api/v2/pro/fantasy/stats${queryString({ league, date })}`, signal),
    fantasyForm: (league: LeagueId, date?: string, signal?: AbortSignal) => get<FantasyForm>('pro-fantasy-form', `/api/v2/pro/fantasy/form${queryString({ league, date })}`, signal),
    fan: (userId: string, league: LeagueId, signal?: AbortSignal) => get<FanProfilePro>('pro-fan', `/api/v2/pro/fantasy/fan/${encodeURIComponent(userId)}${queryString({ league })}`, signal),
    fantasySeason: (league: LeagueId, users?: string[], signal?: AbortSignal) =>
        get<SeasonRankingPro>('pro-fantasy-season', `/api/v2/pro/fantasy/season${queryString({ league, users: users?.length ? users.join(',') : undefined })}`, signal)
};

export const proLigaKeys = {
    standings: (league: LeagueId) => ['pro', 'standings', league] as const,
    season: (league: LeagueId) => ['pro', 'season', league] as const,
    seasons: () => ['pro', 'seasons'] as const,
    calendar: (league: LeagueId, season?: number) => ['pro', 'calendar', league, season ?? 'actual'] as const,
    leaders: (league: LeagueId, phase?: ProPhaseId) => ['pro', 'leaders', league, phase ?? 'activa'] as const,
    teamStats: (league: LeagueId, phase?: ProPhaseId, season?: number) => ['pro', 'team-stats', league, phase ?? 'primera', season ?? 'actual'] as const,
    players: (league: LeagueId, season?: number, phase?: ProPhaseId) => ['pro', 'players', league, season ?? 'actual', phase ?? 'primera'] as const,
    player: (id: number | null, league: LeagueId, season?: number) => ['pro', 'player', league, id, season ?? 'actual'] as const,
    transactions: (league: LeagueId, days: number) => ['pro', 'transactions', league, days] as const,
    history: (league: LeagueId) => ['pro', 'history', league] as const,
    fantasyStats: (league: LeagueId, date?: string) => ['pro', 'fantasy-stats', league, date ?? 'hoy'] as const,
    fantasyForm: (league: LeagueId, date?: string) => ['pro', 'fantasy-form', league, date ?? 'hoy'] as const,
    fan: (userId: string | null, league: LeagueId) => ['pro', 'fan', league, userId] as const,
    fantasySeason: (league: LeagueId, users?: string[]) => ['pro', 'fantasy-season', league, users?.length ? [...users].sort().join(',') : 'todos'] as const
};

// ---------------------------------------------------------------- liga

/** Posiciones con `pro` en cada fila (situaciones, esperado, línea de corte…); cada minuto con juegos en vivo */
export const useProStandings = (league: LeagueId, enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.standings(league),
        queryFn: ({ signal }) => proLigaApi.standings(league, signal),
        enabled,
        staleTime: MINUTE,
        refetchInterval: pollUnlessMissing<ProStandings>((data) => (data?.pro.live ? MINUTE : 10 * MINUTE)),
        ...calmOn404,
        retry
    });

/** Fechas y avance de la temporada de una liga («Regular · día 3 · Round Robin desde 18 dic») */
export const useProSeason = (league: LeagueId, enabled = true) =>
    useQuery({ queryKey: proLigaKeys.season(league), queryFn: ({ signal }) => proLigaApi.season(league, signal), enabled, staleTime: 30 * MINUTE, ...calmOn404, retry });

/** Las tres ligas a la vez (hoja de ligas: «Regular hasta 16 dic», «Empieza 1 feb 2027») */
export const useProSeasons = (enabled = true) =>
    useQuery({ queryKey: proLigaKeys.seasons(), queryFn: ({ signal }) => proLigaApi.seasons(signal), enabled, staleTime: 30 * MINUTE, ...calmOn404, retry });

/** Calendario de toda la temporada con carrera, cara a cara y forma (serie particular: filtrar `games` por los dos equipos) */
export const useProCalendar = (league: LeagueId, season?: number, enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.calendar(league, season),
        queryFn: ({ signal }) => proLigaApi.calendar(league, season, signal),
        enabled,
        staleTime: 2 * MINUTE,
        refetchInterval: pollUnlessMissing<SeasonCalendar>((data) => (data?.live ? MINUTE : data?.isPreviousSeason ? false : 5 * MINUTE)),
        placeholderData: (previous) => (previous?.league === league ? previous : undefined),
        ...calmOn404,
        retry
    });

/** Líderes de una fase (sin `phase`, la activa): top 10, sin ceros y con empates */
export const useProLeaders = (league: LeagueId, phase?: ProPhaseId, enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.leaders(league, phase),
        queryFn: ({ signal }) => proLigaApi.leaders(league, phase, signal),
        enabled,
        staleTime: 15 * MINUTE,
        placeholderData: (previous) => (previous?.league === league ? previous : undefined),
        ...calmOn404,
        retry
    });

/** Bateo y pitcheo por equipo, promedios de la liga y constante FIP (para OPS+, ERA+ y FIP con la constante de la liga) */
export const useProTeamStats = (league: LeagueId, phase?: ProPhaseId, season?: number, enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.teamStats(league, phase, season),
        queryFn: ({ signal }) => proLigaApi.teamStats(league, phase, season, signal),
        enabled,
        staleTime: 10 * MINUTE,
        ...calmOn404,
        retry
    });

/** Todos los peloteros de una fase con sus últimos 5 juegos (`last5`) */
export const useProPlayers = (league: LeagueId, season?: number, phase?: ProPhaseId, enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.players(league, season, phase),
        queryFn: ({ signal }) => proLigaApi.players(league, season, phase, signal),
        enabled,
        staleTime: 5 * MINUTE,
        placeholderData: (previous) => (previous?.league === league ? previous : undefined),
        ...calmOn404,
        retry
    });

/** Ficha PRO: splits, abanico, zonas, repertorio, fases, juego a juego completo, carrera, premios y movimientos */
export const useProPlayer = (id: number | null, league: LeagueId, season?: number, enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.player(id, league, season),
        queryFn: ({ signal }) => proLigaApi.player(id!, league, season, signal),
        enabled: enabled && !!id,
        staleTime: 5 * MINUTE,
        ...calmOn404,
        retry
    });

/** Movimientos de los equipos de la liga en los últimos `days` días (1-120) */
export const useProTransactions = (league: LeagueId, days = 30, enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.transactions(league, days),
        queryFn: ({ signal }) => proLigaApi.transactions(league, days, signal),
        enabled,
        staleTime: 30 * MINUTE,
        ...calmOn404,
        retry
    });

/** Campeones (desde 2006) y premios de la liga (desde 2007) según MLB */
export const useProHistory = (league: LeagueId, enabled = true) =>
    useQuery({ queryKey: proLigaKeys.history(league), queryFn: ({ signal }) => proLigaApi.history(league, signal), enabled, staleTime: 6 * 60 * MINUTE, ...calmOn404, retry });

// ---------------------------------------------------------------- fantasy

/** Cuándo volver a pedir lo de todos: al próximo cierre de un juego (ahí salen sus %), cada minuto mientras haya juegos */
export const fantasyStatsInterval = (stats: FantasyDayStats | undefined, now = Date.now()): number | false => {
    if (!stats || stats.final) return false;
    const untilLock = stats.nextLockAt ? Math.max(5 * SECOND, stats.nextLockAt - now + 5 * SECOND) : Infinity;
    return Math.min(MINUTE, untilLock);
};

/** % de fanáticos por pelotero, capitán y pronóstico (solo de juegos cerrados) y la distribución de puntos del día */
export const useFantasyStats = (league: LeagueId, date?: string, enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.fantasyStats(league, date),
        queryFn: ({ signal }) => proLigaApi.fantasyStats(league, date, signal),
        enabled,
        staleTime: 30 * SECOND,
        refetchInterval: pollUnlessMissing<FantasyDayStats>((data) => fantasyStatsInterval(data)),
        ...calmOn404,
        retry
    });

/** Puntos de los últimos 5 juegos de cada pelotero del día (minibarras del selector) */
export const useFantasyForm = (league: LeagueId, date?: string, enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.fantasyForm(league, date),
        queryFn: ({ signal }) => proLigaApi.fantasyForm(league, date, signal),
        enabled,
        staleTime: 30 * MINUTE,
        refetchInterval: pollUnlessMissing<FantasyForm>((data) => (data?.partial ? 30 * SECOND : false)),
        ...calmOn404,
        retry
    });

/** Perfil de un fanático con `pro`: pronósticos y capitán acertados, peloteros más usados y su línea de la temporada */
export const useFanPro = (userId: string | null, league: LeagueId, enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.fan(userId, league),
        queryFn: ({ signal }) => proLigaApi.fan(userId!, league, signal),
        enabled: enabled && !!userId,
        staleTime: MINUTE,
        ...calmOn404,
        retry
    });

/** Tabla de la temporada con el puesto anterior (flechas) y el promedio de la liga por día; `users` para una liga privada */
export const useFantasySeasonPro = (league: LeagueId, users?: string[], enabled = true) =>
    useQuery({
        queryKey: proLigaKeys.fantasySeason(league, users),
        queryFn: ({ signal }) => proLigaApi.fantasySeason(league, users, signal),
        enabled: enabled && (!users || users.length > 0),
        staleTime: MINUTE,
        refetchInterval: pollUnlessMissing<SeasonRankingPro>((data) => (data?.partial ? 30 * SECOND : 5 * MINUTE)),
        ...calmOn404,
        retry
    });

// ---------------------------------------------------------------- ayudas para las pantallas

/** Juegos de la temporada entre dos equipos (serie particular), del más viejo al más nuevo */
export const seriesBetween = (calendar: SeasonCalendar | null | undefined, a: number, b: number, phase?: ProPhaseId) =>
    (calendar?.games ?? []).filter(
        (game) => (!phase || game.phase === phase) && ((game.away.id === a && game.home.id === b) || (game.away.id === b && game.home.id === a))
    );

/** Juegos sobre .500 de un equipo al cierre de cada fecha de la carrera */
export const overFiveHundred = (calendar: SeasonCalendar | null | undefined, teamId: number, phase: ProPhaseId = 'regular') => {
    const line = calendar?.race[phase]?.teams[teamId];
    return line ? line.w.map((wins, index) => wins - line.l[index]) : [];
};
