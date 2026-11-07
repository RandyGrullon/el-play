// Rutas del modo PRO (liga): se montan en /api desde server/routes/index.js.
// Fechas y avance de la temporada de una liga (season) y de las tres a la vez (seasons, para la hoja de ligas).
const { seasonOverview, allSeasons } = require('../../services/pro/standings');
const { leagueFrom, setCache } = require('./helpers');

// Las fechas de MLB casi no cambian: 30 minutos (la etapa y el día cambian con la fecha)
const SEASON_TTL = 1800;

const getSeason = async (req, res, next) => {
    try {
        const data = await seasonOverview(leagueFrom(req));
        setCache(res, SEASON_TTL);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getSeasons = async (req, res, next) => {
    try {
        const data = await allSeasons();
        setCache(res, SEASON_TTL);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = (router) => {
    router.get('/v2/pro/season', getSeason);
    router.get('/v2/pro/seasons', getSeasons);
};
