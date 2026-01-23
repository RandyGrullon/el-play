const { fetchWithCache } = require('../utils/cache');
const { fetchScheduleData } = require('../services/mlbService');
const { TTL, LEAGUES } = require('../config/constants');

const getSchedule = async (req, res, next) => {
    try {
        const leagueId = req.query.league || 'lidom';
        const league = LEAGUES[leagueId] || LEAGUES.lidom;
        
        // Use appropriate timezone based on league
        const timezone = leagueId === 'wbc' ? 'America/New_York' : 'America/Santo_Domingo';
        const options = { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' };
        const formatter = new Intl.DateTimeFormat('en-CA', options); // Returns YYYY-MM-DD

        const today = new Date();

        // For WBC, extend the date range since games are across multiple days
        const pastDays = leagueId === 'wbc' ? 7 : 3;
        const futureDays = leagueId === 'wbc' ? 14 : 7;

        const pastDate = new Date(today);
        pastDate.setDate(today.getDate() - pastDays);
        const startDate = formatter.format(pastDate);

        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + futureDays);
        const endDate = formatter.format(nextWeek);
        const cacheKey = `schedule_${leagueId}_${startDate}_${endDate}`;

        const data = await fetchWithCache(cacheKey, () => fetchScheduleData(startDate, endDate, leagueId), TTL.SCHEDULE);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSchedule
};
