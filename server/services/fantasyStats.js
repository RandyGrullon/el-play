const fans = require('./fantasyFans'); // por el módulo: cachedDay usa fantasy.fantasyDay, que las pruebas sustituyen
const accounts = require('./pro/accounts');
const { fanDay } = require('./pro/fans');
const { todayOf, shiftDay } = require('./pro/games');
const { dayResult, dayStarted, lockTime, isPostponedGame, round1 } = require('./fantasyScore');
const { cached } = require('../utils/cache');
const { achievementsOf } = require('./fantasyAchievements');

// Fantasy v3: la temporada completa de un fanático («Mi temporada»: GET /v2/fantasy/fan/:userId/stats) y las semanas
// de una liga privada (GET /v2/fantasy/weeks). Las mismas cuentas que la tabla de la temporada: los días salen de
// cachedDay (el caché de GET /v2/fantasy) y el equipo que cuenta de effectiveEntry. Lo de juegos que no han empezado
// no sale (fanDay lo esconde) para que nadie lo copie.
// Con MLB_MOCK=1 los equipos son de los fanáticos simulados (./pro/mockFans.js), con 4 semanas de días.

const MAX_ROWS = 10000;
const FAN_SEASON_ROWS = 400;
const TOP_PLAYERS = 12;
const WEEKS = 4;
// La función de Vercel tiene 30 s: a los ~20 s se responde con lo que haya
const BUDGET_MS = 20000;
// Simulador: días con equipos (las 4 semanas de /weeks completas) y tamaño de las ligas simuladas
const MOCK_DAYS = 28;
const MOCK_LEAGUE = 10;

// ---------------------------------------------------------------- equipos guardados

/** Equipos simulados ({ userId, date, entry }), de los fanáticos simulados o de una cuenta cualquiera */
const mockEntries = async (league, { from, to, userId }) => {
    const mock = require('./pro/mockFans');
    const today = todayOf(league);
    const first = [from, shiftDay(today, -(MOCK_DAYS - 1))].filter(Boolean).sort().pop();
    const last = [to, today].filter(Boolean).sort()[0];
    const users = userId ? [userId] : mock.FAN_IDS;
    const rows = [];
    for (let date = last; date >= first; date = shiftDay(date, -1)) {
        let day;
        try {
            day = await fans.cachedDay(league, date);
        } catch {
            continue;
        }
        if (!day.games.length) continue;
        for (const user of users) {
            const entry = mock.entryFor(user, day);
            if (entry) rows.push(entry);
        }
    }
    return accounts.cleanRows(rows);
};

/** Equipos de la liga ({ entries, cut }), de Supabase o del simulador */
const entriesOf = async (league, { from, to, userId, max }) => {
    if (accounts.isMock()) return { entries: await mockEntries(league, { from, to, userId }), cut: false };
    return accounts.entries({ league, from, to, userId, max });
};

// ---------------------------------------------------------------- todos los fanáticos, día por día

const hasLive = (day) => day.games.some((game) => game.state === 'live');

/**
 * Los puntos de cada fanático en cada día de la temporada con juegos empezados: para el puesto de cada día y las
 * semanas. Si la temporada pasa de 10000 filas se cuentan las más nuevas y el día más viejo (que pudo quedar a
 * medias) no se usa.
 */
const computeTable = async (league, today) => {
    const deadline = Date.now() + BUDGET_MS;
    const range = await fans.seasonRange(league, today);
    const table = { range, totals: new Map(), byUser: new Map(), gameDays: [], liveDays: new Set(), partial: false, ttl: 300 };
    if (range.start > range.end) return table;
    const { entries, cut } = await entriesOf(league, { from: range.start, to: range.end, max: MAX_ROWS });
    const inSeason = entries.filter((item) => item.date >= range.start && item.date <= range.end);
    const dates = [...new Set(inSeason.map((item) => item.date))].sort((a, b) => b.localeCompare(a));
    const computed = await fans.computeDays(league, dates, { deadline });
    const { days, error } = computed;
    if (error && !days.size) throw error;
    const oldest = cut ? dates[dates.length - 1] : null;
    const usable = (date) => date !== oldest && days.has(date) && dayStarted(days.get(date));
    for (const { userId, date, entry } of inSeason) {
        if (!usable(date)) continue;
        const total = dayResult(days.get(date), entry).total;
        if (!table.totals.has(date)) table.totals.set(date, []);
        table.totals.get(date).push(total);
        if (!table.byUser.has(userId)) table.byUser.set(userId, new Map());
        table.byUser.get(userId).set(date, total);
    }
    for (const list of table.totals.values()) list.sort((a, b) => b - a);
    table.gameDays = dates.filter(usable).sort();
    table.liveDays = new Set(dates.filter((date) => days.has(date) && hasLive(days.get(date))));
    table.partial = computed.partial || cut;
    // Si quedó a medias se vuelve a intentar enseguida (los días ya calculados quedan en caché)
    table.ttl = table.partial ? 5 : table.liveDays.size ? 60 : 300;
    return table;
};

