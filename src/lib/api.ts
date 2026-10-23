import type { GameDetail, LeagueId, Leaders, Schedule, Standings, PreviewData, RaceData } from '../types';

const TIMEOUT_MS = 10000;

export class ApiError extends Error {
    code: string;
    status: number;

    constructor(message: string, code: string, status = 0) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

// En desarrollo Vite redirige /api al backend (vite.config.js); en producción es el mismo origen.
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);

    try {
        const response = await fetch(path, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            const code = typeof body.error === 'string' ? body.error : 'internal_error';
            throw new ApiError(`HTTP ${response.status}`, code, response.status);
        }
        return (await response.json()) as T;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if ((error as Error).name === 'AbortError') {
            if (signal?.aborted) throw error;
            throw new ApiError('timeout', 'timeout');
        }
        throw new ApiError((error as Error).message, typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'network');
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
    }
}

export const api = {
    schedule: (league: LeagueId, signal?: AbortSignal) => getJson<Schedule>(`/api/v2/schedule?league=${league}`, signal),
    game: (gamePk: string | number, signal?: AbortSignal) => getJson<GameDetail>(`/api/v2/game/${gamePk}`, signal),
    standings: (league: LeagueId, signal?: AbortSignal) => getJson<Standings>(`/api/v2/standings?league=${league}`, signal),
    leaders: (league: LeagueId, signal?: AbortSignal) => getJson<Leaders>(`/api/v2/leaders?league=${league}`, signal),
    race: (league: LeagueId, signal?: AbortSignal) => getJson<RaceData>(`/api/v2/race?league=${league}`, signal),
    preview: (league: LeagueId, away: number, home: number, signal?: AbortSignal) => getJson<PreviewData>(`/api/v2/preview?league=${league}&away=${away}&home=${home}`, signal)
};
