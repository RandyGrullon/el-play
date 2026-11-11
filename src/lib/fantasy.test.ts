// Fantasy v2 (reglas del día, el equipo que cuenta, pospuestos, selector, ayuda y guardado). Datos inventados.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import es from '../locales/es.json';
import en from '../locales/en.json';
import {
    addPlayer,
    canAdd,
    countedEntry,
    creditsLeft,
    effectiveEntry,
    gameStarted,
    getStore,
    isLocked,
    lockTime,
    nextLockAt,
    notCounting,
    perTeamLimit,
    pickPoints,
    removePlayer,
    repairEntry,
    replaceStore,
    rulesOf,
    setPick,
    setStoreOwner,
    settleDay,
    slotsLeft,
    teamPoints,
    withoutMissing,
    type DayEntry,
    type EntryHistory,
    type FantasyDay,
    type FantasyGame,
    type FantasyPlayer
} from './fantasy';
import { bestLineup } from './fantasyBest';
import { HELP_FAQ, helpAnswerValues, helpExamples, helpRules, helpSteps, scoringRows } from './fantasyHelp';
import { defaultFilters, last5Average, opponentOf, pickerGames, pickerRows, reasonDetail, seasonLineOf, sortValue, statusOf } from './fantasyPicker';
import { getSaveStatus, resetSaveStatus, retrySave, saveEntry } from './fantasySave';
import { withRanks } from './fans';
import { AccountError } from './account';
import type { PlayerRow } from './stats';

const at = (hhmm: string) => Date.parse(`2026-11-10T${hhmm}:00Z`);
const BEFORE = at('20:00');

const LIC = 12345601;
const TOR = 12345602;
const EST = 12345603;
const AGU = 12345604;
const TEAMS: Record<number, { id: number; abbrev: string; color: string; logo: string }> = {
    [LIC]: { id: LIC, abbrev: 'LIC', color: '#123456', logo: '' },
    [TOR]: { id: TOR, abbrev: 'TOR', color: '#654321', logo: '' },
    [EST]: { id: EST, abbrev: 'EST', color: '#abcdef', logo: '' },
    [AGU]: { id: AGU, abbrev: 'AGU', color: '#fedcba', logo: '' }
};

const game = (gamePk: number, date: string, state: FantasyGame['state'], away: number, home: number, extra: Partial<FantasyGame> = {}) =>
    ({ gamePk, date, state, detailedState: state === 'final' ? 'Final' : 'Scheduled', startTimeTBD: false, away: { id: away, abbrev: TEAMS[away].abbrev, isWinner: false, probable: null }, home: { id: home, abbrev: TEAMS[home].abbrev, isWinner: false, probable: null }, ...extra }) as unknown as FantasyGame;

let nextId = 12345678;
const NAMES = ['Pelotero Uno', 'Pelotero Dos', 'Pelotero Tres', 'Pelotero Cuatro', 'Pelotero Cinco', 'Pelotero Seis', 'Pelotero Siete', 'Pelotero Ocho', 'Pelotero Nueve', 'Pelotero Diez'];
const player = (role: 'B' | 'P', teamId: number, gamePk: number, extra: Partial<FantasyPlayer> = {}): FantasyPlayer => {
    const id = nextId++;
    return { id, name: NAMES[(id - 12345678) % NAMES.length], teamId, gamePk, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: false, line: null, points: 0, ...extra };
};

const OLD_SCORING = {
    batter: { single: 3, double: 5, triple: 8, homeRun: 10, run: 2, rbi: 2, walk: 2, hitByPitch: 2, stolenBase: 5, strikeOut: -1 },
    pitcher: { out: 1, strikeOut: 2, win: 5, save: 5, earnedRun: -2, hit: -0.5, walk: -0.5 }
};

const makeDay = (players: FantasyPlayer[], games: FantasyGame[], extra: Partial<FantasyDay> = {}): FantasyDay => ({
    league: 'lidom',
    date: '2026-11-10',
    games,
    teams: TEAMS,
    players,
    scoring: OLD_SCORING,
    credits: { budget: 50, min: 4, max: 12 },
    ...extra
});

const entry = (lineup: number[], captain: number | null = null, extra: Partial<DayEntry> = {}): DayEntry => ({ lineup, captain, picks: {}, savedAt: 1, ...extra });

// Dos juegos: LIC-TOR a las 23:30 (por empezar) y EST-AGU a las 21:00 (por empezar)
const GAMES = () => [game(1, '2026-11-10T23:30:00Z', 'preview', LIC, TOR), game(2, '2026-11-10T21:00:00Z', 'preview', EST, AGU)];
// Lo que usa el reloj de verdad (agregar, quitar): juegos muy en el futuro, para que la prueba no dependa de la fecha
const later = (g: FantasyGame) => ({ ...g, date: g.date.replace('2026-', '2099-') }) as FantasyGame;

