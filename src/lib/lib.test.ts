import { describe, it, expect } from 'vitest';
import { gameInterval, scheduleInterval } from './polling';
import { atBatForZone, arsenal, battedBalls, describePlay, eventName, inningName, pitchCallName, pitchTypeName, stateName } from './baseball';
import { dayKey, dayRange, seasonLabel } from './format';
import { nameKey, photoSources } from './photos';
import type { AtBat, GameDetail, Pitch, Schedule, ScheduleGame } from '../types';

const NOW = Date.parse('2026-11-20T23:00:00Z');
const MIN = 60 * 1000;

const pitch = (overrides: Partial<Pitch> = {}): Pitch => ({
    n: 1, x: 0, z: 2.5, top: 3.4, bot: 1.6, r: 'strike', code: 'C', call: 'Called Strike', type: 'FF', typeDesc: 'Four-Seam Fastball',
    mph: 95, spin: 2300, zone: 5, b: 0, s: 1, ...overrides
});

const atBat = (i: number, pitches: Pitch[], complete = true): AtBat => ({
    i, inning: 1, top: true, complete, scoring: false,
    batter: { id: i, name: `Bateador ${i}`, side: 'R' }, pitcher: { id: 99, name: 'Lanzador', hand: 'R' },
    event: complete ? 'strikeout' : null, eventLabel: complete ? 'Strikeout' : null, desc: '', rbi: 0, away: 0, home: 0, outs: 1, pitches, actions: []
});

describe('polling', () => {
    const game = (state: GameDetail['state'], startsInMin = 0, detailedState = 'Scheduled') =>
        ({ state, detailedState, date: new Date(NOW + startsInMin * MIN).toISOString() }) as GameDetail;

    it('juego en vivo cada ~5 s, terminado nunca', () => {
        const live = gameInterval(game('live'), NOW) as number;
        expect(live).toBeGreaterThanOrEqual(5000);
        expect(live).toBeLessThan(6000);
        expect(gameInterval(game('final'), NOW)).toBe(false);
    });

    it('un juego que empieza en horas sigue revisándose (antes se quedaba congelado)', () => {
        expect(gameInterval(game('preview', 180), NOW)).toBe(15 * MIN);
        expect(gameInterval(game('preview', 45), NOW)).toBe(3 * MIN);
        expect(gameInterval(game('preview', -10, 'Delayed Start'), NOW)).toBeLessThan(15000);
    });

    it('calendario: rápido con juegos en vivo y despierta antes del próximo juego', () => {
        const schedule = (games: Partial<ScheduleGame>[]) => ({ games }) as Schedule;
        expect(scheduleInterval(schedule([{ state: 'live', detailedState: 'In Progress', date: '' }]), NOW)).toBeLessThan(12000);
        expect(scheduleInterval(schedule([{ state: 'preview', detailedState: 'Scheduled', date: new Date(NOW + 60 * MIN).toISOString() }]), NOW)).toBe(10 * MIN);
        expect(scheduleInterval(schedule([{ state: 'preview', detailedState: 'Scheduled', date: new Date(NOW + 8 * MIN).toISOString() }]), NOW)).toBe(3 * MIN);
        expect(scheduleInterval(schedule([{ state: 'final', detailedState: 'Final', date: '' }]), NOW)).toBe(30 * MIN);
    });
});

describe('zona de strike', () => {
    it('si el turno actual no tiene pitcheos, muestra el anterior', () => {
        const game = { state: 'live', currentAtBat: 1, atBats: [atBat(0, [pitch(), pitch({ n: 2 })]), atBat(1, [], false)] } as unknown as GameDetail;
        const { atBat: shown, isPrevious } = atBatForZone(game);
        expect(shown?.i).toBe(0);
        expect(isPrevious).toBe(true);
    });

    it('con pitcheos, muestra el turno actual', () => {
        const game = { state: 'live', currentAtBat: 1, atBats: [atBat(0, [pitch()]), atBat(1, [pitch()], false)] } as unknown as GameDetail;
        expect(atBatForZone(game)).toMatchObject({ atBat: { i: 1 }, isPrevious: false });
    });

    it('repertorio por tipo con porcentaje y velocidad', () => {
        const rows = arsenal([pitch({ mph: 96 }), pitch({ mph: 94 }), pitch({ type: 'SL', mph: 85, code: 'S' })], 'es');
        expect(rows[0]).toMatchObject({ type: 'FF', name: 'Recta 4 costuras', count: 2, avgMph: 95, maxMph: 96 });
        expect(rows[1]).toMatchObject({ type: 'SL', whiffs: 1 });
    });
});

