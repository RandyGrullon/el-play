const env = require('../../utils/env'); // por el módulo: las pruebas sustituyen env.supabaseConfig
const fans = require('../fantasyFans');
const { toEntry, hasPlay } = require('../fantasyScore');

// Lectura de los equipos guardados (fantasy_entries) y de los perfiles para el fantasy PRO, por la API REST de
// Supabase con la llave publishable, igual que server/services/fantasyFans.js. Con MLB_MOCK=1 los equipos son de
// fanáticos simulados (./mockFans.js) para que las pantallas PRO se vean completas sin cuentas reales.

const PAGE = 1000;
const NAMES_BATCH = 100;

const isMock = () => process.env.MLB_MOCK === '1';

/** Hay de dónde leer los equipos (Supabase configurado o el simulador) */
const enabled = () => isMock() || !!env.supabaseConfig();

const supabaseFetch = async (query, headers = {}) => {
    const config = env.supabaseConfig();
    if (!config) throw new fans.AccountsError('accounts_disabled');
    let response;
    try {
        response = await fetch(`${config.url}/rest/v1/${query}`, { headers: { apikey: config.key, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(8000) });
    } catch (problem) {
        throw new fans.AccountsError('accounts_unavailable', `Supabase: ${problem.message}`);
    }
    // Range más allá de la última fila
    if (response.status === 416) return { rows: [], total: null };
    if (!response.ok) throw new fans.AccountsError('accounts_unavailable', `Supabase ${response.status}`);
    const rows = await response.json().catch(() => null);
    const total = Number((response.headers?.get?.('content-range') || '').split('/')[1]);
    return { rows: Array.isArray(rows) ? rows : [], total: Number.isFinite(total) ? total : null };
};

/** Todas las filas de una consulta, de página en página con Range, hasta `max` (`cut`: quedaron filas fuera) */
const allRows = async (query, max) => {
    const rows = [];
    let total = null;
    while (rows.length < max && (total === null || rows.length < total)) {
        const from = rows.length;
        const page = await supabaseFetch(query, { Range: `${from}-${Math.min(from + PAGE, max) - 1}`, 'Range-Unit': 'items', ...(from === 0 ? { Prefer: 'count=exact' } : {}) });
        if (from === 0) total = page.total;
        if (!page.rows.length) break;
        rows.push(...page.rows);
    }
    return { rows, cut: total !== null ? total > rows.length : rows.length >= max };
};

/**
 * Filas con equipo o pronósticos ({ userId, date, entry }) de la más nueva a la más vieja. Una fila repetida (dos
 * páginas que se pisan si alguien guarda mientras se lee) cuenta una vez.
 */
const cleanRows = (rows) => {
    const seen = new Set();
    return rows
        .map((row) => ({ userId: String(row.user_id || '').toLowerCase(), date: String(row.day || '').slice(0, 10), entry: toEntry(row) }))
        .filter((item) => {
            const key = `${item.userId}:${item.date}`;
            if (!item.userId || !item.date || !hasPlay(item.entry) || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date) || a.userId.localeCompare(b.userId));
};

/**
 * Equipos guardados de una liga. `from`/`to` (AAAA-MM-DD, incluidos), `userId` (uno solo), `limit` (los más
 * recientes) y `max` (tope de filas al leer todo). Devuelve { entries, cut }.
 */
const entries = async ({ league, from, to, userId, limit, max = 10000 }) => {
    if (isMock()) {
        const mock = require('./mockFans');
        const rows = await mock.rows(league, { from, to, userId });
        const list = cleanRows(rows);
        return { entries: limit ? list.slice(0, limit) : list, cut: false };
    }
    const filters = [`league=eq.${encodeURIComponent(league)}`];
    if (userId) filters.push(`user_id=eq.${userId}`);
    if (from) filters.push(`day=gte.${from}`);
    if (to) filters.push(`day=lte.${to}`);
    // select=* trae history (el historial antitrampa) si la base ya tiene la columna, y no falla si todavía no
    const query = `fantasy_entries?${filters.join('&')}&select=*&order=day.desc,user_id.asc`;
    if (limit) {
        const { rows } = await supabaseFetch(`${query}&limit=${limit}`);
        return { entries: cleanRows(rows), cut: false };
    }
    const { rows, cut } = await allRows(query, max);
    return { entries: cleanRows(rows), cut };
};

/** Nombre y fecha de creación de cada perfil (en tandas de 100). Sin la columna created_at, solo el nombre. */
const profiles = async (ids) => {
    const out = new Map();
    const list = [...new Set(ids.filter(Boolean))];
    if (!list.length) return out;
    if (isMock()) {
        const mock = require('./mockFans');
        for (const id of list) out.set(id, mock.profile(id));
        return out;
    }
    let withCreated = true;
    for (let i = 0; i < list.length; i += NAMES_BATCH) {
        const chunk = list.slice(i, i + NAMES_BATCH).join(',');
        let rows;
        try {
            rows = await supabaseFetch(`profiles?id=in.(${chunk})&select=id,display_name${withCreated ? ',created_at' : ''}`).then((page) => page.rows);
        } catch (error) {
            if (!withCreated || error.code !== 'accounts_unavailable') throw error;
            withCreated = false;
            rows = await supabaseFetch(`profiles?id=in.(${chunk})&select=id,display_name`).then((page) => page.rows);
        }
        for (const row of rows) out.set(String(row.id).toLowerCase(), { name: row.display_name || null, createdAt: row.created_at || null });
    }
    return out;
};

module.exports = { isMock, enabled, entries, profiles, cleanRows, AccountsError: fans.AccountsError };
