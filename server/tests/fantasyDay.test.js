import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

// La API es CommonJS: se carga con require nativo para poder sustituir http.mlbGet
const require = createRequire(import.meta.url);
const http = require('../services/http');
const { resetLiveFeeds } = require('../services/liveFeed');
const { clearCache } = require('../utils/cache');
const fantasy = require('../services/fantasy');
const prices = require('../services/fantasyPrices');
const { effectiveEntry, perTeamLimit, dayStarted, dayResult } = require('../services/fantasyScore');

const realGet = http.mlbGet;
afterEach(() => {
    http.mlbGet = realGet;
    resetLiveFeeds();
    clearCache();
});

// ---------------------------------------------------------------- liga inventada
// Equipos 901 a 906; cada uno con 10 bateadores (el 10 es de la banca) y 4 lanzadores (51 a 54). Ids ficticios:
// 1234 + equipo + número (el 3 del 901 es 12340103).
const A = 901;
const B = 902;
const C = 903;
const D = 904;
const E = 905;
const F = 906;
const TEAMS = [A, B, C, D, E, F];
const id = (team, n) => 12340000 + (team - 900) * 100 + n;
const HITTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PITCHERS = [51, 52, 53, 54];
const POS = ['CF', 'SS', '2B', '1B', 'DH', '3B', 'RF', 'LF', 'C', 'C'];

const STATUS = {
    final: { abstractGameState: 'Final', codedGameState: 'F', detailedState: 'Final' },
    preview: { abstractGameState: 'Preview', codedGameState: 'S', detailedState: 'Scheduled' },
    live: { abstractGameState: 'Live', codedGameState: 'I', detailedState: 'In Progress' },
    postponed: { abstractGameState: 'Final', codedGameState: 'D', detailedState: 'Postponed', reason: 'Rain' }
};

/**
 * Un juego: `lineup` (por equipo, los números que abrieron; por defecto del 1 al 9), `pitched` (los que lanzaron, el
 * primero abrió), `posted` (antes del juego: la alineación que el equipo ya publicó) y `probables` (números).
 */
const game = (gamePk, date, time, away, home, status, extra = {}) => ({ gamePk, date, time, away, home, status, ...extra });

const boxOf = (g) => {
    const teams = {};
    for (const [side, team] of [['away', g.away], ['home', g.home]]) {
        const started = g.status === 'final' || g.status === 'live';
        const lineup = started ? g.lineup?.[team] ?? HITTERS.slice(0, 9) : g.posted?.[team] ?? [];
        const pitched = started ? g.pitched?.[team] ?? [51, 52] : [];
        const players = {};
        for (const n of HITTERS) {
            const at = lineup.indexOf(n);
            const pa = started && at >= 0 ? 4 : 0;
            players[`ID${id(team, n)}`] = {
                person: { id: id(team, n), fullName: `Bateador ${team}-${n}` },
                position: { abbreviation: POS[n - 1] },
                ...(at >= 0 ? { battingOrder: String((at + 1) * 100) } : {}),
                // Cada titular: 4 turnos, 1 sencillo (3 puntos)
                stats: { batting: pa ? { plateAppearances: pa, atBats: 4, hits: 1 } : {}, pitching: {} }
            };
        }
        for (const n of PITCHERS) {
            const at = pitched.indexOf(n);
            players[`ID${id(team, n)}`] = {
                person: { id: id(team, n), fullName: `Lanzador ${team}-${n}` },
                position: { abbreviation: 'P' },
                // El que abre: 15 outs y 5 ponches (25 puntos); el relevista: 3 outs (3 puntos)
                stats: { batting: {}, pitching: at === 0 ? { battersFaced: 20, outs: 15, strikeOuts: 5 } : at > 0 ? { battersFaced: 4, outs: 3 } : {} }
            };
        }
        teams[side] = { team: { id: team }, players, battingOrder: lineup.map((n) => id(team, n)), pitchers: pitched.map((n) => id(team, n)) };
    }
    return { teams };
};

