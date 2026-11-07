const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { getLiveFeed } = require('./liveFeed');
const { transformScheduleGame, gameState, uniqueGames } = require('../utils/transformers');
const { teamAbbrev, teamColor, teamLogo } = require('../utils/teams');
const { cached } = require('../utils/cache');
const { CREDITS, CREDITS_FROM, PAST_WEIGHTS, dayPrices, projectionOf } = require('./fantasyPrices');
const { RULES, perTeamLimit, budgetOf } = require('./fantasyScore');

// Fantasy de El Play: los puntos de cada pelotero en un día salen del box score de MLB de sus juegos.
// El servidor los calcula (una sola regla para todos); la app arma el equipo y suma.

const SCORING = {
    batter: { single: 3, double: 5, triple: 8, homeRun: 10, run: 2, rbi: 2, walk: 2, hitByPitch: 2, stolenBase: 5, strikeOut: -1 },
    pitcher: { out: 1, strikeOut: 2, win: 5, save: 5, earnedRun: -2, hit: -0.5, walk: -0.5 }
};

const round1 = (value) => Math.round(value * 10) / 10;

/** Puntos de un bateador con la línea de bateo de un juego (stats.batting del box score de MLB) */
const batterPoints = (b = {}) => {
    const s = SCORING.batter;
    const singles = (b.hits ?? 0) - (b.doubles ?? 0) - (b.triples ?? 0) - (b.homeRuns ?? 0);
    return round1(
        singles * s.single +
            (b.doubles ?? 0) * s.double +
            (b.triples ?? 0) * s.triple +
            (b.homeRuns ?? 0) * s.homeRun +
            (b.runs ?? 0) * s.run +
            (b.rbi ?? 0) * s.rbi +
            (b.baseOnBalls ?? 0) * s.walk +
            (b.hitByPitch ?? 0) * s.hitByPitch +
            (b.stolenBases ?? 0) * s.stolenBase +
            (b.strikeOuts ?? 0) * s.strikeOut
    );
};

/** Puntos de un lanzador con su línea de pitcheo de un juego (stats.pitching) */
const pitcherPoints = (p = {}) => {
    const s = SCORING.pitcher;
    return round1(
        (p.outs ?? 0) * s.out +
            (p.strikeOuts ?? 0) * s.strikeOut +
            (p.wins ?? 0) * s.win +
            (p.saves ?? 0) * s.save +
            (p.earnedRuns ?? 0) * s.earnedRun +
            (p.hits ?? 0) * s.hit +
            (p.baseOnBalls ?? 0) * s.walk
    );
};

const batterLine = (b = {}) => ({
    ab: b.atBats ?? 0,
    h: b.hits ?? 0,
    d: b.doubles ?? 0,
    t: b.triples ?? 0,
    hr: b.homeRuns ?? 0,
    r: b.runs ?? 0,
    rbi: b.rbi ?? 0,
    bb: b.baseOnBalls ?? 0,
    hbp: b.hitByPitch ?? 0,
    sb: b.stolenBases ?? 0,
    k: b.strikeOuts ?? 0
});

const pitcherLine = (p = {}) => ({
    ip: p.inningsPitched ?? '0.0',
    outs: p.outs ?? 0,
    k: p.strikeOuts ?? 0,
    er: p.earnedRuns ?? 0,
    h: p.hits ?? 0,
    bb: p.baseOnBalls ?? 0,
    w: p.wins ?? 0,
    sv: p.saves ?? 0
});

/**
 * Abrió el juego en la alineación: su turno en el orden termina en 00 ("300"; "301" entró de emergente). Sin ese dato
 * (alineación anunciada sin turnos), estar en battingOrder del equipo.
 */
const inStartingLineup = (player, team, id) => {
    const order = Number(player.battingOrder);
    if (Number.isFinite(order) && order > 0) return order % 100 === 0;
    return (team.battingOrder || []).includes(id);
};

