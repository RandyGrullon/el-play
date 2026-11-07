import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { fileURLToPath } from 'url';
import path from 'path';

// GET /v2/game/:pk/pro con los feeds de juegos de LIDOM de las demás pruebas (826279 con rastreo, 826244 sin rastreo).
// La API es CommonJS: se carga con require para sustituir http.mlbGet.
const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(gunzipSync(readFileSync(path.join(dir, 'fixtures', `${name}.json.gz`))).toString('utf8'));

const http = require('../services/http');
const fantasy = require('../services/fantasy');
const { clearCache } = require('../utils/cache');
const { resetLiveFeeds } = require('../services/liveFeed');
const { transformGame } = require('../utils/transformers');
const app = require('../app');
const { buildGamePro, windOf, isoOfStamp } = require('../services/pro/juego');

const realGet = http.mlbGet;
const realFetch = globalThis.fetch;
afterEach(() => {
    http.mlbGet = realGet;
    resetLiveFeeds();
    clearCache();
});

const sMaxAge = (response) => Number((response.headers.get('cache-control') || '').match(/s-maxage=(\d+)/)?.[1]);

// La misma cuenta que la «Repetición de ayer» de la app (src/components/pro/fantasy/logic.ts, replaySteps)
const replayPoints = (detail, pro) => {
    const s = fantasy.SCORING;
    const HIT = { single: 'single', double: 'double', triple: 'triple', home_run: 'homeRun' };
    const totals = {};
    const add = (id, pts) => {
        if (id && pts) totals[id] = Math.round(((totals[id] || 0) + pts) * 10) / 10;
    };
    const byIndex = new Map(pro.plays.map((play) => [play.i, play]));
    for (const atBat of detail.atBats) {
        const event = atBat.complete ? atBat.event : null;
        if (event) {
            if (HIT[event]) {
                add(atBat.batter.id, s.batter[HIT[event]]);
                add(atBat.pitcher.id, s.pitcher.hit);
            }
            if (['walk', 'intent_walk'].includes(event)) {
                add(atBat.batter.id, s.batter.walk);
                add(atBat.pitcher.id, s.pitcher.walk);
            }
            if (event === 'hit_by_pitch') add(atBat.batter.id, s.batter.hitByPitch);
            if (/^strikeout/.test(event)) {
                add(atBat.batter.id, s.batter.strikeOut);
                add(atBat.pitcher.id, s.pitcher.strikeOut);
            }
            for (let n = 0; n < (atBat.rbi || 0); n++) add(atBat.batter.id, s.batter.rbi);
        }
        for (const runner of byIndex.get(atBat.i)?.runners ?? []) {
            if (runner.scored) {
                add(runner.id, s.batter.run);
                if (runner.earned) add(runner.pitcher ?? atBat.pitcher.id, s.pitcher.earnedRun);
            }
            if (/^stolen_base/.test(runner.event ?? '')) add(runner.id, s.batter.stolenBase);
            if (runner.out) add(atBat.pitcher.id, s.pitcher.out);
        }
    }
    add(detail.decisions?.winner?.id, s.pitcher.win);
    add(detail.decisions?.save?.id, s.pitcher.save);
    return totals;
};

