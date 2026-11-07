const fans = require('../fantasyFans'); // por el módulo: cachedDay usa fantasy.fantasyDay, que las pruebas sustituyen
const { effectiveEntry, dayResult, dayStarted, lockTime, playerScore, round1 } = require('../fantasyScore');
const { cached } = require('../../utils/cache');
const accounts = require('./accounts');
const { todayOf, shiftDay } = require('./games');

// Fanáticos en el fantasy PRO: el perfil con `pro` (pronósticos y capitán acertados, peloteros más usados, la línea de
// la temporada), su temporada en detalle (día por día, sin mostrar lo de juegos que no han empezado) y la tabla de la
// temporada con el puesto anterior (flechas) y el promedio de la liga por día. Mismas cuentas que fantasyFans.js: los
// días salen de cachedDay (el caché de GET /v2/fantasy) y el equipo que cuenta de effectiveEntry.

const FAN_DAYS = 40;
const FAN_ROWS = 60;
const FAN_SEASON_ROWS = 400;
const MAX_ROWS = 10000;
const RANKING_SIZE = 200;
const TOP_PLAYERS = 5;
// La función de Vercel tiene 30 s: a los ~20 s se responde con lo que haya
const BUDGET_MS = 20000;

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const winnerOf = (game) => (game.state !== 'final' ? null : game.away?.isWinner ? game.away.id : game.home?.isWinner ? game.home.id : null);

const teamsOf = (day) => day.teams || {};

// ---------------------------------------------------------------- un día de un fanático, sin lo que no ha empezado

/**
 * Su día como contaba (effectiveEntry): los peloteros y pronósticos de juegos ya cerrados con sus puntos; lo de juegos
 * que no han empezado solo se cuenta (hidden, picksHidden) para que nadie lo copie.
 */
const fanDay = (day, saved, now = Date.now()) => {
    const result = dayResult(day, saved);
    const used = effectiveEntry(day, saved);
    const locks = new Map(day.games.map((game) => [String(game.gamePk), lockTime(game)]));
    const isLocked = (gamePk) => (locks.get(String(gamePk)) ?? Infinity) <= now;
    const known = result.lineup.map((id) => day.players.find((player) => player.id === id)).filter(Boolean);
    const shown = known.filter((player) => isLocked(player.gamePk));
    const lineup = shown.map((player) => ({
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        role: player.role,
        pos: player.pos,
        gamePk: player.gamePk,
        played: !!player.played,
        line: player.line ?? null,
        points: player.points,
        score: playerScore(used, player),
        captain: used.captain === player.id
    }));
    const picks = Object.entries(used.picks).filter(([gamePk, teamId]) => teamId && day.games.some((game) => String(game.gamePk) === gamePk));
    const pickList = picks
        .filter(([gamePk]) => isLocked(gamePk))
        .map(([gamePk, teamId]) => {
            const game = day.games.find((item) => String(item.gamePk) === gamePk);
            const winner = winnerOf(game);
            return { gamePk: Number(gamePk), teamId: Number(teamId), result: winner ? (winner === Number(teamId) ? 'win' : 'loss') : 'pending' };
        });
    return {
        date: day.date,
        started: result.started,
        final: result.final,
        live: result.live,
        team: result.team,
        picks: result.picks,
        total: result.total,
        lineup,
        hidden: known.length - shown.length,
        captainHidden: used.captain !== null && used.captain !== undefined && !lineup.some((item) => item.captain),
        pickList,
        picksHidden: picks.length - pickList.length,
        games: day.games.map((game) => ({
            gamePk: game.gamePk,
            date: game.date,
            state: game.state,
            venue: game.venue || null,
            away: { id: game.away.id, score: game.away.score ?? null, isWinner: !!game.away.isWinner },
            home: { id: game.home.id, score: game.home.score ?? null, isWinner: !!game.home.isWinner }
        }))
    };
};

// ---------------------------------------------------------------- la temporada de un fanático

/**
 * Todo lo de un fanático a la vez (perfil, `pro` y detalle): sus últimos 40 días (como el perfil del Lite) y la
 * temporada completa, cada día calculado una sola vez para todos.
 */
