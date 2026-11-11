import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

// Fantasy v3: «Mi temporada» (GET /v2/fantasy/fan/:userId/stats), los logros y las semanas de una liga privada
// (GET /v2/fantasy/weeks), con datos inventados: peloteros 12345601…, equipos 9901…, juegos 99000001… y fanáticos con
// uuids de mentira. La API es CommonJS: se carga con require para sustituir http.mlbGet, fantasy.fantasyDay,
// env.supabaseConfig y fetch (Supabase).
const require = createRequire(import.meta.url);

const http = require('../services/http');
const fantasy = require('../services/fantasy');
const env = require('../utils/env');
const { clearCache } = require('../utils/cache');
const app = require('../app');
const stats = require('../services/fantasyStats');
const { achievementsOf, ACHIEVEMENTS } = require('../services/fantasyAchievements');
const { todayOf } = require('../services/pro/games');

const realGet = http.mlbGet;
const realDay = fantasy.fantasyDay;
const realConfig = env.supabaseConfig;
const realFetch = globalThis.fetch;
afterEach(() => {
    http.mlbGet = realGet;
    fantasy.fantasyDay = realDay;
    env.supabaseConfig = realConfig;
    globalThis.fetch = realFetch;
    delete process.env.MLB_MOCK;
    clearCache();
});

const withServer = async (run) => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        await run(`http://127.0.0.1:${server.address().port}/api`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
};

const sMaxAge = (response) => Number((response.headers.get('cache-control') || '').match(/s-maxage=(\d+)/)?.[1]);

// ---------------------------------------------------------------- días y fanáticos inventados

const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const C = 'cccccccc-3333-4333-8333-cccccccccccc';
const P1 = 12345601;
const P2 = 12345602;
const P3 = 12345603;
const P4 = 12345604;
// Miércoles, jueves y viernes con juegos; el sábado 17 no hay; el domingo 18 es «hoy» (uno en vivo y uno por empezar)
const D1 = '2026-10-14';
const D2 = '2026-10-15';
const D3 = '2026-10-16';
const D4 = '2026-10-18';
const NOW = Date.parse('2026-10-18T22:00:00Z');
const FUTURE = '2030-01-01T00:00:00Z';

const team = (id) => ({ id, name: `Equipo ${id}`, abbrev: `E${String(id).slice(-2)}`, color: '#123456', logo: `logo-${id}.svg` });
const side = (id, isWinner) => ({ ...team(id), score: null, isWinner });
const game = (gamePk, state, date, away, home, winner = null) => ({ gamePk, state, date, away: side(away, winner === away), home: side(home, winner === home) });
const player = (id, teamId, gamePk, role, points, price) => ({ id, name: `Pelotero ${id}`, teamId, gamePk, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: points !== null, line: points === null ? null : {}, points: points ?? 0, price });

const DAYS = {
    [D1]: {
        games: [game(99000001, 'final', `${D1}T20:00:00Z`, 9901, 9902, 9901), game(99000002, 'final', `${D1}T23:00:00Z`, 9903, 9904, 9904), game(99000007, 'final', `${D1}T23:00:00Z`, 9905, 9906, 9905)],
        players: [player(P1, 9901, 99000001, 'B', 30, 4), player(P2, 9902, 99000001, 'B', 4, 8), player(P3, 9903, 99000002, 'P', 12, 10), player(P4, 9904, 99000002, 'B', 20, 6)]
    },
    [D2]: {
        games: [game(99000003, 'final', `${D2}T23:00:00Z`, 9901, 9903, 9903)],
        players: [player(P1, 9901, 99000003, 'B', 8, 5), player(P3, 9903, 99000003, 'P', 18, 10)]
    },
    [D3]: {
        games: [game(99000004, 'final', `${D3}T23:00:00Z`, 9902, 9904, 9902)],
        players: [player(P2, 9902, 99000004, 'B', 16, 8), player(P4, 9904, 99000004, 'B', 2, 6)]
    },
    [D4]: {
        games: [game(99000005, 'live', `${D4}T20:00:00Z`, 9901, 9902), game(99000006, 'preview', FUTURE, 9903, 9904)],
        players: [player(P1, 9901, 99000005, 'B', 5, 5), player(P2, 9902, 99000005, 'B', 3, 8), player(P3, 9903, 99000006, 'P', null, 10), player(P4, 9904, 99000006, 'B', null, 6)]
    }
};
const fakeDay = async (league, date) => {
    const day = DAYS[date] || { games: [], players: [] };
    return { league, date, teams: Object.fromEntries(day.games.flatMap((g) => [g.away, g.home]).map((t) => [t.id, team(t.id)])), scoring: {}, ...day };
};

