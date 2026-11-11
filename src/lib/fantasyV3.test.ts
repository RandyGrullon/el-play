// Fantasy v3 en el cliente, con datos inventados: copiar el equipo de ayer, deshacer, agregar desde las ideas (y por
// qué no se puede), los logros (del servidor y el cálculo de respaldo), las semanas de una liga y la imagen del equipo.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    addPlayer,
    applyLineup,
    copyLineup,
    copySource,
    getStore,
    planCopy,
    removeId,
    replaceStore,
    resetUndo,
    setCaptain,
    setPick,
    setStoreOwner,
    undoLast,
    undoState,
    type DayEntry,
    type FantasyDay,
    type FantasyGame,
    type FantasyPlayer
} from './fantasy';
import { addIdea, ideaState, trendLists, trendMetric, type FantasyTrends } from './fantasyTrends';
import { achievementList, achievementsFromServer, cleanStats, seasonData, statsFromProfile, withWeekTitle, type FanStats } from './fantasyStats';
import { confirmsName, lastChampion, sortWeeks, weekName, weekTitle, type LeagueWeek } from './fantasyLeagues';
import type { FanDay, FanProfileData } from './fans';
import { fantasyTeamPost } from '../share/subjects';

const LIC = 12345601;
const TOR = 12345602;
const EST = 12345603;
const AGU = 12345604;
const TEAMS: FantasyDay['teams'] = {
    [LIC]: { id: LIC, abbrev: 'LIC', color: '#123456', logo: '' },
    [TOR]: { id: TOR, abbrev: 'TOR', color: '#654321', logo: '' },
    [EST]: { id: EST, abbrev: 'EST', color: '#abcdef', logo: '' },
    [AGU]: { id: AGU, abbrev: 'AGU', color: '#fedcba', logo: '' }
};
const side = (id: number) => ({ id, abbrev: TEAMS[id].abbrev, name: TEAMS[id].abbrev, color: TEAMS[id].color, logo: '', isWinner: false, score: null, probable: null });
const game = (gamePk: number, date: string, state: FantasyGame['state'], away: number, home: number, extra: Partial<FantasyGame> = {}) =>
    ({ gamePk, date, state, detailedState: 'Scheduled', startTimeTBD: false, away: side(away), home: side(home), live: null, ...extra }) as unknown as FantasyGame;
const player = (id: number, name: string, role: 'B' | 'P', teamId: number, gamePk: number, extra: Partial<FantasyPlayer> = {}): FantasyPlayer => ({
    id,
    name,
    teamId,
    gamePk,
    role,
    pos: role === 'P' ? 'P' : 'SS',
    starter: true,
    played: false,
    line: null,
    points: 0,
    price: 10,
    proj: 5,
    ...extra
});

// LIC-TOR por empezar (lejos en el futuro), EST @ AGU ya empezó y un juego pospuesto
const FUTURE = '2099-11-10T23:30:00Z';
const UNO = 12345678;
const DOS = 12345679;
const TRES = 12345680;
const CUATRO = 12345681;
const CINCO = 12345682;
const SEIS = 12345683;
const VIEJO = 12345699;
const PLAYERS = [
    player(UNO, 'Pelotero Uno', 'B', LIC, 1),
    player(DOS, 'Pelotero Dos', 'B', LIC, 1),
    player(TRES, 'Pelotero Tres', 'B', LIC, 1),
    player(CUATRO, 'Pelotero Cuatro', 'B', EST, 2, { played: true, points: 7 }),
    player(CINCO, 'Pelotero Cinco', 'B', TOR, 3, { status: 'postponed' }),
    player(SEIS, 'Pelotero Seis', 'P', TOR, 1, { price: 35 })
];
const DAY: FantasyDay = {
    league: 'lidom',
    date: '2099-11-10',
    games: [game(1, FUTURE, 'preview', LIC, TOR), game(2, '2026-11-10T19:00:00Z', 'live', EST, AGU), game(3, FUTURE, 'final', TOR, LIC, { status: 'postponed', detailedState: 'Postponed' })],
    teams: TEAMS,
    players: PLAYERS,
    scoring: { batter: {}, pitcher: {} },
    credits: { budget: 50, min: 4, max: 12 }
};
const KEY = 'lidom:2099-11-10';
const empty = (): DayEntry => ({ lineup: [], captain: null, picks: {}, savedAt: 0 });
const saved = () => getStore()[KEY] ?? empty();

