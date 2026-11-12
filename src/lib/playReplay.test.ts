import { describe, expect, it } from 'vitest';
import { REPLAY_COOLDOWN_MS, newPlayEvents, replayActionOf, replayEventOf, replayGate, type ReplayGateState } from './playEvents';
import type { AtBat, GameDetail } from '../types';

// Repetir una jugada del historial y el candado entre repeticiones (juego, equipos y peloteros de prueba)

const UNO = { id: 12345678, name: 'Pelotero Uno' };
const DOS = { id: 87654321, name: 'Pelotero Dos' };

const team = (id: number, abbrev: string, runs = 0, isWinner = false) => ({ id, abbrev, name: `Equipo ${abbrev}`, logo: '', color: '#123456', record: null, teamName: abbrev, runs, hits: 0, errors: 0, lob: 0, isWinner });

const ab = (i: number, event: string | null, extra: Partial<AtBat> = {}): AtBat => ({
    i,
    inning: 1,
    top: true,
    complete: event !== null,
    scoring: false,
    batter: { id: 11111111 + i, name: `Bateador ${i}`, side: 'R' },
    pitcher: { ...UNO, hand: 'R' },
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
        gamePk: 12345678,
        state: 'live',
        scheduledInnings: 9,
        league: 'lidom',
        venue: 'Estadio de Prueba',
        atBats,
        away: team(99991, 'UNO'),
        home: team(99992, 'DOS'),
        ...extra
    }) as unknown as GameDetail;

describe('replayEventOf: la animación de una jugada ya hecha, armada para ese turno', () => {
    it('sencillo con corredores: bases del turno anterior de la misma media, carreras del marcador y estadio', () => {
        const atBats = [
            ab(0, 'single', { post: 1 }),
            ab(1, 'walk', { post: 3 }),
            ab(2, 'single', { post: 3, away: 1, rbi: 1, scoring: true, batter: { ...DOS, side: 'L' } })
        ];
        const event = replayEventOf(game(atBats), 2);
        expect(event).toMatchObject({
            key: 'replay-2',
            kind: 'single',
            replay: true,
            venue: 'Estadio de Prueba',
            bases: { first: true, second: true, third: false },
            runs: { before: 0, after: 1 },
            atBat: atBats[2]
        });
        // El protagonista es el que batea
        expect(event?.team.abbrev).toBe('UNO');
        expect(event?.rival.abbrev).toBe('DOS');
        expect(event?.atBat?.batter.name).toBe('Pelotero Dos');
    });

    it('ponche: los ponches del lanzador hasta ese turno (sin los de otro ni los de después)', () => {
        const otro = { ...DOS, hand: 'L' };
        const atBats = [
            ab(0, 'strikeout'),
            ab(1, 'strikeout', { pitcher: otro }),
            ab(2, 'field_out', { outs: 2 }),
            ab(3, 'strikeout', { outs: 3 }),
            ab(4, 'strikeout', { inning: 2 }),
            ab(5, 'strikeout', { inning: 2 })
        ];
        const event = replayEventOf(game(atBats), 3);
        expect(event).toMatchObject({ kind: 'k', strikeouts: 2, bases: null, runs: null, replay: true });
        expect(event?.atBat?.pitcher.name).toBe('Pelotero Uno');
        // El ponche lo celebra el que lanza
        expect(event?.team.abbrev).toBe('DOS');
        expect(replayEventOf(game(atBats), 5)?.strikeouts).toBe(4);
    });

    it('el primer turno de una media entrada sale sin nadie en base (no hereda los de la otra media)', () => {
        const atBats = [ab(0, 'single', { post: 1 }), ab(1, 'double', { post: 6, outs: 3 }), ab(2, 'double', { top: false, post: 2 })];
        expect(replayEventOf(game(atBats), 0)?.bases).toEqual({ first: false, second: false, third: false });
        expect(replayEventOf(game(atBats), 2)?.bases).toEqual({ first: false, second: false, third: false });
        // En la misma media sí: el anterior dejó a uno en primera
        expect(replayEventOf(game(atBats), 1)?.bases).toEqual({ first: true, second: false, third: false });
    });

    it('sin animación: selección (fielders_choice), turno en curso o que no existe → null', () => {
        const atBats = [ab(0, 'fielders_choice'), ab(1, 'single'), ab(2, null, { pitches: [{ r: 'ball' } as AtBat['pitches'][number]] })];
        expect(replayEventOf(game(atBats), 0)).toBeNull();
        expect(replayEventOf(game(atBats), 2)).toBeNull();
        expect(replayEventOf(game(atBats), 99)).toBeNull();
        expect(replayEventOf(game(atBats), 1)?.kind).toBe('single');
    });

    it('el que deja en el terreno al local repite «en el terreno»; los demás turnos, su jugada', () => {
        const atBats = [ab(0, 'field_out', { inning: 9, top: true }), ab(1, 'single', { inning: 9, top: false, home: 3, away: 2, scoring: true })];
        const final = game(atBats, { state: 'final', away: team(99991, 'UNO', 2), home: team(99992, 'DOS', 3, true) } as Partial<GameDetail>);
        expect(replayEventOf(final, 1)).toMatchObject({ key: 'replay-1', kind: 'walkoff', replay: true, atBat: atBats[1] });
        expect(replayEventOf(final, 1)?.team.abbrev).toBe('DOS');
        expect(replayEventOf(final, 0)?.kind).toBe('out');
    });
});

