const fans = require('../fantasyFans'); // por el módulo: cachedDay usa fantasy.fantasyDay, que las pruebas sustituyen
const { effectiveEntry, dayResult, dayStarted, hasPlay, lockTime, round1 } = require('../fantasyScore');
const { cached } = require('../../utils/cache');
const accounts = require('./accounts');
const { leagueOf, todayOf, shiftDay, scheduleBetween, gameLinesOrNull, pool, gameState } = require('./games');

// Fantasy PRO del día: lo de todos los fanáticos (% por pelotero, capitán y pronóstico, y la distribución de puntos),
// la forma de cada pelotero (puntos de sus últimos 5 juegos) y las alineaciones (chip «Titular»).

const DAY_ROWS = 5000;
const FORM_GAMES = 5;
// Días hacia atrás para la forma: alcanza para 5 juegos de casi todos (los abridores salen cada 5 o 6 días)
const FORM_DAYS = 30;
const FORM_BUDGET_MS = 15000;
// Para la alineación esperada: el último juego de cada equipo en los 10 días anteriores (como el fantasy del día)
const LINEUP_DAYS = 10;

const pctOf = (count, total) => (total ? Math.round((count / total) * 1000) / 10 : 0);

const median = (sorted) => {
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return round1(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
};

// ---------------------------------------------------------------- lo de todos (GET /v2/pro/fantasy/stats)

/**
 * % de fanáticos por pelotero, capitán y pronóstico, solo de los juegos ya cerrados (lo de un juego abierto no sale ni
 * en %), y los puntos del día de cada fanático (sin nombres) para el histograma y el puesto. Con el equipo que cuenta
 * (effectiveEntry): lo cambiado después de empezar cada juego no suma.
 */
const computeStats = async (league, date, now = Date.now()) => {
    const [day, rows] = await Promise.all([fans.cachedDay(league, date), accounts.entries({ league, from: date, to: date, max: DAY_ROWS })]);
    const locks = new Map(day.games.map((game) => [game.gamePk, lockTime(game)]));
    const locked = new Set([...locks].filter(([, at]) => at <= now).map(([gamePk]) => gamePk));
    const gameOf = new Map(day.players.map((player) => [player.id, player.gamePk]));

    const players = new Map();
    const picks = new Map(day.games.map((game) => [game.gamePk, new Map()]));
    const scores = [];
    let counted = 0;
    let withTeam = 0;
    for (const { entry } of rows.entries.filter((item) => item.date === date)) {
        const used = effectiveEntry(day, entry);
        if (!hasPlay(used)) continue;
        counted += 1;
        if (used.lineup.length) withTeam += 1;
        for (const id of used.lineup) {
            if (!locked.has(gameOf.get(id))) continue;
            const count = players.get(id) || { count: 0, captain: 0 };
            count.count += 1;
            if (used.captain === id) count.captain += 1;
            players.set(id, count);
        }
        for (const [gamePk, teamId] of Object.entries(used.picks)) {
            const counts = picks.get(Number(gamePk));
            if (!counts || !locked.has(Number(gamePk)) || !Number(teamId)) continue;
            counts.set(Number(teamId), (counts.get(Number(teamId)) || 0) + 1);
        }
        if (dayStarted(day)) scores.push(dayResult(day, entry).total);
    }
    scores.sort((a, b) => b - a);

    const playerStats = Object.fromEntries(
        [...players].map(([id, count]) => [id, { count: count.count, pct: pctOf(count.count, withTeam), captain: count.captain, captainPct: pctOf(count.captain, withTeam) }])
    );
    const top = [...players].filter(([, count]) => count.captain > 0).sort((a, b) => b[1].captain - a[1].captain || a[0] - b[0])[0];
    const upcoming = [...locks.values()].filter((at) => Number.isFinite(at) && at > now);
    return {
        league,
        date,
        fans: counted,
        games: day.games.map((game) => {
            if (!locked.has(game.gamePk)) return { gamePk: game.gamePk, locked: false, picks: null, picksMade: null };
            const counts = picks.get(game.gamePk);
            const made = [...counts.values()].reduce((sum, value) => sum + value, 0);
            return { gamePk: game.gamePk, locked: true, picks: Object.fromEntries([...counts].map(([teamId, count]) => [teamId, { count, pct: pctOf(count, made) }])), picksMade: made };
        }),
        players: playerStats,
        topCaptain: top ? { id: top[0], count: top[1].captain, pct: pctOf(top[1].captain, withTeam) } : null,
        scores,
        average: scores.length ? round1(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
        median: median([...scores].reverse()),
        max: scores.length ? scores[0] : null,
        nextLockAt: upcoming.length ? Math.min(...upcoming) : null,
        final: day.games.every((game) => game.state === 'final'),
        partial: rows.cut || !!day.incomplete,
        updatedAt: new Date(now).toISOString()
    };
};

/**
 * Segundos de caché: hasta el próximo cierre (ahí aparecen sus %), como mucho un minuto; un día terminado una hora
 * (uno viejo, un día) y a medias 15 s.
 */
const statsTtl = (data, now = Date.now()) => {
    if (data.partial) return 15;
    if (data.final) return data.date < shiftDay(todayOf(data.league), -1) ? 86400 : 3600;
    const untilLock = data.nextLockAt ? Math.ceil((data.nextLockAt - now) / 1000) + 1 : Infinity;
    return Math.max(5, Math.min(60, untilLock));
};

const dayStats = (league, date) => cached(`pro_fantasy_stats_${league}_${date}`, (data) => statsTtl(data), () => computeStats(league, date), { staleSec: 120 });

// ---------------------------------------------------------------- forma (GET /v2/pro/fantasy/form)

/**
 * Puntos de fantasy de los últimos 5 juegos de cada pelotero del día (antes de `date`), del más reciente al más viejo.
 * Sale de los box scores de los juegos terminados de los 30 días anteriores (cada uno calculado una vez al día).
 */
const computeForm = async (league, date, { deadline = Date.now() + FORM_BUDGET_MS } = {}) => {
    const [day, games] = await Promise.all([fans.cachedDay(league, date).catch(() => null), scheduleBetween(league, shiftDay(date, -FORM_DAYS), shiftDay(date, -1))]);
    const wanted = day ? new Set(day.players.map((player) => player.id)) : null;
    const finals = games
        .filter((game) => game.officialDate < date && gameState(game.status) === 'final')
        .sort((a, b) => String(b.gameDate).localeCompare(String(a.gameDate)) || b.gamePk - a.gamePk);
    let failed = 0;
    const { results, skipped } = await pool(
        finals,
        6,
        async (game) => {
            const lines = await gameLinesOrNull(game.gamePk, 'final');
            if (!lines) failed += 1;
            return lines;
        },
        deadline
    );
    const players = {};
    finals.forEach((game, index) => {
        for (const player of results[index]?.players || []) {
            if (wanted && !wanted.has(player.id)) continue;
            const list = (players[player.id] ||= []);
            if (list.length < FORM_GAMES) list.push({ date: game.officialDate, gamePk: game.gamePk, pts: player.points });
        }
    });
    return { league, date, players, partial: failed > 0 || skipped > 0 || !day };
};

const dayForm = (league, date) =>
    cached(`pro_fantasy_form_${league}_${date}`, (data) => (data.partial ? 30 : date >= todayOf(league) ? 1800 : 6 * 3600), () => computeForm(league, date), { staleSec: 3600 });

// ---------------------------------------------------------------- alineaciones (GET /v2/pro/fantasy/lineups)

/**
 * Titulares de cada juego del día. En vivo o terminado, los que abrieron según el box score (`official`). Por empezar:
 * la alineación publicada si MLB ya la tiene (el box score trae el orden) o, si no, la esperada (`expected`): la que
 * abrió el último juego de ese equipo, la misma que usa el fantasy para «probable titular» (en LIDOM no se anuncian
 * antes del juego). Sin nada de eso, null.
 */
const computeLineups = async (league, date) => {
    const games = await scheduleBetween(league, shiftDay(date, -LINEUP_DAYS), date);
    const todays = games.filter((game) => game.officialDate === date).sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)) || a.gamePk - b.gamePk);
    const lastOf = (teamId) =>
        games
            .filter((game) => game.officialDate < date && gameState(game.status) === 'final' && [game.teams?.away?.team?.id, game.teams?.home?.team?.id].includes(teamId))
            .sort((a, b) => String(b.gameDate).localeCompare(String(a.gameDate)))[0];
    let missing = 0;
    const list = await Promise.all(
        todays.map(async (game) => {
            const state = gameState(game.status);
            const lines = await gameLinesOrNull(game.gamePk, state);
            if (!lines && state !== 'preview') missing += 1;
            const out = { gamePk: game.gamePk, state, away: null, home: null, source: { away: null, home: null } };
            for (const side of ['away', 'home']) {
                const official = lines?.lineups?.[side];
                if (official?.length) {
                    out[side] = official;
                    out.source[side] = 'official';
                    continue;
                }
                if (state !== 'preview') continue;
                const teamId = game.teams?.[side]?.team?.id;
                const last = teamId ? lastOf(teamId) : null;
                if (!last) continue;
                const previous = await gameLinesOrNull(last.gamePk, 'final');
                if (!previous) {
                    missing += 1;
                    continue;
                }
                const lastSide = previous.teams.away === teamId ? 'away' : previous.teams.home === teamId ? 'home' : null;
                const expected = lastSide ? previous.lineups[lastSide] : null;
                if (expected?.length) {
                    out[side] = expected;
                    out.source[side] = 'expected';
                }
            }
            return out;
        })
    );
    return {
        league,
        date,
        games: list,
        posted: list.filter((game) => game.source.away === 'official' || game.source.home === 'official').length,
        expected: list.filter((game) => game.source.away === 'expected' || game.source.home === 'expected').length,
        partial: missing > 0,
        updatedAt: new Date().toISOString()
    };
};

/** En la previa se relee cada minuto por si publican la alineación; con todo en vivo 2 min y terminado una hora (viejo, un día) */
const lineupsTtl = (data) => {
    if (data.partial) return 30;
    if (data.games.some((game) => game.state === 'preview')) return 60;
    if (data.games.some((game) => game.state === 'live')) return 120;
    return data.date < shiftDay(todayOf(data.league), -1) ? 86400 : 3600;
};

const dayLineups = (league, date) => cached(`pro_fantasy_lineups_${league}_${date}`, lineupsTtl, () => computeLineups(league, date), { staleSec: 600 });

module.exports = { computeStats, statsTtl, dayStats, computeForm, dayForm, computeLineups, lineupsTtl, dayLineups, leagueOf };
