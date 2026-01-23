const { fetchWithCache } = require('../utils/cache');
const { fetchStandingsData, fetchLeadersData } = require('../services/mlbService');
const { TTL } = require('../config/constants');

const getStandings = async (req, res, next) => {
    try {
        const leagueId = req.query.league || 'lidom';
        const cacheKey = `standings_${leagueId}`;
        const data = await fetchWithCache(cacheKey, () => fetchStandingsData(leagueId), TTL.STANDINGS);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getLeaders = async (req, res, next) => {
    try {
        const leagueId = req.query.league || 'lidom';
        const cacheKey = `leaders_${leagueId}`;
        const data = await fetchWithCache(cacheKey, () => fetchLeadersData(leagueId), TTL.LEADERS);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getStandings,
    getLeaders
};
