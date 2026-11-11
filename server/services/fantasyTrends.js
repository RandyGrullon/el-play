const fans = require('./fantasyFans'); // por el módulo: cachedDay usa fantasy.fantasyDay, que las pruebas sustituyen
const proDay = require('./pro/fantasyDay');
const teamStats = require('./teamStats');
const { shiftDay } = require('./pro/games');
const { lockTime, isPostponedGame, isPostponedPlayer, round1 } = require('./fantasyScore');
const { cached } = require('../utils/cache');

// «Ideas para hoy» del fantasy (GET /v2/fantasy/trends): listas cortas para escoger, solo con peloteros del día cuyo
// juego no se ha cerrado (ni pospuestos, ni los que casi seguro no juegan). Lo de los demás fanáticos sale de ayer, ya
// cerrado: nadie copia a nadie.

const LIMITS = { hot: 8, bargains: 8, risers: 5, fallers: 5, pitchers: 6, popular: 8 };
// En racha: promedio de los últimos 5 con al menos 3 juegos
const HOT_MIN_GAMES = 3;
// Gangas: los de 7 créditos o menos, por lo que se espera de ellos por crédito
const BARGAIN_MAX_PRICE = 7;
// Duelo del lanzador: OPS de la temporada del rival contra el promedio de la liga (±4 % es parejo)
const EDGE = { good: 0.96, tough: 1.04 };
const FACTOR = { min: 0.8, max: 1.25 };
// Los que casi seguro no juegan hoy no son idea para nadie: el abridor que descansa y el que no va en la alineación
const SITTING = new Set(['resting', 'bench', 'dnp', 'postponed']);

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const opsNumber = (text) => {
    const value = Number.parseFloat(String(text ?? ''));
    return Number.isFinite(value) && value > 0 ? value : null;
};