describe('fantasy v2: reglas del día (con y sin `rules`)', () => {
    it('sin rules (la API de antes o una respuesta guardada) usa las de siempre', () => {
        const day = makeDay([], GAMES());
        const rules = rulesOf(day);
        expect(rules).toMatchObject({ batters: 5, pitchers: 1, perTeam: 2, budget: 50, captain: 1.5, picks: 10 });
        // La tabla vieja decía hitByPitch y strikeOut
        expect(rules.scoring.batter).toMatchObject({ hbp: 2, strikeout: -1, homeRun: 10 });
        expect(rules.scoring.pitcher).toMatchObject({ strikeout: 2, out: 1 });
        expect(rules.prices).toMatchObject({ min: 4, max: 12 });
        expect(rulesOf(makeDay([], GAMES(), { credits: undefined })).budget).toBeNull();
        expect(rulesOf(undefined)).toMatchObject({ batters: 5, pitchers: 1, perTeam: 2, budget: null });
    });

    it('con rules manda el servidor: tope por equipo, créditos, capitán, pronósticos y cupos', () => {
        const batters = [player('B', LIC, 1), player('B', LIC, 1), player('B', LIC, 1), player('B', TOR, 1, { price: 30 })];
        const rules = { version: 2, roster: { batters: 4, pitchers: 2 }, perTeam: 3, budget: null, captain: 2, picks: { points: 15 } };
        const day = makeDay(batters, GAMES(), { rules });
        expect(perTeamLimit(day)).toBe(3);
        expect(rulesOf(day)).toMatchObject({ batters: 4, pitchers: 2, perTeam: 3, budget: null, captain: 2, picks: 15 });
        // Sin tope ese día: no hay créditos que cuidar
        expect(creditsLeft(day, entry([batters[3].id]))).toBeNull();
        expect(canAdd(day, entry([batters[0].id, batters[1].id]), batters[2], BEFORE)).toBeNull();
        expect(canAdd(day, entry([batters[0].id, batters[1].id, batters[2].id]), batters[3], BEFORE)).toBeNull();
        expect(slotsLeft(day, entry([batters[0].id]))).toEqual({ batters: 3, pitchers: 2 });
        // El capitán ×2 y cada pronóstico +15
        const scored = makeDay([{ ...batters[0], points: 10 }], [{ ...GAMES()[0], state: 'final', away: { ...GAMES()[0].away, isWinner: true } }], { rules });
        expect(teamPoints(scored, entry([batters[0].id], batters[0].id))).toBe(20);
        expect(pickPoints(scored, entry([], null, { picks: { 1: LIC } }))).toBe(15);
        // Con un presupuesto en rules se usa ese, no el de credits
        expect(creditsLeft(makeDay(batters, GAMES(), { rules: { budget: 60 } }), entry([batters[3].id]))).toBe(30);
    });
});

describe('fantasy v2: el encabezado suma lo mismo que la tabla (effectiveEntry)', () => {
    it('sin historial y pasado del presupuesto, no cuenta el último que entró', () => {
        const players = [player('B', LIC, 1, { price: 20, points: 5 }), player('B', TOR, 1, { price: 20, points: 7 }), player('B', EST, 2, { price: 15, points: 9 })];
        const day = makeDay(players, GAMES());
        const saved = entry(players.map((p) => p.id), players[2].id);
        const counted = countedEntry(day, saved);
        expect(counted.lineup).toEqual([players[0].id, players[1].id]);
        expect(counted.captain).toBeNull();
        expect(teamPoints(day, counted)).toBe(12);
        expect(teamPoints(day, counted)).toBe(teamPoints(day, effectiveEntry(day, saved)));
        expect(notCounting(day, saved, counted, BEFORE)).toEqual(new Map([[players[2].id, 'over']]));
    });

    it('con el historial de la base: el que entró después de empezar su juego no cuenta («lo agregaste después»)', () => {
        const games = [game(1, '2026-11-10T23:30:00Z', 'live', LIC, TOR), game(2, '2026-11-10T21:00:00Z', 'final', EST, AGU)];
        const early = player('B', LIC, 1, { points: 4, played: true });
        const late = player('B', EST, 2, { points: 12, played: true });
        const day = makeDay([early, late], games, { credits: undefined });
        const history: EntryHistory = { v: 1, players: { [early.id]: [[at('20:00'), null]], [late.id]: [[at('22:00'), null]] } };
        const saved = entry([early.id, late.id], null, { savedAt: 5, history, historyAt: 5 });
        expect(countedEntry(day, saved).lineup).toEqual([early.id]);
        expect(notCounting(day, saved, undefined, at('23:59'))).toEqual(new Map([[late.id, 'late']]));
        // Cambiado después en el teléfono: ese historial ya no está al día y se cuenta sin él
        const changed = { ...saved, savedAt: 6 };
        expect(countedEntry(day, changed).lineup).toEqual([early.id, late.id]);
        // Los equipos de los demás (sin historyAt) siempre usan su historial
        expect(countedEntry(day, { ...saved, historyAt: undefined }).lineup).toEqual([early.id]);
    });

    it('el resultado del día se guarda con el equipo que cuenta', () => {
        setStoreOwner('test-settle');
        const games = [{ ...GAMES()[0], state: 'final' as const }, { ...GAMES()[1], state: 'final' as const }];
        const players = [player('B', LIC, 1, { price: 30, points: 10, played: true }), player('B', EST, 2, { price: 30, points: 8, played: true })];
        const day = makeDay(players, games);
        const saved = entry(players.map((p) => p.id));
        replaceStore({ 'lidom:2026-11-10': saved });
        settleDay(day, saved);
        expect(getStore()['lidom:2026-11-10'].result).toEqual({ team: 10, picks: 0 });
        localStorage.removeItem('el-play-fantasy-v1:test-settle');
        setStoreOwner(null);
    });
});

