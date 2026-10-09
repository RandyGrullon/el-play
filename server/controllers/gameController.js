const { cached } = require('../utils/cache');
const { fetchGame, getFeedInfo } = require('../services/mlbService');
const { TTL } = require('../config/constants');
const { setCdnCache } = require('../middleware/cacheHeaders');
const { toLegacyGame } = require('../utils/legacy');

const ttlForGame = (game) => {
    if (game.state === 'live') return TTL.GAME_LIVE;
    if (game.state === 'final') return TTL.GAME_FINAL;
    const startsIn = game.date ? new Date(game.date).getTime() - Date.now() : Infinity;
    return startsIn < 30 * 60 * 1000 ? [10, 10, 20] : TTL.GAME_PREVIEW;
};

const loadGame = (gamePk) => cached(`game_${gamePk}`, (game) => ttlForGame(game)[0], () => fetchGame(gamePk), { staleSec: 120 });

const handler = (format) => async (req, res, next) => {
    const { gamePk } = req.params;
    if (!/^\d{3,9}$/.test(gamePk)) {
        return res.status(400).json({ error: 'invalid_game' });
    }
    try {
        const game = await loadGame(gamePk);
        setCdnCache(res, ttlForGame(game));
        const feed = getFeedInfo(gamePk);
        if (feed) res.set('X-Feed-Mode', `${feed.mode}; v=${feed.version}; ts=${game.updatedAt || ''}`);
        res.json(format(game));
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getGame: handler((game) => game),
    getGameData: handler(toLegacyGame),
    ttlForGame
};
