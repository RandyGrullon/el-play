import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { floatScene } from './floatingScore';
import type { AtBat, GameDetail } from '../types';

// Juego inventado: peloteros, equipos e ids de prueba
const team = (id: number, abbrev: string, color: string, runs: number) => ({ id, abbrev, name: `Equipo ${abbrev}`, color, logo: '', runs });
const atBat = (over: Partial<AtBat>): AtBat =>
    ({
        i: 0,
        inning: 4,
        top: true,
        complete: true,
        scoring: false,
        batter: { id: 301, name: 'Pedro Doble Prueba', side: 'R' },
        pitcher: { id: 401, name: 'Lanzador Prueba', hand: 'R' },
        event: 'double',
        eventLabel: 'Double',
        desc: '',
        rbi: 0,
        away: 1,
        home: 0,
        outs: 1,
        pitches: [],
        actions: [],
        ...over
    }) as AtBat;

const makeGame = (over: Partial<GameDetail> = {}) =>
    ({
        state: 'live',
        scheduledInnings: 9,
        linescore: [1, 2, 3, 4].map((n) => ({ n, away: 0, home: 0 })),
        inning: { n: 4, ordinal: '4th', isTop: true, state: 'Top' },
        count: { balls: 2, strikes: 1, outs: 1 },
        runners: { first: { id: 1, name: 'Uno' }, second: null, third: { id: 3, name: 'Tres' } },
        matchup: { batter: { id: 302, name: 'Juan Bateador Prueba' }, pitcher: { id: 401, name: 'Lanzador Prueba' }, onDeck: null },
        atBats: [atBat({ i: 0 }), atBat({ i: 1, complete: false, event: null, eventLabel: null, batter: { id: 302, name: 'Juan Bateador Prueba', side: 'L' } })],
        currentAtBat: 1,
        dueUp: null,
        away: team(90001, 'VIS', '#aa1141', 1),
        home: team(90002, 'CAS', '#FDB927', 0),
        ...over
    }) as unknown as GameDetail;

describe('floatScene', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
    });

    it('en vivo: marcador, entrada, conteo, bases, duelo y la última jugada', () => {
        const scene = floatScene(makeGame(), i18n.t, 'es');
        expect(scene.away).toEqual({ abbrev: 'VIS', runs: 1, color: '#aa1141' });
        expect(scene.inning).toEqual({ n: 4, half: 'Top', text: 'Alta' });
        expect(scene.count).toBe('2-1');
        expect(scene.outs).toBe(1);
        expect(scene.bases).toEqual([true, false, true]);
        // En la alta batea la visita: las bases van de su color
        expect(scene.battingColor).toBe('#aa1141');
        expect(scene.line).toBe('Batea Prueba · Lanza Prueba');
        expect(scene.last).toBe('Doble · Prueba');
        expect(scene.final).toBe(false);
    });

    it('en la pausa entre entradas dice quién abre y no da conteo', () => {
        const game = makeGame({
            inning: { n: 4, ordinal: '4th', isTop: true, state: 'Middle' },
            count: { balls: 0, strikes: 0, outs: 3 },
            atBats: [atBat({ i: 0, outs: 3 })],
            currentAtBat: 0,
            dueUp: { teamId: 90002, batters: [{ id: 501, name: 'Abridor Casa' }] }
        });
        const scene = floatScene(game, i18n.t, 'es');
        expect(scene.between).toBe(true);
        expect(scene.count).toBeNull();
        expect(scene.line).toBe('Abre Casa por CAS');
        // El que viene a batear es la casa
        expect(scene.battingColor).toBe('#FDB927');
    });

    it('terminado: «Final» con las entradas extra y sin duelo', () => {
        const game = makeGame({ state: 'final', linescore: Array.from({ length: 10 }, (_, index) => ({ n: index + 1, away: 0, home: 0 })) });
        const scene = floatScene(game, i18n.t, 'es');
        expect(scene.final).toBe(true);
        expect(scene.finalText).toBe('Final/10');
        expect(scene.line).toBeNull();
    });

    it('en inglés', () => {
        i18n.changeLanguage('en');
        const scene = floatScene(makeGame(), i18n.t, 'en');
        expect(scene.line).toBe('Prueba batting · Prueba pitching');
        expect(scene.inning?.text).toBe('Top');
        expect(scene.last).toBe('Double · Prueba');
    });
});