const computeFan = async (league, userId, { today = todayOf(league), now = Date.now(), deadline = Date.now() + BUDGET_MS } = {}) => {
    const range = await fans.seasonRange(league, today);
    const [recent, season, profiles] = await Promise.all([
        accounts.entries({ league, userId, to: today, limit: FAN_ROWS }),
        range.start <= range.end ? accounts.entries({ league, userId, from: range.start, to: range.end, max: FAN_SEASON_ROWS }) : { entries: [], cut: false },
        accounts.profiles([userId])
    ]);
    const listed = recent.entries.filter((item) => item.date <= today).slice(0, FAN_DAYS);
    const inSeason = season.entries.filter((item) => item.date >= range.start && item.date <= range.end);
    const dates = [...new Set([...listed, ...inSeason].map((item) => item.date))];
    const computed = await fans.computeDays(league, dates, { deadline });
    const { days, error } = computed;
    if (error && !days.size) throw error;
    const partial = computed.partial || season.cut;
    const profile = profiles.get(userId) || { name: null, createdAt: null };

    // Perfil (como GET /v2/fantasy/fan/:userId)
    const out = listed
        .filter((item) => days.has(item.date))
        .map(({ date, entry }) => {
            const result = dayResult(days.get(date), entry);
            return { date, final: result.final, live: result.live, team: result.team, picks: result.picks, total: result.total, lineup: result.lineup, captain: result.captain, picksMade: result.picksMade };
        });

    // Temporada día por día (solo días con al menos un juego empezado suman)
    const detailDays = inSeason.filter((item) => days.has(item.date)).map(({ date, entry }) => fanDay(days.get(date), entry, now));
    const startedDays = detailDays.filter((day) => day.started);
    let points = 0;
    let best = null;
    for (const day of startedDays) {
        points += day.total;
        if (!best || day.total > best.points) best = { date: day.date, points: day.total };
    }

    const players = new Map();
    const captains = new Map();
    const byTeam = new Map();
    const picks = { points: 0, made: 0, won: 0 };
    const captain = { days: 0, best: 0 };
    const teams = {};
    for (const day of detailDays) Object.assign(teams, teamsOf(days.get(day.date)));
    for (const day of startedDays) {
        picks.points += day.picks;
        for (const pick of day.pickList) {
            if (pick.result === 'pending') continue;
            picks.made += 1;
            if (pick.result === 'win') picks.won += 1;
        }
        for (const item of day.lineup) {
            const row = players.get(item.id) || { id: item.id, name: item.name, teamId: item.teamId, role: item.role, pos: item.pos, days: 0, points: 0, base: 0, captainDays: 0 };
            row.days += 1;
            row.points += item.score;
            row.base += item.points;
            if (item.captain) row.captainDays += 1;
            players.set(item.id, row);
            byTeam.set(item.teamId, (byTeam.get(item.teamId) || 0) + item.score);
            if (item.captain) {
                const cap = captains.get(item.id) || { id: item.id, name: item.name, teamId: item.teamId, pos: item.pos, days: 0, bonus: 0 };
                cap.days += 1;
                cap.bonus += item.score - item.points;
                captains.set(item.id, cap);
            }
        }
        // Capitán acertado: en un día terminado fue el que más puntos hizo de su equipo (empatado también cuenta)
        const chosen = day.final ? day.lineup.find((item) => item.captain) : null;
        if (chosen) {
            captain.days += 1;
            if (day.lineup.every((item) => item.points <= chosen.points)) captain.best += 1;
        }
    }
    const playerRows = [...players.values()].map((row) => ({ ...row, points: round1(row.points), base: round1(row.base) })).sort((a, b) => b.points - a.points || b.days - a.days || a.id - b.id);
    const captainRows = [...captains.values()].map((row) => ({ ...row, bonus: round1(row.bonus) })).sort((a, b) => b.days - a.days || b.bonus - a.bonus || a.id - b.id);
    const used = [...playerRows].sort((a, b) => b.days - a.days || b.points - a.points || a.id - b.id);
    const seasonPoints = round1(points);
    const live = detailDays.some((day) => day.live) || out.some((day) => day.live);

    const pro = {
        createdAt: profile.createdAt,
        picks: { made: picks.made, won: picks.won, pct: pct(picks.won, picks.made) },
        captain: { days: captain.days, best: captain.best, pct: pct(captain.best, captain.days) },
        average: startedDays.length ? round1(seasonPoints / startedDays.length) : null,
        topPlayers: used.slice(0, TOP_PLAYERS).map((row) => ({ id: row.id, name: row.name, days: row.days, points: row.points })),
        topCaptain: captainRows[0] ? { id: captainRows[0].id, name: captainRows[0].name, days: captainRows[0].days } : null,
        series: startedDays
            .filter((day) => day.final)
            .map((day) => ({ date: day.date, total: day.total }))
            .sort((a, b) => a.date.localeCompare(b.date))
    };
    const upcoming = [...days.values()].flatMap((day) => day.games.map(lockTime)).filter((at) => Number.isFinite(at) && at > now);
    return {
        profile: { userId, league, name: profile.name, season: { points: seasonPoints, days: startedDays.length, best }, days: out, pro },
        detail: {
            userId,
            league,
            name: profile.name,
            players: playerRows,
            captains: captainRows,
            byTeam: [...byTeam].map(([teamId, value]) => ({ teamId, points: round1(value) })).sort((a, b) => b.points - a.points),
            picks: { points: round1(picks.points), made: picks.made, won: picks.won },
            teams,
            days: [...detailDays].sort((a, b) => b.date.localeCompare(a.date)),
            live,
            partial,
            updatedAt: new Date(now).toISOString()
        },
        live,
        partial,
        // Lo escondido sale al empezar su juego: el caché no pasa de ahí
        nextLockAt: upcoming.length ? Math.min(...upcoming) : null
    };
};

