import { describe, expect, it } from 'vitest';
import { leadChange, newPlayEvents, pitchingChangeNames, sameName, stealRunner } from './playEvents';
import { walkPaths } from './runners';
import type { AtBat, GameDetail } from '../types';

// Base por bolas, robo, cambio de lanzador, cambio en el marcador y dejado en el terreno (nombres de prueba)

const team = (id: number, abbrev: string, runs = 0, isWinner = false) => ({ id, abbrev, name: abbrev, logo: '', color: '#0069e0', record: null, teamName: abbrev, runs, hits: 0, errors: 0, lob: 0, isWinner });

const ab = (i: number, event: string | null, extra: Partial<AtBat> = {}): AtBat => ({
    i,
    inning: 1,
    top: true,
    complete: event !== null,
    scoring: false,
    batter: { id: 100 + i, name: `Bateador ${i}`, side: 'R' },
    pitcher: { id: 99, name: 'Lanzador Uno', hand: 'R' },
    event,
    eventLabel: null,
    desc: '',
    rbi: 0,
    away: 0,
    home: 0,
    outs: 0,
    pitches: [],
    actions: [],
    ...extra
});

const game = (atBats: AtBat[], extra: Partial<GameDetail> = {}) =>
    ({
        gamePk: 1,
        state: 'live',
        scheduledInnings: 9,
        atBats,
        inning: { n: 1, ordinal: '1st', isTop: true, state: 'Top' },
        runners: { first: null, second: null, third: null },
        away: team(672, 'LIC'),
        home: team(671, 'ESC'),
        box: {
            away: { batters: [{ id: 501, name: 'Corredor' }], pitchers: [] },
            home: {
                batters: [],
                pitchers: [
                    { id: 601, name: 'Abridor', ip: '5.1', k: 6, np: 88 },
                    { id: 602, name: 'Relevista', ip: '0.0', k: 0, np: 0 }
                ]
            }
        },
        ...extra
    }) as unknown as GameDetail;

describe('base por bolas: el bateador a primera y solo avanzan los forzados', () => {
    it('sin nadie, con uno en primera, con primera y segunda, y con las bases llenas', () => {
        const batter = { from: 0, to: 1, batter: true };
        expect(walkPaths(null)).toEqual([batter]);
        expect(walkPaths({ first: false, second: true, third: true })).toEqual([batter]);
        expect(walkPaths({ first: true, second: false, third: true })).toEqual([{ from: 1, to: 2, batter: false }, batter]);
        expect(walkPaths({ first: true, second: true, third: false })).toEqual([
            { from: 2, to: 3, batter: false },
            { from: 1, to: 2, batter: false },
            batter
        ]);
        expect(walkPaths({ first: true, second: true, third: true })).toEqual([
            { from: 3, to: 4, batter: false },
            { from: 2, to: 3, batter: false },
            { from: 1, to: 2, batter: false },
            batter
        ]);
    });

    it('sale como base por bolas, intencional o golpeado, del equipo al bate y con quién estaba en base', () => {
        const prev = game([ab(0, 'field_out')], { runners: { first: { id: 1, name: 'Uno' }, second: null, third: null } } as Partial<GameDetail>);
        const next = game([ab(0, 'field_out'), ab(1, 'walk'), ab(2, 'intent_walk'), ab(3, 'hit_by_pitch')]);
        const events = newPlayEvents(prev, next).filter((event) => event.kind === 'walk');
        expect(events.map((event) => [event.walk, event.team.abbrev])).toEqual([
            ['bb', 'LIC'],
            ['ibb', 'LIC'],
            ['hbp', 'LIC']
        ]);
        expect(events[0].bases).toEqual({ first: true, second: false, third: false });
        // De las siguientes no se sabe quién estaba en base
        expect(events[1].bases).toBeNull();
    });
});

