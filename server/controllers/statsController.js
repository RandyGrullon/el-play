const { cached } = require('../utils/cache');
const { fetchStandings, fetchLeaders, fetchRace } = require('../services/mlbService');
const { TTL, LEAGUES, isLeague } = require('../config/constants');
const { setCdnCache } = require('../middleware/cacheHeaders');
const { toLegacyLeaders } = require('../utils/legacy');

const leagueFrom = (req) => (isLeague(req.query.league) ? req.query.league : 'lidom');

const standingsHandler = async (req, res, next) => {
    try {
        const leagueKey = leagueFrom(req);
        const data = await cached(`standings_${leagueKey}`, TTL.STANDINGS[0], () => fetchStandings(leagueKey), { staleSec: 3600 });
        setCdnCache(res, TTL.STANDINGS);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const leadersHandler = (format) => async (req, res, next) => {
    try {
        const leagueKey = leagueFrom(req);
        const data = await cached(`leaders_${leagueKey}`, TTL.LEADERS[0], () => fetchLeaders(leagueKey), { staleSec: 3600 });
        setCdnCache(res, TTL.LEADERS);
        res.json(format(data));
    } catch (error) {
        next(error);
    }
};

// La carrera de la temporada: cambia una vez por día de juegos (30 minutos)
const raceHandler = async (req, res, next) => {
    try {
        const leagueKey = leagueFrom(req);
        const data = await cached(`race_${leagueKey}`, 1800, () => fetchRace(leagueKey), { staleSec: 3600 });
        res.set('Cache-Control', 'public, max-age=0, s-maxage=1800, stale-while-revalidate=3600');
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getRace: raceHandler,
    getStandings: standingsHandler,
    getLeadersV2: leadersHandler((data) => data),
    getLeaders: leadersHandler(toLegacyLeaders)
};
