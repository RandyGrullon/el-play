import { describe, expect, it } from 'vitest';
import { storyStatus } from './TeamStories';
import type { ScheduleGame } from '../../types';

// Equipos y juegos inventados (ids y siglas de prueba)
const AAA = 11111;
const BBB = 22222;
const CCC = 33333;
const team = (id: number, abbrev: string) => ({ id, abbrev, name: abbrev, logo: '', color: '#123456', record: null, score: null, isWinner: false, probable: null });
let pk = 900001;
const game = (away: [number, string], home: [number, string], state: ScheduleGame['state'], detailedState: string) =>
    ({ gamePk: pk++, league: 'lidom', date: '2099-01-01T23:00:00Z', state, detailedState, gameType: 'R', description: null, venue: '', scheduledInnings: 9, inningsPlayed: 0, away: team(...away), home: team(...home), live: null, decisions: null }) as ScheduleGame;

describe('anillo de las historias de equipos', () => {
    it('sin juego ese día: ninguno', () => {
        expect(storyStatus([game([BBB, 'BBB'], [CCC, 'CCC'], 'live', 'In Progress')], AAA)).toBe('none');
    });

    it('un juego: en vivo, terminado o más tarde', () => {
        expect(storyStatus([game([AAA, 'AAA'], [BBB, 'BBB'], 'live', 'In Progress')], AAA)).toBe('live');
        expect(storyStatus([game([AAA, 'AAA'], [BBB, 'BBB'], 'final', 'Final')], BBB)).toBe('final');
        expect(storyStatus([game([AAA, 'AAA'], [BBB, 'BBB'], 'preview', 'Scheduled')], AAA)).toBe('later');
    });

    it('doble cartelera: manda el que está en vivo, luego el que falta, y no el primero de la lista', () => {
        const first = game([AAA, 'AAA'], [BBB, 'BBB'], 'final', 'Final');
        expect(storyStatus([first, game([BBB, 'BBB'], [AAA, 'AAA'], 'live', 'In Progress')], AAA)).toBe('live');
        expect(storyStatus([first, game([BBB, 'BBB'], [AAA, 'AAA'], 'preview', 'Scheduled')], AAA)).toBe('later');
        expect(storyStatus([first, game([BBB, 'BBB'], [AAA, 'AAA'], 'final', 'Final')], AAA)).toBe('final');
    });

    it('pospuestos y cancelados no cuentan (aunque lleguen como «final»)', () => {
        expect(storyStatus([game([AAA, 'AAA'], [BBB, 'BBB'], 'final', 'Postponed')], AAA)).toBe('none');
        expect(storyStatus([game([AAA, 'AAA'], [BBB, 'BBB'], 'final', 'Cancelled')], BBB)).toBe('none');
        // Doble cartelera con el primero pospuesto: cuenta el segundo
        expect(storyStatus([game([AAA, 'AAA'], [BBB, 'BBB'], 'final', 'Postponed'), game([BBB, 'BBB'], [AAA, 'AAA'], 'preview', 'Scheduled')], AAA)).toBe('later');
    });
});
