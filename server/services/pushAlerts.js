const env = require('../utils/env');
const { LEAGUES } = require('../config/constants');
const { sendPush } = require('./webPush');

// Avisos con la app cerrada (Web Push). Las suscripciones viven en Supabase (supabase/2026-10-23-avisos-push.sql):
// se guardan con push_save y se leen solo con el secreto (push_targets), así nadie más ve a quién se le avisa.
// Supabase llama cada minuto a /api/v2/push/run (pg_cron + pg_net); aquí se mira el calendario y se avisa:
// 10 minutos antes, al cantar playball, el resultado final y un juego sin hit desde la 6.ª.

const KINDS = ['soon', 'start', 'final', 'noHitter'];
const MAX_GAMES = 40;
const MAX_TEAMS = 6;

const vapidConfig = () => {
    const publicKey = env.env('VAPID_PUBLIC_KEY');
    const privateKey = env.env('VAPID_PRIVATE_KEY');
    const subject = env.env('VAPID_SUBJECT') || 'mailto:avisos@grullonb.com';
    return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
};

/** Listo para avisar con la app cerrada: llaves VAPID, Supabase y el secreto del cron */
const pushEnabled = () => !!vapidConfig() && !!env.supabaseConfig() && !!env.env('PUSH_SECRET');

const rpc = async (fn, args) => {
    const config = env.supabaseConfig();
    if (!config) throw Object.assign(new Error('accounts_disabled'), { status: 503 });
    const response = await fetch(`${config.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: config.key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw Object.assign(new Error(`Supabase ${fn}: ${response.status}`), { status: 502 });
    const text = await response.text();
    return text ? JSON.parse(text) : null;
};

// ---------------------------------------------------------------- guardar y borrar suscripciones

const PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|notify\.windows\.com|push\.apple\.com)\//i;
const ints = (list, max) => (Array.isArray(list) ? [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 1e8))].slice(-max) : []);

/** Valida lo que manda la app; null si no sirve */
const cleanSubscription = (body = {}) => {
    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const auth = body.subscription?.keys?.auth;
    if (typeof endpoint !== 'string' || endpoint.length > 1000 || !PUSH_HOSTS.test(endpoint)) return null;
    if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || typeof auth !== 'string' || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return null;
    const kinds = Object.fromEntries(KINDS.map((kind) => [kind, body.kinds?.[kind] !== false]));
    return { endpoint, p256dh, auth, games: ints(body.games, MAX_GAMES), teams: ints(body.teams, MAX_TEAMS), kinds, lang: body.lang === 'en' ? 'en' : 'es' };
};

const saveSubscription = (sub) =>
    rpc('push_save', { sub_endpoint: sub.endpoint, sub_p256dh: sub.p256dh, sub_auth: sub.auth, sub_games: sub.games, sub_teams: sub.teams, sub_kinds: sub.kinds, sub_lang: sub.lang });

const deleteSubscription = (endpoint) => rpc('push_delete', { sub_endpoint: endpoint });

// ---------------------------------------------------------------- qué avisar

const TEXTS = {
    es: {
        soon: (g) => [`${g.away.abbrev} vs ${g.home.abbrev} empieza en 10 minutos`, `${g.away.name} en ${g.home.name}`],
        start: (g) => ['¡Playball!', `Empezó ${g.away.name} vs ${g.home.name}`],
        final: (g) => [`Final: ${g.away.abbrev} ${g.away.score} - ${g.home.score} ${g.home.abbrev}`, `Ganó ${(g.away.isWinner ? g.away : g.home).name}`],
        noHitter: (g, pitching, batting) => [`¡${pitching.abbrev} lanza sin hit!`, `${batting.name} no ha conectado hit en ${g.live?.inning ?? ''} entradas`]
    },
    en: {
        soon: (g) => [`${g.away.abbrev} vs ${g.home.abbrev} starts in 10 minutes`, `${g.away.name} at ${g.home.name}`],
        start: (g) => ['Play ball!', `${g.away.name} vs ${g.home.name} just started`],
        final: (g) => [`Final: ${g.away.abbrev} ${g.away.score} - ${g.home.score} ${g.home.abbrev}`, `${(g.away.isWinner ? g.away : g.home).name} won`],
        noHitter: (g, pitching, batting) => [`${pitching.abbrev} is throwing a no-hitter!`, `${batting.name} has no hits through ${g.live?.inning ?? ''} innings`]
    }
};

/**
 * Lo que toca avisar ahora en un calendario (sin repetir: cada aviso tiene su llave y Supabase la reclama una vez).
 * `start` solo en la 1.ª (si el servidor empieza tarde no se avisa un «playball» en la 5.ª); `final` solo de juegos
 * que empezaron hace menos de 6 horas.
 */
const eventsOf = (games, now = Date.now()) => {
    const events = [];
    for (const game of games) {
        const startsIn = Date.parse(game.date) - now;
        if (game.state === 'preview' && !game.startTimeTBD && startsIn > 0 && startsIn <= 10 * 60000 && !/postponed|cancel/i.test(game.detailedState)) events.push({ kind: 'soon', game });
        if (game.state === 'live' && (game.live?.inning ?? 1) <= 1 && (game.inningsPlayed ?? 1) <= 1) events.push({ kind: 'start', game });
        if (game.state === 'final' && now - Date.parse(game.date) < 6 * 3600000 && (game.away.isWinner || game.home.isWinner)) events.push({ kind: 'final', game });
        if (game.state === 'live' && (game.live?.inning ?? 0) >= 6) {
            for (const [batting, pitching] of [
                [game.away, game.home],
                [game.home, game.away]
            ]) {
                if (batting.hits === 0) events.push({ kind: 'noHitter', game, pitching, batting });
            }
        }
    }
    return events.map((event) => ({ ...event, key: `el-play-notified-${event.kind === 'soon' ? 'pre' : event.kind}-${event.game.gamePk}${event.batting ? `-${event.batting.id}` : ''}` }));
};

/** A quién le toca: el juego con campana, o (para playball, final y sin hit) un juego de su equipo favorito */
const wants = (sub, event) => {
    if (sub.kinds?.[event.kind] === false) return false;
    const pk = event.game.gamePk;
    if ((sub.games || []).includes(pk)) return true;
    if (event.kind === 'soon') return false;
    const teams = sub.teams || [];
    return teams.includes(event.game.away.id) || teams.includes(event.game.home.id);
};

/** Una pasada (la llama el cron cada minuto) */
const runPush = async ({ fetchSchedule, now = Date.now(), secret = env.env('PUSH_SECRET') } = {}) => {
    if (!pushEnabled()) return { skipped: 'not_configured' };
    const vapid = vapidConfig();
    const schedules = await Promise.all(Object.keys(LEAGUES).map((league) => fetchSchedule(league).catch(() => null)));
    const events = eventsOf(schedules.filter(Boolean).flatMap((schedule) => schedule.games), now);
    if (!events.length) return { events: 0, sent: 0 };
    const subs = (await rpc('push_targets', { run_secret: secret })) || [];
    let sent = 0;
    let removed = 0;
    for (const event of events) {
        const targets = subs.filter((sub) => wants(sub, event));
        if (!targets.length) continue;
        // Una sola vez por aviso aunque dos instancias corran a la vez
        if (!(await rpc('push_claim', { run_secret: secret, event_key: event.key }))) continue;
        await Promise.all(
            targets.map(async (sub) => {
                const [title, body] = TEXTS[sub.lang === 'en' ? 'en' : 'es'][event.kind](event.game, event.pitching, event.batting);
                const message = { title, body, tag: event.key, url: `/juego/${event.game.gamePk}` };
                const status = await sendPush(sub, message, vapid, { topic: `g${event.game.gamePk}${event.kind}`, ttl: event.kind === 'final' ? 3600 : 600 }).catch(() => 0);
                if (status === 201 || status === 200) sent += 1;
                if (status === 404 || status === 410) {
                    removed += 1;
                    await rpc('push_forget', { run_secret: secret, sub_endpoint: sub.endpoint }).catch(() => null);
                }
            })
        );
    }
    return { events: events.length, sent, removed };
};

module.exports = { pushEnabled, vapidConfig, cleanSubscription, saveSubscription, deleteSubscription, eventsOf, wants, runPush, KINDS };
