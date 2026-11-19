import { describe, expect, it } from 'vitest';
import { gamesBefore, recentHitting } from './recentGames';
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

    it('de 1.000 no le quita el 1', () => {
        expect(recentHitting([game(1, 2, 2)]).avg).toBe('1.000');
    });
});

describe('gamesBefore', () => {
    it('saca el juego de hoy y se queda con los 8 anteriores', () => {
        const log = Array.from({ length: 12 }, (_, index) => game(100 - index, 1));
        const before = gamesBefore(log, 100);
        expect(before).toHaveLength(8);
        expect(before[0].gamePk).toBe(99);
        expect(before[7].gamePk).toBe(92);
    });
});
