import { afterEach, describe, it, expect, vi } from 'vitest';
import { gameInterval, scheduleInterval } from './polling';
import { atBatForZone, arsenal, battedBalls, battersFaced, inningBreak, isWhiff, pitchesByPitcher, describePlay, eventName, inningName, pitchCallName, pitchTypeName, stateName, weatherName, weatherTemp } from './baseball';
import { dayKey, dayRange, seasonLabel, surname } from './format';
import { nameKey, photoSources } from './photos';
import { forMode, newPlayEvents, outVariant, titleClinch } from './playEvents';
import { canAdd, creditsLeft, effectiveEntry, entryCost, perTeamLimit, fantasyInterval, gameStarted, getStore, isLocked, lockTime, nextLockAt, pickPoints, replaceStore, setPick, setStoreOwner, takeLegacyStore, teamPoints, unsettledDays, type DayEntry, type EntryHistory, type FantasyDay, type FantasyGame, type FantasyPlayer } from './fantasy';
import { SORTS, normalize, sortPlayers, type PlayerRow } from './stats';
import { camera, flightMs, flightOf, gamedayToFeet, groundAt, heightAt, parkFor, wallAt, wallCrossing } from './flight';
import { FIP_CONSTANT, battingAdvanced, fipConstantOf, fmtPct, fmtRate, pitchingAdvanced, pythagorean, setFipConstant } from './advanced';
import { leagueAverage, leagueRank, rankTeams, recordOf, teamSort, type TeamRow } from './teamStats';
import { percents, winProbability } from './winProbability';
import { showAlert } from '../hooks/useGameAlerts';
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
    it('en vivo, cuando entra un bateador nuevo la zona se limpia (su turno, aunque no tenga pitcheos)', () => {
        const game = { state: 'live', currentAtBat: 1, atBats: [atBat(0, [pitch(), pitch({ n: 2 })]), atBat(1, [], false)] } as unknown as GameDetail;
        expect(atBatForZone(game)).toMatchObject({ atBat: { i: 1, pitches: [] }, isPrevious: false });
    });

    it('fuera de vivo, si el último turno no tiene pitcheos, muestra el anterior', () => {
        const game = { state: 'final', currentAtBat: 1, atBats: [atBat(0, [pitch(), pitch({ n: 2 })]), atBat(1, [], true)] } as unknown as GameDetail;
        expect(atBatForZone(game)).toMatchObject({ atBat: { i: 0 }, isPrevious: true });
    });

    it('vista del lanzador por bateador: sus pitcheos en todos sus turnos', () => {
        const atBats = [atBat(0, [pitch(), pitch({ n: 2 })]), atBat(1, [pitch()]), { ...atBat(2, [pitch(), pitch({ n: 2 }), pitch({ n: 3 })]), batter: { id: 0, name: 'Bateador 0', side: 'R' } }];
        expect(pitchesByPitcher(atBats, 99, 0)).toHaveLength(5);
        expect(pitchesByPitcher(atBats, 99, 1)).toHaveLength(1);
        expect(pitchesByPitcher(atBats, 99)).toHaveLength(6);
        expect(battersFaced(atBats, 99).map((b) => b.id)).toEqual([0, 1]);
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

describe('animaciones de jugada: qué es nuevo entre dos lecturas del juego', () => {
    const team = (id: number, abbrev: string) => ({ id, abbrev, name: abbrev, logo: '', color: '#0069e0', record: null, teamName: abbrev, runs: 0, hits: 0, errors: 0, lob: 0, isWinner: false });
    const ab = (i: number, event: string | null, top = true, complete = true, pitcherId = 99): AtBat =>
        ({ ...atBat(i, [pitch()], complete), event, top, pitcher: { id: pitcherId, name: 'Lanzador', hand: 'R' } }) as AtBat;
    const game = (atBats: AtBat[], inning: { n: number; isTop: boolean; state: string }, state: GameDetail['state'] = 'live') =>
        ({ gamePk: 1, state, atBats, inning: { ordinal: '', ...inning }, away: team(672, 'LIC'), home: team(671, 'ESC') }) as unknown as GameDetail;

    it('al abrir el juego no se repite nada de lo que ya pasó', () => {
        expect(newPlayEvents(null, game([ab(0, 'home_run')], { n: 1, isTop: true, state: 'Top' }))).toEqual([]);
    });

    it('hit, jonrón y ponche: el protagonista es quien batea o, en el ponche, quien lanza', () => {
        const prev = game([ab(0, 'field_out'), ab(1, null, true, false)], { n: 1, isTop: true, state: 'Top' });
        const next = game([ab(0, 'field_out'), ab(1, 'double'), ab(2, 'home_run'), ab(3, 'strikeout'), ab(4, null, true, false)], { n: 1, isTop: true, state: 'Top' });
        const events = newPlayEvents(prev, next);
        expect(events.map((e) => [e.kind, e.team.abbrev])).toEqual([
            ['double', 'LIC'],
            ['hr', 'LIC'],
            ['k', 'ESC']
        ]);
        expect(events[2].strikeouts).toBe(1);
    });

    it('fin de media entrada: primero el out (del equipo que lo hizo) y después entra a batear el otro equipo', () => {
        const prev = game([ab(0, 'field_out')], { n: 3, isTop: true, state: 'Top' });
        const next = game([ab(0, 'field_out'), ab(1, 'field_out')], { n: 3, isTop: true, state: 'Middle' });
        const events = newPlayEvents(prev, next);
        expect(events.map((e) => [e.kind, e.team.abbrev])).toEqual([
            ['out', 'ESC'],
            ['inning', 'ESC']
        ]);
        expect(events[1]).toMatchObject({ key: 'inning-3-top', inning: { n: 3, isTop: true } });
    });

    it('jonrón que deja en el terreno sí anima aunque el juego ya diga final (pero sin fin de entrada)', () => {
        const prev = game([ab(0, null, false, false)], { n: 9, isTop: false, state: 'Bottom' });
        const next = game([ab(0, 'home_run', false)], { n: 9, isTop: false, state: 'End' }, 'final');
        expect(newPlayEvents(prev, next).map((e) => e.kind)).toEqual(['hr']);
    });
});

describe('victoria y campeonato al terminar el juego', () => {
    const series = (over: boolean, leaderId: number, wins: number, losses: number, total = 7, tied = false) =>
        ({ name: 'LIDOM Championship', game: wins + losses, total, over, tied, leaderId, wins, losses, championship: true }) as const;

    it('final de LIDOM: gana el juego 5 y la serie 4-1 (MLB ya lo contó o todavía no)', () => {
        expect(titleClinch(series(true, 671, 4, 1), 671)).toEqual({ champion: true, record: { wins: 4, losses: 1 } });
        expect(titleClinch(series(false, 671, 3, 1), 671)).toEqual({ champion: true, record: { wins: 4, losses: 1 } });
    });

    it('no es campeón si la serie sigue (el que va abajo gana, o empatada)', () => {
        expect(titleClinch(series(false, 671, 3, 1), 668)).toEqual({ champion: false, record: { wins: 2, losses: 3 } });
        expect(titleClinch(series(false, 671, 2, 2, 7, true), 668)).toEqual({ champion: false, record: { wins: 3, losses: 2 } });
    });

    it('final a un juego (Clásico, Serie del Caribe) y juegos que no son finales', () => {
        expect(titleClinch(series(true, 944, 1, 0, 1), 944).champion).toBe(true);
        expect(titleClinch({ ...series(true, 944, 1, 0, 1), championship: false }, 944).champion).toBe(false);
        expect(titleClinch(null, 944).champion).toBe(false);
    });

    it('al pasar de en vivo a final sale la victoria o el campeonato del ganador', () => {
        const team = (id: number, abbrev: string, isWinner: boolean) => ({ id, abbrev, name: abbrev, logo: '', color: '#E31837', record: null, teamName: abbrev, runs: isWinner ? 1 : 0, hits: 0, errors: 0, lob: 0, isWinner });
        const game = (state: GameDetail['state'], seriesStatus: unknown) =>
            ({ gamePk: 837760, league: 'lidom', state, atBats: [], inning: null, series: seriesStatus, away: team(668, 'TOR', false), home: team(671, 'ESC', state === 'final') }) as unknown as GameDetail;
        const champion = newPlayEvents(game('live', series(false, 671, 3, 1)), game('final', series(false, 671, 3, 1)));
        expect(champion.map((e) => [e.kind, e.team.abbrev, e.seriesRecord])).toEqual([['champion', 'ESC', { wins: 4, losses: 1 }]]);
        const win = newPlayEvents(game('live', null), game('final', null));
        expect(win.map((e) => [e.kind, e.team.abbrev])).toEqual([['win', 'ESC']]);
    });
});

describe('animación de emergentes', () => {
    const team = (id: number, abbrev: string) => ({ id, abbrev, name: abbrev, logo: '', color: '#0069e0', record: null, teamName: abbrev, runs: 0, hits: 0, errors: 0, lob: 0, isWinner: false });
    const sub = (pos: string) => ({ event: 'offensive_substitution', desc: '', sub: { pos, in: { id: 2, name: 'Entra' }, out: { id: 1, name: 'Sale' } } });
    const game = (actions: AtBat['actions']) =>
        ({ gamePk: 1, state: 'live', inning: null, atBats: [{ ...atBat(0, [], false), top: false, actions }], away: team(672, 'LIC'), home: team(671, 'ESC') }) as unknown as GameDetail;

    it('solo los cambios nuevos, del equipo al bate', () => {
        const events = newPlayEvents(game([sub('PH')]), game([sub('PH'), sub('PR'), { event: 'pitching_substitution', desc: '' }]));
        expect(events.map((e) => [e.kind, e.team.abbrev, e.sub?.in.name])).toEqual([['pinchRunner', 'ESC', 'Entra']]);
    });
});

describe('tipos de out', () => {
    const inplay = (traj: string | null) => pitch({ r: 'inplay', hit: { ev: null, la: null, dist: null, traj } });
    const play = (event: string, label: string, traj: string | null = null) => ({ event, eventLabel: label, pitches: [pitch(), inplay(traj)] });

    it('cada out con su tipo (trayectoria del batazo o etiqueta de MLB)', () => {
        expect(outVariant(play('field_out', 'Groundout', 'ground_ball'))).toBe('ground');
        expect(outVariant(play('field_out', 'Flyout', 'fly_ball'))).toBe('fly');
        expect(outVariant(play('field_out', 'Lineout', 'line_drive'))).toBe('line');
        expect(outVariant(play('field_out', 'Pop Out', 'popup'))).toBe('pop');
        expect(outVariant(play('field_out', 'Flyout'))).toBe('fly');
        expect(outVariant(play('force_out', 'Forceout', 'ground_ball'))).toBe('force');
        expect(outVariant(play('grounded_into_double_play', 'Grounded Into DP', 'ground_ball'))).toBe('dp');
        expect(outVariant(play('triple_play', 'Triple Play'))).toBe('tp');
        expect(outVariant(play('sac_fly', 'Sac Fly', 'fly_ball'))).toBe('sac');
    });

    it('hits, bases por bolas y ponches no son «out» (el ponche tiene su K)', () => {
        expect(outVariant(play('single', 'Single', 'line_drive'))).toBeNull();
        expect(outVariant(play('walk', 'Walk'))).toBeNull();
        expect(outVariant(play('strikeout', 'Strikeout'))).toBeNull();
        expect(outVariant(play('field_error', 'Field Error', 'ground_ball'))).toBeNull();
    });
});

describe('vuelo del jonrón a escala', () => {
    const atBat = (hit: Pitch['hit']) => ({ pitches: [{ hit: null }, { hit }] }) as unknown as AtBat;

    it('el parque: medidas de MLB en Quisqueya, Cibao y Tetelo; genérico (sin medidas a la vista) en los demás', () => {
        expect(parkFor('Estadio Quisqueya Juan Marichal')).toMatchObject({ left: 335, center: 411, right: 335, known: true });
        expect(parkFor('Estadio Cibao')).toMatchObject({ center: 385, known: true });
        expect(parkFor('Estadio Julian Javier')).toMatchObject({ known: false });
        const park = parkFor('Estadio Quisqueya Juan Marichal');
        expect(wallAt(park, -45)).toBe(335);
        expect(wallAt(park, 0)).toBe(411);
        expect(wallAt(park, 10)).toBeGreaterThan(park.rightCenter);
        expect(wallAt(park, 10)).toBeLessThan(411);
    });

    it('jonrones reales: hacia dónde salió, cuánto voló y qué tan alto', () => {
        expect(gamedayToFeet(125.42, 198.27)).toEqual({ x: 0, y: 0 });
        // Agustín Ramírez, 453 pies por el left (851464)
        const left = flightOf(atBat({ ev: 109.1, la: 22, dist: 453, x: 38.6, y: 36.9, traj: 'fly_ball' }))!;
        expect(left.deg).toBeLessThan(-15);
        expect(Math.hypot(left.land.x, left.land.y)).toBeCloseTo(453, 0);
        expect(left.apex).toBeGreaterThan(60);
        // Jesús Made, 408 por el right (851491); Carlos Jorge, 404 al center (851509)
        expect(flightOf(atBat({ ev: 106.8, la: 31, dist: 408, x: 219.3, y: 79.2, traj: 'fly_ball' }))!.deg).toBeGreaterThan(15);
        expect(Math.abs(flightOf(atBat({ ev: 100.1, la: 28, dist: 404, x: 118.6, y: 27.4, traj: 'fly_ball' }))!.deg)).toBeLessThan(5);
        // Sin distancia de MLB, la del punto marcado; sin punto, no hay vuelo (va la animación de siempre)
        expect(flightOf(atBat({ ev: null, la: null, dist: null, x: 125.42, y: 38.27, traj: 'fly_ball' }))!.dist).toBeCloseTo(400, 0);
        expect(flightOf(atBat({ ev: 100, la: 30, dist: 400 }))).toBeNull();
        expect(wallCrossing(left, parkFor('Estadio Quisqueya Juan Marichal'))).toBeGreaterThan(0.7);
    });

    it('la curva: sale del piso, sube hasta el pico al 58 % y vuelve a caer; el vuelo dura según la distancia', () => {
        const flight = { apex: 100 };
        expect(heightAt(flight, 0)).toBe(0);
        expect(heightAt(flight, 0.58)).toBe(100);
        expect(heightAt(flight, 1)).toBeCloseTo(0, 6);
        expect(groundAt(0)).toBe(0);
        expect(groundAt(1)).toBe(1);
        expect(groundAt(0.5)).toBeGreaterThan(0.5);
        expect(flightMs({ dist: 453 })).toBeGreaterThan(flightMs({ dist: 404 }));
    });

    it('la cámara: home abajo y la cerca del center más arriba que home', () => {
        const park = parkFor('Estadio Quisqueya Juan Marichal');
        const project = camera(park, 360, 250);
        const home = project(0, 0, 0);
        const center = project(0, 411, 0);
        const high = project(0, 200, 100);
        expect(home.y).toBeGreaterThan(center.y);
        expect(high.y).toBeLessThan(project(0, 200, 0).y);
        expect(home.y).toBeLessThanOrEqual(250);
    });
});

describe('fantasy sin trampas (igual que el servidor)', () => {
    // Juego 1 a las 17:00 (terminado), juego 2 a las 19:00 (terminado, ganó 669) y juego 3 con hora por definir
    // (en vivo, primer lanzamiento 23:10). Horas en ms como las escribe la base.
    const at = (hhmm: string) => Date.parse(`2026-10-17T${hhmm}:00Z`);
    const g = (gamePk: number, date: string, state: FantasyGame['state'], away: number, home: number, winner: number | null, extra: Partial<FantasyGame> = {}) => ({ gamePk, date, state, startTimeTBD: false, away: { id: away, isWinner: winner === away }, home: { id: home, isWinner: winner === home }, ...extra }) as unknown as FantasyGame;
    const p = (id: number, role: 'B' | 'P', teamId: number, gamePk: number, points: number): FantasyPlayer => ({ id, name: `P${id}`, teamId, gamePk, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: true, line: null, points });
    const DAY = {
        league: 'lidom' as const,
        date: '2026-10-17',
        teams: {},
        scoring: { batter: {}, pitcher: {} },
        games: [
            g(1, '2026-10-17T17:00:00Z', 'final', 672, 667, 672),
            g(2, '2026-10-17T19:00:00Z', 'final', 669, 671, 669),
            g(3, '2026-10-17T23:59:00Z', 'live', 668, 670, null, { startTimeTBD: true, firstPitch: '2026-10-17T23:10:00.000Z' })
        ] as unknown as FantasyGame[],
        players: [p(10, 'B', 672, 1, 6), p(11, 'B', 669, 2, 4), p(12, 'P', 667, 1, -3), p(13, 'B', 671, 2, 8), p(14, 'B', 668, 3, 2), p(15, 'B', 670, 3, 1), p(16, 'B', 667, 1, 0), p(17, 'B', 671, 2, 5)]
    } as FantasyDay;
    const open = (hhmm: string): [number, number | null][] => [[at(hhmm), null]];
    const entry = (lineup: number[], captain: number | null, picks: Record<string, number>, history?: Omit<EntryHistory, 'v'>): DayEntry => ({ lineup, captain, picks, savedAt: 1, ...(history ? { history: { v: 1, ...history } } : {}) });

    it('sin historial (lo del teléfono o filas de antes del arreglo) el equipo queda igual', () => {
        const saved = entry([10, 11], 10, { 1: 672 });
        expect(effectiveEntry(DAY, saved)).toBe(saved);
    });

    it('meter a un pelotero después de empezar su juego no cuenta; antes sí', () => {
        const saved = entry([10, 13], null, {}, { players: { 10: open('16:00'), 13: open('19:30') } });
        expect(effectiveEntry(DAY, saved).lineup).toEqual([10]);
        expect(teamPoints(DAY, effectiveEntry(DAY, saved))).toBe(6);
    });

    it('sacar a uno ya cerrado no lo saca: sigue contando con sus puntos (también los negativos)', () => {
        const saved = entry([10], null, {}, { players: { 10: open('16:00'), 12: [[at('16:00'), at('18:00')]] } });
        expect(effectiveEntry(DAY, saved).lineup).toEqual([10, 12]);
        expect(teamPoints(DAY, effectiveEntry(DAY, saved))).toBe(3);
        // Sacarlo antes de que empiece sí vale (y volver a meterlo tarde no)
        const early = entry([10, 12], null, {}, { players: { 10: open('16:00'), 12: [[at('15:00'), at('16:30')], [at('17:30'), null]] } });
        expect(effectiveEntry(DAY, early).lineup).toEqual([10]);
    });

    it('capitán: cambiarlo cuando el suyo ya empezó no vale; cambiarlo antes, sí', () => {
        const players = { 10: open('16:00'), 11: open('16:00') };
        const late = entry([10, 11], 11, {}, { players, captain: [[10, at('16:00')], [11, at('18:00')]] });
        expect(effectiveEntry(DAY, late).captain).toBe(10);
        expect(teamPoints(DAY, effectiveEntry(DAY, late))).toBe(9 + 4);
        const early = entry([10, 11], 11, {}, { players, captain: [[10, at('16:00')], [11, at('16:30')]] });
        expect(effectiveEntry(DAY, early).captain).toBe(11);
        // Ponerle la banda a uno cuyo juego ya empezó: sin capitán
        const tooLate = entry([10, 11], 11, {}, { players, captain: [[11, at('19:30')]] });
        expect(effectiveEntry(DAY, tooLate).captain).toBe(null);
    });

    it('pronósticos: cuenta el que había al empezar cada juego', () => {
        const saved = entry([], null, { 1: 667, 2: 669 }, { players: {}, picks: { 1: [[672, at('16:00')], [667, at('17:30')]], 2: [[671, at('18:00')], [669, at('18:59')]] } });
        expect(effectiveEntry(DAY, saved).picks).toEqual({ 1: 672, 2: 669 });
        expect(pickPoints(DAY, effectiveEntry(DAY, saved))).toBe(20);
    });

    it('quien quitó a uno cerrado para meter a otro se pasa del cupo: sobra el que entró de último', () => {
        const players: EntryHistory['players'] = { 10: [[at('15:00'), at('18:00')]], 11: open('15:00'), 13: open('15:01'), 14: open('15:02'), 15: open('15:03'), 17: open('18:00') };
        const saved = entry([11, 13, 14, 15, 17], null, {}, { players });
        // 17 es del mismo equipo que 13 (671) pero el cupo que sobra es el de bateadores
        expect(effectiveEntry(DAY, saved).lineup).toEqual([11, 13, 14, 15, 10]);
    });

    it('hora por definir: se cierra con el primer lanzamiento; si no ha empezado, sigue abierto', () => {
        expect(effectiveEntry(DAY, entry([14], null, {}, { players: { 14: open('23:20') } })).lineup).toEqual([]);
        expect(effectiveEntry(DAY, entry([14], null, {}, { players: { 14: open('23:00') } })).lineup).toEqual([14]);
        expect(lockTime({ state: 'preview', date: '2026-10-17T23:59:00Z', startTimeTBD: true })).toBe(Infinity);
        expect(lockTime({ state: 'live', date: '2026-10-17T23:59:00Z', startTimeTBD: true })).toBe(at('23:59'));
        // Juego programado que empezó antes de su hora: se cierra con el primer lanzamiento
        expect(lockTime({ state: 'live', date: '2026-10-17T19:00:00Z', startTimeTBD: false, firstPitch: '2026-10-17T18:55:00Z' })).toBe(at('18:55'));
    });

    it('fila de antes del arreglo que cambió después (lo viejo con hora 0): lo viejo cuenta, lo tardío no', () => {
        const saved = entry([10, 13], 10, { 1: 672 }, { players: { 10: [[0, null]], 13: open('19:05') }, captain: [[10, 0]], picks: { 1: [[672, 0]] } });
        expect(effectiveEntry(DAY, saved)).toMatchObject({ lineup: [10], captain: 10, picks: { 1: 672 } });
    });
});

describe('fantasy con créditos (igual que el servidor)', () => {
    const p = (id: number, role: 'B' | 'P', teamId: number, price: number): FantasyPlayer => ({ id, name: `P${id}`, teamId, gamePk: 1, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: false, line: null, points: 0, price });
    const day = (credits: FantasyDay['credits'] | null = { budget: 50, min: 4, max: 12 }) =>
        ({
            league: 'lidom',
            date: '2026-10-18',
            teams: {},
            scoring: { batter: {}, pitcher: {} },
            games: [{ gamePk: 1, date: '2099-10-18T23:00:00Z', state: 'preview', startTimeTBD: false, away: { id: 1 }, home: { id: 2 } }],
            players: [p(1, 'B', 1, 12), p(2, 'B', 2, 12), p(3, 'B', 3, 12), p(4, 'B', 4, 12), p(5, 'B', 5, 4), p(6, 'P', 6, 6)],
            ...(credits ? { credits } : {})
        }) as unknown as FantasyDay;
    const entry = (lineup: number[], captain: number | null = null): DayEntry => ({ lineup, captain, picks: {}, savedAt: 1 });

    it('con un solo juego el máximo por equipo es 3 (como el servidor y la app)', () => {
        expect(perTeamLimit(day())).toBe(3);
        const d = { ...day(null), players: [p(1, 'B', 1, 5), p(2, 'B', 1, 5), p(3, 'B', 1, 5), p(4, 'B', 1, 5)] } as FantasyDay;
        expect(canAdd(d, entry([1, 2]), d.players[2])).toBe(null);
        expect(canAdd(d, entry([1, 2, 3]), d.players[3])).toBe('team');
    });

    it('cuánto cuesta y cuánto queda', () => {
        expect(entryCost(day(), entry([1, 2, 5, 6]))).toBe(34);
        expect(creditsLeft(day(), entry([1, 2, 5, 6]))).toBe(16);
        expect(creditsLeft(day(null), entry([1]))).toBe(null);
    });

    it('no deja agregar a quien no alcanza; sin créditos ese día, sí', () => {
        const d = day();
        expect(canAdd(d, entry([1, 2, 5]), d.players[5])).toBe(null); // 28 + 6 = 34
        expect(canAdd(d, entry([1, 2, 3, 4]), d.players[5])).toBe('budget'); // 48 + 6 = 54
        expect(canAdd(day(null), entry([1, 2, 3, 4]), day(null).players[5])).toBe(null);
    });

    it('el equipo que cuenta respeta el presupuesto (sobran los últimos)', () => {
        expect(effectiveEntry(day(), entry([1, 2, 3, 4, 5, 6], 6))).toMatchObject({ lineup: [1, 2, 3, 4], captain: null });
        const fine = entry([1, 5, 6], 1);
        expect(effectiveEntry(day(), fine)).toBe(fine);
    });
});

describe('fantasy: reglas del equipo del día', () => {
    const player = (id: number, teamId: number, role: 'B' | 'P', points: number, gamePk = 1): FantasyPlayer => ({ id, name: `P${id}`, teamId, gamePk, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: true, line: null, points });
    const game = (gamePk: number, state: string, awayWins = false, date = '2026-10-17T21:00:00Z') =>
        ({ gamePk, state, detailedState: 'Scheduled', date, away: { id: 10, isWinner: awayWins }, home: { id: 20, isWinner: !awayWins && state === 'final' } }) as unknown as FantasyGame;
    // Una hora antes de los juegos de prueba (las reglas miran la hora: no dependen del reloj de la máquina)
    const BEFORE = Date.parse('2026-10-17T20:00:00Z');
    const day = (players: FantasyPlayer[], games: FantasyGame[]) => ({ league: 'lidom', date: '2026-10-17', games, teams: {}, players, scoring: { batter: {}, pitcher: {} } }) as unknown as FantasyDay;
    const entry = (lineup: number[], captain: number | null = null, picks: Record<string, number> = {}): DayEntry => ({ lineup, captain, picks, savedAt: 1 });

    it('5 bateadores, 1 lanzador, máximo 2 por equipo y cerrado si su juego empezó', () => {
        const players = [player(1, 10, 'B', 0), player(2, 10, 'B', 0), player(3, 10, 'B', 0), player(4, 20, 'P', 0), player(5, 20, 'P', 0), player(6, 30, 'B', 0, 2)];
        // Dos juegos con cuatro equipos: el máximo por equipo es 2
        const d = day(players, [game(1, 'preview'), { ...game(2, 'live'), away: { id: 30, isWinner: false }, home: { id: 40, isWinner: false } } as FantasyGame]);
        expect(canAdd(d, entry([1, 2]), players[2], BEFORE)).toBe('team');
        expect(canAdd(d, entry([4]), players[4], BEFORE)).toBe('full');
        expect(canAdd(d, entry([]), players[5], BEFORE)).toBe('locked');
        expect(canAdd(d, entry([1]), players[0], BEFORE)).toBe('already');
        expect(canAdd(d, entry([1]), players[1], BEFORE)).toBeNull();
        expect(isLocked(d, players[5], BEFORE)).toBe(true);
    });

    it('se cierra al llegar la hora del juego aunque el servidor todavía diga «previa»', () => {
        const players = [player(1, 10, 'B', 0), player(2, 20, 'B', 0, 2), player(3, 30, 'B', 0, 9)];
        const d = day(players, [game(1, 'preview'), game(2, 'preview', false, '2026-10-17T23:30:00Z')]);
        const start = Date.parse('2026-10-17T21:00:00Z');
        expect(isLocked(d, players[0], start - 1000)).toBe(false);
        expect(isLocked(d, players[0], start)).toBe(true);
        expect(canAdd(d, entry([]), players[0], start + 60 * 1000)).toBe('locked');
        // El de las 7:30 sigue abierto; uno cuyo juego no está en el día no se cierra
        expect(isLocked(d, players[1], start + 60 * 1000)).toBe(false);
        expect(isLocked(d, players[2], start + 60 * 1000)).toBe(false);
        expect(gameStarted({ state: 'preview', date: '' }, start)).toBe(false);
        expect(gameStarted({ state: 'live', date: '2026-10-18T00:00:00Z' }, start)).toBe(true);
        // Hora por definir (segundo de un doble juego): la hora es de relleno y solo cuenta el estado
        expect(gameStarted({ state: 'preview', date: '2026-10-17T21:00:00Z', startTimeTBD: true }, start + 60 * MIN)).toBe(false);
        expect(gameStarted({ state: 'live', date: '2026-10-17T21:00:00Z', startTimeTBD: true }, start)).toBe(true);
    });

    it('el pronóstico también se cierra a la hora del juego aunque el servidor siga en «previa»', () => {
        setStoreOwner('pronosticos');
        const start = Date.parse('2026-10-17T21:00:00Z');
        const d = day([], [game(1, 'preview'), game(2, 'live')]);
        expect(setPick(d, d.games[0], 10, start - 1000)).toBe(true);
        expect(setPick(d, d.games[0], 20, start + 5 * MIN)).toBe(false);
        expect(setPick(d, d.games[1], 10, start - 1000)).toBe(false);
        expect(getStore()['lidom:2026-10-17'].picks).toEqual({ 1: 10 });
        localStorage.removeItem('el-play-fantasy-v1:pronosticos');
        setStoreOwner(null);
    });

    it('el día se vuelve a pedir cada 30 s desde 15 min antes del primer juego', () => {
        const start = Date.parse('2026-10-17T21:00:00Z');
        const d = (...games: FantasyGame[]) => day([], games);
        const today = d(game(1, 'preview'), game(2, 'preview', false, '2026-10-17T23:30:00Z'));
        // Lejos: despierta al entrar en los 15 min (sin pasar de 15 min entre consultas)
        expect(fantasyInterval(today, start - 20 * MIN)).toBe(5 * MIN);
        expect(fantasyInterval(today, start - 3 * 60 * MIN)).toBe(15 * MIN);
        expect(fantasyInterval(today, start - 15 * MIN)).toBe(30 * 1000);
        expect(fantasyInterval(today, start - 2 * MIN)).toBe(30 * 1000);
        // Ya pasó la hora y sigue en previa (retraso): se sigue mirando
        expect(fantasyInterval(today, start + 5 * MIN)).toBe(30 * 1000);
        expect(fantasyInterval(d(game(1, 'live'), game(2, 'preview')), start)).toBe(20 * 1000);
        expect(fantasyInterval(d(game(1, 'final'), game(2, 'final')), start)).toBe(false);
        // Un juego pospuesto que se quedó en previa no deja la página pidiendo cada 30 s
        expect(fantasyInterval(d({ ...game(1, 'preview'), detailedState: 'Postponed' }), start + 60 * MIN)).toBe(false);
        expect(fantasyInterval(undefined)).toBe(false);
    });

    it('la próxima hora de cierre es la del siguiente juego que no ha empezado', () => {
        const start = Date.parse('2026-10-17T21:00:00Z');
        const later = Date.parse('2026-10-17T23:30:00Z');
        const d = day([], [game(1, 'preview'), game(2, 'preview', false, '2026-10-17T23:30:00Z'), game(3, 'live', false, '2026-10-17T19:00:00Z')]);
        expect(nextLockAt(d, start - MIN)).toBe(start);
        expect(nextLockAt(d, start)).toBe(later);
        expect(nextLockAt(d, later)).toBeNull();
        // Un juego con la hora por definir no pone hora de cierre
        expect(nextLockAt(day([], [{ ...game(1, 'preview'), startTimeTBD: true }]), start - MIN)).toBeNull();
    });

    it('el capitán suma ×1,5 y cada pronóstico acertado +10', () => {
        const players = [player(1, 10, 'B', 10), player(2, 20, 'P', 20)];
        const d = day(players, [game(1, 'final', true), game(2, 'final', false)]);
        expect(teamPoints(d, entry([1, 2], 1))).toBe(35);
        expect(pickPoints(d, entry([], null, { 1: 10, 2: 10 }))).toBe(10);
    });

    it('cada cuenta tiene su copia en el teléfono y lo armado sin cuenta pasa una sola vez', () => {
        localStorage.setItem('el-play-fantasy-v1', JSON.stringify({ 'lidom:2026-10-16': entry([7]) }));
        setStoreOwner('ana');
        replaceStore({ 'lidom:2026-10-17': entry([1]) });
        setStoreOwner('beto');
        expect(getStore()).toEqual({});
        setStoreOwner('ana');
        expect(Object.keys(getStore())).toEqual(['lidom:2026-10-17']);
        expect(Object.keys(takeLegacyStore())).toEqual(['lidom:2026-10-16']);
        expect(takeLegacyStore()).toEqual({});
        setStoreOwner(null);
    });

    it('los días pasados sin resultado se cierran después (los más recientes primero)', () => {
        const all = {
            'lidom:2026-10-14': entry([1]),
            'lidom:2026-10-15': { ...entry([1]), result: { team: 5, picks: 0 } },
            'lidom:2026-10-16': entry([], null, { 1: 10 }),
            'lidom:2026-10-17': entry([1]),
            'lidom:2026-10-13': entry([]),
            'sdc:2026-10-12': entry([1])
        };
        expect(unsettledDays(all, 'lidom', '2026-10-17')).toEqual(['2026-10-16', '2026-10-14']);
    });
});

describe('estadísticas: orden y búsqueda', () => {
    const row = (id: number, pts: number, avg: string, pa: number): PlayerRow => ({
        id,
        name: `P${id}`,
        teamId: 672,
        pos: 'SS',
        number: null,
        role: 'B',
        hitting: { g: 3, pa, ab: pa, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, hbp: 0, avg, obp: avg, slg: avg, ops: avg },
        pitching: null,
        g: 3,
        pts,
        ppg: pts / 3
    });

    it('en AVG un 1-1 sin turnos suficientes va al final; en fantasy cuenta todo', () => {
        const rows = [row(1, 5, '1.000', 1), row(2, 20, '.300', 12), row(3, 9, '.350', 10)];
        const avg = SORTS.B.find((option) => option.key === 'avg')!;
        expect(sortPlayers(rows, avg, 3).map(({ row: r, ranked }) => [r.id, ranked])).toEqual([[3, true], [2, true], [1, false]]);
        expect(sortPlayers(rows, SORTS.B[0], 3).map(({ row: r }) => r.id)).toEqual([2, 3, 1]);
    });

    it('busca sin tildes ni mayúsculas', () => {
        expect(normalize('José Peña').includes(normalize('jose pena'))).toBe(true);
    });
});

describe('modo PRO: métricas avanzadas', () => {
    it('bateo: ISO, BABIP, K% y BB%', () => {
        const a = battingAdvanced({ g: 10, pa: 44, ab: 40, r: 6, h: 12, d: 3, t: 0, hr: 2, rbi: 8, bb: 4, k: 10, sb: 1, cs: 0, hbp: 0, sf: 0, avg: '.300', obp: '.364', slg: '.525', ops: '.889' });
        expect(fmtRate(a.iso)).toBe('.225'); // (12 + 3 + 6 − 12) / 40 = 9/40
        expect(fmtRate(a.babip)).toBe('.357'); // (12 − 2) / (40 − 10 − 2)
        expect(fmtPct(a.kPct)).toBe('22.7%');
        expect(a.xbh).toBe(5);
    });

    it('pitcheo: K/9, BB/9 y FIP', () => {
        const a = pitchingAdvanced({ g: 3, gs: 3, ip: '18.0', outs: 54, w: 2, l: 0, sv: 0, hld: 0, k: 20, bb: 5, h: 14, er: 4, hr: 1, hbp: 1, bf: 72, np: 280, era: '2.00', whip: '1.06' });
        expect(a.k9).toBe(10);
        expect(a.bb9).toBe(2.5);
        expect(a.fip!.toFixed(2)).toBe(((13 + 3 * 6 - 40) / 18 + 3.1).toFixed(2));
    });

    it('récord esperado por carreras (Pitágoras)', () => {
        const expected = pythagorean(256, 222, 49)!;
        expect(expected.wins + expected.losses).toBe(49);
        expect(expected.wins).toBe(28);
        expect(pythagorean(null, null, 0)).toBeNull();
    });
});

describe('avisos de juegos: Android solo deja avisar desde el service worker', () => {
    const shown: { title: string; options: NotificationOptions }[] = [];
    const created: string[] = [];
    const worker = (registration: unknown, ready: unknown = registration) =>
        Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => registration, ready: Promise.resolve(ready) } });
    const registration = (fails = false) => ({
        active: {},
        showNotification: async (title: string, options: NotificationOptions) => {
            if (fails) throw new TypeError('No se pudo');
            shown.push({ title, options });
        }
    });
    // Como Chrome de Android: el constructor no existe para las páginas
    const androidNotification = () =>
        vi.stubGlobal('Notification', class {
            constructor() {
                throw new TypeError('Illegal constructor');
            }
        });

    afterEach(() => {
        shown.length = 0;
        created.length = 0;
        vi.unstubAllGlobals();
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    });

    it('con service worker avisa con showNotification y no usa new Notification', async () => {
        androidNotification();
        worker(registration());
        expect(await showAlert('Playball', { body: 'Licey vs Águilas', tag: 'start-1' })).toBe(true);
        expect(shown).toEqual([{ title: 'Playball', options: { body: 'Licey vs Águilas', tag: 'start-1' } }]);
    });

    it('si el service worker se está activando, espera a que esté listo', async () => {
        androidNotification();
        worker({ active: null }, registration());
        expect(await showAlert('Playball', {})).toBe(true);
        expect(shown).toHaveLength(1);
    });

    it('sin service worker usa el aviso de escritorio', async () => {
        vi.stubGlobal('Notification', class {
            constructor(title: string) {
                created.push(title);
            }
        });
        worker(undefined);
        expect(await showAlert('Empieza pronto', {})).toBe(true);
        expect(created).toEqual(['Empieza pronto']);
    });

    it('si no se pudo avisar lo dice (para no marcarlo como enviado)', async () => {
        androidNotification();
        worker(registration(true));
        expect(await showAlert('Playball', {})).toBe(false);
    });
});

