const fantasy = require('./fantasy'); // por el módulo (no desestructurado) para poder sustituirlo en pruebas
const season = require('./season');
const env = require('../utils/env');
const { cached } = require('../utils/cache');
const { LEAGUES } = require('../config/constants');
const { toEntry, hasPlay, dayResult, dayStarted, round1, effectiveEntry, lockTime } = require('./fantasyScore');

// Perfil de cada fanático (sus días y su temporada) y tabla de la temporada del fantasy.
// Los equipos están en Supabase (fantasy_entries, lectura pública con la llave publishable) y los puntos de cada día
// salen de fantasyDay con el mismo caché de GET /v2/fantasy: cada día se calcula una sola vez para todos.

const RD = 'America/Santo_Domingo';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAN_DAYS = 40;
// Filas recientes que se piden para la lista de días (alguna puede venir vacía)
const FAN_ROWS = 60;
// Días de una temporada de un fanático: más que los de cualquier temporada (LIDOM ~212, las demás 365)
const FAN_SEASON_ROWS = 400;
const PAGE = 1000;
const MAX_ROWS = 10000;
const RANKING_SIZE = 200;
// Cuentas que se pueden pedir con ?users= (los miembros de una liga privada)
const MAX_USERS = 100;
const NAMES_BATCH = 100;
const DAYS_AT_ONCE = 3;
// La función de Vercel tiene 30 s: a los ~20 s se responde con lo que haya
const BUDGET_MS = 20000;

const isUuid = (value) => typeof value === 'string' && UUID.test(value);