const scheduleOf = (g) => ({
    gamePk: g.gamePk,
    officialDate: g.date,
    gameDate: g.time,
    gameNumber: g.gameNumber ?? 1,
    doubleHeader: g.gameNumber ? 'Y' : 'N',
    status: { ...STATUS[g.status], startTimeTBD: !!g.tbd },
    teams: Object.fromEntries(
        [['away', g.away], ['home', g.home]].map(([side, team]) => [
            side,
            {
                team: { id: team, name: `Equipo ${team}`, abbreviation: `E${team - 900}` },
                ...(g.status === 'final' ? { score: side === 'home' ? 3 : 2, isWinner: side === 'home' } : {}),
                ...(g.probables?.[side] ? { probablePitcher: { id: id(team, g.probables[side]), fullName: 'Probable' } } : {})
            }
        ])
    )
});

/**
 * StatsAPI de mentira para una lista de juegos. `stats(group, params)` da los splits de /stats; por defecto, de cada
 * pelotero una línea fija (así hay más de 20 con precio).
 */
const fakeLeague = (games, { stats } = {}) => {
    const requests = [];
    const defaultStats = (group) =>
        TEAMS.flatMap((team) =>
            (group === 'pitching' ? PITCHERS : HITTERS).map((n) => ({
                player: { id: id(team, n) },
                stat: group === 'pitching' ? { gamesPitched: 3, outs: 3 * n, strikeOuts: n % 7, earnedRuns: 2, hits: 4, baseOnBalls: 1 } : { gamesPlayed: 10, atBats: 40, hits: n + (team % 5), homeRuns: n % 3, baseOnBalls: 3, sacFlies: 0, hitByPitch: 0 }
            }))
        );
    http.mlbGet = async (url, params = {}) => {
        requests.push({ url, params });
        let match;
        if (url.endsWith('/schedule')) {
            const inRange = games.filter((g) => g.date >= params.startDate && g.date <= params.endDate);
            return { dates: [...new Set(inRange.map((g) => g.date))].sort().map((date) => ({ date, games: inRange.filter((g) => g.date === date).map(scheduleOf) })) };
        }
        if ((match = url.match(/\/game\/(\d+)\/boxscore$/))) return boxOf(games.find((g) => g.gamePk === Number(match[1])));
        if ((match = url.match(/\/game\/(\d+)\/feed\/live$/))) {
            const g = games.find((item) => item.gamePk === Number(match[1]));
            return {
                metaData: { timeStamp: `t${g.gamePk}` },
                gameData: { status: STATUS[g.status], teams: { away: { id: g.away }, home: { id: g.home } }, probablePitchers: {}, gameInfo: {} },
                liveData: { boxscore: boxOf(g) }
            };
        }
        if (url.endsWith('/stats')) return { stats: [{ splits: (stats || defaultStats)(params.group, params) }] };
        throw Object.assign(new Error(`sin simular ${url}`), { response: { status: 404 } });
    };
    return requests;
};

const playerOf = (day, team, n) => day.players.find((p) => p.id === id(team, n));

// ---------------------------------------------------------------- el día de prueba
// 2026-10-17: los tres juegos de la jornada. 2026-10-18: día libre. 2026-10-19: otra jornada (el 903 abre con el 51 y
// en su alineación entra el 10 por el 9). 2026-10-20: doble cartelera 901-902 (el 2 con hora de relleno anterior a la
// del 1), 903 en 904 por empezar (el 904 ya publicó su alineación sin su 9) y 905-906 (de día) pospuesto.
const LEAGUE = [
    game(5001, '2026-10-17', '2026-10-17T23:00:00Z', A, B, 'final', { pitched: { [A]: [51, 52], [B]: [51, 52] } }),
    game(5002, '2026-10-17', '2026-10-17T23:00:00Z', C, D, 'final', { pitched: { [C]: [53, 52], [D]: [51, 52] } }),
    game(5003, '2026-10-17', '2026-10-17T23:00:00Z', E, F, 'final'),
    game(5011, '2026-10-19', '2026-10-19T23:00:00Z', A, C, 'final', { pitched: { [A]: [53, 52], [C]: [51, 52] }, lineup: { [C]: [1, 2, 3, 4, 5, 6, 7, 8, 10] } }),
    game(5012, '2026-10-19', '2026-10-19T23:00:00Z', B, D, 'final', { pitched: { [B]: [53, 52], [D]: [53] } }),
    game(5013, '2026-10-19', '2026-10-19T23:00:00Z', E, F, 'final'),
    game(5021, '2026-10-20', '2026-10-20T21:00:00Z', A, B, 'preview', { gameNumber: 1 }),
    game(5022, '2026-10-20', '2026-10-20T20:00:00Z', A, B, 'preview', { gameNumber: 2, tbd: true }),
    game(5023, '2026-10-20', '2026-10-20T23:00:00Z', C, D, 'preview', { probables: { away: 54, home: 52 }, posted: { [D]: [1, 2, 3, 4, 5, 6, 7, 8, 10] } }),
    game(5024, '2026-10-20', '2026-10-20T17:00:00Z', E, F, 'postponed')
];

