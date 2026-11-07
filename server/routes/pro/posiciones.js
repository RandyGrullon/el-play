// Rutas del modo PRO (posiciones): se montan en /api desde server/routes/index.js.
// Posiciones con `pro` en cada fila (situaciones, esperado, línea de corte…) y, en LIDOM, las fases y las fechas.
const { proStandings } = require('../../services/pro/standings');
const { leagueFrom, setCache } = require('./helpers');

// Con juegos en vivo cada minuto; si no, 5 minutos (como las del Lite)
const getProStandings = async (req, res, next) => {
    try {
        const data = await proStandings(leagueFrom(req));
        setCache(res, data.pro.live ? 60 : 300);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = (router) => {
    router.get('/v2/pro/standings', getProStandings);
};