describe('fantasy v2: pospuestos y peloteros que ya no salen en el día', () => {
    beforeEach(() => {
        setStoreOwner('test-pospuestos');
        replaceStore({});
    });
    afterEach(() => {
        localStorage.removeItem('el-play-fantasy-v1:test-pospuestos');
        setStoreOwner(null);
    });

    it('withoutMissing: con 7 sale el que ya no está (y su capitanía); con 6 o menos no se toca', () => {
        const players = [player('B', LIC, 1), player('B', TOR, 1)];
        const day = makeDay(players, GAMES());
        const six = entry([99999999, 1, 2, 3, 4, 5]);
        expect(withoutMissing(day, six)).toBe(six);
        const seven = entry([99999999, players[0].id, players[1].id, 3, 4, 5, 6], 99999999);
        expect(withoutMissing(day, seven)).toEqual({ ...seven, lineup: [players[0].id, players[1].id], captain: null });
        // Uno de un juego pospuesto también sale
        const postponed = { ...players[1], status: 'postponed' as const };
        expect(withoutMissing({ ...day, players: [players[0], postponed] }, seven).lineup).toEqual([players[0].id]);
    });

    it('agregar un 7.º con uno que desapareció deja 6: el día se puede seguir guardando', () => {
        const batters = [player('B', LIC, 1), player('B', LIC, 1), player('B', TOR, 1), player('B', TOR, 1), player('B', EST, 2)];
        const pitcher = player('P', AGU, 2);
        const gone = 87654321;
        const day = makeDay([...batters, pitcher], GAMES().map(later), { credits: undefined });
        replaceStore({ 'lidom:2026-11-10': entry([gone, batters[0].id, batters[1].id, batters[2].id, batters[3].id, pitcher.id]) });
        // El que desapareció no cuenta para el cupo: el lugar se ve vacío y se puede llenar
        expect(addPlayer(day, getStore()['lidom:2026-11-10'], batters[4])).toBe(true);
        const saved = getStore()['lidom:2026-11-10'];
        expect(saved.lineup).toHaveLength(6);
        expect(saved.lineup).not.toContain(gone);
    });

    it('repairEntry arregla lo que la versión de antes dejó con 7', () => {
        const kept = player('B', LIC, 1);
        const day = makeDay([kept], GAMES());
        replaceStore({ 'lidom:2026-11-10': entry([1, 2, 3, 4, 5, 6, kept.id], null, { savedAt: 10 }) });
        expect(repairEntry(day)).toBe(true);
        expect(getStore()['lidom:2026-11-10'].lineup).toEqual([kept.id]);
        expect(getStore()['lidom:2026-11-10'].savedAt).toBeGreaterThan(10);
        expect(repairEntry(day)).toBe(false);
    });

    it('un pospuesto no se puede agregar, se puede quitar aunque pasó su hora y no cierra el día', () => {
        const postponed = game(3, '2026-11-10T19:00:00Z', 'final', LIC, TOR, { status: 'postponed', detailedState: 'Postponed' });
        const cancelled = game(4, '2026-11-10T19:00:00Z', 'final', EST, AGU, { detailedState: 'Cancelled' });
        const open = game(5, '2026-11-10T23:30:00Z', 'preview', EST, AGU);
        const inLineup = player('B', LIC, 3, { status: 'postponed' });
        const other = player('B', TOR, 3);
        const fromCancelled = player('B', EST, 4);
        const day = makeDay([inLineup, other, fromCancelled], [postponed, cancelled, open]);
        replaceStore({ 'lidom:2026-11-10': entry([inLineup.id]) });
        expect(canAdd(day, entry([]), other, at('20:00'))).toBe('postponed');
        expect(canAdd(day, entry([]), fromCancelled, at('20:00'))).toBe('postponed');
        expect(gameStarted(postponed, at('20:00'))).toBe(false);
        expect(isLocked(day, inLineup, at('20:00'))).toBe(false);
        expect(removePlayer(day, inLineup)).toBe(true);
        expect(getStore()['lidom:2026-11-10'].lineup).toEqual([]);
        // La hora de cierre es la de siempre (como el servidor): el pospuesto simplemente no cuenta
        expect(lockTime(postponed)).toBe(at('19:00'));
        expect(nextLockAt(day, at('20:00'))).toBe(at('23:30'));
        expect(setPick(day, postponed, LIC, at('18:00'))).toBe(false);
        // Ni el sugerido ni el ideal lo toman en cuenta
        const proj = makeDay([{ ...other, proj: 30 }], [postponed]);
        expect(bestLineup(proj, { metric: 'proj', keep: [], now: at('18:00') })).toBeNull();
    });

    it('cambiar un pospuesto por otro (con el historial) no se pasa del cupo: el nuevo cuenta', () => {
        const postponed = game(3, '2026-11-10T19:00:00Z', 'final', LIC, TOR, { status: 'postponed' });
        const later = game(5, '2026-11-10T23:30:00Z', 'live', EST, AGU);
        const batters = [player('B', LIC, 3), ...[0, 1, 2, 3].map(() => player('B', EST, 5, { points: 2 }))];
        const swap = player('B', AGU, 5, { points: 6 });
        const day = makeDay([...batters, swap], [postponed, later], { credits: undefined, rules: { perTeam: 5 } });
        const history: EntryHistory = {
            v: 1,
            players: {
                ...Object.fromEntries(batters.map((p) => [p.id, [[at('15:00'), null]] as [number, number | null][]])),
                [batters[0].id]: [[at('15:00'), at('20:00')]],
                [swap.id]: [[at('20:01'), null]]
            }
        };
        const saved = entry([...batters.slice(1).map((p) => p.id), swap.id], null, { history });
        expect(countedEntry(day, saved).lineup).toContain(swap.id);
    });

    it('uno suspendido ya empezó (sus peloteros quedan cerrados)', () => {
        expect(gameStarted({ state: 'preview', date: '2026-11-11T23:00:00Z', status: 'suspended' }, BEFORE)).toBe(true);
        expect(gameStarted({ state: 'preview', date: '2026-11-11T23:00:00Z', detailedState: 'Suspended: Rain' }, BEFORE)).toBe(true);
    });
});

