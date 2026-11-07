const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { cached } = require('../utils/cache');

// Créditos del fantasy: cada pelotero tiene un precio del día (de 4 a 12 créditos, de medio en medio) y el equipo
// no puede pasar del presupuesto. El precio sale de sus puntos de fantasy por juego hasta el día anterior (esta
// temporada completa más las 3 anteriores de la liga, cada una con menos peso), comparado con los de su rol: así no
// cambia durante el día y se puede volver a calcular igual para los días pasados.

const CREDITS = { budget: 50, min: 4, max: 12, step: 0.5, unknown: 5 };
// Desde este día se juega con créditos (los días anteriores se puntúan como antes)
const CREDITS_FROM = '2026-10-17';
// Temporadas anteriores que cuentan y su peso: la pasada vale la mitad, la de antes un cuarto y la otra un octavo.
// Además cada pelotero arranca con 4 juegos «promedio bajo» (para que 1 juego no lo dispare).
const PAST_WEIGHTS = [0.5, 0.25, 0.125];
const PRIOR_GAMES = 4;
const PRIOR_PERCENTILE = 0.35;
// Con menos peloteros con datos que esto (p. ej. un torneo corto sin historia) no se juega con créditos
const MIN_PLAYERS = 20;
// Qué parte de sus puntos por juego se espera de cada uno ese día, medido con la temporada 2025-26
// (scripts/backtest-fantasy.js): el titular del último juego no siempre batea hoy y el suplente entra poco. Un lanzador,
// según sus salidas de los 10 días anteriores (projectionKey): el que abrió el último juego o hace 2 a 4 días casi
// nunca lanza; el que abrió hace 5 o 6 días abre la mitad de las veces y el que abrió hace más, una de cada cuatro; un
// relevista lanza en 3 de cada 10 juegos y el que no ha salido en esos días, mucho menos. `pitcher` es para el lanzador
// sin ese dato (en LIDOM lanza en 1 de cada 4 juegos). Sin historia: la mitad del «promedio bajo».
// Cuando se sabe (alineación anunciada, abridor probable o el juego ya empezó), el que batea o abre juega seguro: ×1.
// El de un juego pospuesto no juega ese día: ×0.
const PROJECTION = {
    confirmed: 1,
    probable: 1,
    // Le toca abrir por la rotación (estimado, no anunciado)
    rotation: 0.85,
    postponed: 0,
    starter: 0.85,
    bench: 0.3,
    pitcher: 0.25,
    rest: 0.025,
    resting: 0.01,
    due: 0.6,
    late: 0.35,
    reliever: 0.3,
    idle: 0.15,
    unknown: 0.5
};

