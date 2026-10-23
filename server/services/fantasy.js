const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { getLiveFeed } = require('./liveFeed');
const { transformScheduleGame, gameState } = require('../utils/transformers');
const { teamAbbrev, teamColor, teamLogo } = require('../utils/teams');
const { cached } = require('../utils/cache');
const { CREDITS, CREDITS_FROM, dayPrices, projectionOf } = require('./fantasyPrices');

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
                starter: role === 'B' ? (team.battingOrder || []).includes(id) : (team.pitchers || [])[0] === id,
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

// De un juego terminado para la rotación basta saber quién lanzó por equipo (el primero abrió): el box score recortado
// con `fields` (~2 KB) y un día en caché, porque ya no cambia. Si MLB falla, null.
const pitchersOf = async (gamePk) => {
    try {
        return await cached(
            `fantasy_pitchers_${gamePk}`,
            86400,
            async () => {
                const boxscore = await http.mlbGet(`${MLB_API_BASE}/game/${gamePk}/boxscore`, { fields: 'teams,away,home,team,id,pitchers' });
                if (!boxscore?.teams) throw new Error('sin box score');
                return Object.fromEntries(['away', 'home'].map((side) => [boxscore.teams[side]?.team?.id, boxscore.teams[side]?.pitchers || []]));
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

/**
 * Todo lo del fantasy para un día: juegos y peloteros con sus puntos.
 * - Juegos en vivo o terminados: puntos reales de cada pelotero (y quedan «cerrados»: ya no se pueden cambiar).
 * - Juegos por empezar: roster del equipo, tomado de su juego de hoy y de su último juego.
 */
const fantasyDay = async (leagueKey, date) => {
    const league = LEAGUES[leagueKey] || LEAGUES.lidom;
    const day = date || isoDay(new Date(), league.timeZone);
    const data = await http.mlbGet(`${MLB_API_BASE}/schedule`, {
        sportId: league.sportId,
        leagueId: league.leagueId,
        startDate: shiftDay(day, -10),
        endDate: day,
        hydrate: 'team,linescore'
    });
    const all = (data?.dates || []).flatMap((entry) => entry.games || []);
    const todays = all.filter((game) => game.officialDate === day && !['Postponed', 'Cancelled'].includes(game.status?.detailedState));

    const players = new Map();
    const startOf = new Map(todays.map((game) => [game.gamePk, game.gameDate || '']));
    const add = (list, prefer) => {
        for (const player of list) {
            const current = players.get(player.id);
            // Doble cartelera: jugó los dos juegos del día. Cuentan los dos (los puntos y la línea se suman) y se cierra
            // con el primero
            if (current?.line && player.line && current.gamePk !== player.gamePk) {
                players.set(player.id, mergeGames(current, player, (startOf.get(current.gamePk) || '') <= (startOf.get(player.gamePk) || '') ? current.gamePk : player.gamePk));
                continue;
            }
            if (!current || (prefer && !current.line)) players.set(player.id, player);
        }
    };

    // Del último juego de cada equipo con juego por empezar: quién bateó en la alineación (probable titular hoy)
    // y qué lanzador abrió (le toca descansar). En LIDOM no se anuncian alineaciones ni abridores antes del juego.
    const lastLineup = new Set();
    const lastStarter = new Set();
    // Y de sus juegos de los 10 días anteriores, las salidas de cada lanzador (la rotación: a quién le toca abrir)
    const recentByTeam = new Map();

    // Juegos empezados sin box score (MLB falló): el día sale incompleto y se vuelve a pedir pronto
    let missing = 0;
    const games = await Promise.all(
        todays.map(async (game) => {
            const state = gameState(game.status);
            const doc = state === 'final' ? await boxOf(game.gamePk) : await feedOf(game.gamePk);
            if (!doc && state !== 'preview') missing += 1;
            if (doc) add(playersFromFeed(doc, game.gamePk, state !== 'preview'), state !== 'preview');
            if (state === 'preview') {
                // Roster completo: el último juego de cada equipo (los rosters de un juego que no empieza vienen cortos)
                for (const side of ['away', 'home']) {
                    const teamId = game.teams?.[side]?.team?.id;
                    const last = all
                        .filter((g) => g.officialDate < day && gameState(g.status) === 'final' && [g.teams?.away?.team?.id, g.teams?.home?.team?.id].includes(teamId))
                        .sort((a, b) => b.gameDate.localeCompare(a.gameDate))[0];
                    const lastDoc = last ? await boxOf(last.gamePk) : null;
                    if (!lastDoc) continue;
                    const roster = playersFromFeed(lastDoc, game.gamePk, false).filter((player) => player.teamId === teamId);
                    roster.filter((player) => player.starter).forEach((player) => (player.role === 'P' ? lastStarter : lastLineup).add(player.id));
                    add(roster, false);
                    const played = all.filter((g) => g.officialDate < day && gameState(g.status) === 'final' && !['Postponed', 'Cancelled'].includes(g.status?.detailedState) && [g.teams?.away?.team?.id, g.teams?.home?.team?.id].includes(teamId));
                    const logs = await Promise.all(played.map(async (g) => ({ date: g.officialDate, time: g.gameDate, pitchers: (await pitchersOf(g.gamePk))?.[teamId] })));
                    // Sin alguno de esos juegos la rotación saldría mal: esos lanzadores quedan sin el dato y se vuelve a pedir pronto
                    if (logs.every((log) => log.pitchers)) recentByTeam.set(teamId, recentPitching(logs, day));
                    else missing += 1;
                }
            }
            // Primer lanzamiento (del feed de un juego en vivo): con la hora por definir, ahí se cierra el juego en el fantasy
            const firstPitch = state !== 'preview' ? doc?.gameData?.gameInfo?.firstPitch : undefined;
            return { ...transformScheduleGame(game, leagueKey), state, ...(firstPitch ? { firstPitch } : {}) };
        })
    );

    // Un pelotero de un juego por empezar pertenece a ese juego aunque su roster venga del juego anterior
    const gameOfTeam = new Map(games.flatMap((game) => [[game.away.id, game.gamePk], [game.home.id, game.gamePk]]));
    const list = [...players.values()]
        .filter((player) => gameOfTeam.has(player.teamId))
        .map((player) => {
            const gamePk = player.line ? player.gamePk : gameOfTeam.get(player.teamId);
            if (player.line) return { ...player, gamePk };
            // Juego por empezar: titular = estuvo en la alineación del último juego; `rest` = abrió el último juego;
            // lanzador: en cuántos juegos de los 10 días anteriores lanzó y hace cuántos días abrió
            const recent = player.role === 'P' ? recentByTeam.get(player.teamId) : null;
            const outing = recent?.get(player.id);
            return {
                ...player,
                gamePk,
                starter: player.role === 'B' ? lastLineup.has(player.id) : false,
                ...(lastStarter.has(player.id) ? { rest: true } : {}),
                ...(recent ? { outings: outing?.outings ?? 0, ...(outing?.startedAgo !== undefined ? { startedAgo: outing.startedAgo } : {}) } : {})
            };
        });

    // Créditos: el precio de cada pelotero en el día (sin datos suficientes, ese día no hay tope)
    let credits = null;
    let pricesFailed = false;
    if (day >= CREDITS_FROM) {
        try {
            const table = await dayPrices(league.id, day, { batterPoints, pitcherPoints });
            if (table) {
                const prices = { B: new Map(table.prices.B), P: new Map(table.prices.P) };
                for (const player of list) {
                    player.price = prices[player.role === 'P' ? 'P' : 'B'].get(player.id) ?? CREDITS.unknown;
                    // Lo que se espera de él hoy (con lo de antes de hoy: no cambia durante el día)
                    if (table.ppg) player.proj = projectionOf(table, player);
                }
                credits = { budget: table.budget, min: CREDITS.min, max: CREDITS.max };
            }
        } catch (problem) {
            // Sin precios no se puede armar con tope: el día sale incompleto y se vuelve a pedir pronto
            console.warn(`[fantasy] precios ${league.id} ${day}: ${problem.message}`);
            pricesFailed = true;
        }
    }

    return {
        league: leagueKey,
        date: day,
        games,
        teams: Object.fromEntries(
            games.flatMap((game) => [game.away, game.home]).map((team) => [team.id, { id: team.id, abbrev: team.abbrev || teamAbbrev(team.id), color: team.color || teamColor(team.id), logo: team.logo || teamLogo(team.id) }])
        ),
        players: list,
        scoring: SCORING,
        ...(credits ? { credits } : {}),
        ...(missing || pricesFailed ? { incomplete: true } : {})
    };
};

module.exports = {
    mergeGames, fantasyDay, batterPoints, pitcherPoints, playersFromFeed, recentPitching, SCORING };