describe('fantasy del día: si juega cada pelotero (status)', () => {
    it('alineación anunciada (confirmed / bench), la del último juego (expected / bench) y los lanzadores (probable / resting / bullpen)', async () => {
        fakeLeague(LEAGUE);
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        // 904 publicó su alineación sin su 9: el 10 confirmado y el 9 a la banca
        expect(playerOf(day, D, 10)).toMatchObject({ status: 'confirmed', starter: true, gamePk: 5023 });
        expect(playerOf(day, D, 9)).toMatchObject({ status: 'bench', starter: false });
        // 903 no la ha publicado: titular del último juego = esperado; el que no abrió ese juego, banca
        expect(playerOf(day, C, 10).status).toBe('expected');
        expect(playerOf(day, C, 9).status).toBe('bench');
        expect(playerOf(day, C, 1).status).toBe('expected');
        // Lanzadores del 903: el 54 es el probable; el 51 abrió ayer y el 53 hace 3 días (descansan); el 52 releva
        expect(playerOf(day, C, 54)).toMatchObject({ status: 'probable', starter: true });
        expect(playerOf(day, C, 51)).toMatchObject({ status: 'resting', rest: true, startedAgo: 1 });
        expect(playerOf(day, C, 53)).toMatchObject({ status: 'resting', startedAgo: 3 });
        expect(playerOf(day, C, 52).status).toBe('bullpen');
        // Del 904 el probable es el 52 aunque nunca abrió
        expect(playerOf(day, D, 52).status).toBe('probable');
        // Rival del día y si juega en casa
        expect(playerOf(day, C, 1).opp).toEqual({ id: D, abbrev: 'E4', home: false });
        expect(playerOf(day, D, 1).opp).toEqual({ id: C, abbrev: 'E3', home: true });
        // Juegos con su estado y sus abridores probables
        expect(day.games.find((g) => g.gamePk === 5023)).toMatchObject({ status: 'scheduled', probables: { away: id(C, 54), home: id(D, 52) } });
    });

    it('la proyección sube a ×1 con la alineación anunciada o el abridor probable', async () => {
        fakeLeague(LEAGUE);
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        const confirmed = playerOf(day, D, 1);
        const expected = playerOf(day, C, 1);
        expect(confirmed.proj).toBeGreaterThan(0);
        // ×1 contra ×0,85 (con la misma tabla de puntos por juego)
        const table = await prices.dayPrices('lidom', '2026-10-20', { batterPoints: fantasy.batterPoints, pitcherPoints: fantasy.pitcherPoints });
        const ppg = (player) => new Map(table.ppg.B).get(player.id);
        expect(confirmed.proj).toBe(Math.round(ppg(confirmed) * 10) / 10);
        expect(expected.proj).toBe(Math.round(ppg(expected) * 0.85 * 10) / 10);
        const probable = playerOf(day, C, 54);
        expect(probable.proj).toBe(Math.round(new Map(table.ppg.P).get(probable.id) * 10) / 10);
    });

    it('juego terminado: el que no jugó sale «dnp»; el que abrió, «probable»; los titulares, «confirmed»', async () => {
        fakeLeague(LEAGUE);
        const day = await fantasy.fantasyDay('lidom', '2026-10-19');
        expect(playerOf(day, C, 9)).toMatchObject({ status: 'dnp', played: false, points: 0 });
        expect(playerOf(day, C, 10)).toMatchObject({ status: 'confirmed', played: true, points: 3 });
        expect(playerOf(day, A, 53)).toMatchObject({ status: 'probable', points: 25 });
        expect(playerOf(day, A, 54).status).toBe('dnp');
        // Últimos 5: solo los juegos antes del día, del más viejo al más nuevo (el del día no entra)
        expect(playerOf(day, A, 51).last5).toEqual([25]);
        expect(playerOf(day, A, 52).last5).toEqual([3]);
        expect(playerOf(day, A, 1).last5).toEqual([3]);
    });

    it('últimos 5 juegos jugados, sin los días que no jugó', async () => {
        fakeLeague(LEAGUE);
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        expect(playerOf(day, C, 1).last5).toEqual([3, 3]);
        // El 9 del 903 no jugó el 19; el 10 solo jugó ese
        expect(playerOf(day, C, 9).last5).toEqual([3]);
        expect(playerOf(day, C, 10).last5).toEqual([3]);
        // El 53 abrió el 17 y el 51 el 19; el 52 relevó los dos
        expect(playerOf(day, C, 53).last5).toEqual([25]);
        expect(playerOf(day, C, 51).last5).toEqual([25]);
        expect(playerOf(day, C, 52).last5).toEqual([3, 3]);
    });

    it('línea de la temporada (hasta el día anterior): AVG/OPS/HR del bateador y EFE/WHIP/K del lanzador', async () => {
        fakeLeague(LEAGUE, {
            stats: (group) =>
                TEAMS.flatMap((team) =>
                    (group === 'pitching' ? PITCHERS : HITTERS).map((n) => ({
                        player: { id: id(team, n) },
                        stat: group === 'pitching' ? { gamesPitched: 4, inningsPitched: '20.0', earnedRuns: 5, hits: 15, baseOnBalls: 7, strikeOuts: 21 } : { gamesPlayed: 12, atBats: 40, hits: 12, doubles: 3, triples: 1, homeRuns: 2, baseOnBalls: 5, hitByPitch: 1, sacFlies: 1 }
                    }))
                )
        });
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        // .300 de promedio; OBP 18/47 y SLG 23/40: .958 de OPS
        expect(playerOf(day, C, 1).season).toEqual({ avg: '.300', ops: '.958', hr: 2, g: 12 });
        expect(playerOf(day, C, 51).season).toEqual({ era: '2.25', whip: '1.10', k: 21, g: 4 });
    });
});