const seasonTable = (league, today) => cached(`fantasy_table_${league}_${today}`, (value) => value.ttl, () => computeTable(league, today), { staleSec: 600 });

/** Puesto compartido de un fanático en un día (los empates comparten puesto) y cuántos jugaron ese día */
const rankIn = (table, date, userId, total) => {
    const list = table.totals.get(date);
    if (!list) return { rank: null, players: 0 };
    const own = table.byUser.get(userId)?.get(date);
    const value = own ?? total;
    return { rank: 1 + list.filter((other) => other > value).length, players: list.length + (own === undefined ? 1 : 0) };
};

// ---------------------------------------------------------------- semanas (lunes a domingo, en la hora de la liga)

/** Lunes de la semana de un día AAAA-MM-DD */
const weekStartOf = (date) => shiftDay(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

const byTotal = (a, b) => b.total - a.total || a.days - b.days || a.userId.localeCompare(b.userId);

/**
 * Tabla de una semana entre unos fanáticos. `totalsOf(userId)` da sus puntos por día (Map). El campeón solo cuenta
 * con la semana terminada (después del domingo y sin juegos en vivo); un empate en puntos lo gana el de menos días y,
 * si también empatan en días, no hay campeón.
 */
const weekTable = ({ start, today, users, totalsOf, liveDays = new Set() }) => {
    const end = shiftDay(start, 6);
    const rows = users.map((userId) => {
        let total = 0;
        let days = 0;
        for (const [date, value] of totalsOf(userId) || []) {
            if (date < start || date > end) continue;
            total += value;
            days += 1;
        }
        return { userId, total: round1(total), days };
    });
    rows.sort(byTotal);
    rows.forEach((row, index) => (row.rank = index > 0 && row.total === rows[index - 1].total ? rows[index - 1].rank : index + 1));
    let over = today > end;
    for (let date = start; over && date <= end; date = shiftDay(date, 1)) if (liveDays.has(date)) over = false;
    const [top, next] = rows;
    const champion = over && top && top.days > 0 && top.total > 0 && !(next && next.total === top.total && next.days === top.days) ? top.userId : null;
    return { start, end, rows: rows.map(({ userId, total, days, rank }) => ({ userId, total, days, rank })), champion };
};

/** La semana actual y las `count - 1` anteriores, de la más nueva a la más vieja */
const weeksOf = ({ today, users, totalsOf, liveDays, count = WEEKS }) => {
    const current = weekStartOf(today);
    return Array.from({ length: count }, (_, index) => weekTable({ start: shiftDay(current, -7 * index), today, users, totalsOf, liveDays }));
};

/** Simulador: puntos por día de cuentas que no son de los fanáticos simulados (p. ej. los miembros reales de una liga) */
const mockTotals = async (league, userIds, from, to) => {
    const out = new Map();
    for (const userId of userIds) {
        const { entries } = await entriesOf(league, { userId, from, to });
        const totals = new Map();
        for (const { date, entry } of entries) {
            const day = await fans.cachedDay(league, date).catch(() => null);
            if (day && dayStarted(day)) totals.set(date, dayResult(day, entry).total);
        }
        out.set(userId, totals);
    }
    return out;
};

/** Semanas de una liga privada: sus miembros (`users`), la semana actual y las 3 anteriores */
const fantasyWeeks = async (league, users, { today = todayOf(league) } = {}) => {
    const table = await seasonTable(league, today);
    const from = shiftDay(weekStartOf(today), -7 * (WEEKS - 1));
    const extra = accounts.isMock() ? await mockTotals(league, users.filter((id) => !table.byUser.has(id)), from, today) : new Map();
    const totalsOf = (userId) => table.byUser.get(userId) || extra.get(userId) || new Map();
    return {
        league,
        weeks: weeksOf({ today, users, totalsOf, liveDays: table.liveDays }),
        partial: table.partial,
        live: table.liveDays.size > 0,
        updatedAt: new Date().toISOString()
    };
};

/** Segundos de caché de las semanas: a medias 30 s, en vivo 1 min, si no 5 min */
const weeksTtl = (data) => (data.partial ? 30 : data.live ? 60 : 300);

// ---------------------------------------------------------------- ligas de un fanático (para «campeón de la semana»)

/**
 * Miembros de cada liga privada del fanático. Con la llave publishable no se pueden leer (las ligas solo las ven sus
 * miembros): null, y el logro queda sin saberse. El simulador arma ligas de 10 con los fanáticos simulados (una cuenta
 * que no es de ellos entra en la primera).
 */
const leagueGroups = (userId) => {
    if (!accounts.isMock()) return null;
    const { FAN_IDS } = require('./pro/mockFans');
    const index = FAN_IDS.indexOf(userId);
    if (index < 0) return [[...FAN_IDS.slice(0, MOCK_LEAGUE - 1), userId]];
    const start = Math.floor(index / MOCK_LEAGUE) * MOCK_LEAGUE;
    return [FAN_IDS.slice(start, start + MOCK_LEAGUE)];
};

/** Domingos de las semanas terminadas de la temporada que el fanático ganó en alguna de sus ligas */
const weekTitlesOf = ({ userId, groups, range, today, totalsOf, liveDays }) => {
    if (!groups) return null;
    const titles = new Set();
    for (const users of groups) {
        if (users.length < 2) continue;
        for (let start = weekStartOf(range.start); shiftDay(start, 6) < today; start = shiftDay(start, 7)) {
            if (weekTable({ start, today, users, totalsOf, liveDays }).champion === userId) titles.add(shiftDay(start, 6));
        }
    }
    return [...titles].sort();
};

// ---------------------------------------------------------------- la temporada de un fanático

const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return round1(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
};

/**
 * «Mi temporada» de un fanático: sus días (con su puesto entre todos), totales, rachas, capitán, pronósticos, los
 * peloteros que más usó y los logros.
 * @returns {Promise<{ data: object, live: boolean, partial: boolean, nextLockAt: number | null }>}
 */
const computeFanStats = async (league, userId, { today = todayOf(league), now = Date.now(), deadline = Date.now() + BUDGET_MS } = {}) => {
    const range = await fans.seasonRange(league, today);
    const [own, table] = await Promise.all([
        range.start <= range.end ? entriesOf(league, { userId, from: range.start, to: range.end, max: FAN_SEASON_ROWS }) : { entries: [], cut: false },
        seasonTable(league, today)
    ]);
    const mine = own.entries.filter((item) => item.userId === userId && item.date >= range.start && item.date <= range.end);
    const dates = [...new Set(mine.map((item) => item.date))].sort((a, b) => b.localeCompare(a));
    const computed = await fans.computeDays(league, dates, { deadline });
    const { days, error } = computed;
    if (error && !days.size) throw error;

    // Del más viejo al más nuevo, con lo de juegos sin empezar escondido
    const timeline = mine
        .filter((item) => days.has(item.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(({ date, entry }) => ({ date, day: days.get(date), entry, detail: fanDay(days.get(date), entry, now) }));
    const started = timeline.filter((item) => item.detail.started);
    const finals = started.filter((item) => item.detail.final);
    const ranks = new Map(started.map((item) => [item.date, rankIn(table, item.date, userId, item.detail.total)]));

    const dayRows = started.map(({ date, detail }) => ({ date, team: detail.team, picks: detail.picks, total: detail.total, ...ranks.get(date) }));

    // Totales: puntos y promedio con todos los días con juegos empezados (como la tabla); mediana, mejor y peor día
    // solo con días terminados (un día en vivo todavía no es el peor)
    const points = round1(started.reduce((sum, item) => sum + item.detail.total, 0));
    const pickBy = (better) => finals.reduce((found, item) => (!found || better(item.detail.total, found.total) ? { date: item.date, total: item.detail.total } : found), null);
    const totals = {
        days: started.length,
        total: points,
        avg: started.length ? round1(points / started.length) : 0,
        median: median(finals.map((item) => item.detail.total)),
        best: pickBy((a, b) => a > b),
        worst: pickBy((a, b) => a < b)
    };

    // Rachas: días de juego seguidos con equipo (si hoy todavía puede armarlo, no la corta)
    const withTeam = new Set(started.filter((item) => item.detail.lineup.length + item.detail.hidden > 0).map((item) => item.date));
    const gameDays = [...new Set([...table.gameDays, ...started.map((item) => item.date)])].sort();
    let current = 0;
    for (const [index, date] of [...gameDays].reverse().entries()) {
        if (withTeam.has(date)) current += 1;
        else if (index === 0 && date === today) continue;
        else break;
    }
    let run = 0;
    let longest = 0;
    for (const date of gameDays) {
        run = withTeam.has(date) ? run + 1 : 0;
        longest = Math.max(longest, run);
    }

    // Capitán, pronósticos y peloteros: solo lo de juegos cerrados
    const captain = { days: 0, sum: 0, bonus: 0, best: null };
    const picks = { made: 0, hits: 0 };
    const players = new Map();
    for (const { date, detail } of started) {
        for (const item of detail.lineup) {
            const row = players.get(item.id) || { id: item.id, name: item.name, teamId: item.teamId ?? null, role: item.role === 'P' ? 'P' : 'B', days: 0, points: 0 };
            row.days += 1;
            row.points += item.score;
            players.set(item.id, row);
            if (!item.captain) continue;
            captain.days += 1;
            captain.sum += item.score;
            captain.bonus += item.score - item.points;
            if (!captain.best || item.score > captain.best.points) captain.best = { id: item.id, name: item.name, points: item.score, date };
        }
        for (const pick of detail.pickList) {
            if (pick.result === 'pending') continue;
            picks.made += 1;
            if (pick.result === 'win') picks.hits += 1;
        }
    }

    // Logros
    const facts = timeline.map(({ date, day, entry, detail }) => {
        const decided = detail.pickList.filter((pick) => pick.result !== 'pending');
        const rank = ranks.get(date) || { rank: null, players: 0 };
        return {
            date,
            saved: entry.lineup.length > 0,
            started: detail.started,
            final: detail.final,
            team: withTeam.has(date),
            total: detail.total,
            rank: rank.rank,
            fans: rank.players,
            picksMade: decided.length,
            picksHit: decided.filter((pick) => pick.result === 'win').length,
            lineup: detail.lineup.map((item) => ({ points: item.points, score: item.score, captain: item.captain, price: day.players.find((player) => player.id === item.id)?.price }))
        };
    });
    const ownTotals = new Map(started.map((item) => [item.date, item.detail.total]));
    const liveDays = new Set([...table.liveDays, ...started.filter((item) => item.detail.live).map((item) => item.date)]);
    const weekTitles = weekTitlesOf({
        userId,
        groups: leagueGroups(userId),
        range,
        today,
        totalsOf: (id) => (id === userId ? ownTotals : table.byUser.get(id)),
        liveDays
    });

    const live = timeline.some((item) => item.detail.live);
    const upcoming = timeline.flatMap((item) => item.day.games.filter((game) => !isPostponedGame(game)).map(lockTime)).filter((at) => Number.isFinite(at) && at > now);
    return {
        data: {
            userId,
            league,
            season: range.season,
            days: dayRows,
            totals,
            streak: { current, longest },
            captain: { days: captain.days, avg: captain.days ? round1(captain.sum / captain.days) : 0, bonus: round1(captain.bonus), best: captain.best ? { ...captain.best, points: round1(captain.best.points) } : null },
            picks: { made: picks.made, hits: picks.hits, pct: picks.made ? round1((picks.hits / picks.made) * 100) : null },
            players: [...players.values()]
                .map((row) => ({ ...row, points: round1(row.points) }))
                .sort((a, b) => b.days - a.days || b.points - a.points || a.id - b.id)
                .slice(0, TOP_PLAYERS),
            achievements: achievementsOf({ days: facts, gameDays: table.gameDays, weekTitles }),
            partial: computed.partial || own.cut || table.partial,
            updatedAt: new Date(now).toISOString()
        },
        live,
        partial: computed.partial || own.cut || table.partial,
        // Lo escondido sale al empezar su juego: el caché no pasa de ahí
        nextLockAt: upcoming.length ? Math.min(...upcoming) : null
    };
};

/** Segundos de caché de «Mi temporada»: a medias 15 s, en vivo 1 min, si no 5 min (sin pasar del próximo cierre) */
const statsTtl = (value, now = Date.now()) => {
    const base = value.partial ? 15 : value.live ? 60 : 300;
    const untilLock = value.nextLockAt ? Math.ceil((value.nextLockAt - now) / 1000) + 1 : Infinity;
    return Math.max(5, Math.min(base, untilLock));
};

const fanStats = (league, userId) => {
    const today = todayOf(league);
    return cached(`fantasy_stats_${league}_${userId}_${today}`, (value) => statsTtl(value), () => computeFanStats(league, userId, { today }), { staleSec: 120 });
};

module.exports = { computeTable, seasonTable, rankIn, weekStartOf, weekTable, weeksOf, fantasyWeeks, weeksTtl, leagueGroups, weekTitlesOf, computeFanStats, statsTtl, fanStats, entriesOf, MOCK_DAYS };
