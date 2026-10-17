const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { getLiveFeed } = require('./liveFeed');
const { transformScheduleGame, gameState } = require('../utils/transformers');
const { teamAbbrev, teamColor, teamLogo } = require('../utils/teams');

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

const isoDay = (date, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const shiftDay = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

const feedOf = async (gamePk) => {
    try {
        return (await getLiveFeed(gamePk)).doc;
    } catch {
        return null;
    }
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
    const add = (list, prefer) => {
        for (const player of list) {
            const current = players.get(player.id);
            if (!current || (prefer && !current.line)) players.set(player.id, player);
        }
    };

    const games = await Promise.all(
        todays.map(async (game) => {
            const state = gameState(game.status);
            const doc = await feedOf(game.gamePk);
            if (doc) add(playersFromFeed(doc, game.gamePk, state !== 'preview'), state !== 'preview');
            if (state === 'preview') {
                // Roster completo: el último juego de cada equipo (los rosters de un juego que no empieza vienen cortos)
                for (const side of ['away', 'home']) {
                    const teamId = game.teams?.[side]?.team?.id;
                    const last = all
                        .filter((g) => g.officialDate < day && gameState(g.status) === 'final' && [g.teams?.away?.team?.id, g.teams?.home?.team?.id].includes(teamId))
                        .sort((a, b) => b.gameDate.localeCompare(a.gameDate))[0];
                    const lastDoc = last ? await feedOf(last.gamePk) : null;
                    if (lastDoc) add(playersFromFeed(lastDoc, game.gamePk, false).filter((player) => player.teamId === teamId), false);
                }
            }
            return { ...transformScheduleGame(game, leagueKey), state };
        })
    );

    // Un pelotero de un juego por empezar pertenece a ese juego aunque su roster venga del juego anterior
    const gameOfTeam = new Map(games.flatMap((game) => [[game.away.id, game.gamePk], [game.home.id, game.gamePk]]));
    const list = [...players.values()]
        .filter((player) => gameOfTeam.has(player.teamId))
        .map((player) => ({ ...player, gamePk: player.line ? player.gamePk : gameOfTeam.get(player.teamId) }));

    return {
        league: leagueKey,
        date: day,
        games,
        teams: Object.fromEntries(
            games.flatMap((game) => [game.away, game.home]).map((team) => [team.id, { id: team.id, abbrev: team.abbrev || teamAbbrev(team.id), color: team.color || teamColor(team.id), logo: team.logo || teamLogo(team.id) }])
        ),
        players: list,
        scoring: SCORING
    };
};

module.exports = { fantasyDay, batterPoints, pitcherPoints, playersFromFeed, SCORING };
