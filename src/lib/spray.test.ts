import { describe, expect, it } from 'vitest';
import type { AtBat, Pitch } from '../types';
import { parkFor, wallAt } from './flight';
import { directionOf, entryStagger, filterBalls, flightPath, replayStep, resultOf, sprayBalls, sprayStats, trajOf, zoneOf, zoneStats, DEFAULT_FILTERS, ENTRY_TOTAL_MS } from './spray';

const pitch = (hit?: Pitch['hit']): Pitch => ({ n: 1, x: null, z: null, top: null, bot: null, r: 'inplay', code: 'X', call: '', type: 'SL', typeDesc: 'Slider', mph: 86, spin: null, zone: null, b: 0, s: 0, hit });
const atBat = (i: number, event: string, top: boolean, hit: Pitch['hit'], side = 'R', hand = 'R') =>
    ({ i, event, top, inning: 1, pitches: [pitch(hit)], batter: { id: 12345678 + (top ? 0 : 1), name: top ? 'Pelotero Uno' : 'Pelotero Dos', side }, pitcher: { id: 87654321, name: 'Lanzador Uno', hand } }) as unknown as AtBat;
// Gameday: 2,5 pies por unidad, home en 125.42, 198.27
const at = (deg: number, feet: number) => ({ x: 125.42 + (Math.sin((deg * Math.PI) / 180) * feet) / 2.5, y: 198.27 - (Math.cos((deg * Math.PI) / 180) * feet) / 2.5 });
const park = parkFor('Estadio Quisqueya');

describe('mapa de batazos: lógica', () => {
    const balls = sprayBalls(
        [
            atBat(0, 'home_run', true, { ev: 106, la: 28, dist: 420, ...at(0, 380), traj: 'fly_ball', hard: 'hard' }),
            atBat(1, 'single', false, { ev: 92, la: 4, dist: 160, ...at(-30, 160), traj: 'ground_ball', hard: 'medium' }, 'L'),
            atBat(2, 'field_out', true, { ev: null, la: null, dist: null, ...at(30, 100), traj: 'popup', hard: null }),
            atBat(3, 'field_error', false, { ev: 80, la: -5, dist: 90, ...at(10, 90), traj: null, hard: 'soft' }, 'S', 'L')
        ],
        park
    );

    it('resultado por evento y tipo de batazo', () => {
        expect(['single', 'double', 'triple', 'home_run', 'field_error', 'field_out', 'sac_fly'].map(resultOf)).toEqual(['single', 'double', 'triple', 'hr', 'error', 'out', 'out']);
        expect(trajOf('line_drive', null, 200)).toBe('line');
        expect(trajOf(null, 55, 120)).toBe('popup');
        expect(trajOf(null, null, 100)).toBe('ground');
        expect(balls.map((ball) => ball.traj)).toEqual(['fly', 'ground', 'popup', 'ground']);
    });

    it('el jonrón cae detrás de la cerca', () => {
        const hr = balls[0];
        expect(Math.hypot(hr.land.x, hr.land.y)).toBeGreaterThan(wallAt(park, 0));
        expect(hr.dist).toBe(420);
    });

    it('filtros combinables', () => {
        expect(filterBalls(balls, { ...DEFAULT_FILTERS, team: 'away' }).map((ball) => ball.key)).toEqual([0, 2]);
        expect(filterBalls(balls, { ...DEFAULT_FILTERS, result: 'hits' }).map((ball) => ball.key)).toEqual([0, 1]);
        expect(filterBalls(balls, { ...DEFAULT_FILTERS, result: 'outs', team: 'away' }).map((ball) => ball.key)).toEqual([2]);
        expect(filterBalls(balls, { ...DEFAULT_FILTERS, traj: 'ground', batter: 12345679 }).map((ball) => ball.key)).toEqual([1, 3]);
    });

    it('vuelo: el rodado es recto con piques; el globito tiene más panza que la línea', () => {
        const ground = flightPath(balls[1]);
        expect(ground.bounces.length).toBe(3);
        expect(ground.control.x).toBeCloseTo(balls[1].land.x / 2, 6);
        const bulge = (traj: 'line' | 'popup', la: number) => {
            const path = flightPath({ land: { x: 0, y: 150 }, traj, la });
            return Math.abs(path.control.x);
        };
        expect(bulge('popup', 60)).toBeGreaterThan(bulge('line', 14));
    });

    it('zonas y dirección según la mano', () => {
        expect(zoneOf(balls[2])).toBe('IF');
        expect(zoneOf(balls[0])).toBe('CF');
        expect(zoneOf(balls[1])).toBe('LF');
        expect(zoneStats(balls).find((row) => row.zone === 'IF')).toEqual({ zone: 'IF', count: 2, hits: 0, pct: 50 });
        // Zurdo al left = contrario; ambidiestro contra zurdo batea a la derecha: al right-center (10°) es centro
        expect(directionOf(balls[1])).toBe('oppo');
        expect(directionOf(balls[2])).toBe('oppo');
        expect(directionOf(balls[3])).toBe('center');
    });

    it('números de lo filtrado', () => {
        const stats = sprayStats(balls);
        expect(stats.count).toBe(4);
        expect(stats.hits).toBe(2);
        expect(stats.hr).toBe(1);
        expect(stats.hardPct).toBe(33);
        expect(stats.avgEv).toBeCloseTo(92.7, 1);
        expect(stats.longest?.key).toBe(0);
        expect(stats.traj.ground).toBe(50);
        expect(sprayStats([]).hardPct).toBeNull();
    });

    it('tiempos de la entrada y de «Repetir»', () => {
        expect(79 * entryStagger(80) + 520 + 350).toBeLessThanOrEqual(ENTRY_TOTAL_MS + 1);
        expect(replayStep(10)).toBe(700);
        expect(replayStep(80) * 80).toBeLessThanOrEqual(20000);
    });
});
