const { cached } = require('../utils/cache');
const { fetchSchedule, scheduleRange } = require('../services/mlbService');
const { TTL, LEAGUES } = require('../config/constants');
const { setCdnCache } = require('../middleware/cacheHeaders');
const { toLegacySchedule } = require('../utils/legacy');

const ttlForSchedule = (schedule) => {
    const now = Date.now();
    const busy = schedule.games.some((game) => {
        if (game.state === 'live') return true;
        const startsIn = new Date(game.date).getTime() - now;
        return game.state === 'preview' && startsIn < 15 * 60 * 1000 && startsIn > -3 * 60 * 60 * 1000;
    });
    return busy ? TTL.SCHEDULE_LIVE : TTL.SCHEDULE_IDLE;
};

const handler = (format) => async (req, res, next) => {
    try {
        const leagueKey = LEAGUES[req.query.league] ? req.query.league : 'lidom';
        const { startDate, endDate } = scheduleRange(LEAGUES[leagueKey]);
        const schedule = await cached(
            `schedule_${leagueKey}_${startDate}_${endDate}`,
            (value) => ttlForSchedule(value)[0],
            () => fetchSchedule(leagueKey)
        );
        setCdnCache(res, ttlForSchedule(schedule));
        res.json(format(schedule));
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getScheduleV2: handler((schedule) => schedule),
    getSchedule: handler(toLegacySchedule),
    ttlForSchedule
};
