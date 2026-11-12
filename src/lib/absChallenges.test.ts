import { describe, expect, it } from 'vitest';
import { absSlots, absTally } from './absChallenges';

describe('retos del ABS en barra', () => {
    it('al empezar: 2 de 2', () => {
        const tally = absTally({ won: 0, lost: 0, remaining: 2 });
        expect(tally).toEqual({ total: 2, left: 2, won: 0, lost: 0 });
        expect(absSlots(tally)).toEqual(['left', 'left']);
    });

    it('el ganado no se gasta; el perdido sí', () => {
        expect(absTally({ won: 1, lost: 0, remaining: 2 })).toMatchObject({ total: 2, left: 2 });
        const tally = absTally({ won: 1, lost: 1, remaining: 1 });
        expect(tally).toMatchObject({ total: 2, left: 1, won: 1, lost: 1 });
        expect(absSlots(tally)).toEqual(['left', 'lost']);
        expect(absSlots(absTally({ won: 0, lost: 2, remaining: 0 }))).toEqual(['lost', 'lost']);
    });

    it('en extra innings le dan otro: la barra crece', () => {
        const tally = absTally({ won: 0, lost: 2, remaining: 1 });
        expect(tally.total).toBe(3);
        expect(absSlots(tally)).toEqual(['left', 'lost', 'lost']);
    });

    it('si no llegan los que quedan no hay barra (solo ganados y perdidos)', () => {
        const tally = absTally({ won: 1, lost: 2, remaining: null });
        expect(tally).toEqual({ total: null, left: null, won: 1, lost: 2 });
        expect(absSlots(tally)).toEqual([]);
    });

    it('datos raros (menos de los que dice el reglamento) no rompen la barra', () => {
        expect(absSlots(absTally({ won: 0, lost: 0, remaining: 1 }))).toEqual(['left', 'empty']);
    });
});