const ROWS = [
    // A: los 3 pronósticos del 14 acertados, capitán P1 (30 × 1,5 = 45) → 77 + 30 = 107
    { user_id: A, day: D1, lineup: [P1, P3, P4], captain: P1, picks: { 99000001: 9901, 99000002: 9904, 99000007: 9905 } },
    // El 16: P2 capitán 16 × 1,5 = 24 + P4 2 = 26; pronóstico fallado
    { user_id: A, day: D3, lineup: [P2, P4], captain: P2, picks: { 99000004: 9904 } },
    // Hoy: P1 en vivo (5); P3 y el capitán y el pronóstico del juego por empezar no salen
    { user_id: A, day: D4, lineup: [P1, P3], captain: P3, picks: { 99000005: 9901, 99000006: 9903 } },
    { user_id: B, day: D1, lineup: [P2, P4], captain: P4, picks: { 99000001: 9902 } },
    { user_id: B, day: D4, lineup: [P2], captain: P2, picks: {} },
    // C empata con A el 14 (107) y juega los tres primeros días, hoy no
    { user_id: C, day: D1, lineup: [P1, P3, P4], captain: P1, picks: { 99000001: 9901, 99000002: 9904, 99000007: 9905 } },
    { user_id: C, day: D2, lineup: [P1, P3], captain: P3, picks: { 99000003: 9901 } },
    { user_id: C, day: D3, lineup: [P4], captain: P4, picks: {} }
];

