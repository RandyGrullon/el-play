// Backtest de las proyecciones del fantasy con una temporada pasada de LIDOM. Para cada día con juegos arma lo que se
// sabía la víspera, como fantasyDay con un juego por empezar (roster, alineación y abridor del último juego de cada
// equipo; estadísticas hasta el día anterior), saca la proyección de cada pelotero con el código del servidor y la
// compara con sus puntos de verdad. También mide el «equipo sugerido» (bestLineup con las proyecciones) contra el ideal
// del día. Con --grid busca los parámetros que más bajan el error: los ajusta en la primera mitad de la temporada y los
// mide en la segunda.
//
// Uso: node scripts/backtest-fantasy.js [--season=2025] [--cache=<carpeta>] [--grid] [--fix-postponed]
// Pide a MLB de una en una (con pausa) y guarda cada respuesta en la carpeta de caché: la segunda vez no sale a la red.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const http = require('../server/services/http');
const { MLB_API_BASE, LEAGUES } = require('../server/config/constants');
const { gameState } = require('../server/utils/transformers');
const { batterPoints, pitcherPoints, playersFromFeed, recentPitching } = require('../server/services/fantasy');
const prices = require('../server/services/fantasyPrices');

const arg = (name, fallback) => {
    const found = process.argv.find((value) => value.startsWith(`--${name}=`));
    return found ? found.split('=')[1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const SEASON = Number(arg('season', 2025));
const CACHE = arg('cache', path.join(os.tmpdir(), 'el-play-backtest'));
// fantasyDay busca el último juego «final» de cada equipo y para MLB un juego pospuesto también lo es: con este
// arreglo se salta los pospuestos (sin él, se reproduce lo que hace hoy el servidor)
const FIX_POSTPONED = flag('fix-postponed');
const league = LEAGUES.lidom;
const scoring = { batterPoints, pitcherPoints };
const { CREDITS } = prices;
fs.mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shiftDay = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const round1 = (value) => Math.round(value * 10) / 10;

// --- MLB, de una en una y con caché en disco -------------------------------------------------------------------------

const PAUSE_MS = 400;
// El cliente del servidor (axios con keep-alive): el fetch de Node tarda segundos por pedido en esta red
const mlbGet = http.mlbGet;
let queue = Promise.resolve();
let requests = 0;
const fetchJson = (url) => {
    const run = async () => {
        for (let attempt = 1; ; attempt++) {
            try {
                const data = await mlbGet(url);
                requests += 1;
                if (requests % 25 === 0) console.error(`  ${requests} pedidos a MLB…`);
                await sleep(PAUSE_MS);
                return data;
            } catch (problem) {
                if (attempt >= 3) throw new Error(`statsapi.mlb.com no responde (${url}): ${problem.message}`);
                await sleep(3000 * attempt);
            }
        }
    };
    const result = queue.then(run);
    queue = result.catch(() => {});
    return result;
};

const urlOf = (url, params = {}) => {
    const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
    return query ? `${url}?${query}` : url;
};

const get = async (url, params, slim = (data) => data) => {
    const full = urlOf(url, params);
    const file = path.join(CACHE, `${crypto.createHash('sha1').update(full).digest('hex').slice(0, 24)}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const data = slim(await fetchJson(full));
    fs.writeFileSync(file, JSON.stringify(data));
    return data;
};

// Solo lo que se usa (un box score completo pesa ~300 KB)
const slimStats = (data) => ({ stats: [{ splits: (data?.stats?.[0]?.splits || []).map((split) => ({ player: { id: split.player?.id }, stat: split.stat })) }] });
const slimTeam = (team = {}) => ({
    team: { id: team.team?.id },
    battingOrder: team.battingOrder || [],
    pitchers: team.pitchers || [],
    players: Object.fromEntries(
        Object.entries(team.players || {}).map(([key, player]) => [
            key,
            { person: { id: player.person?.id, fullName: player.person?.fullName }, position: { abbreviation: player.position?.abbreviation }, stats: { batting: player.stats?.batting || {}, pitching: player.stats?.pitching || {} } }
        ])
    )
});
const slimBox = (data) => ({ teams: { away: slimTeam(data?.teams?.away), home: slimTeam(data?.teams?.home) } });

// El servidor pide las estadísticas con http.mlbGet: aquí salen de la caché en disco
http.mlbGet = (url, params) => get(url, params, url.endsWith('/stats') ? slimStats : undefined);

const boxOf = async (gamePk) => ({ liveData: { boxscore: await get(`${MLB_API_BASE}/game/${gamePk}/boxscore`, {}, slimBox) } });
// Mismos parámetros y en el mismo orden que statsOf de fantasyPrices (así comparten la caché)
const statsOf = (params) => http.mlbGet(`${MLB_API_BASE}/stats`, { gameType: 'R', leagueId: league.leagueId, playerPool: 'ALL', limit: 2000, ...params }).then((data) => data?.stats?.[0]?.splits || []);

// bestLineup de la app (TypeScript): se compila al vuelo con el esbuild que ya trae Vite. Con `uncapped` mira a todos
// los peloteros y no solo a los 45 bateadores y 20 lanzadores de más proyección (que a veces no caben en el presupuesto)
const loadBest = (uncapped = false) => {
    const entry = path.join(__dirname, '../src/lib/fantasyBest.ts');
    const { outputFiles } = require('esbuild').buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', '@tanstack/react-query'], logLevel: 'error' });
    const code = uncapped ? outputFiles[0].text.replace(/MAX_BATTERS = \d+/, 'MAX_BATTERS = Infinity').replace(/MAX_PITCHERS = \d+/, 'MAX_PITCHERS = Infinity') : outputFiles[0].text;
    const module = { exports: {} };
    new Function('module', 'exports', 'require', code)(module, module.exports, createRequire(entry));
    return module.exports;
};

// --- La temporada --------------------------------------------------------------------------------------------------

const OFF = ['Postponed', 'Cancelled'];
// Juegos del fantasy: temporada regular, Round Robin y Serie Final (sin el Juego de Estrellas)
const FANTASY_TYPES = ['R', 'L', 'W'];
const isFinal = (game) => gameState(game.status) === 'final';
const wasPlayed = (game) => isFinal(game) && !OFF.includes(game.status?.detailedState);
const teamsOf = (game) => [game.teams?.away?.team?.id, game.teams?.home?.team?.id];

const loadSeason = async () => {
    const schedule = await get(`${MLB_API_BASE}/schedule`, { sportId: league.sportId, leagueId: league.leagueId, startDate: `${SEASON}-09-01`, endDate: `${SEASON + 1}-03-31` });
    const all = (schedule.dates || []).flatMap((entry) => entry.games || []);
    const playedByPk = new Map(all.filter(wasPlayed).map((game) => [game.gamePk, game]));
    const days = [...new Set(all.filter((game) => wasPlayed(game) && FANTASY_TYPES.includes(game.gameType)).map((game) => game.officialDate))].sort();
    return { all, playedByPk, days };
};

/**
 * Lo que fantasyDay sabe antes de un juego: roster del último juego de cada equipo, quién bateó en la alineación, quién
 * abrió y las salidas de cada lanzador en los juegos de los 10 días anteriores (recentPitching)
 */
const pregame = async (season, day, todays) => {
    const window = season.all.filter((game) => game.officialDate >= shiftDay(day, -10) && game.officialDate < day);
    const pool = new Map();
    const lineup = new Set();
    const opener = new Set();
    const recentByTeam = new Map();
    for (const game of todays) {
        for (const side of ['away', 'home']) {
            const teamId = game.teams?.[side]?.team?.id;
            const mine = window.filter((g) => teamsOf(g).includes(teamId)).sort((a, b) => b.gameDate.localeCompare(a.gameDate));
            const last = mine.find((g) => isFinal(g) && (!FIX_POSTPONED || !OFF.includes(g.status?.detailedState)));
            if (!last) continue;
            let doc;
            let withLineup = true;
            if (wasPlayed(last) || (season.playedByPk.get(last.gamePk)?.officialDate ?? day) < day) doc = await boxOf(last.gamePk);
            else {
                // Pospuesto y sin reponer todavía: MLB da su box score sin alineación (el roster es el de su último juego jugado)
                const before = mine.find(wasPlayed);
                if (!before) continue;
                doc = await boxOf(before.gamePk);
                withLineup = false;
            }
            const roster = playersFromFeed(doc, game.gamePk, false).filter((player) => player.teamId === teamId);
            if (withLineup) roster.filter((player) => player.starter).forEach((player) => (player.role === 'P' ? opener : lineup).add(player.id));
            for (const player of roster) if (!pool.has(player.id)) pool.set(player.id, player);
            const logs = [];
            for (const g of mine.filter(wasPlayed)) {
                const box = await get(`${MLB_API_BASE}/game/${g.gamePk}/boxscore`, {}, slimBox);
                const mySide = box.teams.away.team.id === teamId ? 'away' : 'home';
                logs.push({ date: g.officialDate, time: g.gameDate, pitchers: box.teams[mySide].pitchers });
            }
            recentByTeam.set(teamId, recentPitching(logs, day));
        }
    }
    return [...pool.values()].map((player) => {
        const recent = player.role === 'P' ? recentByTeam.get(player.teamId) : null;
        const outing = recent?.get(player.id);
        return {
            ...player,
            starter: player.role === 'B' ? lineup.has(player.id) : false,
            ...(opener.has(player.id) ? { rest: true } : {}),
            ...(recent ? { outings: outing?.outings ?? 0, ...(outing?.startedAgo !== undefined ? { startedAgo: outing.startedAgo } : {}) } : {})
        };
    });
};

/** Lo que pasó: cada pelotero con sus puntos del día (el primer juego en que aparece, como en fantasyDay) */
const postgame = async (todays) => {
    const actual = new Map();
    for (const game of todays) for (const player of playersFromFeed(await boxOf(game.gamePk), game.gamePk, true)) if (!actual.has(player.id)) actual.set(player.id, player);
    return actual;
};

/** Las tablas crudas del día (id → { points, games }): esta temporada hasta la víspera y las 3 anteriores completas */
const rawTables = async (day) => {
    const start = `${SEASON}-09-01`;
    const end = shiftDay(day, -1);
    const now = async (group) => (end >= start ? statsOf({ stats: 'byDateRange', group, season: SEASON, startDate: start, endDate: end }) : []);
    const past = (group) => Promise.all([1, 2, 3].map((back) => statsOf({ stats: 'season', group, season: SEASON - back })));
    const [hitNow, pitchNow, hitPast, pitchPast] = [await now('hitting'), await now('pitching'), await past('hitting'), await past('pitching')];
    return {
        B: [tableOfGroup(hitNow, 'hitting'), ...hitPast.map((splits) => tableOfGroup(splits, 'hitting'))],
        P: [tableOfGroup(pitchNow, 'pitching'), ...pitchPast.map((splits) => tableOfGroup(splits, 'pitching'))]
    };
};
const tableOfGroup = (splits, group) => prices.tableOf(splits, group, scoring);

const loadDays = async (season) => {
    const out = [];
    for (const [index, day] of season.days.entries()) {
        const todays = season.all.filter((game) => game.officialDate === day && wasPlayed(game) && FANTASY_TYPES.includes(game.gameType));
        const pool = await pregame(season, day, todays);
        const actual = await postgame(todays);
        const tables = await rawTables(day);
        const table = await prices.dayPrices(league.id, day, scoring);
        const games = todays.map((game) => ({ gamePk: game.gamePk, away: { id: game.teams.away.team.id }, home: { id: game.teams.home.team.id } }));
        // Puntos de verdad de cada uno del roster de la víspera (0 si no jugó o ya no estaba)
        for (const player of pool) {
            const real = actual.get(player.id);
            player.y = real && real.role === player.role ? real.points : 0;
            player.pitched = !!(real && real.played);
        }
        out.push({ day, index, half: index < season.days.length / 2 ? 0 : 1, games, pool, actual, tables, table });
    }
    return out;
};

// --- Proyección con parámetros (espejo de rateTable y projectionOf, rápido para la rejilla) --------------------------

// Los valores de fantasyPrices.js
const BASELINE = { weights: prices.PAST_WEIGHTS, priorGames: prices.PRIOR_GAMES, percentile: prices.PRIOR_PERCENTILE, factors: prices.PROJECTION };

/** Como rateTable: puntos por juego regresados, precio por percentil y el «promedio bajo». `tables` = [ahora, -1, -2, -3] */
const rateWith = (tables, { weights, priorGames, percentile }) => {
    const sums = new Map();
    tables.forEach((table, i) => {
        const weight = i === 0 ? 1 : weights[i - 1];
        if (!weight) return;
        for (const [id, row] of table) {
            const sum = sums.get(id) || { id, points: 0, games: 0 };
            sum.points += weight * row.points;
            sum.games += weight * row.games;
            sums.set(id, sum);
        }
    });
    const rows = [...sums.values()];
    const ppg = new Map();
    const pricesOf = new Map();
    if (!rows.length) return { ppg, prices: pricesOf, prior: 0 };
    const steady = rows.filter((row) => row.games >= 3).map((row) => row.points / row.games).sort((a, b) => a - b);
    const all = rows.map((row) => row.points / row.games).sort((a, b) => a - b);
    const base = steady.length ? steady : all;
    const prior = base[Math.min(base.length - 1, Math.floor(base.length * percentile))];
    const regressed = rows.map((row) => [row.id, (row.points + priorGames * prior) / (row.games + priorGames)]);
    const sorted = regressed.map(([, value]) => value).sort((a, b) => a - b);
    const lowerBound = (value) => {
        let lo = 0;
        let hi = sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sorted[mid] < value) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    };
    const upperBound = (value) => {
        let lo = 0;
        let hi = sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sorted[mid] <= value) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    };
    for (const [id, value] of regressed) {
        const below = lowerBound(value);
        const equal = upperBound(value) - below;
        const pct = sorted.length > 1 ? (below + (equal - 1) / 2) / (sorted.length - 1) : 0.5;
        pricesOf.set(id, Math.round((CREDITS.min + (CREDITS.max - CREDITS.min) * pct) * 2) / 2);
        ppg.set(id, round1(value));
    }
    return { ppg, prices: pricesOf, prior: round1(prior) };
};

/** Como projectionOf, con el factor que le toca según projectionKey del servidor */
const projectWith = (rated, player, { factors }) => {
    const role = player.role === 'P' ? 'P' : 'B';
    const known = rated[role].ppg.get(player.id);
    const base = known !== undefined ? known : rated[role].prior * factors.unknown;
    return round1(base * factors[prices.projectionKey(player)]);
};

// --- Medidas -------------------------------------------------------------------------------------------------------

const ranks = (values) => {
    const order = values.map((value, i) => [value, i]).sort((a, b) => a[0] - b[0]);
    const out = new Array(values.length);
    for (let i = 0; i < order.length; ) {
        let j = i;
        while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
        for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1;
        i = j + 1;
    }
    return out;
};
const pearson = (a, b) => {
    const n = a.length;
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
        num += (a[i] - ma) * (b[i] - mb);
        da += (a[i] - ma) ** 2;
        db += (b[i] - mb) ** 2;
    }
    return da && db ? num / Math.sqrt(da * db) : NaN;
};
const spearman = (x, y) => pearson(ranks(x), ranks(y));

/** Spearman de cada día (entre los de ese día, que es entre quienes se escoge), promediado con el peso de cada día */
const dailySpearman = (rows) => {
    const byDay = new Map();
    for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) || []), row]);
    let sum = 0;
    let weight = 0;
    for (const list of byDay.values()) {
        if (list.length < 5) continue;
        const rho = spearman(
            list.map((row) => row.proj),
            list.map((row) => row.y)
        );
        if (Number.isNaN(rho)) continue;
        sum += rho * list.length;
        weight += list.length;
    }
    return weight ? sum / weight : NaN;
};

const summarize = (rows) => {
    const n = rows.length;
    const mean = (f) => rows.reduce((sum, row) => sum + f(row), 0) / n;
    return {
        n,
        real: mean((row) => row.y),
        proj: mean((row) => row.proj),
        bias: mean((row) => row.proj - row.y),
        mae: mean((row) => Math.abs(row.proj - row.y)),
        rmse: Math.sqrt(mean((row) => (row.proj - row.y) ** 2)),
        rho: dailySpearman(rows)
    };
};

const GROUPS = [
    ['Bateadores', (row) => row.role === 'B'],
    ['  titular', (row) => row.role === 'B' && row.starter],
    ['  suplente', (row) => row.role === 'B' && !row.starter],
    ['Lanzadores', (row) => row.role === 'P'],
    ['  descansa', (row) => row.role === 'P' && row.rest],
    ['  puede lanzar', (row) => row.role === 'P' && !row.rest],
    ['Sin estadísticas', (row) => !row.known]
];

/**
 * Proyección de cada pelotero de cada día y el equipo sugerido contra el ideal. `project(day)` da, para ese día,
 * { projOf: pelotero → puntos, priceOf: pelotero → créditos, knownOf: pelotero → si tiene estadísticas }.
 * El sugerido sale dos veces: con bestLineup tal cual (`capped`) y mirando a todos los peloteros (`full`); el ideal,
 * siempre mirando a todos.
 */
const evaluate = (days, bests, project) => {
    const rows = [];
    const lineups = [];
    for (const day of days) {
        const { projOf, priceOf, knownOf } = project(day);
        const pool = day.pool.map((player) => ({ ...player, proj: projOf(player), price: priceOf(player), points: 0, played: false }));
        for (const player of pool) rows.push({ day: day.day, half: day.half, role: player.role, starter: player.starter, rest: !!player.rest, known: knownOf(player), proj: player.proj, y: player.y });
        const credits = { budget: CREDITS.budget, min: CREDITS.min, max: CREDITS.max };
        const ideal = bests.full.bestLineup({ games: day.games, players: [...day.actual.values()].map((player) => ({ ...player, price: priceOf(player) })), credits }, { metric: 'points', ignoreLocks: true });
        if (!ideal) continue;
        const byId = new Map(pool.map((player) => [player.id, player]));
        const scoreOf = (best) => {
            const suggested = best.bestLineup({ games: day.games, players: pool, credits }, { metric: 'proj', ignoreLocks: true });
            if (!suggested) return null;
            const realOf = (id) => byId.get(id)?.y ?? 0;
            const pitcher = suggested.lineup.map((id) => byId.get(id)).find((player) => player?.role === 'P');
            return {
                projected: suggested.total,
                real: suggested.lineup.reduce((sum, id) => sum + realOf(id), 0) + (suggested.captain ? realOf(suggested.captain) * 0.5 : 0),
                pitcherPitched: !!pitcher?.pitched,
                captainPitcher: byId.get(suggested.captain)?.role === 'P'
            };
        };
        lineups.push({ day: day.day, half: day.half, ideal: ideal.total, capped: scoreOf(bests.capped), full: scoreOf(bests.full) });
    }
    return { rows, lineups };
};

const lineupSummary = (list, kind) => {
    const found = list.filter((item) => item[kind]);
    const mean = (f) => found.reduce((sum, item) => sum + f(item), 0) / found.length;
    return {
        days: list.length,
        missing: list.length - found.length,
        projected: mean((item) => item[kind].projected),
        real: mean((item) => item[kind].real),
        ideal: mean((item) => item.ideal),
        share: found.reduce((sum, item) => sum + item[kind].real, 0) / found.reduce((sum, item) => sum + item.ideal, 0),
        pitcherPitched: mean((item) => (item[kind].pitcherPitched ? 1 : 0)),
        captainPitcher: mean((item) => (item[kind].captainPitcher ? 1 : 0))
    };
};

const fmt = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
const pct = (value) => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—');

const printReport = (title, { rows, lineups }) => {
    console.log(`\n### ${title}\n`);
    for (const [label, half] of [
        ['Toda la temporada', null],
        ['1.ª mitad (ajuste)', 0],
        ['2.ª mitad (validación)', 1]
    ]) {
        const scoped = rows.filter((row) => half === null || row.half === half);
        console.log(`**${label}**\n`);
        console.log('| Grupo | n | Real | Proy. | Sesgo | MAE | RMSE | Spearman/día |');
        console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
        for (const [name, filter] of GROUPS) {
            const s = summarize(scoped.filter(filter));
            if (!s.n) continue;
            console.log(`| ${name.trim()}${name.startsWith(' ') ? ' ·' : ''} | ${s.n} | ${fmt(s.real)} | ${fmt(s.proj)} | ${fmt(s.bias)} | ${fmt(s.mae)} | ${fmt(s.rmse)} | ${fmt(s.rho)} |`);
        }
        const scopedLineups = lineups.filter((item) => half === null || item.half === half);
        const full = lineupSummary(scopedLineups, 'full');
        const capped = lineupSummary(scopedLineups, 'capped');
        console.log(`\nEquipo sugerido (${full.days} días): proyectaba ${fmt(full.projected, 1)} e hizo ${fmt(full.real, 1)}; el ideal hizo ${fmt(full.ideal, 1)} → ${pct(full.share)} del ideal. Su lanzador lanzó ${pct(full.pitcherPitched)} de los días y el capitán fue lanzador ${pct(full.captainPitcher)}.`);
        console.log(`Con bestLineup tal cual (45/20 candidatos): sin sugerido ${capped.missing} días; los demás hizo ${fmt(capped.real, 1)} → ${pct(capped.share)} del ideal.\n`);
    }
};

// --- Rejilla -------------------------------------------------------------------------------------------------------

const range = (from, to, step) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => Math.round((from + i * step) * 1000) / 1000);

const WEIGHTS = (() => {
    const out = new Map();
    for (const first of [0, 0.25, 0.5, 0.75, 1]) for (const decay of [0, 0.25, 0.5, 0.75, 1]) out.set(`${first}/${decay}`, [first, first * decay, first * decay * decay]);
    return [...new Map([...out.values()].map((w) => [w.join(','), w])).values()];
})();
const PRIOR_GAMES = [0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 25, 30];
const PERCENTILES = [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6];

/**
 * Error cuadrático de cada combinación de pesos/prior/percentil con los mejores factores. Primero junta, por combinación
 * y por grupo (rol, mitad, con o sin estadísticas y factor de projectionKey), las sumas que hacen falta: Σb², Σby, Σy² y
 * n, con b = puntos por juego regresados o el prior de los desconocidos. Con ellas, para cada factor del desconocido,
 * el mejor factor de cada grupo sale de una fórmula (mínimos cuadrados): f = (Σby + u·Σpy) / (Σb² + u²·Σp²).
 */
const gridSearch = (days) => {
    const stats = new Map();
    const keyOf = (wi, pi, gi) => `${wi}|${pi}|${gi}`;
    const cell = (groups, key) => groups[key] || (groups[key] = { n: 0, bb: 0, by: 0, yy: 0 });
    WEIGHTS.forEach((weights, wi) => {
        for (const day of days) {
            for (const role of ['B', 'P']) {
                const sums = new Map();
                day.tables[role].forEach((table, i) => {
                    const weight = i === 0 ? 1 : weights[i - 1];
                    if (!weight) return;
                    for (const [id, row] of table) {
                        const sum = sums.get(id) || { points: 0, games: 0 };
                        sum.points += weight * row.points;
                        sum.games += weight * row.games;
                        sums.set(id, sum);
                    }
                });
                const rows = [...sums.values()];
                const steady = rows.filter((row) => row.games >= 3).map((row) => row.points / row.games).sort((a, b) => a - b);
                const base = steady.length ? steady : rows.map((row) => row.points / row.games).sort((a, b) => a - b);
                const players = day.pool.filter((player) => player.role === role).map((player) => ({ sum: sums.get(player.id), key: prices.projectionKey(player), y: player.y }));
                PERCENTILES.forEach((percentile, pi) => {
                    const prior = base.length ? base[Math.min(base.length - 1, Math.floor(base.length * percentile))] : 0;
                    PRIOR_GAMES.forEach((priorGames, gi) => {
                        const key = keyOf(wi, pi, gi);
                        if (!stats.has(key)) stats.set(key, { B: [{}, {}], P: [{}, {}] });
                        const groups = stats.get(key)[role][day.half];
                        for (const player of players) {
                            const b = player.sum ? (player.sum.points + priorGames * prior) / (player.sum.games + priorGames) : prior;
                            const g = cell(groups, `${player.sum ? 'k' : 'u'}:${player.key}`);
                            g.n += 1;
                            g.bb += b * b;
                            g.by += b * player.y;
                            g.yy += player.y * player.y;
                        }
                    });
                });
            }
        }
    });

    const zero = { n: 0, bb: 0, by: 0, yy: 0 };
    const keysOf = (groups) => [...new Set(Object.keys(groups).map((name) => name.slice(2)))].sort();
    // Error de unos factores (`factors[key]` y `unknown`) con las sumas de una mitad
    const errorOf = (groups, factors) => {
        let sse = 0;
        let n = 0;
        for (const [name, g] of Object.entries(groups)) {
            const f = factors[name.slice(2)] * (name[0] === 'u' ? factors.unknown : 1);
            sse += f * f * g.bb - 2 * f * g.by + g.yy;
            n += g.n;
        }
        return sse / n;
    };
    const fit = (groups) => {
        let top = null;
        for (const unknown of range(0, 1.5, 0.05)) {
            const factors = { unknown };
            for (const key of keysOf(groups)) {
                const k = groups[`k:${key}`] || zero;
                const u = groups[`u:${key}`] || zero;
                const den = k.bb + unknown * unknown * u.bb;
                factors[key] = den ? Math.max(0, (k.by + unknown * u.by) / den) : 0;
            }
            const train = errorOf(groups, factors);
            if (!top || train < top.train) top = { train, factors };
        }
        return top;
    };

    const results = { B: [], P: [] };
    for (const [key, roles] of stats) {
        const [wi, pi, gi] = key.split('|').map(Number);
        for (const role of ['B', 'P']) {
            const top = fit(roles[role][0]);
            results[role].push({ weights: WEIGHTS[wi], priorGames: PRIOR_GAMES[gi], percentile: PERCENTILES[pi], factors: top.factors, trainMse: top.train, testMse: errorOf(roles[role][1], top.factors) });
        }
    }
    // El error con los valores de ahora, para comparar
    const baseKey = keyOf(
        WEIGHTS.findIndex((w) => w.join(',') === BASELINE.weights.join(',')),
        PERCENTILES.indexOf(BASELINE.percentile),
        PRIOR_GAMES.indexOf(BASELINE.priorGames)
    );
    const baseline = Object.fromEntries(['B', 'P'].map((role) => [role, [0, 1].map((half) => errorOf(stats.get(baseKey)[role][half], BASELINE.factors))]));
    return { results, baseline };
};

// --- Lanzadores: quién lanza de verdad ------------------------------------------------------------------------------

/** Lanzadores por el factor que les toca (projectionKey): cuántos lanzaron, sus puntos y lo que se les proyectó */
const pitcherReport = (days, { rows }) => {
    const buckets = new Map();
    let i = 0;
    for (const day of days) {
        for (const player of day.pool) {
            const row = rows[i++];
            if (player.role !== 'P') continue;
            const key = prices.projectionKey(player);
            const bucket = buckets.get(key) || { n: 0, pitched: 0, points: 0, proj: 0 };
            bucket.n += 1;
            bucket.pitched += player.pitched ? 1 : 0;
            bucket.points += player.y;
            bucket.proj += row.proj;
            buckets.set(key, bucket);
        }
    }
    console.log('\n### Lanzadores según sus salidas de los 10 días anteriores (projectionKey)\n');
    console.log('| Factor | n | Lanzó | Puntos medios | Proyección media |');
    console.log('|---|---:|---:|---:|---:|');
    for (const [key, bucket] of [...buckets].sort()) console.log(`| ${key} (×${prices.PROJECTION[key]}) | ${bucket.n} | ${pct(bucket.pitched / bucket.n)} | ${fmt(bucket.points / bucket.n)} | ${fmt(bucket.proj / bucket.n)} |`);
};

// --- Principal -----------------------------------------------------------------------------------------------------

const main = async () => {
    console.error(`Temporada LIDOM ${SEASON}-${String((SEASON + 1) % 100).padStart(2, '0')} · caché ${CACHE}${FIX_POSTPONED ? ' · sin pospuestos' : ''}`);
    const season = await loadSeason();
    console.error(`${season.days.length} días con juegos (${season.days[0]} a ${season.days.at(-1)})`);
    const days = (await loadDays(season)).filter((day) => day.pool.length);
    console.error(`${days.length} días con roster de la víspera · ${requests} pedidos a MLB en esta corrida`);
    const best = { capped: loadBest(), full: loadBest(true) };

    // Con el código del servidor (los valores que tenga fantasyPrices.js ahora)
    const server = evaluate(days, best, (day) => ({
        projOf: (player) => prices.projectionOf(day.table, player),
        priceOf: (player) => new Map(day.table.prices[player.role === 'P' ? 'P' : 'B']).get(player.id) ?? CREDITS.unknown,
        knownOf: (player) => day.table.ppg[player.role === 'P' ? 'P' : 'B'].some(([id]) => id === player.id)
    }));
    printReport('Con fantasyPrices.js tal como está', server);

    // El espejo con los valores de ahora tiene que dar exactamente lo mismo que el servidor
    const mirrorOf = (params) => (day) => {
        const rated = { B: rateWith(day.tables.B, params), P: rateWith(day.tables.P, params) };
        return {
            projOf: (player) => projectWith(rated, player, params),
            priceOf: (player) => rated[player.role === 'P' ? 'P' : 'B'].prices.get(player.id) ?? CREDITS.unknown,
            knownOf: (player) => rated[player.role === 'P' ? 'P' : 'B'].ppg.has(player.id)
        };
    };
    const mirror = evaluate(days, best, mirrorOf(BASELINE));
    const mismatches = mirror.rows.filter((row, i) => row.proj !== server.rows[i].proj).length;
    console.error(`Espejo vs servidor con los valores de fantasyPrices.js: ${mismatches} proyecciones distintas de ${mirror.rows.length}`);

    // --params='{"priorGames":8,"factors":{"due":0.6}}': los mismos días con otros valores (encima de los de ahora)
    const custom = arg('params', null);
    if (custom) {
        const given = JSON.parse(custom);
        const params = { ...BASELINE, ...given, factors: { ...BASELINE.factors, ...given.factors } };
        printReport(`Con ${JSON.stringify(given)}`, evaluate(days, best, mirrorOf(params)));
    }

    if (flag('pitchers')) pitcherReport(days, server);

    if (!flag('grid')) return;
    const { results, baseline } = gridSearch(days);
    fs.writeFileSync(path.join(CACHE, `grid-${SEASON}${FIX_POSTPONED ? '-fix' : ''}.json`), JSON.stringify(results));
    const same = (item) => item.weights.join(',') === BASELINE.weights.join(',') && item.priorGames === BASELINE.priorGames && item.percentile === BASELINE.percentile;
    for (const role of ['B', 'P']) {
        const list = results[role].sort((a, b) => a.trainMse - b.trainMse);
        const keys = Object.keys(list[0].factors);
        console.log(`\n#### ${role === 'B' ? 'Bateadores' : 'Lanzadores'} (ahora: MSE ${fmt(baseline[role][0], 3)} / ${fmt(baseline[role][1], 3)})\n`);
        console.log(`| Pesos pasadas | PRIOR_GAMES | Percentil | ${keys.join(' | ')} | MSE 1.ª | MSE 2.ª |`);
        console.log(`|---|---:|---:|${keys.map(() => '---:|').join('')}---:|---:|`);
        // Los 10 mejores en la 1.ª mitad y los mejores factores con los pesos/prior/percentil de ahora (los que fijan los precios)
        for (const item of [...list.slice(0, 10), list.find(same)])
            console.log(`| ${same(item) ? '**ahora** ' : ''}${item.weights.join(' / ')} | ${item.priorGames} | ${item.percentile} | ${keys.map((key) => fmt(item.factors[key], 3)).join(' | ')} | ${fmt(item.trainMse, 3)} | ${fmt(item.testMse, 3)} |`);
    }
};

// Con require (otro script de análisis) solo da las piezas
if (require.main === module) {
    main().catch((problem) => {
        console.error(problem.message);
        process.exit(1);
    });
}

module.exports = { get, slimBox, boxOf, loadSeason, loadDays, loadBest, evaluate, summarize, printReport, rateWith, projectWith, BASELINE, wasPlayed, teamsOf, shiftDay };