const shiftDay = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const todayIn = (timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Temporada a la que pertenece un día: LIDOM S = del S-09-01 al (S+1)-03-31; las demás ligas, el año */
const seasonOfDay = (leagueKey, date) => {
    const year = Number(date.slice(0, 4));
    if (leagueKey === 'lidom') return Number(date.slice(5, 7)) >= 9 ? year : year - 1;
    return year;
};
const seasonStart = (leagueKey, season) => (leagueKey === 'lidom' ? `${season}-09-01` : `${season}-01-01`);

const roundHalf = (value) => Math.round(value / CREDITS.step) * CREDITS.step;

const outsOf = (s = {}) => {
    if (typeof s.outs === 'number') return s.outs;
    const [whole, part] = String(s.inningsPitched ?? '0').split('.');
    return Number(whole || 0) * 3 + Number(part || 0);
};

/** Puntos y juegos de cada pelotero con una lista de splits de MLB (`group` hitting o pitching) */
const tableOf = (splits, group, scoring) => {
    const table = new Map();
    for (const split of splits || []) {
        const id = split?.player?.id;
        const stat = split?.stat;
        if (!id || !stat) continue;
        const games = group === 'pitching' ? (stat.gamesPitched ?? stat.gamesPlayed ?? 0) : (stat.gamesPlayed ?? 0);
        if (!games) continue;
        const points = group === 'pitching' ? scoring.pitcherPoints({ ...stat, outs: outsOf(stat) }) : scoring.batterPoints(stat);
        const current = table.get(id) || { points: 0, games: 0 };
        table.set(id, { points: current.points + points, games: current.games + games });
    }
    return table;
};

/**
 * Precio y proyección de un rol: puntos por juego regresados hacia un «promedio bajo» (la proyección) y pasados a
 * percentil dentro del rol (el precio). `weighted` es una lista de { table, weight } (tabla id → { points, games } de
 * cada temporada con su peso). Devuelve { prices: id → precio, ppg: id → puntos por juego esperados, prior }.
 */
const rateTable = (weighted) => {
    const sums = new Map();
    for (const { table, weight } of weighted) {
        for (const [id, row] of table) {
            const sum = sums.get(id) || { id, points: 0, games: 0 };
            sum.points += weight * row.points;
            sum.games += weight * row.games;
            sums.set(id, sum);
        }
    }
    const rows = [...sums.values()];
    const prices = new Map();
    const ppg = new Map();
    if (!rows.length) return { prices, ppg, prior: 0 };
    // El «promedio bajo»: el percentil 35 de los puntos por juego de quienes jugaron al menos 3 juegos
    const steady = rows.filter((row) => row.games >= 3).map((row) => row.points / row.games).sort((a, b) => a - b);
    const all = rows.map((row) => row.points / row.games).sort((a, b) => a - b);
    const base = steady.length ? steady : all;
    const prior = base[Math.min(base.length - 1, Math.floor(base.length * PRIOR_PERCENTILE))];
    const regressed = rows.map((row) => ({ id: row.id, ppg: (row.points + PRIOR_GAMES * prior) / (row.games + PRIOR_GAMES) }));
    const sorted = regressed.map((row) => row.ppg).sort((a, b) => a - b);
    for (const row of regressed) {
        const below = sorted.filter((value) => value < row.ppg).length;
        const equal = sorted.filter((value) => value === row.ppg).length;
        const percentile = sorted.length > 1 ? (below + (equal - 1) / 2) / (sorted.length - 1) : 0.5;
        prices.set(row.id, roundHalf(CREDITS.min + (CREDITS.max - CREDITS.min) * percentile));
        ppg.set(row.id, Math.round(row.ppg * 10) / 10);
    }
    return { prices, ppg, prior: Math.round(prior * 10) / 10 };
};

/** Solo los precios (id → precio) */
const priceTable = (weighted) => rateTable(weighted).prices;

// ".287" como lo escribe MLB (sin el cero de delante); 1.034 queda igual
const rate3 = (value) => (Number.isFinite(value) ? value : 0).toFixed(3).replace(/^0(?=\.)/, '');

/**
 * Línea de la temporada de cada pelotero con los splits de la temporada actual hasta el día anterior: bateador
 * { avg, ops, hr, g } y lanzador { era, whip, k, g }. Un pelotero que cambió de equipo trae un split por equipo: se
 * suman los conteos y los promedios salen de ahí.
 */
const seasonLines = (splits, group) => {
    const sums = new Map();
    for (const split of splits || []) {
        const id = split?.player?.id;
        const stat = split?.stat;
        if (!id || !stat) continue;
        const sum = sums.get(id) || { g: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, hbp: 0, sf: 0, outs: 0, er: 0, k: 0 };
        sum.g += group === 'pitching' ? (stat.gamesPitched ?? stat.gamesPlayed ?? 0) : (stat.gamesPlayed ?? 0);
        sum.ab += stat.atBats ?? 0;
        sum.h += stat.hits ?? 0;
        sum.d += stat.doubles ?? 0;
        sum.t += stat.triples ?? 0;
        sum.hr += stat.homeRuns ?? 0;
        sum.bb += stat.baseOnBalls ?? 0;
        sum.hbp += stat.hitByPitch ?? 0;
        sum.sf += stat.sacFlies ?? 0;
        sum.outs += group === 'pitching' ? outsOf(stat) : 0;
        sum.er += stat.earnedRuns ?? 0;
        sum.k += stat.strikeOuts ?? 0;
        sums.set(id, sum);
    }
    const lines = new Map();
    for (const [id, s] of sums) {
        if (!s.g) continue;
        if (group === 'pitching') {
            lines.set(id, { era: s.outs ? ((s.er * 27) / s.outs).toFixed(2) : '-.--', whip: s.outs ? (((s.h + s.bb) * 3) / s.outs).toFixed(2) : '-.--', k: s.k, g: s.g });
        } else {
            const onBase = s.ab + s.bb + s.hbp + s.sf;
            const obp = onBase ? (s.h + s.bb + s.hbp) / onBase : 0;
            const slg = s.ab ? (s.h + s.d + 2 * s.t + 3 * s.hr) / s.ab : 0;
            lines.set(id, { avg: rate3(s.ab ? s.h / s.ab : 0), ops: rate3(obp + slg), hr: s.hr, g: s.g });
        }
    }
    return lines;
};

/** Una temporada pasada completa de la liga (ya no cambia: una semana en caché) */
const pastSeason = (league, season, group) =>
    cached(`fantasy_past_${league.id}_${season}_${group}`, 7 * 86400, () => statsOf(league, { stats: 'season', group, season }), { staleSec: 7 * 86400 });

const statsOf = (league, params) => http.mlbGet(`${MLB_API_BASE}/stats`, { gameType: 'R', leagueId: league.leagueId, playerPool: 'ALL', limit: 2000, ...params }).then((data) => data?.stats?.[0]?.splits || []);

/**
 * Está fijo: los datos llegan hasta el día anterior y ese día ya pasó (sus juegos terminaron). Entonces volver a
 * calcularlo da lo mismo y se guarda una semana.
 */
const isSettled = (league, date, end) => end === shiftDay(date, -1) && end < todayIn(league.timeZone);

/**
 * Precios del día para una liga: { budget, prices: { B, P }, ppg, prior, season, through, frozen } o null si no hay
 * datos suficientes (entonces ese día no se juega con créditos). `scoring` trae batterPoints y pitcherPoints (de
 * fantasy.js). Solo usa datos de antes del día: `through` es el último día con todos sus juegos terminados (fantasyDay
 * lo sabe por el calendario; por defecto, el día anterior). Mientras falte algún juego de antes (p. ej. los de mañana
 * con los de hoy en curso), el precio es provisional (`frozen: false`) y no cambia con cada jugada: usa lo de hasta
 * `through` y se recalcula cuando ese juego termina. Desde ahí queda fijo: no cambia durante el día.
 */
const dayPrices = (leagueKey, date, scoring, { through } = {}) => {
    const league = LEAGUES[leagueKey] || LEAGUES.lidom;
    const yesterday = shiftDay(date, -1);
    const end = through && through < yesterday ? through : yesterday;
    const frozen = isSettled(league, date, end);
    return cached(
        `fantasy_prices_${league.id}_${date}_${end}`,
        frozen ? 7 * 86400 : 15 * 60,
        async () => {
            const season = seasonOfDay(league.id, date);
            const start = seasonStart(league.id, season);
            const range = (group) => (end >= start ? statsOf(league, { stats: 'byDateRange', group, season, startDate: start, endDate: end }) : Promise.resolve([]));
            const [hitNow, pitchNow, ...past] = await Promise.all([
                range('hitting'),
                range('pitching'),
                ...PAST_WEIGHTS.flatMap((_, i) => [pastSeason(league, season - 1 - i, 'hitting'), pastSeason(league, season - 1 - i, 'pitching')])
            ]);
            const seasons = (now, offset, group) => [
                { table: tableOf(now, group, scoring), weight: 1 },
                ...PAST_WEIGHTS.map((weight, i) => ({ table: tableOf(past[i * 2 + offset], group, scoring), weight }))
            ];
            const batters = rateTable(seasons(hitNow, 0, 'hitting'));
            const pitchers = rateTable(seasons(pitchNow, 1, 'pitching'));
            if (batters.prices.size + pitchers.prices.size < MIN_PLAYERS) return null;
            return {
                budget: CREDITS.budget,
                prices: { B: [...batters.prices], P: [...pitchers.prices] },
                ppg: { B: [...batters.ppg], P: [...pitchers.ppg] },
                prior: { B: batters.prior, P: pitchers.prior },
                season: { B: [...seasonLines(hitNow, 'hitting')], P: [...seasonLines(pitchNow, 'pitching')] },
                through: end,
                frozen
            };
        },
        { staleSec: frozen ? 7 * 86400 : 6 * 3600 }
    );
};

/**
 * Qué factor de PROJECTION le toca a un pelotero ese día. Con `status` (de fantasyDay): el bateador de la alineación
 * anunciada (o del juego ya empezado) y el abridor probable (o el que abrió) juegan seguro; el de un juego pospuesto,
 * no. Si no, bateador: titular o suplente (estuvo o no en la alineación del último juego de su equipo). Lanzador:
 * `rest` (abrió el último juego) o, con sus salidas de los 10 días anteriores (`outings` y `startedAgo`), si le toca
 * abrir, descansa o es relevista.
 */
const projectionKey = (player) => {
    if (player.status === 'postponed') return 'postponed';
    if (player.role !== 'P') return player.status === 'confirmed' ? 'confirmed' : player.starter ? 'starter' : 'bench';
    if (player.status === 'rotation') return 'rotation';
    if (player.status === 'probable') return 'probable';
    if (player.rest) return 'rest';
    if (player.outings === undefined) return 'pitcher';
    if (player.startedAgo !== undefined) return player.startedAgo <= 4 ? 'resting' : player.startedAgo <= 6 ? 'due' : 'late';
    return player.outings ? 'reliever' : 'idle';
};

/**
 * Puntos que se esperan de un pelotero ese día: sus puntos por juego (o la mitad del «promedio bajo» si no tiene
 * historia) por la parte que se espera que juegue (PROJECTION, según projectionKey). En LIDOM no se anuncian
 * alineaciones ni abridores: es una estimación. `factors` es para medir otros valores (scripts/backtest-fantasy.js).
 */
const projectionOf = (table, player, factors = PROJECTION) => {
    const role = player.role === 'P' ? 'P' : 'B';
    const list = table?.ppg?.[role];
    const known = Array.isArray(list) ? list.find(([id]) => id === player.id) : null;
    const base = known ? known[1] : (table?.prior?.[role] ?? 0) * factors.unknown;
    const key = projectionKey(player);
    return Math.round(base * (factors[key] ?? PROJECTION[key]) * 10) / 10;
};

module.exports = { CREDITS, CREDITS_FROM, PAST_WEIGHTS, PRIOR_GAMES, PRIOR_PERCENTILE, PROJECTION, dayPrices, priceTable, rateTable, tableOf, seasonLines, seasonOfDay, projectionKey, projectionOf };
