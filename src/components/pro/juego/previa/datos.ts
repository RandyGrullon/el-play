// Datos de la previa y del final PRO que no son hooks del kit: el respaldo con las rutas del Lite (que sí están en
// producción) para cuando las rutas PRO todavía no existen en el servidor, y la regla de cuándo usar cada una.
// Las consultas usan las MISMAS llaves que el Lite (['standings', liga], ['schedule', liga], ['players', liga, temp.])
// para compartir la caché, pero con `enabled`: solo se piden si hacen falta.
import { useQuery } from '@tanstack/react-query';
import { ApiError, api, networkErrorCode } from '../../../../lib/api';
import { API_BASE } from '../../../../lib/config';
import { keys } from '../../../../lib/queries';
import { isPermanent } from '../../../../lib/pro/http';
import type { PlayersData } from '../../../../lib/stats';
import type { LeagueId, StandingRow, Standings } from '../../../../types';
import type { ProStandings, SeasonCalendar, StandingPro } from '../../../../types/pro-liga';
import type { SeriesSource } from './logica';

const MINUTE = 60 * 1000;

// Igual que el Lite: no reintentar lo que no se arregla solo (no existe, petición inválida)
const retry = (failureCount: number, error: Error) => !(error instanceof ApiError && [400, 404].includes(error.status)) && failureCount < 2;

/** Posiciones del Lite (/api/v2/standings) solo si hacen falta */
export const useLiteStandings = (league: LeagueId, enabled: boolean) =>
    useQuery({ queryKey: keys.standings(league), queryFn: ({ signal }) => api.standings(league, signal), enabled, staleTime: 5 * MINUTE, retry });

/** Calendario del Lite (/api/v2/schedule: unos diez días alrededor de hoy) solo si hace falta */
export const useLiteSchedule = (league: LeagueId, enabled: boolean) =>
    useQuery({ queryKey: keys.schedule(league), queryFn: ({ signal }) => api.schedule(league, signal), enabled, staleTime: MINUTE, retry });

/** Peloteros de una temporada del Lite (/api/v2/players), la misma llave que usePlayers de lib/stats */
export const useLitePlayers = (league: LeagueId, season: number | undefined, enabled: boolean) =>
    useQuery({
        queryKey: ['players', league, season ?? 'actual'],
        queryFn: async ({ signal }) => {
            const response = await fetch(`${API_BASE}/api/v2/players?league=${league}${season ? `&season=${season}` : ''}`, { signal, headers: { Accept: 'application/json' } }).catch(async (error: Error) => {
                if (error.name === 'AbortError') throw error;
                throw new ApiError(error.message, await networkErrorCode());
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new ApiError(`HTTP ${response.status}`, typeof body.error === 'string' ? body.error : 'internal_error', response.status);
            }
            return (await response.json()) as PlayersData;
        },
        enabled,
        staleTime: 5 * MINUTE,
        retry
    });

/** Lo que quiere saber un bloque de una consulta: si carga, si ya no vale la pena esperar y si es por falta de red */
export interface QueryLook {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
}

/** La ruta PRO no está (404 de producción) o no sirve: toca el respaldo del Lite */
export const proMissing = (query: Pick<QueryLook, 'isError' | 'error'>, hasData: boolean) => !hasData && query.isError && isPermanent(query.error);

/** Sin red (código del Lite: «offline») */
export const isOffline = (error: unknown) => error instanceof ApiError && error.code === 'offline';

// ---------------------------------------------------------------- posiciones (PRO o Lite)

/** Fila del cara a cara: la de las posiciones PRO (con `pro`) o la del Lite (sin splits ni esperado) */
export type H2HRow = StandingRow & { runDiff?: number; pro?: StandingPro };

/** Filas donde están los dos equipos (la fase del juego en LIDOM, el grupo en el Clásico) */
export const rowsFor = (standings: ProStandings | Standings, awayId: number, phase: 'regular' | 'roundRobin' | 'final' | undefined): H2HRow[] => {
    if (standings.type === 'lidom') {
        const rows = standings[phase ?? 'regular'];
        return rows?.length ? rows : standings[standings.activePhase];
    }
    if (standings.type === 'wbc') return Object.values(standings.pools as Record<string, H2HRow[]>).find((rows) => rows.some((row) => row.team.id === awayId)) ?? [];
    return standings.teams;
};

// ---------------------------------------------------------------- calendario (PRO o Lite)

/** El calendario PRO de toda la temporada como fuente de la serie particular y la forma */
export const sourceFromCalendar = (calendar: SeasonCalendar): SeriesSource => ({
    timeZone: calendar.timeZone,
    teams: calendar.teams,
    games: calendar.games,
    form: calendar.form,
    headToHead: calendar.headToHead,
    window: null
});

