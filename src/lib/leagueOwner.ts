// Ligas 2.0 (igual que la web): el dueño de una liga privada la renombra, saca a alguien o la borra con las funciones
// de supabase/2026-11-11-ligas.sql (cada una revisa en la base que quien llama es el dueño). Si la base todavía no las
// tiene (PGRST202: 404), las herramientas no salen.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountError, accountEnabled, rest } from './account';

const missing = (error: unknown) => error instanceof AccountError && error.message === '404';

/**
 * ¿Existen las funciones? Se pregunta con GET (PostgREST lo corre en una transacción de solo lectura: no cambia nada) a
 * rename_league con un código que no existe: 404 es que no está; cualquier otra respuesta, que sí.
 */
const probe = async () => {
    try {
        await rest('rpc/rename_league?p_code=_&p_name=_');
        return true;
    } catch (error) {
        if (missing(error)) return false;
        // Sin red no se sabe: se esconde y se vuelve a preguntar
        if (error instanceof AccountError && error.code === 'network') throw error;
        return true;
    }
};

const KEY = ['fantasy-league-owner-tools'] as const;

/** Las herramientas del dueño están en la base (solo se pregunta si eres dueño de alguna liga) */
export const useOwnerTools = (owner: boolean) => {
    const query = useQuery({ queryKey: KEY, queryFn: probe, enabled: owner && accountEnabled(), staleTime: 30 * 60000, retry: 1 });
    return owner && query.data === true;
};

/** Si una llamada dice que la función no existe, se esconden las herramientas */
export const useOwnerToolsMissing = () => {
    const client = useQueryClient();
    return (error: unknown) => {
        if (missing(error)) client.setQueryData(KEY, false);
    };
};

export const renameLeague = (code: string, name: string) => rest('rpc/rename_league', { method: 'POST', body: JSON.stringify({ p_code: code, p_name: name.trim().slice(0, 40) }) });

export const removeMember = (code: string, userId: string) => rest('rpc/remove_member', { method: 'POST', body: JSON.stringify({ p_code: code, p_user: userId }) });

export const deleteLeague = (code: string) => rest('rpc/delete_league', { method: 'POST', body: JSON.stringify({ p_code: code }) });

/** Para borrar hay que escribir el nombre tal cual (sin importar mayúsculas ni espacios de más) */
export const deleteConfirmed = (typed: string, name: string) => typed.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === name.trim().replace(/\s+/g, ' ').toLocaleLowerCase() && name.trim() !== '';
