// Rutas del modo PRO (liga): se montan en /api desde server/routes/index.js.
// Fechas y avance de la temporada de una liga (season) y de las tres a la vez (seasons, para la hoja de ligas), y el
// calendario de toda la temporada con la carrera, el cara a cara y la forma (calendar).
const { seasonOverview, allSeasons } = require('../../services/pro/standings');
const { seasonCalendar, calendarTtl } = require('../../services/pro/calendar');
const { leagueFrom, seasonFrom, setCache, noStore } = require('./helpers');

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

// ?season=AAAA opcional (la liga inválida ya la rechaza el router): futura o muy vieja también es 400
const getCalendar = async (req, res, next) => {
    try {
        if (req.query.season !== undefined && seasonFrom(req) === undefined) return noStore(res).status(400).json({ error: 'invalid_season' });
        const requested = seasonFrom(req);
        const data = await seasonCalendar(leagueFrom(req), requested);
        if (!data) return noStore(res).status(400).json({ error: 'invalid_season' });
        setCache(res, calendarTtl(data, requested !== undefined));
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = (router) => {
    router.get('/v2/pro/season', getSeason);
    router.get('/v2/pro/seasons', getSeasons);
    router.get('/v2/pro/calendar', getCalendar);
};
