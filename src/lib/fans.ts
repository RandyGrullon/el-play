// Fanáticos del Fantasy: la tabla de la temporada, el perfil de cada cuenta (sus días y su equipo) y el buscador por nombre.
// La temporada y los perfiles los calcula el servidor (/api/v2/fantasy/season y /fan/:id) con las mismas cuentas del cliente;
// el buscador y el equipo de un día se leen directo de Supabase (los perfiles y los equipos son públicos).
import { useQuery } from '@tanstack/react-query';
import type { LeagueId } from '../types';
import { ApiError } from './api';
import { AccountError, rest } from './account';
import type { DayEntry, EntryHistory } from './fantasy';

export interface FanDay {
    date: string;
    final: boolean;
    live: boolean;
    team: number;
    picks: number;
    total: number;
    lineup: number[];
    captain: number | null;
    picksMade: number;
}

export interface FanProfileData {
    userId: string;
    league: LeagueId;
    name: string | null;
    season: { points: number; days: number; best: { date: string; points: number } | null };
    /** Del más reciente al más viejo (hoy incluido) */
    days: FanDay[];
}

export interface SeasonRow {
    userId: string;
    name: string | null;
    points: number;
    days: number;
    /** Puesto en la tabla general (solo cuando se piden cuentas con `users`) */
    rank?: number;
    /** Puntos de los últimos 7 días (el campeón de la semana de una liga) */
    week?: number;
    /** Días de juego seguidos que jugó, hasta hoy */
    streak?: number;
    best?: { date: string; points: number } | null;
}

export interface SeasonRanking {
    league: LeagueId;
    season: number;
    /** De mayor a menor, máximo 200 (con `users`, solo esas cuentas) */
    ranking: SeasonRow[];
    /** El servidor se cortó por tiempo: faltan días por contar */
    partial: boolean;
    updatedAt: string;
}

export interface FanResult {
    id: string;
    name: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isFanId = (value: string | null | undefined): value is string => !!value && UUID.test(value);

// ---------------------------------------------------------------- servidor

const getJson = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const response = await fetch(path, { signal, headers: { Accept: 'application/json' } }).catch((error: Error) => {
        if (error.name === 'AbortError') throw error;
        throw new ApiError(error.message, typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'network');
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ApiError(`HTTP ${response.status}`, typeof body.error === 'string' ? body.error : 'internal_error', response.status);
    }
    return (await response.json()) as T;
};

// Un perfil que no existe o las cuentas apagadas no se arreglan reintentando
const retry = (failureCount: number, error: Error) => !(error instanceof ApiError && [400, 404, 503].includes(error.status)) && failureCount < 2;

/** % de elección del día (solo de los juegos que ya empezaron), como el «% drafted» de los fantasy */
export interface FantasyOwners {
    league: LeagueId;
    date: string;
    teams: number;
    players: { id: number; pct: number; captainPct: number }[];
    /** gamePk → teamId → % de los pronósticos */
    picks: Record<string, Record<string, number>>;
}

export const useFantasyOwners = (league: LeagueId, date: string | undefined, enabled: boolean) =>
    useQuery({
        queryKey: ['fantasy-owners', league, date],
        queryFn: ({ signal }) => getJson<FantasyOwners>(`/api/v2/fantasy/owners?league=${league}&date=${date}`, signal),
        enabled: enabled && !!date,
        staleTime: 60000,
        refetchInterval: enabled ? 60000 : false,
        retry: 1
    });

export const useFanProfile = (userId: string | null, league: LeagueId) =>
    useQuery({
        queryKey: ['fantasy-fan', league, userId],
        queryFn: ({ signal }) => getJson<FanProfileData>(`/api/v2/fantasy/fan/${encodeURIComponent(userId!)}?league=${league}`, signal),
        enabled: isFanId(userId),
        staleTime: 60000,
        // Con juegos en vivo los puntos de hoy se mueven
        refetchInterval: (query) => (query.state.data?.days.some((day) => day.live) ? 60000 : false),
        retry
    });

/** Tamaño de la tabla de la temporada: quien no sale en ella puede tener puntos igual */
export const SEASON_TOP = 200;
// Cuentas que se pueden pedir de una vez con `users`
const MAX_USERS = 100;

/**
 * Tabla de la temporada. Con `users` (los miembros de una liga privada, o una sola cuenta) trae esas cuentas aunque
 * no entren en el top 200, cada una con su puesto general.
 */
export const useSeasonRanking = (league: LeagueId, users?: string[], enabled = true) => {
    // Ordenadas para que la misma liga sea la misma dirección (y la misma copia en el CDN)
    const ids = users ? [...new Set(users.filter(isFanId).map((id) => id.toLowerCase()))].sort().slice(0, MAX_USERS).join(',') : null;
    return useQuery({
        queryKey: ['fantasy-season', league, ids ?? 'all'],
        queryFn: ({ signal }) => getJson<SeasonRanking>(`/api/v2/fantasy/season?league=${league}${ids ? `&users=${ids}` : ''}`, signal),
        enabled: enabled && ids !== '',
        staleTime: 5 * 60000,
        // Si se cortó por tiempo, en un rato está completa
        refetchInterval: (query) => (query.state.data?.partial ? 60000 : false),
        retry
    });
};

/** Puestos con empates (dos con los mismos puntos comparten el puesto) */
export const withRanks = <T extends { points: number }>(rows: T[]) => {
    let rank = 0;
    return rows.map((row, index) => {
        if (index === 0 || row.points !== rows[index - 1].points) rank = index + 1;
        return { ...row, rank };
    });
};

// ---------------------------------------------------------------- Supabase

// Los errores de Supabase con la forma de los del servidor: sin red es «sin conexión»; lo demás, «no pudimos cargar los fanáticos»
const fromSupabase = async <T>(request: Promise<T>): Promise<T> => {
    try {
        return await request;
    } catch (error) {
        if (error instanceof AccountError && error.code === 'network') throw new ApiError(error.message, typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'network');
        throw new ApiError(error instanceof Error ? error.message : String(error), 'accounts_unavailable');
    }
};

/**
 * Texto para `display_name=ilike.*…*`. En un filtro simple PostgREST toma el valor tal cual (las comas, paréntesis
 * y comillas no se interpretan); en el patrón de LIKE `%` y `_` son comodines y `\` escapa, y PostgREST cambia
 * todo `*` por `%`. Por eso se escapan `\ % _` y el `*` pasa a `_` (cualquier letra: así encuentra un asterisco).
 */
export const likePattern = (text: string) =>
    text
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[\\%_]/g, (char) => `\\${char}`)
        .replace(/\*/g, '_');

