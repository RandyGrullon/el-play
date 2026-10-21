// Fantasy PRO (parte «Fantasy y fanáticos»): datos que la web tiene en el-play/src/lib/pro/fantasy.ts y que la app
// no tenía. Los equipos del día y las ligas se leen de Supabase como en el Lite (dayEntries, myLeagues); los números
// para escoger salen de /api/v2/players (la temporada en curso o, al empezar, la anterior).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onlineManager, useQuery } from '@tanstack/react-query';
import type { LeagueId } from '../../../types';
import { AccountError, dayEntries, rest, syncFantasy } from '../../../lib/account';
import type { DayEntry } from '../../../lib/fantasy';
import { isPermanent, isRouteMissing } from '../../../lib/pro/http';
import { useFanPro, useFantasySeasonPro } from '../../../lib/pro/liga';
import { usePlayers, type PlayerRow } from '../../../lib/stats';
import type { FanProfilePro, SeasonRankingPro } from '../../../types/pro-liga';
import { useFanProfile, useSeasonRanking } from '../../fantasy/fans';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

// ---------------------------------------------------------------- equipos de todos en un día

/** Equipos de todos en un día (o de una liga privada), directo de Supabase como la tabla del Lite */
export const useDayRivals = (league: LeagueId, date: string | undefined, members: string[] | undefined, live: boolean, enabled = true) =>
    useQuery({
        queryKey: ['pro', 'fantasy-day-rivals', league, date ?? '', members ? [...members].sort().join(',') : 'todos'],
        queryFn: () => dayEntries(league, date!, members),
        enabled: enabled && !!date && (!members || members.length > 0),
        staleTime: 30 * SECOND,
        refetchInterval: live ? 30 * SECOND : false,
        retry: 1
    });

// ---------------------------------------------------------------- números de la temporada para escoger

/** Con menos de estos juegos por equipo se escoge con los números de la temporada anterior */
export const SCOUT_MIN_GAMES = 5;

/** Juegos por equipo en la temporada: el pelotero que más ha jugado */
export const teamGamesOf = (rows: Pick<PlayerRow, 'g'>[]) => rows.reduce((max, row) => Math.max(max, row.g || 0), 0);

export interface ScoutSeason {
    rows: Map<number, PlayerRow>;
    season: number | null;
    currentSeason: number | null;
    previous: boolean;
    teamGames: number;
    isPending: boolean;
    isError: boolean;
}

/**
 * Números para escoger: los de la temporada en curso o, si todavía lleva menos de 5 juegos por equipo, los de la
 * anterior (y se avisa). Sin datos de un pelotero, su promedio es null (nunca se inventa).
 */
export const useScoutSeason = (league: LeagueId): ScoutSeason => {
    const current = usePlayers(league);
    const teamGames = teamGamesOf(current.data?.players ?? []);
    const useBefore = !!current.data && !current.data.isPreviousSeason && teamGames < SCOUT_MIN_GAMES;
    // Sin temporada anterior es la misma consulta de la actual (no pide nada más)
    const before = usePlayers(league, useBefore ? current.data!.season - 1 : undefined);
    const source = useBefore ? before : current;
    const rows = useMemo(() => new Map((source.data?.players ?? []).map((row) => [row.id, row])), [source.data]);
    return {
        rows,
        season: source.data?.season ?? null,
        currentSeason: current.data?.season ?? null,
        previous: useBefore || !!current.data?.isPreviousSeason,
        teamGames,
        isPending: current.isPending || (useBefore && before.isPending),
        isError: source.isError
    };
};

// ---------------------------------------------------------------- guardado en la cuenta

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'pending' | 'closed' | 'empty';

const SAVE_CHECK_MS = 2500;
const SAVE_RETRY_MS = 15000;
const SAVE_TRIES = 4;

/**
 * Si lo de este teléfono ya está en la cuenta: después de cada cambio se lee de vuelta la hora guardada en Supabase.
 * Sin red queda «se sube al volver la conexión» y, al volver (NetInfo, por el onlineManager de React Query), se
 * sincroniza y se mira otra vez. Los días pasados ya no se pueden cambiar (la base solo acepta de hoy en adelante).
 */
