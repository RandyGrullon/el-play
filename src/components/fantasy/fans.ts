// Fanáticos del Fantasy (igual que el-play/src/lib/fans.ts): la tabla de la temporada, el perfil de cada cuenta
// y el buscador por nombre. La temporada y los perfiles los calcula el servidor (/api/v2/fantasy/season y /fan/:id);
// el buscador y el equipo de un día se leen directo de Supabase (los perfiles y los equipos son públicos).
import { useQuery } from '@tanstack/react-query';
import type { LeagueId } from '../../types';
import { ApiError, networkErrorCode } from '../../lib/api';
import { API_BASE } from '../../lib/config';
import type { DayEntry, EntryHistory } from '../../lib/fantasy';
import { sbRest } from '../account/supabase';

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
    /** Del más reciente al más viejo (hoy incluido), máximo 40 */
    days: FanDay[];
}

export interface SeasonRow {
    userId: string;
    name: string | null;
    points: number;
    days: number;
}

export interface SeasonRanking {
    league: LeagueId;
    season: number;
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
    const response = await fetch(`${API_BASE}${path}`, { signal, headers: { Accept: 'application/json' } }).catch(async (error: Error) => {
        if (error.name === 'AbortError') throw error;
        // navigator.onLine no existe en el teléfono: el estado real lo da NetInfo
        throw new ApiError(error.message, await networkErrorCode());
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
        retry
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

/** `enabled` solo lo usa el PRO (respaldo si su ruta no existe); el Lite la monta siempre */
export const useSeasonRanking = (league: LeagueId, enabled = true) =>
    useQuery({
        queryKey: ['fantasy-season', league],
        queryFn: ({ signal }) => getJson<SeasonRanking>(`/api/v2/fantasy/season?league=${league}`, signal),
        enabled,
        staleTime: 5 * 60000,
        // Si se cortó por tiempo, en un rato está completa
        refetchInterval: (query) => (query.state.data?.partial ? 60000 : false),
        retry
    });

/** Puestos con empates (dos con los mismos puntos comparten el puesto) */
export const withRanks = <T extends { points: number }>(rows: T[]) => {
    let rank = 0;
    return rows.map((row, index) => {
        if (index === 0 || row.points !== rows[index - 1].points) rank = index + 1;
        return { ...row, rank };
    });
};

// ---------------------------------------------------------------- Supabase

/**
 * Texto para `display_name=ilike.*…*`: en el patrón de LIKE `%` y `_` son comodines y `\` escapa, y PostgREST cambia
 * todo `*` por `%`. Se escapan `\ % _`; el `*`, las comas, los paréntesis y las comillas pasan a `_` (cualquier
 * letra): así no rompen el filtro y el nombre que los lleva igual aparece.
 */
export const likePattern = (text: string) =>
    text
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[\\%_]/g, (char) => `\\${char}`)
        .replace(/[*,()"']/g, '_');

export const MIN_SEARCH = 2;
export const cleanSearch = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 30);
export const longEnough = (text: string) => Array.from(cleanSearch(text)).length >= MIN_SEARCH;

/** Fanáticos por nombre (sin importar mayúsculas), máximo 20 */
export const searchFans = async (q: string): Promise<FanResult[]> => {
    const clean = cleanSearch(q);
    if (!longEnough(clean)) return [];
    const pattern = encodeURIComponent(`*${likePattern(clean)}*`);
    const rows = await sbRest<{ id: string; display_name: string | null }[]>(`profiles?select=id,display_name&display_name=ilike.${pattern}&order=display_name.asc&limit=20`);
    return (rows || []).map((row) => ({ id: row.id, name: row.display_name }));
};

export const useFanSearch = (q: string) => {
    const clean = cleanSearch(q);
    return useQuery({
        queryKey: ['fantasy-fan-search', clean.toLowerCase()],
        queryFn: () => searchFans(clean),
        enabled: longEnough(clean),
        staleTime: 30000,
        retry: 1
    });
};

/** Lo que armó una cuenta un día (equipo, capitán y pronósticos), directo de Supabase */
export const fanEntry = async (userId: string, league: LeagueId, day: string): Promise<DayEntry | null> => {
    if (!isFanId(userId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const rows = await sbRest<{ lineup: number[] | null; captain: number | null; picks: Record<string, number> | null; saved_at: number; history?: EntryHistory | null }[]>(
        // select=* trae el historial antitrampa si la base ya lo tiene
        `fantasy_entries?user_id=eq.${userId}&league=eq.${encodeURIComponent(league)}&day=eq.${day}&select=*&limit=1`
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
