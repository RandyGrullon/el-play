const { cached } = require('../utils/cache');
const { fetchPlayers, fetchPlayer } = require('../services/players');
const { LEAGUES } = require('../config/constants');

const leagueFrom = (req) => (LEAGUES[req.query.league] ? req.query.league : 'lidom');
const seasonFrom = (req) => (typeof req.query.season === 'string' && /^\d{4}$/.test(req.query.season) ? Number(req.query.season) : undefined);

// Temporada vigente: cambia con cada juego (5 min); una pasada ya no cambia
const ttlOf = (data) => (data.season === data.currentSeason ? 300 : 6 * 3600);
const setCache = (res, seconds) => res.set('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`);

const getPlayers = async (req, res, next) => {
    try {
        if (req.query.season && !seasonFrom(req)) return res.status(400).json({ error: 'invalid_season' });
        const league = leagueFrom(req);
        const season = seasonFrom(req);
        const data = await cached(`players_${league}_${season || 'actual'}`, ttlOf, () => fetchPlayers(league, season), { staleSec: 3600 });
        setCache(res, ttlOf(data));
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getPlayer = async (req, res, next) => {
    try {
        if (!/^\d{1,9}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_player' });
        if (req.query.season && !seasonFrom(req)) return res.status(400).json({ error: 'invalid_season' });
        const league = leagueFrom(req);
        const season = seasonFrom(req);
        const data = await cached(`player_${league}_${req.params.id}_${season || 'actual'}`, ttlOf, () => fetchPlayer(league, Number(req.params.id), season), { staleSec: 3600 });
        setCache(res, ttlOf(data));
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = { getPlayers, getPlayer };