export const useSaveStatus = (league: LeagueId, date: string | undefined, entry: Pick<DayEntry, 'savedAt'>, userId: string | null | undefined, today: string | null): SaveStatus => {
    const savedAt = entry.savedAt;
    const closed = !!date && !!today && date < today;
    const key = `${league}:${date ?? ''}:${savedAt}:${userId ?? ''}`;
    // Lo que se averiguó para esta versión del equipo (al cambiar el equipo vuelve a «guardando»)
    const [checked, setChecked] = useState<{ key: string; status: SaveStatus } | null>(null);
    const tries = useRef(0);

    const check = useCallback(async () => {
        if (!userId || !date || !savedAt) return;
        if (!onlineManager.isOnline()) {
            setChecked({ key, status: 'offline' });
            return;
        }
        try {
            const rows = await rest<{ saved_at: number }[]>(`fantasy_entries?user_id=eq.${userId}&league=eq.${encodeURIComponent(league)}&day=eq.${date}&select=saved_at&limit=1`);
            if (Number(rows?.[0]?.saved_at ?? 0) >= savedAt) {
                setChecked({ key, status: 'saved' });
                return;
            }
            setChecked({ key, status: 'pending' });
        } catch (error) {
            setChecked({ key, status: error instanceof AccountError && error.code === 'network' ? 'offline' : 'pending' });
        }
        tries.current += 1;
    }, [league, date, savedAt, userId, key]);

    useEffect(() => {
        tries.current = 0;
        if (closed || !savedAt || !userId) return;
        let timer = setTimeout(function again() {
            check().then(() => {
                if (tries.current > 0 && tries.current < SAVE_TRIES) timer = setTimeout(again, SAVE_RETRY_MS);
            });
        }, SAVE_CHECK_MS);
        return () => clearTimeout(timer);
    }, [closed, savedAt, userId, check]);

    // Volvió la conexión: se sube lo pendiente y se mira otra vez; se fue: «se sube al volver la conexión»
    useEffect(() => {
        if (closed || !savedAt || !userId) return;
        return onlineManager.subscribe((online) => {
            if (!online) {
                setChecked({ key, status: 'offline' });
                return;
            }
            setChecked({ key, status: 'saving' });
            syncFantasy()
                .catch(() => undefined)
                .then(() => check());
        });
    }, [closed, savedAt, userId, check, key]);

    if (closed) return 'closed';
    if (!savedAt || !userId) return 'empty';
    return checked?.key === key ? checked.status : 'saving';
};

// ---------------------------------------------------------------- ligas privadas (Supabase)

export interface LeagueMember {
    userId: string;
    name: string | null;
    joinedAt: string | null;
}

export interface LeagueInfo {
    id: string;
    name: string;
    code: string;
    owner: string | null;
    createdAt: string | null;
    members: LeagueMember[];
}

interface LeagueRow {
    league: { id: string; name: string; code: string; owner: string | null; created_at: string | null; league_members: { user_id: string; joined_at: string | null }[] } | null;
}

/** Mis ligas con sus miembros (y sus nombres), quién la creó y cuándo */
export const fetchLeaguesPro = async (userId: string): Promise<LeagueInfo[]> => {
    const rows = await rest<LeagueRow[]>(`league_members?user_id=eq.${userId}&select=league:leagues(id,name,code,owner,created_at,league_members(user_id,joined_at))`);
    const leagues = (rows || []).map((row) => row.league).filter((league): league is NonNullable<LeagueRow['league']> => !!league);
    const ids = [...new Set(leagues.flatMap((league) => league.league_members.map((member) => member.user_id)))];
    const names = new Map<string, string | null>();
    for (let index = 0; index < ids.length; index += 100) {
        const chunk = ids.slice(index, index + 100);
        const profiles = await rest<{ id: string; display_name: string | null }[]>(`profiles?id=in.(${chunk.join(',')})&select=id,display_name`).catch(() => []);
        for (const profile of profiles || []) names.set(profile.id, profile.display_name);
    }
    return leagues.map((league) => ({
        id: league.id,
        name: league.name,
        code: league.code,
        owner: league.owner,
        createdAt: league.created_at,
        members: league.league_members
            .map((member) => ({ userId: member.user_id, name: names.get(member.user_id) ?? null, joinedAt: member.joined_at }))
            .sort((a, b) => String(a.joinedAt ?? '').localeCompare(String(b.joinedAt ?? '')))
    }));
};