describe('textos de béisbol', () => {
    it('traduce la jugada sin romper palabras', () => {
        expect(describePlay('Pedro Severino flies out sharply to center fielder Angel Martínez.', 'es')).toBe(
            'Pedro Severino batea elevado fuerte de out al jardinero central Angel Martínez.'
        );
        expect(describePlay('Junior Lake singles on a ground ball to shortstop José Tena. Dervy Ventura to 3rd.', 'es')).toBe(
            'Junior Lake conecta sencillo de rodado al campocorto José Tena. Dervy Ventura a 3ra.'
        );
        expect(describePlay('Enmanuel Valdez homers (1) on a fly ball to right field. Yefri Pérez scores.', 'es')).toBe(
            'Enmanuel Valdez conecta jonrón (1) de elevado al jardín derecho. Yefri Pérez anota.'
        );
        expect(describePlay('Enmanuel Valdez hits a grand slam (1) to right center field. Magneuris Sierra scores.', 'es')).toBe(
            'Enmanuel Valdez conecta grand slam (1) al jardín derecho-central. Magneuris Sierra anota.'
        );
        expect(describePlay('Ronny Peña called out on strikes.', 'en')).toBe('Ronny Peña called out on strikes.');
    });

    it('nombres de eventos, pitcheos, estados y entradas', () => {
        expect(eventName({ eventLabel: 'Groundout', event: 'field_out' }, 'es')).toBe('Rodado de out');
        expect(pitchTypeName({ type: 'SL', typeDesc: 'Slider' }, 'es')).toBe('Slider');
        expect(pitchTypeName({ type: 'ZZ', typeDesc: 'Rare Pitch' }, 'es')).toBe('Rare Pitch');
        expect(pitchCallName({ code: '*B', call: 'Ball In Dirt' }, 'es')).toBe('Bola en tierra');
        expect(stateName('Delayed: Rain', 'es')).toBe('Demorado');
        expect(stateName('Manager challenge: Tag play', 'es')).toBe('Revisión de video');
        expect(inningName({ n: 7, isTop: true }, 'es')).toBe('Alta 7');
        expect(inningName({ n: 7, isTop: false, state: 'Middle' }, 'en', true)).toBe('Mid 7');
    });
});

describe('fechas', () => {
    it('agrupa por día en hora de RD', () => {
        expect(dayKey('2026-11-21T02:30:00Z', 'America/Santo_Domingo')).toBe('2026-11-20');
        expect(dayRange('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
        expect(seasonLabel(2026, 'lidom')).toBe('2026-27');
        expect(seasonLabel(2026, 'wbc')).toBe('2026');
    });
});

describe('fotos de peloteros', () => {
    const index = { teams: { '668': { jhonnunez: '/api/v2/photos/668/jhon-nunez.jpg' } } };

    it('primero la foto con uniforme del equipo, después MLB y MiLB', () => {
        const sources = photoSources(660000, 'Núñez, Jhon', 668, index, 120);
        expect(sources.map((source) => source.kind)).toEqual(['team', 'mlb', 'milb']);
        expect(sources[0].url).toBe('/api/v2/photos/668/jhon-nunez.jpg');
        expect(sources[1].url).not.toContain('d_people'); // sin silueta genérica: si falta, 404 y pasa a MiLB
    });

    it('la foto del equipo solo se usa con ese equipo', () => {
        expect(photoSources(660000, 'Jhon Núñez', 669, index, 120).map((source) => source.kind)).toEqual(['mlb', 'milb']);
        expect(photoSources(null, 'Jhon Núñez', null, index, 120)).toEqual([]);
    });

    it('misma clave que el servidor', () => {
        expect(nameKey('Bryan De La Cruz')).toBe('bryandelacruz');
        expect(nameKey('Rudy Martin Jr.')).toBe('rudymartin');
    });
});

describe('mapa de batazos', () => {
    const pitch = (r: Pitch['r'], hit?: Pitch['hit']): Pitch => ({ n: 1, x: null, z: null, top: null, bot: null, r, code: null, call: '', type: null, typeDesc: null, mph: null, spin: null, zone: null, b: 0, s: 0, hit });
    const atBat = (i: number, event: string, top: boolean, pitches: Pitch[]) => ({ i, event, top, pitches }) as unknown as AtBat;

    it('una bola por turno, con su tipo y el equipo que batea', () => {
        const balls = battedBalls([
            atBat(0, 'home_run', true, [pitch('ball'), pitch('inplay', { ev: 104, la: 28, dist: 410, x: 60, y: 50 })]),
            atBat(1, 'single', false, [pitch('inplay', { ev: null, la: null, dist: null, x: 130, y: 120 })]),
            atBat(2, 'field_out', false, [pitch('inplay', { ev: null, la: null, dist: null, x: 110, y: 150 })]),
            atBat(3, 'strikeout', true, [pitch('strike'), pitch('strike'), pitch('strike')]),
            atBat(4, 'single', true, [pitch('inplay', { ev: 90, la: 10, dist: 200 })]) // sin coordenadas: no se pinta
        ]);
        expect(balls.map((ball) => [ball.atBat.i, ball.kind, ball.side])).toEqual([
            [0, 'hr', 'away'],
            [1, 'hit', 'home'],
            [2, 'out', 'home']
        ]);
    });
});
