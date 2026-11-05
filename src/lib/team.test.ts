import { describe, expect, it } from 'vitest';
import { headToHead, nextGame, standingOf, summarize, teamResults, versusAll } from './team';
import { compareShares } from '../components/compare/CompareSheet';
import { dialPositions } from '../components/ui/ActionDial';
import type { ScheduleGame, Standings } from '../types';

// Equipos y juegos de prueba (ids de LIDOM, marcadores inventados)
const team = (id: number, abbrev: string, score: number | null) => ({ id, abbrev, name: abbrev, logo: '', color: '#000', record: null, score, isWinner: false, probable: null });
let pk = 1;
const game = (day: string, away: [number, string, number | null], home: [number, string, number | null], state: ScheduleGame['state'] = 'final', detailedState = 'Final') =>
    ({ gamePk: pk++, league: 'lidom', date: `${day}T23:00:00Z`, state, detailedState, gameType: 'R', description: null, venue: '', scheduledInnings: 9, inningsPlayed: 9, away: team(...away), home: team(...home), live: null, decisions: null }) as ScheduleGame;

const LIC = 672;
const games = [
    game('2026-10-20', [LIC, 'LIC', 5], [671, 'ESC', 3]),
    game('2026-10-21', [669, 'EST', 2], [LIC, 'LIC', 1]),
    game('2026-10-22', [LIC, 'LIC', 4], [669, 'EST', 3]),
    game('2026-10-23', [671, 'ESC', 0], [LIC, 'LIC', 6]),
    game('2026-10-24', [LIC, 'LIC', 2], [667, 'AGU', 2], 'final', 'Postponed'),
    game('2026-10-25', [668, 'TOR', 1], [LIC, 'LIC', 7]),
    game('2026-10-28', [LIC, 'LIC', null], [670, 'GIG', null], 'preview', 'Scheduled'),
    game('2026-10-30', [669, 'EST', null], [LIC, 'LIC', null], 'preview', 'Scheduled')
];

describe('página del equipo: sus juegos de la temporada', () => {
    const results = teamResults(games, LIC);

    it('solo los terminados (sin pospuestos), vistos desde el equipo y del más viejo al más nuevo', () => {
        expect(results.map((result) => [result.opponent.abbrev, result.home, result.runs, result.allowed, result.won])).toEqual([
            ['ESC', false, 5, 3, true],
            ['EST', true, 1, 2, false],
            ['EST', false, 4, 3, true],
            ['ESC', true, 6, 0, true],
            ['TOR', true, 7, 1, true]
        ]);
    });

    it('récord, carreras, en casa y de visita, por una carrera y la racha', () => {
        const summary = summarize(results);
        expect(summary).toMatchObject({ w: 4, l: 1, rs: 23, ra: 9, home: { w: 2, l: 1 }, away: { w: 2, l: 0 }, oneRun: { w: 1, l: 1 }, streak: { won: true, n: 3 } });
        expect(summary.last10).toHaveLength(5);
        expect(summarize([]).streak).toBeNull();
    });

    it('contra cada rival (los de más juegos primero) y entre dos', () => {
        expect(versusAll(results).map((row) => [row.team.abbrev, row.w, row.l, row.rs, row.ra])).toEqual([
            ['ESC', 2, 0, 11, 3],
            ['EST', 1, 1, 5, 5],
            ['TOR', 1, 0, 7, 1]
        ]);
        expect(headToHead(results, 669)).toMatchObject({ w: 1, l: 1 });
        expect(headToHead(results, 667)).toBeNull();
    });

    it('el próximo juego: el que está en vivo o el siguiente por jugar', () => {
        const now = Date.parse('2026-10-26T12:00:00Z');
        expect(nextGame(games, now)?.away.abbrev).toBe('LIC');
        const live = [...games, game('2026-10-26', [LIC, 'LIC', 1], [671, 'ESC', 0], 'live', 'In Progress')];
        expect(nextGame(live, now)?.state).toBe('live');
        expect(nextGame(games, Date.parse('2026-11-05T12:00:00Z'))).toBeNull();
    });

    it('su fila en las posiciones de la fase que se juega (o la regular)', () => {
        const row = (id: number, rank: number) => ({ rank, team: { id, name: '', shortName: '', abbrev: '', logo: '', color: '', flag: null }, wins: 1, losses: 1, gamesPlayed: 2, pct: '.500', gamesBack: '-', streak: '', lastTen: null });
        const standings = { type: 'lidom', season: 2026, isPreviousSeason: false, activePhase: 'roundRobin', regular: [row(LIC, 2), row(667, 6)], roundRobin: [row(LIC, 1)], final: [], roundRobinInfo: null } as unknown as Standings;
        expect(standingOf(standings, LIC)).toMatchObject({ phase: 'roundRobin', total: 1, row: { rank: 1 } });
        // Eliminado: se queda con la regular
        expect(standingOf(standings, 667)).toMatchObject({ phase: 'regular', total: 2, row: { rank: 6 } });
        expect(standingOf(undefined, LIC)).toBeNull();
    });
});

describe('comparar y el botón flotante', () => {
    it('la barra: el mejor se lleva más (también en lo que menos es mejor), con un mínimo para que se vea', () => {
        expect(compareShares(3, 1, true)).toEqual([75, 25]);
        expect(compareShares(2.0, 6.0, false)).toEqual([75, 25]);
        expect(compareShares(0, 0, true)).toEqual([50, 50]);
        expect(compareShares(100, 0, true)).toEqual([96, 4]);
        expect(compareShares(null, 2, true)).toBeNull();
    });

    it('las opciones van en un cuarto de círculo: de la izquierda hacia arriba', () => {
        expect(dialPositions(4)).toEqual([
            { x: -156, y: -0 },
            { x: -135, y: -78 },
            { x: -78, y: -135 },
            { x: 0, y: -156 }
        ]);
        // Todas a la misma distancia del botón (salvo el redondeo a píxeles)
        dialPositions(3).forEach(({ x, y }) => expect(Math.abs(Math.hypot(x, y) - 128)).toBeLessThan(1));
    });
});
