import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

// Fantasy v3: «Ideas para hoy» (GET /v2/fantasy/trends) con datos inventados: peloteros 12345611…, equipos 9901…,
// juegos 99000011… y fanáticos con uuids de mentira. Se sustituyen http.mlbGet (OPS de los equipos), fantasy.fantasyDay,
// env.supabaseConfig y fetch (los equipos de ayer en Supabase).
const require = createRequire(import.meta.url);

const http = require('../services/http');
const fantasy = require('../services/fantasy');
const env = require('../utils/env');
const { clearCache } = require('../utils/cache');
const app = require('../app');
const trends = require('../services/fantasyTrends');

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

const DATE = '2026-10-18';
const YESTERDAY = '2026-10-17';
const NOW = Date.parse('2026-10-18T22:00:00Z');
const FUTURE = '2030-01-01T00:00:00Z';
const LATER = '2030-01-02T00:00:00Z';

const team = (id) => ({ id, name: `Equipo ${id}`, abbrev: `E${String(id).slice(-2)}`, color: '#123456', logo: `logo-${id}.svg` });
const game = (gamePk, state, date, away, home, extra = {}) => ({ gamePk, state, date, away: { ...team(away), score: null, isWinner: false }, home: { ...team(home), score: null, isWinner: false }, ...extra });
const opp = (id, home) => ({ id, abbrev: `E${String(id).slice(-2)}`, home });
const player = (id, teamId, gamePk, role, fields) => ({ id, name: `Pelotero ${id}`, teamId, gamePk, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: false, line: null, points: 0, last5: [], priceDelta: 0, ...fields });

const L1 = 12345611;
const H1 = 12345621;
const H2 = 12345622;
const H3 = 12345623;
const H4 = 12345624;
const SP1 = 12345625;
const SP2 = 12345626;
const R1 = 12345627;
const RP1 = 12345628;
const X1 = 12345631;
const Q1 = 12345641;
const Q2 = 12345642;

const DAYS = {
    [DATE]: {
        games: [
            // En vivo: cerrado
            game(99000011, 'live', '2026-10-18T20:00:00Z', 9901, 9902),
            game(99000012, 'preview', FUTURE, 9903, 9904),
            // Pospuesto: nunca se cierra pero no se juega
            game(99000013, 'final', FUTURE, 9905, 9906, { status: 'postponed', detailedState: 'Postponed' }),
            game(99000014, 'preview', LATER, 9907, 9908)
        ],
        players: [
            // Sería el primero de todas las listas, pero su juego ya empezó
            player(L1, 9901, 99000011, 'B', { status: 'confirmed', price: 4, proj: 9, last5: [30, 30, 30], priceDelta: 2, opp: opp(9902, false) }),
            player(X1, 9905, 99000013, 'B', { status: 'postponed', price: 4, proj: 0, last5: [25, 25, 25], priceDelta: 1.5, opp: opp(9906, false) }),
            player(H1, 9903, 99000012, 'B', { status: 'confirmed', price: 9, proj: 8, last5: [10, 12, 14], priceDelta: 1, opp: opp(9904, false) }),
            // Solo 2 juegos: no está «en racha»
            player(H2, 9903, 99000012, 'B', { status: 'expected', price: 5, proj: 6, last5: [20, 0], priceDelta: -1, opp: opp(9904, false) }),
            player(H3, 9904, 99000012, 'B', { status: 'confirmed', price: 6, proj: 4.2, last5: [5, 6, 7, 8], priceDelta: 0.5, opp: opp(9903, true) }),
            // No va en la alineación y el abridor que descansa: no son idea para nadie
            player(H4, 9904, 99000012, 'B', { status: 'bench', price: 4, proj: 1, last5: [40, 40, 40], priceDelta: 3, opp: opp(9903, true) }),
            player(R1, 9904, 99000012, 'P', { status: 'resting', price: 8, proj: 0.1, last5: [30, 30, 30], priceDelta: -3, opp: opp(9903, true) }),
            player(SP1, 9903, 99000012, 'P', { status: 'probable', price: 10, proj: 12, last5: [15, 18], priceDelta: -0.5, opp: opp(9904, false) }),
            player(SP2, 9904, 99000012, 'P', { status: 'probable', estimated: true, price: 9, proj: 11, last5: [], priceDelta: 0, opp: opp(9903, true) }),
            player(RP1, 9903, 99000012, 'P', { status: 'bullpen', price: 4, proj: 2, last5: [3, 4, 5], priceDelta: 0, opp: opp(9904, false) }),
            player(Q1, 9907, 99000014, 'B', { status: 'confirmed', price: 7, proj: 7, last5: [9, 9, 9], priceDelta: 1.5, opp: opp(9908, false) }),
            // 7,5 créditos: no es ganga
            player(Q2, 9908, 99000014, 'B', { status: 'expected', price: 7.5, proj: 7, last5: [1, 1, 1], priceDelta: -2, opp: opp(9907, true) })
        ]
    },
    [YESTERDAY]: {
        games: [game(99000021, 'final', '2026-10-17T23:00:00Z', 9903, 9904)],
        players: [player(H1, 9903, 99000021, 'B', { played: true, points: 6 }), player(H3, 9904, 99000021, 'B', { played: true, points: 2 }), player(H4, 9904, 99000021, 'B', { played: true, points: 9 })]
    }
};
const fakeDay = async (league, date) => {
    const day = DAYS[date] || { games: [], players: [] };
    return { league, date, teams: Object.fromEntries(day.games.flatMap((g) => [g.away, g.home]).map((t) => [t.id, team(t.id)])), scoring: {}, ...day };
};

