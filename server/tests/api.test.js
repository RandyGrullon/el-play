import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { fileURLToPath } from 'url';
import path from 'path';

// La API es CommonJS: se carga con require nativo para poder sustituir http.mlbGet
const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(gunzipSync(readFileSync(path.join(dir, 'fixtures', `${name}.json.gz`))).toString('utf8'));

const http = require('../services/http');
const { transformGame, transformScheduleGame, classifyPitch } = require('../utils/transformers');
const { applyPatch } = require('../utils/jsonPatch');
const { getLiveFeed, resetLiveFeeds } = require('../services/liveFeed');
const { cached, clearCache } = require('../utils/cache');
const { fetchStandings, fetchLeaders } = require('../services/mlbService');
const { toLegacyGame } = require('../utils/legacy');

const realGet = http.mlbGet;
afterEach(() => {
    http.mlbGet = realGet;
    resetLiveFeeds();
    clearCache();
});

describe('transformGame con un juego real de LIDOM (826279, EST 6 - ESC 5)', () => {
    const game = transformGame(fixture('feed-826279'));

    it('marcador, estado y equipos (Estrellas = 669, no 673)', () => {
        expect(game.state).toBe('final');
        expect(game.away).toMatchObject({ id: 669, abbrev: 'EST', runs: 6, isWinner: true });
        expect(game.home).toMatchObject({ id: 671, abbrev: 'ESC', runs: 5, isWinner: false });
        expect(game.away.color).toBe('#00be66');
    });

    it('todos los pitcheos del juego, con coordenadas y clasificados con las banderas de MLB', () => {
        const pitches = game.atBats.flatMap((atBat) => atBat.pitches);
        expect(pitches).toHaveLength(284);
        expect(pitches.every((pitch) => pitch.x !== null && pitch.z !== null)).toBe(true);
        const count = (r) => pitches.filter((pitch) => pitch.r === r).length;
        expect(count('inplay')).toBe(59); // X + D + E
        expect(count('hbp')).toBe(1);
        expect(count('strike')).toBe(54 + 25 + 37); // cantados + abanicados + fouls
        expect(count('ball')).toBe(108); // incluye la bola en tierra (*B)
    });

    it('decisiones con récord y EFE reales (antes eran inventados)', () => {
        expect(game.decisions.winner).toMatchObject({ name: 'Enoli Paredes', wins: 1, losses: 0, era: '1.93' });
        expect(game.decisions.save?.saves).toBe(2);
    });

    it('la respuesta pesa una fracción del feed original', () => {
        expect(JSON.stringify(game).length).toBeLessThan(JSON.stringify(fixture('feed-826279')).length / 8);
    });

    it('el formato anterior sigue disponible para la PWA vieja', () => {
        const legacy = toLegacyGame(game);
        expect(legacy.status).toBe('Final');
        expect(legacy.matchup).toEqual({ pitcher: '', batter: '' });
        expect(legacy.innings.length).toBe(9);
    });
});

