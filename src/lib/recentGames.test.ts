import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_RECENT, lastGames, recentHitting, setRecentCount, sumHitting, useRecentCount } from './recentGames';
import type { HittingLine } from './stats';

const game = (gamePk: number, h: number | null, ab = 3) => ({ gamePk, hitting: h === null ? null : ({ h, ab } as HittingLine) });

describe('recentHitting', () => {
    it('suma turnos y hits de esos juegos: 2 hits en 22 turnos es .091', () => {
        const games = [game(8, 0, 4), game(7, 1, 3), game(6, 0, 2), game(5, 0, 3), game(4, 1, 3), game(3, 0, 2), game(2, 0, 3), game(1, 0, 2)];
        expect(recentHitting(games)).toEqual({ games: 8, ab: 22, h: 2, avg: '.091' });
    });

    it('no cuenta los juegos en que no bateó; sin turnos no hay promedio', () => {
        expect(recentHitting([game(2, null), game(1, 0, 0)])).toEqual({ games: 1, ab: 0, h: 0, avg: null });
        expect(recentHitting([])).toEqual({ games: 0, ab: 0, h: 0, avg: null });
    });

    it('de 1.000 no le quita el 1; también suma temporadas', () => {
        expect(recentHitting([game(1, 2, 2)]).avg).toBe('1.000');
        expect(sumHitting([{ ab: 100, h: 30 }, undefined, { ab: 50, h: 10 }])).toEqual({ games: 2, ab: 150, h: 40, avg: '.267' });
    });
});

describe('lastGames', () => {
    const log = Array.from({ length: 12 }, (_, index) => game(100 - index, 1));

    it('los últimos que pidas; 0 son todos', () => {
        expect(lastGames(log, 5).map((row) => row.gamePk)).toEqual([100, 99, 98, 97, 96]);
        expect(lastGames(log, 0)).toHaveLength(12);
        expect(lastGames(log, 50)).toHaveLength(12);
    });

    it('sin el juego de hoy cuando se le dice cuál es', () => {
        const before = lastGames(log, 8, 100);
        expect(before).toHaveLength(8);
        expect(before[0].gamePk).toBe(99);
        expect(before[7].gamePk).toBe(92);
    });
});

describe('cuántos juegos medir', () => {
    beforeEach(() => {
        window.localStorage.clear();
        setRecentCount(DEFAULT_RECENT);
    });

    it('8 al empezar; lo que escojas se guarda y avisa a todos los que lo usan', () => {
        const { result } = renderHook(() => useRecentCount());
        expect(result.current).toBe(8);
        act(() => setRecentCount(15));
        expect(result.current).toBe(15);
        expect(window.localStorage.getItem('el-play-recent-games')).toBe('15');
        act(() => setRecentCount(0));
        expect(result.current).toBe(0);
    });

    it('no pasa de 200 ni baja de 0', () => {
        const { result } = renderHook(() => useRecentCount());
        act(() => setRecentCount(999));
        expect(result.current).toBe(200);
        act(() => setRecentCount(-3));
        expect(result.current).toBe(0);
    });
});
