import { describe, expect, it } from 'vitest';
import { REPLAY_COOLDOWN_MS, replayEventOf, replayGate, type ReplayGateState } from './playEvents';
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

    it('sin animación: error, turno en curso o que no existe → null', () => {
        const atBats = [ab(0, 'field_error'), ab(1, 'single'), ab(2, null, { pitches: [{ r: 'ball' } as AtBat['pitches'][number]] })];
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
