// Puntos del fantasy en el servidor, con la misma aritmética de la app (src/lib/fantasy.ts): si cambia allá, cambia aquí.
// Sirven para el perfil de cada fanático y la tabla de la temporada.

const RULES = { batters: 5, pitchers: 1, perTeam: 2, captain: 1.5, pick: 10 };

const round1 = (value) => Math.round(value * 10) / 10;

/** Equipo guardado en Supabase (fila de fantasy_entries) con la forma que usa la app; `history` lo escribe la base */
const toEntry = (row = {}) => ({
    lineup: Array.isArray(row.lineup) ? row.lineup : [],
    captain: row.captain ?? null,
    picks: row.picks && typeof row.picks === 'object' ? row.picks : {},
    ...(row.history && typeof row.history === 'object' ? { history: row.history } : {})
});

// ---------------------------------------------------------------- sin trampas
// La base anota con su hora cuándo entró y salió cada pelotero y cuándo cambiaron el capitán y cada pronóstico
// (supabase/2026-10-17-antitrampa.sql). Cada juego se puntúa con lo que había cuando empezó: lo de después no cuenta.

/**
 * Hora (ms) en que se cierra un juego: la programada (o el primer lanzamiento si fue antes). Con la hora por definir,
 * el primer lanzamiento; si ya empezó y MLB no lo dio, la hora que traiga. Si no ha empezado, sigue abierto.
 */
const lockTime = (game) => {
    const first = Date.parse(game.firstPitch ?? '');
    const scheduled = game.startTimeTBD ? NaN : Date.parse(game.date ?? '');
    const times = [first, scheduled].filter(Number.isFinite);
    if (times.length) return Math.min(...times);
    const placeholder = Date.parse(game.date ?? '');
    return game.state !== 'preview' && Number.isFinite(placeholder) ? placeholder : Infinity;
};

/** Valor vigente justo antes de `at` en una lista de cambios [[valor, cuándo], ...] (undefined si no había) */
const valueAt = (changes, at) => {
    let value;
    for (const change of Array.isArray(changes) ? changes : []) {
        if (Array.isArray(change) && Number(change[1]) < at) value = change[0];
    }
    return value;
};

/** Tramo en el que estaba en el equipo cuando se cerró su juego (entró antes y no había salido) */
const spanAt = (spans, at) =>
    (Array.isArray(spans) ? spans : []).find((span) => Array.isArray(span) && Number(span[0]) < at && (span[1] === null || span[1] === undefined || Number(span[1]) >= at));

/**
 * El equipo que cuenta: cada pelotero si estaba cuando empezó su juego, el capitán que había cuando empezó el suyo
 * (el primero que se cerró: cambiarlo después no vale) y cada pronóstico como estaba al empezar su juego.
 * Si alguien se pasa de los cupos (quitó a uno ya cerrado para meter a otro), sobran los que entraron de último.
 * Sin historial (filas de antes del arreglo o del teléfono) el equipo queda como está.
 */
const effectiveEntry = (day, entry) => {
    const history = entry?.history;
    if (!history || typeof history !== 'object' || !history.players || typeof history.players !== 'object') return entry;
    const locks = new Map(day.games.map((game) => [String(game.gamePk), lockTime(game)]));
    const counted = [];
    for (const [key, spans] of Object.entries(history.players)) {
        const player = day.players.find((p) => String(p.id) === key);
        if (!player) continue;
        const lock = locks.get(String(player.gamePk)) ?? Infinity;
        const span = spanAt(spans, lock);
        if (span) counted.push({ player, lock, added: Number(span[0]) });
    }
    counted.sort((a, b) => a.added - b.added || a.player.id - b.player.id);
    const kept = [];
    for (const item of counted) {
        const sameRole = kept.filter((k) => k.player.role === item.player.role).length;
        const sameTeam = kept.filter((k) => k.player.teamId === item.player.teamId).length;
        if (sameRole < (item.player.role === 'P' ? RULES.pitchers : RULES.batters) && sameTeam < RULES.perTeam) kept.push(item);
    }
    const order = (id) => (entry.lineup.includes(id) ? entry.lineup.indexOf(id) : entry.lineup.length);
    const lineup = kept.map((item) => item.player.id).sort((a, b) => order(a) - order(b));
    const captains = kept.filter((item) => valueAt(history.captain, item.lock) === item.player.id).sort((a, b) => a.lock - b.lock);
    const picks = {};
    for (const game of day.games) {
        const pick = valueAt(history.picks?.[game.gamePk], locks.get(String(game.gamePk)));
        if (pick) picks[game.gamePk] = pick;
    }
    return { ...entry, lineup, captain: captains[0]?.player.id ?? null, picks };
};

/** El día tiene equipo o pronósticos (un día vacío no cuenta) */
const hasPlay = (entry) => entry.lineup.length > 0 || Object.keys(entry.picks).length > 0;

const playerScore = (entry, player) => (entry.captain === player.id ? Math.round(player.points * RULES.captain * 10) / 10 : player.points);

const teamPoints = (day, entry) =>
    Math.round(
        entry.lineup.reduce((sum, id) => {
            const player = day.players.find((p) => p.id === id);
            return sum + (player ? playerScore(entry, player) : 0);
        }, 0) * 10
    ) / 10;

const winnerOf = (game) => (game.state !== 'final' ? null : game.away?.isWinner ? game.away.id : game.home?.isWinner ? game.home.id : null);

const pickPoints = (day, entry) =>
    day.games.filter((game) => {
        const pick = entry.picks[game.gamePk];
        const winner = winnerOf(game);
        return !!pick && !!winner && winner === pick;
    }).length * RULES.pick;

/** Al menos un juego del día empezó (antes de eso el día cuenta 0) */
const dayStarted = (day) => day.games.some((game) => game.state !== 'preview');

/** Resultado de un fanático en un día del fantasy (`day` es lo que devuelve fantasyDay), con el equipo que cuenta */
const dayResult = (day, saved) => {
    const entry = effectiveEntry(day, saved);
    const team = teamPoints(day, entry);
    const picks = pickPoints(day, entry);
    return {
        lineup: entry.lineup,
        captain: entry.captain,
        final: day.games.length > 0 && day.games.every((game) => game.state === 'final'),
        live: day.games.some((game) => game.state === 'live'),
        started: dayStarted(day),
        team,
        picks,
        total: round1(team + picks),
        picksMade: Object.values(entry.picks).filter(Boolean).length
    };
};

module.exports = { RULES, round1, toEntry, lockTime, effectiveEntry, hasPlay, playerScore, teamPoints, pickPoints, dayStarted, dayResult };
