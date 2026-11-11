const { MLB_API_BASE } = require('../../config/constants');
const http = require('../http'); // por el módulo: las pruebas sustituyen http.mlbGet
const { getSeasonInfo } = require('../season');
const { teamInfo } = require('../players');
const { cached } = require('../../utils/cache');
const { gameState, uniqueGames } = require('../../utils/transformers');
const { leagueOf, isoDay } = require('./games');
const { leagueInfo } = require('./standings');

// Calendario PRO de toda la temporada (GET /v2/pro/calendar): todos los juegos (una fila por gamePk, también los
// pospuestos y cancelados) y, de los terminados, la carrera de cada fase (récord al cierre de cada fecha), el cara a
// cara por fase y los últimos 10 de cada equipo. Una sola llamada a /schedule con las fechas de la temporada (las mismas
// de /v2/pro/season). Sin `season`, la vigente; si todavía no tiene juegos, la anterior (como las posiciones).

// gameType de MLB → fase de cada liga (las mismas de /v2/pro/players?phase=)
const PHASES = {
    lidom: { R: 'regular', L: 'roundRobin', W: 'final' },
    wbc: { F: 'pool', D: 'quarterfinal', L: 'semifinal', W: 'final' },
    sdc: { R: 'tournament' }
};
// La carrera: regular y Round Robin en LIDOM, los grupos en el Clásico y el torneo en la Serie del Caribe
const RACE_PHASES = { lidom: ['regular', 'roundRobin'], wbc: ['pool'], sdc: ['tournament'] };
// Fuera del calendario: exhibiciones (E) y juegos de estrellas (A)
const NOT_SEASON = new Set(['E', 'A']);
const FORM_GAMES = 10;
// Primera temporada que se acepta en ?season= (MLB tiene LIDOM desde 2005-06)
const FIRST_SEASON = 2005;
// Caché: con juegos en vivo un minuto, la temporada vigente 5 minutos y una pasada (ya no cambia) 6 horas
const TTL = { live: 60, current: 300, past: 6 * 3600 };

const dateOf = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);
const numberOf = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Pospuesto o cancelado (MLB los da «Final» con codedGameState D o C); si no, el estado de siempre (suspendido = por jugar) */
const stateOf = (status = {}) => {
    const detailed = status.detailedState || '';
    if (/^Cancel/i.test(detailed) || status.codedGameState === 'C') return 'cancelled';
    if (/^Postponed/i.test(detailed) || status.codedGameState === 'D') return 'postponed';
    return gameState(status);
};

/** Un juego del /schedule → fila del calendario */
const toGame = (game, league) => {
    const state = stateOf(game.status);
    const started = state === 'live' || state === 'final';
    const side = (key, other) => {
        const own = game.teams[key];
        const rival = game.teams[other];
        const score = started ? (numberOf(own.score) ?? (state === 'live' ? 0 : null)) : null;
        const rivalScore = numberOf(rival.score);
        let isWinner = null;
        if (state === 'final') {
            if (typeof own.isWinner === 'boolean') isWinner = own.isWinner;
            else if (score !== null && rivalScore !== null && score !== rivalScore) isWinner = score > rivalScore;
        }
        return { id: own.team.id, score, isWinner };
    };
    return {
        gamePk: game.gamePk,
        date: game.gameDate,
        day: dateOf(game.officialDate) ?? isoDay(new Date(game.gameDate), league.timeZone),
        gameType: game.gameType || null,
        phase: PHASES[league.id]?.[game.gameType] ?? null,
        state,
        detailedState: game.status?.detailedState || '',
        reason: game.status?.reason || null,
        startTimeTBD: !!game.status?.startTimeTBD,
        away: side('away', 'home'),
        home: side('home', 'away'),
        venue: game.venue?.name || '',
        description: game.seriesDescription || game.description || null,
        doubleHeader: game.doubleHeader === 'Y' || game.doubleHeader === 'S' ? game.doubleHeader : null,
        gameNumber: numberOf(game.gameNumber),
        seriesGameNumber: numberOf(game.seriesGameNumber),
        gamesInSeries: numberOf(game.gamesInSeries),
        ifNecessary: game.ifNecessary === 'Y',
        dayNight: game.dayNight === 'day' || game.dayNight === 'night' ? game.dayNight : null
    };
};

/** Terminado con ganador (lo único que cuenta en la carrera, el cara a cara y la forma) */
const decided = (game) => game.state === 'final' && game.away.score !== null && game.home.score !== null && (game.away.isWinner === true || game.home.isWinner === true);

/** Ganados y perdidos de cada equipo de la fase al cierre de cada fecha con juegos terminados (listas alineadas con `dates`) */
const raceOf = (games, phase) => {
    const list = games.filter((game) => game.phase === phase);
    if (!list.length) return null;
    const ids = [...new Set(list.flatMap((game) => [game.away.id, game.home.id]))];
    const byDay = new Map();
    for (const game of list.filter(decided)) byDay.set(game.day, [...(byDay.get(game.day) || []), game]);
    const dates = [...byDay.keys()].sort();
    const totals = new Map(ids.map((id) => [id, { w: 0, l: 0 }]));
    const teams = Object.fromEntries(ids.map((id) => [id, { w: [], l: [] }]));
    for (const day of dates) {
        for (const game of byDay.get(day)) {
            const [winner, loser] = game.away.isWinner ? [game.away, game.home] : [game.home, game.away];
            totals.get(winner.id).w += 1;
            totals.get(loser.id).l += 1;
        }
        for (const id of ids) {
            teams[id].w.push(totals.get(id).w);
            teams[id].l.push(totals.get(id).l);
        }
    }
    return { dates, teams };
};

