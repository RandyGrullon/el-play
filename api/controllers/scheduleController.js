const { fetchWithCache } = require('../utils/cache');
const { fetchScheduleData } = require('../services/mlbService');
const { TTL } = require('../config/constants');

const getSchedule = async (req, res, next) => {
    try {
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        const startDate = today.toISOString().split('T')[0];
        const endDate = nextWeek.toISOString().split('T')[0];
        const cacheKey = `schedule_${startDate}_${endDate}`;

        const data = await fetchWithCache(cacheKey, () => fetchScheduleData(startDate, endDate), TTL.SCHEDULE);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSchedule
};