describe('juego en vivo: detalles, bases tras cada jugada, acciones, banca y bullpen (826279)', () => {
    const game = transformGame(fixture('feed-826279'));

    it('umpires, viento, duración, primer lanzamiento y hora de la última jugada', () => {
        expect(game.info).toMatchObject({ durationMin: 184, firstPitch: '2025-11-30T20:04:00.000Z', wind: '3 mph, In From CF' });
        expect(game.info.umpires).toEqual([
            { type: 'Home Plate', name: 'Domingo Paulino' },
            { type: 'First Base', name: 'Marco Florimon' },
            { type: 'Second Base', name: 'Felix Tejada' },
            { type: 'Third Base', name: 'Luis De Los Santos' }
        ]);
        expect(game.lastPlayAt).toBe('2025-11-30T23:08:32.844Z');
    });

    it('bases ocupadas al terminar cada jugada (1, 2 y 4) y en qué pitcheo pasó cada acción', () => {
        expect(game.atBats.every((atBat) => Number.isInteger(atBat.post) && atBat.post >= 0 && atBat.post <= 7)).toBe(true);
        expect(game.atBats.filter((atBat) => atBat.post === 7)).toHaveLength(4);
        const steals = game.atBats.flatMap((atBat) => atBat.actions).filter((action) => action.event === 'stolen_base_2b');
        expect(steals).toHaveLength(4);
        expect(steals.every((action) => action.at > 0)).toBe(true);
        expect(game.atBats.flatMap((atBat) => atBat.actions).filter((action) => action.event === 'pitching_substitution').every((action) => action.at === 0)).toBe(true);
    });

    it('banca y bullpen con su temporada, sin los que ya lanzaron', () => {
        expect(game.box.home.bench).toHaveLength(15);
        expect(game.box.home.bench[0]).toMatchObject({ id: 660620, pos: '2B', bats: 'S', avg: '.125' });
        const pitched = new Set(game.box.home.pitchers.map((pitcher) => pitcher.id));
        expect(game.box.home.bullpen.length).toBeGreaterThan(20);
        expect(game.box.home.bullpen.some((arm) => pitched.has(arm.id))).toBe(false);
        expect(game.box.home.bullpen[0]).toMatchObject({ id: 472551, throws: 'L', era: '4.70' });
    });

    it('el simulador manda lo mismo (dev:mock)', () => {
        const mock = require('../mock');
        const [played] = mock.gamesForDay('2026-10-15');
        const detail = transformGame(mock.buildFeed(played));
        expect(detail.info.umpires).toHaveLength(4);
        expect(detail.lastPlayAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(detail.box.away.bench).toHaveLength(3);
        expect(detail.atBats.some((atBat) => atBat.post > 0)).toBe(true);
        expect(detail.atBats.flatMap((atBat) => atBat.actions).some((action) => action.event === 'pitching_substitution')).toBe(true);
    });
});

describe('previa: enfrentamientos de la temporada, los que vienen calientes y alineaciones', () => {
    const final = (gamePk, date, away, awayRuns, home, homeRuns, state = 'Final') => ({
        gamePk, gameDate: date, status: { abstractGameState: state === 'Final' ? 'Final' : 'Preview', detailedState: state },
        teams: { away: { team: { id: away }, score: awayRuns }, home: { team: { id: home }, score: homeRuns } }
    });
    const stub = (schedule, splits) => {
        http.mlbGet = async (url, params) => {
            if (url.endsWith('/league/131')) return { leagues: [{ season: '2026', numGames: 50 }] };
            if (url.endsWith('/schedule')) return { dates: [{ games: schedule }] };
            if (url.endsWith('/stats') && params.stats === 'byDateRange') return { stats: [{ splits }] };
            throw new Error(`sin stub: ${url}`);
        };
    };
    const app = require('../app');
    const call = async (path) => {
        const server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        try {
            const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
            return { status: res.status, body: await res.json() };
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    };
    const hitter = (id, team, pa, ops, hr = 0) => ({ player: { id, fullName: `Bateador ${id}` }, team: { id: team }, stat: { gamesPlayed: 6, plateAppearances: pa, atBats: pa - 2, hits: 6, homeRuns: hr, rbi: 4, ops, avg: '.300' } });

    it('cuenta los juegos terminados entre los dos (sin pospuestos ni otros rivales) y ordena del más reciente', async () => {
        stub(
            [
                final(1, '2026-10-20T23:00:00Z', 669, 5, 671, 3),
                final(2, '2026-10-22T23:00:00Z', 671, 2, 669, 7),
                final(3, '2026-10-24T23:00:00Z', 669, 0, 671, 0, 'Postponed'),
                final(4, '2026-10-21T23:00:00Z', 669, 1, 667, 4)
            ],
            [hitter(10, 669, 25, '1.100', 2), hitter(11, 669, 20, '.950'), hitter(12, 669, 5, '2.000'), hitter(13, 669, 22, '.700'), hitter(14, 669, 24, '.800'), hitter(20, 671, 18, '.900'), hitter(30, 667, 30, '1.500')]
        );
        const res = await call('/api/v2/preview?league=lidom&away=669&home=671');
        expect(res.status).toBe(200);
        expect(res.body.headToHead.games.map((game) => game.gamePk)).toEqual([2, 1]);
        expect(res.body.headToHead.wins).toEqual({ 669: 2, 671: 0 });
        expect(res.body.headToHead.runs).toEqual({ 669: 12, 671: 5 });
        // Por OPS, con 8 apariciones o más, tres por equipo y solo de estos dos equipos
        expect(res.body.hot.teams['669'].map((player) => player.id)).toEqual([10, 11, 14]);
        expect(res.body.hot.teams['671'].map((player) => player.id)).toEqual([20]);
        expect(res.body.hot.teams['667']).toBeUndefined();
    });

    it('si una parte falla, la otra igual llega; equipos inválidos dan 400', async () => {
        http.mlbGet = async (url) => {
            if (url.endsWith('/league/131')) return { leagues: [{ season: '2026' }] };
            if (url.endsWith('/schedule')) return { dates: [{ games: [final(1, '2026-10-20T23:00:00Z', 669, 5, 671, 3)] }] };
            throw new Error('MLB caído');
        };
        const res = await call('/api/v2/preview?league=lidom&away=669&home=671');
        expect(res.status).toBe(200);
        expect(res.body.headToHead.games).toHaveLength(1);
        expect(res.body.hot).toBeNull();
        expect((await call('/api/v2/preview?away=669&home=669')).status).toBe(400);
        expect((await call('/api/v2/preview?away=abc&home=1')).status).toBe(400);
    });

    it('alineaciones anunciadas antes del juego (del simulador)', () => {
        const mock = require('../mock');
        const preview = mock.gamesForDay(new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10)).find((game) => game.mode === 'preview');
        const detail = transformGame(mock.buildFeed(preview));
        expect(detail.state).toBe('preview');
        expect(detail.lineups.away).toHaveLength(9);
        expect(detail.lineups.home[0]).toMatchObject({ pos: expect.any(String), avg: expect.stringMatching(/^\.\d{3}$/) });
    });
});

describe('inicio y posiciones: doble cartelera y la carrera de la temporada', () => {
    const app = require('../app');
    const call = async (path) => {
        const server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        try {
            const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
            return { status: res.status, body: await res.json() };
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    };
    const game = (day, away, awayRuns, home, homeRuns, extra = {}) => ({
        gamePk: Math.floor(Math.random() * 1e6), gameType: 'R', gameDate: `${day}T23:00:00Z`, status: { abstractGameState: 'Final', detailedState: 'Final' },
        teams: { away: { team: { id: away }, score: awayRuns }, home: { team: { id: home }, score: homeRuns } }, ...extra
    });

    it('el segundo juego de una doble cartelera dice cuál es', () => {
        const base = game('2026-10-20', 669, 1, 671, 2);
        expect(transformScheduleGame({ ...base, doubleHeader: 'S', gameNumber: 2 }, 'lidom').doubleheader).toEqual({ game: 2 });
        expect(transformScheduleGame({ ...base, doubleHeader: 'N', gameNumber: 1 }, 'lidom').doubleheader).toBeNull();
    });

    it('la carrera: victorias menos derrotas al final de cada día, sin pospuestos', async () => {
        http.mlbGet = async (url) => {
            if (url.endsWith('/league/131')) return { leagues: [{ season: '2026', numGames: 50 }] };
            if (url.endsWith('/schedule'))
                return {
                    dates: [
                        { date: '2026-10-16', games: [game('2026-10-16', 669, 5, 671, 3), game('2026-10-16', 667, 2, 668, 1)] },
                        { date: '2026-10-17', games: [game('2026-10-17', 671, 4, 669, 1), game('2026-10-17', 668, 0, 667, 0, { status: { abstractGameState: 'Final', detailedState: 'Postponed' } })] },
                        { date: '2026-10-18', games: [game('2026-10-18', 669, 6, 667, 2)] }
                    ]
                };
            throw new Error(`sin stub: ${url}`);
        };
        const res = await call('/api/v2/race?league=lidom');
        expect(res.status).toBe(200);
        expect(res.body.days).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
        const points = Object.fromEntries(res.body.teams.map((team) => [team.id, team.points]));
        expect(points[669]).toEqual([1, 0, 1]);
        expect(points[671]).toEqual([-1, 0, 0]);
        expect(points[667]).toEqual([1, 1, 0]);
        expect(points[668]).toEqual([-1, -1, -1]);
        expect(res.body.teams[0].id).toBe(669);
    });
});

describe('ficha del pelotero: por situación, postemporada, pitcheos de sus juegos y movimientos', () => {
    const app = require('../app');
    const mock = require('../mock');
    const call = async (path) => {
        const server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        try {
            const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
            return { status: res.status, body: await res.json() };
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    };

    it('contra zurdos y derechos, con corredores en posición, casa y visita, y la postemporada', async () => {
        http.mlbGet = (url, params) => mock.get(url, params);
        const res = await call('/api/v2/player/669001?league=lidom');
        expect(res.status).toBe(200);
        expect(res.body.splits.map((split) => split.code)).toEqual(['vl', 'vr', 'risp', 'h', 'a']);
        expect(res.body.splits[0].hitting).toMatchObject({ pa: expect.any(Number), avg: expect.stringMatching(/^\.\d{3}$|^1\.000$/) });
        expect(res.body.postseason.hitting.g).toBeGreaterThan(0);
    });

    it('si MLB no da las divisiones, la ficha sale igual', async () => {
        http.mlbGet = (url, params) => (url.endsWith('/stats') && url.includes('/people/') ? Promise.reject(new Error('400')) : mock.get(url, params));
        const res = await call('/api/v2/player/669001?league=lidom');
        expect(res.status).toBe(200);
        expect(res.body.splits).toEqual([]);
        expect(res.body.postseason).toBeNull();
    });

    it('los pitcheos de sus últimos juegos: los suyos, con cómo terminó cada turno', async () => {
        http.mlbGet = (url, params) => mock.get(url, params);
        const res = await call('/api/v2/player/669001/pitches?league=lidom');
        expect(res.status).toBe(200);
        expect(res.body.role).toBe('B');
        expect(res.body.games).toBeGreaterThan(0);
        expect(res.body.pitches.length).toBeGreaterThan(10);
        const last = res.body.pitches.filter((pitch) => 'event' in pitch);
        expect(last.length).toBeGreaterThan(0);
        expect(last.some((pitch) => pitch.hit && typeof pitch.hit.x === 'number')).toBe(true);
        expect((await call('/api/v2/player/abc/pitches')).status).toBe(400);
    });

    it('movimientos: solo de equipos de la liga, del más reciente al más viejo', async () => {
        http.mlbGet = async (url) => {
            if (url.endsWith('/transactions'))
                return {
                    transactions: [
                        { id: 1, typeCode: 'SFA', effectiveDate: '2026-10-10', person: { id: 5, fullName: 'Uno' }, toTeam: { id: 669 }, description: 'x' },
                        { id: 2, typeCode: 'TR', effectiveDate: '2026-10-12', person: { id: 6, fullName: 'Dos' }, toTeam: { id: 671 }, fromTeam: { id: 669 }, description: 'y' },
                        { id: 3, typeCode: 'SFA', effectiveDate: '2026-10-13', person: { id: 7, fullName: 'Tres' }, toTeam: { id: 147 }, description: 'z' }
                    ]
                };
            throw new Error(`sin stub: ${url}`);
        };
        const res = await call('/api/v2/transactions?league=lidom');
        expect(res.status).toBe(200);
        expect(res.body.transactions.map((item) => item.id)).toEqual([2, 1]);
        expect(res.body.transactions[0]).toMatchObject({ team: { id: 671 }, other: { id: 669 }, type: 'TR' });
    });
});

describe('retos del ABS (árbitro robot)', () => {
    // El juego real con retos puestos a mano tal como los manda MLB en LIDOM 2026-27
    const feed = fixture('feed-826279');
    const plays = feed.liveData.plays.allPlays;
    const withAbs = () => {
        const copy = JSON.parse(JSON.stringify(feed));
        const all = copy.liveData.plays.allPlays;
        // Un lanzamiento retado a mitad de turno (revisándose) y un turno que terminó con el lanzamiento retado
        const pitchIndex = all[3].playEvents.findIndex((event) => event.isPitch);
        all[3].playEvents[pitchIndex].reviewDetails = { isOverturned: false, inProgress: true, reviewType: 'MJ', challengeTeamId: 671 };
        all[5].reviewDetails = { isOverturned: true, inProgress: false, reviewType: 'MJ', challengeTeamId: 669, player: { id: 42, fullName: 'Receptor' } };
        // Las revisiones de repetición (no ABS) no cuentan
        all[6].reviewDetails = { isOverturned: false, inProgress: false, reviewType: 'MF', challengeTeamId: 669 };
        copy.gameData.absChallenges = { hasChallenges: true, away: { usedSuccessful: 1, usedFailed: 0, remaining: 2 }, home: { usedSuccessful: 0, usedFailed: 2, remaining: 0 }, challengingTeam: { id: 671 } };
        return copy;
    };

    it('el reto va en su lanzamiento; si cerró el turno, en el último; y los contadores de cada equipo', () => {
        const game = transformGame(withAbs());
        const third = game.atBats.find((atBat) => atBat.i === plays[3].about.atBatIndex);
        expect(third.pitches[0].abs).toEqual({ inProgress: true, overturned: false, teamId: 671, by: null });
        const fifth = game.atBats.find((atBat) => atBat.i === plays[5].about.atBatIndex);
        expect(fifth.pitches[fifth.pitches.length - 1].abs).toEqual({ inProgress: false, overturned: true, teamId: 669, by: { id: 42, name: 'Receptor' } });
        expect(game.atBats.find((atBat) => atBat.i === plays[6].about.atBatIndex).pitches.some((pitch) => pitch.abs)).toBe(false);
        expect(game.abs).toEqual({ away: { won: 1, lost: 0, remaining: 2 }, home: { won: 0, lost: 2, remaining: 0 }, challenging: 671 });
        // Sin retos en el juego: nada
        expect(transformGame(feed).abs).toBeNull();
    });
});

describe('pausa entre entradas: a quién le toca batear', () => {
    // El mismo juego real puesto «en vivo» justo tras el tercer out de la alta (como lo manda MLB en la pausa)
    const feed = fixture('feed-826279');
    const live = (inningState, offense) => ({
        ...feed,
        gameData: { ...feed.gameData, status: { ...feed.gameData.status, abstractGameState: 'Live', detailedState: 'In Progress', codedGameState: 'I' } },
        liveData: { ...feed.liveData, linescore: { ...feed.liveData.linescore, inningState, offense } }
    });
    const offense = {
        team: { id: 671 },
        batter: { id: 1, fullName: 'Primero' },
        onDeck: { id: 2, fullName: 'Segundo' },
        inHole: { id: 3, fullName: 'Tercero' }
    };

    it('en «Middle» o «End» trae los tres que le tocan y su equipo', () => {
        expect(transformGame(live('Middle', offense)).dueUp).toEqual({ teamId: 671, batters: [{ id: 1, name: 'Primero' }, { id: 2, name: 'Segundo' }, { id: 3, name: 'Tercero' }] });
        expect(transformGame(live('End', { ...offense, inHole: undefined })).dueUp.batters).toHaveLength(2);
    });

    it('con un turno en curso (o el juego terminado) no hay pausa', () => {
        expect(transformGame(live('Top', offense)).dueUp).toBeNull();
        expect(transformGame(feed).dueUp).toBeNull();
    });
});

describe('arreglos de la auditoría (servidor)', () => {
    const app = require('../app');
    const { mergeGames } = require('../services/fantasy');
    const listen = async (run) => {
        const server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        try {
            await run(`http://127.0.0.1:${server.address().port}/api`);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    };

    it('una liga que no es de la app (toString, valueOf…) es 400 y una fecha imposible también', async () => {
        await listen(async (base) => {
            for (const league of ['toString', 'valueOf', 'hasOwnProperty', '__proto__']) expect((await fetch(`${base}/v2/leaders?league=${league}`)).status).toBe(400);
            expect((await fetch(`${base}/v2/fantasy?league=lidom&date=2026-13-45`)).status).toBe(400);
            expect((await fetch(`${base}/v2/fantasy/owners?league=lidom&date=2026-02-30`)).status).toBe(400);
        });
    });

    it('doble cartelera: los dos juegos del pelotero suman (las entradas por outs) y se cierra con el primero', () => {
        const a = { id: 1, gamePk: 10, role: 'P', played: true, starter: true, points: 12.5, line: { ip: '6.2', outs: 20, k: 7, er: 1, h: 4, bb: 1, w: 1, sv: 0 } };
        const b = { id: 1, gamePk: 11, role: 'P', played: true, starter: false, points: 3, line: { ip: '1.1', outs: 4, k: 2, er: 0, h: 1, bb: 0, w: 0, sv: 1 } };
        expect(mergeGames(a, b, 10)).toMatchObject({ gamePk: 10, points: 15.5, doubleheader: true, line: { ip: '8.0', outs: 24, k: 9, er: 1, h: 5, bb: 1, w: 1, sv: 1 } });
    });

    it('un juego terminado no se vuelve a bajar en cada llamada', async () => {
        const realGet = http.mlbGet;
        resetLiveFeeds();
        let calls = 0;
        http.mlbGet = async () => {
            calls += 1;
            const doc = fixture('feed-826279');
            return doc;
        };
        try {
            await getLiveFeed(826279);
            const again = await getLiveFeed(826279);
            expect(calls).toBe(1);
            expect(again.mode).toBe('unchanged');
        } finally {
            http.mlbGet = realGet;
            resetLiveFeeds();
        }
    });
});

describe('classifyPitch', () => {
    it('usa los códigos cuando faltan las banderas', () => {
        expect(classifyPitch({ code: 'F' })).toBe('strike');
        expect(classifyPitch({ code: 'T' })).toBe('strike');
        expect(classifyPitch({ code: '*B' })).toBe('ball');
        expect(classifyPitch({ code: 'E' })).toBe('inplay');
        expect(classifyPitch({ code: 'H', isBall: true })).toBe('hbp');
    });
});

describe('transformScheduleGame', () => {
    it('convierte el calendario real con hydrate=linescore,probablePitcher,decisions', () => {
        const games = fixture('schedule-lidom-2025-11-28').dates.flatMap((date) => date.games);
        const cards = games.map((game) => transformScheduleGame(game, 'lidom'));
        expect(cards.length).toBeGreaterThan(5);
        const card = cards[0];
        expect(card.state).toBe('final');
        expect(card.away.record).toEqual({ wins: expect.any(Number), losses: expect.any(Number) });
        expect(card.decisions.winner.name).toBeTruthy();
        expect(cards.every((c) => c.away.abbrev.length === 3 && c.home.abbrev.length === 3)).toBe(true);
    });
});

describe('applyPatch (RFC 6902)', () => {
    it('aplica add, replace, remove, move y copy', () => {
        const doc = { metaData: { timeStamp: 'a' }, list: [1, 2], obj: { x: 1 } };
        applyPatch(doc, [
            { op: 'replace', path: '/metaData/timeStamp', value: 'b' },
            { op: 'add', path: '/list/-', value: 3 },
            { op: 'add', path: '/list/0', value: 0 },
            { op: 'remove', path: '/obj/x' },
            { op: 'add', path: '/obj/a~1b', value: 'slash' },
            { op: 'copy', from: '/list/1', path: '/obj/copia' },
            { op: 'move', from: '/obj/copia', path: '/movido' }
        ]);
        expect(doc).toEqual({ metaData: { timeStamp: 'b' }, list: [0, 1, 2, 3], obj: { 'a/b': 'slash' }, movido: 1 });
    });

    it('lanza error con rutas inexistentes', () => {
        expect(() => applyPatch({ a: {} }, [{ op: 'replace', path: '/b/c', value: 1 }])).toThrow();
    });
});

describe('getLiveFeed (diffPatch incremental)', () => {
    const liveDoc = () => ({
        metaData: { timeStamp: '20261009_200000' },
        gameData: { status: { abstractGameState: 'Live' } },
        liveData: { linescore: { balls: 0 } }
    });

    it('baja completo, luego aplica cambios, reconoce "sin cambios" y vuelve a completo si algo falla', async () => {
        const calls = [];
        let diffResponse = [];
        http.mlbGet = async (url, params) => {
            calls.push(url.endsWith('diffPatch') ? `diff:${params.startTimecode}` : 'full');
            return url.endsWith('diffPatch') ? diffResponse : liveDoc();
        };

        const first = await getLiveFeed(1);
        expect(first.mode).toBe('full');

        const unchanged = await getLiveFeed(1);
        expect(unchanged).toMatchObject({ mode: 'unchanged', version: first.version });

        diffResponse = [{ diff: [{ op: 'replace', path: '/metaData/timeStamp', value: '20261009_200010' }, { op: 'replace', path: '/liveData/linescore/balls', value: 2 }] }];
        const patched = await getLiveFeed(1);
        expect(patched.mode).toBe('patch');
        expect(patched.version).toBe(first.version + 1);
        expect(patched.doc.liveData.linescore.balls).toBe(2);

        // Cambios que no mueven el timecode: se descartan y se baja completo (nunca quedarse con datos viejos)
        diffResponse = [{ diff: [{ op: 'replace', path: '/liveData/linescore/balls', value: 3 }] }];
        const recovered = await getLiveFeed(1);
        expect(recovered.mode).toBe('full');

        diffResponse = [{ unexpected: true }];
        expect((await getLiveFeed(1)).mode).toBe('full');

        expect(calls).toEqual(['full', 'diff:20261009_200000', 'diff:20261009_200000', 'diff:20261009_200010', 'full', 'diff:20261009_200000', 'full']);
    });

    it('peticiones simultáneas del mismo juego hacen una sola llamada a MLB', async () => {
        let count = 0;
        http.mlbGet = async () => {
            count += 1;
            await new Promise((resolve) => setTimeout(resolve, 10));
            return liveDoc();
        };
        await Promise.all([getLiveFeed(2), getLiveFeed(2), getLiveFeed(2)]);
        expect(count).toBe(1);
    });
});

describe('cached', () => {
    beforeEach(() => clearCache());

    it('sirve el último valor bueno si MLB falla', async () => {
        let fail = false;
        const load = () => cached('k', 0, async () => {
            if (fail) throw new Error('caída');
            return 'ok';
        });
        expect(await load()).toBe('ok');
        fail = true;
        expect(await load()).toBe('ok');
    });
});

describe('posiciones y líderes con datos reales de LIDOM 2025', () => {
    const routes = (overrides = {}) => async (url, params) => {
        if (url.endsWith('/league/131')) return { leagues: [{ season: '2025', numGames: 50 }] };
        if (url.endsWith('/standings')) {
            return params.standingsTypes === 'regularSeason' ? fixture('standings-lidom-2025-regular') : fixture('standings-lidom-2025-postseason');
        }
        if (url.endsWith('/schedule')) return fixture('schedule-lidom-2025-final');
        if (url.endsWith('/stats')) return overrides.stats ? overrides.stats(params) : { stats: [{ splits: [] }] };
        throw new Error(`sin ruta ${url}`);
    };

    it('calcula juegos detrás, cuenta la serie final y detecta la fase', async () => {
        http.mlbGet = routes();
        const standings = await fetchStandings('lidom');
        expect(standings.season).toBe(2025);
        expect(standings.regular[0]).toMatchObject({ rank: 1, wins: 32, losses: 17, gamesBack: '-' });
        expect(standings.regular[0].team.name).toBe('Águilas Cibaeñas');
        expect(standings.regular[1].gamesBack).toBe('5');
        expect(standings.roundRobinInfo.games).toBe(18);
        expect(standings.final[0]).toMatchObject({ wins: 4, losses: 1 }); // Escogido campeón; los pospuestos no cuentan
        expect(standings.activePhase).toBe('final');
    });

    it('si la temporada nueva no ha empezado, muestra la anterior marcada', async () => {
        const empty = { records: [{ teamRecords: fixture('standings-lidom-2025-regular').records[0].teamRecords.map((r) => ({ ...r, wins: 0, losses: 0 })) }] };
        http.mlbGet = async (url, params) => {
            if (url.endsWith('/league/131')) return { leagues: [{ season: '2026', numGames: 50 }] };
            if (url.endsWith('/standings')) {
                if (params.season === 2026) return params.standingsTypes === 'regularSeason' ? empty : { records: [] };
                return params.standingsTypes === 'regularSeason' ? fixture('standings-lidom-2025-regular') : fixture('standings-lidom-2025-postseason');
            }
            if (url.endsWith('/schedule')) return params.season === 2026 ? { dates: [] } : fixture('schedule-lidom-2025-final');
            throw new Error(url);
        };
        const standings = await fetchStandings('lidom');
        expect(standings).toMatchObject({ season: 2025, isPreviousSeason: true });
    });

    it('los promedios con la misma regla de calificado que Estadísticas, y sin líderes en 0', async () => {
        const pools = {};
        const split = (id, name, stat) => ({ player: { id, fullName: name }, team: { id: 667, name: 'Águilas' }, stat });
        http.mlbGet = routes({
            stats: (params) => {
                pools[params.sortStat] = params.playerPool;
                if (params.sortStat === 'battingAverage') {
                    const real = fixture('stats-avg-qualified');
                    // Un 1.000 en 3 apariciones va primero en MLB y no califica (2 por juego del equipo, al menos 5)
                    real.stats[0].splits.unshift(split(1, 'Emil Morales', { avg: '1.000', plateAppearances: 3, atBats: 3, hits: 3 }));
                    return real;
                }
                if (params.sortStat === 'saves') return { stats: [{ splits: [split(2, 'Cerrador', { saves: 3 }), split(3, 'Sin salvados', { saves: 0 })] }] };
                return { stats: [{ splits: [] }] };
            }
        });
        const leaders = await fetchLeaders('lidom');
        // (la de los equipos, para los juegos jugados, no lleva sortStat)
        expect(Object.entries(pools).filter(([sortStat]) => sortStat !== 'undefined').every(([, pool]) => pool === 'ALL')).toBe(true);
        const avg = leaders.categories.find((category) => category.id === 'battingAverage');
        expect(avg.leaders[0]).toMatchObject({ rank: 1, name: 'Ismael Munguia', value: '.368', extra: { ab: 136, h: 50 } });
        expect(avg.leaders.some((leader) => leader.name === 'Emil Morales')).toBe(false);
        expect(leaders.categories.find((category) => category.id === 'saves').leaders.map((leader) => leader.name)).toEqual(['Cerrador']);
    });
});

describe('datos simulados (MLB_MOCK)', () => {
    it('el juego en vivo simulado se transforma igual que uno real', () => {
        const mock = require('../mock');
        const today = new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
        const live = mock.gamesForDay(today).find((game) => game.mode === 'live');
        const game = transformGame(mock.buildFeed(live));
        expect(game.state).toBe('live');
        expect(game.matchup?.pitcher.name).toBeTruthy();
        expect(game.atBats.length).toBeGreaterThan(10);
    });
});

describe('grupos del Clásico calculados desde los juegos', () => {
    it('cuenta ganados/perdidos por grupo y desempata por diferencia de carreras', () => {
        const { poolsFromGames } = require('../services/mlbService');
        const team = (id, name, abbreviation) => ({ id, name, abbreviation });
        const game = (pool, away, home, awayScore, homeScore, state = 'Final') => ({
            description: pool,
            status: { abstractGameState: state },
            teams: {
                away: { team: away, score: awayScore, isWinner: state === 'Final' ? awayScore > homeScore : undefined },
                home: { team: home, score: homeScore, isWinner: state === 'Final' ? homeScore > awayScore : undefined }
            }
        });
        const dom = team(805, 'Dominican Republic', 'DOM');
        const ven = team(944, 'Venezuela', 'VEN');
        const ned = team(878, 'Netherlands', 'NED');
        const pools = poolsFromGames(
            [game('Pool D', dom, ven, 5, 1), game('Pool D', ven, ned, 9, 2), game('Pool D', ned, dom, 0, 3), game('Pool D', ven, dom, 0, 0, 'Preview')],
            'wbc'
        );
        expect(Object.keys(pools)).toEqual(['Pool D']);
        expect(pools['Pool D'].map((row) => `${row.team.abbrev} ${row.wins}-${row.losses} ${row.gamesBack}`)).toEqual(['DOM 2-0 -', 'VEN 1-1 1', 'NED 0-2 2']);
    });
});

describe('diffPatch con los casos reales de producción (juego 867717)', () => {
    const base = () => ({
        metaData: { timeStamp: '20261009_203823', gameEvents: [] },
        gameData: { status: { abstractGameState: 'Live' } },
        liveData: { linescore: { balls: 0 }, plays: { allPlays: [{ pitchIndex: [1], playEvents: [{ n: 1 }] }] } }
    });

    it('salta fallos en campos sin uso y sigue por parche', async () => {
        http.mlbGet = async (url) =>
            url.endsWith('diffPatch')
                ? [{ diff: [
                    { op: 'replace', path: '/metaData/timeStamp', value: '20261009_203838' },
                    { op: 'replace', path: '/metaData/gameEvents/0', value: 'pitch' },
                    { op: 'remove', path: '/liveData/plays/allPlays/0/pitchIndex/2' },
                    { op: 'replace', path: '/liveData/linescore/balls', value: 1 }
                ] }]
                : base();
        await getLiveFeed(3);
        const result = await getLiveFeed(3);
        expect(result.mode).toBe('patch');
        expect(result.doc.liveData.linescore.balls).toBe(1);
    });

    it('si falla un campo que sí se usa, baja el feed completo', async () => {
        let fullCalls = 0;
        http.mlbGet = async (url) => {
            if (url.endsWith('diffPatch')) {
                return [{ diff: [
                    { op: 'replace', path: '/metaData/timeStamp', value: '20261009_203838' },
                    { op: 'replace', path: '/liveData/plays/allPlays/0/playEvents/5', value: { n: 6 } }
                ] }];
            }
            fullCalls += 1;
            return base();
        };
        await getLiveFeed(4);
        expect((await getLiveFeed(4)).mode).toBe('full');
        expect(fullCalls).toBe(2);
    });

    it('cada 3 minutos se resincroniza con el feed completo', async () => {
        const realNow = Date.now;
        let now = realNow();
        Date.now = () => now;
        try {
            const calls = [];
            http.mlbGet = async (url) => {
                calls.push(url.endsWith('diffPatch') ? 'diff' : 'full');
                return url.endsWith('diffPatch') ? [] : base();
            };
            await getLiveFeed(5);
            await getLiveFeed(5);
            now += 4 * 60 * 1000;
            expect((await getLiveFeed(5)).mode).toBe('full');
            expect(calls).toEqual(['full', 'diff', 'full']);
        } finally {
            Date.now = realNow;
        }
    });

    it('applyPatch informa cuántas operaciones saltó', () => {
        const doc = { metaData: { gameEvents: [] }, a: 1 };
        const { skipped } = applyPatch(doc, [{ op: 'replace', path: '/metaData/gameEvents/0', value: 'x' }, { op: 'replace', path: '/a', value: 2 }], {
            ignorable: (path) => path.startsWith('/metaData/')
        });
        expect(skipped).toBe(1);
        expect(doc.a).toBe(2);
        expect(() => applyPatch(doc, [{ op: 'replace', path: '/b/c', value: 1 }], { ignorable: () => false })).toThrow();
    });
});

describe('jugada del juego con datos reales', () => {
    it('detecta el grand slam de Valdez en la novena', async () => {
        const { keyPlayOf } = await import('../../src/lib/baseball');
        const game = transformGame(fixture('feed-826279'));
        const key = keyPlayOf(game.atBats, 'es');
        expect(key.headline).toBe('Grand slam de Enmanuel Valdez');
        expect(key.detail).toContain('Alta 9');
        expect(key.detail).toContain('102.2 mph');
        expect(key.detail).toContain('4 CI');
    });
});

describe('juego en un estadio sin rastreo (826244, Francisco Micheli)', () => {
    const game = transformGame(fixture('feed-826244-sin-rastreo'));
    const pitches = game.atBats.flatMap((atBat) => atBat.pitches);

    it('sin velocidad ni tipo, pero con la ubicación aproximada del anotador', () => {
        expect(pitches.length).toBeGreaterThan(250);
        expect(pitches.every((pitch) => pitch.mph === null && pitch.type === null)).toBe(true);
        const located = pitches.filter((pitch) => pitch.x !== null && pitch.z !== null);
        expect(located.length).toBeGreaterThanOrEqual(pitches.length - 5);
        expect(located.every((pitch) => pitch.est === true)).toBe(true);
        expect(pitches.every((pitch) => ['ball', 'strike', 'inplay', 'hbp'].includes(pitch.r))).toBe(true);
        expect(pitches.filter((pitch) => pitch.b !== null && pitch.s !== null).length).toBe(pitches.length);
    });
});

describe('fotos con el uniforme del equipo (roster de los Toros 2026-27)', () => {
    const { parseTeam, nameKey, SOURCES } = require('../services/teamPhotos');
    const html = gunzipSync(readFileSync(path.join(dir, 'fixtures', 'toros-roster-2026.html.gz'))).toString('utf8');
    const files = parseTeam(html, SOURCES[668]);

    it('lee las 88 fotos del roster con la clave del nombre', () => {
        expect(Object.keys(files)).toHaveLength(88);
        expect(files.jhonnunez).toBe('jhon-nunez.jpg');
        expect(files.bryandelacruz).toBeDefined();
    });

    it('la clave ignora acentos, mayúsculas, espacios y Jr.', () => {
        expect(nameKey('Jhon Núñez')).toBe('jhonnunez');
        expect(nameKey('Bryan De La Cruz')).toBe('bryandelacruz');
        expect(nameKey('Rudy Martin Jr.')).toBe('rudymartin');
    });

    it('las fotos se pueden mostrar desde otro origen (la app); el resto de la API sigue same-origin', async () => {
        const app = require('../app');
        const server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        const base = `http://127.0.0.1:${server.address().port}/api`;
        try {
            const photo = await fetch(`${base}/v2/photos/1/nadie.jpg`);
            expect(photo.status).toBe(404);
            expect(photo.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
            expect((await fetch(base)).headers.get('cross-origin-resource-policy')).toBe('same-origin');
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});

describe('mapa de batazos: dónde cayó cada bola en juego', () => {
    for (const [name, total] of [['feed-826279', 59], ['feed-826244-sin-rastreo', 50]]) {
        it(`${name}: todas las bolas en juego traen coordenadas, trayectoria y fuerza`, () => {
            const game = transformGame(fixture(name));
            const inPlay = game.atBats.flatMap((atBat) => atBat.pitches).filter((pitch) => pitch.hit);
            expect(inPlay).toHaveLength(total);
            expect(inPlay.every((pitch) => typeof pitch.hit.x === 'number' && typeof pitch.hit.y === 'number')).toBe(true);
            expect(inPlay.every((pitch) => pitch.hit.traj && pitch.hit.hard)).toBe(true);
        });
    }

    it('el simulador también las genera (para desarrollar con dev:mock)', () => {
        const mock = require('../mock');
        const [game] = mock.gamesForDay('2026-10-15'); // día pasado: juego completo
        const feed = mock.buildFeed(game);
        const hits = feed.liveData.plays.allPlays.flatMap((play) => play.playEvents).filter((event) => event.hitData);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.every((event) => typeof event.hitData.coordinates?.coordX === 'number')).toBe(true);
    });
});

describe('ubicación del pitcheo sin rastreo (coordenadas del anotador en Gameday)', () => {
    it('en un juego con rastreo, la conversión cae a centímetros de la medida real', () => {
        const feed = fixture('feed-826279');
        const real = transformGame(feed).atBats.flatMap((atBat) => atBat.pitches);
        // El mismo juego sin pX/pZ: solo queda lo que marca el anotador
        for (const play of feed.liveData.plays.allPlays) {
            for (const event of play.playEvents) {
                if (event.pitchData?.coordinates) {
                    delete event.pitchData.coordinates.pX;
                    delete event.pitchData.coordinates.pZ;
                }
            }
        }
        const approx = transformGame(feed).atBats.flatMap((atBat) => atBat.pitches);
        let dx = 0, dz = 0, agree = 0, n = 0;
        const inZone = (p) => Math.abs(p.x) <= 0.83 && p.z >= p.bot && p.z <= p.top;
        real.forEach((pitch, i) => {
            const guess = approx[i];
            if (pitch.x === null || guess.x === null) return;
            n += 1;
            dx += Math.abs(pitch.x - guess.x);
            dz += Math.abs(pitch.z - guess.z);
            if (inZone(pitch) === inZone(guess)) agree += 1;
            expect(guess.est).toBe(true);
            expect(pitch.est).toBeUndefined();
        });
        expect(n).toBeGreaterThan(270);
        expect(dx / n).toBeLessThan(0.05);
        expect(dz / n).toBeLessThan(0.12);
        expect(agree / n).toBeGreaterThan(0.93);
    });

    it('juego en vivo de LIDOM 2026-27 sin rastreo (851491, Quisqueya): todos los pitcheos tienen ubicación', () => {
        const game = transformGame(fixture('feed-851491-vivo-sin-rastreo'));
        const pitches = game.atBats.flatMap((atBat) => atBat.pitches);
        expect(game.state).toBe('live');
        expect(pitches.length).toBeGreaterThan(15);
        expect(pitches.every((pitch) => pitch.x !== null && pitch.z !== null && pitch.est)).toBe(true);
        expect(pitches.every((pitch) => Math.abs(pitch.x) < 4 && pitch.z > -1 && pitch.z < 7)).toBe(true);
    });
});

describe('bateadores y corredores emergentes', () => {
    it('cada cambio ofensivo trae quién entra, a quién sustituye y si es PH o PR (826279)', () => {
        const subs = transformGame(fixture('feed-826279')).atBats.flatMap((atBat) => atBat.actions.filter((action) => action.sub).map((action) => ({ i: atBat.i, ...action.sub })));
        expect(subs.map((sub) => sub.pos)).toEqual(['PR', 'PH', 'PH', 'PR', 'PH']);
        expect(subs[1]).toMatchObject({ i: 65, in: { id: 501659, name: 'Abraham Almonte' }, out: { id: 660710, name: 'Rodolfo Durán' } });
    });
});

describe('fantasy: puntos con el box score de MLB', () => {
    const { batterPoints, pitcherPoints, playersFromFeed } = require('../services/fantasy');

    it('bateador: sencillo 3, doble 5, triple 8, jonrón 10, carrera 2, impulsada 2, BB 2, golpeado 2, robo 5, ponche −1', () => {
        expect(batterPoints({ hits: 3, doubles: 1, homeRuns: 1, runs: 2, rbi: 4, baseOnBalls: 1, stolenBases: 1, strikeOuts: 1 })).toBe(3 + 5 + 10 + 4 + 8 + 2 + 5 - 1);
        expect(batterPoints({})).toBe(0);
    });

    it('lanzador: out 1, ponche 2, victoria 5, salvado 5, limpia −2, hit −0.5, BB −0.5', () => {
        expect(pitcherPoints({ outs: 15, strikeOuts: 9, earnedRuns: 1, hits: 3, baseOnBalls: 0 })).toBe(15 + 18 - 2 - 1.5);
        expect(pitcherPoints({ outs: 3, strikeOuts: 1, saves: 1, hits: 1, baseOnBalls: 1 })).toBe(3 + 2 + 5 - 0.5 - 0.5);
    });

    it('juego real (826279): todo el roster, quién jugó y sus puntos', () => {
        const players = playersFromFeed(fixture('feed-826279'), 826279, true);
        const cano = players.find((p) => p.name === 'Robinson Canó');
        expect(players.length).toBeGreaterThan(80);
        expect(cano).toMatchObject({ role: 'B', played: true, line: { ab: 4, h: 1, d: 1, r: 1 }, points: 5 + 2 });
        expect(players.find((p) => p.name === 'Andy Otero')).toMatchObject({ role: 'P', played: true, line: { outs: 15, k: 4 } });
    });
});

describe('fantasy: perfil del fanático y tabla de la temporada', () => {
    const fantasy = require('../services/fantasy');
    const env = require('../utils/env');
    const fans = require('../services/fantasyFans');
    const { dayResult, toEntry } = require('../services/fantasyScore');
    const app = require('../app');

    const realDay = fantasy.fantasyDay;
    const realConfig = env.supabaseConfig;
    const realFetch = globalThis.fetch;
    afterEach(() => {
        fantasy.fantasyDay = realDay;
        env.supabaseConfig = realConfig;
        globalThis.fetch = realFetch;
    });

    const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    const B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    const D = 'dddddddd-4444-4444-8444-dddddddddddd';
    const F = 'ffffffff-6666-4666-8666-ffffffffffff';
    const TODAY = '2026-10-17';

    const game = (gamePk, state, away, home, winner = null) => ({ gamePk, state, away: { id: away, isWinner: winner === away }, home: { id: home, isWinner: winner === home } });
    const player = (id, points) => ({ id, name: `P${id}`, teamId: 672, gamePk: 1, role: 'B', pos: 'SS', starter: true, played: points !== 0, line: null, points });
    // Días inventados: 13 y 15 terminados, 14 sin juegos, 16 en vivo, 17 (hoy) por empezar; marzo es de la temporada anterior
    const DAYS = {
        '2026-03-01': { games: [game(9, 'final', 672, 667, 672)], players: [player(10, 5)] },
        '2026-10-13': { games: [game(6, 'final', 672, 667, 672), game(7, 'final', 669, 671, 671)], players: [player(11, 4)] },
        '2026-10-14': { games: [], players: [] },
        '2026-10-15': { games: [game(1, 'final', 672, 667, 672), game(2, 'final', 669, 671, 671)], players: [player(10, 6.5), player(11, 4), player(12, -1)] },
        '2026-10-16': { games: [game(3, 'live', 672, 669), game(4, 'final', 667, 671, 667)], players: [player(10, 3), player(11, 2.2)] },
        '2026-10-17': { games: [game(5, 'preview', 672, 667)], players: [player(10, 0), player(11, 0)] }
    };
    const calls = {};
    let active = 0;
    let maxActive = 0;
    const fakeDay = async (league, date) => {
        calls[date] = (calls[date] || 0) + 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { league, date, teams: {}, scoring: {}, ...(DAYS[date] || { games: [], players: [] }) };
    };

    const ROWS = [
        { user_id: A, day: '2026-10-18', lineup: [10], captain: null, picks: {} }, // mañana: no cuenta
        { user_id: A, day: '2026-10-17', lineup: [10], captain: 10, picks: { 5: 672 } },
        { user_id: A, day: '2026-10-16', lineup: [10, 11], captain: 11, picks: { 3: 672, 4: 667 } },
        { user_id: A, day: '2026-10-15', lineup: [10, 11, 12, 999], captain: 10, picks: { 1: 672, 2: 669 } },
        { user_id: A, day: '2026-10-14', lineup: [10], captain: null, picks: {} },
        { user_id: A, day: '2026-03-01', lineup: [10], captain: null, picks: { 9: 672 } },
        { user_id: D, day: '2026-10-17', lineup: [11], captain: null, picks: {} },
        { user_id: 'cccccccc-3333-4333-8333-cccccccccccc', day: '2026-10-16', lineup: [], captain: null, picks: {} }, // vacío: no cuenta
        // Relleno para pasar de 1000 filas (van de la más nueva a la más vieja): B solo aparece en la segunda página
        ...Array.from({ length: 1200 }, () => ({ user_id: F, day: '2026-10-14', lineup: [10], captain: null, picks: {} })),
        { user_id: B, day: '2026-10-13', lineup: [11], captain: 11, picks: { 6: 672, 7: 671 } }
    ];
    const PROFILES = { [A]: 'Ana', [D]: 'Darío' };
    // Filas que agrega cada prueba (se vacían en setup)
    const EXTRA = [];

    // Supabase de mentira como PostgREST: filtra por usuario y día, ordena, respeta limit y Range (con su max-rows),
    // da Content-Range con el total si se pide count=exact y anota cada petición
    const requests = [];
    let maxRows = 1000;
    const fakeSupabase = async (url, init = {}) => {
        const u = new URL(url);
        const headers = init.headers || {};
        requests.push({ path: u.pathname, search: u.search, headers });
        const json = (data, extra = {}) => ({ ok: true, status: 200, headers: new Headers(extra), json: async () => data });
        if (u.pathname.endsWith('/profiles')) {
            const ids = (u.searchParams.get('id') || '').replace(/^eq\.|^in\.\(|\)$/g, '').split(',');
            return json(ids.filter((id) => PROFILES[id]).map((id) => ({ id, display_name: PROFILES[id] })));
        }
        const user = u.searchParams.get('user_id')?.replace('eq.', '');
        const filters = u.searchParams.getAll('day').map((value) => value.split('.'));
        let rows = [...ROWS, ...EXTRA].filter((row) => (!user || row.user_id === user) && filters.every(([op, day]) => (op === 'gte' ? row.day >= day : op === 'lte' ? row.day <= day : row.day === day)));
        const order = u.searchParams.get('order') || '';
        if (order.startsWith('day.desc')) rows.sort((a, b) => b.day.localeCompare(a.day) || a.user_id.localeCompare(b.user_id));
        if (order.startsWith('day.asc')) rows.sort((a, b) => a.day.localeCompare(b.day) || a.user_id.localeCompare(b.user_id));
        const total = rows.length;
        if (u.searchParams.get('limit')) rows = rows.slice(0, Number(u.searchParams.get('limit')));
        let from = 0;
        let to = rows.length - 1;
        if (headers.Range) [from, to] = headers.Range.split('-').map(Number);
        rows = rows.slice(from, Math.min(to, from + maxRows - 1) + 1);
        const count = /count=exact/.test(headers.Prefer || '') ? total : '*';
        return json(rows, { 'content-range': rows.length ? `${from}-${from + rows.length - 1}/${count}` : `*/${count}` });
    };

    const setup = () => {
        clearCache();
        for (const key of Object.keys(calls)) delete calls[key];
        active = 0;
        maxActive = 0;
        maxRows = 1000;
        requests.length = 0;
        EXTRA.length = 0;
        fantasy.fantasyDay = fakeDay;
        env.supabaseConfig = () => ({ url: 'https://supabase.test', key: 'sb_publishable_prueba' });
        globalThis.fetch = fakeSupabase;
        http.mlbGet = async (url) => {
            if (url.endsWith('/league/131')) return { leagues: [{ season: '2026', numGames: 50 }] };
            throw new Error(`sin ruta ${url}`);
        };
    };

    it('puntos iguales a la app: capitán ×1,5 redondeado, pelotero desconocido 0 y pronóstico acertado 10', () => {
        const entry = toEntry({ lineup: [10, 11, 12, 999], captain: 10, picks: { 1: 672, 2: 669 } });
        expect(dayResult(DAYS['2026-10-15'], entry)).toEqual({ lineup: [10, 11, 12, 999], captain: 10, final: true, live: false, started: true, team: 12.8, picks: 10, total: 22.8, picksMade: 2 });
        // En vivo: el pronóstico del juego sin terminar queda pendiente
        const live = dayResult(DAYS['2026-10-16'], toEntry({ lineup: [10, 11], captain: 11, picks: { 3: 672, 4: 667 } }));
        expect(live).toMatchObject({ final: false, live: true, team: 6.3, picks: 10, total: 16.3 });
    });

    it('perfil: días del más reciente al más viejo, hoy sin juegos empezados cuenta 0 y la temporada suma solo días empezados', async () => {
        setup();
        const { data, live } = await fans.fanSummary('lidom', A, { today: TODAY });
        expect(data).toMatchObject({ userId: A, league: 'lidom', name: 'Ana' });
        expect(data.days.map((day) => day.date)).toEqual(['2026-10-17', '2026-10-16', '2026-10-15', '2026-10-14', '2026-03-01']);
        expect(data.days[0]).toEqual({ date: '2026-10-17', final: false, live: false, team: 0, picks: 0, total: 0, lineup: [10], captain: 10, picksMade: 1 });
        expect(data.days[1]).toMatchObject({ live: true, final: false, total: 16.3 });
        expect(data.days[2]).toMatchObject({ final: true, team: 12.8, picks: 10, total: 22.8, lineup: [10, 11, 12, 999], captain: 10, picksMade: 2 });
        expect(data.days[3]).toMatchObject({ final: false, live: false, total: 0, picksMade: 0 }); // día sin juegos
        expect(data.days[4]).toMatchObject({ final: true, total: 15 }); // temporada anterior: aparece pero no suma
        expect(data.season).toEqual({ points: 39.1, days: 2, best: { date: '2026-10-15', points: 22.8 } });
        expect(live).toBe(true);
        // La llave publishable va solo en apikey (no es un JWT)
        expect(requests.every((request) => request.headers.apikey === 'sb_publishable_prueba' && !request.headers.Authorization)).toBe(true);
    });

    it('perfil de alguien sin equipos: sin días y temporada en 0', async () => {
        setup();
        const { data } = await fans.fanSummary('lidom', 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee', { today: TODAY });
        expect(data).toEqual({ userId: 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee', league: 'lidom', name: null, season: { points: 0, days: 0, best: null }, days: [] });
    });

    it('tabla de la temporada: ordenada, paginada con Range y cada día calculado una vez (máx. 3 a la vez)', async () => {
        setup();
        const data = await fans.seasonRanking('lidom', { today: TODAY });
        expect(data).toMatchObject({ league: 'lidom', season: 2026, partial: false });
        expect(data.ranking.slice(0, 2)).toEqual([
            { userId: A, name: 'Ana', points: 39.1, days: 2 },
            { userId: B, name: null, points: 6 + 10 + 10, days: 1 }
        ]);
        // F tiene 1200 filas del mismo día (como dos páginas que se pisan): cuenta una vez
        expect(data.ranking.map((row) => row.userId)).toEqual([A, B, D, F]);
        expect(data.ranking[2]).toEqual({ userId: D, name: 'Darío', points: 0, days: 0 });
        const entries = requests.filter((request) => request.path.endsWith('/fantasy_entries'));
        expect(entries.map((request) => request.headers.Range)).toEqual(['0-999', '1000-1999']);
        expect(entries[0].search).toContain('day=gte.2026-09-01');
        expect(entries[0].search).toContain('day=lte.2026-10-17');
        // De la más nueva a la más vieja: si hay que cortar, se pierden los días viejos
        expect(entries[0].search).toContain('order=day.desc');
        expect(calls).toEqual({ '2026-10-13': 1, '2026-10-14': 1, '2026-10-15': 1, '2026-10-16': 1, '2026-10-17': 1 });
        expect(maxActive).toBeLessThanOrEqual(3);
        // La segunda vez sale del caché
        await fans.seasonRanking('lidom', { today: TODAY });
        expect(requests.filter((request) => request.path.endsWith('/fantasy_entries'))).toHaveLength(2);
    });

    it('tabla de la temporada: no supone el max-rows de Supabase (con páginas de 500 también trae todo)', async () => {
        setup();
        maxRows = 500;
        const data = await fans.seasonRanking('lidom', { today: TODAY });
        expect(data.ranking.map((row) => row.userId)).toEqual([A, B, D, F]);
        expect(data.partial).toBe(false);
        expect(requests.filter((request) => request.path.endsWith('/fantasy_entries')).map((request) => request.headers.Range)).toEqual(['0-999', '500-1499', '1000-1999']);
    });

    it('perfil con más de 60 días en la temporada: suma lo mismo que la tabla de la temporada', async () => {
        setup();
        const H = '12345678-7777-4777-8777-123456789abc';
        // Juega todos los días del 1 de septiembre al 20 de diciembre (111 días), 1 punto por día
        for (let i = 0; i < 111; i++) EXTRA.push({ user_id: H, day: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), lineup: [10], captain: null, picks: {} });
        EXTRA.push({ user_id: H, day: '2026-12-21', lineup: [10], captain: null, picks: {} }); // mañana: no cuenta
        fantasy.fantasyDay = async (league, date) => ({ league, date, teams: {}, scoring: {}, games: [game(100, 'final', 672, 667, 672)], players: [player(10, 1)] });
        const { data } = await fans.fanSummary('lidom', H, { today: '2026-12-20' });
        expect(data.season).toEqual({ points: 111, days: 111, best: { date: '2026-12-20', points: 1 } });
        expect(data.days).toHaveLength(40);
        expect(data.days[0].date).toBe('2026-12-20');
        const season = await fans.seasonRanking('lidom', { today: '2026-12-20' });
        expect(season.ranking.find((row) => row.userId === H)).toMatchObject({ points: data.season.points, days: data.season.days });
    });

    it('tabla de la temporada con users: esas cuentas con su puesto aunque no entren en el top 200', async () => {
        setup();
        // 205 cuentas con 6.5 puntos dejan a D y a F fuera del top 200
        for (let i = 0; i < 205; i++) EXTRA.push({ user_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, day: '2026-10-15', lineup: [10], captain: null, picks: {} });
        const top = await fans.seasonRanking('lidom', { today: TODAY });
        expect(top.ranking).toHaveLength(200);
        expect(top.ranking.some((row) => row.userId === D)).toBe(false);
        const picked = await fans.seasonRanking('lidom', { today: TODAY, users: [B, D] });
        expect(picked.ranking).toEqual([
            { userId: B, name: null, points: 26, days: 1, rank: 2 },
            { userId: D, name: 'Darío', points: 0, days: 0, rank: 208 }
        ]);
    });

    it('perfil y tabla: lo cambiado después de empezar el juego no cuenta (historial de la base)', async () => {
        setup();
        const C = 'cccccccc-9999-4999-8999-cccccccccccc';
        const start = Date.parse('2026-10-15T23:00:00Z');
        const hour = 3600000;
        fantasy.fantasyDay = async (league, date) =>
            date === '2026-10-15' ? { league, date, teams: {}, scoring: {}, games: [{ ...game(1, 'final', 672, 667, 672), date: '2026-10-15T23:00:00Z' }], players: [player(10, 6.5), player(11, 4)] } : fakeDay(league, date);
        // Metió a 11, le pasó la banda y cambió el pronóstico cuando el juego ya había empezado
        EXTRA.push({
            user_id: C,
            day: '2026-10-15',
            lineup: [10, 11],
            captain: 11,
            picks: { 1: 672 },
            history: { v: 1, players: { 10: [[start - hour, null]], 11: [[start + 60000, null]] }, captain: [[10, start - hour], [11, start + 60000]], picks: { 1: [[667, start - hour], [672, start + 60000]] } }
        });
        const { data } = await fans.fanSummary('lidom', C, { today: TODAY });
        expect(data.days[0]).toMatchObject({ date: '2026-10-15', lineup: [10], captain: 10, team: 9.8, picks: 0, total: 9.8 });
        const season = await fans.seasonRanking('lidom', { today: TODAY });
        expect(season.ranking.find((row) => row.userId === C)).toMatchObject({ points: 9.8, days: 1 });
        // Se pide con select=* para traer history (y no fallar si la base todavía no tiene la columna)
        expect(requests.filter((request) => request.path.endsWith('/fantasy_entries')).every((request) => request.search.includes('select=*'))).toBe(true);
    });

    it('un día viejo ya terminado se guarda una semana; hoy, una hora; incompleto, 30 s', () => {
        const done = { games: [game(1, 'final', 672, 667, 672)], players: [] };
        const old = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
        const today = fans.todayIn('America/Santo_Domingo');
        expect(fans.dayTtlOn('lidom', old, done)).toBe(7 * 86400);
        expect(fans.dayTtlOn('lidom', today, done)).toBe(3600);
        expect(fans.dayTtlOn('lidom', old, { ...done, incomplete: true })).toBe(30);
        expect(fans.dayTtlOn('lidom', old, { games: [game(1, 'live', 672, 667)], players: [] })).toBe(20);
    });

    it('si se acaba el tiempo, devuelve lo calculado y avisa con partial', async () => {
        setup();
        fantasy.fantasyDay = async (league, date) => (date === '2026-10-15' ? new Promise(() => {}) : fakeDay(league, date));
        const { days, partial } = await fans.computeDays('lidom', ['2026-10-16', '2026-10-15', '2026-10-14'], { deadline: Date.now() + 100 });
        expect(partial).toBe(true);
        expect([...days.keys()].sort()).toEqual(['2026-10-14', '2026-10-16']);
    });

    it('rutas: uuid inválido 400, sin Supabase 503 y Cache-Control', async () => {
        setup();
        const server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        const base = `http://127.0.0.1:${server.address().port}/api/v2/fantasy`;
        try {
            const bad = await realFetch(`${base}/fan/123?league=lidom`);
            expect(bad.status).toBe(400);
            expect(await bad.json()).toEqual({ error: 'invalid_user' });

            const fan = await realFetch(`${base}/fan/${A}?league=lidom`);
            expect(fan.status).toBe(200);
            expect(fan.headers.get('cache-control')).toMatch(/s-maxage=(60|300)\b/);
            expect(await fan.json()).toMatchObject({ userId: A, name: 'Ana' });

            const season = await realFetch(`${base}/season?league=lidom`);
            expect(season.status).toBe(200);
            expect(season.headers.get('cache-control')).toContain('s-maxage=300');

            const some = await realFetch(`${base}/season?league=lidom&users=${B.toUpperCase()},${D}`);
            expect((await some.json()).ranking.map((row) => row.userId)).toEqual([B, D]);
            expect((await realFetch(`${base}/season?league=lidom&users=${B},123`)).status).toBe(400);

            env.supabaseConfig = () => null;
            const off = await realFetch(`${base}/fan/${A}?league=lidom`);
            expect(off.status).toBe(503);
            expect(await off.json()).toEqual({ error: 'accounts_disabled' });
            expect((await realFetch(`${base}/season?league=lidom`)).status).toBe(503);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    describe('% elegido del día (como el «% drafted» de los fantasy)', () => {
        // Juego 20 (Escogido-Licey) empieza 20:00 UTC; juego 21 (Águilas-Gigantes) a medianoche: a las 22:00 solo el 20 está cerrado
        const OWN_DAY = '2026-10-12';
        const ownPlayer = (id, teamId, gamePk) => ({ ...player(id, 0), teamId, gamePk });
        const ownDay = {
            games: [
                { ...game(20, 'live', 672, 667), date: '2026-10-12T20:00:00Z' },
                { ...game(21, 'preview', 669, 671), date: '2026-10-13T00:00:00Z' }
            ],
            players: [ownPlayer(10, 672, 20), ownPlayer(11, 667, 20), ownPlayer(30, 669, 21)]
        };
        const ownRows = () => [
            { user_id: A, day: OWN_DAY, lineup: [10, 30], captain: 10, picks: { 20: 672, 21: 669 } },
            { user_id: B, day: OWN_DAY, lineup: [10, 11], captain: 11, picks: { 20: 667 } },
            { user_id: D, day: OWN_DAY, lineup: [], captain: null, picks: { 20: 672 } }, // solo pronosticó
            { user_id: F, day: OWN_DAY, lineup: [30], captain: 30, picks: {} }
        ];
        afterEach(() => delete DAYS[OWN_DAY]);

        it('solo de los juegos que ya empezaron, sobre los equipos con peloteros', async () => {
            setup();
            DAYS[OWN_DAY] = ownDay;
            EXTRA.push(...ownRows());
            const data = await fans.computeOwners('lidom', OWN_DAY, Date.parse('2026-10-12T22:00:00Z'));
            expect(data.teams).toBe(3);
            expect(data.players).toEqual([
                { id: 10, pct: 66.7, captainPct: 33.3 },
                { id: 11, pct: 33.3, captainPct: 33.3 }
            ]);
            // El 30 juega en el 21 (por empezar): no se ve; los pronósticos del 21 tampoco
            expect(data.picks).toEqual({ 20: { 672: 66.7, 667: 33.3 } });
            expect(data.partial).toBe(false);

            // Antes del primer juego no se ve nada
            const before = await fans.computeOwners('lidom', OWN_DAY, Date.parse('2026-10-12T19:00:00Z'));
            expect(before.players).toEqual([]);
            expect(before.picks).toEqual({});
        });

        it('cuenta el equipo que valía al cerrar: un cambio después del juego no suma', async () => {
            setup();
            DAYS[OWN_DAY] = ownDay;
            // Puso al 11 cuando el juego 20 ya había empezado: el historial dice que no estaba al cerrar
            const at = (iso) => Date.parse(iso);
            EXTRA.push({ user_id: A, day: OWN_DAY, lineup: [10, 11], captain: 10, picks: {}, history: { v: 1, players: { 10: [[at('2026-10-12T18:00:00Z'), null]], 11: [[at('2026-10-12T21:00:00Z'), null]] }, captain: [[10, at('2026-10-12T18:00:00Z')]] } });
            const data = await fans.computeOwners('lidom', OWN_DAY, Date.parse('2026-10-12T22:00:00Z'));
            expect(data.players.map((row) => row.id)).toEqual([10]);
        });

        it('ruta: fecha inválida 400, sin Supabase 503 y un minuto de caché', async () => {
            setup();
            DAYS[OWN_DAY] = ownDay;
            EXTRA.push(...ownRows());
            const server = app.listen(0);
            await new Promise((resolve) => server.once('listening', resolve));
            const base = `http://127.0.0.1:${server.address().port}/api/v2/fantasy/owners`;
            try {
                expect((await realFetch(`${base}?league=lidom&date=ayer`)).status).toBe(400);
                const ok = await realFetch(`${base}?league=lidom&date=${OWN_DAY}`);
                expect(ok.status).toBe(200);
                expect(ok.headers.get('cache-control')).toContain('s-maxage=60');
                // Ya pasaron los dos juegos: se ven todos
                expect((await ok.json()).players.map((row) => row.id).sort()).toEqual([10, 11, 30]);
                env.supabaseConfig = () => null;
                expect((await realFetch(`${base}?league=lidom&date=2026-10-11`)).status).toBe(503);
            } finally {
                await new Promise((resolve) => server.close(resolve));
            }
        });
    });
});

describe('fantasy sin trampas: cada juego con el equipo que había cuando empezó', () => {
    const { effectiveEntry, lockTime, teamPoints, pickPoints } = require('../services/fantasyScore');

    // Juego 1 a las 17:00 (terminado), juego 2 a las 19:00 (terminado, ganó 669) y juego 3 con hora por definir
    // (en vivo, primer lanzamiento 23:10). Horas en ms como las escribe la base.
    const at = (hhmm) => Date.parse(`2026-10-17T${hhmm}:00Z`);
    const g = (gamePk, date, state, away, home, winner, extra = {}) => ({ gamePk, date, state, startTimeTBD: false, away: { id: away, isWinner: winner === away }, home: { id: home, isWinner: winner === home }, ...extra });
    const p = (id, role, teamId, gamePk, points) => ({ id, name: `P${id}`, teamId, gamePk, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: true, line: null, points });
    const DAY = {
        league: 'lidom',
        date: '2026-10-17',
        teams: {},
        scoring: { batter: {}, pitcher: {} },
        games: [
            g(1, '2026-10-17T17:00:00Z', 'final', 672, 667, 672),
            g(2, '2026-10-17T19:00:00Z', 'final', 669, 671, 669),
            g(3, '2026-10-17T23:59:00Z', 'live', 668, 670, null, { startTimeTBD: true, firstPitch: '2026-10-17T23:10:00.000Z' })
        ],
        players: [p(10, 'B', 672, 1, 6), p(11, 'B', 669, 2, 4), p(12, 'P', 667, 1, -3), p(13, 'B', 671, 2, 8), p(14, 'B', 668, 3, 2), p(15, 'B', 670, 3, 1), p(16, 'B', 667, 1, 0), p(17, 'B', 671, 2, 5)]
    };
    const open = (hhmm) => [[at(hhmm), null]];
    const entry = (lineup, captain, picks, history) => ({ lineup, captain, picks, savedAt: 1, ...(history ? { history: { v: 1, ...history } } : {}) });

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
        const players = { 10: [[at('15:00'), at('18:00')]], 11: open('15:00'), 13: open('15:01'), 14: open('15:02'), 15: open('15:03'), 17: open('18:00') };
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

describe('fantasy con créditos: precio por pelotero y tope del equipo', () => {
    const { effectiveEntry, entryCost } = require('../services/fantasyScore');
    const prices = require('../services/fantasyPrices');
    const fantasy = require('../services/fantasy');

    const p = (id, role, teamId, price, points = 1) => ({ id, name: `P${id}`, teamId, gamePk: 1, role, pos: role === 'P' ? 'P' : 'SS', starter: true, played: true, line: null, points, price });
    const day = (credits = { budget: 50, min: 4, max: 12 }) => ({
        league: 'lidom',
        date: '2026-10-18',
        teams: {},
        scoring: {},
        games: [{ gamePk: 1, date: '2026-10-18T23:00:00Z', state: 'preview', startTimeTBD: false, away: { id: 1 }, home: { id: 2 } }],
        players: [p(1, 'B', 1, 12), p(2, 'B', 2, 12), p(3, 'B', 3, 12), p(4, 'B', 4, 12), p(5, 'B', 5, 4), p(6, 'P', 6, 6)],
        ...(credits ? { credits } : {})
    });

    it('con un solo juego en el día el máximo por equipo sube a 3 (6 peloteros entre 2 equipos)', () => {
        const { perTeamLimit } = require('../services/fantasyScore');
        expect(perTeamLimit(day())).toBe(3);
        expect(perTeamLimit({ games: [{ away: { id: 1 }, home: { id: 2 } }, { away: { id: 3 }, home: { id: 4 } }] })).toBe(2);
        // Tres del mismo equipo cuentan en un día de un solo juego
        const one = { ...day(null), players: [p(1, 'B', 1, 5), p(2, 'B', 1, 5), p(3, 'B', 1, 5), p(4, 'B', 1, 5)] };
        const history = { v: 1, players: { 1: [[1, null]], 2: [[2, null]], 3: [[3, null]], 4: [[4, null]] } };
        expect(effectiveEntry(one, { lineup: [1, 2, 3, 4], captain: null, picks: {}, history }).lineup).toEqual([1, 2, 3]);
    });

    it('proyección del día: puntos por juego (con las temporadas pasadas) según si batea de titular o le toca descansar', () => {
        const table = { ppg: { B: [[1, 6], [2, 3]], P: [[9, 10]] }, prior: { B: 2, P: 4 } };
        // Titular del último juego: no siempre batea hoy (×0,85)
        expect(prices.projectionOf(table, { id: 1, role: 'B', starter: true })).toBe(5.1);
        // Suplente: entra poco (×0,3)
        expect(prices.projectionOf(table, { id: 2, role: 'B', starter: false })).toBe(0.9);
        // Sin estadísticas: la mitad del «promedio bajo» de su rol
        expect(prices.projectionOf(table, { id: 5, role: 'B', starter: true })).toBe(0.9);
        // Lanzador sin sus salidas recientes: entra en 1 de cada 4 juegos; si abrió el último juego, hoy descansa
        expect(prices.projectionOf(table, { id: 9, role: 'P', starter: false })).toBe(2.5);
        expect(prices.projectionOf(table, { id: 9, role: 'P', starter: false, rest: true })).toBe(0.3);
        expect(prices.projectionOf(table, { id: 5, role: 'P', starter: false })).toBe(0.5);
        // Con sus salidas de los 10 días anteriores: le toca abrir (hace 5 o 6 días), descansa (2 a 4) o abrió hace más
        expect(prices.projectionOf(table, { id: 9, role: 'P', outings: 2, startedAgo: 5 })).toBe(6);
        expect(prices.projectionOf(table, { id: 9, role: 'P', outings: 2, startedAgo: 3 })).toBe(0.1);
        expect(prices.projectionOf(table, { id: 9, role: 'P', outings: 1, startedAgo: 8 })).toBe(3.5);
        expect(prices.projectionOf(table, { id: 9, role: 'P', outings: 2, startedAgo: 1, rest: true })).toBe(0.3);
        // Relevista que ha salido, y el que no ha lanzado en esos días
        expect(prices.projectionOf(table, { id: 9, role: 'P', outings: 3 })).toBe(3);
        expect(prices.projectionOf(table, { id: 9, role: 'P', outings: 0 })).toBe(1.5);
        // rateTable da los puntos por juego regresados y el «promedio bajo» de cada tabla
        const rated = prices.rateTable([{ table: new Map([[10, { points: 30, games: 3 }], [11, { points: 3, games: 3 }], [12, { points: 15, games: 3 }]]), weight: 1 }]);
        expect(rated.ppg.get(10)).toBeGreaterThan(rated.ppg.get(12));
        expect(rated.prior).toBeGreaterThan(0);
    });

    it('rotación: de los juegos de los 10 días anteriores, hace cuántos días abrió cada lanzador y en cuántos lanzó', () => {
        const games = [
            { date: '2026-10-14', time: '2026-10-14T23:00:00Z', pitchers: [1, 5, 6] },
            { date: '2026-10-16', time: '2026-10-16T23:00:00Z', pitchers: [2, 5] },
            { date: '2026-10-18', time: '2026-10-18T23:00:00Z', pitchers: [1, 6] }
        ];
        // Vengan en el orden que vengan, cuenta la última apertura
        const recent = fantasy.recentPitching([games[2], games[0], games[1]], '2026-10-20');
        expect(recent.get(1)).toEqual({ outings: 2, startedAgo: 2 });
        expect(recent.get(2)).toEqual({ outings: 1, startedAgo: 4 });
        expect(recent.get(5)).toEqual({ outings: 2 });
        expect(recent.has(7)).toBe(false);
        expect(prices.projectionKey({ role: 'P', outings: 1, startedAgo: 6 })).toBe('due');
        expect(prices.projectionKey({ role: 'P', outings: 2 })).toBe('reliever');
        expect(prices.projectionKey({ role: 'P' })).toBe('pitcher');
    });

    it('lo que cuesta un equipo', () => {
        expect(entryCost(day(), { lineup: [1, 2, 5, 6, 999] })).toBe(34);
    });

    it('sin historial: si se pasa del presupuesto sobran los últimos de la alineación (y su banda de capitán)', () => {
        const saved = { lineup: [1, 2, 3, 4, 5, 6], captain: 6, picks: {} };
        // 12×4 = 48; el 5 (4) ya no cabe y el lanzador (6) tampoco
        expect(effectiveEntry(day(), saved)).toEqual({ lineup: [1, 2, 3, 4], captain: null, picks: {} });
        // Un día sin créditos queda igual
        expect(effectiveEntry(day(null), saved)).toBe(saved);
        // Dentro del presupuesto queda igual
        const fine = { lineup: [1, 5, 6], captain: 1, picks: {} };
        expect(effectiveEntry(day(), fine)).toBe(fine);
    });

    it('con historial: sobra el que entró de último aunque esté antes en la alineación', () => {
        const history = { v: 1, players: { 1: [[1, null]], 2: [[2, null]], 3: [[3, null]], 6: [[4, null]], 4: [[5, null]], 5: [[6, null]] } };
        // Entraron 1, 2, 3 (36), el lanzador 6 (42), el 4 (54: no cabe) y el 5 (46)
        const saved = { lineup: [4, 1, 2, 3, 5, 6], captain: 4, picks: {}, history };
        expect(effectiveEntry(day(), saved)).toMatchObject({ lineup: [1, 2, 3, 5, 6], captain: null });
    });

    it('precio por percentil dentro del rol: de 4 a 12, de medio en medio, y las temporadas pasadas pesan menos', () => {
        const current = new Map([[10, { points: 30, games: 3 }], [11, { points: 3, games: 3 }], [12, { points: 15, games: 3 }]]);
        const previous = new Map([[13, { points: 100, games: 40 }], [11, { points: 20, games: 40 }]]);
        const table = prices.priceTable([
            { table: current, weight: 1 },
            { table: previous, weight: 0.5 }
        ]);
        expect(table.get(10)).toBe(12);
        expect(Math.min(...table.values())).toBe(4);
        expect([...table.values()].every((value) => value * 2 === Math.round(value * 2) && value >= 4 && value <= 12)).toBe(true);
        expect(table.get(10)).toBeGreaterThan(table.get(12));
        expect(table.get(12)).toBeGreaterThan(table.get(11));
        // Un pelotero que solo jugó hace 3 temporadas cuenta, pero con poco peso: queda cerca del «promedio bajo»
        const old = prices.priceTable([
            { table: current, weight: 1 },
            { table: new Map([[14, { points: 400, games: 40 }]]), weight: 0.125 }
        ]);
        expect(old.get(14)).toBe(12);
        expect(old.get(10)).toBeLessThan(12);
    });

    it('precios del día con las estadísticas hasta ayer, y sin datos suficientes no hay créditos', async () => {
        const realGet = http.mlbGet;
        const calls = [];
        const split = (id, stat) => ({ player: { id }, stat });
        http.mlbGet = async (url, params) => {
            calls.push(params);
            const many = (group) =>
                Array.from({ length: 30 }, (_, i) => split(100 + i, group === 'hitting' ? { gamesPlayed: 10, hits: i, homeRuns: 0, runs: 0, rbi: 0 } : { gamesPitched: 5, outs: i * 3, strikeOuts: i }));
            return { stats: [{ splits: params.stats === 'season' ? many(params.group) : [] }] };
        };
        try {
            const table = await prices.dayPrices('lidom', '2026-10-15', { batterPoints: fantasy.batterPoints, pitcherPoints: fantasy.pitcherPoints });
            expect(table.budget).toBe(50);
            const range = calls.filter((c) => c.stats === 'byDateRange');
            expect(range.every((c) => c.startDate === '2026-09-01' && c.endDate === '2026-10-14' && c.season === 2026)).toBe(true);
            // La temporada 2026 hasta ayer y las 3 anteriores completas
            expect([...new Set(calls.filter((c) => c.stats === 'season').map((c) => c.season))].sort()).toEqual([2023, 2024, 2025]);
            expect(new Map(table.prices.B).get(129)).toBe(12);
            expect(new Map(table.prices.B).get(100)).toBe(4);

            // Sin datos en ninguna temporada (la caché de las pasadas se vacía para la prueba)
            clearCache();
            http.mlbGet = async () => ({ stats: [{ splits: [] }] });
            expect(await prices.dayPrices('lidom', '2026-10-16', { batterPoints: fantasy.batterPoints, pitcherPoints: fantasy.pitcherPoints })).toBe(null);
        } finally {
            http.mlbGet = realGet;
        }
    });
});

describe('estadísticas colectivas por equipo', () => {
    const { fetchTeamStats } = require('../services/teamStats');
    const realGet = http.mlbGet;
    afterEach(() => {
        http.mlbGet = realGet;
    });

    it('bateo y pitcheo de cada equipo con lo que es solo de equipo; antes del primer juego, la temporada anterior', async () => {
        clearCache();
        const calls = [];
        http.mlbGet = async (url, params) => {
            if (url.endsWith('/league/131')) return { leagues: [{ season: '2026', numGames: 50 }] };
            calls.push({ url, ...params });
            if (params.season === 2026) return { stats: [{ splits: [] }] };
            const stat =
                params.group === 'hitting'
                    ? { gamesPlayed: 50, atBats: 1700, hits: 450, homeRuns: 30, runs: 220, avg: '.265', obp: '.340', slg: '.380', ops: '.720', leftOnBase: 330, babip: '.300' }
                    : { gamesPitched: 50, outs: 1350, inningsPitched: '450.0', earnedRuns: 180, runs: 200, wins: 28, losses: 22, era: '3.60', whip: '1.30', avg: '.250', saves: 14, saveOpportunities: 20, blownSaves: 6 };
            return { stats: [{ splits: [{ team: { id: 667, name: 'Águilas Cibaeñas' }, stat }] }] };
        };
        const data = await fetchTeamStats('lidom');
        expect(data).toMatchObject({ season: 2025, currentSeason: 2026, isPreviousSeason: true });
        expect(data.teams).toHaveLength(1);
        expect(data.teams[0]).toMatchObject({
            id: 667,
            abbrev: 'AGU',
            hitting: { avg: '.265', hr: 30, r: 220, lob: 330 },
            pitching: { era: '3.60', w: 28, l: 22, r: 200, avg: '.250', sv: 14, svo: 20, bs: 6 }
        });
        expect(calls.every((call) => call.url.endsWith('/teams/stats') && call.sportIds === 17 && call.leagueIds === 131 && call.stats === 'season')).toBe(true);
        // Una temporada pedida no salta a la anterior aunque esté vacía
        expect(await fetchTeamStats('lidom', 2026)).toMatchObject({ season: 2026, isPreviousSeason: false, teams: [] });
    });

    it('ruta: temporada inválida 400', async () => {
        const app = require('../app');
        const server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        try {
            expect((await fetch(`http://127.0.0.1:${server.address().port}/api/v2/team-stats?league=lidom&season=ayer`)).status).toBe(400);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});

describe('estadísticas de jugadores', () => {
    const { hittingOf, pitchingOf, pointsOf, fetchPlayers } = require('../services/players');

    it('los puntos de la temporada usan la misma regla del fantasy', () => {
        const hitting = hittingOf({ gamesPlayed: 3, hits: 4, doubles: 1, homeRuns: 1, runs: 2, rbi: 3, baseOnBalls: 1, strikeOuts: 2, stolenBases: 1, avg: '.400' });
        expect(pointsOf('B', hitting, null)).toBe(2 * 3 + 5 + 10 + 4 + 6 + 2 - 2 + 5);
        const pitching = pitchingOf({ gamesPitched: 1, inningsPitched: '5.1', strikeOuts: 6, wins: 1, earnedRuns: 2, hits: 4, baseOnBalls: 2 });
        expect(pitching.outs).toBe(16);
        expect(pointsOf('P', null, pitching)).toBe(16 + 12 + 5 - 4 - 2 - 1);
    });

    it('junta roster y temporada: quien no ha jugado también aparece, y el lanzador cuenta como lanzador', async () => {
        clearCache();
        http.mlbGet = async (url, params) => {
            if (url.endsWith('/league/131')) return { leagues: [{ season: '2026', numGames: 50 }] };
            if (url.endsWith('/teams')) return { teams: [{ id: 672, name: 'Tigres del Licey' }] };
            if (url.endsWith('/teams/672/roster')) {
                return { roster: [
                    { person: { id: 1, fullName: 'Bateador Uno' }, jerseyNumber: '7', position: { abbreviation: 'SS' } },
                    { person: { id: 2, fullName: 'Lanzador Dos' }, jerseyNumber: '40', position: { abbreviation: 'P' } },
                    { person: { id: 3, fullName: 'Banca Tres' }, jerseyNumber: '9', position: { abbreviation: 'C' } }
                ] };
            }
            if (url.endsWith('/stats') && params.group === 'hitting') return { stats: [{ splits: [{ player: { id: 1, fullName: 'Bateador Uno' }, team: { id: 672, name: 'Tigres del Licey' }, stat: { gamesPlayed: 2, hits: 2, homeRuns: 1, rbi: 2, runs: 1 } }] }] };
            if (url.endsWith('/stats')) return { stats: [{ splits: [{ player: { id: 2, fullName: 'Lanzador Dos' }, team: { id: 672, name: 'Tigres del Licey' }, stat: { gamesPitched: 1, outs: 18, strikeOuts: 7, wins: 1 } }] }] };
            throw new Error(`sin ruta ${url}`);
        };
        const data = await fetchPlayers('lidom');
        expect(data.season).toBe(2026);
        expect(data.players.map((p) => p.name)).toEqual(['Lanzador Dos', 'Bateador Uno', 'Banca Tres']);
        expect(data.players[0]).toMatchObject({ role: 'P', pts: 18 + 14 + 5, g: 1, number: '40' });
        expect(data.players[1]).toMatchObject({ role: 'B', pts: 3 + 10 + 2 + 4, g: 2, ppg: 9.5, pos: 'SS' });
        expect(data.players[2]).toMatchObject({ role: 'B', pts: 0, g: 0, hitting: null });
        expect(data.teams['672'].abbrev).toBe('LIC');
    });
});
