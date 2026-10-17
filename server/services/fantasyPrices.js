const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { cached } = require('../utils/cache');

// Créditos del fantasy: cada pelotero tiene un precio del día (de 4 a 12 créditos, de medio en medio) y el equipo
// no puede pasar del presupuesto. El precio sale de sus puntos de fantasy por juego hasta el día anterior (esta
// temporada, más media temporada pasada), comparado con los de su rol en la liga: así no cambia durante el día
// y se puede volver a calcular igual para los días pasados.

const CREDITS = { budget: 50, min: 4, max: 12, unknown: 5 };
// Desde este día se juega con créditos (los días anteriores se puntúan como antes)
const CREDITS_FROM = '2026-10-17';
// La temporada pasada vale la mitad y cada pelotero arranca con 4 juegos «promedio bajo» (para que 1 juego no lo dispare)
const PREV_WEIGHT = 0.5;
const PRIOR_GAMES = 4;
const PRIOR_PERCENTILE = 0.35;
// Con menos peloteros con datos que esto (p. ej. un torneo corto sin historia) no se juega con créditos
const MIN_PLAYERS = 20;

const shiftDay = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const todayIn = (timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Temporada a la que pertenece un día: LIDOM S = del S-09-01 al (S+1)-03-31; las demás ligas, el año */
const seasonOfDay = (leagueKey, date) => {
    const year = Number(date.slice(0, 4));
    if (leagueKey === 'lidom') return Number(date.slice(5, 7)) >= 9 ? year : year - 1;
    return year;
};
const seasonStart = (leagueKey, season) => (leagueKey === 'lidom' ? `${season}-09-01` : `${season}-01-01`);

const roundHalf = (value) => Math.round(value * 2) / 2;

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
 * Precios de un rol: puntos por juego regresados hacia un «promedio bajo» y pasados a percentil dentro del rol.
 * `current` y `previous` son tablas id → { points, games }. Devuelve id → precio.
 */
const priceTable = (current, previous) => {
    const ids = new Set([...current.keys(), ...previous.keys()]);
    const rows = [...ids].map((id) => {
        const cur = current.get(id) || { points: 0, games: 0 };
        const prev = previous.get(id) || { points: 0, games: 0 };
        return { id, points: cur.points + PREV_WEIGHT * prev.points, games: cur.games + PREV_WEIGHT * prev.games };
    });
    const prices = new Map();
    if (!rows.length) return prices;
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
    }
    return prices;
};

const statsOf = (league, params) => http.mlbGet(`${MLB_API_BASE}/stats`, { gameType: 'R', leagueId: league.leagueId, playerPool: 'ALL', limit: 2000, ...params }).then((data) => data?.stats?.[0]?.splits || []);

/**
 * Precios del día para una liga: { budget, prices: { B: Map, P: Map } } o null si no hay datos suficientes
 * (entonces ese día no se juega con créditos). `scoring` trae batterPoints y pitcherPoints (de fantasy.js).
 */
const dayPrices = (leagueKey, date, scoring) => {
    const league = LEAGUES[leagueKey] || LEAGUES.lidom;
    const today = todayIn(league.timeZone);
    return cached(
        `fantasy_prices_${league.id}_${date}`,
        // Un día pasado ya no cambia; el de hoy y los de mañana, cada 6 h (el de mañana depende de los juegos de hoy)
        date < today ? 7 * 86400 : 6 * 3600,
        async () => {
            const season = seasonOfDay(league.id, date);
            const start = seasonStart(league.id, season);
            const end = shiftDay(date, -1);
            const range = (group) => (end >= start ? statsOf(league, { stats: 'byDateRange', group, season, startDate: start, endDate: end }) : Promise.resolve([]));
            const full = (group) => statsOf(league, { stats: 'season', group, season: season - 1 });
            const [hitNow, pitchNow, hitPrev, pitchPrev] = await Promise.all([range('hitting'), range('pitching'), full('hitting'), full('pitching')]);
            const batters = priceTable(tableOf(hitNow, 'hitting', scoring), tableOf(hitPrev, 'hitting', scoring));
            const pitchers = priceTable(tableOf(pitchNow, 'pitching', scoring), tableOf(pitchPrev, 'pitching', scoring));
            if (batters.size + pitchers.size < MIN_PLAYERS) return null;
            return { budget: CREDITS.budget, prices: { B: [...batters], P: [...pitchers] } };
        },
        { staleSec: 6 * 3600 }
    );
};

module.exports = { CREDITS, CREDITS_FROM, dayPrices, priceTable, tableOf, seasonOfDay };