export const leaguesKey = (userId: string | null | undefined) => ['pro', 'fantasy-leagues', userId ?? ''] as const;

export const useLeaguesPro = (userId: string | null | undefined, enabled = true) =>
    useQuery({
        queryKey: leaguesKey(userId),
        queryFn: () => fetchLeaguesPro(userId!),
        enabled: enabled && !!userId,
        staleTime: MINUTE,
        retry: 1
    });

/** Salir de una liga (la base deja borrar solo la fila propia) */
export const leaveLeague = (leagueId: string, userId: string) => rest(`league_members?league_id=eq.${leagueId}&user_id=eq.${userId}`, { method: 'DELETE' });

// ---------------------------------------------------------------- tabla de la temporada (PRO o, sin la ruta, la del Lite)

/**
 * Tabla de la temporada: la PRO (/api/v2/pro/fantasy/season, con flechas y el promedio de la liga) o, si esa ruta no
 * existe todavía (producción), la del Lite (/api/v2/fantasy/season) con los puestos calculados aquí y sin flechas.
 */
export const useSeasonTable = (league: LeagueId, users?: string[], enabled = true) => {
    const proQuery = useFantasySeasonPro(league, users, enabled);
    const missing = !proQuery.data && isPermanent(proQuery.error);
    const lite = useSeasonRanking(league, enabled && missing);
    const data = useMemo<SeasonRankingPro | undefined>(() => {
        if (proQuery.data) return proQuery.data;
        if (!missing || !lite.data) return undefined;
        const rows = (users ? lite.data.ranking.filter((row) => users.includes(row.userId)) : lite.data.ranking).slice().sort((a, b) => b.points - a.points);
        let rank = 0;
        const ranking = rows.map((row, index) => {
            if (index === 0 || row.points !== rows[index - 1].points) rank = index + 1;
            return { ...row, rank, prevRank: null, lastDay: null };
        });
        return { league, season: lite.data.season, ranking, partial: lite.data.partial, updatedAt: lite.data.updatedAt, total: ranking.length, lastDate: null, daily: [] };
    }, [proQuery.data, missing, lite.data, users, league]);
    const source = missing ? lite : proQuery;
    return { data, pro: !!proQuery.data, isPending: !data && (proQuery.isPending || (missing && lite.isPending)), isError: !data && source.isError, error: source.error, fetchStatus: source.fetchStatus, refetch: () => source.refetch() };
};

/**
 * Perfil de un fanático: el PRO (/api/v2/pro/fantasy/fan/:id, con `pro`) o, si la ruta no existe todavía, el del Lite
 * (/api/v2/fantasy/fan/:id) sin `pro` (los bloques que lo necesitan no salen).
 */
export const useFanProfilePro = (userId: string | null, league: LeagueId, enabled = true) => {
    const proQuery = useFanPro(userId, league, enabled);
    const missing = !proQuery.data && isRouteMissing(proQuery.error);
    const lite = useFanProfile(enabled && missing ? userId : null, league);
    const data: (Omit<FanProfilePro, 'pro'> & { pro?: FanProfilePro['pro'] }) | undefined = proQuery.data ?? (missing ? lite.data : undefined);
    const source = missing ? lite : proQuery;
    return { data, pro: !!proQuery.data, isPending: !data && (proQuery.isPending || (missing && lite.isPending)), isError: !data && source.isError, error: source.error, fetchStatus: source.fetchStatus, refetch: () => source.refetch() };
};

/** Serie de puntos por día de un perfil (la PRO o, sin ella, la de sus días terminados) */
export const seriesOf = (profile: { days: { date: string; final: boolean; total: number }[]; pro?: { series: { date: string; total: number }[] } } | undefined) =>
    profile?.pro?.series ??
    (profile?.days ?? [])
        .filter((day) => day.final)
        .map((day) => ({ date: day.date, total: day.total }))
        .sort((a, b) => a.date.localeCompare(b.date));