// Box de prueba: el corredor y los lanzadores por su apellido (como los trae el box)
const BOX = {
    away: { batters: [{ id: 12345678, name: 'Prueba' }], pitchers: [] },
    home: {
        batters: [],
        pitchers: [
            { id: 87654321, name: 'Abridor', ip: '5.1', k: 6, np: 88 },
            { id: 11223344, name: 'Relevista', ip: '0.0', k: 0, np: 0 }
        ]
    }
};
const withBox = (atBats: AtBat[], extra: Partial<GameDetail> = {}) => game(atBats, { box: BOX, ...extra } as unknown as Partial<GameDetail>);

const STEAL_2B = { event: 'stolen_base_2b', desc: 'Juan Prueba steals (1) 2nd base.' };
const CAUGHT_3B = { event: 'caught_stealing_3b', desc: 'Juan Prueba caught stealing 3rd base, catcher to third.' };
const CAUGHT_HOME = { event: 'caught_stealing_home', desc: 'Juan Prueba caught stealing home.' };
const MOUND = { event: 'mound_visit', desc: 'Mound Visit.' };
const WILD = { event: 'wild_pitch', desc: 'Wild pitch by Pedro Relevista.' };
const CHANGE = { event: 'pitching_substitution', desc: 'Pitching Change: Pedro Relevista replaces Juan Abridor.' };
const PINCH_HITTER = {
    event: 'offensive_substitution',
    desc: 'Offensive Substitution: Pinch-hitter Juan Prueba replaces Pedro Prueba.',
    sub: { pos: 'PH', in: { id: 12345678, name: 'Juan Prueba' }, out: { id: 87654321, name: 'Pedro Prueba' } }
};
const PINCH_RUNNER = { ...PINCH_HITTER, desc: 'Offensive Substitution: Pinch-runner Juan Prueba replaces Pedro Prueba.', sub: { ...PINCH_HITTER.sub, pos: 'PR' } };
const DEFENSIVE = { event: 'defensive_substitution', desc: 'Defensive Substitution: Juan Prueba replaces Pedro Prueba.', sub: { ...PINCH_HITTER.sub, pos: 'SS' } };