describe('fantasy del día: juegos pospuestos', () => {
    it('siguen en el día y sus peloteros salen «postponed», con 0 puntos y 0 de proyección', async () => {
        fakeLeague(LEAGUE);
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        const postponed = day.games.find((g) => g.gamePk === 5024);
        expect(postponed).toMatchObject({ status: 'postponed', state: 'final', detailedState: 'Postponed' });
        const players = day.players.filter((p) => p.gamePk === 5024);
        // Los dos rosters completos, del último juego de cada equipo
        expect(players).toHaveLength(28);
        expect(players.every((p) => p.status === 'postponed' && p.points === 0 && p.line === null && p.proj === 0)).toBe(true);
        expect(players.find((p) => p.id === id(E, 1)).opp).toEqual({ id: F, abbrev: 'E6', home: false });
    });

    it('no ocupan cupo ni presupuesto: se pueden cambiar cuando sea; y no cuentan para el tope por equipo', async () => {
        fakeLeague(LEAGUE);
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        // Cuatro juegos, pero el pospuesto no cuenta: 3 juegos con 6 equipos (2 por equipo)
        expect(perTeamLimit(day)).toBe(2);
        const at = (hhmm) => Date.parse(`2026-10-20T${hhmm}:00Z`);
        // Cinco bateadores, uno del pospuesto (17:00); a las 18:00, ya pasada su hora, lo cambia por otro de un juego que
        // no ha empezado (21:00): cuenta el nuevo (antes, el pospuesto «cerrado» ocupaba el cupo y el nuevo sobraba)
        const others = { [id(C, 1)]: [[2, null]], [id(D, 1)]: [[3, null]], [id(A, 1)]: [[4, null]], [id(C, 2)]: [[5, null]] };
        const lineup = [id(C, 1), id(D, 1), id(A, 1), id(C, 2), id(B, 1)];
        const swapped = { v: 1, players: { [id(E, 1)]: [[1, at('18:00')]], ...others, [id(B, 1)]: [[at('18:01'), null]] } };
        expect(effectiveEntry(day, { lineup, captain: null, picks: {}, history: swapped }).lineup).toEqual(lineup);
        // Si no lo saca, sigue ahí con 0 sin quitarle el cupo a nadie
        const kept = { v: 1, players: { ...swapped.players, [id(E, 1)]: [[1, null]] } };
        expect(effectiveEntry(day, { lineup: [id(E, 1), ...lineup], captain: null, picks: {}, history: kept }).lineup).toEqual(lineup);
        // Un pronóstico del pospuesto no cuenta
        const picks = { v: 1, players: {}, picks: { 5024: [[F, 1]], 5023: [[D, 1]] } };
        expect(effectiveEntry(day, { lineup: [], captain: null, picks: { 5024: F, 5023: D }, history: picks }).picks).toEqual({ 5023: D });
    });

    it('un día con solo el pospuesto «empezado» no cuenta como jugado', async () => {
        fakeLeague(LEAGUE);
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        // Lo de MLB: el pospuesto viene «Final»; los demás no han empezado
        expect(dayStarted(day)).toBe(false);
        expect(dayResult(day, { lineup: [id(E, 1)], captain: null, picks: {} })).toMatchObject({ started: false, total: 0 });
    });
});

