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
        expect(dayResult(DAYS['2026-10-15'], entry)).toEqual({ final: true, live: false, started: true, team: 12.8, picks: 10, total: 22.8, picksMade: 2 });
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