beforeEach(() => {
    setStoreOwner('test-v3');
    replaceStore({});
    resetUndo();
});
afterEach(() => {
    localStorage.removeItem('el-play-fantasy-v1:test-v3');
    setStoreOwner(null);
});

// ---------------------------------------------------------------- copiar el equipo de ayer

describe('copiar mi equipo de ayer', () => {
    const yesterday = { lineup: [UNO, DOS, TRES, CUATRO, CINCO, VIEJO, SEIS], captain: DOS };

    it('en el orden de ayer, con los cupos, el máximo por equipo y los créditos; dice qué no entró y por qué', () => {
        const plan = planCopy(DAY, empty(), yesterday);
        expect(plan.added).toEqual([UNO, DOS]);
        expect(plan.skipped).toEqual([
            { id: TRES, reason: 'team' },
            { id: CUATRO, reason: 'locked' },
            { id: CINCO, reason: 'postponed' },
            { id: VIEJO, reason: 'notPlaying' },
            // 20 + 35 > 50 créditos
            { id: SEIS, reason: 'budget' }
        ]);
        expect(plan.lineup).toEqual([UNO, DOS]);
        // El capitán de ayer entró y no se ha cerrado: se queda
        expect(plan.captainCopied).toBe(true);
        expect(plan.captain).toBe(DOS);
    });

    it('los que ya están se quedan (no son un problema) y no se cambia el capitán ya escogido', () => {
        const plan = planCopy(DAY, { ...empty(), lineup: [DOS], captain: DOS }, { lineup: [UNO, DOS], captain: UNO });
        expect(plan.added).toEqual([UNO]);
        expect(plan.skipped).toEqual([]);
        expect(plan.lineup).toEqual([DOS, UNO]);
        expect(plan.captainCopied).toBe(false);
        expect(plan.captain).toBe(DOS);
    });

    it('un capitán que ya se cerró no pasa; con el rol lleno, «full»', () => {
        expect(planCopy(DAY, empty(), { lineup: [UNO, CUATRO], captain: CUATRO }).captain).toBeNull();
        const many = [1, 2, 3, 4, 5].map((n) => player(12345610 + n, `Bateador ${n}`, 'B', n % 2 ? TOR : AGU, 1, { price: 4 }));
        const day = { ...DAY, players: [...PLAYERS, ...many], rules: { perTeam: 5 } };
        const plan = planCopy(day, { ...empty(), lineup: many.map((p) => p.id) }, { lineup: [UNO], captain: null });
        expect(plan.skipped).toEqual([{ id: UNO, reason: 'full' }]);
    });

    it('copia al guardar, se puede deshacer y busca el último equipo de los 7 días anteriores', () => {
        replaceStore({
            'lidom:2099-11-09': { ...empty(), lineup: [] },
            'lidom:2099-11-08': { ...empty(), lineup: [UNO], savedAt: 1 },
            'lidom:2099-11-01': { ...empty(), lineup: [DOS], savedAt: 1 },
            'lidom:2099-11-10': { ...empty(), lineup: [TRES], savedAt: 1 },
            'wbc:2099-11-09': { ...empty(), lineup: [DOS], savedAt: 1 }
        });
        expect(copySource(getStore(), 'lidom', '2099-11-10')?.date).toBe('2099-11-08');
        expect(copySource(getStore(), 'lidom', '2099-11-20')).toBeNull();
        replaceStore({});
        const plan = copyLineup(DAY, empty(), yesterday);
        expect(saved().lineup).toEqual([UNO, DOS]);
        expect(saved().captain).toBe(DOS);
        expect(plan.added).toHaveLength(2);
        expect(undoState(DAY, saved())?.kind).toBe('copy');
        expect(undoLast(DAY)).toBe(true);
        expect(saved().lineup).toEqual([]);
        expect(saved().captain).toBeNull();
    });
});

// ---------------------------------------------------------------- deshacer