/** OPS de la temporada de cada equipo y el promedio de la liga (mismo caché que GET /v2/team-stats); si MLB falla, nada */
const teamOps = async (league) => {
    try {
        const data = await cached(`team_stats_${league}_actual`, (value) => (value.season === value.currentSeason ? 300 : 6 * 3600), () => teamStats.fetchTeamStats(league), { staleSec: 3600 });
        const teams = new Map();
        for (const team of data?.teams || []) {
            const ops = opsNumber(team.hitting?.ops);
            if (ops !== null && (team.hitting?.pa ?? 1) > 0) teams.set(team.id, { ops, text: team.hitting.ops });
        }
        const values = [...teams.values()].map((team) => team.ops);
        return { teams, average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
    } catch (error) {
        console.warn(`[fantasy] OPS de los equipos ${league}: ${error.message}`);
        return { teams: new Map(), average: null };
    }
};

/** Duelo de un lanzador contra el bateo del rival: lo fácil (OPS bajo) sube su puntaje y lo difícil lo baja */
const matchupOf = (opp, ops) => {
    const team = opp ? ops.teams.get(opp.id) : null;
    if (!team || !ops.average) return { matchup: { oppOps: team?.text ?? null, edge: 'even' }, factor: 1 };
    const ratio = team.ops / ops.average;
    const edge = ratio <= EDGE.good ? 'good' : ratio >= EDGE.tough ? 'tough' : 'even';
    return { matchup: { oppOps: team.text, edge }, factor: Math.min(FACTOR.max, Math.max(FACTOR.min, 1 / ratio)) };
};

/** % de fanáticos que escogieron a cada pelotero ayer (solo juegos cerrados, como GET /v2/pro/fantasy/stats) */
const ownedOn = async (league, date) => {
    try {
        const stats = await proDay.dayStats(league, date);
        return { owned: new Map(Object.entries(stats.players || {}).map(([id, value]) => [Number(id), value.pct])), partial: !!stats.partial };
    } catch (error) {
        // Sin Supabase (o caído) responde la ruta con 503/502; lo demás (MLB) deja la lista vacía
        if (error instanceof fans.AccountsError) throw error;
        console.warn(`[fantasy] elegidos de ayer ${league} ${date}: ${error.message}`);
        return { owned: new Map(), partial: true };
    }
};

const itemOf = (player) => ({
    id: player.id,
    name: player.name,
    teamId: player.teamId,
    role: player.role === 'P' ? 'P' : 'B',
    pos: player.pos || null,
    gamePk: player.gamePk ?? null,
    price: finite(player.price) ? player.price : null,
    proj: finite(player.proj) ? player.proj : null,
    status: player.status || null,
    opp: player.opp || null,
    last5: Array.isArray(player.last5) ? player.last5 : [],
    priceDelta: finite(player.priceDelta) ? player.priceDelta : null,
    ...(player.estimated ? { estimated: true } : {})
});

const byProj = (a, b) => (b.proj ?? 0) - (a.proj ?? 0) || a.id - b.id;

/**
 * Ideas para un día: en racha, gangas, suben y bajan de precio, lanzadores con mejor duelo y los más elegidos ayer.
 * `now` decide qué juegos ya se cerraron.
 */
const computeTrends = async (league, date, now = Date.now()) => {
    const [day, ops, yesterday] = await Promise.all([fans.cachedDay(league, date), teamOps(league), ownedOn(league, shiftDay(date, -1))]);
    const games = new Map(day.games.map((game) => [game.gamePk, game]));
    const open = day.players.filter((player) => {
        const game = games.get(player.gamePk);
        return game && !isPostponedGame(game) && !isPostponedPlayer(player) && !SITTING.has(player.status) && lockTime(game) > now;
    });
    const items = open.map(itemOf);

    const hot = items
        .filter((item) => item.last5.length >= HOT_MIN_GAMES)
        .map((item) => ({ ...item, avg: round1(item.last5.reduce((sum, value) => sum + value, 0) / item.last5.length) }))
        .sort((a, b) => b.avg - a.avg || byProj(a, b))
        .slice(0, LIMITS.hot);
    const bargains = items
        .filter((item) => item.price !== null && item.price > 0 && item.price <= BARGAIN_MAX_PRICE && item.proj !== null && item.proj > 0)
        .map((item) => ({ ...item, value: Math.round((item.proj / item.price) * 100) / 100 }))
        .sort((a, b) => b.value - a.value || byProj(a, b))
        .slice(0, LIMITS.bargains);
    const risers = items
        .filter((item) => item.priceDelta !== null && item.priceDelta > 0)
        .sort((a, b) => b.priceDelta - a.priceDelta || byProj(a, b))
        .slice(0, LIMITS.risers);
    const fallers = items
        .filter((item) => item.priceDelta !== null && item.priceDelta < 0)
        .sort((a, b) => a.priceDelta - b.priceDelta || byProj(a, b))
        .slice(0, LIMITS.fallers);
    // Abridores anunciados o por la rotación (status «probable», `estimated` si es por la rotación)
    const pitchers = items
        .filter((item) => item.role === 'P' && item.status === 'probable')
        .map((item) => {
            const { matchup, factor } = matchupOf(item.opp, ops);
            return { ...item, matchup, score: round1((item.proj ?? 0) * factor) };
        })
        .sort((a, b) => b.score - a.score || byProj(a, b))
        .slice(0, LIMITS.pitchers);
    const popular = items
        .filter((item) => yesterday.owned.get(item.id) > 0)
        .map((item) => ({ ...item, owned: yesterday.owned.get(item.id) }))
        .sort((a, b) => b.owned - a.owned || byProj(a, b))
        .slice(0, LIMITS.popular);

    const upcoming = day.games.filter((game) => !isPostponedGame(game)).map(lockTime).filter((at) => Number.isFinite(at) && at > now);
    return {
        league,
        date,
        hot,
        bargains,
        risers,
        fallers,
        pitchers,
        popular,
        partial: !!day.incomplete || yesterday.partial,
        // Al cerrarse el próximo juego sus peloteros salen de las listas
        nextLockAt: upcoming.length ? Math.min(...upcoming) : null,
        updatedAt: new Date(now).toISOString()
    };
};

/** Segundos de caché: a medias 30 s; si no, 2 min sin pasar del próximo cierre (sin juegos por cerrar, 1 h) */
const trendsTtl = (data, now = Date.now()) => {
    if (data.partial) return 30;
    if (!data.nextLockAt) return 3600;
    return Math.max(5, Math.min(120, Math.ceil((data.nextLockAt - now) / 1000) + 1));
};

const dayTrends = (league, date) => cached(`fantasy_trends_${league}_${date}`, (data) => trendsTtl(data), () => computeTrends(league, date), { staleSec: 120 });

module.exports = { computeTrends, trendsTtl, dayTrends, matchupOf, teamOps, LIMITS };