describe('replayActionOf: repetir una acción del turno (robo, cambio de lanzador, emergente)', () => {
    it('robo: a qué base, quién roba (id del box) y lo celebra el equipo al bate; con su propia clave de repetición', () => {
        const atBats = [ab(0, 'field_out'), ab(1, 'single'), ab(2, 'single'), ab(3, 'single', { actions: [MOUND, STEAL_2B] })];
        const event = replayActionOf(withBox(atBats), 3, 1);
        expect(event).toMatchObject({
            key: 'replay-3-1',
            kind: 'steal',
            replay: true,
            atBat: atBats[3],
            steal: { base: 2, caught: false, runner: { id: 12345678, name: 'Juan Prueba' } }
        });
        expect(event?.team.abbrev).toBe('UNO');
        expect(event?.rival.abbrev).toBe('DOS');
    });

    it('atrapado robando (también en home): lo celebra la defensa', () => {
        const atBats = [ab(0, 'field_out', { actions: [CAUGHT_3B, CAUGHT_HOME] })];
        const third = replayActionOf(withBox(atBats), 0, 0);
        expect(third).toMatchObject({ key: 'replay-0-0', kind: 'steal', replay: true, steal: { base: 3, caught: true } });
        expect(third?.team.abbrev).toBe('DOS');
        expect(third?.rival.abbrev).toBe('UNO');
        expect(replayActionOf(withBox(atBats), 0, 1)).toMatchObject({ key: 'replay-0-1', steal: { base: 4, caught: true } });
    });

    it('cambio de lanzador: quién entra y quién sale (con su línea del box), del equipo que defiende', () => {
        const atBats = [ab(0, 'field_out', { pitcher: { id: 87654321, name: 'Juan Abridor', hand: 'R' } }), ab(1, 'single', { pitcher: { id: 11223344, name: 'Pedro Relevista', hand: 'R' }, actions: [CHANGE] })];
        const event = replayActionOf(withBox(atBats), 1, 0);
        expect(event).toMatchObject({ key: 'replay-1-0', kind: 'pitchingChange', replay: true });
        expect(event?.team.abbrev).toBe('DOS');
        expect(event?.change?.in).toEqual({ id: 11223344, name: 'Pedro Relevista' });
        expect(event?.change?.out).toEqual({ id: 87654321, name: 'Juan Abridor' });
        expect(event?.change?.line).toMatchObject({ ip: '5.1', k: 6, np: 88 });
    });

    it('cambio de lanzador sin nombres en la narración: entra el del turno y sale el último que lanzó en esa media', () => {
        const otro = { id: 55555555, name: 'Lanzador Otro', hand: 'L' };
        const atBats = [
            ab(0, 'field_out', { pitcher: { id: 87654321, name: 'Juan Abridor', hand: 'R' } }),
            ab(1, 'field_out', { top: false, pitcher: otro }),
            ab(2, 'single', { pitcher: { id: 11223344, name: 'Pedro Relevista', hand: 'R' }, actions: [{ event: 'pitching_substitution', desc: '' }] })
        ];
        const event = replayActionOf(game(atBats), 2, 0);
        expect(event?.change?.in).toEqual({ id: 11223344, name: 'Pedro Relevista' });
        // No el de la otra media (el del turno 1), sino el que le lanzaba a este mismo equipo
        expect(event?.change?.out).toEqual({ id: 87654321, name: 'Juan Abridor' });
    });

    it('emergente al bate y corredor emergente: quién entra y por quién, del equipo al bate', () => {
        const atBats = [ab(0, 'single', { actions: [PINCH_HITTER] }), ab(1, null, { complete: false, actions: [PINCH_RUNNER] })];
        const hitter = replayActionOf(game(atBats), 0, 0);
        expect(hitter).toMatchObject({
            key: 'replay-0-0',
            kind: 'pinchHitter',
            replay: true,
            sub: { in: { id: 12345678, name: 'Juan Prueba' }, out: { id: 87654321, name: 'Pedro Prueba' } }
        });
        expect(hitter?.team.abbrev).toBe('UNO');
        // También el turno que está en curso
        expect(replayActionOf(game(atBats), 1, 0)).toMatchObject({ key: 'replay-1-0', kind: 'pinchRunner', replay: true });
    });

    it('el turno en curso: su robo se repite aunque el turno no haya terminado', () => {
        const atBats = [ab(0, 'single'), ab(1, null, { pitches: [{ r: 'ball' } as AtBat['pitches'][number]], actions: [STEAL_2B] })];
        expect(replayEventOf(withBox(atBats), 1)).toBeNull();
        expect(replayActionOf(withBox(atBats), 1, 0)).toMatchObject({ key: 'replay-1-0', kind: 'steal', replay: true, steal: { base: 2, caught: false } });
    });

    it('sin animación (visita al montículo, wild pitch, cambio defensivo) o índice que no existe → null', () => {
        const atBats = [ab(0, 'single', { actions: [MOUND, WILD, DEFENSIVE, { event: 'stolen_base_1b', desc: 'Base rara.' }] })];
        const g = withBox(atBats);
        expect(replayActionOf(g, 0, 0)).toBeNull();
        expect(replayActionOf(g, 0, 1)).toBeNull();
        expect(replayActionOf(g, 0, 2)).toBeNull();
        // Un robo con una base que no se entiende tampoco
        expect(replayActionOf(g, 0, 3)).toBeNull();
        // Acción o turno que no existen
        expect(replayActionOf(g, 0, 4)).toBeNull();
        expect(replayActionOf(g, 0, -1)).toBeNull();
        expect(replayActionOf(g, 99, 0)).toBeNull();
    });
});