describe('fantasy v2: un pospuesto no suma ni ocupa cupo (igual que el servidor)', () => {
    beforeEach(() => {
        setStoreOwner('test-pospuestos-cupo');
        replaceStore({});
    });
    afterEach(() => {
        localStorage.removeItem('el-play-fantasy-v1:test-pospuestos-cupo');
        setStoreOwner(null);
    });
    const postponedGame = () => game(3, '2026-11-10T19:00:00Z', 'final', LIC, TOR, { status: 'postponed', detailedState: 'Postponed' });
    const openGame = () => game(5, '2026-11-10T23:30:00Z', 'preview', EST, AGU);

    it('sin historial: no gasta créditos ni cupo (sobra el que de verdad se pasa)', () => {
        const gone = player('B', LIC, 3, { status: 'postponed', price: 30 });
        const b = [player('B', EST, 5, { price: 20, points: 4 }), player('B', AGU, 5, { price: 20, points: 6 }), player('B', EST, 5, { price: 15, points: 9 })];
        const day = makeDay([gone, ...b], [postponedGame(), openGame()]);
        const saved = entry([gone.id, ...b.map((p) => p.id)]);
        expect(countedEntry(day, saved).lineup).toEqual([gone.id, b[0].id, b[1].id]);
        expect(teamPoints(day, countedEntry(day, saved))).toBe(10);
        // Ni el pospuesto lleva aviso de «no cuenta» (tiene el suyo) ni gasta créditos
        expect(notCounting(day, saved, undefined, BEFORE)).toEqual(new Map([[b[2].id, 'over']]));
        expect(creditsLeft(day, entry([gone.id, b[0].id]))).toBe(30);
        expect(slotsLeft(day, entry([gone.id]))).toEqual({ batters: 5, pitchers: 1 });
    });

    it('con historial: no cuenta ni su pronóstico', () => {
        const gone = player('B', LIC, 3, { status: 'postponed', points: 0 });
        const day = makeDay([gone], [postponedGame(), openGame()], { credits: undefined });
        const saved = entry([gone.id], gone.id, { picks: { 3: LIC, 5: EST }, history: { v: 1, players: { [gone.id]: [[at('15:00'), null]] }, captain: [[gone.id, at('15:00')]], picks: { 3: [[LIC, at('15:00')]], 5: [[EST, at('15:00')]] } } });
        expect(countedEntry(day, saved)).toMatchObject({ lineup: [], captain: null });
        expect(countedEntry(day, saved).picks).toEqual({ 5: EST });
    });

    it('agregar al que lo reemplaza con el equipo lleno saca al pospuesto (la base no acepta 7)', () => {
        const gone = player('B', LIC, 3, { status: 'postponed' });
        const batters = [0, 1, 2, 3].map((i) => player('B', i % 2 ? EST : AGU, 5));
        const pitcher = player('P', LIC, 5);
        const swap = player('B', TOR, 5);
        const day = makeDay([gone, ...batters, pitcher, swap], [postponedGame(), later(openGame())], { credits: undefined, rules: { perTeam: 3 } });
        replaceStore({ 'lidom:2026-11-10': entry([gone.id, ...batters.map((p) => p.id), pitcher.id], gone.id) });
        expect(canAdd(day, getStore()['lidom:2026-11-10'], swap, BEFORE)).toBeNull();
        expect(addPlayer(day, getStore()['lidom:2026-11-10'], swap)).toBe(true);
        expect(getStore()['lidom:2026-11-10']).toMatchObject({ lineup: [...batters.map((p) => p.id), pitcher.id, swap.id], captain: null });
    });

    it('sin rules, el tope por equipo no cuenta a los equipos de un juego pospuesto', () => {
        const day = makeDay([], [postponedGame(), openGame()]);
        expect(perTeamLimit(day)).toBe(3);
        expect(perTeamLimit(makeDay([], [postponedGame(), openGame()], { rules: { perTeam: 2 } }))).toBe(2);
    });
});