// Supabase de mentira como PostgREST: filtra por usuario y día, ordena, respeta limit y Range
const fakeSupabase = async (url, init = {}) => {
    const u = new URL(url);
    const headers = init.headers || {};
    const json = (data, extra = {}) => ({ ok: true, status: 200, headers: new Headers(extra), json: async () => data });
    if (u.pathname.endsWith('/profiles')) return json([]);
    const user = u.searchParams.get('user_id')?.replace('eq.', '');
    const filters = u.searchParams.getAll('day').map((value) => value.split('.'));
    let rows = ROWS.filter((row) => (!user || row.user_id === user) && filters.every(([op, day]) => (op === 'gte' ? row.day >= day : op === 'lte' ? row.day <= day : row.day === day)));
    rows.sort((a, b) => b.day.localeCompare(a.day) || a.user_id.localeCompare(b.user_id));
    const total = rows.length;
    if (u.searchParams.get('limit')) rows = rows.slice(0, Number(u.searchParams.get('limit')));
    if (headers.Range) {
        const [from, to] = headers.Range.split('-').map(Number);
        rows = rows.slice(from, to + 1);
    }
    return json(rows, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${/count=exact/.test(headers.Prefer || '') ? total : '*'}` });
};

const setupFans = () => {
    clearCache();
    fantasy.fantasyDay = fakeDay;
    env.supabaseConfig = () => ({ url: 'https://supabase.test', key: 'sb_publishable_prueba' });
    globalThis.fetch = fakeSupabase;
    http.mlbGet = async (url) => {
        if (url.endsWith('/league/131')) return { leagues: [{ season: '2026', numGames: 50 }] };
        throw new Error(`sin ruta ${url}`);
    };
};

const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));

// ---------------------------------------------------------------- «Mi temporada»

describe('fantasy v3: la temporada de un fanático (stats)', () => {
    it('días con su puesto compartido entre todos, totales, capitán, pronósticos y peloteros sin lo que no ha empezado', async () => {
        setupFans();
        const { data, live, nextLockAt } = await stats.computeFanStats('lidom', A, { today: D4, now: NOW });
        expect(data).toMatchObject({ userId: A, league: 'lidom', season: 2026 });
        // El 14 A y C empatan en 107: los dos son 1.º y B 3.º
        expect(data.days).toEqual([
            { date: D1, team: 77, picks: 30, total: 107, rank: 1, players: 3 },
            { date: D3, team: 26, picks: 0, total: 26, rank: 1, players: 2 },
            { date: D4, team: 5, picks: 0, total: 5, rank: 1, players: 2 }
        ]);
        // Puntos y promedio con todos los días empezados; mediana, mejor y peor solo con los terminados
        expect(data.totals).toEqual({ days: 3, total: 138, avg: 46, median: 66.5, best: { date: D1, total: 107 }, worst: { date: D3, total: 26 } });
        // Días de juego: 14, 15, 16 y 18 (el 17 no hubo). A no jugó el 15: racha de 2 (16 y 18)
        expect(data.streak).toEqual({ current: 2, longest: 2 });
        // Capitán: P1 el 14 (45, 15 extra) y P2 el 16 (24, 8 extra); el de hoy (P3) no ha empezado: no cuenta
        expect(data.captain).toEqual({ days: 2, avg: 34.5, bonus: 23, best: { id: P1, name: `Pelotero ${P1}`, points: 45, date: D1 } });
        // 3 de 3 el 14, 0 de 1 el 16; el de hoy en vivo y el escondido no cuentan
        expect(data.picks).toEqual({ made: 4, hits: 3, pct: 75 });
        // P3 de hoy no sale (su juego no ha empezado): solo su día del 14
        expect(data.players).toEqual([
            { id: P1, name: `Pelotero ${P1}`, teamId: 9901, role: 'B', days: 2, points: 50 },
            { id: P4, name: `Pelotero ${P4}`, teamId: 9904, role: 'B', days: 2, points: 22 },
            { id: P2, name: `Pelotero ${P2}`, teamId: 9902, role: 'B', days: 1, points: 24 },
            { id: P3, name: `Pelotero ${P3}`, teamId: 9903, role: 'P', days: 1, points: 12 }
        ]);
        expect(live).toBe(true);
        expect(nextLockAt).toBe(Date.parse(FUTURE));
    });

    it('logros con su avance: todos los definidos, desbloqueados con el día o bloqueados', async () => {
        setupFans();
        const { data } = await stats.computeFanStats('lidom', A, { today: D4, now: NOW });
        expect(data.achievements.map((item) => item.id)).toEqual(ACHIEVEMENTS.map((def) => def.id));
        const got = byId(data.achievements);
        expect(got.firstTeam).toEqual({ id: 'firstTeam', unlockedAt: D1, progress: null });
        expect(got.days10).toEqual({ id: 'days10', unlockedAt: null, progress: { value: 3, goal: 10 } });
        expect(got.day50).toEqual({ id: 'day50', unlockedAt: D1, progress: { value: 50, goal: 50 } });
        expect(got.day100).toEqual({ id: 'day100', unlockedAt: D1, progress: { value: 100, goal: 100 } });
        expect(got.day150).toEqual({ id: 'day150', unlockedAt: null, progress: { value: 107, goal: 150 } });
        expect(got.streak3).toEqual({ id: 'streak3', unlockedAt: null, progress: { value: 2, goal: 3 } });
        // 3 pronósticos acertados el 14
        expect(got.perfectPicks.unlockedAt).toBe(D1);
        // P1 capitán con 30 sin el ×1,5, el que más hizo del equipo
        expect(got.captainMvp.unlockedAt).toBe(D1);
        // P1 costaba 4 y le dio 45
        expect(got.bargain.unlockedAt).toBe(D1);
        // Solo días terminados: 107 + 26
        expect(got.season500).toEqual({ id: 'season500', unlockedAt: null, progress: { value: 133, goal: 500 } });
        // Primero con solo 3 fanáticos: no alcanza para ninguno de los dos
        expect(got.top10Day.unlockedAt).toBeNull();
        expect(got.dayLeader.unlockedAt).toBeNull();
        // Con la llave publishable no se leen las ligas privadas: no se sabe
        expect(got.weekChampion).toEqual({ id: 'weekChampion', unlockedAt: null, progress: null });
    });

    it('la racha actual no se corta por hoy si todavía no ha armado equipo', async () => {
        setupFans();
        const { data } = await stats.computeFanStats('lidom', C, { today: D4, now: NOW });
        expect(data.streak).toEqual({ current: 3, longest: 3 });
        expect(byId(data.achievements).streak3).toEqual({ id: 'streak3', unlockedAt: D3, progress: { value: 3, goal: 3 } });
        expect(data.days.map((day) => [day.date, day.rank, day.players])).toEqual([
            [D1, 1, 3],
            [D2, 1, 1],
            [D3, 2, 2]
        ]);
    });

    it('un fanático nuevo: todo vacío y los logros bloqueados', async () => {
        setupFans();
        const { data } = await stats.computeFanStats('lidom', 'dddddddd-4444-4444-8444-dddddddddddd', { today: D4, now: NOW });
        expect(data).toMatchObject({
            days: [],
            totals: { days: 0, total: 0, avg: 0, median: 0, best: null, worst: null },
            streak: { current: 0, longest: 0 },
            captain: { days: 0, avg: 0, bonus: 0, best: null },
            picks: { made: 0, hits: 0, pct: null },
            players: []
        });
        expect(data.achievements.every((item) => item.unlockedAt === null)).toBe(true);
    });

    it('ruta: forma, caché, uuid inválido 400 y sin Supabase 503', async () => {
        setupFans();
        await withServer(async (base) => {
            const ok = await realFetch(`${base}/v2/fantasy/fan/${A.toUpperCase()}/stats?league=lidom`);
            expect(ok.status).toBe(200);
            // Hoy (el 18 de la prueba) sigue en vivo para la temporada: un minuto
            expect(sMaxAge(ok)).toBe(60);
            const body = await ok.json();
            expect(Object.keys(body).sort()).toEqual(['achievements', 'captain', 'days', 'league', 'partial', 'picks', 'players', 'season', 'streak', 'totals', 'updatedAt', 'userId']);
            expect(body.userId).toBe(A);
            expect((await realFetch(`${base}/v2/fantasy/fan/12345678/stats?league=lidom`)).status).toBe(400);
            expect((await realFetch(`${base}/v2/fantasy/fan/${A}/stats?league=nada`)).status).toBe(400);
            env.supabaseConfig = () => null;
            const off = await realFetch(`${base}/v2/fantasy/fan/${A}/stats?league=lidom`);
            expect(off.status).toBe(503);
            expect(await off.json()).toEqual({ error: 'accounts_disabled' });
            expect(off.headers.get('cache-control')).toBe('no-store');
        });
    });
});

// ---------------------------------------------------------------- logros (reglas)

describe('fantasy v3: reglas de los logros', () => {
    const day = (date, extra = {}) => ({ date, saved: true, started: true, final: true, team: true, total: 10, rank: 5, fans: 20, picksMade: 0, picksHit: 0, lineup: [], ...extra });

    it('puestos con mínimo de fanáticos, ganga, capitán y avance que no pasa de la meta', () => {
        const list = achievementsOf({
            days: [
                // 1.º de 4: no cuenta para «líder del día» (hacen falta 5)
                day('2026-10-14', { rank: 1, fans: 4 }),
                // 8.º de 9: tampoco para el top 10 (hacen falta 10)
                day('2026-10-15', { rank: 8, fans: 9 }),
                // En vivo: no cuenta aunque vaya 1.º con 200
                day('2026-10-16', { final: false, rank: 1, fans: 50, total: 200 }),
                day('2026-10-17', { rank: 1, fans: 5, total: 60, lineup: [{ points: 16, score: 24, captain: true, price: 5 }, { points: 16, score: 16, captain: false, price: 12 }] }),
                day('2026-10-18', { rank: 10, fans: 10, picksMade: 3, picksHit: 3 })
            ],
            gameDays: ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']
        });
        const got = byId(list);
        expect(got.dayLeader.unlockedAt).toBe('2026-10-17');
        // 1.º de 5 tampoco es top 10 de un día con 10 fanáticos: el 18 (10.º de 10) sí
        expect(got.top10Day.unlockedAt).toBe('2026-10-18');
        // Empatado con otro del equipo también es el que más hizo
        expect(got.captainMvp.unlockedAt).toBe('2026-10-17');
        // 5 créditos y 24 puntos con el ×1,5
        expect(got.bargain.unlockedAt).toBe('2026-10-17');
        expect(got.perfectPicks.unlockedAt).toBe('2026-10-18');
        // El día en vivo de 200 no cuenta para los puntos de un día; sí para jugar
        expect(got.day100).toEqual({ id: 'day100', unlockedAt: null, progress: { value: 60, goal: 100 } });
        expect(got.streak3).toEqual({ id: 'streak3', unlockedAt: '2026-10-16', progress: { value: 3, goal: 3 } });
        expect(got.streak7.progress).toEqual({ value: 5, goal: 7 });
        expect(got.weekChampion).toEqual({ id: 'weekChampion', unlockedAt: null, progress: null });
    });

    it('un día de juego sin equipo corta la racha; un día sin juegos no', () => {
        const got = byId(
            achievementsOf({
                days: [day('2026-10-14'), day('2026-10-15'), day('2026-10-17'), day('2026-10-18'), day('2026-10-20', { team: false }), day('2026-10-21')],
                // El 16 no hubo juegos; el 19 sí y no jugó; el 20 solo pronosticó
                gameDays: ['2026-10-14', '2026-10-15', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']
            })
        );
        expect(got.streak3).toEqual({ id: 'streak3', unlockedAt: '2026-10-17', progress: { value: 3, goal: 3 } });
        expect(got.streak7.progress).toEqual({ value: 4, goal: 7 });
        expect(got.days10.progress).toEqual({ value: 5, goal: 10 });
    });

    it('campeón de la semana: el primer domingo que ganó', () => {
        expect(byId(achievementsOf({ weekTitles: ['2026-11-08', '2026-10-25'] })).weekChampion).toEqual({ id: 'weekChampion', unlockedAt: '2026-10-25', progress: null });
        expect(byId(achievementsOf({ weekTitles: [] })).weekChampion.unlockedAt).toBeNull();
    });
});

// ---------------------------------------------------------------- semanas

describe('fantasy v3: semanas de una liga privada (weeks)', () => {
    const totals = {
        [A]: new Map([['2026-11-02', 30], ['2026-11-08', 20], ['2026-11-10', 15]]),
        [B]: new Map([['2026-11-03', 50], ['2026-11-09', 10], ['2026-11-15', 10]]),
        [C]: new Map([['2026-11-04', 50]])
    };
    const totalsOf = (userId) => totals[userId];

    it('la semana empieza el lunes en la hora de RD', () => {
        // Domingo 15 a las 10:30 p. m. en RD (ya lunes 16 en UTC): sigue siendo la semana del lunes 9
        const today = todayOf('lidom', new Date('2026-11-16T02:30:00Z'));
        expect(today).toBe('2026-11-15');
        expect(stats.weekStartOf(today)).toBe('2026-11-09');
        expect(stats.weekStartOf('2026-11-16')).toBe('2026-11-16');
        expect(stats.weekStartOf('2026-11-09')).toBe('2026-11-09');
        const weeks = stats.weeksOf({ today, users: [A, B], totalsOf });
        expect(weeks.map((week) => [week.start, week.end])).toEqual([
            ['2026-11-09', '2026-11-15'],
            ['2026-11-02', '2026-11-08'],
            ['2026-10-26', '2026-11-01'],
            ['2026-10-19', '2026-10-25']
        ]);
    });

    it('el campeón solo cuenta con la semana terminada; empates de puntos comparten puesto', () => {
        // El domingo 15 la semana sigue: sin campeón aunque B vaya delante
        const sunday = stats.weekTable({ start: '2026-11-09', today: '2026-11-15', users: [A, B], totalsOf });
        expect(sunday.rows).toEqual([
            { userId: B, total: 20, days: 2, rank: 1 },
            { userId: A, total: 15, days: 1, rank: 2 }
        ]);
        expect(sunday.champion).toBeNull();
        // El lunes ya terminó; con un juego del domingo todavía en vivo, todavía no
        expect(stats.weekTable({ start: '2026-11-09', today: '2026-11-16', users: [A, B], totalsOf }).champion).toBe(B);
        expect(stats.weekTable({ start: '2026-11-09', today: '2026-11-16', users: [A, B], totalsOf, liveDays: new Set(['2026-11-15']) }).champion).toBeNull();
        // Semana del 2: A 50 en 2 días, B 50 en 1 y C 50 en 1: comparten el 1.º; gana el de menos días, pero B y C
        // empatan también en días: sin campeón
        const tied = stats.weekTable({ start: '2026-11-02', today: '2026-11-16', users: [A, B, C], totalsOf });
        expect(tied.rows.map((row) => row.rank)).toEqual([1, 1, 1]);
        expect(tied.champion).toBeNull();
        expect(stats.weekTable({ start: '2026-11-02', today: '2026-11-16', users: [A, B], totalsOf }).champion).toBe(B);
        // Nadie jugó: sin campeón
        expect(stats.weekTable({ start: '2026-10-19', today: '2026-11-16', users: [A, B], totalsOf }).champion).toBeNull();
    });

    it('con los equipos guardados: la semana del 12 al 18 sigue en vivo y la anterior no tiene juegos', async () => {
        setupFans();
        const data = await stats.fantasyWeeks('lidom', [A, B, C], { today: D4 });
        const [current, previous] = data.weeks;
        expect([current.start, current.end, current.champion]).toEqual(['2026-10-12', D4, null]);
        expect(current.rows).toEqual([
            { userId: C, total: 145, days: 3, rank: 1 },
            { userId: A, total: 138, days: 3, rank: 2 },
            { userId: B, total: 38.5, days: 2, rank: 3 }
        ]);
        expect(previous.rows.every((row) => row.total === 0 && row.days === 0)).toBe(true);
        expect(previous.champion).toBeNull();
        expect(data.weeks).toHaveLength(4);
    });

    it('ruta: forma, users obligatorio (máx. 100 uuids) y sin Supabase 503', async () => {
        setupFans();
        await withServer(async (base) => {
            const ok = await realFetch(`${base}/v2/fantasy/weeks?league=lidom&users=${A},${B.toUpperCase()},${A}`);
            expect(ok.status).toBe(200);
            const body = await ok.json();
            expect(Object.keys(body).sort()).toEqual(['league', 'partial', 'updatedAt', 'weeks']);
            expect(body.weeks).toHaveLength(4);
            expect(Object.keys(body.weeks[0]).sort()).toEqual(['champion', 'end', 'rows', 'start']);
            expect(body.weeks[0].rows.map((row) => row.userId).sort()).toEqual([A, B]);
            expect(sMaxAge(ok)).toBeGreaterThan(0);
            expect((await realFetch(`${base}/v2/fantasy/weeks?league=lidom`)).status).toBe(400);
            expect((await realFetch(`${base}/v2/fantasy/weeks?league=lidom&users=12345678`)).status).toBe(400);
            const many = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(',');
            expect((await realFetch(`${base}/v2/fantasy/weeks?league=lidom&users=${many}`)).status).toBe(400);
            env.supabaseConfig = () => null;
            const off = await realFetch(`${base}/v2/fantasy/weeks?league=lidom&users=${A}`);
            expect(off.status).toBe(503);
            expect(off.headers.get('cache-control')).toBe('no-store');
        });
    });
});

// ---------------------------------------------------------------- simulador

describe('fantasy v3 con el simulador (MLB_MOCK=1, npm run dev:mock)', () => {
    it('«Mi temporada» y semanas con 4 semanas de fanáticos simulados, también para una cuenta que no es de ellos', async () => {
        clearCache();
        process.env.MLB_MOCK = '1';
        const mock = require('../services/pro/mockFans');
        const viewer = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
        const value = await stats.fanStats('lidom', mock.FAN_IDS[2]);
        expect(value.data.days.length).toBeGreaterThan(5);
        expect(value.data.days.every((day) => day.rank >= 1 && day.players >= day.rank)).toBe(true);
        expect(value.data.players.length).toBeGreaterThan(0);
        expect(value.data.achievements.some((item) => item.unlockedAt)).toBe(true);
        // Ligas simuladas de 10: el logro de la semana se puede saber
        expect(stats.leagueGroups(mock.FAN_IDS[12])).toEqual([mock.FAN_IDS.slice(10, 20)]);
        expect(stats.leagueGroups(viewer)).toEqual([[...mock.FAN_IDS.slice(0, 9), viewer]]);
        const mine = await stats.fanStats('lidom', viewer);
        expect(mine.data.days.length).toBeGreaterThan(0);
        const weeks = await stats.fantasyWeeks('lidom', [...mock.FAN_IDS.slice(0, 9), viewer]);
        expect(weeks.weeks).toHaveLength(4);
        expect(weeks.weeks[1].champion).toEqual(expect.any(String));
        expect(weeks.weeks[1].rows.find((row) => row.userId === viewer)).toEqual(expect.objectContaining({ rank: expect.any(Number) }));
    });
});