describe('replayEventOf: el error y el turno que cerró un corredor', () => {
    it('se embasa por error: tipo «error», corren las bases del turno anterior de la misma media y las carreras del marcador', () => {
        const atBats = [ab(0, 'single', { post: 1 }), ab(1, 'walk', { post: 3 }), ab(2, 'field_error', { post: 7, away: 1, scoring: true, desc: 'Juan Prueba reaches on a fielding error.' })];
        const event = replayEventOf(game(atBats), 2);
        expect(event).toMatchObject({
            key: 'replay-2',
            kind: 'error',
            reach: 'error',
            replay: true,
            bases: { first: true, second: true, third: false },
            runs: { before: 0, after: 1 },
            atBat: atBats[2]
        });
        // Lo celebra el que batea (como un hit)
        expect(event?.team.abbrev).toBe('UNO');
        expect(event?.rival.abbrev).toBe('DOS');
    });

    it('interferencia del receptor o de un fildeador: tipo «error» con reach «interference»; primero de la media sin nadie en base', () => {
        const atBats = [ab(0, 'catcher_interf'), ab(1, 'fielder_interference', { top: false })];
        expect(replayEventOf(game(atBats), 0)).toMatchObject({ kind: 'error', reach: 'interference', bases: { first: false, second: false, third: false } });
        expect(replayEventOf(game(atBats), 1)).toMatchObject({ kind: 'error', reach: 'interference', bases: { first: false, second: false, third: false } });
        expect(replayEventOf(game(atBats), 1)?.team.abbrev).toBe('DOS');
    });

    it('el turno lo cerró un atrapado robando: se repite el último robo del turno (con la clave de esa acción)', () => {
        const atBats = [ab(0, 'single', { post: 1 }), ab(1, 'caught_stealing_3b', { outs: 3, actions: [STEAL_2B, MOUND, CAUGHT_3B] })];
        const event = replayEventOf(withBox(atBats), 1);
        expect(event).toMatchObject({ key: 'replay-1-2', kind: 'steal', replay: true, steal: { base: 3, caught: true, runner: { id: 12345678, name: 'Juan Prueba' } } });
        expect(event?.team.abbrev).toBe('DOS');
        expect(event).toEqual(replayActionOf(withBox(atBats), 1, 2));
    });

    it('si el resultado del turno se anima, se repite el resultado (no el robo que pasó durante el turno)', () => {
        const atBats = [ab(0, 'single', { actions: [STEAL_2B] })];
        expect(replayEventOf(withBox(atBats), 0)).toMatchObject({ key: 'replay-0', kind: 'single' });
        // Sin animación y sin robos: nada
        expect(replayEventOf(withBox([ab(0, 'fielders_choice', { actions: [MOUND, WILD] })]), 0)).toBeNull();
    });
});

