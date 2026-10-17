const { cached } = require('../utils/cache');
const { fantasyDay } = require('../services/fantasy');
const { LEAGUES } = require('../config/constants');

const leagueFrom = (req) => (LEAGUES[req.query.league] ? req.query.league : 'lidom');

// Día del fantasy: puntos en vivo mientras haya juegos; un día terminado casi no cambia
const getFantasyDay = async (req, res, next) => {
    try {
        const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : undefined;
        if (req.query.date && !date) return res.status(400).json({ error: 'invalid_date' });
        const league = leagueFrom(req);
        const ttl = (day) => (day.games.some((game) => game.state === 'live') ? 20 : day.games.every((game) => game.state === 'final') && day.games.length ? 3600 : 120);
        const data = await cached(`fantasy_${league}_${date || 'hoy'}`, ttl, () => fantasyDay(league, date), { staleSec: 600 });
        const seconds = ttl(data);
        res.set('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = { getFantasyDay };