const isoDay = (date, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const todayIn = (timeZone = RD, now = new Date()) => isoDay(now, timeZone);
const shiftDay = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- días del fantasy (caché compartido con el controlador)

const finished = (day) => day.games.length > 0 && day.games.every((game) => game.state === 'final');

/** TTL de un día según su estado: en vivo 20 s, terminado 1 h, por empezar 2 min (30 s si MLB no dio algún box score) */
const dayTtl = (day) => (day.incomplete ? 30 : day.games.some((game) => game.state === 'live') ? 20 : finished(day) ? 3600 : 120);

// Un día de antes de ayer ya terminado no cambia: una semana en caché. Hoy y ayer siguen en 1 h por si MLB corrige el box score.
const OLD_DAY_TTL = 7 * 86400;
const isOldDay = (league, date) => date < shiftDay(todayIn(LEAGUES[league]?.timeZone || RD), -1);

/** TTL de un día del fantasy sabiendo su fecha */
const dayTtlOn = (league, date, day) => (!day.incomplete && finished(day) && isOldDay(league, date) ? OLD_DAY_TTL : dayTtl(day));

const cachedDay = (league, date) =>
    cached(`fantasy_${league}_${date}`, (day) => dayTtlOn(league, date, day), () => fantasy.fantasyDay(league, date), { staleSec: isOldDay(league, date) ? OLD_DAY_TTL : 600 });

/**
 * Calcula varios días (máx. `limit` a la vez) hasta `deadline`. Los que no alcanzan o fallan quedan fuera y
 * `partial` lo dice; lo que siga en curso termina en segundo plano y queda en caché para la próxima vez.
 */
const computeDays = async (league, dates, { limit = DAYS_AT_ONCE, deadline = Infinity } = {}) => {
    const days = new Map();
    let error = null;
    let next = 0;
    const worker = async () => {
        while (next < dates.length && Date.now() < deadline) {
            const date = dates[next++];
            try {
                days.set(date, await cachedDay(league, date));
            } catch (problem) {
                error = error || problem;
                console.warn(`[fantasyFans] ${league} ${date}: ${problem.message}`);
            }
        }
    };
    const pool = Promise.all(Array.from({ length: Math.min(limit, dates.length) }, worker));
    if (Number.isFinite(deadline)) {
        let timer;
        await Promise.race([pool, new Promise((resolve) => (timer = setTimeout(resolve, Math.max(0, deadline - Date.now()))))]);
        clearTimeout(timer);
    } else {
        await pool;
    }
    const done = new Map(days);
    return { days: done, partial: done.size < dates.length, error };
};

// ---------------------------------------------------------------- Supabase (REST, sin SDK)

class AccountsError extends Error {
    constructor(code, message) {
        super(message || code);
        this.code = code;
    }
}

const accountsEnabled = () => !!env.supabaseConfig();

/**
 * GET a la API REST de Supabase con la llave publishable (solo en `apikey`: no es un JWT).
 * `total` es el total de filas que da Content-Range cuando se pide `Prefer: count=exact` (si no, null).
 */
const supabaseFetch = async (query, headers = {}) => {
    const config = env.supabaseConfig();
    if (!config) throw new AccountsError('accounts_disabled');
    let response;
    try {
        response = await fetch(`${config.url}/rest/v1/${query}`, {
            headers: { apikey: config.key, Accept: 'application/json', ...headers },
            signal: AbortSignal.timeout(8000)
        });
    } catch (problem) {
        throw new AccountsError('accounts_unavailable', `Supabase: ${problem.message}`);
    }
    // Range más allá de la última fila
    if (response.status === 416) return { rows: [], total: null };
    if (!response.ok) throw new AccountsError('accounts_unavailable', `Supabase ${response.status}`);
    const rows = await response.json().catch(() => null);
    const total = Number((response.headers?.get?.('content-range') || '').split('/')[1]);
    return { rows: Array.isArray(rows) ? rows : [], total: Number.isFinite(total) ? total : null };
};

const supabaseGet = async (query, headers) => (await supabaseFetch(query, headers)).rows;

/**
 * Todas las filas de una consulta, de página en página con Range, hasta `max`. No supone el tamaño de página del
 * proyecto (max-rows): sigue hasta juntar el total que da count=exact o hasta una página vacía. `cut`: quedaron filas fuera.
 */
const allRows = async (query, max) => {
    const rows = [];
    let total = null;
    while (rows.length < max && (total === null || rows.length < total)) {
        const from = rows.length;
        const page = await supabaseFetch(query, { Range: `${from}-${Math.min(from + PAGE, max) - 1}`, 'Range-Unit': 'items', ...(from === 0 ? { Prefer: 'count=exact' } : {}) });
        if (from === 0) total = page.total;
        if (!page.rows.length) break;
        rows.push(...page.rows);
    }
    return { rows, cut: total !== null ? total > rows.length : rows.length >= max };
};

/** Nombres de los perfiles en tandas de 100 */
const namesOf = async (ids) => {
    const names = new Map();
    for (let i = 0; i < ids.length; i += NAMES_BATCH) {
        const rows = await supabaseGet(`profiles?id=in.(${ids.slice(i, i + NAMES_BATCH).join(',')})&select=id,display_name`);
        for (const row of rows) names.set(row.id, row.display_name || null);
    }
    return names;
};

// ---------------------------------------------------------------- temporada

/** Días de la temporada vigente hasta hoy. LIDOM S = del S-09-01 al (S+1)-03-31; las demás ligas, el año S */
const seasonRange = async (league, today) => {
    const { season: year } = await season.getSeasonInfo(league);
    const start = league === 'lidom' ? `${year}-09-01` : `${year}-01-01`;
    const end = league === 'lidom' ? `${year + 1}-03-31` : `${year}-12-31`;
    return { season: year, start, end: end < today ? end : today };
};

/** Filas con equipo o pronósticos; una fila repetida (dos páginas que se pisan si alguien guarda mientras se lee) cuenta una vez */
const rowsOf = (rows) => {
    const seen = new Set();
    return rows
        .map((row) => ({ userId: row.user_id, date: String(row.day || '').slice(0, 10), entry: toEntry(row) }))
        .filter((item) => {
            const key = `${item.userId}:${item.date}`;
            if (!item.date || !hasPlay(item.entry) || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

/**
 * Perfil de un fanático: sus últimos 40 días (hoy con puntos parciales) y el total de la temporada.
 * @returns {Promise<{ data: object, live: boolean, partial: boolean }>}
 */
const fanSummary = async (league, userId, { today = todayIn(RD), deadline = Date.now() + BUDGET_MS } = {}) => {
    // select=* trae history (el historial antitrampa) si la base ya tiene la columna, y no falla si todavía no
    const base = `fantasy_entries?user_id=eq.${userId}&league=eq.${league}&select=*`;
    const ranged = seasonRange(league, today);
    const [recent, profiles, range, seasonRows] = await Promise.all([
        // Los últimos días hasta hoy (los de mañana no ocupan cupo)
        supabaseGet(`${base}&day=lte.${today}&order=day.desc&limit=${FAN_ROWS}`),
        supabaseGet(`profiles?id=eq.${userId}&select=display_name`),
        ranged,
        // La temporada se lee aparte y completa: puede tener más días que la lista
        ranged.then((value) => (value.start <= value.end ? allRows(`${base}&day=gte.${value.start}&day=lte.${value.end}&order=day.desc`, FAN_SEASON_ROWS) : { rows: [], cut: false }))
    ]);
    const listed = rowsOf(recent)
        .filter((item) => item.date <= today)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, FAN_DAYS);
    const inSeason = rowsOf(seasonRows.rows).filter((item) => item.date >= range.start && item.date <= range.end);
    // Primero los días de la lista (los más recientes)
    const dates = [...new Set([...listed, ...inSeason].map((item) => item.date))];
    const computed = await computeDays(league, dates, { deadline });
    const { days, error } = computed;
    if (error && !days.size) throw error;
    const partial = computed.partial || seasonRows.cut;

    const out = listed
        .filter((item) => days.has(item.date))
        .map(({ date, entry }) => {
            const result = dayResult(days.get(date), entry);
            // El equipo que cuenta (lo cambiado después de empezar cada juego no sale)
            return { date, final: result.final, live: result.live, team: result.team, picks: result.picks, total: result.total, lineup: result.lineup, captain: result.captain, picksMade: result.picksMade };
        });

    // Temporada: solo días con al menos un juego empezado
    let points = 0;
    let count = 0;
    let best = null;
    for (const { date, entry } of inSeason) {
        const day = days.get(date);
        if (!day || !dayStarted(day)) continue;
        const { total } = dayResult(day, entry);
        points += total;
        count += 1;
        if (!best || total > best.points) best = { date, points: total };
    }

    return {
        data: { userId, league, name: profiles[0]?.display_name || null, season: { points: round1(points), days: count, best }, days: out },
        live: out.some((day) => day.live),
        partial
    };
};

const computeSeason = async (league, today) => {
    const deadline = Date.now() + BUDGET_MS;
    const range = await seasonRange(league, today);
    const base = { league, season: range.season, ranking: [], partial: false, updatedAt: new Date().toISOString() };
    if (range.start > range.end) return { data: base, all: [], names: new Map(), ttl: 300 };

    // Todas las filas de la temporada, de la más nueva a la más vieja: si pasan de 10000 se quedan fuera los días viejos y partial lo dice
    const { rows, cut } = await allRows(`fantasy_entries?league=eq.${league}&day=gte.${range.start}&day=lte.${range.end}&select=*&order=day.desc,user_id.asc`, MAX_ROWS);
    if (cut) console.warn(`[fantasyFans] ${league}: la temporada pasa de ${MAX_ROWS} filas, se cuentan solo las más nuevas`);
    const entries = rowsOf(rows).filter((item) => item.userId && item.date >= range.start && item.date <= range.end);

    // Cada día una sola vez para todos; primero los más recientes (los viejos casi siempre están en caché)
    const dates = [...new Set(entries.map((item) => item.date))].sort((a, b) => b.localeCompare(a));
    const computed = await computeDays(league, dates, { deadline });
    const { days, error } = computed;
    if (error && !days.size) throw error;
    const partial = computed.partial || cut;

    // Para las ligas privadas: lo de los últimos 7 días (el campeón de la semana), el mejor día y la racha de días seguidos
    const weekStart = shiftDay(today, -6);
    const users = new Map();
    for (const { userId, date, entry } of entries) {
        if (!users.has(userId)) users.set(userId, { userId, name: null, points: 0, days: 0, week: 0, best: null, played: new Set() });
        const day = days.get(date);
        if (!day || !dayStarted(day)) continue;
        const user = users.get(userId);
        const total = dayResult(day, entry).total;
        user.points += total;
        user.days += 1;
        if (date >= weekStart) user.week += total;
        if (!user.best || total > user.best.points) user.best = { date, points: round1(total) };
        user.played.add(date);
    }
    // Racha: días de juego seguidos que jugó, del más reciente para atrás (si hoy todavía no juega, cuenta desde ayer)
    const gameDays = dates.filter((date) => days.get(date) && dayStarted(days.get(date)));
    for (const user of users.values()) {
        let streak = 0;
        for (const [index, date] of gameDays.entries()) {
            if (user.played.has(date)) streak += 1;
            else if (index === 0 && date === today) continue;
            else break;
        }
        user.streak = streak;
        delete user.played;
    }
    // Todos ordenados, con su puesto (los empates comparten puesto, como withRanks en la app)
    const all = [...users.values()]
        .map((user) => ({ ...user, points: round1(user.points), week: round1(user.week) }))
        .sort((a, b) => b.points - a.points || a.days - b.days || a.userId.localeCompare(b.userId));
    all.forEach((user, index) => (user.rank = index > 0 && user.points === all[index - 1].points ? all[index - 1].rank : index + 1));
    const top = all.slice(0, RANKING_SIZE);
    const fetched = await namesOf(top.map((user) => user.userId));
    const names = new Map(top.map((user) => [user.userId, fetched.get(user.userId) ?? null]));
    const ranking = top.map((user) => ({ userId: user.userId, name: names.get(user.userId), points: user.points, days: user.days, week: user.week, streak: user.streak, best: user.best }));

    const live = [...days.values()].some((day) => day.games.some((game) => game.state === 'live'));
    return {
        data: { ...base, ranking, partial, updatedAt: new Date().toISOString() },
        all,
        names,
        // Si quedó a medias se vuelve a intentar enseguida (los días ya calculados quedan en caché)
        ttl: partial ? 5 : live ? 60 : 300
    };
};

/**
 * Tabla de la temporada (una sola cuenta por instancia para todos los que la piden a la vez).
 * Con `users` (p. ej. los miembros de una liga privada) devuelve solo esas cuentas, aunque no entren en el top 200,
 * cada una con su puesto en la tabla general (`rank`).
 */
const seasonRanking = async (league, { today = todayIn(RD), users = null } = {}) => {
    const result = await cached(`fantasy_season_${league}_${today}`, (value) => value.ttl, () => computeSeason(league, today), { staleSec: 600 });
    if (!users) return result.data;
    const wanted = new Set(users);
    const picked = result.all.filter((user) => wanted.has(user.userId));
    const missing = picked.filter((user) => !result.names.has(user.userId)).map((user) => user.userId);
    const names = missing.length ? await namesOf(missing) : new Map();
    const ranking = picked.map((user) => ({ userId: user.userId, name: (result.names.has(user.userId) ? result.names.get(user.userId) : names.get(user.userId)) ?? null, points: user.points, days: user.days, rank: user.rank, week: user.week, streak: user.streak, best: user.best }));
    return { ...result.data, ranking };
};

// ---------------------------------------------------------------- % de elección (como el «% drafted» de los fantasy)

const OWNERS_ROWS = 5000;

/**
 * Cuántos fanáticos eligieron a cada pelotero (y de capitán) y a cada equipo en los pronósticos, con el equipo que
 * cuenta (effectiveEntry). Solo de los juegos que ya empezaron: antes no se muestra para que nadie copie.
 */
const computeOwners = async (league, date, now = Date.now()) => {
    const [day, { rows, cut }] = await Promise.all([cachedDay(league, date), allRows(`fantasy_entries?league=eq.${league}&day=eq.${date}&select=*&order=user_id.asc`, OWNERS_ROWS)]);
    const entries = rowsOf(rows).filter((item) => item.date === date);
    const locked = new Set(day.games.filter((game) => lockTime(game) <= now).map((game) => game.gamePk));
    const players = new Map();
    const picks = {};
    for (const { entry } of entries) {
        const used = effectiveEntry(day, entry);
        for (const id of used.lineup) {
            const player = day.players.find((p) => p.id === id);
            if (!player || !locked.has(player.gamePk)) continue;
            const count = players.get(id) || { picked: 0, captain: 0 };
            count.picked += 1;
            if (used.captain === id) count.captain += 1;
            players.set(id, count);
        }
        for (const [gamePk, teamId] of Object.entries(used.picks)) {
            if (!locked.has(Number(gamePk))) continue;
            picks[gamePk] = picks[gamePk] || {};
            picks[gamePk][teamId] = (picks[gamePk][teamId] || 0) + 1;
        }
    }
    // Sobre los equipos con peloteros (un fanático que solo pronosticó no cuenta para el % de los peloteros)
    const total = entries.filter(({ entry }) => entry.lineup.length > 0).length;
    const pct = (count) => (total ? Math.round((count / total) * 1000) / 10 : 0);
    return {
        league,
        date,
        teams: total,
        players: [...players].map(([id, count]) => ({ id, pct: pct(count.picked), captainPct: pct(count.captain) })).sort((a, b) => b.pct - a.pct),
        picks: Object.fromEntries(Object.entries(picks).map(([gamePk, counts]) => {
            const sum = Object.values(counts).reduce((a, b) => a + b, 0);
            return [gamePk, Object.fromEntries(Object.entries(counts).map(([teamId, count]) => [teamId, sum ? Math.round((count / sum) * 1000) / 10 : 0]))];
        })),
        partial: cut,
        updatedAt: new Date(now).toISOString()
    };
};

/** % de elección del día, un minuto en caché (se recalcula al empezar cada juego) */
const dayOwners = (league, date) => cached(`fantasy_owners_${league}_${date}`, 60, () => computeOwners(league, date), { staleSec: 120 });

module.exports = { computeOwners, dayOwners, isUuid, todayIn, dayTtl, dayTtlOn, cachedDay, computeDays, accountsEnabled, AccountsError, seasonRange, fanSummary, seasonRanking, MAX_USERS };
