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

    it('los promedios se piden solo con jugadores calificados', async () => {
        const pools = {};
        http.mlbGet = routes({
            stats: (params) => {
                pools[params.sortStat] = params.playerPool;
                return params.sortStat === 'battingAverage' ? fixture('stats-avg-qualified') : { stats: [{ splits: [] }] };
            }
        });
        const leaders = await fetchLeaders('lidom');
        expect(pools.battingAverage).toBe('QUALIFIED');
        expect(pools.earnedRunAverage).toBe('QUALIFIED');
        expect(pools.homeRuns).toBe('ALL');
        const avg = leaders.categories.find((category) => category.id === 'battingAverage');
        expect(avg.leaders[0]).toMatchObject({ name: 'Ismael Munguia', value: '.368', extra: { ab: 136, h: 50 } });
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