describe('juego PRO (GET /v2/game/:pk/pro)', () => {
    it('jugadas con corredores, pitcheos y acciones: la repetición termina igual que los puntos del box score', () => {
        for (const name of ['feed-826279', 'feed-826244-sin-rastreo']) {
            const feed = fixture(name);
            const pro = buildGamePro(feed);
            expect(pro.plays).toHaveLength(pro.total);
            const totals = replayPoints(transformGame(feed), pro);
            const played = fantasy.playersFromFeed(feed, pro.gamePk, true).filter((player) => player.played);
            expect(played.length).toBeGreaterThan(20);
            for (const player of played) expect([player.name, totals[player.id] ?? 0]).toEqual([player.name, player.points]);
        }
    });

    it('826279: rastreo, clima, umpires, box score completo, récords y peloteros', () => {
        const pro = buildGamePro(fixture('feed-826279'));
        expect(pro).toMatchObject({ gamePk: 826279, state: 'final', tracking: { type: 'E', pitches: 284, speed: 284, breaks: 284 }, since: null, updatedAt: '2025-11-30T23:08:32.000Z' });
        expect(pro.game.weather).toEqual({ condition: 'Cloudy', tempF: 78, tempC: 26, wind: { mph: 3, text: 'In From CF', dir: 'in', field: 'CF', deg: 180 } });
        expect(pro.game.venue).toMatchObject({ id: 3049, field: { capacity: 25000, leftLine: 335, center: 411, rightLine: 335, turf: 'Grass', roof: 'Open' } });
        expect(pro.game.officials[0]).toEqual({ type: 'Home Plate', id: expect.any(Number), name: 'Domingo Paulino' });
        expect(pro.review).toEqual({ away: { used: 2, left: 1 }, home: { used: 0, left: 2 } });
        expect(pro.moundVisits).toEqual({ away: { used: 1, left: 4 }, home: { used: 3, left: 2 } });
        expect(pro.linescore[0]).toEqual({ n: 1, away: { r: 0, h: 0, e: 2, lob: 0 }, home: { r: 4, h: 3, e: 0, lob: 2 } });
        expect(pro.totals).toEqual({ away: { r: 6, h: 9, e: 2, lob: 5 }, home: { r: 5, h: 5, e: 1, lob: 7 } });
        // Box score: orden al bate (100, 200…), emergentes con su nota y la línea de cada lanzador
        const away = pro.box.away;
        expect(away.batters.map((batter) => batter.order)).toEqual([...away.batters.map((batter) => batter.order)].sort((a, b) => a - b));
        expect(away.batters.find((batter) => batter.order === 301)).toMatchObject({ note: 'a' });
        expect(away.pitchers[0]).toMatchObject({ starter: true, throws: expect.any(String), inn: expect.any(Array) });
        expect(away.totals.risp).toEqual({ h: expect.any(Number), ab: expect.any(Number) });
        expect(pro.records.longest).toMatchObject({ dist: 396, event: 'home_run' });
        expect(pro.pace.length).toBeGreaterThan(0);
        expect(pro.players[429664]).toMatchObject({ name: 'Robinson Canó', teamId: 669, pos: '2B', bats: 'L' });
        // Un pitcheo con rastreo trae su vuelo; uno sin rastreo solo número y hora
        expect(pro.plays[3].pitches[0]).toMatchObject({ n: 1, end: 76.8, ivb: 4.2, x0: expect.any(Number), vy0: expect.any(Number), t: expect.any(Number) });
        const noTracking = buildGamePro(fixture('feed-826244-sin-rastreo'));
        expect(Object.keys(noTracking.plays[3].pitches[0]).sort()).toEqual(['n', 't']);
        // Cambio de lanzador: a quién reemplaza
        const change = pro.plays.flatMap((play) => play.actions).find((action) => action.type === 'pitching_substitution');
        expect(change).toMatchObject({ player: expect.any(Number), replaced: expect.any(Number) });
    });

    it('?since=N: solo las jugadas desde la N y sin los peloteros', () => {
        const full = buildGamePro(fixture('feed-826279'));
        const part = buildGamePro(fixture('feed-826279'), full.total - 3);
        expect(part.plays.map((play) => play.i)).toEqual(full.plays.slice(-3).map((play) => play.i));
        expect(part.since).toBe(full.total - 3);
        expect(part.players).toBeUndefined();
    });

    it('viento y hora de MLB', () => {
        expect(windOf('8 mph, Out To CF')).toEqual({ mph: 8, text: 'Out To CF', dir: 'out', field: 'CF', deg: 0 });
        expect(windOf('5 mph, Out To RF')).toMatchObject({ dir: 'out', field: 'RF', deg: 45 });
        expect(windOf('4 mph, In From LF')).toMatchObject({ dir: 'in', field: 'LF', deg: 135 });
        expect(windOf('6 mph, R To L')).toEqual({ mph: 6, text: 'R To L', dir: 'cross', field: null, deg: -90 });
        expect(windOf('0 mph, None')).toMatchObject({ dir: 'calm', deg: null });
        expect(windOf('7 mph, Varies')).toMatchObject({ dir: 'varies' });
        expect(windOf('')).toBeNull();
        expect(isoOfStamp('20251130_230832')).toBe('2025-11-30T23:08:32.000Z');
    });

    it('ruta: forma, caché de un juego terminado (10 min), since inválido 400 y juego que no existe 404', async () => {
        http.mlbGet = async (url) => {
            if (/\/game\/826279\/feed\/live$/.test(url)) return fixture('feed-826279');
            if (/\/game\/12345678\/feed\/live$/.test(url)) throw Object.assign(new Error('not found'), { response: { status: 404 } });
            if (url.endsWith('/schedule')) return { dates: [{ games: [{ gamePk: 826279, gameType: 'R', seriesDescription: 'Regular Season', seriesGameNumber: 2, gamesInSeries: 3, ifNecessary: 'N' }] }] };
            if (url.endsWith('/gamePace')) return { leagues: [{ totalGames: 150, timePerGame: '03:12:00', timePerPitch: '00:00:17', pitchesPerGame: 281.4, runsPerGame: 8.71, pitchersPerGame: 9.2 }] };
            throw new Error(`sin ruta ${url}`);
        };
        const server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        const base = `http://127.0.0.1:${server.address().port}/api/v2/game`;
        try {
            const ok = await realFetch(`${base}/826279/pro`);
            expect(ok.status).toBe(200);
            expect(sMaxAge(ok)).toBe(600);
            const body = await ok.json();
            expect(Object.keys(body).sort()).toEqual(
                ['abs', 'box', 'current', 'date', 'defense', 'detailedState', 'flags', 'game', 'gamePk', 'leaguePace', 'linescore', 'moundVisits', 'notes', 'offense', 'pace', 'players', 'plays', 'reason', 'records', 'review', 'schedule', 'since', 'state', 't0', 'topPerformers', 'total', 'totals', 'tracking', 'updatedAt', 'zoneSize'].sort()
            );
            expect(body.schedule).toEqual({ gameType: 'R', description: 'Regular Season', seriesGameNumber: 2, gamesInSeries: 3, ifNecessary: false, series: null });
            expect(body.leaguePace).toEqual({ season: 2025, games: 150, minutesPerGame: 192, secondsPerPitch: 17, pitchesPerGame: 281.4, runsPerGame: 8.71, pitchersPerGame: 9.2 });
            expect(Object.keys(body.box.home).sort()).toEqual(['batters', 'bench', 'bullpen', 'info', 'notes', 'pitchers', 'totals']);

            const since = await (await realFetch(`${base}/826279/pro?since=70`)).json();
            expect(since.plays[0].i).toBe(70);
            expect(since.players).toBeUndefined();
            expect((await realFetch(`${base}/826279/pro?since=-1`)).status).toBe(400);
            expect((await realFetch(`${base}/abc/pro`)).status).toBe(400);
            const missing = await realFetch(`${base}/12345678/pro`);
            expect(missing.status).toBe(404);
            expect((await missing.json()).error).toBe('game_not_found');
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
