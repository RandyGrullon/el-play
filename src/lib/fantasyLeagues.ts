// Ligas 2.0 (Fantasy v3): la tabla por semana de una liga privada (/api/v2/fantasy/weeks, lunes a domingo en hora de
// RD, el campeón solo cuando la semana terminó) y las herramientas del dueño (renombrar, sacar a alguien, borrar), que
// son funciones de Supabase (supabase/2026-11-11-ligas.sql). Si el servidor o la base todavía no las tienen, no salen.
import { useQuery } from '@tanstack/react-query';
import type { LeagueId } from '../types';
import { AccountError, rest } from './account';
import { getJson, isFanId, retry } from './fans';

export interface WeekRow {
    userId: string;
    total: number;
    days: number;
    rank: number;
}

export interface LeagueWeek {
    /** Lunes y domingo (YYYY-MM-DD) */
    start: string;
    end: string;
    rows: WeekRow[];
    /** userId del campeón; null mientras la semana no termine (o si nadie jugó) */
    champion: string | null;
}

export interface LeagueWeeks {
    weeks: LeagueWeek[];
}

// Cuentas que se pueden pedir de una vez
const MAX_USERS = 100;

/** Las ids de la liga ordenadas (la misma liga es la misma dirección y la misma copia en el CDN) */
export const memberIds = (members: string[]) => [...new Set(members.filter(isFanId).map((id) => id.toLowerCase()))].sort().slice(0, MAX_USERS);

const cleanWeeks = (data: Partial<LeagueWeeks> | null | undefined): LeagueWeeks => ({
    weeks: (Array.isArray(data?.weeks) ? data!.weeks : [])
        .filter((week) => week && typeof week.start === 'string' && typeof week.end === 'string')
        .map((week) => ({
            start: week.start,
            end: week.end,
            champion: typeof week.champion === 'string' ? week.champion : null,
            rows: (Array.isArray(week.rows) ? week.rows : [])
                .filter((row) => row && typeof row.userId === 'string')
                .map((row) => ({ userId: row.userId, total: Number(row.total) || 0, days: Number(row.days) || 0, rank: Number(row.rank) || 0 }))
                .sort((a, b) => a.rank - b.rank || b.total - a.total)
        }))
});

/** Las semanas de la liga, de la más nueva a la más vieja (la de ahora y las 3 anteriores) */
export const sortWeeks = (weeks: LeagueWeek[]) => [...weeks].sort((a, b) => b.start.localeCompare(a.start));

export const useLeagueWeeks = (league: LeagueId, members: string[] | undefined, enabled = true, demo = false) => {
    const ids = members ? memberIds(members).join(',') : '';
    return useQuery({
        queryKey: ['fantasy-weeks', league, demo ? 'demo' : ids],
        queryFn: async ({ signal }) =>
            cleanWeeks(demo ? (await import('./fantasyDemoData')).demoWeeks(members ?? []) : await getJson<LeagueWeeks>(`/api/v2/fantasy/weeks?league=${league}&users=${ids}`, signal)),
        enabled: enabled && (demo || ids !== ''),
        staleTime: 5 * 60000,
        retry
    });
};

/** «Esta semana», «La semana pasada», «Hace 2 semanas» (índice en la lista de la más nueva a la más vieja) */
export const weekName = (index: number, t: (key: string, options?: Record<string, unknown>) => string) =>
    index === 0 ? t('fantasyLeagues.thisWeek') : index === 1 ? t('fantasyLeagues.lastWeek') : t('fantasyLeagues.weeksAgo', { count: index });

/** El campeón de la semana pasada (la más nueva que ya tiene campeón) */
export const lastChampion = (weeks: LeagueWeek[]) => {
    const week = sortWeeks(weeks).find((item) => item.champion);
    if (!week) return null;
    const row = week.rows.find((item) => item.userId === week.champion);
    return { week, userId: week.champion!, total: row?.total ?? 0 };
};

// ---------------------------------------------------------------- herramientas del dueño

/** Supabase dijo que las funciones no existen (PGRST202, 404): no se vuelven a ofrecer en esta sesión */
let missing = false;
let probe: Promise<boolean> | null = null;

const isMissing = (error: unknown) => error instanceof AccountError && error.code === 'unknown' && error.message === '404';

/**
 * ¿La base ya tiene las funciones del dueño? Se pregunta una vez con un código que no existe (no cambia nada): si la
 * función no está, PostgREST responde 404; si está, responde lo suyo (sin error o con el de «no eres el dueño»).
 */
export const ownerToolsAvailable = (): Promise<boolean> => {
    if (missing) return Promise.resolve(false);
    probe ||= rest('rpc/rename_league', { method: 'POST', body: JSON.stringify({ p_code: '', p_name: '' }) })
        .then(() => true)
        .catch((error) => {
            if (isMissing(error)) {
                missing = true;
                return false;
            }
            // Sin red no se sabe: se vuelve a preguntar la próxima vez
            if (error instanceof AccountError && error.code === 'network') probe = null;
            return error instanceof AccountError && error.code !== 'network' && error.code !== 'disabled';
        });
    return probe;
};

export const useOwnerTools = (enabled: boolean) =>
    useQuery({
        queryKey: ['fantasy-owner-tools'],
        queryFn: ownerToolsAvailable,
        enabled,
        staleTime: Infinity,
        retry: false
    });

/** Si al usarla Supabase dice que no existe, se esconden las herramientas */
const call = async (fn: string, body: Record<string, unknown>) => {
    try {
        await rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });
    } catch (error) {
        if (isMissing(error)) missing = true;
        throw error;
    }
};

export const LEAGUE_NAME_MAX = 40;
export const cleanLeagueName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, LEAGUE_NAME_MAX);

export const renameLeague = (code: string, name: string) => call('rename_league', { p_code: code, p_name: cleanLeagueName(name) });
export const removeMember = (code: string, userId: string) => call('remove_member', { p_code: code, p_user: userId });
export const deleteLeague = (code: string) => call('delete_league', { p_code: code });

/** Borrar pide escribir el nombre tal cual (sin importar mayúsculas ni espacios de más) */
export const confirmsName = (typed: string, name: string) => cleanLeagueName(typed).toLocaleLowerCase() === cleanLeagueName(name).toLocaleLowerCase() && cleanLeagueName(name) !== '';

/** Solo para las pruebas */
export const resetOwnerTools = () => {
    missing = false;
    probe = null;
};