describe('deshacer', () => {
    it('agregar, quitar, capitán y completar: un solo paso', () => {
        addPlayer(DAY, saved(), PLAYERS[0]);
        expect(undoState(DAY, saved())).toEqual({ kind: 'add', playerId: UNO });
        addPlayer(DAY, saved(), PLAYERS[1]);
        setCaptain(DAY, saved(), PLAYERS[1]);
        expect(undoState(DAY, saved())?.kind).toBe('captain');
        expect(undoLast(DAY)).toBe(true);
        expect(saved()).toMatchObject({ lineup: [UNO, DOS], captain: null });
        // Un paso: ya no queda nada por deshacer
        expect(undoState(DAY, saved())).toBeNull();
        expect(undoLast(DAY)).toBe(false);
        removeId(DAY, UNO);
        expect(undoState(DAY, saved())).toEqual({ kind: 'remove', playerId: UNO });
        undoLast(DAY);
        expect(saved().lineup).toEqual([UNO, DOS]);
        applyLineup(DAY, [UNO, DOS, SEIS], UNO, Date.now(), 'fill');
        expect(undoState(DAY, saved())?.kind).toBe('fill');
        undoLast(DAY);
        expect(saved()).toMatchObject({ lineup: [UNO, DOS], captain: null });
    });

    it('los pronósticos no se tocan y no cuentan como cambio', () => {
        addPlayer(DAY, saved(), PLAYERS[0]);
        setPick(DAY, DAY.games[0], LIC);
        expect(undoState(DAY, saved())?.kind).toBe('add');
        undoLast(DAY);
        expect(saved().lineup).toEqual([]);
        expect(saved().picks).toEqual({ 1: LIC });
    });

    it('no se puede si un pelotero del cambio ya se cerró o si el equipo cambió por otro lado', () => {
        addPlayer(DAY, saved(), PLAYERS[0]);
        const afterStart = Date.parse(FUTURE) + 60000;
        expect(undoState(DAY, saved(), afterStart)).toBeNull();
        expect(undoLast(DAY, afterStart)).toBe(false);
        expect(saved().lineup).toEqual([UNO]);
        // La cuenta trajo otro equipo (otro teléfono): el paso ya no vale
        replaceStore({ [KEY]: { ...saved(), lineup: [DOS] } });
        expect(undoState(DAY, saved())).toBeNull();
        // Otro día no ve el paso de este
        addPlayer(DAY, saved(), PLAYERS[0]);
        expect(undoState({ ...DAY, date: '2099-11-11' }, saved())).toBeNull();
    });
});

// ---------------------------------------------------------------- ideas

describe('ideas para hoy', () => {
    it('agregar usa la regla del selector y da la misma razón', () => {
        const entry: DayEntry = { ...empty(), lineup: [UNO, DOS] };
        expect(ideaState(DAY, entry, { id: VIEJO }).reason).toBe('missing');
        expect(ideaState(DAY, entry, { id: CUATRO }).reason).toBe('locked');
        expect(ideaState(DAY, entry, { id: CINCO }).reason).toBe('postponed');
        expect(ideaState(DAY, entry, { id: TRES }).reason).toBe('team');
        expect(ideaState(DAY, entry, { id: UNO })).toMatchObject({ inTeam: true, reason: 'already' });
        expect(ideaState(DAY, { ...empty(), lineup: [SEIS, UNO] }, { id: DOS }).reason).toBe('budget');
        expect(ideaState(DAY, entry, { id: SEIS }).reason).toBe('budget');
        expect(addIdea(DAY, entry, { id: TRES }).added).toBe(false);
        expect(addIdea(DAY, empty(), { id: UNO })).toMatchObject({ added: true, reason: null });
        expect(saved().lineup).toEqual([UNO]);
        expect(undoState(DAY, saved())?.kind).toBe('add');
    });

    it('solo las listas con algo, sin filas rotas; cada lista con su número (o el que se saca)', () => {
        const trends = {
            date: '2099-11-10',
            hot: [{ id: UNO, name: 'Pelotero Uno', teamId: LIC, role: 'B', last5: [10, 20, 30] }, { id: 'x' }],
            bargains: [{ id: DOS, name: 'Pelotero Dos', teamId: LIC, role: 'B', proj: 9, price: 6 }],
            risers: [],
            pitchers: [{ id: SEIS, name: 'Pelotero Seis', teamId: TOR, role: 'P', matchup: { oppOps: '.650', edge: 'good' } }],
            popular: 'roto'
        } as unknown as FantasyTrends;
        const lists = trendLists(trends);
        expect(lists.map((list) => list.key)).toEqual(['hot', 'bargains', 'pitchers']);
        expect(lists[0].items).toHaveLength(1);
        expect(trendMetric('hot', lists[0].items[0])).toBe(20);
        expect(trendMetric('bargains', lists[1].items[0])).toBe(1.5);
        expect(trendMetric('pitchers', lists[2].items[0])).toBe('good');
        expect(trendMetric('risers', { id: 1, name: 'x', teamId: LIC, role: 'B', priceDelta: -1 })).toBe(-1);
        expect(trendLists(null)).toEqual([]);
    });
});

