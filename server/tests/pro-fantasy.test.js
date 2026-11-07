import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

// Rutas del fantasy PRO con datos inventados: peloteros 12345601…, equipos 9901…, juegos 99000001… y fanáticos con
// uuids de mentira. La API es CommonJS: se carga con require para sustituir http.mlbGet, fantasy.fantasyDay,
// env.supabaseConfig y fetch (Supabase).
const require = createRequire(import.meta.url);

const http = require('../services/http');
const fantasy = require('../services/fantasy');
const env = require('../utils/env');
const { clearCache } = require('../utils/cache');
const { resetLiveFeeds } = require('../services/liveFeed');
const app = require('../app');
const proDay = require('../services/pro/fantasyDay');
const proFans = require('../services/pro/fans');

const realGet = http.mlbGet;
const realDay = fantasy.fantasyDay;
const realConfig = env.supabaseConfig;
const realFetch = globalThis.fetch;
afterEach(() => {
    http.mlbGet = realGet;
    fantasy.fantasyDay = realDay;
    env.supabaseConfig = realConfig;
    globalThis.fetch = realFetch;
    resetLiveFeeds();
    clearCache();
});

/** Levanta la app en un puerto libre y corre `run(base)` */
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
const D1 = '2026-10-15';
const D2 = '2026-10-16';
const FUTURE = '2030-01-01T00:00:00Z';

const team = (id) => ({ id, name: `Equipo ${id}`, abbrev: `E${String(id).slice(-2)}`, color: '#123456', logo: `logo-${id}.svg` });
const side = (id, score, isWinner) => ({ ...team(id), score, isWinner });
const game = (gamePk, state, date, away, home, winner = null, score = [null, null]) => ({ gamePk, state, date, venue: 'Estadio de Prueba', away: side(away, score[0], winner === away), home: side(home, score[1], winner === home) });
const player = (id, teamId, gamePk, role, points) => ({ id, name: `Pelotero ${id}`, teamId, gamePk, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: true, line: role === 'P' ? { ip: '5.0', outs: 15, k: 3, er: 1, h: 4, bb: 1, w: 0, sv: 0 } : { ab: 4, h: 2, d: 0, t: 0, hr: 0, r: 1, rbi: 1, bb: 0, hbp: 0, sb: 0, k: 1 }, points });

const DAYS = {
    [D1]: {
        games: [game(99000001, 'final', '2026-10-15T20:00:00Z', 9901, 9902, 9901, [5, 2]), game(99000002, 'final', '2026-10-15T23:00:00Z', 9903, 9904, 9904, [1, 3])],
        players: [player(P1, 9901, 99000001, 'B', 10), player(P2, 9902, 99000001, 'B', 4), player(P3, 9903, 99000002, 'P', 6), player(P4, 9904, 99000002, 'B', -1)]
    },
    // Hoy de la prueba: el 99000003 en vivo (cerrado) y el 99000004 por empezar en 2030 (abierto)
    [D2]: {
        games: [game(99000003, 'live', '2026-10-16T20:00:00Z', 9901, 9902, null, [1, 0]), game(99000004, 'preview', FUTURE, 9903, 9904)],
        players: [player(P1, 9901, 99000003, 'B', 3), player(P2, 9902, 99000003, 'B', 2), { ...player(P3, 9903, 99000004, 'P', 0), played: false, line: null }, { ...player(P4, 9904, 99000004, 'B', 0), played: false, line: null }]
    }
};
const fakeDay = async (league, date) => {
    const day = DAYS[date] || { games: [], players: [] };
    return { league, date, teams: Object.fromEntries(day.games.flatMap((g) => [g.away, g.home]).map((t) => [t.id, team(t.id)])), scoring: {}, ...day };
};

