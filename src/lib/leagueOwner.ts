// Ligas 2.0 (igual que la web, src/lib/fantasyLeagues.ts): el dueño de una liga privada la renombra, saca a alguien o
// la borra con las funciones de supabase/2026-11-11-ligas.sql (cada una revisa en la base que quien llama es el dueño).
// Si la base todavía no las tiene (PGRST202: 404), las herramientas no salen.
import { useQuery } from '@tanstack/react-query';
import { AccountError, accountEnabled, rest } from './account';

/** Supabase dijo que las funciones no existen: no se vuelven a ofrecer mientras la app esté abierta */
let missing = false;
let probe: Promise<boolean> | null = null;

const isMissing = (error: unknown) => error instanceof AccountError && error.code === 'unknown' && error.message === '404';

/**
 * ¿La base ya tiene las funciones del dueño? Se pregunta una vez con un código vacío (no cambia nada): si la función no
 * está, PostgREST responde 404; si está, responde lo suyo (sin error o con «liga no encontrada»).
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

export const OWNER_TOOLS_KEY = ['fantasy-owner-tools'] as const;

/** Las herramientas del dueño están en la base (solo se pregunta si eres dueño de la liga) */
export const useOwnerTools = (enabled: boolean) => useQuery({ queryKey: OWNER_TOOLS_KEY, queryFn: ownerToolsAvailable, enabled: enabled && accountEnabled(), staleTime: Infinity, retry: false });

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
