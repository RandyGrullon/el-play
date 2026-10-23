import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, ApiError } from './api';
import { gameInterval, scheduleInterval } from './polling';
import type { LeagueId, Schedule, ScheduleGame } from '../types';

const MINUTE = 60 * 1000;

// No reintentar errores que no se arreglan solos (juego inexistente, petición inválida)
const retry = (failureCount: number, error: Error) => {
    if (error instanceof ApiError && [400, 404].includes(error.status)) return false;
    return failureCount < 2;
};

export const keys = {
    schedule: (league: LeagueId) => ['schedule', league] as const,
    game: (gamePk: string | number) => ['game', String(gamePk)] as const,
    standings: (league: LeagueId) => ['standings', league] as const,
    leaders: (league: LeagueId) => ['leaders', league] as const
};

export const useSchedule = (league: LeagueId) =>
    useQuery({
        queryKey: keys.schedule(league),
        queryFn: ({ signal }) => api.schedule(league, signal),
        staleTime: 5000,
        refetchInterval: (query) => scheduleInterval(query.state.data),
        refetchOnWindowFocus: true,
        retry
    });

export const useGame = (gamePk: string | undefined) =>
    useQuery({
        queryKey: keys.game(gamePk ?? ''),
        queryFn: ({ signal }) => api.game(gamePk!, signal),
        enabled: !!gamePk,
        staleTime: 2000,
        refetchInterval: (query) => gameInterval(query.state.data),
        refetchOnWindowFocus: true,
        retry
    });

export const useStandings = (league: LeagueId) =>
    useQuery({
        queryKey: keys.standings(league),
        queryFn: ({ signal }) => api.standings(league, signal),
        staleTime: 5 * MINUTE,
        refetchInterval: 10 * MINUTE,
        retry
    });

/** Previa: enfrentamientos de la temporada y los que vienen calientes (cambia poco: 10 minutos) */
export const usePreview = (league: LeagueId, away: number, home: number, enabled = true) =>
    useQuery({
        queryKey: ['preview', league, away, home],
        queryFn: ({ signal }) => api.preview(league, away, home, signal),
        enabled: enabled && !!away && !!home,
        staleTime: 10 * MINUTE,
        retry
    });

export const useLeaders = (league: LeagueId) =>
    useQuery({
        queryKey: keys.leaders(league),
        queryFn: ({ signal }) => api.leaders(league, signal),
        staleTime: 15 * MINUTE,
        retry
    });

/** Precarga el detalle al pasar el dedo/ratón por una tarjeta: al abrirla ya está en caché. */
export const usePrefetchGame = () => {
    const client = useQueryClient();
    return useCallback(
        (gamePk: number) =>
            client.prefetchQuery({ queryKey: keys.game(gamePk), queryFn: ({ signal }) => api.game(gamePk, signal), staleTime: 5000 }),
        [client]
    );
};

/** La tarjeta del calendario de un juego, si ya está en caché (para pintar la cabecera al instante). */
export const findScheduledGame = (client: QueryClient, gamePk: string | undefined): ScheduleGame | undefined => {
    if (!gamePk) return undefined;
    for (const [, schedule] of client.getQueriesData<Schedule>({ queryKey: ['schedule'] })) {
        const game = schedule?.games.find((item) => String(item.gamePk) === gamePk);
        if (game) return game;
    }
    return undefined;
};