describe('fantasy del día: doble cartelera', () => {
    it('antes del primer juego, los peloteros van con el juego 1 (se cierran al empezar el primero)', async () => {
        fakeLeague(LEAGUE);
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        // El 2 trae una hora de relleno anterior a la del 1: manda el número del juego
        const own = day.players.filter((p) => p.teamId === A || p.teamId === B);
        expect(own.length).toBe(28);
        expect(own.every((p) => p.gamePk === 5021)).toBe(true);
    });

    it('con el primero empezado, todos quedan con el primero', async () => {
        const league = LEAGUE.map((g) => (g.gamePk === 5021 ? { ...g, status: 'live' } : g));
        fakeLeague(league);
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        expect(day.players.filter((p) => p.teamId === A).every((p) => p.gamePk === 5021)).toBe(true);
        expect(day.games.find((g) => g.gamePk === 5021).status).toBe('live');
        // En vivo: el titular está confirmado y el abridor es el probable del juego
        expect(playerOf(day, A, 1).status).toBe('confirmed');
        expect(playerOf(day, A, 51).status).toBe('probable');
        expect(day.games.find((g) => g.gamePk === 5021).probables).toEqual({ away: id(A, 51), home: id(B, 51) });
    });
});

describe('fantasy del día: reglas de ese día (rules)', () => {
    const ONE = [
        game(6001, '2026-10-24', '2026-10-24T23:00:00Z', A, B, 'final'),
        game(6002, '2026-10-24', '2026-10-24T23:00:00Z', C, D, 'final'),
        game(6011, '2026-10-25', '2026-10-25T23:00:00Z', A, B, 'preview'),
        game(6012, '2026-10-25', '2026-10-25T23:00:00Z', C, D, 'postponed')
    ];

    it('día de un solo juego (el otro pospuesto): el tope por equipo sube a 3', async () => {
        fakeLeague(ONE);
        const day = await fantasy.fantasyDay('lidom', '2026-10-25');
        expect(day.rules).toMatchObject({ version: 2, perTeam: 3, budget: 50, roster: { batters: 5, pitchers: 1 }, captain: 1.5, picks: { points: 10 }, lock: 'per-game', timezone: 'America/Santo_Domingo' });
        expect(day.rules.perTeam).toBe(perTeamLimit(day));
        expect(day.rules.scoring).toEqual({
            batter: { single: 3, double: 5, triple: 8, homeRun: 10, run: 2, rbi: 2, walk: 2, hbp: 2, stolenBase: 5, strikeout: -1 },
            pitcher: { out: 1, strikeout: 2, win: 5, save: 5, earnedRun: -2, hit: -0.5, walk: -0.5 }
        });
        expect(day.rules.prices).toEqual({ min: 4, max: 12, step: 0.5, noData: 5, seasonWeights: [1, 0.5, 0.25, 0.125], frozen: true });
        // Tres del mismo equipo cuentan ese día
        const three = [id(A, 1), id(A, 2), id(A, 3)];
        const history = { v: 1, players: Object.fromEntries(three.map((pid, i) => [pid, [[i + 1, null]]])) };
        expect(effectiveEntry(day, { lineup: three, captain: null, picks: {}, history }).lineup).toEqual(three);
    });

    it('día sin créditos (antes de que empezaran o sin datos suficientes): budget null', async () => {
        const early = [game(6101, '2026-10-09', '2026-10-09T23:00:00Z', A, B, 'final'), game(6102, '2026-10-10', '2026-10-10T23:00:00Z', A, B, 'preview')];
        fakeLeague(early);
        const before = await fantasy.fantasyDay('lidom', '2026-10-10');
        expect(before.rules.budget).toBe(null);
        expect(before.credits).toBeUndefined();
        expect(before.players.every((p) => p.priceDelta === null && p.season === null && p.price === undefined)).toBe(true);
        // Con créditos pero sin estadísticas (temporada nueva sin historia)
        clearCache();
        fakeLeague(ONE, { stats: () => [] });
        const empty = await fantasy.fantasyDay('lidom', '2026-10-25');
        expect(empty.rules.budget).toBe(null);
        expect(empty.credits).toBeUndefined();
        expect(empty.incomplete).toBeUndefined();
    });
});

