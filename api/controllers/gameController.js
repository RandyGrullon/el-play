const { fetchWithCache } = require('../utils/cache');
const { fetchLiveGameData } = require('../services/mlbService');
const { TTL } = require('../config/constants');

const getGameData = async (req, res, next) => {
    const { gamePk } = req.params;
    const cacheKey = `game_${gamePk}`;

    try {
        const data = await fetchWithCache(cacheKey, () => fetchLiveGameData(gamePk), TTL.GAME_LIVE);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getGameData
};