describe('newPlayEvents: las acciones en vivo salen igual que antes (misma clave y la misma animación que la repetición)', () => {
    it('emergente, robo y cambio de lanzador con sus claves de siempre (sub-/act-), antes del resultado del turno', () => {
        const prev = withBox([ab(0, 'field_out'), ab(1, null)]);
        const atBat = ab(1, 'field_error', { pitcher: { id: 11223344, name: 'Pedro Relevista', hand: 'R' }, actions: [PINCH_HITTER, MOUND, STEAL_2B, CHANGE] });
        const next = withBox([ab(0, 'field_out'), atBat]);
        const events = newPlayEvents(prev, next);
        expect(events.map((event) => [event.key, event.kind])).toEqual([
            ['sub-1-0', 'pinchHitter'],
            ['act-1-2', 'steal'],
            ['act-1-3', 'pitchingChange'],
            ['ab-1', 'error']
        ]);
        expect(events[3].reach).toBe('error');
        // La repetición es la misma animación, solo cambia la clave y la marca de repetición
        for (const [index, live] of [
            [0, events[0]],
            [2, events[1]],
            [3, events[2]]
        ] as const) {
            const replay = replayActionOf(next, 1, index);
            expect(replay?.replay).toBe(true);
            expect(replay?.key).toBe(`replay-1-${index}`);
            expect({ ...replay, key: live.key, replay: undefined }).toEqual(live);
        }
    });

    it('las acciones que ya se habían visto no se repiten en vivo; las nuevas mantienen su índice en la clave', () => {
        const prev = withBox([ab(0, null, { actions: [STEAL_2B] })]);
        const next = withBox([ab(0, null, { actions: [STEAL_2B, MOUND, CAUGHT_3B] })]);
        expect(newPlayEvents(prev, next).map((event) => event.key)).toEqual(['act-0-2']);
    });
});

describe('replayGate: una repetición a la vez y con pausa entre una y otra', () => {
    it('mientras sale una, los toques se ignoran (ni la reinician ni hacen cola)', () => {
        const playing = replayGate.start(replayGate.idle, 1000)!;
        expect(playing).toEqual({ playing: true, readyAt: 0 });
        expect(replayGate.allowed(playing, 1500)).toBe(false);
        expect(replayGate.start(playing, 1500)).toBeNull();
        expect(replayGate.start(playing, 60_000)).toBeNull();
    });

    it(`al terminar hay ${REPLAY_COOLDOWN_MS} ms de pausa (y terminar dos veces no la alarga)`, () => {
        expect(REPLAY_COOLDOWN_MS).toBe(1200);
        const ended = replayGate.end(replayGate.start(replayGate.idle, 1000)!, 3000);
        expect(ended).toEqual({ playing: false, readyAt: 4200 });
        expect(replayGate.start(ended, 3001)).toBeNull();
        expect(replayGate.start(ended, 4199)).toBeNull();
        expect(replayGate.start(ended, 4200)).toEqual({ playing: true, readyAt: 4200 });
        expect(replayGate.end(ended, 4100)).toBe(ended);
    });

    it('cuatro toques seguidos en la misma jugada la repiten una sola vez', () => {
        let gate: ReplayGateState = replayGate.idle;
        let replays = 0;
        const tap = (now: number) => {
            const started = replayGate.start(gate, now);
            if (!started) return;
            gate = started;
            replays += 1;
        };
        [0, 80, 160, 240].forEach(tap);
        expect(replays).toBe(1);
        // Termina a los 2,3 s: los toques durante la pausa tampoco cuentan; después, sí
        gate = replayGate.end(gate, 2300);
        [2400, 3000, 3499].forEach(tap);
        expect(replays).toBe(1);
        tap(3500);
        expect(replays).toBe(2);
    });
});