const ROWS = [
    { user_id: A, day: D1, lineup: [P1, P2, P3], captain: P1, picks: { 99000001: 9901, 99000002: 9903 } },
    { user_id: A, day: D2, lineup: [P1, P3], captain: P3, picks: { 99000003: 9901, 99000004: 9904 } },
    { user_id: B, day: D1, lineup: [P2, P4], captain: P2, picks: { 99000001: 9902 } },
    { user_id: B, day: D2, lineup: [P1, P2], captain: P1, picks: { 99000003: 9902 } },
    { user_id: C, day: D2, lineup: [], captain: null, picks: { 99000004: 9903 } }
];
const PROFILES = { [A]: { display_name: 'Fan Prueba A', created_at: '2026-09-15T12:00:00Z' }, [B]: { display_name: 'Fan Prueba B', created_at: null } };

// Supabase de mentira como PostgREST: filtra por usuario y día, ordena, respeta limit y Range
const fakeSupabase = async (url, init = {}) => {
    const u = new URL(url);
    const headers = init.headers || {};
    const json = (data, extra = {}) => ({ ok: true, status: 200, headers: new Headers(extra), json: async () => data });
    if (u.pathname.endsWith('/profiles')) {
        const ids = (u.searchParams.get('id') || '').replace(/^eq\.|^in\.\(|\)$/g, '').split(',');
        return json(ids.filter((id) => PROFILES[id]).map((id) => ({ id, ...PROFILES[id] })));
    }
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

describe('fantasy PRO: lo de todos en el día (stats)', () => {
    it('% por pelotero, capitán y pronóstico solo de juegos cerrados y los puntos de cada uno', async () => {
        setupFans();
        const data = await proDay.computeStats('lidom', D2, Date.parse('2026-10-16T22:00:00Z'));
        expect(data).toMatchObject({ league: 'lidom', date: D2, fans: 3, final: false, partial: false });
        // P3 juega el 99000004 (abierto): no sale; el capitán de A (P3) tampoco cuenta todavía
        expect(data.players).toEqual({ [P1]: { count: 2, pct: 100, captain: 1, captainPct: 50 }, [P2]: { count: 1, pct: 50, captain: 0, captainPct: 0 } });
        expect(data.topCaptain).toEqual({ id: P1, count: 1, pct: 50 });
        expect(data.games).toEqual([
            { gamePk: 99000003, locked: true, picks: { 9901: { count: 1, pct: 50 }, 9902: { count: 1, pct: 50 } }, picksMade: 2 },
            { gamePk: 99000004, locked: false, picks: null, picksMade: null }
        ]);
        // B: P1 capitán 3 × 1,5 + P2 2 = 6,5; A: 3; C solo pronosticó un juego abierto: 0
        expect(data.scores).toEqual([6.5, 3, 0]);
        expect(data).toMatchObject({ average: 3.2, median: 3, max: 6.5, nextLockAt: Date.parse(FUTURE) });
    });

    it('ruta: forma de la respuesta, caché hasta el próximo cierre (máx. 1 min), fecha inválida 400 y sin Supabase 503', async () => {
        setupFans();
        await withServer(async (base) => {
            const ok = await realFetch(`${base}/v2/pro/fantasy/stats?league=lidom&date=${D2}`);
            expect(ok.status).toBe(200);
            expect(sMaxAge(ok)).toBe(60);
            const body = await ok.json();
            expect(Object.keys(body).sort()).toEqual(['average', 'date', 'fans', 'final', 'games', 'league', 'max', 'median', 'nextLockAt', 'partial', 'players', 'scores', 'topCaptain', 'updatedAt'].sort());
            // Un día terminado: una hora (uno viejo, un día)
            const old = await realFetch(`${base}/v2/pro/fantasy/stats?league=lidom&date=${D1}`);
            expect((await old.json()).final).toBe(true);
            expect(sMaxAge(old)).toBe(86400);
            expect((await realFetch(`${base}/v2/pro/fantasy/stats?league=lidom&date=2026-13-45`)).status).toBe(400);
            env.supabaseConfig = () => null;
            clearCache();
            const off = await realFetch(`${base}/v2/pro/fantasy/stats?league=lidom&date=${D2}`);
            expect(off.status).toBe(503);
            expect(await off.json()).toEqual({ error: 'accounts_disabled' });
            expect(off.headers.get('cache-control')).toBe('no-store');
        });
    });
});

describe('fantasy PRO: perfil y detalle de un fanático', () => {
    it('perfil con `pro`: pronósticos y capitán acertados, más usados y la serie de días terminados', async () => {
        setupFans();
        const { profile } = await proFans.computeFan('lidom', A, { today: '2026-11-07', now: Date.parse('2026-10-16T22:00:00Z') });
        expect(profile).toMatchObject({ userId: A, league: 'lidom', name: 'Fan Prueba A', season: { points: 38, days: 2, best: { date: D1, points: 35 } } });
        expect(profile.days.map((day) => day.date)).toEqual([D2, D1]);
        expect(profile.pro).toEqual({
            createdAt: '2026-09-15T12:00:00Z',
            picks: { made: 2, won: 1, pct: 50 },
            captain: { days: 1, best: 1, pct: 100 },
            average: 19,
            topPlayers: [
                { id: P1, name: `Pelotero ${P1}`, days: 2, points: 18 },
                { id: P3, name: `Pelotero ${P3}`, days: 1, points: 6 },
                { id: P2, name: `Pelotero ${P2}`, days: 1, points: 4 }
            ],
            topCaptain: { id: P1, name: `Pelotero ${P1}`, days: 1 },
            series: [{ date: D1, total: 35 }]
        });
    });

    it('detalle: lo de juegos sin empezar no sale (solo se cuenta) y los totales de la temporada', async () => {
        setupFans();
        const { detail } = await proFans.computeFan('lidom', A, { today: '2026-11-07', now: Date.parse('2026-10-16T22:00:00Z') });
        const [today, before] = detail.days;
        expect(today).toMatchObject({ date: D2, started: true, live: true, final: false, team: 3, total: 3, hidden: 1, captainHidden: true, picksHidden: 1 });
        expect(today.lineup.map((item) => item.id)).toEqual([P1]);
        expect(today.pickList).toEqual([{ gamePk: 99000003, teamId: 9901, result: 'pending' }]);
        expect(today.games[1]).toEqual({ gamePk: 99000004, date: FUTURE, state: 'preview', venue: 'Estadio de Prueba', away: { id: 9903, score: null, isWinner: false }, home: { id: 9904, score: null, isWinner: false } });
        expect(before.lineup.find((item) => item.id === P1)).toMatchObject({ points: 10, score: 15, captain: true, role: 'B', gamePk: 99000001 });
        expect(before.pickList).toEqual([
            { gamePk: 99000001, teamId: 9901, result: 'win' },
            { gamePk: 99000002, teamId: 9903, result: 'loss' }
        ]);
        expect(detail.players[0]).toEqual({ id: P1, name: `Pelotero ${P1}`, teamId: 9901, role: 'B', pos: 'SS', days: 2, points: 18, base: 13, captainDays: 1 });
        expect(detail.captains).toEqual([{ id: P1, name: `Pelotero ${P1}`, teamId: 9901, pos: 'SS', days: 1, bonus: 5 }]);
        expect(detail.byTeam).toEqual([
            { teamId: 9901, points: 18 },
            { teamId: 9903, points: 6 },
            { teamId: 9902, points: 4 }
        ]);
        expect(detail.picks).toEqual({ points: 10, made: 2, won: 1 });
        expect(detail.teams[9901]).toEqual(team(9901));
        expect(detail).toMatchObject({ live: true, partial: false });
    });

    it('rutas: forma, caché, uuid inválido 400 y sin Supabase 503', async () => {
        setupFans();
        await withServer(async (base) => {
            const fan = await realFetch(`${base}/v2/pro/fantasy/fan/${A.toUpperCase()}?league=lidom`);
            expect(fan.status).toBe(200);
            // En vivo un minuto
            expect(sMaxAge(fan)).toBe(60);
            const profile = await fan.json();
            expect(Object.keys(profile).sort()).toEqual(['days', 'league', 'name', 'pro', 'season', 'userId']);
            expect(Object.keys(profile.pro).sort()).toEqual(['average', 'captain', 'createdAt', 'picks', 'series', 'topCaptain', 'topPlayers']);

            const detail = await realFetch(`${base}/v2/pro/fantasy/fan/${A}/detail?league=lidom`);
            expect(detail.status).toBe(200);
            expect(sMaxAge(detail)).toBe(60);
            expect(Object.keys(await detail.json()).sort()).toEqual(['byTeam', 'captains', 'days', 'league', 'live', 'name', 'partial', 'picks', 'players', 'teams', 'updatedAt', 'userId']);

            expect((await realFetch(`${base}/v2/pro/fantasy/fan/12345678?league=lidom`)).status).toBe(400);
            expect((await realFetch(`${base}/v2/pro/fantasy/fan/12345678/detail?league=lidom`)).status).toBe(400);
            env.supabaseConfig = () => null;
            expect((await realFetch(`${base}/v2/pro/fantasy/fan/${A}/detail?league=lidom`)).status).toBe(503);
        });
    });
});

describe('fantasy PRO: tabla de la temporada con flechas', () => {
    it('puesto anterior sin el último día, lo que sumó ese día y el promedio de la liga por día', async () => {
        setupFans();
        const data = await proFans.seasonRanking('lidom', { today: '2026-11-07' });
        expect(data).toMatchObject({ league: 'lidom', season: 2026, partial: false, total: 3, lastDate: D2 });
        expect(data.ranking.map(({ userId, name, points, days, rank, prevRank, lastDay }) => ({ userId, name, points, days, rank, prevRank, lastDay }))).toEqual([
            { userId: A, name: 'Fan Prueba A', points: 38, days: 2, rank: 1, prevRank: 1, lastDay: 3 },
            { userId: B, name: 'Fan Prueba B', points: 11.5, days: 2, rank: 2, prevRank: 2, lastDay: 6.5 },
            // C jugó por primera vez el último día: sin puesto anterior
            { userId: C, name: null, points: 0, days: 1, rank: 3, prevRank: null, lastDay: 0 }
        ]);
        expect(data.daily).toEqual([
            { date: D1, average: 20, fans: 2 },
            { date: D2, average: 3.2, fans: 3 }
        ]);
    });

    it('ruta: forma, ?users= de una liga privada, 5 min de caché, uuid inválido 400 y sin Supabase 503', async () => {
        setupFans();
        await withServer(async (base) => {
            const all = await realFetch(`${base}/v2/pro/fantasy/season?league=lidom`);
            expect(all.status).toBe(200);
            expect(sMaxAge(all)).toBe(300);
            expect(Object.keys(await all.json()).sort()).toEqual(['daily', 'lastDate', 'league', 'partial', 'ranking', 'season', 'total', 'updatedAt']);
            const some = await (await realFetch(`${base}/v2/pro/fantasy/season?league=lidom&users=${B},${C.toUpperCase()}`)).json();
            expect(some.ranking.map((row) => [row.userId, row.rank])).toEqual([
                [B, 2],
                [C, 3]
            ]);
            expect((await realFetch(`${base}/v2/pro/fantasy/season?league=lidom&users=12345678`)).status).toBe(400);
            env.supabaseConfig = () => null;
            expect((await realFetch(`${base}/v2/pro/fantasy/season?league=lidom`)).status).toBe(503);
        });
    });
});

// ---------------------------------------------------------------- box scores inventados (forma y alineaciones)

const boxPlayer = (id, pos, battingOrder, batting = {}, pitching = {}) => ({ person: { id, fullName: `Pelotero ${id}` }, position: { abbreviation: pos }, ...(battingOrder ? { battingOrder } : {}), stats: { batting, pitching } });
const hits = (h, hr = 0) => ({ plateAppearances: 4, atBats: 4, hits: h, homeRuns: hr, runs: hr, rbi: hr, doubles: 0, triples: 0 });
const box = (awayId, homeId, away, home) => {
    const teamOf = (id, list) => ({ team: { id }, players: Object.fromEntries(list.map((p) => [`ID${p.person.id}`, p])), battingOrder: list.filter((p) => p.battingOrder).map((p) => p.person.id), pitchers: list.filter((p) => p.position.abbreviation === 'P').map((p) => p.person.id) });
    return { teams: { away: teamOf(awayId, away), home: teamOf(homeId, home) } };
};
const scheduleGame = (gamePk, officialDate, state, awayId, homeId) => ({
    gamePk,
    officialDate,
    gameDate: `${officialDate}T23:00:00Z`,
    status: { abstractGameState: state === 'final' ? 'Final' : state === 'live' ? 'Live' : 'Preview', detailedState: state === 'final' ? 'Final' : state === 'live' ? 'In Progress' : 'Scheduled' },
    teams: { away: { team: { id: awayId } }, home: { team: { id: homeId } } }
});
const scheduleOf = (games) => ({ dates: [...new Set(games.map((g) => g.officialDate))].map((date) => ({ date, games: games.filter((g) => g.officialDate === date) })) });

describe('fantasy PRO: forma de cada pelotero (form)', () => {
    // Seis juegos de P1 antes del 2026-10-20: salen los 5 más recientes, del más nuevo al más viejo
    const DATE = '2026-10-20';
    const games = [1, 2, 3, 4, 5, 6].map((n) => scheduleGame(99000100 + n, `2026-10-${String(13 + n).padStart(2, '0')}`, 'final', 9901, 9902));
    const boxes = Object.fromEntries(games.map((g, index) => [g.gamePk, box(9901, 9902, [boxPlayer(P1, 'SS', '100', hits(index % 3, index === 5 ? 1 : 0))], [boxPlayer(P2, 'P', null, {}, { battersFaced: 5, outs: 3, strikeOuts: 1 })])]));
    const setup = () => {
        clearCache();
        fantasy.fantasyDay = async (league, date) => ({ league, date, teams: {}, scoring: {}, games: [], players: [player(P1, 9901, 1, 'B', 0), player(P2, 9902, 1, 'P', 0)] });
        http.mlbGet = async (url) => {
            if (url.endsWith('/schedule')) return scheduleOf(games);
            const match = url.match(/\/game\/(\d+)\/boxscore$/);
            if (match) return boxes[match[1]];
            throw new Error(`sin ruta ${url}`);
        };
    };

    it('los últimos 5 juegos de cada pelotero del día con los puntos del fantasy', async () => {
        setup();
        const data = await proDay.computeForm('lidom', DATE);
        expect(data).toMatchObject({ league: 'lidom', date: DATE, partial: false });
        expect(data.players[P1].map((item) => item.gamePk)).toEqual([99000106, 99000105, 99000104, 99000103, 99000102]);
        // 2 hits con jonrón (10 + 3 + carrera 2 + impulsada 2) = 17, 1 hit = 3, 0 hits = 0
        expect(data.players[P1].map((item) => item.pts)).toEqual([17, 3, 0, 6, 3]);
        expect(data.players[P1][0]).toEqual({ date: '2026-10-19', gamePk: 99000106, pts: 17 });
        // Lanzador: 3 outs + 1 ponche × 2 = 5
        expect(data.players[P2][0].pts).toBe(5);
    });

    it('ruta: forma y media hora de caché', async () => {
        setup();
        await withServer(async (base) => {
            const ok = await realFetch(`${base}/v2/pro/fantasy/form?league=lidom&date=${DATE}`);
            expect(ok.status).toBe(200);
            expect(sMaxAge(ok)).toBe(1800);
            expect(Object.keys(await ok.json()).sort()).toEqual(['date', 'league', 'partial', 'players']);
            expect((await realFetch(`${base}/v2/pro/fantasy/form?league=lidom&date=ayer`)).status).toBe(400);
        });
    });
});

describe('fantasy PRO: alineaciones del día (chip «Titular»)', () => {
    const DATE = '2026-10-20';
    const games = [
        scheduleGame(99000201, '2026-10-19', 'final', 9903, 9904),
        scheduleGame(99000202, DATE, 'live', 9901, 9902),
        scheduleGame(99000203, DATE, 'preview', 9903, 9904)
    ];
    const boxes = {
        // Ayer: los titulares de 9903 y 9904 (P4 entró de emergente: 101)
        99000201: box(9903, 9904, [boxPlayer(12345611, '2B', '100'), boxPlayer(12345612, 'CF', '200')], [boxPlayer(12345621, 'C', '100'), boxPlayer(P4, 'PH', '101')]),
        // En vivo: los que abrieron (el emergente no cuenta)
        99000202: box(9901, 9902, [boxPlayer(P1, 'SS', '100'), boxPlayer(12345631, '1B', '200'), boxPlayer(12345632, 'PH', '201')], [boxPlayer(P2, 'LF', '100')]),
        // Por empezar: MLB todavía sin alineaciones
        99000203: box(9903, 9904, [], [])
    };
    const setup = () => {
        clearCache();
        http.mlbGet = async (url) => {
            if (url.endsWith('/schedule')) return scheduleOf(games);
            const match = url.match(/\/game\/(\d+)\/boxscore$/);
            if (match) return boxes[match[1]];
            throw new Error(`sin ruta ${url}`);
        };
    };

    it('publicadas en vivo y, por empezar, las esperadas (las del último juego de cada equipo)', async () => {
        setup();
        const data = await proDay.computeLineups('lidom', DATE);
        expect(data).toMatchObject({ league: 'lidom', date: DATE, posted: 1, expected: 1, partial: false });
        expect(data.games).toEqual([
            { gamePk: 99000202, state: 'live', away: [P1, 12345631], home: [P2], source: { away: 'official', home: 'official' } },
            { gamePk: 99000203, state: 'preview', away: [12345611, 12345612], home: [12345621], source: { away: 'expected', home: 'expected' } }
        ]);
    });

    it('ruta: forma y un minuto de caché mientras hay juegos por empezar', async () => {
        setup();
        await withServer(async (base) => {
            const ok = await realFetch(`${base}/v2/pro/fantasy/lineups?league=lidom&date=${DATE}`);
            expect(ok.status).toBe(200);
            expect(sMaxAge(ok)).toBe(60);
            const body = await ok.json();
            expect(Object.keys(body).sort()).toEqual(['date', 'expected', 'games', 'league', 'partial', 'posted', 'updatedAt']);
            expect(body.games.every((item) => 'gamePk' in item && 'state' in item && 'away' in item && 'home' in item)).toBe(true);
        });
    });
});

describe('fantasy PRO con el simulador (MLB_MOCK=1, npm run dev:mock)', () => {
    afterEach(() => {
        delete process.env.MLB_MOCK;
    });

    it('fanáticos simulados: % de todos, tabla con flechas y la fila de quien mira aunque no sea de los simulados', async () => {
        clearCache();
        process.env.MLB_MOCK = '1';
        const { todayOf } = require('../services/pro/games');
        const today = todayOf('lidom');
        const stats = await proDay.dayStats('lidom', today);
        expect(stats.fans).toBeGreaterThan(10);
        expect(stats.scores).toHaveLength(stats.fans);
        expect(Object.keys(stats.players).length).toBeGreaterThan(0);
        const season = await proFans.seasonRanking('lidom', { today });
        expect(season.ranking.length).toBeGreaterThan(10);
        expect(season.daily.length).toBeGreaterThan(1);
        const viewer = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
        const mine = await proFans.seasonRanking('lidom', { today, users: [viewer] });
        expect(mine.ranking).toEqual([expect.objectContaining({ userId: viewer, rank: expect.any(Number) })]);
        const lineups = await proDay.dayLineups('lidom', today);
        expect(lineups.games.every((game) => game.away?.length && game.home?.length)).toBe(true);
    });
});