describe('tablas: los empates comparten el puesto', () => {
    it('1, 2, 2, 4 (a la décima, como se muestran)', () => {
        const rows = withRanks([{ points: 30 }, { points: 25.04 }, { points: 25 }, { points: 10 }]);
        expect(rows.map((row) => row.rank)).toEqual([1, 2, 2, 4]);
        expect(withRanks([{ points: 5 }, { points: 5 }, { points: 5 }]).map((row) => row.rank)).toEqual([1, 1, 1]);
        expect(withRanks([])).toEqual([]);
    });
});

describe('selector de peloteros', () => {
    const games = () => [
        game(1, '2026-11-10T23:30:00Z', 'preview', LIC, TOR, { away: { id: LIC, abbrev: 'LIC', isWinner: false, probable: { id: 12340001, name: 'Abridor' } } } as Partial<FantasyGame>),
        game(2, '2026-11-10T19:00:00Z', 'live', EST, AGU)
    ];

    it('estado: el del servidor o el que se saca del día', () => {
        const day = makeDay([], [...games(), game(3, '2026-11-10T17:00:00Z', 'final', EST, AGU), game(4, '2026-11-10T23:00:00Z', 'final', LIC, TOR, { status: 'postponed' })]);
        expect(statusOf(day, player('B', LIC, 1, { status: 'confirmed', starter: false }))).toBe('confirmed');
        expect(statusOf(day, player('B', LIC, 1), BEFORE)).toBe('expected');
        expect(statusOf(day, player('B', LIC, 1, { starter: false }), BEFORE)).toBe('bench');
        expect(statusOf(day, player('B', EST, 2), BEFORE)).toBe('confirmed');
        expect(statusOf(day, { ...player('P', LIC, 1), id: 12340001 }, BEFORE)).toBe('probable');
        expect(statusOf(day, player('P', TOR, 1, { rest: true }), BEFORE)).toBe('resting');
        expect(statusOf(day, player('P', TOR, 1, { startedAgo: 3 }), BEFORE)).toBe('resting');
        expect(statusOf(day, player('P', TOR, 1, { startedAgo: 5 }), BEFORE)).toBe('bullpen');
        expect(statusOf(day, player('B', EST, 3, { line: { ab: 0, h: 0 } }), BEFORE)).toBe('dnp');
        expect(statusOf(day, player('B', EST, 3, { line: { ab: 4, h: 1 } }), BEFORE)).toBe('confirmed');
        expect(statusOf(day, player('B', LIC, 4), BEFORE)).toBe('postponed');
    });

    it('rival: «LIC vs TOR» en casa y «LIC @ TOR» de visita', () => {
        const day = makeDay([], games());
        expect(opponentOf(day, player('B', LIC, 1))).toEqual({ id: TOR, abbrev: 'TOR', home: false });
        expect(opponentOf(day, player('B', TOR, 1))).toEqual({ id: LIC, abbrev: 'LIC', home: true });
        expect(opponentOf(day, player('B', TOR, 1, { opp: { id: 1, abbrev: 'XXX', home: true } }))).toEqual({ id: 1, abbrev: 'XXX', home: true });
        expect(pickerGames(day).map((g) => `${g.away}-${g.home}`)).toEqual(['EST-AGU', 'LIC-TOR']);
    });

    it('línea de la temporada y últimos 5', () => {
        const row = { hitting: { avg: '.287', ops: '.812', hr: 4, g: 20 }, pitching: null } as unknown as PlayerRow;
        expect(seasonLineOf(player('B', LIC, 1), row)).toEqual({ avg: '.287', ops: '.812', hr: 4, g: 20 });
        expect(seasonLineOf(player('B', LIC, 1, { season: null }), row)).toBeNull();
        expect(seasonLineOf(player('P', LIC, 1), row)).toBeNull();
        expect(last5Average({ last5: [3, 8, -1, 12, 5] })).toBe(5.4);
        expect(last5Average({})).toBeNull();
    });

    it('filtros: Disponibles, Me alcanza, Titulares, por juego, por equipo y búsqueda sin tildes', () => {
        const cheap = player('B', LIC, 1, { name: 'Ramón Peña', price: 5, proj: 6 });
        const pricey = player('B', TOR, 1, { name: 'Pelotero Caro', price: 12, proj: 9, starter: false });
        const lockedOne = player('B', EST, 2, { price: 4, proj: 8 });
        const mine = player('B', LIC, 1, { price: 10, proj: 7 });
        const mine2 = player('B', LIC, 1, { price: 10, proj: 7.5 });
        const thirdLic = player('B', LIC, 1, { price: 4, proj: 5 });
        const torMine = player('B', TOR, 1, { price: 25 });
        const day = makeDay([cheap, pricey, lockedOne, mine, mine2, thirdLic, torMine], games());
        // 45 de 50 créditos gastados (quedan 5) y ya 2 de LIC
        const saved = entry([mine.id, mine2.id, torMine.id]);
        const ids = (filters: Partial<ReturnType<typeof defaultFilters>>) => pickerRows(day, saved, { ...defaultFilters('B'), ...filters }, 'proj', { now: BEFORE }).map((row) => row.player.id);
        // Disponibles (de entrada): fuera el cerrado, los de LIC (ya hay 2) y el que no alcanza; los del equipo siempre se ven
        expect(ids({})).toEqual([mine2.id, mine.id, torMine.id]);
        expect(ids({ available: false })).toHaveLength(7);
        // Me alcanza: precio ≤ 5
        expect(ids({ available: false, affordable: true })).toEqual([lockedOne.id, mine2.id, mine.id, cheap.id, thirdLic.id, torMine.id]);
        // Titulares: fuera el que no abrió el último juego
        expect(ids({ available: false, starters: true })).not.toContain(pricey.id);
        expect(ids({ available: false, gamePk: 2 })).toEqual([lockedOne.id]);
        expect(ids({ available: false, teamId: TOR })).toEqual([pricey.id, torMine.id]);
        expect(ids({ available: false, search: 'ramon pena' })).toEqual([cheap.id]);
        expect(pickerRows(day, saved, defaultFilters('P'), 'proj', { now: BEFORE })).toEqual([]);
    });

    it('orden: Proyección, Valor, Precio, Pts/J, Últimos 5 y % elegido (lo que no tiene dato, al final)', () => {
        const a = player('B', LIC, 1, { proj: 9, price: 12, last5: [1, 1] });
        const b = player('B', TOR, 1, { proj: 6, price: 4, last5: [10, 12] });
        const c = player('B', LIC, 1, { proj: 7.5, price: 6 });
        const day = makeDay([a, b, c], games());
        const ctx = { now: BEFORE, ppg: new Map([[c.id, 8], [a.id, 3]]), owned: new Map([[b.id, 40]]) };
        const order = (sort: Parameters<typeof pickerRows>[3]) => pickerRows(day, entry([]), { ...defaultFilters('B'), available: false }, sort, ctx).map((row) => row.player.id);
        expect(order('proj')).toEqual([a.id, c.id, b.id]);
        expect(order('value')).toEqual([b.id, c.id, a.id]);
        expect(order('price')).toEqual([a.id, c.id, b.id]);
        expect(order('ppg')).toEqual([c.id, a.id, b.id]);
        expect(order('last5')).toEqual([b.id, a.id, c.id]);
        expect(order('owned')).toEqual([b.id, a.id, c.id]);
        expect(sortValue(a, 'value')).toBe(0.75);
    });

    it('por qué no se puede: ya empezó, ya tienes 2 de LIC, te faltan 1,5 créditos, ya tienes tu lanzador, pospuesto', () => {
        const lic = [player('B', LIC, 1, { price: 10 }), player('B', LIC, 1, { price: 10 }), player('B', LIC, 1, { price: 10 })];
        const pitcher = player('P', TOR, 1, { price: 20 });
        const otherPitcher = player('P', TOR, 1, { price: 4 });
        const pricey = player('B', TOR, 1, { price: 11.5 });
        const started = player('B', EST, 2, { price: 4 });
        const day = makeDay([...lic, pitcher, otherPitcher, pricey, started], games());
        const saved = entry([lic[0].id, lic[1].id, pitcher.id]);
        const reason = (p: FantasyPlayer) => canAdd(day, saved, p, BEFORE);
        expect(reason(started)).toBe('locked');
        expect(reason(lic[2])).toBe('team');
        expect(reasonDetail(day, saved, lic[2], 'team')).toEqual({ n: 2, team: 'LIC' });
        expect(reason(pricey)).toBe('budget');
        expect(reasonDetail(day, saved, pricey, 'budget')).toEqual({ short: 1.5 });
        expect(reason(otherPitcher)).toBe('full');
        expect(reasonDetail(day, saved, otherPitcher, 'full')).toEqual({ count: 1 });
        expect(reasonDetail(day, saved, lic[2], 'full')).toEqual({ n: 5 });
    });
});