describe('fantasy del día: precios fijos y la flecha ↑↓', () => {
    // Las estadísticas de la temporada dependen de hasta qué día se piden: el 12340301 batea más cada día
    const growing = (group, params) =>
        TEAMS.flatMap((team) =>
            (group === 'pitching' ? PITCHERS : HITTERS).map((n) => {
                const star = team === C && n === 1 && params.stats === 'byDateRange';
                const extra = star ? Math.max(0, Number(String(params.endDate).slice(8, 10)) - 16) * 6 : 0;
                return {
                    player: { id: id(team, n) },
                    stat: group === 'pitching' ? { gamesPitched: 3, outs: 3 * n, strikeOuts: n % 7 } : { gamesPlayed: 10, atBats: 40, hits: n + (team % 5) + extra, homeRuns: 0 }
                };
            })
        );

    it('salen solo de lo de antes del día: volver a calcularlos da lo mismo y no piden nada del día', async () => {
        const requests = fakeLeague(LEAGUE, { stats: growing });
        const first = await fantasy.fantasyDay('lidom', '2026-10-20');
        clearCache();
        resetLiveFeeds();
        const again = await fantasy.fantasyDay('lidom', '2026-10-20');
        const pricesOf = (day) => day.players.map((p) => [p.id, p.price, p.priceDelta]);
        expect(pricesOf(again)).toEqual(pricesOf(first));
        const ranges = requests.filter((r) => r.params.stats === 'byDateRange');
        // Los del día (hasta el 19) y los del día de juego anterior (hasta el 18)
        expect([...new Set(ranges.map((r) => r.params.endDate))].sort()).toEqual(['2026-10-18', '2026-10-19']);
        expect(first.rules.prices.frozen).toBe(true);
    });

    it('priceDelta: el precio de hoy menos el del día de juego anterior (el día libre no cuenta)', async () => {
        fakeLeague(LEAGUE, { stats: growing });
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        const scoring = { batterPoints: fantasy.batterPoints, pitcherPoints: fantasy.pitcherPoints };
        const today = new Map((await prices.dayPrices('lidom', '2026-10-20', scoring)).prices.B);
        // El día de juego anterior es el 19 (el 18 no hubo juegos)
        const before = new Map((await prices.dayPrices('lidom', '2026-10-19', scoring)).prices.B);
        const star = playerOf(day, C, 1);
        expect(star.priceDelta).toBe(today.get(star.id) - before.get(star.id));
        expect(star.priceDelta).toBeGreaterThan(0);
        expect(day.players.every((p) => typeof p.priceDelta === 'number')).toBe(true);
    });

    it('con un juego de ayer todavía en vivo, el precio de hoy es provisional y sale de lo de antes de ayer', async () => {
        const league = LEAGUE.map((g) => (g.gamePk === 5013 ? { ...g, status: 'live' } : g));
        const requests = fakeLeague(league, { stats: growing });
        const day = await fantasy.fantasyDay('lidom', '2026-10-20');
        expect(day.rules.prices.frozen).toBe(false);
        const ranges = requests.filter((r) => r.params.stats === 'byDateRange').map((r) => r.params.endDate);
        expect(ranges.every((end) => end <= '2026-10-18')).toBe(true);
    });

    it('hasta qué día van los datos de los precios (statsThrough)', () => {
        const at = (date, status, time = `${date}T23:00:00Z`) => ({ officialDate: date, gameDate: time, status: STATUS[status] });
        const games = [at('2026-10-18', 'final'), at('2026-10-19', 'final')];
        const now = Date.parse('2026-10-20T15:00:00Z');
        expect(fantasy.statsThrough(games, '2026-10-20', '2026-10-20', now)).toBe('2026-10-19');
        // Uno de ayer en vivo (o recién terminado): hasta antes de ayer
        expect(fantasy.statsThrough([...games, at('2026-10-19', 'live')], '2026-10-20', '2026-10-20', now)).toBe('2026-10-18');
        expect(fantasy.statsThrough(games, '2026-10-20', '2026-10-20', Date.parse('2026-10-20T01:00:00Z'))).toBe('2026-10-18');
        // Pospuestos no frenan nada
        expect(fantasy.statsThrough([...games, at('2026-10-19', 'postponed')], '2026-10-20', '2026-10-20', now)).toBe('2026-10-19');
        // Un día que viene: nunca pasa de ayer
        expect(fantasy.statsThrough([at('2026-10-20', 'preview'), at('2026-10-21', 'preview')], '2026-10-22', '2026-10-20', now)).toBe('2026-10-19');
        expect(fantasy.previousGameDay([...games, at('2026-10-17', 'final'), at('2026-10-19', 'postponed')], '2026-10-20')).toBe('2026-10-19');
        expect(fantasy.previousGameDay([at('2026-10-18', 'final'), at('2026-10-19', 'postponed')], '2026-10-20')).toBe('2026-10-18');
    });
});