/** headToHead[fase][equipo][rival]: ganados, perdidos y carreras de los juegos terminados entre los dos */
const headToHeadOf = (games) => {
    const result = {};
    for (const game of games) {
        if (!game.phase || !decided(game)) continue;
        const phase = (result[game.phase] ||= {});
        for (const [own, rival] of [[game.away, game.home], [game.home, game.away]]) {
            const cell = ((phase[own.id] ||= {})[rival.id] ||= { wins: 0, losses: 0, runsFor: 0, runsAgainst: 0 });
            if (own.isWinner) cell.wins += 1;
            else cell.losses += 1;
            cell.runsFor += own.score;
            cell.runsAgainst += rival.score;
        }
    }
    return result;
};

/** Últimos 10 terminados de cada equipo (cualquier fase), del más reciente al más viejo */
const formOf = (games) => {
    const form = {};
    for (const game of games.filter(decided).reverse()) {
        for (const [key, other] of [['away', 'home'], ['home', 'away']]) {
            const own = game[key];
            const list = (form[own.id] ||= []);
            if (list.length >= FORM_GAMES) continue;
            list.push({ gamePk: game.gamePk, day: game.day, phase: game.phase, opponentId: game[other].id, isHome: key === 'home', isWin: own.isWinner === true, runs: own.score, runsAllowed: game[other].score });
        }
    }
    return form;
};

/** Desde y hasta de la temporada según /league (lo de /v2/pro/season); null si MLB no da las fechas */
const rangeOf = (dates) => {
    const startDate = dates?.seasonStart ?? dates?.regularStart ?? null;
    const endDate = dates?.seasonEnd ?? dates?.postEnd ?? dates?.regularEnd ?? null;
    return startDate && endDate && startDate <= endDate ? { startDate, endDate } : null;
};

/** Juegos de la temporada en MLB: con sus fechas o, sin ellas, la temporada entera que dice MLB */
const seasonGames = async (league, season) => {
    const info = await leagueInfo(league.id, season).catch(() => null);
    const range = rangeOf(info?.dates);
    const data = await http.mlbGet(`${MLB_API_BASE}/schedule`, { sportId: league.sportId, leagueId: league.leagueId, ...(range || { season }), hydrate: 'team' });
    return uniqueGames((data?.dates || []).flatMap((entry) => entry.games || [])).filter(
        (game) => !NOT_SEASON.has(game.gameType) && typeof game.teams?.away?.team?.id === 'number' && typeof game.teams?.home?.team?.id === 'number' && game.gameDate
    );
};

const buildCalendar = async (league, season) => {
    const raw = await seasonGames(league, season);
    const teams = {};
    for (const game of raw) {
        for (const key of ['away', 'home']) {
            const team = game.teams[key].team;
            if (!teams[team.id]) teams[team.id] = teamInfo(team, league.id);
        }
    }
    const games = raw.map((game) => toGame(game, league)).sort((a, b) => a.date.localeCompare(b.date) || a.gamePk - b.gamePk);
    const race = {};
    for (const phase of RACE_PHASES[league.id] || []) {
        const line = raceOf(games, phase);
        if (line) race[phase] = line;
    }
    return { teams, games, race, headToHead: headToHeadOf(games), form: formOf(games), live: games.some((game) => game.state === 'live'), updatedAt: new Date().toISOString() };
};

/** Calendario de una temporada, en caché (en vivo 1 min, la vigente 5 min, una pasada 6 h) */
const calendarOf = (league, season, past) =>
    cached(`pro_calendar_${league.id}_${season}`, (data) => (data.live ? TTL.live : past ? TTL.past : TTL.current), () => buildCalendar(league, season), {
        staleSec: past ? 86400 : 3600
    });

/**
 * Calendario de la temporada `requested` (sin ella, la vigente o, si todavía no tiene juegos, la anterior). null si la
 * temporada pedida no existe para la liga (futura o antes de FIRST_SEASON): la ruta responde 400.
 */
const seasonCalendar = async (leagueKey, requested) => {
    const league = leagueOf(leagueKey);
    const { season: current } = await getSeasonInfo(league.id);
    if (requested !== undefined && (requested > current || requested < FIRST_SEASON)) return null;
    let season = requested ?? current;
    let data = await calendarOf(league, season, season < current);
    if (requested === undefined && !data.games.length) {
        const previous = await calendarOf(league, current - 1, true).catch(() => null);
        if (previous?.games.length) {
            season = current - 1;
            data = previous;
        }
    }
    return { season, isPreviousSeason: season < current, league: league.id, timeZone: league.timeZone, ...data };
};

/**
 * Segundos de CDN: con juegos en vivo 1 min; una temporada pasada pedida con ?season= 6 h (ya no cambia); lo demás
 * 5 min (sin ?season= la respuesta pasa a la temporada nueva en cuanto tenga juegos)
 */
const calendarTtl = (data, requested) => (data.live ? TTL.live : requested && data.isPreviousSeason ? TTL.past : TTL.current);

module.exports = { seasonCalendar, calendarTtl, toGame, raceOf, headToHeadOf, formOf, FIRST_SEASON };