/**
 * Peloteros de un juego (todo el roster que trae el box score: titulares, banca y bullpen).
 * Con `withStats`, los puntos de ese juego; sin él (juego que no ha empezado), solo el roster.
 */
const playersFromFeed = (doc, gamePk, withStats) => {
    const players = [];
    for (const side of ['away', 'home']) {
        const team = doc?.liveData?.boxscore?.teams?.[side];
        const teamId = team?.team?.id ?? doc?.gameData?.teams?.[side]?.id;
        if (!team || !teamId) continue;
        for (const player of Object.values(team.players || {})) {
            const id = player.person?.id;
            if (!id) continue;
            const pos = player.position?.abbreviation || '';
            const role = pos === 'P' ? 'P' : 'B';
            const batting = player.stats?.batting || {};
            const pitching = player.stats?.pitching || {};
            const played = withStats && (role === 'P' ? (pitching.battersFaced ?? 0) > 0 || (pitching.outs ?? 0) > 0 : (batting.plateAppearances ?? 0) > 0);
            players.push({
                id,
                name: player.person.fullName || '',
                teamId,
                gamePk,
                role,
                pos,
                starter: role === 'B' ? inStartingLineup(player, team, id) : (team.pitchers || [])[0] === id,
                played: !!played,
                line: withStats ? (role === 'P' ? pitcherLine(pitching) : batterLine(batting)) : null,
                points: withStats ? (role === 'P' ? pitcherPoints(pitching) : batterPoints(batting)) : 0
            });
        }
    }
    return players;
};

/** Un pelotero con dos juegos el mismo día: una sola fila con lo de los dos */
const mergeGames = (a, b, gamePk) => {
    const line = {};
    for (const key of new Set([...Object.keys(a.line), ...Object.keys(b.line)])) {
        const x = a.line[key];
        const y = b.line[key];
        line[key] = typeof x === 'number' || typeof y === 'number' ? (Number(x) || 0) + (Number(y) || 0) : x ?? y;
    }
    // Las entradas lanzadas salen de los outs (6.2 + 1.1 son 8.0, no 7.3)
    if (typeof line.outs === 'number') line.ip = `${Math.floor(line.outs / 3)}.${line.outs % 3}`;
    return { ...a, gamePk, played: a.played || b.played, starter: a.starter || b.starter, line, points: round1(a.points + b.points), doubleheader: true };
};

