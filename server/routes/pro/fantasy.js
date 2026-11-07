// Rutas del modo PRO (fantasy): se montan en /api desde server/routes/index.js.
// Lo de todos (stats), la forma de cada pelotero (form), las alineaciones (lineups), el perfil PRO de un fanático y su
// detalle (fan/:userId, fan/:userId/detail) y la tabla de la temporada con flechas (season). Sin Supabase, las que
// necesitan los equipos de todos responden 503 «accounts_disabled» como las del Lite.
const fans = require('../../services/fantasyFans');
const day = require('../../services/pro/fantasyDay');
const fanPro = require('../../services/pro/fans');
const { leagueFrom, setCache, noStore, dayFrom, accountsFailure, requireAccounts } = require('./helpers');

const MAX_USERS = fans.MAX_USERS || 100;

const userFrom = (req, res) => {
    if (fans.isUuid(req.params.userId)) return req.params.userId.toLowerCase();
    noStore(res).status(400).json({ error: 'invalid_user' });
    return null;
};

// % de fanáticos por pelotero, capitán y pronóstico (solo juegos cerrados) y los puntos de todos en el día
const getStats = async (req, res, next) => {
    try {
        const league = leagueFrom(req);
        const date = dayFrom(req, league);
        if (!date) return noStore(res).status(400).json({ error: 'invalid_date' });
        if (requireAccounts(res)) return;
        const data = await day.dayStats(league, date);
        setCache(res, day.statsTtl(data));
        res.json(data);
    } catch (error) {
        if (!accountsFailure(res, error)) next(error);
    }
};

// Puntos de los últimos 5 juegos de cada pelotero del día
const getForm = async (req, res, next) => {
    try {
        const league = leagueFrom(req);
        const date = dayFrom(req, league);
        if (!date) return noStore(res).status(400).json({ error: 'invalid_date' });
        const data = await day.dayForm(league, date);
        setCache(res, data.partial ? 30 : 1800);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

// Titulares de cada juego del día: publicados o, mientras no, los esperados (los del último juego)
const getLineups = async (req, res, next) => {
    try {
        const league = leagueFrom(req);
        const date = dayFrom(req, league);
        if (!date) return noStore(res).status(400).json({ error: 'invalid_date' });
        const data = await day.dayLineups(league, date);
        setCache(res, day.lineupsTtl(data));
        res.json(data);
    } catch (error) {
        next(error);
    }
};

// Perfil PRO de un fanático: el del Lite más `pro`
const getFan = async (req, res, next) => {
    try {
        const userId = userFrom(req, res);
        if (!userId || requireAccounts(res)) return;
        const value = await fanPro.fanData(leagueFrom(req), userId);
        setCache(res, fanPro.fanTtl(value));
        res.json(value.profile);
    } catch (error) {
        if (!accountsFailure(res, error)) next(error);
    }
};

// Su temporada en detalle (lo de juegos sin empezar no sale)
const getFanDetail = async (req, res, next) => {
    try {
        const userId = userFrom(req, res);
        if (!userId || requireAccounts(res)) return;
        const value = await fanPro.fanData(leagueFrom(req), userId);
        setCache(res, fanPro.fanTtl(value));
        res.json(value.detail);
    } catch (error) {
        if (!accountsFailure(res, error)) next(error);
    }
};

// Tabla de la temporada con el puesto anterior y el promedio de cada día; ?users=<uuid,…> (máx. 100) para una liga privada
const getSeason = async (req, res, next) => {
    try {
        let users = null;
        if (req.query.users !== undefined) {
            users = [...new Set(String(req.query.users).split(',').map((id) => id.trim().toLowerCase()).filter(Boolean))];
            if (!users.length || users.length > MAX_USERS || !users.every(fans.isUuid)) return noStore(res).status(400).json({ error: 'invalid_user' });
        }
        if (requireAccounts(res)) return;
        const data = await fanPro.seasonRanking(leagueFrom(req), { users });
        setCache(res, data.partial ? 30 : 300);
        res.json(data);
    } catch (error) {
        if (!accountsFailure(res, error)) next(error);
    }
};

module.exports = (router) => {
    router.get('/v2/pro/fantasy/stats', getStats);
    router.get('/v2/pro/fantasy/form', getForm);
    router.get('/v2/pro/fantasy/lineups', getLineups);
    router.get('/v2/pro/fantasy/fan/:userId/detail', getFanDetail);
    router.get('/v2/pro/fantasy/fan/:userId', getFan);
    router.get('/v2/pro/fantasy/season', getSeason);
};
