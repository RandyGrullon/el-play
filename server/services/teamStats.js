const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { getSeasonInfo } = require('./season');
const { teamAbbrev, teamColor, teamLogo, findTeam } = require('../utils/teams');
const { hittingOf, pitchingOf } = require('./players');

// Estadísticas colectivas de cada equipo de la liga en una temporada: bateo y pitcheo, tal como las da MLB en
// /teams/stats (las mismas líneas de los peloteros, más lo que solo tiene sentido por equipo: carreras permitidas,
// promedio en contra, quedados en base, salvados y desperdiciados).

const leagueOf = (leagueKey) => LEAGUES[leagueKey] || LEAGUES.lidom;

/** Bateo del equipo: la línea de siempre más quedados en base y BABIP */
const teamHittingOf = (s = {}) => ({ ...hittingOf(s), lob: s.leftOnBase ?? 0, babip: s.babip ?? '.000' });

/** Pitcheo del equipo: la línea de siempre más carreras permitidas, lo que le batean y los salvados */
const teamPitchingOf = (s = {}) => ({
    ...pitchingOf(s),
    r: s.runs ?? 0,
    avg: s.avg ?? '.000',
    obp: s.obp ?? '.000',
    ops: s.ops ?? '.000',
    svo: s.saveOpportunities ?? 0,
    bs: s.blownSaves ?? 0,
    sho: s.shutouts ?? 0,
    cg: s.completeGames ?? 0
});

const splitsOf = (league, season, group) =>
    http
        .mlbGet(`${MLB_API_BASE}/teams/stats`, { stats: 'season', group, season, sportIds: league.sportId, leagueIds: league.leagueId, gameType: 'R' })
        .then((data) => data?.stats?.[0]?.splits || []);

const fetchTeamStats = async (leagueKey, requested) => {
    const league = leagueOf(leagueKey);
    const { season: current } = await getSeasonInfo(league.id);
    let season = requested && requested <= current && requested >= current - 5 ? requested : current;
    const load = (year) => Promise.all([splitsOf(league, year, 'hitting'), splitsOf(league, year, 'pitching')]);

    let [hitting, pitching] = await load(season);
    let isPreviousSeason = false;
    // Antes del primer juego de la temporada se muestra la anterior (a menos que se pida una)
    if (!requested && !hitting.length && !pitching.length) {
        season = current - 1;
        [hitting, pitching] = await load(season);
        isPreviousSeason = true;
    }

    const teams = new Map();
    const touch = (team) => {
        if (!team?.id) return null;
        if (!teams.has(team.id)) {
            teams.set(team.id, {
                id: team.id,
                abbrev: teamAbbrev(team.id, league.id, team.abbreviation, team.name),
                name: findTeam(team.id, league.id)?.name || team.name || '',
                color: teamColor(team.id, league.id),
                logo: teamLogo(team.id),
                hitting: null,
                pitching: null
            });
        }
        return teams.get(team.id);
    };
    for (const split of hitting) {
        const team = touch(split.team);
        if (team) team.hitting = teamHittingOf(split.stat);
    }
    for (const split of pitching) {
        const team = touch(split.team);
        if (team) team.pitching = teamPitchingOf(split.stat);
    }

    return {
        league: league.id,
        season,
        currentSeason: current,
        seasons: [current, current - 1, current - 2],
        isPreviousSeason,
        teams: [...teams.values()].sort((a, b) => a.abbrev.localeCompare(b.abbrev))
    };
};

module.exports = { fetchTeamStats, teamHittingOf, teamPitchingOf };
