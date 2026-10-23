const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { getSeasonInfo } = require('./season');
const { hittingOf } = require('./players');
const { findTeam, teamAbbrev } = require('../utils/teams');

// Previa de un juego: cómo les ha ido entre ellos en la temporada y quién viene caliente (últimos 7 días).

const leagueOf = (leagueKey) => LEAGUES[leagueKey] || LEAGUES.lidom;
const HOT_DAYS = 7;
const HOT_MIN_PA = 8;
const HOT_PER_TEAM = 3;

const dayIn = (timeZone, time) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));

/** Juegos terminados de la temporada entre los dos equipos (del más reciente al más viejo) */
const fetchHeadToHead = async (league, season, away, home, now) => {
    // LIDOM empieza en octubre y termina en enero; las demás ligas caben en el año
    const startDate = league.id === 'lidom' ? `${season}-09-01` : `${season}-01-01`;
    const endDate = dayIn(league.timeZone, now);
    const data = await http.mlbGet(`${MLB_API_BASE}/schedule`, { sportId: league.sportId, leagueId: league.leagueId, teamId: away, opponentId: home, startDate, endDate, hydrate: 'linescore' });
    const games = (data?.dates || [])
        .flatMap((date) => date.games || [])
        .filter((game) => game.status?.abstractGameState === 'Final' && !/postponed|cancel/i.test(game.status?.detailedState || ''))
        .filter((game) => {
            const ids = [game.teams?.away?.team?.id, game.teams?.home?.team?.id];
            return ids.includes(away) && ids.includes(home);
        })
        .map((game) => {
            const awayRuns = game.teams.away.score ?? game.linescore?.teams?.away?.runs ?? 0;
            const homeRuns = game.teams.home.score ?? game.linescore?.teams?.home?.runs ?? 0;
            return {
                gamePk: game.gamePk,
                date: game.gameDate || null,
                away: { id: game.teams.away.team.id, runs: awayRuns },
                home: { id: game.teams.home.team.id, runs: homeRuns },
                winnerId: awayRuns === homeRuns ? null : awayRuns > homeRuns ? game.teams.away.team.id : game.teams.home.team.id
            };
        })
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const wins = { [away]: 0, [home]: 0 };
    const runs = { [away]: 0, [home]: 0 };
    for (const game of games) {
        if (game.winnerId) wins[game.winnerId] += 1;
        runs[game.away.id] += game.away.runs;
        runs[game.home.id] += game.home.runs;
    }
    return { games, wins, runs };
};

/** Los tres mejores bateadores de cada equipo en los últimos 7 días (por OPS, con al menos 8 apariciones) */
const fetchHot = async (league, season, teamIds, now) => {
    const endDate = dayIn(league.timeZone, now);
    const startDate = dayIn(league.timeZone, now - (HOT_DAYS - 1) * 86400000);
    const data = await http.mlbGet(`${MLB_API_BASE}/stats`, {
        stats: 'byDateRange',
        group: 'hitting',
        startDate,
        endDate,
        season,
        leagueId: league.leagueId,
        sportIds: league.sportId,
        gameType: league.statsGameType || 'R',
        playerPool: 'ALL',
        limit: 1000
    });
    const byTeam = new Map(teamIds.map((id) => [id, []]));
    for (const split of data?.stats?.[0]?.splits || []) {
        const list = byTeam.get(split.team?.id);
        if (!list || !split.player?.id) continue;
        const line = hittingOf(split.stat);
        if (line.pa < HOT_MIN_PA) continue;
        list.push({ id: split.player.id, name: split.player.fullName || '', teamId: split.team.id, g: line.g, pa: line.pa, ab: line.ab, h: line.h, hr: line.hr, rbi: line.rbi, bb: line.bb, avg: line.avg, ops: line.ops });
    }
    const ops = (player) => parseFloat(player.ops) || 0;
    return { startDate, endDate, teams: Object.fromEntries([...byTeam].map(([id, list]) => [id, list.sort((a, b) => ops(b) - ops(a) || b.hr - a.hr).slice(0, HOT_PER_TEAM)])) };
};

const fetchPreview = async (leagueKey, away, home, now = Date.now()) => {
    const league = leagueOf(leagueKey);
    const { season } = await getSeasonInfo(league.id);
    // Cada parte por su lado: si una falla, la otra igual llega
    const [headToHead, hot] = await Promise.all([
        fetchHeadToHead(league, season, away, home, now).catch((error) => {
            console.warn(`[preview] enfrentamientos ${away}-${home}: ${error.message}`);
            return null;
        }),
        fetchHot(league, season, [away, home], now).catch((error) => {
            console.warn(`[preview] calientes ${away}-${home}: ${error.message}`);
            return null;
        })
    ]);
    const team = (id) => ({ id, abbrev: teamAbbrev(id, league.id, null, findTeam(id, league.id)?.name || '') });
    return { league: league.id, season, away: team(away), home: team(home), headToHead, hot };
};

module.exports = { fetchPreview, HOT_DAYS };
