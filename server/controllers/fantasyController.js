const { LEAGUES } = require('../config/constants');
const fans = require('../services/fantasyFans');

const leagueFrom = (req) => (LEAGUES[req.query.league] ? req.query.league : 'lidom');

const cacheFor = (res, seconds) => res.set('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`);

// Día del fantasy: puntos en vivo mientras haya juegos; un día terminado casi no cambia.
// Sin `date` es hoy en la hora de la liga, con la misma llave de caché que usan el perfil y la tabla de la temporada.
const getFantasyDay = async (req, res, next) => {
    try {
        const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : undefined;
        if (req.query.date && !date) return res.status(400).json({ error: 'invalid_date' });
        const league = leagueFrom(req);
        const day = date || fans.todayIn(LEAGUES[league].timeZone);
        const data = await fans.cachedDay(league, day);
        // Un día viejo ya terminado puede quedarse en el CDN (hasta un día: cada despliegue lo limpia igual)
        cacheFor(res, Math.min(fans.dayTtlOn(league, day, data), 86400));
        res.json(data);
    } catch (error) {
        next(error);
    }
};

// Supabase sin configurar (503) o caído (502): no se guarda en el CDN
const accountsFailure = (res, error) => {
    if (!(error instanceof fans.AccountsError)) return false;
    if (error.code !== 'accounts_disabled') console.warn(`[fantasy] ${error.message}`);
    res.set('Cache-Control', 'no-store')
        .status(error.code === 'accounts_disabled' ? 503 : 502)
        .json({ error: error.code });
    return true;
};

// Perfil de un fanático: sus días y su temporada
const getFantasyFan = async (req, res, next) => {
    try {
        if (!fans.isUuid(req.params.userId)) return res.set('Cache-Control', 'no-store').status(400).json({ error: 'invalid_user' });
        if (!fans.accountsEnabled()) return res.set('Cache-Control', 'no-store').status(503).json({ error: 'accounts_disabled' });
        const { data, live, partial } = await fans.fanSummary(leagueFrom(req), req.params.userId.toLowerCase());
        cacheFor(res, partial ? 15 : live ? 60 : 300);
        res.json(data);
    } catch (error) {
        if (!accountsFailure(res, error)) next(error);
    }
};

// Tabla de la temporada; con ?users=<uuid,…> (máx. 100) solo esas cuentas, aunque no entren en el top 200
const getFantasySeason = async (req, res, next) => {
    try {
        let users = null;
        if (req.query.users !== undefined) {
            users = [...new Set(String(req.query.users).split(',').map((id) => id.trim().toLowerCase()).filter(Boolean))];
            if (!users.length || users.length > fans.MAX_USERS || !users.every(fans.isUuid)) return res.set('Cache-Control', 'no-store').status(400).json({ error: 'invalid_user' });
        }
        if (!fans.accountsEnabled()) return res.set('Cache-Control', 'no-store').status(503).json({ error: 'accounts_disabled' });
        const data = await fans.seasonRanking(leagueFrom(req), { users });
        cacheFor(res, data.partial ? 30 : 300);
        res.json(data);
    } catch (error) {
        if (!accountsFailure(res, error)) next(error);
    }
};

// % de elección del día (solo de los juegos que ya empezaron)
const getFantasyOwners = async (req, res, next) => {
    try {
        const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : undefined;
        if (req.query.date && !date) return res.set('Cache-Control', 'no-store').status(400).json({ error: 'invalid_date' });
        if (!fans.accountsEnabled()) return res.set('Cache-Control', 'no-store').status(503).json({ error: 'accounts_disabled' });
        const league = leagueFrom(req);
        const data = await fans.dayOwners(league, date || fans.todayIn(LEAGUES[league].timeZone));
        cacheFor(res, 60);
        res.json(data);
    } catch (error) {
        if (!accountsFailure(res, error)) next(error);
    }
};

module.exports = { getFantasyDay, getFantasyFan, getFantasySeason, getFantasyOwners };