// Ayer: H1 en 2 de 3 equipos, H3 en 2 de 3 y H4 en 1
const ROWS = [
    { user_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', day: YESTERDAY, lineup: [H1, H3], captain: H1, picks: {} },
    { user_id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', day: YESTERDAY, lineup: [H1, H4], captain: H4, picks: {} },
    { user_id: 'cccccccc-3333-4333-8333-cccccccccccc', day: YESTERDAY, lineup: [H3], captain: H3, picks: {} }
];
const fakeSupabase = async (url, init = {}) => {
    const u = new URL(url);
    const headers = init.headers || {};
    const filters = u.searchParams.getAll('day').map((value) => value.split('.'));
    const rows = ROWS.filter((row) => filters.every(([op, day]) => (op === 'gte' ? row.day >= day : op === 'lte' ? row.day <= day : row.day === day)));
    const range = headers.Range ? headers.Range.split('-').map(Number) : [0, rows.length - 1];
    const page = rows.slice(range[0], range[1] + 1);
    return { ok: true, status: 200, headers: new Headers({ 'content-range': `0-${Math.max(0, page.length - 1)}/${rows.length}` }), json: async () => page };
};

// OPS de la temporada: liga .700; 9904 batea .600 (duelo fácil) y 9903 .800 (difícil)
const OPS = { 9903: '.800', 9904: '.600', 9907: '.700', 9908: '.700' };
const setup = () => {
    clearCache();
    fantasy.fantasyDay = fakeDay;
    env.supabaseConfig = () => ({ url: 'https://supabase.test', key: 'sb_publishable_prueba' });
    globalThis.fetch = fakeSupabase;
    http.mlbGet = async (url, params = {}) => {
        if (url.endsWith('/league/131')) return { leagues: [{ season: '2026', numGames: 50 }] };
        if (url.endsWith('/teams/stats')) {
            if (params.group !== 'hitting') return { stats: [{ splits: [] }] };
            return { stats: [{ splits: Object.entries(OPS).map(([id, ops]) => ({ team: { id: Number(id), name: `Equipo ${id}`, abbreviation: `E${id.slice(-2)}` }, stat: { plateAppearances: 400, ops } })) }] };
        }
        throw new Error(`sin ruta ${url}`);
    };
};

const ids = (list) => list.map((item) => item.id);

describe('fantasy v3: ideas para hoy (trends)', () => {
    it('solo juegos sin cerrar: fuera los cerrados, los pospuestos y los que no juegan', async () => {
        setup();
        const data = await trends.computeTrends('lidom', DATE, NOW);
        const all = new Set([...data.hot, ...data.bargains, ...data.risers, ...data.fallers, ...data.pitchers, ...data.popular].map((item) => item.id));
        for (const id of [L1, X1, H4, R1]) expect(all.has(id)).toBe(false);
        expect(data).toMatchObject({ league: 'lidom', date: DATE, partial: false, nextLockAt: Date.parse(FUTURE) });
        // Cada uno con lo que hace falta para la tarjeta
        expect(data.hot[0]).toEqual({ id: H1, name: `Pelotero ${H1}`, teamId: 9903, role: 'B', pos: 'SS', gamePk: 99000012, price: 9, proj: 8, status: 'confirmed', opp: opp(9904, false), last5: [10, 12, 14], priceDelta: 1, avg: 12 });
    });

    it('cada lista con su orden y su campo', async () => {
        setup();
        const data = await trends.computeTrends('lidom', DATE, NOW);
        // En racha: promedio de los últimos 5 con al menos 3 juegos
        expect(data.hot.map((item) => [item.id, item.avg])).toEqual([
            [H1, 12],
            [Q1, 9],
            [H3, 6.5],
            [RP1, 4],
            [Q2, 1]
        ]);
        // Gangas: proj por crédito con 7 créditos o menos
        expect(data.bargains.map((item) => [item.id, item.value])).toEqual([
            [H2, 1.2],
            [Q1, 1],
            [H3, 0.7],
            [RP1, 0.5]
        ]);
        expect(data.risers.map((item) => [item.id, item.priceDelta])).toEqual([
            [Q1, 1.5],
            [H1, 1],
            [H3, 0.5]
        ]);
        expect(data.fallers.map((item) => [item.id, item.priceDelta])).toEqual([
            [Q2, -2],
            [H2, -1],
            [SP1, -0.5]
        ]);
        // Abridores (anunciados o por la rotación) por proj × duelo: contra .600 sube, contra .800 baja
        expect(data.pitchers.map((item) => [item.id, item.score, item.matchup])).toEqual([
            [SP1, 14, { oppOps: '.600', edge: 'good' }],
            [SP2, 9.6, { oppOps: '.800', edge: 'tough' }]
        ]);
        expect(data.pitchers[1].estimated).toBe(true);
        // Los más elegidos ayer (% sobre los equipos de ayer); empate: el de más proj
        expect(data.popular.map((item) => [item.id, item.owned])).toEqual([
            [H1, 66.7],
            [H3, 66.7]
        ]);
    });

    it('topes de cada lista y duelo parejo sin OPS', () => {
        expect(trends.LIMITS).toEqual({ hot: 8, bargains: 8, risers: 5, fallers: 5, pitchers: 6, popular: 8 });
        const ops = { teams: new Map([[9901, { ops: 0.71, text: '.710' }]]), average: 0.7 };
        const even = trends.matchupOf({ id: 9901 }, ops);
        expect(even.matchup).toEqual({ oppOps: '.710', edge: 'even' });
        expect(even.factor).toBeCloseTo(0.7 / 0.71, 6);
        expect(trends.matchupOf({ id: 9999 }, ops)).toEqual({ matchup: { oppOps: null, edge: 'even' }, factor: 1 });
        expect(trends.matchupOf(null, { teams: new Map(), average: null })).toEqual({ matchup: { oppOps: null, edge: 'even' }, factor: 1 });
    });

    it('si MLB no da el OPS de los equipos, los lanzadores salen igual con duelo parejo', async () => {
        setup();
        const base = http.mlbGet;
        http.mlbGet = async (url, params) => (url.endsWith('/teams/stats') ? Promise.reject(new Error('MLB caído')) : base(url, params));
        const data = await trends.computeTrends('lidom', DATE, NOW);
        expect(data.pitchers.map((item) => [item.id, item.score, item.matchup.edge])).toEqual([
            [SP1, 12, 'even'],
            [SP2, 11, 'even']
        ]);
    });

    it('ruta: forma, caché hasta el próximo cierre (máx. 2 min), fecha inválida 400 y sin Supabase 503', async () => {
        setup();
        await withServer(async (base) => {
            const ok = await realFetch(`${base}/v2/fantasy/trends?league=lidom&date=${DATE}`);
            expect(ok.status).toBe(200);
            expect(sMaxAge(ok)).toBe(120);
            const body = await ok.json();
            expect(Object.keys(body).sort()).toEqual(['bargains', 'date', 'fallers', 'hot', 'league', 'partial', 'pitchers', 'popular', 'risers', 'updatedAt']);
            expect((await realFetch(`${base}/v2/fantasy/trends?league=lidom&date=2026-13-45`)).status).toBe(400);
            env.supabaseConfig = () => null;
            clearCache();
            const off = await realFetch(`${base}/v2/fantasy/trends?league=lidom&date=${DATE}`);
            expect(off.status).toBe(503);
            expect(await off.json()).toEqual({ error: 'accounts_disabled' });
            expect(off.headers.get('cache-control')).toBe('no-store');
        });
    });

    it('con el simulador (MLB_MOCK=1): listas llenas con el juego por empezar de hoy', async () => {
        clearCache();
        process.env.MLB_MOCK = '1';
        const { todayOf } = require('../services/pro/games');
        const data = await trends.computeTrends('lidom', todayOf('lidom'));
        expect(data.hot.length).toBeGreaterThan(0);
        expect(data.bargains.length).toBeGreaterThan(0);
        expect(data.pitchers.length).toBeGreaterThan(0);
        expect(data.pitchers.every((item) => ['good', 'even', 'tough'].includes(item.matchup.edge))).toBe(true);
        expect(data.popular.length).toBeGreaterThan(0);
    });
});