// ---------------------------------------------------------------- logros y temporada

const fanDay = (date: string, total: number, extra: Partial<FanDay> = {}): FanDay => ({ date, final: true, live: false, team: total, picks: 0, total, lineup: [UNO], captain: null, picksMade: 0, ...extra });
const profileOf = (days: FanDay[], points: number): FanProfileData => ({
    userId: '00000000-0000-4000-8000-000000000001',
    league: 'lidom',
    name: 'Fanático Prueba',
    season: { points, days: days.length, best: { date: days[0]?.date ?? '2099-11-01', points: Math.max(0, ...days.map((day) => day.total)) } },
    days
});
// 12 días seguidos (del 1 al 12), uno de 60 puntos: 540 en la temporada
const DAYS = Array.from({ length: 12 }, (_, i) => fanDay(`2099-11-${String(12 - i).padStart(2, '0')}`, i === 3 ? 60 : 43.6));
const PROFILE = profileOf(DAYS, 540);

describe('logros', () => {
    it('los del servidor: en el orden de siempre, sin los que el cliente no conoce', () => {
        const list = achievementsFromServer([
            { id: 'season500', unlockedAt: null, progress: { value: 320, goal: 500 } },
            { id: 'algoNuevo', unlockedAt: '2099-11-01', progress: null },
            { id: 'firstTeam', unlockedAt: '2099-10-17', progress: null },
            { id: 'streak3', unlockedAt: '', progress: { value: 9, goal: 3 } }
        ]);
        expect(list.map((item) => item.id)).toEqual(['firstTeam', 'streak3', 'season500']);
        expect(list[0]).toEqual({ id: 'firstTeam', done: true, date: '2099-10-17', progress: null });
        // Sin fecha no está desbloqueado; el progreso nunca pasa de la meta
        expect(list[1]).toMatchObject({ done: false, progress: { value: 3, goal: 3 } });
    });

    it('sin el servidor (404 o sin logros): el cálculo de antes con los ids nuevos', () => {
        const expected = ['firstTeam', 'days10', 'day50', 'day100', 'streak3', 'streak7', 'perfectPicks', 'season500'];
        const fallback = achievementList(null, PROFILE);
        expect(fallback.map((item) => item.id)).toEqual(expected);
        expect(fallback.filter((item) => item.done).map((item) => item.id)).toEqual(['firstTeam', 'days10', 'day50', 'streak3', 'streak7', 'season500']);
        expect(fallback.every((item) => item.date === null)).toBe(true);
        expect(fallback.find((item) => item.id === 'day100')?.progress).toBeNull();
        // Una respuesta sin logros también usa el respaldo; sin nada, nada
        expect(achievementList(cleanStats({ achievements: [] }, PROFILE.userId, 'lidom'), PROFILE).map((item) => item.id)).toEqual(expected);
        expect(achievementList(null, null)).toEqual([]);
    });

    it('«Campeón de la semana» lo pone la app con /weeks de sus ligas', () => {
        const list = achievementsFromServer([{ id: 'weekChampion', unlockedAt: null, progress: null }]);
        expect(withWeekTitle(list, null)).toBe(list);
        expect(withWeekTitle(list, '2099-11-08')[0]).toEqual({ id: 'weekChampion', done: true, date: '2099-11-08', progress: null });
        const weeks: LeagueWeek[] = [
            { start: '2099-11-02', end: '2099-11-08', rows: [], champion: '00000000-0000-4000-8000-0000000000A1' },
            { start: '2099-10-26', end: '2099-11-01', rows: [], champion: '00000000-0000-4000-8000-0000000000a1' },
            { start: '2099-11-09', end: '2099-11-15', rows: [], champion: null }
        ];
        expect(weekTitle(weeks, '00000000-0000-4000-8000-0000000000a1')).toBe('2099-11-01');
        expect(weekTitle(weeks, '00000000-0000-4000-8000-0000000000b2')).toBeNull();
    });

    it('la temporada: la del servidor si llegó; si no, la del perfil (sin capitán, pronósticos ni peloteros)', () => {
        const server = cleanStats({ totals: { days: 3, total: 120 } } as Partial<FanStats>, PROFILE.userId, 'lidom');
        expect(seasonData(server, PROFILE)).toEqual({ stats: server, full: true });
        expect(server.picks).toEqual({ made: 0, hits: 0, pct: null });
        const fallback = seasonData(null, PROFILE)!;
        expect(fallback.full).toBe(false);
        expect(fallback.stats.totals).toMatchObject({ days: 12, total: 540, avg: 45, best: { date: '2099-11-12', total: 60 } });
        expect(fallback.stats.streak).toEqual({ current: 12, longest: 12 });
        expect(fallback.stats.days[0].date).toBe('2099-11-01');
        expect(statsFromProfile(profileOf([], 0)).totals.days).toBe(0);
        expect(seasonData(null, null)).toBeNull();
    });
});