export const MIN_SEARCH = 2;
export const cleanSearch = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 30);

/** Fanáticos por nombre (sin importar mayúsculas), máximo 20 */
export const searchFans = async (q: string): Promise<FanResult[]> => {
    const clean = cleanSearch(q);
    if (Array.from(clean).length < MIN_SEARCH) return [];
    const pattern = encodeURIComponent(`*${likePattern(clean)}*`);
    const rows = await fromSupabase(rest<{ id: string; display_name: string | null }[]>(`profiles?select=id,display_name&display_name=ilike.${pattern}&order=display_name.asc&limit=20`));
    return (rows || []).map((row) => ({ id: row.id, name: row.display_name }));
};

export const useFanSearch = (q: string) => {
    const clean = cleanSearch(q);
    return useQuery({
        queryKey: ['fantasy-fan-search', clean.toLowerCase()],
        queryFn: () => searchFans(clean),
        enabled: Array.from(clean).length >= MIN_SEARCH,
        staleTime: 30000,
        retry: 1
    });
};

/** Lo que armó una cuenta un día (equipo, capitán y pronósticos), directo de Supabase */
export const fanEntry = async (userId: string, league: LeagueId, day: string): Promise<DayEntry | null> => {
    if (!isFanId(userId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const rows = await fromSupabase(
        rest<{ lineup: number[] | null; captain: number | null; picks: Record<string, number> | null; saved_at: number; history?: EntryHistory | null }[]>(
            // select=* trae el historial antitrampa si la base ya lo tiene
            `fantasy_entries?user_id=eq.${userId}&league=eq.${encodeURIComponent(league)}&day=eq.${day}&select=*&limit=1`
        )
    );
    const row = rows?.[0];
    return row ? { lineup: row.lineup || [], captain: row.captain, picks: row.picks || {}, savedAt: row.saved_at, history: row.history ?? null } : null;
};

export const useFanEntry = (userId: string, league: LeagueId, day: string | undefined, enabled = true) =>
    useQuery({
        queryKey: ['fantasy-fan-entry', league, userId, day],
        queryFn: () => fanEntry(userId, league, day!),
        enabled: enabled && !!day,
        staleTime: 30000,
        retry: 1
    });
