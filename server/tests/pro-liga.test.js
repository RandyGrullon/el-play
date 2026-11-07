import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { fileURLToPath } from 'url';
import path from 'path';

// Rutas del modo PRO de liga (posiciones con `pro` y fechas de la temporada) con datos reales de LIDOM 2025.
// La API es CommonJS: se carga con require para sustituir http.mlbGet.
const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(gunzipSync(readFileSync(path.join(dir, 'fixtures', `${name}.json.gz`))).toString('utf8'));

const http = require('../services/http');
const { clearCache } = require('../utils/cache');
const app = require('../app');
const standings = require('../services/pro/standings');

const realGet = http.mlbGet;
const realFetch = globalThis.fetch;
afterEach(() => {
    http.mlbGet = realGet;
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

const LEAGUE_2025 = {
    leagues: [
        {
            season: '2025',
            numGames: 50,
            seasonState: 'postseason',
            seasonDateInfo: {
                seasonStartDate: '2025-10-01',
                regularSeasonStartDate: '2025-10-15',
                regularSeasonEndDate: '2025-12-21',
                postSeasonStartDate: '2025-12-27',
                postSeasonEndDate: '2026-01-31',
                seasonEndDate: '2026-01-31',
                offSeasonEndDate: '2026-09-30',
                qualifierPlateAppearances: 2.7,
                qualifierOutsPitched: 2.4
            }
        }
    ]
};

describe('posiciones PRO y temporada', () => {
    const setup = () => {
        clearCache();
        http.mlbGet = async (url, params = {}) => {
            if (url.endsWith('/league/131')) return LEAGUE_2025;
            if (url.endsWith('/standings')) return params.standingsTypes === 'regularSeason' ? fixture('standings-lidom-2025-regular') : fixture('standings-lidom-2025-postseason');
            if (url.endsWith('/schedule')) return params.gameTypes === 'W' ? fixture('schedule-lidom-2025-final') : { dates: [] };
            throw new Error(`sin ruta ${url}`);
        };
    };

    it('cada fila con `pro`: situaciones, esperado, carreras, clasificado/eliminado y juegos respecto al 4.º', async () => {
        setup();
        const data = await standings.proStandings('lidom');
        expect(data.type).toBe('lidom');
        const [first] = data.regular;
        expect(first.team.id).toBe(667);
        expect(first.pro).toMatchObject({ clinched: true, eliminated: false, eliminationNumber: null, cutGamesBack: -9.5 });
        expect(first.pro.splits.home).toEqual({ wins: expect.any(Number), losses: expect.any(Number) });
        expect(first.pro.expected).toEqual({ wins: expect.any(Number), losses: expect.any(Number) });
        expect(typeof first.pro.runDiff).toBe('number');
        const fourth = data.regular[3];
        expect(fourth.pro.cutGamesBack).toBe(0);
        const fifth = data.regular[4];
        expect(fifth.pro).toMatchObject({ eliminated: true, eliminationNumber: 'E', cutGamesBack: 1 });
        expect(data.pro).toMatchObject({
            live: false,
            regularSeasonGames: 50,
            advance: { regular: 4, roundRobin: 2 },
            phases: { regular: { played: 149, perTeam: 50 }, roundRobin: { perTeam: 18, startDate: '2025-12-27', endDate: '2026-01-20' }, final: { total: 7 } }
        });
        expect(data.pro.dates).toMatchObject({ regularStart: '2025-10-15', postStart: '2025-12-27' });
        expect(data.pro.lastUpdated).toMatch(/^2026-01/);
        // El Round Robin también trae su línea (2 pasan)
        expect(data.roundRobin[1].pro.cutGamesBack).toBe(0);
    });

    it('etapa de la temporada: pretemporada, día N de la regular, receso, postemporada y fuera de temporada', () => {
        const dates = { regularStart: '2025-10-15', regularEnd: '2025-12-21', postStart: '2025-12-27', postEnd: '2026-01-31', seasonEnd: '2026-01-31' };
        expect(standings.stageOf(dates, '2025-10-01')).toEqual({ stage: 'preseason', day: null, daysToStart: 14 });
        expect(standings.stageOf(dates, '2025-10-17')).toEqual({ stage: 'regular', day: 3, daysToStart: null });
        expect(standings.stageOf(dates, '2025-12-24').stage).toBe('break');
        expect(standings.stageOf(dates, '2025-12-28')).toEqual({ stage: 'postseason', day: 2, daysToStart: null });
        expect(standings.stageOf(dates, '2026-03-01').stage).toBe('offseason');
        expect(standings.stageOf(null, '2026-03-01')).toEqual({ stage: null, day: null, daysToStart: null });
    });

    it('rutas: posiciones (5 min sin juegos en vivo), temporada y las tres ligas (30 min)', async () => {
        setup();
        await withServer(async (base) => {
            const table = await realFetch(`${base}/v2/pro/standings?league=lidom`);
            expect(table.status).toBe(200);
            expect(sMaxAge(table)).toBe(300);
            const body = await table.json();
            expect(Object.keys(body.regular[0].pro).sort()).toEqual(['clinched', 'cutGamesBack', 'eliminated', 'eliminationNumber', 'expected', 'runDiff', 'splits']);

            const season = await realFetch(`${base}/v2/pro/season?league=lidom`);
            expect(season.status).toBe(200);
            expect(sMaxAge(season)).toBe(1800);
            expect(await season.json()).toMatchObject({
                league: 'lidom',
                season: 2025,
                seasonState: 'postseason',
                timeZone: 'America/Santo_Domingo',
                regularSeasonGames: 50,
                qualifier: { plateAppearances: 2.7, outsPitched: 2.4 },
                dates: { seasonStart: '2025-10-01', offseasonEnd: '2026-09-30' }
            });

            const all = await realFetch(`${base}/v2/pro/seasons`);
            expect(all.status).toBe(200);
            expect(sMaxAge(all)).toBe(1800);
            expect((await all.json()).leagues.map((item) => item.league)).toContain('lidom');
            expect((await realFetch(`${base}/v2/pro/season?league=nba`)).status).toBe(400);
        });
    });
});