// ---------------------------------------------------------------- semanas

describe('semanas de una liga', () => {
    const t = (key: string, options?: Record<string, unknown>) => `${key}${options?.count !== undefined ? `:${options.count}` : ''}`;
    it('de la más nueva a la más vieja, con el campeón de la semana pasada', () => {
        const weeks: LeagueWeek[] = [
            { start: '2099-10-26', end: '2099-11-01', rows: [{ userId: 'a', total: 300, days: 5, rank: 1 }], champion: 'a' },
            { start: '2099-11-09', end: '2099-11-15', rows: [{ userId: 'b', total: 90, days: 2, rank: 1 }], champion: null },
            { start: '2099-11-02', end: '2099-11-08', rows: [{ userId: 'b', total: 310, days: 6, rank: 1 }], champion: 'b' }
        ];
        expect(sortWeeks(weeks).map((week) => week.start)).toEqual(['2099-11-09', '2099-11-02', '2099-10-26']);
        expect(lastChampion(weeks)).toMatchObject({ userId: 'b', total: 310, week: { start: '2099-11-02' } });
        expect(lastChampion([weeks[1]])).toBeNull();
        expect([0, 1, 2].map((index) => weekName(index, t))).toEqual(['fantasyLeagues.thisWeek', 'fantasyLeagues.lastWeek', 'fantasyLeagues.weeksAgo:2']);
    });

    it('borrar la liga pide su nombre tal cual (sin importar mayúsculas ni espacios)', () => {
        expect(confirmsName('  liga   de los PANAS ', 'Liga de los panas')).toBe(true);
        expect(confirmsName('Liga de los', 'Liga de los panas')).toBe(false);
        expect(confirmsName('', '')).toBe(false);
    });
});

// ---------------------------------------------------------------- imagen del equipo

describe('compartir mi equipo como imagen', () => {
    const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}(${Object.values(options).join(',')})` : key);
    it('fotos, capitán, precios y créditos; los puntos solo con su juego empezado', () => {
        const entry: DayEntry = { ...empty(), lineup: [UNO, CUATRO], captain: UNO };
        const post = fantasyTeamPost(DAY, entry, 'LIDOM', 10.5, t, 'es');
        expect(post.kind).toBe('fantasy');
        expect(post.credits).toBe('fantasyIdeas.share.credits(20,50)');
        expect(post.players.map((p) => [p.name, p.captain, p.points])).toEqual([
            ['Pelotero Uno', true, null],
            ['Pelotero Cuatro', false, '7']
        ]);
        expect(post.players[0].price).toBe('fantasyIdeas.share.price(10)');
        // Ya empezó un juego del equipo: va el total del día
        expect(post.total).toBe('10,5');
        expect(fantasyTeamPost(DAY, { ...entry, lineup: [UNO] }, 'LIDOM', 0, t, 'es').total).toBeNull();
        expect(fantasyTeamPost({ ...DAY, rules: { budget: null } }, entry, 'LIDOM', 0, t, 'es').credits).toBe('fantasyIdeas.share.noCap');
    });
});
