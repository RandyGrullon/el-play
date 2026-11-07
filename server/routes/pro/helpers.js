// Ayudas compartidas de las rutas PRO (no registra rutas: lo requieren los demás archivos de esta carpeta)
const { LEAGUES, isLeague } = require('../../config/constants');
const { realDay, todayOf } = require('../../services/pro/games');
const accounts = require('../../services/pro/accounts');

const leagueFrom = (req) => (isLeague(req.query.league) ? req.query.league : 'lidom');
const seasonFrom = (req) => (typeof req.query.season === 'string' && /^\d{4}$/.test(req.query.season) ? Number(req.query.season) : undefined);

/** Mismo Cache-Control que el resto de la API: el CDN comparte la respuesta y la sigue sirviendo mientras se renueva */
const setCache = (res, seconds) => res.set('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`);
const noStore = (res) => res.set('Cache-Control', 'no-store');

/** ?date= válido o, sin él, hoy en la hora de la liga; null si la fecha no existe (responder 400) */
const dayFrom = (req, league) => {
    if (req.query.date === undefined) return todayOf(league);
    return realDay(req.query.date) ? req.query.date : null;
};

/** Supabase sin configurar (503) o caído (502): no se guarda en el CDN. true si ya respondió. */
const accountsFailure = (res, error) => {
    if (!(error instanceof accounts.AccountsError)) return false;
    if (error.code !== 'accounts_disabled') console.warn(`[pro] ${error.message}`);
    noStore(res)
        .status(error.code === 'accounts_disabled' ? 503 : 502)
        .json({ error: error.code });
    return true;
};

/** Sin cuentas no hay equipos de nadie: 503 como las rutas del Lite. true si ya respondió. */
const requireAccounts = (res) => {
    if (accounts.enabled()) return false;
    noStore(res).status(503).json({ error: 'accounts_disabled' });
    return true;
};

module.exports = { LEAGUES, leagueFrom, seasonFrom, setCache, noStore, dayFrom, accountsFailure, requireAccounts };
