import { describe, it, expect } from 'vitest';
import { gameInterval, scheduleInterval } from './polling';
import { atBatForZone, arsenal, battedBalls, battersFaced, pitchesByPitcher, describePlay, eventName, inningName, pitchCallName, pitchTypeName, stateName } from './baseball';
import { dayKey, dayRange, seasonLabel } from './format';
import { nameKey, photoSources } from './photos';
import { newPlayEvents, outVariant, titleClinch } from './playEvents';
import { canAdd, isLocked, pickPoints, teamPoints, type DayEntry, type FantasyDay, type FantasyGame, type FantasyPlayer } from './fantasy';
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

describe('fantasy: reglas del equipo del día', () => {
    const player = (id: number, teamId: number, role: 'B' | 'P', points: number, gamePk = 1): FantasyPlayer => ({ id, name: `P${id}`, teamId, gamePk, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: true, line: null, points });
    const game = (gamePk: number, state: string, awayWins = false) =>
        ({ gamePk, state, date: '2026-10-17T21:00:00Z', away: { id: 10, isWinner: awayWins }, home: { id: 20, isWinner: !awayWins && state === 'final' } }) as unknown as FantasyGame;
    const day = (players: FantasyPlayer[], games: FantasyGame[]) => ({ league: 'lidom', date: '2026-10-17', games, teams: {}, players, scoring: { batter: {}, pitcher: {} } }) as unknown as FantasyDay;
    const entry = (lineup: number[], captain: number | null = null, picks: Record<string, number> = {}): DayEntry => ({ lineup, captain, picks, savedAt: 1 });

    it('5 bateadores, 1 lanzador, máximo 2 por equipo y cerrado si su juego empezó', () => {
        const players = [player(1, 10, 'B', 0), player(2, 10, 'B', 0), player(3, 10, 'B', 0), player(4, 20, 'P', 0), player(5, 20, 'P', 0), player(6, 30, 'B', 0, 2)];
        const d = day(players, [game(1, 'preview'), game(2, 'live')]);
        expect(canAdd(d, entry([1, 2]), players[2])).toBe('team');
        expect(canAdd(d, entry([4]), players[4])).toBe('full');
        expect(canAdd(d, entry([]), players[5])).toBe('locked');
        expect(canAdd(d, entry([1]), players[0])).toBe('already');
        expect(canAdd(d, entry([1]), players[1])).toBeNull();
        expect(isLocked(d, players[5])).toBe(true);
    });

    it('el capitán suma ×1,5 y cada pronóstico acertado +10', () => {
        const players = [player(1, 10, 'B', 10), player(2, 20, 'P', 20)];
        const d = day(players, [game(1, 'final', true), game(2, 'final', false)]);
        expect(teamPoints(d, entry([1, 2], 1))).toBe(35);
        expect(pickPoints(d, entry([], null, { 1: 10, 2: 10 }))).toBe(10);
    });
});