describe('«Cómo se juega» con las reglas del día', () => {
    const interpolations = (text: string) => [...text.matchAll(/{{(\w+)}}/g)].map((match) => match[1]);
    type Tree = { [key: string]: string | Tree };
    const get = (tree: Tree, path: string) => path.split('.').reduce<string | Tree | undefined>((node, key) => (node && typeof node === 'object' ? node[key] : undefined), tree) as string;

    it('los pasos y las respuestas traen los números de rules', () => {
        const day = makeDay([], GAMES());
        expect(helpSteps(rulesOf(day))).toEqual([
            { key: 's1', values: { batters: 5, count: 1 } },
            { key: 's2', values: { budget: 50 } },
            { key: 's3', values: { captain: 1.5 } },
            { key: 's4', values: { picks: 10 } },
            { key: 's5', values: {} }
        ]);
        const v2 = rulesOf(makeDay([], GAMES(), { rules: { perTeam: 3, budget: null, roster: { batters: 4, pitchers: 2 }, prices: { min: 3, max: 15, step: 0.5, noData: 5, seasonWeights: [1, 0.5, 0.25], frozen: true } } }));
        expect(helpSteps(v2)[0].values).toEqual({ batters: 4, count: 2 });
        expect(helpSteps(v2)[1]).toEqual({ key: 's2NoCap', values: {} });
        expect(helpAnswerValues(v2)).toMatchObject({ prices: { past: 2, min: 3, max: 15 }, cantPick: { perTeam: 3 }, perTeam: { perTeam: 3 }, leagues: { code: 6 } });
        expect(helpAnswerValues(rulesOf(day)).prices).toEqual({ past: 3, min: 4, max: 12 });
        // Sin día (cargando o sin red) no se dice «hoy no hay tope»: se usan las de siempre
        expect(helpSteps(helpRules(undefined))[1]).toEqual({ key: 's2', values: { budget: 50 } });
        expect(helpRules(makeDay([], GAMES(), { credits: undefined })).budget).toBeNull();
    });

    it('los ejemplos salen de la tabla de puntos: 14 (21 de capitán), 9 y 30', () => {
        const rules = rulesOf(makeDay([], GAMES()));
        const examples = helpExamples(rules);
        expect(examples.soloHr).toEqual({ hr: 10, run: 2, rbi: 2, total: 14, captain: 21 });
        expect(examples.double).toEqual({ double: 5, rbi: 2, total: 9 });
        expect(examples.pitcher).toMatchObject({ outs: 18, outsPts: 18, kPts: 14, erPts: -4, hPts: -2.5, bbPts: -0.5, winPts: 5, total: 30 });
        const custom = helpExamples(rulesOf(makeDay([], GAMES(), { rules: { captain: 2, scoring: { batter: { homeRun: 12 }, pitcher: { out: 0.5 } } as never } })));
        expect(custom.soloHr).toMatchObject({ total: 16, captain: 32 });
        expect(custom.pitcher.total).toBe(21);
        expect(scoringRows(rules, 'batter').map((row) => row.key)).toEqual(['single', 'double', 'triple', 'homeRun', 'run', 'rbi', 'walk', 'hbp', 'stolenBase', 'strikeout']);
        expect(scoringRows(rules, 'pitcher').map((row) => row.points)).toEqual([1, 2, 5, 5, -2, -0.5, -0.5]);
    });

    it('cada texto existe en los dos idiomas, sin «MLB», y cada {{número}} lo da rules', () => {
        const rules = rulesOf(makeDay([], GAMES()));
        const answers = helpAnswerValues(rules);
        const examples = helpExamples(rules);
        for (const locale of [es, en] as unknown as Tree[]) {
            expect(JSON.stringify(locale.fantasyHelp)).not.toMatch(/MLB/);
            for (const key of HELP_FAQ) {
                expect(get(locale, `fantasyHelp.faq.${key}.q`)).toBeTruthy();
                const answer = get(locale, `fantasyHelp.faq.${key}.a`);
                for (const name of interpolations(answer)) expect(answers[key]).toHaveProperty(name);
            }
            for (const step of helpSteps(rules)) {
                const text = get(locale, `fantasyHelp.steps.${step.key}`) ?? get(locale, `fantasyHelp.steps.${step.key}_other`);
                for (const name of interpolations(text)) expect(step.values).toHaveProperty(name);
            }
            for (const [name, values] of Object.entries(examples)) {
                for (const variable of interpolations(get(locale, `fantasyHelp.examples.${name}`))) expect(values).toHaveProperty(variable);
            }
        }
    });
});