describe('fantasy del día con el simulador (MLB_MOCK)', () => {
    afterEach(() => {
        delete process.env.MLB_MOCK;
    });

    it('hoy: doble cartelera, uno por empezar con la alineación de casa anunciada, uno pospuesto, y todos los campos nuevos', async () => {
        process.env.MLB_MOCK = '1';
        const day = await fantasy.fantasyDay('lidom');
        expect(day.games.map((g) => g.status).sort()).toEqual(['final', 'live', 'postponed', 'scheduled']);
        expect(day.games.filter((g) => g.doubleheader).length).toBe(2);
        const statuses = new Set(day.players.map((p) => p.status));
        for (const status of ['confirmed', 'expected', 'bench', 'probable', 'resting', 'bullpen', 'postponed']) expect(statuses.has(status)).toBe(true);
        const preview = day.games.find((g) => g.status === 'scheduled');
        expect(preview.probables.away).toBeTypeOf('number');
        expect(day.players.filter((p) => p.gamePk === preview.gamePk && p.teamId === preview.home.id).some((p) => p.status === 'confirmed')).toBe(true);
        expect(day.players.filter((p) => p.gamePk === preview.gamePk && p.teamId === preview.away.id).some((p) => p.status === 'expected')).toBe(true);
        expect(day.players.some((p) => p.priceDelta !== null && p.priceDelta !== 0)).toBe(true);
        expect(day.players.filter((p) => p.role === 'B').some((p) => p.season?.avg && p.season.hr >= 0)).toBe(true);
        expect(day.players.filter((p) => p.role === 'P').some((p) => p.season?.era)).toBe(true);
        expect(day.players.some((p) => p.last5.length === 5)).toBe(true);
        expect(day.rules.budget).toBe(50);
        // Ayer todo terminó: el que no jugó sale «dnp»
        const yesterday = new Date(Date.now() - 28 * 3600000).toISOString().slice(0, 10);
        const before = await fantasy.fantasyDay('lidom', yesterday);
        expect(before.players.some((p) => p.status === 'dnp')).toBe(true);
    });
});
