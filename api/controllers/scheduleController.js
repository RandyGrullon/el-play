const { fetchWithCache } = require('../utils/cache');
const { fetchScheduleData } = require('../services/mlbService');
const { TTL } = require('../config/constants');

const getSchedule = async (req, res, next) => {
    try {
        // Use Santo Domingo time to determine "today"
        const options = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
        const formatter = new Intl.DateTimeFormat('en-CA', options); // Returns YYYY-MM-DD

        const today = new Date();
        const startDate = formatter.format(today);

        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const endDate = formatter.format(nextWeek);
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