describe('robos y cambios de lanzador (acciones dentro del turno)', () => {
    it('lee quién roba y quién entra y sale de la narración', () => {
        expect(stealRunner('Corredor Prueba steals (1) 2nd base.')).toBe('Corredor Prueba');
        expect(stealRunner('Corredor Prueba caught stealing 3rd base, catcher to third.')).toBe('Corredor Prueba');
        expect(stealRunner('Corredor Prueba picked off and caught stealing 2nd base.')).toBe('Corredor Prueba');
        expect(pitchingChangeNames('Pitching Change: Juan Relevista replaces Pedro Abridor.')).toEqual({ in: 'Juan Relevista', out: 'Pedro Abridor' });
        expect(sameName('Abridor', 'Pedro Abridor')).toBe(true);
        expect(sameName('Abridor, P', 'Pedro Abridor')).toBe(true);
        expect(sameName('Abridor, J', 'Pedro Abridor')).toBe(false);
    });

    it('robo: lo celebra el corredor; atrapado: la defensa; y van antes del resultado del turno', () => {
        const prev = game([ab(0, null)]);
        const next = game([
            ab(0, 'single', {
                actions: [
                    { event: 'stolen_base_2b', desc: 'Juan Corredor steals (1) 2nd base.' },
                    { event: 'caught_stealing_3b', desc: 'Juan Corredor caught stealing 3rd base.' }
                ]
            }),
            ab(1, null, { actions: [{ event: 'stolen_base_home', desc: 'Juan Corredor steals (2) home.' }] })
        ]);
        const events = newPlayEvents(prev, next);
        expect(events.map((event) => [event.kind, event.team.abbrev, event.steal?.base ?? null, event.steal?.caught ?? null])).toEqual([
            ['steal', 'LIC', 2, false],
            ['steal', 'ESC', 3, true],
            ['single', 'LIC', null, null],
            ['steal', 'LIC', 4, false]
        ]);
        expect(events[0].steal?.runner).toEqual({ id: 501, name: 'Juan Corredor' });
    });

    it('cambio de lanzador: del equipo que defiende, con la línea del que sale y su id del box', () => {
        const prev = game([ab(0, 'field_out')]);
        const next = game([ab(0, 'field_out'), ab(1, null, { pitcher: { id: 602, name: 'Juan Relevista', hand: 'R' }, actions: [{ event: 'pitching_substitution', desc: 'Pitching Change: Juan Relevista replaces Pedro Abridor.' }] })]);
        const [event] = newPlayEvents(prev, next);
        expect(event.kind).toBe('pitchingChange');
        expect(event.team.abbrev).toBe('ESC');
        expect(event.change?.in).toEqual({ id: 602, name: 'Juan Relevista' });
        expect(event.change?.out).toEqual({ id: 601, name: 'Pedro Abridor' });
        expect(event.change?.line).toMatchObject({ ip: '5.1', k: 6, np: 88 });
    });
});

describe('cambio en el marcador', () => {
    it('abre el marcador, se va arriba, le da la vuelta, empata o no cambia nada', () => {
        expect(leadChange({ away: 0, home: 0 }, { away: 1, home: 0 })).toEqual({ side: 'away', lead: 'open' });
        expect(leadChange({ away: 2, home: 2 }, { away: 2, home: 3 })).toEqual({ side: 'home', lead: 'ahead' });
        expect(leadChange({ away: 3, home: 1 }, { away: 3, home: 5 })).toEqual({ side: 'home', lead: 'comeback' });
        expect(leadChange({ away: 3, home: 1 }, { away: 3, home: 3 })).toEqual({ side: 'home', lead: 'tie' });
        // Aumenta la ventaja, sigue abajo o anotaron los dos entre lecturas: nada
        expect(leadChange({ away: 3, home: 1 }, { away: 4, home: 1 })).toBeNull();
        expect(leadChange({ away: 3, home: 0 }, { away: 3, home: 2 })).toBeNull();
        expect(leadChange({ away: 1, home: 1 }, { away: 2, home: 2 })).toBeNull();
    });

    it('sale después de la jugada que lo hizo, con el equipo que anotó y cómo estaba antes', () => {
        const prev = game([ab(0, 'field_out')], { away: team(672, 'LIC', 1), home: team(671, 'ESC', 2) } as Partial<GameDetail>);
        const next = game([ab(0, 'field_out'), ab(1, 'home_run', { away: 3, home: 2 })], { away: team(672, 'LIC', 3), home: team(671, 'ESC', 2) } as Partial<GameDetail>);
        const events = newPlayEvents(prev, next);
        expect(events.map((event) => event.kind)).toEqual(['hr', 'lead']);
        expect(events[1]).toMatchObject({ team: { abbrev: 'LIC' }, lead: { change: 'comeback', before: { away: 1, home: 2 } } });
    });
});

describe('dejado en el terreno', () => {
    const final = (lastTop: boolean, inning: number, scheduledInnings = 9) => {
        const prev = game([ab(0, null, { top: lastTop, inning })], { away: team(672, 'LIC', 3), home: team(671, 'ESC', 3) } as Partial<GameDetail>);
        const next = game([ab(0, lastTop ? 'field_out' : 'single', { top: lastTop, inning })], {
            state: 'final',
            scheduledInnings,
            away: team(672, 'LIC', lastTop ? 3 : 3, false),
            home: team(671, 'ESC', 4, true)
        } as Partial<GameDetail>);
        return newPlayEvents(prev, next).filter((event) => event.kind === 'win' || event.kind === 'walkoff');
    };

    it('el local gana en la baja de la 9.ª o en extra: en el terreno, con la jugada que lo dejó', () => {
        expect(final(false, 9).map((event) => event.kind)).toEqual(['walkoff']);
        expect(final(false, 11)[0]).toMatchObject({ kind: 'walkoff', atBat: { i: 0 } });
        expect(final(false, 7, 7).map((event) => event.kind)).toEqual(['walkoff']);
    });

    it('termina en la alta (el local ya iba arriba) o el juego se acortó: victoria normal', () => {
        expect(final(true, 9).map((event) => event.kind)).toEqual(['win']);
        expect(final(false, 6).map((event) => event.kind)).toEqual(['win']);
    });
});
