import { describe, expect, it } from 'vitest';
import { basesOf, legsOf, runnerPaths } from './runners';
import { newPlayEvents } from './playEvents';
import type { GameDetail } from '../types';

const empty = { first: false, second: false, third: false };

describe('corredores en un hit: quién anota y hasta dónde llega cada uno', () => {
    it('sencillo: sin nadie en base, uno en segunda que anota y bases llenas con una remolcada', () => {
        expect(runnerPaths('single', empty, 0)).toEqual([{ from: 0, to: 1, batter: true }]);
        expect(runnerPaths('single', { ...empty, second: true }, 1)).toEqual([
            { from: 2, to: 4, batter: false },
            { from: 0, to: 1, batter: true }
        ]);
        expect(runnerPaths('single', { first: true, second: true, third: true }, 1)).toEqual([
            { from: 3, to: 4, batter: false },
            { from: 2, to: 3, batter: false },
            { from: 1, to: 2, batter: false },
            { from: 0, to: 1, batter: true }
        ]);
    });

    it('doble: remolca 1 desde primera; remolca 2; triple con bases llenas remolca 3', () => {
        expect(runnerPaths('double', { ...empty, first: true }, 1)).toEqual([
            { from: 1, to: 4, batter: false },
            { from: 0, to: 2, batter: true }
        ]);
        expect(runnerPaths('double', { ...empty, first: true, second: true }, 2).filter((path) => path.to === 4)).toHaveLength(2);
        // Doble sin remolcar con uno en primera: llega a tercera
        expect(runnerPaths('double', { ...empty, first: true }, 0)).toEqual([
            { from: 1, to: 3, batter: false },
            { from: 0, to: 2, batter: true }
        ]);
        expect(runnerPaths('triple', { first: true, second: true, third: true }, 3).filter((path) => path.to === 4)).toHaveLength(3);
    });

    it('jonrón: anotan todos (con dos en base, 3 carreras); grand slam con las bases llenas', () => {
        expect(runnerPaths('hr', { ...empty, first: true, third: true }, 3)).toEqual([
            { from: 3, to: 4, batter: false },
            { from: 1, to: 4, batter: false },
            { from: 0, to: 4, batter: true }
        ]);
        expect(runnerPaths('hr', null, 4)).toHaveLength(4);
        expect(runnerPaths('hr', empty, 1)).toEqual([{ from: 0, to: 4, batter: true }]);
    });

    it('sin saber quién estaba (o si no cuadra con las carreras): anotan los de las bases más altas', () => {
        expect(runnerPaths('double', null, 2)).toEqual([
            { from: 3, to: 4, batter: false },
            { from: 2, to: 4, batter: false },
            { from: 0, to: 2, batter: true }
        ]);
        expect(runnerPaths('single', { ...empty, first: true }, 2).filter((path) => path.to === 4)).toHaveLength(2);
        expect(legsOf({ from: 1, to: 4 })).toBe(3);
        expect(basesOf(null)).toBeNull();
        expect(basesOf({ first: { id: 1 }, second: null, third: null })).toEqual({ first: true, second: false, third: false });
    });

    it('la jugada lleva quién estaba en base y el marcador antes y después', () => {
        const team = (id: number) => ({ id, abbrev: `T${id}`, color: '#000', logo: '' });
        const atBat = (i: number, extra: object) => ({ i, inning: 3, top: true, complete: true, scoring: false, batter: { id: i, name: `B${i}`, side: 'R' }, pitcher: { id: 99, name: 'P', hand: 'R' }, event: 'field_out', eventLabel: null, desc: '', rbi: 0, away: 1, home: 0, outs: 1, pitches: [], actions: [], ...extra });
        const prev = { gamePk: 1, state: 'live', away: team(1), home: team(2), venue: 'Estadio Quisqueya', runners: { first: { id: 5 }, second: null, third: { id: 6 } }, atBats: [atBat(0, {}), atBat(1, { complete: false })] } as unknown as GameDetail;
        const next = { ...prev, runners: { first: null, second: null, third: null }, atBats: [atBat(0, {}), atBat(1, { event: 'double', rbi: 2, away: 3, scoring: true })] } as unknown as GameDetail;
        const [event] = newPlayEvents(prev, next);
        expect(event).toMatchObject({ kind: 'double', bases: { first: true, second: false, third: true }, runs: { before: 1, after: 3 } });
    });
});