const isoDay = (date, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const shiftDay = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** Pospuesto o cancelado: MLB lo da como «Final» (codedGameState D o C) aunque no se jugó */
const isPostponed = (status = {}) => /^(Postponed|Cancelled)/i.test(status.detailedState || '') || ['D', 'C'].includes(status.codedGameState);

/** Estado de un juego para el fantasy: 'scheduled' | 'live' | 'final' | 'postponed' | 'suspended' */
const gameStatus = (status = {}) => {
    if (isPostponed(status)) return 'postponed';
    if (/^Suspended/i.test(status.detailedState || '')) return 'suspended';
    const state = gameState(status);
    return state === 'preview' ? 'scheduled' : state;
};

// Un juego terminado todavía puede tardar en llegar a las estadísticas de la temporada: se da por cerrado 4 h después de
// su hora de inicio (en LIDOM, poco antes de la medianoche)
const SETTLE_MS = 4 * 3600000;

/** Juego que todavía puede cambiar las estadísticas: por empezar, en vivo o recién terminado (no los pospuestos ni suspendidos) */
const unsettled = (game, now) => {
    const status = gameStatus(game.status);
    if (status === 'postponed' || status === 'suspended') return false;
    if (status !== 'final') return true;
    const start = Date.parse(game.gameDate || '');
    return Number.isFinite(start) && now < start + SETTLE_MS;
};

/**
 * Hasta qué día van los datos con los que se ponen los precios de `day`: el día anterior, salvo que algún juego de antes
 * siga abierto (p. ej. los de mañana mientras se juega hoy). Nunca pasa de ayer. `games` es el calendario de los 10
 * días anteriores.
 */
const statsThrough = (games, day, today, now = Date.now()) => {
    const cap = day > today ? shiftDay(today, -1) : shiftDay(day, -1);
    const open = games
        .filter((game) => game.officialDate < day && unsettled(game, now))
        .map((game) => game.officialDate)
        .sort()[0];
    const through = open ? shiftDay(open, -1) : cap;
    return through < cap ? through : cap;
};

/** El último día con juego antes de `day` (los pospuestos no cuentan), o null si no hay en el calendario */
const previousGameDay = (games, day) =>
    games
        .filter((game) => game.officialDate < day && gameStatus(game.status) !== 'postponed')
        .map((game) => game.officialDate)
        .sort()
        .pop() ?? null;

const feedOf = async (gamePk) => {
    try {
        return (await getLiveFeed(gamePk)).doc;
    } catch {
        return null;
    }
};

// Un juego terminado ya no cambia: basta su box score (~300 KB) y no se guarda el feed completo (1-3 MB) en memoria.
// Se envuelve con la forma del feed para que playersFromFeed lo lea igual.
const boxOf = async (gamePk) => {
    try {
        const boxscore = await http.mlbGet(`${MLB_API_BASE}/game/${gamePk}/boxscore`);
        return boxscore?.teams ? { liveData: { boxscore } } : null;
    } catch {
        return null;
    }
};

/**
 * Lo que hace falta de un juego terminado de los días anteriores, por equipo: quién lanzó (en orden: el primero abrió),
 * y de cada pelotero del roster su rol, posición, si abrió en la alineación, si jugó y sus puntos. Sale del box score y
 * queda un día en caché recortado (unos KB): ya no cambia. Si MLB falla, null.
 */
const gameLogOf = async (gamePk) => {
    try {
        return await cached(
            `fantasy_log_${gamePk}`,
            86400,
            async () => {
                const boxscore = await http.mlbGet(`${MLB_API_BASE}/game/${gamePk}/boxscore`);
                if (!boxscore?.teams) throw new Error('sin box score');
                const teams = {};
                for (const side of ['away', 'home']) {
                    const id = boxscore.teams[side]?.team?.id;
                    if (id) teams[id] = { pitchers: boxscore.teams[side].pitchers || [], players: [] };
                }
                for (const player of playersFromFeed({ liveData: { boxscore } }, gamePk, true)) {
                    teams[player.teamId]?.players.push({ id: player.id, name: player.name, role: player.role, pos: player.pos, starter: player.starter, played: player.played, points: player.points });
                }
                return teams;
            },
            { staleSec: 86400 }
        );
    } catch {
        return null;
    }
};

/**
 * Salidas recientes de los lanzadores de un equipo: de cada uno, en cuántos juegos lanzó (`outings`) y hace cuántos días
 * abrió por última vez (`startedAgo`). `games` = [{ date, time, pitchers }] de ese equipo antes de `day` (`pitchers` del
 * box score: el primero abrió).
 */
const recentPitching = (games, day) => {
    const recent = new Map();
    for (const game of [...games].sort((a, b) => String(a.time).localeCompare(String(b.time)))) {
        (game.pitchers || []).forEach((id, i) => {
            const row = recent.get(id) || { outings: 0 };
            row.outings += 1;
            if (i === 0) row.startedAgo = Math.round((Date.parse(day) - Date.parse(game.date)) / 86400000);
            recent.set(id, row);
        });
    }
    return recent;
};

// Un lanzador que abrió en los últimos 4 días descansa hoy
const RESTING_DAYS = 4;
const LAST_GAMES = 5;

/** Reglas del día tal como las aplica el servidor (las mismas de fantasyScore): la app las muestra sin escribirlas a mano */
const rulesOf = (day, league, frozen) => {
    const b = SCORING.batter;
    const p = SCORING.pitcher;
    return {
        version: 2,
        roster: { batters: RULES.batters, pitchers: RULES.pitchers },
        perTeam: perTeamLimit(day),
        budget: budgetOf(day),
        captain: RULES.captain,
        picks: { points: RULES.pick },
        scoring: {
            batter: { single: b.single, double: b.double, triple: b.triple, homeRun: b.homeRun, run: b.run, rbi: b.rbi, walk: b.walk, hbp: b.hitByPitch, stolenBase: b.stolenBase, strikeout: b.strikeOut },
            pitcher: { out: p.out, strikeout: p.strikeOut, win: p.win, save: p.save, earnedRun: p.earnedRun, hit: p.hit, walk: p.walk }
        },
        prices: { min: CREDITS.min, max: CREDITS.max, step: CREDITS.step, noData: CREDITS.unknown, seasonWeights: [1, ...PAST_WEIGHTS], frozen },
        lock: 'per-game',
        timezone: league.timeZone
    };
};

/** Calendario de los 10 días anteriores y el día, con los abridores probables y las alineaciones si MLB las tiene */
const scheduleOf = async (league, day) => {
    const params = { sportId: league.sportId, leagueId: league.leagueId, startDate: shiftDay(day, -10), endDate: day, hydrate: 'team,linescore,probablePitcher,lineups' };
    try {
        return await http.mlbGet(`${MLB_API_BASE}/schedule`, params);
    } catch (error) {
        // Si MLB rechaza alguna hidratación, se pide como antes
        if (error.response?.status !== 400) throw error;
        return http.mlbGet(`${MLB_API_BASE}/schedule`, { ...params, hydrate: 'team,linescore' });
    }
};

/**
 * Precios del día y los del día de juego anterior (para la flecha ↑↓), con los datos de antes de cada día. Sin datos
 * suficientes, ese día no hay tope: `table` null. `failed` si MLB falló (el día sale incompleto y se vuelve a pedir pronto).
 */
const pricesOf = async (league, day, through, previousDay) => {
    if (day < CREDITS_FROM) return { table: null, previous: null, failed: false };
    const scoring = { batterPoints, pitcherPoints };
    try {
        const table = await dayPrices(league.id, day, scoring, { through });
        let previous = null;
        if (table && previousDay && previousDay >= CREDITS_FROM) {
            const before = shiftDay(previousDay, -1);
            previous = await dayPrices(league.id, previousDay, scoring, { through: through < before ? through : before });
        }
        return { table, previous, failed: false };
    } catch (problem) {
        console.warn(`[fantasy] precios ${league.id} ${day}: ${problem.message}`);
        return { table: null, previous: null, failed: true };
    }
};

/**
 * Todo lo del fantasy para un día: juegos y peloteros con sus puntos.
 * - Juegos en vivo o terminados: puntos reales de cada pelotero (y quedan «cerrados»: ya no se pueden cambiar).
 * - Juegos por empezar: roster del equipo, tomado de su juego de hoy y de su último juego.
 * - Juegos pospuestos: siguen en el día y sus peloteros salen con status 'postponed' (no suman ni se pueden escoger).
 * Cada pelotero trae su rival (`opp`), si va a jugar (`status`), sus puntos de los últimos 5 juegos (`last5`), su línea
 * de la temporada (`season`) y cuánto cambió su precio desde el día de juego anterior (`priceDelta`). `rules` dice las
 * reglas de ese día (tope por equipo y créditos de verdad).
 */
const fantasyDay = async (leagueKey, date) => {
    const league = LEAGUES[leagueKey] || LEAGUES.lidom;
    const today = isoDay(new Date(), league.timeZone);
    const day = date || today;
    const data = await scheduleOf(league, day);
    const all = uniqueGames((data?.dates || []).flatMap((entry) => entry.games || []));
    const todays = all.filter((game) => game.officialDate === day);
    const teamsOf = (game) => [game.teams?.away?.team?.id, game.teams?.home?.team?.id];
    const playing = new Set(todays.flatMap(teamsOf).filter(Boolean));

    // Precios: solo con lo de antes del día (no cambian mientras se juega). Se piden mientras se arma lo demás.
    const through = statsThrough(all, day, today);
    const pricing = pricesOf(league, day, through, previousGameDay(all, day));

    // Juegos jugados de los 10 días anteriores por los equipos de hoy (los pospuestos no): de ahí salen el roster y la
    // alineación del último juego de cada equipo, la rotación de los lanzadores y los puntos de los últimos 5 juegos
    const before = all
        .filter((game) => game.officialDate < day && gameStatus(game.status) === 'final' && teamsOf(game).some((id) => playing.has(id)))
        .sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)));
    const logs = new Map(await Promise.all(before.map(async (game) => [game.gamePk, await gameLogOf(game.gamePk)])));
    // Sin alguno de esos juegos la rotación y los últimos 5 saldrían mal: el día sale incompleto y se vuelve a pedir pronto
    let missing = before.some((game) => !logs.get(game.gamePk)) ? 1 : 0;

    // De cada equipo: su último juego, quién bateó de titular y quién abrió ahí, y las salidas de sus lanzadores
    const context = new Map();
    for (const teamId of playing) {
        const games = before.filter((game) => teamsOf(game).includes(teamId));
        const last = games.length ? logs.get(games[games.length - 1].gamePk)?.[teamId] ?? null : null;
        const outings = games.map((game) => ({ date: game.officialDate, time: game.gameDate, pitchers: logs.get(game.gamePk)?.[teamId]?.pitchers }));
        context.set(teamId, {
            last,
            lineup: new Set((last?.players || []).filter((player) => player.role === 'B' && player.starter).map((player) => player.id)),
            opener: last?.pitchers?.[0] ?? null,
            recent: outings.every((game) => game.pitchers) ? recentPitching(outings, day) : null
        });
    }

    // Puntos de cada pelotero en los juegos que jugó, del más viejo al más nuevo
    const pointsByGame = new Map();
    for (const game of before) {
        for (const team of Object.values(logs.get(game.gamePk) || {})) {
            for (const player of team.players) {
                if (!player.played) continue;
                if (!pointsByGame.has(player.id)) pointsByGame.set(player.id, []);
                pointsByGame.get(player.id).push(player.points);
            }
        }
    }

    const players = new Map();
    // Orden de los juegos de un equipo en el día: el 1 y el 2 de una doble cartelera (la hora del 2 puede ser de relleno)
    const orderOf = new Map(todays.map((game) => [game.gamePk, `${game.gameNumber ?? 1}|${game.gameDate || ''}`]));
    const add = (list, prefer) => {
        for (const player of list) {
            const current = players.get(player.id);
            // Doble cartelera: jugó los dos juegos del día. Cuentan los dos (los puntos y la línea se suman) y se cierra
            // con el primero
            if (current?.line && player.line && current.gamePk !== player.gamePk) {
                players.set(player.id, mergeGames(current, player, (orderOf.get(current.gamePk) || '') <= (orderOf.get(player.gamePk) || '') ? current.gamePk : player.gamePk));
                continue;
            }
            if (!current || (prefer && !current.line)) players.set(player.id, player);
        }
    };

    // Alineaciones anunciadas de los juegos por empezar (gamePk:teamId → ids)
    const posted = new Map();
    const games = await Promise.all(
        todays.map(async (game) => {
            const state = gameState(game.status);
            const status = gameStatus(game.status);
            const started = status === 'live' || status === 'final';
            // Pospuesto: no se pide nada (su roster sale del último juego de cada equipo)
            const doc = status === 'postponed' ? null : status === 'final' ? await boxOf(game.gamePk) : await feedOf(game.gamePk);
            // Juegos empezados sin box score (MLB falló): el día sale incompleto y se vuelve a pedir pronto
            if (!doc && started) missing += 1;
            if (doc) add(playersFromFeed(doc, game.gamePk, started), started);
            const box = doc?.liveData?.boxscore?.teams;
            const probables = {};
            for (const side of ['away', 'home']) {
                const listed = game.teams?.[side]?.probablePitcher?.id ?? doc?.gameData?.probablePitchers?.[side]?.id ?? null;
                // Empezado: el que abrió de verdad
                probables[side] = (started ? box?.[side]?.pitchers?.[0] : null) ?? listed;
                const teamId = game.teams?.[side]?.team?.id;
                if (started || !teamId) continue;
                const fromFeed = box?.[side]?.battingOrder || [];
                const order = fromFeed.length ? fromFeed : (game.lineups?.[`${side}Players`] || []).map((person) => person?.id).filter(Boolean);
                if (order.length) posted.set(`${game.gamePk}:${teamId}`, new Set(order));
            }
            // Primer lanzamiento (del feed de un juego en vivo): con la hora por definir, ahí se cierra el juego en el fantasy
            const firstPitch = started ? doc?.gameData?.gameInfo?.firstPitch : undefined;
            return { ...transformScheduleGame(game, leagueKey), state, ...(firstPitch ? { firstPitch } : {}), status, probables };
        })
    );

    // Roster completo de los equipos sin juego empezado hoy: el de su último juego (los de un juego que no empieza vienen
    // cortos). El gamePk se pone abajo.
    const startedTeams = new Set(games.filter((game) => game.status === 'live' || game.status === 'final').flatMap((game) => [game.away.id, game.home.id]));
    for (const teamId of playing) {
        if (startedTeams.has(teamId)) continue;
        const roster = context.get(teamId)?.last?.players || [];
        add(roster.map((player) => ({ id: player.id, name: player.name, teamId, gamePk: null, role: player.role, pos: player.pos, starter: player.starter, played: false, line: null, points: 0 })), false);
    }

    // El juego de cada equipo en el fantasy: el primero del día que no esté pospuesto (doble cartelera: se cierra al
    // empezar el primero); si solo tiene pospuestos, ese
    const byOrder = [...games].sort((a, b) => (orderOf.get(a.gamePk) || '').localeCompare(orderOf.get(b.gamePk) || ''));
    const gameOfTeam = new Map();
    for (const game of byOrder) {
        for (const id of [game.away.id, game.home.id]) {
            const current = gameOfTeam.get(id);
            if (!current || (current.status === 'postponed' && game.status !== 'postponed')) gameOfTeam.set(id, game);
        }
    }
    const gameByPk = new Map(games.map((game) => [game.gamePk, game]));

    const { table, previous, failed: pricesFailed } = await pricing;
    const priceMaps = table ? { B: new Map(table.prices.B), P: new Map(table.prices.P) } : null;
    const previousMaps = previous ? { B: new Map(previous.prices.B), P: new Map(previous.prices.P) } : null;
    const seasonMaps = table?.season ? { B: new Map(table.season.B), P: new Map(table.season.P) } : null;

    const list = [...players.values()]
        .filter((player) => gameOfTeam.has(player.teamId))
        .map((player) => {
            const game = (player.line && gameByPk.get(player.gamePk)) || gameOfTeam.get(player.teamId);
            const ctx = context.get(player.teamId) || {};
            const pitcher = player.role === 'P';
            const outing = pitcher ? ctx.recent?.get(player.id) : undefined;
            // Salidas de los 10 días anteriores (un lanzador) y si abrió el último juego de su equipo
            const recent = pitcher && ctx.recent ? { outings: outing?.outings ?? 0, ...(outing?.startedAgo !== undefined ? { startedAgo: outing.startedAgo } : {}) } : {};
            const rest = pitcher && ctx.opener === player.id;
            const resting = (ctx.recent ? outing?.startedAgo !== undefined && outing.startedAgo <= RESTING_DAYS : rest) ? 'resting' : 'bullpen';
            const side = game.home.id === player.teamId ? 'home' : 'away';

            // Si va a jugar: con el juego empezado, lo que pasó; antes, la alineación anunciada (o la del último juego)
            // y el abridor probable
            let lineup;
            if (player.line) lineup = pitcher ? (player.starter ? 'probable' : resting) : player.starter ? 'confirmed' : 'bench';
            else if (pitcher) lineup = game.probables?.[side] === player.id ? 'probable' : resting;
            else {
                const announced = posted.get(`${game.gamePk}:${player.teamId}`);
                lineup = announced ? (announced.has(player.id) ? 'confirmed' : 'bench') : ctx.lineup?.has(player.id) ? 'expected' : 'bench';
            }
            const ownGames = games.filter((g) => g.status !== 'postponed' && (g.away.id === player.teamId || g.home.id === player.teamId));
            const status =
                game.status === 'postponed' ? 'postponed' : !player.played && ownGames.length > 0 && ownGames.every((g) => g.status === 'final') ? 'dnp' : lineup;

            // Juego por empezar: titular = va en la alineación (anunciada o la del último juego) o es el abridor probable;
            // `rest` = abrió el último juego; lanzador: en cuántos juegos de los 10 días anteriores lanzó y hace cuántos días abrió
            const base = player.line
                ? { ...player }
                : { ...player, gamePk: game.gamePk, starter: ['confirmed', 'expected', 'probable'].includes(lineup), ...(rest ? { rest: true } : {}), ...recent };

            const role = pitcher ? 'P' : 'B';
            const price = priceMaps ? priceMaps[role].get(player.id) ?? CREDITS.unknown : undefined;
            const was = previousMaps ? previousMaps[role].get(player.id) ?? CREDITS.unknown : undefined;
            const opponent = side === 'home' ? game.away : game.home;
            return {
                ...base,
                ...(priceMaps ? { price } : {}),
                // Lo que se espera de él hoy (con lo de antes de hoy; sube a ×1 cuando se sabe que juega)
                ...(table?.ppg ? { proj: projectionOf(table, { ...base, ...recent, ...(rest ? { rest: true } : {}), status: status === 'postponed' ? 'postponed' : lineup }) } : {}),
                opp: opponent?.id ? { id: opponent.id, abbrev: opponent.abbrev || teamAbbrev(opponent.id), home: side === 'home' } : null,
                status,
                last5: (pointsByGame.get(player.id) || []).slice(-LAST_GAMES),
                season: seasonMaps?.[role].get(player.id) ?? null,
                priceDelta: priceMaps && previousMaps ? Math.round((price - was) * 10) / 10 : null
            };
        });

    // Créditos: el presupuesto del día (sin datos suficientes, ese día no hay tope)
    const credits = table ? { budget: table.budget, min: CREDITS.min, max: CREDITS.max } : null;
    const dayData = {
        league: leagueKey,
        date: day,
        games,
        teams: Object.fromEntries(
            games.flatMap((game) => [game.away, game.home]).map((team) => [team.id, { id: team.id, abbrev: team.abbrev || teamAbbrev(team.id), color: team.color || teamColor(team.id), logo: team.logo || teamLogo(team.id) }])
        ),
        players: list,
        scoring: SCORING,
        ...(credits ? { credits } : {})
    };
    const yesterday = shiftDay(day, -1);
    const frozen = table ? table.frozen : through === yesterday && yesterday < today;
    return {
        ...dayData,
        rules: rulesOf(dayData, league, frozen),
        ...(missing || pricesFailed ? { incomplete: true } : {})
    };
};

module.exports = {
    mergeGames, fantasyDay, batterPoints, pitcherPoints, playersFromFeed, recentPitching, gameStatus, statsThrough, previousGameDay, rulesOf, SCORING };
