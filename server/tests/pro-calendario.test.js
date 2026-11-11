import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

// Calendario PRO de la temporada (GET /api/v2/pro/calendar) con datos inventados: equipos 12345671-12345674 y juegos
// 12345001… La API es CommonJS: se carga con require para sustituir http.mlbGet.
const require = createRequire(import.meta.url);

const http = require('../services/http');
const { clearCache } = require('../utils/cache');
const app = require('../app');
const { seasonCalendar } = require('../services/pro/calendar');

const realGet = http.mlbGet;
const realFetch = globalThis.fetch;
afterEach(() => {
    http.mlbGet = realGet;
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

const A = 12345671;
const B = 12345672;
const C = 12345673;
const D = 12345674;

const STATUS = {
    final: { abstractGameState: 'Final', codedGameState: 'F', detailedState: 'Final' },
    live: { abstractGameState: 'Live', codedGameState: 'I', detailedState: 'In Progress' },
    preview: { abstractGameState: 'Preview', codedGameState: 'S', detailedState: 'Scheduled' },
    postponed: { abstractGameState: 'Final', codedGameState: 'D', detailedState: 'Postponed', reason: 'Rain' },
    cancelled: { abstractGameState: 'Final', codedGameState: 'C', detailedState: 'Cancelled', reason: 'Rain' }
};

const team = (id) => ({ id, name: `Equipo ${id}`, abbreviation: `E${String(id).slice(-2)}` });

/** Un juego crudo del /schedule (lo que manda la fuente) */
const raw = (gamePk, day, away, home, { state = 'final', a, h, type = 'R', time = '23:00', status = {}, ...extra } = {}) => {
    const scored = state === 'final' || state === 'live';
    const side = (id, own, other) => ({
        team: team(id),
        ...(scored ? { score: own } : {}),
        ...(state === 'final' ? { isWinner: own > other } : {})
    });
    return {
        gamePk,
        gameType: type,
        gameDate: `${day}T${time}:00Z`,
        officialDate: day,
        status: { ...STATUS[state], ...status },
        teams: { away: side(away, a, h), home: side(home, h, a) },
        venue: { name: `Estadio ${home}` },
        seriesDescription: type === 'L' ? 'Round Robin' : 'Regular Season',
        doubleHeader: 'N',
        gameNumber: 1,
        dayNight: 'night',
        ifNecessary: 'N',
        ...extra
    };
};

/** La temporada 2026 inventada: terminados, uno pospuesto y repuesto, uno en vivo, uno por jugar, uno cancelado… */
const SEASON_2026 = (live = true) => [
    raw(12345001, '2026-10-16', A, B, { a: 3, h: 5, gamesInSeries: 2, seriesGameNumber: 1 }),
    raw(12345002, '2026-10-16', C, D, { a: 7, h: 2 }),
    raw(12345003, '2026-10-17', B, A, { a: 4, h: 1 }),
    // Pospuesto el 17 y jugado el 18: MLB lo manda los dos días con el mismo gamePk
    raw(12345004, '2026-10-17', D, C, { state: 'postponed', time: '18:00', officialDate: '2026-10-18' }),
    raw(12345004, '2026-10-18', D, C, { a: 0, h: 2, time: '18:00' }),
    live ? raw(12345005, '2026-10-18', A, C, { state: 'live', a: 1, h: 0 }) : raw(12345005, '2026-10-18', A, C, { a: 1, h: 0 }),
    raw(12345006, '2026-10-19', B, D, { state: 'preview', status: { startTimeTBD: true }, doubleHeader: 'S', gameNumber: 2 }),
    // Exhibición: no es de la temporada
    raw(12345007, '2026-10-19', A, D, { type: 'E', a: 9, h: 0 }),
    raw(12345008, '2026-10-20', C, B, { state: 'cancelled' }),
    raw(12345009, '2026-12-27', A, B, { type: 'L', a: 2, h: 1 })
];

const SEASON_2025 = [raw(12340001, '2025-10-20', C, A, { a: 6, h: 1 }), raw(12340002, '2025-10-21', A, C, { a: 2, h: 3 })];

const LEAGUE = (season) => ({
    leagues: [
        {
            season: String(season),
            numGames: 50,
            seasonDateInfo: { seasonStartDate: `${season}-10-01`, regularSeasonStartDate: `${season}-10-16`, regularSeasonEndDate: `${season}-12-20`, seasonEndDate: `${season + 1}-01-31` }
        }
    ]
});

/** Fuente sustituida: la temporada vigente es 2026; anota cada /schedule pedido */
const stub = ({ season2026 = SEASON_2026(), season2025 = SEASON_2025 } = {}) => {
    const calls = [];
    http.mlbGet = async (url, params = {}) => {
        if (url.endsWith('/league/131')) return LEAGUE(params.season ? Number(params.season) : 2026);
        if (url.endsWith('/schedule')) {
            calls.push(params);
            const games = params.startDate?.startsWith('2026') ? season2026 : params.startDate?.startsWith('2025') ? season2025 : [];
            const days = [...new Set(games.map((game) => game.gameDate.slice(0, 10)))];
            return { dates: days.map((date) => ({ date, games: games.filter((game) => game.gameDate.startsWith(date)) })) };
        }
        throw new Error(`sin ruta ${url}`);
    };
    return calls;
};

const GAME_KEYS = [
    'away',
    'date',
    'day',
    'dayNight',
    'description',
    'detailedState',
    'doubleHeader',
    'gameNumber',
    'gamePk',
    'gameType',
    'gamesInSeries',
    'home',
    'ifNecessary',
    'phase',
    'reason',
    'seriesGameNumber',
    'startTimeTBD',
    'state',
    'venue'
];

describe('calendario PRO de la temporada', () => {
    it('forma: juegos (uno por gamePk, sin exhibiciones), carrera por fase, cara a cara, forma y equipos', async () => {
        clearCache();
        const calls = stub();
        await withServer(async (base) => {
            const response = await realFetch(`${base}/v2/pro/calendar?league=lidom`);
            expect(response.status).toBe(200);
            // Hay un juego en vivo: un minuto
            expect(sMaxAge(response)).toBe(60);
            const body = await response.json();
            expect(Object.keys(body).sort()).toEqual(['form', 'games', 'headToHead', 'isPreviousSeason', 'league', 'live', 'race', 'season', 'teams', 'timeZone', 'updatedAt']);
            expect(body).toMatchObject({ league: 'lidom', season: 2026, isPreviousSeason: false, timeZone: 'America/Santo_Domingo', live: true });
            expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

            // Las fechas de la temporada (las de /v2/pro/season) en una sola llamada
            expect(calls).toEqual([{ sportId: 17, leagueId: 131, startDate: '2026-10-01', endDate: '2027-01-31', hydrate: 'team' }]);

            expect(body.games.map((game) => game.gamePk)).toEqual([12345001, 12345002, 12345003, 12345004, 12345005, 12345006, 12345008, 12345009]);
            for (const game of body.games) expect(Object.keys(game).sort()).toEqual(GAME_KEYS);
            const byPk = Object.fromEntries(body.games.map((game) => [game.gamePk, game]));
            expect(byPk[12345001]).toEqual({
                gamePk: 12345001,
                date: '2026-10-16T23:00:00Z',
                day: '2026-10-16',
                gameType: 'R',
                phase: 'regular',
                state: 'final',
                detailedState: 'Final',
                reason: null,
                startTimeTBD: false,
                away: { id: A, score: 3, isWinner: false },
                home: { id: B, score: 5, isWinner: true },
                venue: `Estadio ${B}`,
                description: 'Regular Season',
                doubleHeader: null,
                gameNumber: 1,
                seriesGameNumber: 1,
                gamesInSeries: 2,
                ifNecessary: false,
                dayNight: 'night'
            });
            // El pospuesto queda una vez, el día que se jugó
            expect(byPk[12345004]).toMatchObject({ day: '2026-10-18', state: 'final', home: { id: C, score: 2, isWinner: true } });
            expect(byPk[12345005]).toMatchObject({ state: 'live', away: { score: 1, isWinner: null }, home: { score: 0, isWinner: null } });
            expect(byPk[12345006]).toMatchObject({ state: 'preview', startTimeTBD: true, doubleHeader: 'S', gameNumber: 2, away: { id: B, score: null, isWinner: null } });
            expect(byPk[12345008]).toMatchObject({ state: 'cancelled', detailedState: 'Cancelled', reason: 'Rain', home: { score: null, isWinner: null } });
            expect(byPk[12345009]).toMatchObject({ gameType: 'L', phase: 'roundRobin', description: 'Round Robin' });

            expect(body.teams[A]).toEqual({ id: A, abbrev: 'E71', name: `Equipo ${A}`, color: '#64748b', logo: `https://www.mlbstatic.com/team-logos/${A}.svg` });
            expect(Object.keys(body.teams).map(Number).sort()).toEqual([A, B, C, D]);

            // Carrera: récord al cierre de cada fecha con terminados de la fase (listas alineadas con `dates`)
            expect(body.race.regular).toEqual({
                dates: ['2026-10-16', '2026-10-17', '2026-10-18'],
                teams: {
                    [A]: { w: [0, 0, 0], l: [1, 2, 2] },
                    [B]: { w: [1, 2, 2], l: [0, 0, 0] },
                    [C]: { w: [1, 1, 2], l: [0, 0, 0] },
                    [D]: { w: [0, 0, 0], l: [1, 1, 2] }
                }
            });
            expect(body.race.roundRobin).toEqual({ dates: ['2026-12-27'], teams: { [A]: { w: [1], l: [0] }, [B]: { w: [0], l: [1] } } });

            expect(body.headToHead.regular[A][B]).toEqual({ wins: 0, losses: 2, runsFor: 4, runsAgainst: 9 });
            expect(body.headToHead.regular[B][A]).toEqual({ wins: 2, losses: 0, runsFor: 9, runsAgainst: 4 });
            expect(body.headToHead.roundRobin[A][B]).toEqual({ wins: 1, losses: 0, runsFor: 2, runsAgainst: 1 });
            expect(body.headToHead.regular[A][C]).toBeUndefined();

            // Forma: del más reciente al más viejo, de cualquier fase
            expect(body.form[A].map((game) => game.gamePk)).toEqual([12345009, 12345003, 12345001]);
            expect(body.form[A][0]).toEqual({ gamePk: 12345009, day: '2026-12-27', phase: 'roundRobin', opponentId: B, isHome: false, isWin: true, runs: 2, runsAllowed: 1 });
            expect(body.form[D]).toEqual([
                { gamePk: 12345004, day: '2026-10-18', phase: 'regular', opponentId: C, isHome: false, isWin: false, runs: 0, runsAllowed: 2 },
                { gamePk: 12345002, day: '2026-10-16', phase: 'regular', opponentId: C, isHome: true, isWin: false, runs: 2, runsAllowed: 7 }
            ]);
        });
    });

    it('caché: segunda petición sin ir a la fuente; 5 min sin juegos en vivo y 6 h para una temporada pasada', async () => {
        clearCache();
        const calls = stub({ season2026: SEASON_2026(false) });
        await withServer(async (base) => {
            const first = await realFetch(`${base}/v2/pro/calendar?league=lidom`);
            expect(first.status).toBe(200);
            expect(sMaxAge(first)).toBe(300);
            expect((await first.json()).live).toBe(false);
            const again = await realFetch(`${base}/v2/pro/calendar`);
            expect(again.status).toBe(200);
            expect(calls).toHaveLength(1);

            const past = await realFetch(`${base}/v2/pro/calendar?league=lidom&season=2025`);
            expect(past.status).toBe(200);
            expect(sMaxAge(past)).toBe(21600);
            const body = await past.json();
            expect(body).toMatchObject({ season: 2025, isPreviousSeason: true, live: false });
            expect(body.games.map((game) => game.gamePk)).toEqual([12340001, 12340002]);
            expect(calls[1]).toMatchObject({ startDate: '2025-10-01', endDate: '2026-01-31' });
        });
    });

    it('sin juegos todavía en la temporada vigente: la anterior marcada como tal (como las posiciones)', async () => {
        clearCache();
        stub({ season2026: [] });
        await withServer(async (base) => {
            const response = await realFetch(`${base}/v2/pro/calendar?league=lidom`);
            expect(response.status).toBe(200);
            // Sin ?season= no se guarda 6 h: en cuanto la nueva tenga juegos, sale la nueva
            expect(sMaxAge(response)).toBe(300);
            const body = await response.json();
            expect(body).toMatchObject({ season: 2025, isPreviousSeason: true });
            expect(body.race.regular.dates).toEqual(['2025-10-20', '2025-10-21']);
            expect(body.form[A].map((game) => game.isWin)).toEqual([false, false]);
        });
    });

    it('entrada inválida: 400 sin caché (temporada mal escrita, futura o muy vieja, liga que no existe)', async () => {
        clearCache();
        const calls = stub();
        await withServer(async (base) => {
            for (const query of ['season=abc', 'season=20266', 'season=', 'season=2099', 'season=1999', 'season=2026&season=2025']) {
                const response = await realFetch(`${base}/v2/pro/calendar?league=lidom&${query}`);
                expect(response.status, query).toBe(400);
                expect(response.headers.get('cache-control')).toBe('no-store');
                expect(await response.json()).toEqual({ error: 'invalid_season' });
            }
            const league = await realFetch(`${base}/v2/pro/calendar?league=nba`);
            expect(league.status).toBe(400);
            expect(await league.json()).toEqual({ error: 'invalid_league' });
        });
        expect(calls).toHaveLength(0);
    });

    it('simulador (dev:mock): la temporada pasada completa, con la carrera alineada y el cara a cara parejo', async () => {
        clearCache();
        process.env.MLB_MOCK = '1';
        const season = new Date().getUTCFullYear() - 1;
        const data = await seasonCalendar('lidom', season);
        expect(data).toMatchObject({ league: 'lidom', season, isPreviousSeason: true });
        expect(data.games.length).toBeGreaterThan(150);
        expect(data.games.every((game) => game.phase === 'regular')).toBe(true);
        // La regular simulada: del 16 de octubre al 20 de diciembre
        expect(data.games[0].day).toBe(`${season}-10-16`);
        const race = data.race.regular;
        expect(race.dates.length).toBeGreaterThanOrEqual(60);
        for (const line of Object.values(race.teams)) {
            expect(line.w).toHaveLength(race.dates.length);
            expect(line.l).toHaveLength(race.dates.length);
        }
        const last = race.dates.length - 1;
        const lines = Object.values(race.teams);
        expect(lines.reduce((sum, line) => sum + line.w[last], 0)).toBe(lines.reduce((sum, line) => sum + line.l[last], 0));
        for (const [teamId, rivals] of Object.entries(data.headToHead.regular)) {
            for (const [rivalId, cell] of Object.entries(rivals)) expect(data.headToHead.regular[rivalId][teamId]).toMatchObject({ wins: cell.losses, losses: cell.wins });
        }
        expect(Object.values(data.form).every((list) => list.length === 10)).toBe(true);
    });
});
