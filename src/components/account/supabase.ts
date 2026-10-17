// Supabase para lo nuevo del Fantasy (fanáticos): PostgREST con la sesión de lib/account (rest renueva el token
// en un solo lugar), con los errores de la API de El Play (ApiError) para que las pantallas digan lo mismo.
import { AccountError, accountEnabled, rest } from '../../lib/account';
import { ApiError } from '../../lib/api';

/** PostgREST con la sesión (o como anónimo: los perfiles y los equipos son públicos) */
export const sbRest = async <T>(path: string): Promise<T> => {
    if (!accountEnabled()) throw new ApiError('disabled', 'not_found', 503);
    try {
        return await rest<T>(path, { headers: { Accept: 'application/json' } });
    } catch (error) {
        if (error instanceof AccountError && (error.code === 'network' || error.code === 'rate_limit')) throw new ApiError(error.message, 'network');
        // rest() pone el estado HTTP en el mensaje
        const status = Number((error as Error).message) || 0;
        throw new ApiError(`HTTP ${status}`, 'internal_error', status);
    }
};
