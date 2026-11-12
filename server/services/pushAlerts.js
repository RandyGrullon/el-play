const env = require('../utils/env');
const { LEAGUES } = require('../config/constants');
const { sendPush } = require('./webPush');

// Avisos con la app cerrada (Web Push). Las suscripciones viven en Supabase (supabase/2026-10-23-avisos-push.sql):
// se guardan con push_save y se leen solo con el secreto (push_targets), así nadie más ve a quién se le avisa.
// Supabase llama cada minuto a /api/v2/push/run (pg_cron + pg_net); aquí se mira el calendario y se avisa:
// 10 minutos antes, al cantar playball, el resultado final y un juego sin hit desde la 6.ª; y, de los juegos en vivo que
// alguien sigue, jugada a jugada: jonrones, cambio de ventaja, carreras y hits (uno por jugada, el más importante).

// Jugada a jugada (con el detalle del juego): carreras, cambio de ventaja, jonrones y hits
const PLAY_KINDS = ['runs', 'lead', 'hr', 'hits'];
const KINDS = ['soon', 'start', 'final', 'noHitter', ...PLAY_KINDS];
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

// ---------------------------------------------------------------- jugada a jugada

/** Hasta cuánto después de terminar una jugada se avisa (el cron pasa cada minuto y la liga tarda en publicarla) */
const PLAY_WINDOW_MS = 5 * 60000;

const HITS = { single: true, double: true, triple: true, home_run: true };
const PLAY_NAMES = {
    single: 'Sencillo',
    double: 'Doble',
    triple: 'Triple',
    home_run: 'Jonrón',
    walk: 'Base por bolas',
    intent_walk: 'Base intencional',
    hit_by_pitch: 'Golpeado',
    sac_fly: 'Elevado de sacrificio',
    sac_bunt: 'Toque de sacrificio',
    field_error: 'Error',
    catcher_interf: 'Interferencia',
    fielders_choice: 'Selección',
    fielders_choice_out: 'Selección',
    force_out: 'Out forzado',
    grounded_into_double_play: 'Doble play',
    double_play: 'Doble play',
    field_out: 'Out',
    strikeout: 'Ponche'
};

const ordinalEn = (n) => {
    const v = n % 100;
    return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
};
const halfName = (lang, top, inning) => (lang === 'en' ? `${top ? 'Top' : 'Bottom'} ${ordinalEn(inning)}` : `${top ? 'Alta' : 'Baja'} de la ${inning}.ª`);

/**
 * Lo que pasó en cada jugada reciente de un juego en vivo: carreras que entraron, si cambió quién va ganando (se va
 * arriba, le da la vuelta o empata) y si fue hit o jonrón. Solo jugadas terminadas hace menos de PLAY_WINDOW_MS: al
 * encender el cron a mitad de juego no se avisa lo viejo. Cada una con su llave para avisarla una sola vez.
 */
const playEventsOf = (game, now = Date.now()) => {
    const events = [];
    let before = { away: 0, home: 0 };
    for (const atBat of game.atBats || []) {
        if (!atBat.complete) continue;
        const after = { away: atBat.away ?? before.away, home: atBat.home ?? before.home };
        const end = atBat.end ? Date.parse(atBat.end) : NaN;
        if (Number.isFinite(end) && now - end <= PLAY_WINDOW_MS && end - now <= 60000) {
            const side = atBat.top ? 'away' : 'home';
            const other = atBat.top ? 'home' : 'away';
            const runs = Math.max(0, after[side] - before[side]);
            const was = before[side] - before[other];
            const is = after[side] - after[other];
            const lead = runs > 0 ? (is === 0 && was < 0 ? 'tie' : is > 0 && was < 0 ? 'comeback' : is > 0 && was === 0 ? 'ahead' : null) : null;
            const hit = !!HITS[atBat.event];
            if (runs > 0 || hit) events.push({ kind: 'play', game, atBat, runs, lead, hit, hr: atBat.event === 'home_run', score: after, key: `el-play-notified-play-${game.gamePk}-${atBat.i}` });
        }
        before = after;
    }
    return events;
};

const PLAY_TEXTS = {
    es: {
        hr: (batter, score) => `¡Jonrón de ${batter}! ${score}`,
        ahead: (team, score) => `¡${team} se va arriba! ${score}`,
        comeback: (team, score) => `¡${team} le da la vuelta! ${score}`,
        tie: (_team, score) => `¡Empate! ${score}`,
        runs: (team, score) => `¡Anota ${team}! ${score}`,
        hit: (play, batter) => `${play} de ${batter}`
    },
    en: {
        hr: (batter, score) => `${batter} homers! ${score}`,
        ahead: (team, score) => `${team} takes the lead! ${score}`,
        comeback: (team, score) => `${team} comes back! ${score}`,
        tie: (_team, score) => `Tie game! ${score}`,
        runs: (team, score) => `${team} scores! ${score}`,
        hit: (play, batter) => `${play} by ${batter}`
    }
};

/**
 * El aviso de una jugada para una suscripción: el más importante de los que tiene encendidos (jonrón > cambio de
 * ventaja > carreras > hit). null si no le toca ninguno.
 */