/** Segundos de caché de un fanático: a medias 15 s, en vivo 1 min, si no 5 min (sin pasar del próximo cierre) */
const fanTtl = (value, now = Date.now()) => {
    const base = value.partial ? 15 : value.live ? 60 : 300;
    const untilLock = value.nextLockAt ? Math.ceil((value.nextLockAt - now) / 1000) + 1 : Infinity;
    return Math.max(5, Math.min(base, untilLock));
};

const fanData = (league, userId) => {
    const today = todayOf(league);
    return cached(`pro_fan_${league}_${userId}_${today}`, (value) => fanTtl(value), () => computeFan(league, userId, { today }), { staleSec: 120 });
};

// ---------------------------------------------------------------- tabla de la temporada

const byPoints = (a, b) => b.points - a.points || a.days - b.days || a.userId.localeCompare(b.userId);

/** Puestos con empates compartidos (como withRanks en la app) */
const withRanks = (rows, key = 'rank') => {
    rows.forEach((row, index) => (row[key] = index > 0 && row.points === rows[index - 1].points ? rows[index - 1][key] : index + 1));
    return rows;
};

const computeSeason = async (league, today) => {
    const deadline = Date.now() + BUDGET_MS;
    const range = await fans.seasonRange(league, today);
    const base = { league, season: range.season, ranking: [], partial: false, updatedAt: new Date().toISOString(), total: 0, lastDate: null, daily: [] };
    if (range.start > range.end) return { data: base, all: [], names: new Map(), ttl: 300 };

    const { entries, cut } = await accounts.entries({ league, from: range.start, to: range.end, max: MAX_ROWS });
    if (cut) console.warn(`[pro] ${league}: la temporada pasa de ${MAX_ROWS} filas, se cuentan solo las más nuevas`);
    const inSeason = entries.filter((item) => item.date >= range.start && item.date <= range.end);
    const dates = [...new Set(inSeason.map((item) => item.date))].sort((a, b) => b.localeCompare(a));
    const computed = await fans.computeDays(league, dates, { deadline });
    const { days, error } = computed;
    if (error && !days.size) throw error;
    const partial = computed.partial || cut;

    const weekStart = shiftDay(today, -6);
    const users = new Map();
    for (const { userId, date, entry } of inSeason) {
        if (!users.has(userId)) users.set(userId, { userId, points: 0, days: 0, week: 0, best: null, played: new Map() });
        const day = days.get(date);
        if (!day || !dayStarted(day)) continue;
        const user = users.get(userId);
        const total = dayResult(day, entry).total;
        user.points += total;
        user.days += 1;
        if (date >= weekStart) user.week += total;
        if (!user.best || total > user.best.points) user.best = { date, points: round1(total) };
        user.played.set(date, total);
    }
    // Días con juegos empezados, del más reciente al más viejo
    const gameDays = dates.filter((date) => days.get(date) && dayStarted(days.get(date)));
    const lastDate = gameDays[0] ?? null;
    for (const user of users.values()) {
        let streak = 0;
        for (const [index, date] of gameDays.entries()) {
            if (user.played.has(date)) streak += 1;
            else if (index === 0 && date === today) continue;
            else break;
        }
        user.streak = streak;
    }

    const all = [...users.values()].map((user) => ({ ...user, points: round1(user.points), week: round1(user.week) })).sort(byPoints);
    withRanks(all);
    // Puesto antes del último día con juegos: sin lo de ese día (null si ese día jugó por primera vez)
    if (lastDate) {
        const before = all
            .map((user) => ({ user, userId: user.userId, points: round1(user.points - (user.played.get(lastDate) ?? 0)), days: user.days - (user.played.has(lastDate) ? 1 : 0) }))
            .filter((row) => row.days > 0)
            .sort(byPoints);
        withRanks(before, 'prevRank');
        for (const row of before) row.user.prevRank = row.prevRank;
    }
    for (const user of all) {
        user.prevRank = user.prevRank ?? null;
        user.lastDay = lastDate && user.played.has(lastDate) ? round1(user.played.get(lastDate)) : null;
    }
    const daily = [...gameDays].reverse().map((date) => {
        const totals = all.filter((user) => user.played.has(date)).map((user) => user.played.get(date));
        return { date, average: totals.length ? round1(totals.reduce((sum, value) => sum + value, 0) / totals.length) : 0, fans: totals.length };
    });

    const top = all.slice(0, RANKING_SIZE);
    const profiles = await accounts.profiles(top.map((user) => user.userId));
    const names = new Map(top.map((user) => [user.userId, profiles.get(user.userId)?.name ?? null]));
    const row = (user, name) => ({ userId: user.userId, name, points: user.points, days: user.days, rank: user.rank, prevRank: user.prevRank, lastDay: user.lastDay, week: user.week, streak: user.streak, best: user.best });
    const live = [...days.values()].some((day) => day.games.some((game) => game.state === 'live'));
    return {
        data: { ...base, ranking: top.map((user) => row(user, names.get(user.userId))), partial, updatedAt: new Date().toISOString(), total: all.length, lastDate, daily },
        all: all.map((user) => ({ ...row(user, null) })),
        names,
        // Si quedó a medias se vuelve a intentar enseguida (los días ya calculados quedan en caché)
        ttl: partial ? 5 : live ? 60 : 300
    };
};

/**
 * Tabla de la temporada PRO. Con `users` (los miembros de una liga privada) solo esas cuentas, aunque no entren en el
 * top 200, cada una con su puesto en la tabla general.
 */
const seasonRanking = async (league, { today = todayOf(league), users = null } = {}) => {
    const result = await cached(`pro_fantasy_season_${league}_${today}`, (value) => value.ttl, () => computeSeason(league, today), { staleSec: 600 });
    if (!users) return result.data;
    const wanted = new Set(users);
    const picked = result.all.filter((user) => wanted.has(user.userId));
    const missing = picked.filter((user) => !result.names.has(user.userId)).map((user) => user.userId);
    const extra = missing.length ? await accounts.profiles(missing) : new Map();
    const ranking = picked.map((user) => ({ ...user, name: (result.names.has(user.userId) ? result.names.get(user.userId) : extra.get(user.userId)?.name) ?? null }));
    return { ...result.data, ranking };
};

module.exports = { fanDay, computeFan, fanTtl, fanData, computeSeason, seasonRanking, FAN_DAYS };
