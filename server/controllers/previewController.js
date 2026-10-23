const { cached } = require('../utils/cache');
const { fetchPreview } = require('../services/preview');
const { isLeague } = require('../config/constants');

const leagueFrom = (req) => (isLeague(req.query.league) ? req.query.league : 'lidom');
const teamFrom = (value) => (typeof value === 'string' && /^\d{1,7}$/.test(value) ? Number(value) : null);

// Previa del juego: enfrentamientos de la temporada y los que vienen calientes. Cambia una vez por juego: 10 minutos
const getPreview = async (req, res, next) => {
    try {
        const away = teamFrom(req.query.away);
        const home = teamFrom(req.query.home);
        if (!away || !home || away === home) return res.set('Cache-Control', 'no-store').status(400).json({ error: 'invalid_team' });
        const league = leagueFrom(req);
        const data = await cached(`preview_${league}_${away}_${home}`, 600, () => fetchPreview(league, away, home), { staleSec: 3600 });
        res.set('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=1200');
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = { getPreview };