const playMessage = (sub, event) => {
    const on = (kind) => sub.kinds?.[kind] !== false;
    const lang = sub.lang === 'en' ? 'en' : 'es';
    const texts = PLAY_TEXTS[lang];
    const { game, atBat } = event;
    const team = atBat.top ? game.away : game.home;
    const teamName = team.name || team.teamName;
    const score = `${game.away.abbrev} ${event.score.away} - ${event.score.home} ${game.home.abbrev}`;
    const batter = atBat.batter?.name || teamName;
    const play = (lang === 'es' ? PLAY_NAMES[atBat.event] : null) || atBat.eventLabel || '';
    const half = halfName(lang, atBat.top, atBat.inning);
    const detail = play ? `${batter}: ${play} · ${half}` : half;
    if (event.hr && on('hr')) return { kind: 'hr', title: texts.hr(batter, score), body: event.lead && on('lead') ? `${texts[event.lead](teamName, '').trim()} · ${half}` : half };
    if (event.lead && on('lead')) return { kind: 'lead', title: texts[event.lead](teamName, score), body: detail };
    if (event.runs > 0 && on('runs')) return { kind: 'runs', title: texts.runs(teamName, score), body: detail };
    if (event.hit && on('hits')) return { kind: 'hits', title: texts.hit(play || 'Hit', batter), body: `${score} · ${half}` };
    return null;
};

/** Los juegos en vivo que alguien sigue con algún aviso de jugada encendido */
const followedLive = (games, subs) =>
    games.filter((game) => game.state === 'live' && subs.some((sub) => PLAY_KINDS.some((kind) => sub.kinds?.[kind] !== false) && wants({ ...sub, kinds: {} }, { kind: 'play', game })));

/** Una pasada (la llama el cron cada minuto) */
const runPush = async ({ fetchSchedule, fetchGame, now = Date.now(), secret = env.env('PUSH_SECRET') } = {}) => {
    if (!pushEnabled()) return { skipped: 'not_configured' };
    const vapid = vapidConfig();
    const schedules = await Promise.all(Object.keys(LEAGUES).map((league) => fetchSchedule(league).catch(() => null)));
    // Un juego que salga en dos calendarios (Serie del Caribe y LIDOM, por ejemplo) se mira una sola vez
    const games = [...new Map(schedules.filter(Boolean).flatMap((schedule) => schedule.games).map((game) => [game.gamePk, game])).values()];
    const events = eventsOf(games, now);
    // Con juegos en vivo se mira además jugada a jugada (solo los que alguien sigue)
    const live = !!fetchGame && games.some((game) => game.state === 'live');
    if (!events.length && !live) return { events: 0, sent: 0 };
    const subs = (await rpc('push_targets', { run_secret: secret })) || [];
    let sent = 0;
    let removed = 0;
    const deliver = async (sub, message, options) => {
        const status = await sendPush(sub, message, vapid, options).catch(() => 0);
        if (status === 201 || status === 200) sent += 1;
        if (status === 404 || status === 410) {
            removed += 1;
            await rpc('push_forget', { run_secret: secret, sub_endpoint: sub.endpoint }).catch(() => null);
        }
    };
    // Una sola vez por aviso aunque dos instancias corran a la vez
    const claim = (key) => rpc('push_claim', { run_secret: secret, event_key: key });

    for (const event of events) {
        const targets = subs.filter((sub) => wants(sub, event));
        if (!targets.length || !(await claim(event.key))) continue;
        await Promise.all(
            targets.map((sub) => {
                const [title, body] = TEXTS[sub.lang === 'en' ? 'en' : 'es'][event.kind](event.game, event.pitching, event.batting);
                return deliver(sub, { title, body, tag: event.key, url: `/juego/${event.game.gamePk}` }, { topic: `g${event.game.gamePk}${event.kind}`, ttl: event.kind === 'final' ? 3600 : 600 });
            })
        );
    }

    let plays = [];
    if (live) {
        const details = await Promise.all(followedLive(games, subs).map((game) => fetchGame(game.gamePk).catch(() => null)));
        plays = details.filter(Boolean).flatMap((detail) => playEventsOf(detail, now));
    }
    for (const event of plays) {
        // A cada quien el aviso más importante de los que tiene encendidos (o ninguno)
        const messages = subs.filter((sub) => wants({ ...sub, kinds: {} }, event)).map((sub) => [sub, playMessage(sub, event)]).filter(([, message]) => message);
        if (!messages.length || !(await claim(event.key))) continue;
        const pk = event.game.gamePk;
        // Si el teléfono estaba sin señal, al volver solo le llega la última jugada del juego (Topic) y nada de hace más de 5 min
        await Promise.all(messages.map(([sub, message]) => deliver(sub, { title: message.title, body: message.body, tag: event.key, url: `/juego/${pk}` }, { topic: `g${pk}play`, ttl: 300 })));
    }
    return { events: events.length, plays: plays.length, sent, removed };
};

module.exports = { pushEnabled, vapidConfig, cleanSubscription, saveSubscription, deleteSubscription, eventsOf, playEventsOf, playMessage, wants, runPush, KINDS, PLAY_KINDS };