describe('cuenta: renovar la sesión', () => {
    const SESSION = { accessToken: 'viejo', refreshToken: 'r1', expiresAt: 1, user: { id: 'u1', email: 'ana@prueba.do' }, name: 'Ana' };
    const stored = () => JSON.parse(localStorage.getItem('el-play-session') || 'null');
    // account.ts lee la configuración y la sesión al cargar: se carga de nuevo en cada prueba
    const load = async (fetchMock: ReturnType<typeof vi.fn>) => {
        vi.resetModules();
        vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:5999');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'prueba');
        vi.stubGlobal('fetch', fetchMock);
        localStorage.setItem('el-play-session', JSON.stringify(SESSION));
        return import('./account');
    };
    const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

    const renewed = { access_token: 'nuevo', refresh_token: 'r2', expires_in: 3600, user: { id: 'u1', email: 'ana@prueba.do' } };
    // Respuesta de /token que se suelta a mano (para hacer cosas mientras se renueva)
    const held = () => {
        let answer: (value: unknown) => void = () => undefined;
        const fetchMock = vi.fn((url: string) => (url.includes('/token') ? new Promise((resolve) => (answer = resolve)) : Promise.resolve(reply(204))));
        return { fetchMock, answer: (value: unknown) => answer(value) };
    };

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('sin red conserva la sesión y avisa sin conexión (no sigue como anónimo ni dice que venció)', async () => {
        const { freshToken } = await load(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        await expect(freshToken()).rejects.toMatchObject({ code: 'network' });
        expect(stored()).toMatchObject({ refreshToken: 'r1', user: { id: 'u1' } });
    });

    it('con Supabase caído (500) o limitando (429) no la cierra ni vuelve a pedir el token en 30 s', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(reply(500)).mockResolvedValueOnce(reply(429));
        const { freshToken } = await load(fetchMock);
        await expect(freshToken()).rejects.toMatchObject({ code: 'network' });
        await expect(freshToken()).rejects.toMatchObject({ code: 'network' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 1000);
        await expect(freshToken()).rejects.toMatchObject({ code: 'network' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(stored()).toMatchObject({ refreshToken: 'r1' });
    });

    it('si no se pudo renovar, rest() avisa sin red en vez de pedir como anónimo', async () => {
        const fetchMock = vi.fn().mockResolvedValue(reply(503));
        const { rest } = await load(fetchMock);
        await expect(rest('fantasy_entries')).rejects.toMatchObject({ code: 'network' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain('/auth/v1/token');
    });

    it('si sale mientras se renueva, la respuesta no vuelve a abrir la sesión', async () => {
        const { fetchMock, answer } = held();
        const { freshToken, signOut } = await load(fetchMock);
        const pending = freshToken();
        await signOut();
        answer(reply(200, renewed));
        expect(await pending).toBeNull();
        expect(stored()).toBeNull();
    });

    it('si mientras se renueva entra otra cuenta, se queda la nueva y la respuesta vieja se descarta', async () => {
        const { fetchMock, answer } = held();
        const { freshToken } = await load(fetchMock);
        const pending = freshToken();
        const beto = { ...SESSION, accessToken: 'de-beto', refreshToken: 'b1', expiresAt: Date.now() + 3600 * 1000, user: { id: 'u2', email: 'beto@prueba.do' } };
        localStorage.setItem('el-play-session', JSON.stringify(beto));
        expect(await freshToken()).toBe('de-beto');
        answer(reply(200, renewed));
        expect(await pending).toBe('de-beto');
        expect(stored()).toMatchObject({ refreshToken: 'b1', user: { id: 'u2' } });
    });

    it('con otra pestaña que ya la renovó, el «ya usado» (400) no la cierra: usa la que dejó guardada', async () => {
        const { fetchMock, answer } = held();
        const { freshToken } = await load(fetchMock);
        const pending = freshToken();
        const other = { ...SESSION, accessToken: 'de-la-otra', refreshToken: 'r2', expiresAt: Date.now() + 3600 * 1000 };
        localStorage.setItem('el-play-session', JSON.stringify(other));
        answer(reply(400, { error_code: 'refresh_token_already_used' }));
        expect(await pending).toBe('de-la-otra');
        expect(stored()).toMatchObject({ refreshToken: 'r2' });
    });

    it('antes de renovar mira lo guardado: si otra pestaña ya la renovó no pide otro token', async () => {
        const fetchMock = vi.fn();
        const { freshToken } = await load(fetchMock);
        localStorage.setItem('el-play-session', JSON.stringify({ ...SESSION, accessToken: 'de-la-otra', refreshToken: 'r2', expiresAt: Date.now() + 3600 * 1000 }));
        expect(await freshToken()).toBe('de-la-otra');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('si Supabase dice que el refresh token no sirve (400/401) la cierra', async () => {
        const { freshToken } = await load(vi.fn().mockResolvedValue(reply(400, { error_code: 'refresh_token_not_found' })));
        expect(await freshToken()).toBeNull();
        expect(stored()).toBeNull();
        const second = await load(vi.fn().mockResolvedValue(reply(401)));
        expect(await second.freshToken()).toBeNull();
        expect(stored()).toBeNull();
    });

    it('renueva una sola vez aunque la pidan dos a la vez y conserva el nombre', async () => {
        const fetchMock = vi.fn().mockResolvedValue(reply(200, renewed));
        const { freshToken } = await load(fetchMock);
        expect(await Promise.all([freshToken(), freshToken()])).toEqual(['nuevo', 'nuevo']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5999/auth/v1/token?grant_type=refresh_token');
        expect(stored()).toMatchObject({ accessToken: 'nuevo', refreshToken: 'r2', name: 'Ana' });
        // Con el token nuevo vigente ya no se vuelve a pedir
        expect(await freshToken()).toBe('nuevo');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('pausa entre entradas en la zona de strike', () => {
    const team = (id: number, abbrev: string) => ({ id, abbrev, name: abbrev, logo: '', color: '#0069e0', record: null, teamName: abbrev, runs: 0, hits: 0, errors: 0, lob: 0, isWinner: false });
    const third = { ...atBat(7, [pitch()], true), top: true, inning: 6, outs: 3 } as AtBat;
    const game = (extra: Partial<GameDetail> = {}) =>
        ({
            gamePk: 1,
            state: 'live',
            atBats: [third],
            currentAtBat: 7,
            inning: { n: 6, ordinal: '6th', isTop: true, state: 'Middle' },
            away: team(670, 'GIG'),
            home: team(667, 'AGU'),
            linescore: [{ n: 6, away: 2, home: null }],
            dueUp: { teamId: 667, batters: [{ id: 1, name: 'Wandel Matos' }, { id: 2, name: 'Franmil Guzmán' }, { id: 3, name: 'Yunior Paulino' }] },
            ...extra
        }) as unknown as GameDetail;

    it('tras el tercer out de la alta: viene el home club, lo que anotó el visitante y a quién le toca', () => {
        expect(inningBreak(game())).toMatchObject({ endedTop: true, inning: 6, next: { abbrev: 'AGU' }, ended: { abbrev: 'GIG' }, runs: 2 });
        expect(inningBreak(game())!.dueUp.map((batter) => batter.name)).toEqual(['Wandel Matos', 'Franmil Guzmán', 'Yunior Paulino']);
        // Tras la baja («End») viene el visitante
        expect(inningBreak(game({ inning: { n: 6, ordinal: '6th', isTop: false, state: 'End' }, atBats: [{ ...third, top: false }] }))).toMatchObject({ endedTop: false, next: { abbrev: 'GIG' } });
        // Los que le tocan de otro equipo no se muestran
        expect(inningBreak(game({ dueUp: { teamId: 670, batters: [{ id: 9, name: 'Otro' }] } }))!.dueUp).toEqual([]);
    });

    it('si MLB tarda en decir «Middle», basta el último turno terminado con 3 outs', () => {
        expect(inningBreak(game({ inning: { n: 6, ordinal: '6th', isTop: true, state: 'Top' } }))).toMatchObject({ endedTop: true, next: { abbrev: 'AGU' } });
    });

    it('no hay pausa con un turno en curso, a mitad de entrada ni con el juego terminado', () => {
        const next = { ...atBat(8, [], false), top: false, inning: 6, outs: 0 } as AtBat;
        expect(inningBreak(game({ atBats: [third, next], currentAtBat: 8, inning: { n: 6, ordinal: '6th', isTop: false, state: 'Bottom' } }))).toBeNull();
        expect(inningBreak(game({ atBats: [{ ...third, outs: 1 }], inning: { n: 6, ordinal: '6th', isTop: true, state: 'Top' } }))).toBeNull();
        expect(inningBreak(game({ state: 'final' }))).toBeNull();
    });
});

describe('estadísticas colectivas: orden, puesto en la liga, promedio y récord', () => {
    const team = (id: number, abbrev: string, avg: string, era: string, runs: number, allowed: number, w: number, l: number) =>
        ({ id, abbrev, name: abbrev, color: '#000', logo: '', hitting: { g: w + l, avg, r: runs, k: 30 }, pitching: { era, r: allowed, w, l } }) as unknown as TeamRow;
    const teams = [team(1, 'LIC', '.279', '2.92', 32, 14, 3, 1), team(2, 'EST', '.298', '3.34', 26, 14, 2, 2), team(3, 'ESC', '.209', '5.91', 14, 28, 1, 3), { ...team(4, 'AGU', '.211', '4.24', 12, 17, 1, 3), pitching: null } as TeamRow];

    it('AVG de mayor a menor; EFE de menor a mayor (y el que no tiene el dato, al final)', () => {
        expect(rankTeams(teams, teamSort('bat', 'avg')).map((row) => row.team.abbrev)).toEqual(['EST', 'LIC', 'AGU', 'ESC']);
        expect(rankTeams(teams, teamSort('pitch', 'era')).map((row) => row.team.abbrev)).toEqual(['LIC', 'EST', 'ESC', 'AGU']);
        expect(teamSort('bat', 'avg').show(0.2789)).toBe('.279');
    });

    it('puesto en la liga y promedio de la liga', () => {
        expect(leagueRank(teams, teams[0], teamSort('bat', 'avg'))).toBe(2);
        expect(leagueRank(teams, teams[0], teamSort('pitch', 'era'))).toBe(1);
        expect(leagueRank(teams, teams[3], teamSort('pitch', 'era'))).toBeNull();
        expect(leagueAverage(teams, teamSort('pitch', 'era'))).toBeCloseTo((2.92 + 3.34 + 5.91) / 3, 5);
    });

    it('récord y diferencia de carreras', () => {
        expect(recordOf(teams[0])).toMatchObject({ w: 3, l: 1, games: 4, scored: 32, allowed: 14, diff: 18 });
        expect(recordOf(teams[3]).diff).toBeNull();
    });
});

describe('probabilidad de victoria antes del juego', () => {
    const form = (w: number, l: number, scored: number | null = null, allowed: number | null = null) => ({ w, l, scored, allowed });

    it('dos equipos iguales: el local un poco arriba (~54 %)', () => {
        const even = winProbability(form(10, 10, 80, 80), form(10, 10, 80, 80));
        expect(even.home).toBeGreaterThan(0.53);
        expect(even.home).toBeLessThan(0.55);
        expect(percents(even).home + percents(even).away).toBe(100);
    });

    it('con pocos juegos casi no se mueve de 50-50; con muchos sí, y nunca pasa de 80-20', () => {
        const early = winProbability(form(3, 1, 32, 14), form(1, 3, 14, 28));
        expect(early.early).toBe(true);
        expect(early.home).toBeGreaterThan(0.6);
        expect(early.home).toBeLessThan(0.75);
        const late = winProbability(form(35, 15, 260, 170), form(15, 35, 170, 260));
        expect(late.home).toBeGreaterThan(early.home);
        expect(winProbability(form(50, 0, 500, 10), form(0, 50, 10, 500)).home).toBe(0.8);
    });

    it('los abridores mueven poco y solo si se saben los dos', () => {
        const base = winProbability(form(10, 10), form(10, 10));
        const better = winProbability(form(10, 10), form(10, 10), { homeEra: '1.50', awayEra: '6.00' });
        expect(better.starters).toBe(true);
        expect(better.home - base.home).toBeGreaterThan(0.03);
        expect(better.home - base.home).toBeLessThan(0.07);
        expect(winProbability(form(10, 10), form(10, 10), { homeEra: '1.50' }).starters).toBe(false);
    });
});

describe('reto del ABS: revisando y resultado entre dos lecturas', () => {
    const team = (id: number, abbrev: string) => ({ id, abbrev, name: abbrev, logo: '', color: '#0069e0', record: null, teamName: abbrev, runs: 0, hits: 0, errors: 0, lob: 0, isWinner: false });
    const turn = (pitches: Pitch[], extra: Partial<AtBat> = {}) => ({ ...atBat(44, pitches, false), top: false, batter: { id: 1, name: 'Bateador', side: 'R' }, pitcher: { id: 2, name: 'Lanzador', hand: 'R' }, ...extra }) as AtBat;
    const game = (atBats: AtBat[], abs: GameDetail['abs'] = null) =>
        ({ gamePk: 1, state: 'live', atBats, inning: { n: 6, ordinal: '6th', isTop: false, state: 'Bottom' }, away: team(668, 'TOR'), home: team(672, 'LIC'), abs }) as unknown as GameDetail;
    const ball = pitch({ r: 'ball', code: 'B', call: 'Ball' });
    const checking = { ...pitch({ r: 'ball', code: 'B', call: 'Ball' }), abs: { inProgress: true, overturned: false, teamId: 672, by: null } };
    const overturned = { ...pitch(), code: 'C', abs: { inProgress: false, overturned: true, teamId: 672, by: { id: 1, name: 'Bateador' } } };
    const counts = { away: { won: 1, lost: 0, remaining: 2 }, home: { won: 2, lost: 2, remaining: 1 }, challenging: null };

    it('aparece «revisando» con la decisión del umpire y después el resultado (una vez cada uno)', () => {
        const before = game([turn([pitch(), ball])]);
        const during = game([turn([pitch(), checking])], { ...counts, challenging: 672 });
        const after = game([turn([pitch(), overturned], { complete: true, event: 'strikeout' })], counts);
        const [first] = newPlayEvents(before, during);
        expect(first).toMatchObject({ kind: 'abs', key: 'abs-44-1-checking', team: { abbrev: 'LIC' }, abs: { phase: 'checking', call: 'ball', original: 'ball' } });
        const events = newPlayEvents(during, after);
        // El reto va antes que la jugada del turno (el ponche que salió del reto)
        expect(events.map((event) => event.kind)).toEqual(['abs', 'k']);
        expect(events[0]).toMatchObject({ key: 'abs-44-1-result', abs: { phase: 'result', overturned: true, call: 'strike', original: 'ball', by: 'batter', remaining: 1 } });
        expect(newPlayEvents(after, after)).toEqual([]);
        expect(newPlayEvents(during, during)).toEqual([]);
    });

    it('si ya llegó resuelto (la revisión dura menos que una lectura) sale directo el resultado', () => {
        const confirmed = { ...pitch({ r: 'ball', code: 'B', call: 'Ball' }), abs: { inProgress: false, overturned: false, teamId: 668, by: { id: 2, name: 'Lanzador' } } };
        const [event] = newPlayEvents(game([turn([pitch()])]), game([turn([pitch(), confirmed])], counts));
        expect(event).toMatchObject({ kind: 'abs', team: { abbrev: 'TOR' }, abs: { phase: 'result', overturned: false, call: 'ball', original: 'ball', by: 'pitcher', remaining: 2 } });
    });

    it('en «inteligentes» sale aunque el juego no sea de tu equipo', () => {
        const events = newPlayEvents(game([turn([ball])]), game([turn([checking])]));
        expect(forMode(events, 'smart', null, [668, 672]).map((event) => event.kind)).toEqual(['abs']);
    });
});

describe('arreglos de la auditoría (web)', () => {
    it('el apellido no es «Jr.» ni «II»', () => {
        expect(surname('Mel Rojas Jr.')).toBe('Rojas Jr.');
        expect(surname('Victor Scott II')).toBe('Scott II');
        expect(surname('Juan Soto')).toBe('Soto');
        expect(surname('Ichiro')).toBe('Ichiro');
        expect(surname('  Junior   Lake ')).toBe('Lake');
    });

    it('el clima en español y en °C aunque el anotador escriba °F o °C', () => {
        expect(weatherName('Partly Cloudy', 'es')).toBe('Parcialmente nublado');
        expect(weatherName('Clear', 'es')).toBe('Despejado');
        expect(weatherName('Clear', 'en')).toBe('Clear');
        expect(weatherName('Algo raro', 'es')).toBe('Algo raro');
        expect(weatherTemp('84', 'es')).toBe('29 °C');
        expect(weatherTemp('29', 'es')).toBe('29 °C');
        expect(weatherTemp('29', 'en')).toBe('84 °F');
        expect(weatherTemp('84', 'en')).toBe('84 °F');
        expect(weatherTemp(null, 'es')).toBe('');
        expect(weatherTemp('n/a', 'es')).toBe('');
    });

    it('abanicados con la misma regla y el repertorio sin la fila de los pitcheos sin tipo', () => {
        expect(['S', 'W', 'M', 'Q', 'F', 'C', null].map(isWhiff)).toEqual([true, true, true, true, false, false, false]);
        const rows = arsenal([pitch({ code: 'S' }), pitch({ code: 'Q' }), pitch({ type: 'SL', code: 'B', r: 'ball' }), pitch({ type: null, typeDesc: null, code: 'F' })], 'es');
        expect(rows.map((row) => row.type)).toEqual(['FF', 'SL']);
        expect(rows[0].whiffs).toBe(2);
        expect(rows[0].share + rows[1].share).toBeCloseTo(1);
    });

    it('la constante de FIP sale de los números de la liga', () => {
        const line = { g: 40, gs: 40, ip: '350.0', outs: 1050, w: 20, l: 20, sv: 10, hld: 0, k: 300, bb: 140, h: 330, er: 150, hr: 25, hbp: 15, era: '3.86', whip: '1.34' };
        const teams = [{ pitching: line }, { pitching: line }, { pitching: null }];
        // ERA 3,857 − (13·50 + 3·310 − 2·600) / 700 = 3,857 − 0,543
        expect(fipConstantOf(teams)).toBeCloseTo(3.31, 2);
        expect(fipConstantOf([{ pitching: { ...line, outs: 300 } }])).toBeNull();
        const fip = (constant: number | null) => {
            setFipConstant(constant);
            return pitchingAdvanced(line).fip as number;
        };
        expect(fip(3.5) - fip(null)).toBeCloseTo(3.5 - FIP_CONSTANT);
        setFipConstant(null);
    });
});
