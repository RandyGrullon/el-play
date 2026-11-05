const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { getSeasonInfo } = require('./season');
const { transformScheduleGame, uniqueGames } = require('../utils/transformers');

// Los juegos de un equipo en una temporada (regular y postemporada, jugados y por jugar) con el marcador de cada uno:
// la página del equipo saca de aquí sus resultados, la forma, cómo le va contra cada rival y su calendario.

const leagueOf = (leagueKey) => LEAGUES[leagueKey] || LEAGUES.lidom;

/** Del 1 de septiembre al 28 de febrero en LIDOM (la temporada cruza el año); el año entero en las demás */
const seasonRange = (league, season) =>
    league.id === 'lidom' ? { startDate: `${season}-09-01`, endDate: `${season + 1}-02-28` } : { startDate: `${season}-01-01`, endDate: `${season}-12-31` };

const load = async (league, teamId, season) => {
    const data = await http.mlbGet(`${MLB_API_BASE}/schedule`, { sportId: league.sportId, leagueId: league.leagueId, teamId, ...seasonRange(league, season), hydrate: 'linescore,decisions,team' });
    return uniqueGames((data?.dates || []).flatMap((date) => date.games || []))
        .filter((game) => [game.teams?.away?.team?.id, game.teams?.home?.team?.id].includes(teamId))
        .map((game) => transformScheduleGame(game, league.id))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
};

const fetchTeamGames = async (leagueKey, teamId, requested) => {
    const league = leagueOf(leagueKey);
    const { season: current } = await getSeasonInfo(league.id);
    let season = requested && requested <= current && requested >= current - 5 ? requested : current;
    let games = await load(league, teamId, season);
    // Antes del primer juego de la temporada se muestra la anterior (a menos que se pida una)
    if (!requested && !games.some((game) => game.state !== 'preview')) {
        const previous = await load(league, teamId, current - 1);
        if (previous.length) {
            season = current - 1;
            games = previous;
        }
    }
    return { league: league.id, season, currentSeason: current, teamId, games };
};

module.exports = { fetchTeamGames, seasonRange };
