const { fetchWithCache } = require('../utils/cache');
const { fetchStandingsData, fetchLeadersData } = require('../services/mlbService');
const { TTL } = require('../config/constants');

const getStandings = async (req, res, next) => {
    const cacheKey = 'standings';
    try {
        const data = await fetchWithCache(cacheKey, fetchStandingsData, TTL.STANDINGS);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getLeaders = async (req, res, next) => {
    const cacheKey = 'leaders_hr';
    try {
        const data = await fetchWithCache(cacheKey, fetchLeadersData, TTL.LEADERS);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getStandings,
    getLeaders
};
