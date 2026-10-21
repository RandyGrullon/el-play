// Lectura de las rutas del modo PRO (las mismas de la web). Son rutas aparte del Lite y producción todavía no las tiene:
// una ruta que el servidor no conoce responde 404 «not_found». Entonces la consulta queda sin datos (la pantalla PRO
// muestra lo que sí hay), no se reintenta, deja de releerse sola y la ruta se recuerda mientras la app esté abierta para
// no volver a pedirla en cada pantalla. Un juego o pelotero que no existe (404 con otro código), una petición inválida
// (400) o el fantasy sin cuentas en el servidor (503 «accounts_disabled») tampoco se releen solos.
import { ApiError, networkErrorCode } from '../api';
import { API_BASE } from '../config';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

// Rutas que este servidor no tiene (se olvidan al cerrar la app o al recargar la web)
const missing = new Set<string>();

/** La ruta no existe en este servidor (404 «not_found»: producción todavía sin el PRO) */
export const isRouteMissing = (error: unknown) => error instanceof ApiError && error.status === 404 && error.code === 'not_found';

/** No hay nada que pedir: la ruta, el juego o el pelotero no existen (404) */
export const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

/** No se arregla solo releyendo: no existe (404), petición inválida (400) o servidor sin cuentas (503 accounts_disabled) */
export const isPermanent = (error: unknown) =>
    error instanceof ApiError && (error.status === 404 || error.status === 400 || (error.status === 503 && error.code === 'accounts_disabled'));

/**
 * GET a la API con tiempo límite. `route` nombra la ruta (p. ej. 'game-pro') para recordar que no existe.
 * Los errores son ApiError como los del Lite: status 0 = sin red ('offline'/'network') o tiempo agotado ('timeout').
 */
export async function getPro<T>(route: string, path: string, signal?: AbortSignal, timeoutMs = 10 * SECOND): Promise<T> {
    if (missing.has(route)) throw new ApiError('HTTP 404', 'not_found', 404);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    try {
        const response = await fetch(`${API_BASE}${path}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            const error = new ApiError(`HTTP ${response.status}`, typeof body.error === 'string' ? body.error : 'internal_error', response.status);
            if (isRouteMissing(error)) missing.add(route);
            throw error;
        }
        return (await response.json()) as T;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if ((error as Error).name === 'AbortError') {
            if (signal?.aborted) throw error;
            throw new ApiError('timeout', 'timeout');
        }
        // navigator.onLine no existe en el teléfono: el estado real lo da NetInfo
        throw new ApiError((error as Error).message, await networkErrorCode());
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
    }
}

/** Reintentos (2) salvo lo que no se arregla solo: petición inválida (400), no existe (404) y, si se pasa, 503 */
export const retryUnless =
    (statuses: number[]) =>
    (failureCount: number, error: Error): boolean =>
        !(error instanceof ApiError && statuses.includes(error.status)) && failureCount < 2;

/** Lo que React Query le pasa a refetchInterval y refetchOnWindowFocus (solo lo que se mira) */
interface Watched<T> {
    state: { data: T | undefined; error: Error | null; dataUpdatedAt: number; errorUpdatedAt: number };
}

// React Query vuelve a calcular el intervalo en cada render de la pantalla y, si sale otro número, reinicia el reloj.
// Con el jitter al azar (gameInterval, jitter) cada render lo reiniciaba: con varias consultas en la misma pantalla
// (detalle, extras PRO, probabilidad…) se pisaban y en vivo releían cada ~11 s en vez de ~5 s. Se guarda el valor por
// consulta hasta que lleguen datos nuevos o un error. Por eso `interval` solo debe depender de los datos (y de la hora):
// si depende de otra cosa de la pantalla, no usar esta ayuda (ver usePortadaGames).
const lastInterval = new WeakMap<object, { dataAt: number; errorAt: number; value: number | false }>();

/** Cada cuánto releer según los datos; con un error que no se arregla solo (404, 400…) deja de releerse */
export const pollUnlessMissing =
    <T>(interval: (data: T | undefined) => number | false) =>
    (query: Watched<T>): number | false => {
        if (isPermanent(query.state.error)) return false;
        const { dataUpdatedAt, errorUpdatedAt } = query.state;
        const cached = lastInterval.get(query);
        if (cached && cached.dataAt === dataUpdatedAt && cached.errorAt === errorUpdatedAt) return cached.value;
        const value = interval(query.state.data);
        lastInterval.set(query, { dataAt: dataUpdatedAt, errorAt: errorUpdatedAt, value });
        return value;
    };

/** Al volver a la app o recuperar la red se relee, salvo que lo último haya sido un 404 (o 400…) */
export const unlessMissing = <T>(query: Watched<T>) => !isPermanent(query.state.error);

/** Las dos juntas, para esparcir en las opciones de useQuery */
export const calmOn404 = { refetchOnWindowFocus: unlessMissing, refetchOnReconnect: unlessMissing };

/** Igual que en src/lib/polling.ts: que no se pidan todos a la vez */
export const jitter = (ms: number) => ms + Math.floor(Math.random() * Math.min(ms * 0.15, 2 * SECOND));

/** «?a=1&b=2» sin los vacíos */
export const queryString = (params: Record<string, string | number | undefined | null>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    const text = search.toString();
    return text ? `?${text}` : '';
};
