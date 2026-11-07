// Rutas del modo PRO (juego): se montan en /api desde server/routes/index.js.
// Extras PRO de un juego (rastreo, corredores, acciones, box score completo, ritmo y récords); ?since=N solo lo nuevo.
const { TTL } = require('../../config/constants');
const { setCdnCache } = require('../../middleware/cacheHeaders');
const { fetchGamePro } = require('../../services/pro/juego');
const { noStore } = require('./helpers');

// Mismos tiempos que el detalle del Lite: en vivo 3 s, por empezar 30 s y terminado 10 min
const ttlOf = (state) => (state === 'live' ? TTL.GAME_LIVE : state === 'final' ? TTL.GAME_FINAL : TTL.GAME_PREVIEW);

const getGamePro = async (req, res, next) => {
    try {
        if (!/^\d{1,10}$/.test(req.params.gamePk)) return noStore(res).status(400).json({ error: 'invalid_game' });
        let since = null;
        if (req.query.since !== undefined) {
            if (!/^\d{1,4}$/.test(String(req.query.since))) return noStore(res).status(400).json({ error: 'invalid_since' });
            since = Number(req.query.since);
        }
        const data = await fetchGamePro(req.params.gamePk, since);
        setCdnCache(res, ttlOf(data.state));
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = (router) => {
    router.get('/v2/game/:gamePk/pro', getGamePro);
};