describe('guardado con estado (Guardando… / Guardado / Sin conexión)', () => {
    beforeEach(() => {
        setStoreOwner('test-guardado');
        resetSaveStatus();
    });
    afterEach(() => {
        localStorage.removeItem('el-play-fantasy-v1:test-guardado');
        setStoreOwner(null);
    });

    it('va de Guardando a Guardado y marca la versión subida con su historial', async () => {
        const saved = entry([12345678], null, { savedAt: 100 });
        replaceStore({ 'lidom:2026-11-10': saved });
        const history: EntryHistory = { v: 1, players: { 12345678: [[100, null]] } };
        const pending = saveEntry('lidom', '2026-11-10', saved, async () => history);
        expect(getSaveStatus('lidom', '2026-11-10')).toBe('saving');
        await pending;
        expect(getSaveStatus('lidom', '2026-11-10')).toBe('saved');
        expect(getStore()['lidom:2026-11-10']).toMatchObject({ syncedAt: 100, historyAt: 100, history });
        // Ya subida esa versión: no se vuelve a mandar
        let calls = 0;
        await saveEntry('lidom', '2026-11-10', getStore()['lidom:2026-11-10'], async () => {
            calls += 1;
            return null;
        });
        expect(calls).toBe(0);
        expect(getSaveStatus('lidom', '2026-11-10')).toBe('saved');
    });

    it('sin red queda «Sin conexión» y al reintentar se guarda; otro error dice que no se pudo', async () => {
        const saved = entry([12345678], null, { savedAt: 200 });
        replaceStore({ 'lidom:2026-11-10': saved });
        await saveEntry('lidom', '2026-11-10', saved, async () => {
            throw new AccountError('network');
        });
        expect(getSaveStatus('lidom', '2026-11-10')).toBe('offline');
        await saveEntry('lidom', '2026-11-10', saved, async () => {
            throw new AccountError('unknown', '400');
        });
        expect(getSaveStatus('lidom', '2026-11-10')).toBe('error');
        await saveEntry('lidom', '2026-11-10', saved, async () => null);
        expect(getSaveStatus('lidom', '2026-11-10')).toBe('saved');
        await retrySave('lidom', '2026-11-10');
        expect(getSaveStatus('lidom', '2026-11-10')).toBe('saved');
    });

    it('una respuesta vieja que llega tarde no pisa el estado del cambio nuevo', async () => {
        const first = entry([12345678], null, { savedAt: 300 });
        replaceStore({ 'lidom:2026-11-10': first });
        let release: () => void = () => undefined;
        const slow = saveEntry('lidom', '2026-11-10', first, () => new Promise((resolve) => (release = () => resolve(null))));
        const second = { ...first, savedAt: 301 };
        replaceStore({ 'lidom:2026-11-10': second });
        await saveEntry('lidom', '2026-11-10', second, async () => {
            throw new AccountError('network');
        });
        release();
        await slow;
        expect(getSaveStatus('lidom', '2026-11-10')).toBe('offline');
    });
});

describe('le toca abrir (abridor estimado por la rotación)', () => {
    const day = { date: '2026-11-10', games: [], players: [], scoring: {} } as unknown as FantasyDay;
    const pitcher = (extra: Partial<FantasyPlayer>) => ({ id: 12345678, name: 'Pelotero Uno', teamId: 901, gamePk: null, role: 'P', pos: 'P', starter: true, played: false, line: null, points: 0, ...extra }) as FantasyPlayer;

    it('«probable» con estimated sale como «rotation» y cuenta como titular; sin estimated sigue «probable»', () => {
        expect(statusOf(day, pitcher({ status: 'probable', estimated: true }))).toBe('rotation');
        expect(statusOf(day, pitcher({ status: 'probable' }))).toBe('probable');
        expect(statusOf(day, pitcher({ status: 'bullpen', estimated: true }))).toBe('bullpen');
    });

    it('tiene su etiqueta en español e inglés', () => {
        expect(es.fantasyHelp.status.rotation).toBe('Le toca abrir');
        expect(en.fantasyHelp.status.rotation).toBe('Due to start');
    });
});
