const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { getLiveFeed } = require('./liveFeed');
const { getSeasonInfo } = require('./season');
const { cached } = require('../utils/cache');
const { transformGame, transformScheduleGame, uniqueGames } = require('../utils/transformers');
const { teamLogo, teamColor, teamColor2, teamAbbrev, teamFlag, findTeam } = require('../utils/teams');

const leagueOf = (leagueKey) => LEAGUES[leagueKey] || LEAGUES.lidom;

// ---------------------------------------------------------------- Juego

// La transformación se reutiliza mientras el documento no cambie (diffPatch devolvió []).
const transformed = new Map(); // gamePk -> { version, data }
// Cómo se obtuvo la última versión de cada juego (full | patch | unchanged): va en la cabecera X-Feed-Mode
const feedInfo = new Map();

// Estado de la serie (finales de LIDOM y del Clásico, Serie del Caribe): el feed no lo trae, el calendario sí.
// Sirve para saber si el juego da el campeonato (animación de campeón en la app).
const SERIES_TYPES = new Set(['F', 'D', 'L', 'W']);
const needsSeries = (game) => !!game.gameType && (SERIES_TYPES.has(game.gameType) || game.league === 'sdc');

const toSeries = (game) => {
    if (!game) return null;
    const status = game.seriesStatus || {};
    return {
        name: status.description || game.seriesDescription || null,
        game: status.gameNumber ?? null,
        total: status.totalGames ?? null,
        over: !!status.isOver,
        tied: !!status.isTied,
        leaderId: status.winningTeam?.id ?? null,
        wins: status.wins ?? 0,
        losses: status.losses ?? 0,
        // Final de LIDOM y del Clásico: tipo «W»; en la Serie del Caribe el último juego se llama «Championship Game»
        championship: game.gameType === 'W' || /championship game/i.test(game.description || '')
    };
};

const fetchSeries = (gamePk, live) =>
    cached(
        `series_${gamePk}`,
        live ? 30 : 6 * 3600,
        async () => {
            const data = await http.mlbGet(`${MLB_API_BASE}/schedule`, { gamePk, hydrate: 'seriesStatus' });
            return toSeries(data?.dates?.[0]?.games?.find((game) => String(game.gamePk) === String(gamePk)));
        },
        { staleSec: 600 }
    ).catch(() => null);

const fetchGame = async (gamePk) => {
    const { doc, version, mode } = await getLiveFeed(gamePk);
    const key = String(gamePk);
    feedInfo.set(key, { mode, version });
    if (feedInfo.size > 50) feedInfo.delete(feedInfo.keys().next().value);
    const previous = transformed.get(key);
    let data = previous && previous.version === version ? previous.data : null;
    if (!data) {
        data = transformGame(doc);
        // MLB responde 200 con un documento vacío para un juego que no existe: se trata como 404
        if (!data?.gamePk || !data.away?.id || !data.home?.id) throw Object.assign(new Error(`game ${gamePk} not found`), { response: { status: 404 } });
        transformed.set(key, { version, data });
        if (transformed.size > 50) transformed.delete(transformed.keys().next().value);
    }
    if (!needsSeries(data) || process.env.MLB_MOCK === '1') return data;
    return { ...data, series: await fetchSeries(gamePk, data.state !== 'final') };
};

// ---------------------------------------------------------------- Calendario

const WBC_OFFICIAL_TYPES = new Set(['F', 'S', 'D', 'L', 'W', 'R']); // sin exhibiciones (E) contra equipos de MLB

const scheduleRange = (league, now = Date.now()) => {
    const [back, ahead] = league.scheduleDays || [3, 7];
    const format = new Intl.DateTimeFormat('en-CA', { timeZone: league.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    return {
        startDate: format.format(new Date(now - back * 86400000)),
        endDate: format.format(new Date(now + ahead * 86400000))
    };
};

const fetchSchedule = async (leagueKey = 'lidom') => {
    const league = leagueOf(leagueKey);
    const { startDate, endDate } = scheduleRange(league);
    const params = { sportId: league.sportId, leagueId: league.leagueId, startDate, endDate, hydrate: 'linescore,probablePitcher,decisions,team' };

    let data;
    try {
        data = await http.mlbGet(`${MLB_API_BASE}/schedule`, params);
    } catch (error) {
        // Si MLB rechaza alguna hidratación, se pide solo con el marcador por entradas
        if (error.response?.status !== 400) throw error;
        data = await http.mlbGet(`${MLB_API_BASE}/schedule`, { ...params, hydrate: 'linescore' });
    }

    let games = uniqueGames((data?.dates || []).flatMap((date) => date.games || []));
    if (league.id === 'wbc') games = games.filter((game) => WBC_OFFICIAL_TYPES.has(game.gameType));
    const cards = games.map((game) => transformScheduleGame(game, league.id));

    // Un suspendido trae el récord del día en que se suspendió: va el de la tarjeta empezada más reciente de cada equipo
    for (const card of cards.filter((c) => /^Suspended/i.test(c.detailedState))) {
        for (const side of [card.away, card.home]) {
            const latest = cards
                .filter((c) => c !== card && c.state !== 'preview' && (c.away.id === side.id || c.home.id === side.id))
                .sort((a, b) => b.date.localeCompare(a.date))[0];
            const record = latest && (latest.away.id === side.id ? latest.away.record : latest.home.record);
            if (record) side.record = record;
        }
    }

    return {
        league: league.id,
        timeZone: league.timeZone,
        startDate,
        endDate,
        games: cards
    };
};

// ---------------------------------------------------------------- Posiciones

const splitOf = (record, type) => {
    const split = (record.records?.splitRecords || []).find((item) => item.type === type);
    return split ? { wins: split.wins, losses: split.losses } : null;
};

const standingRow = (record, leagueKey) => ({
    rank: Number(record.rank || record.leagueRank || record.divisionRank) || 0,
    team: {
        id: record.team.id,
        // con hydrate=team llegan name completo, teamName corto ("Aguilas") y la sigla oficial
        name: findTeam(record.team.id, leagueKey)?.name || record.team.name,
        shortName: record.team.teamName || record.team.name,
        abbrev: teamAbbrev(record.team.id, leagueKey, record.team.abbreviation, record.team.name),
        logo: teamLogo(record.team.id),
        color: teamColor(record.team.id, leagueKey),
        flag: teamFlag(record.team.id, leagueKey)
    },
    wins: record.wins,
    losses: record.losses,
    gamesPlayed: record.gamesPlayed || record.wins + record.losses,
    pct: record.winningPercentage || record.leagueRecord?.pct || '.000',
    gamesBack: '-',
    streak: record.streak?.streakCode || '-',
    lastTen: (record.records?.splitRecords || []).find((split) => split.type === 'lastTen') || null,
    // Para el modo PRO: carreras, casa/visita y juegos cerrados
    runsScored: record.runsScored ?? null,
    runsAllowed: record.runsAllowed ?? null,
    home: splitOf(record, 'home'),
    away: splitOf(record, 'away'),
    oneRun: splitOf(record, 'oneRun'),
    extraInning: splitOf(record, 'extraInning'),
    // MLB lo marca cuando el equipo ya aseguró su puesto
    clinched: !!record.clinched
});

// gamesBack de /standings no es fiable (daba -9.5 al líder de LIDOM 2025): se calcula contra el primero
const withGamesBack = (rows) => {
    const leader = rows[0];
    for (const row of rows) {
        const back = leader ? (leader.wins - row.wins + (row.losses - leader.losses)) / 2 : 0;
        row.gamesBack = back <= 0 ? '-' : back.toFixed(1).replace(/\.0$/, '');
    }
    return rows;
};

const sortByRecord = (rows) => {
    rows.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    rows.forEach((row, index) => { row.rank = index + 1; });
    return withGamesBack(rows);
};

const sortByRank = (rows) => withGamesBack(rows.sort((a, b) => a.rank - b.rank || b.wins - a.wins));

const getStandings = (league, season, standingsTypes) =>
    http.mlbGet(`${MLB_API_BASE}/standings`, { leagueId: league.leagueId, season, standingsTypes, hydrate: 'team' });

/** Pide posiciones de la temporada vigente; si aún no empezó, devuelve la anterior marcada como tal. */
const withSeasonFallback = async (leagueKey, load, isEmpty) => {
    const { season, regularSeasonGames } = await getSeasonInfo(leagueKey);
    const current = await load(season, regularSeasonGames);
    if (!isEmpty(current)) return { ...current, season, isPreviousSeason: false };
    const previous = await load(season - 1, regularSeasonGames);
    if (!isEmpty(previous)) return { ...previous, season: season - 1, isPreviousSeason: true };
    return { ...current, season, isPreviousSeason: false };
};

const loadLidomStandings = async (league, season, regularSeasonGames) => {
    const [regular, postseason, finals] = await Promise.all([
        getStandings(league, season, 'regularSeason'),
        getStandings(league, season, 'postseason').catch(() => ({ records: [] })),
        http.mlbGet(`${MLB_API_BASE}/schedule`, { sportId: league.sportId, leagueId: league.leagueId, season, gameTypes: 'W', hydrate: 'team' }).catch(() => ({ dates: [] }))
    ]);

    const rows = (response) => sortByRank((response?.records?.[0]?.teamRecords || []).map((record) => standingRow(record, 'lidom')));
    const regularRows = rows(regular);
    const roundRobinRows = rows(postseason);

    // Serie final: se cuentan victorias de los juegos ya terminados
    const finalGames = (finals?.dates || []).flatMap((date) => date.games || []);
    const series = new Map();
    for (const game of finalGames) {
        for (const key of ['away', 'home']) {
            const side = game.teams?.[key];
            if (!side?.team?.id) continue;
            if (!series.has(side.team.id)) {
                series.set(side.team.id, standingRow({ team: side.team, wins: 0, losses: 0, gamesPlayed: 0 }, 'lidom'));
            }
            if (game.status?.abstractGameState === 'Final' && typeof side.isWinner === 'boolean') {
                const row = series.get(side.team.id);
                if (side.isWinner) row.wins += 1;
                else row.losses += 1;
                row.gamesPlayed = row.wins + row.losses;
                row.pct = row.gamesPlayed ? (row.wins / row.gamesPlayed).toFixed(3).replace(/^0/, '') : '.000';
            }
        }
    }
    const finalRows = sortByRecord([...series.values()]);

    const gamesPlayed = (list) => Math.max(0, ...list.map((row) => row.wins + row.losses));
    const finalStarted = finalGames.some((game) => ['Live', 'Final'].includes(game.status?.abstractGameState));
    let activePhase = 'regular';
    if (finalStarted) activePhase = 'final';
    else if (gamesPlayed(roundRobinRows) > 0) activePhase = 'roundRobin';
    else if (regularSeasonGames && gamesPlayed(regularRows) >= regularSeasonGames && roundRobinRows.length) activePhase = 'roundRobin';

    return {
        type: 'lidom',
        league: 'lidom',
        regular: regularRows,
        roundRobin: roundRobinRows,
        final: finalRows,
        activePhase,
        roundRobinInfo: postseason?.records?.[0]?.roundRobin?.games ? postseason.records[0].roundRobin : null,
        // Para saber quién ya clasificó o quedó eliminado (con lo que le falta a cada uno)
        regularSeasonGames: regularSeasonGames || null
    };
};

// /standings no tiene datos del Clásico 2026: si viene vacío, cada grupo se arma con los juegos de la
// fase de grupos (gameType F, description "Pool A"…)
const poolsFromGames = (games, leagueKey) => {
    const pools = {};
    for (const game of games) {
        const pool = game.description || game.teams?.away?.team?.division?.name;
        if (!pool) continue;
        const table = (pools[pool] ||= new Map());
        const final = game.status?.abstractGameState === 'Final';
        for (const [key, other] of [['away', 'home'], ['home', 'away']]) {
            const side = game.teams?.[key];
            if (!side?.team?.id) continue;
            if (!table.has(side.team.id)) {
                table.set(side.team.id, { ...standingRow({ team: side.team, wins: 0, losses: 0, gamesPlayed: 0 }, leagueKey), runDiff: 0 });
            }
            if (!final || typeof side.isWinner !== 'boolean') continue;
            const row = table.get(side.team.id);
            if (side.isWinner) row.wins += 1;
            else row.losses += 1;
            row.gamesPlayed = row.wins + row.losses;
            row.pct = (row.wins / row.gamesPlayed).toFixed(3).replace(/^0/, '');
            row.runDiff += (side.score ?? 0) - (game.teams[other]?.score ?? 0);
        }
    }
    return Object.fromEntries(
        Object.keys(pools)
            .sort()
            .map((pool) => {
                const rows = [...pools[pool].values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.runDiff - a.runDiff);
                rows.forEach((row, index) => { row.rank = index + 1; });
                return [pool, withGamesBack(rows)];
            })
    );
};

const loadPoolStandings = async (league, season) => {
    const response = await getStandings(league, season, 'regularSeason').catch(() => ({ records: [] }));
    const pools = {};
    for (const record of response?.records || []) {
        const name = record.division?.name || record.league?.name || 'Pool';
        pools[name] = sortByRank((record.teamRecords || []).map((teamRecord) => standingRow(teamRecord, league.id)));
    }
    if (Object.keys(pools).length) return { type: 'wbc', league: 'wbc', pools };

    const schedule = await http
        .mlbGet(`${MLB_API_BASE}/schedule`, { sportId: league.sportId, leagueId: league.leagueId, season, gameTypes: 'F', hydrate: 'team' })
        .catch(() => ({ dates: [] }));
    const games = (schedule?.dates || []).flatMap((date) => date.games || []);
    return { type: 'wbc', league: 'wbc', pools: poolsFromGames(games, league.id) };
};

const loadTournamentStandings = async (league, season) => {
    const response = await getStandings(league, season, 'regularSeason');
    const teams = (response?.records || []).flatMap((record) => (record.teamRecords || []).map((teamRecord) => standingRow(teamRecord, league.id)));
    return { type: 'sdc', league: 'sdc', teams: sortByRecord(teams) };
};

const fetchStandings = async (leagueKey = 'lidom') => {
    const league = leagueOf(leagueKey);
    if (league.id === 'wbc') {
        return withSeasonFallback('wbc', (season) => loadPoolStandings(league, season), (data) => Object.keys(data.pools).length === 0);
    }
    if (league.id === 'sdc') {
        return withSeasonFallback('sdc', (season) => loadTournamentStandings(league, season), (data) => data.teams.length === 0);
    }
    return withSeasonFallback(
        'lidom',
        (season, games) => loadLidomStandings(league, season, games),
        (data) => data.regular.every((row) => row.wins + row.losses === 0)
    );
};

// ---------------------------------------------------------------- Líderes

// Los promedios (AVG, OPS, EFE, WHIP) se piden con playerPool=QUALIFIED: antes salía líder de bateo
// un jugador de 1-1 (1.000).
const LEADER_CATEGORIES = [
    { id: 'homeRuns', group: 'hitting', sortStat: 'homeRuns', stat: 'homeRuns' },
    { id: 'battingAverage', group: 'hitting', sortStat: 'battingAverage', stat: 'avg', qualified: true },
    { id: 'runsBattedIn', group: 'hitting', sortStat: 'runsBattedIn', stat: 'rbi' },
    { id: 'ops', group: 'hitting', sortStat: 'onBasePlusSlugging', stat: 'ops', qualified: true },
    { id: 'hits', group: 'hitting', sortStat: 'hits', stat: 'hits' },
    { id: 'stolenBases', group: 'hitting', sortStat: 'stolenBases', stat: 'stolenBases' },
    { id: 'era', group: 'pitching', sortStat: 'earnedRunAverage', stat: 'era', qualified: true, order: 'asc' },
    { id: 'strikeouts', group: 'pitching', sortStat: 'strikeouts', stat: 'strikeOuts' },
    { id: 'wins', group: 'pitching', sortStat: 'wins', stat: 'wins' },
    { id: 'saves', group: 'pitching', sortStat: 'saves', stat: 'saves' },
    { id: 'whip', group: 'pitching', sortStat: 'walksAndHitsPerInningPitched', stat: 'whip', qualified: true, order: 'asc' }
];

const pickExtra = (stat = {}, group) =>
    group === 'pitching'
        ? { ip: stat.inningsPitched ?? null, k: stat.strikeOuts ?? null, w: stat.wins ?? null, l: stat.losses ?? null, g: stat.gamesPlayed ?? null }
        : { ab: stat.atBats ?? null, h: stat.hits ?? null, hr: stat.homeRuns ?? null, rbi: stat.rbi ?? null, g: stat.gamesPlayed ?? null };

/**
 * Mínimo para entrar en los promedios, la misma regla de Estadísticas (src/lib/stats.ts): 2 apariciones por juego del
 * equipo (y al menos 5) para bateo y 0,8 entradas por juego (y al menos 3) para pitcheo. El «QUALIFIED» de MLB deja
 * entrar a un 1.000 con 3 apariciones al principio de la temporada de LIDOM.
 */
const qualifiesFor = (group, stat = {}, teamGames) =>
    group === 'pitching'
        ? Number(stat.outs ?? 0) >= Math.max(9, Math.floor(teamGames * 0.8 * 3))
        : Number(stat.plateAppearances ?? 0) >= Math.max(5, Math.floor(teamGames * 2));

const leaderValue = (value) => {
    const parsed = parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
};

const loadLeaders = async (league, season) => {
    const gameType = league.statsGameType || 'R';
    // Juegos del equipo que más ha jugado (para la regla de calificado)
    const teamGames = await http
        .mlbGet(`${MLB_API_BASE}/teams/stats`, { stats: 'season', group: 'hitting', season, sportIds: league.sportId, leagueIds: league.leagueId, gameType })
        .then((data) => Math.max(0, ...(data?.stats?.[0]?.splits || []).map((split) => split.stat?.gamesPlayed ?? 0)))
        .catch(() => 0);
    const categories = await Promise.all(
        LEADER_CATEGORIES.map(async (category) => {
            try {
                const response = await http.mlbGet(`${MLB_API_BASE}/stats`, {
                    stats: 'season',
                    group: category.group,
                    gameType,
                    leagueId: league.leagueId,
                    season,
                    // Los promedios se piden de más para quedarse con los que califican; los totales, para quitar los ceros
                    limit: category.qualified ? 300 : 15,
                    sortStat: category.sortStat,
                    order: category.order || 'desc',
                    playerPool: 'ALL'
                });
                const splits = (response?.stats?.[0]?.splits || [])
                    .filter((split) => (category.qualified ? qualifiesFor(category.group, split.stat, teamGames) : (leaderValue(split.stat?.[category.stat]) ?? 0) > 0))
                    .slice(0, 5);
                return {
                    id: category.id,
                    group: category.group,
                    leaders: splits.map((split, index) => ({
                        rank: index + 1,
                        id: split.player?.id,
                        name: split.player?.fullName || '',
                        teamId: split.team?.id ?? null,
                        teamName: findTeam(split.team?.id, league.id)?.name || split.team?.name || '',
                        teamAbbrev: split.team ? teamAbbrev(split.team.id, league.id, split.team.abbreviation, split.team.name) : '',
                        logo: split.team ? teamLogo(split.team.id) : null,
                        color: split.team ? teamColor(split.team.id, league.id) : null,
                        color2: split.team ? teamColor2(split.team.id, league.id) : null,
                        value: split.stat?.[category.stat] ?? null,
                        // Números de apoyo para las tarjetas y los posts ("50 H en 136 VB", "46.1 IP")
                        extra: pickExtra(split.stat, category.group)
                    }))
                };
            } catch (error) {
                console.warn(`[leaders] ${category.id} falló: ${error.message}`);
                return { id: category.id, group: category.group, leaders: [], error: true };
            }
        })
    );
    return { league: league.id, categories };
};

const fetchLeaders = async (leagueKey = 'lidom') => {
    const league = leagueOf(leagueKey);
    return withSeasonFallback(
        league.id,
        (season) => loadLeaders(league, season),
        (data) => data.categories.every((category) => category.leaders.length === 0)
    );
};

// ---------------------------------------------------------------- La carrera (juegos sobre .500 día a día)

const dayIn = (timeZone, time) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));

/** Cada equipo, juego a juego de la temporada regular: victorias menos derrotas al final de cada día */
const loadRace = async (league, season, now) => {
    const startDate = league.id === 'lidom' ? `${season}-09-01` : `${season}-01-01`;
    const seasonEnd = league.id === 'lidom' ? `${season + 1}-02-28` : `${season}-12-31`;
    const today = dayIn(league.timeZone, now);
    const endDate = today < seasonEnd ? today : seasonEnd;
    const data = await http.mlbGet(`${MLB_API_BASE}/schedule`, { sportId: league.sportId, leagueId: league.leagueId, startDate, endDate, gameTypes: 'R' });
    const games = uniqueGames((data?.dates || []).flatMap((date) => (date.games || []).map((game) => ({ ...game, day: date.date || dayIn(league.timeZone, game.gameDate) }))))
        .filter((game) => (!game.gameType || game.gameType === 'R') && game.status?.abstractGameState === 'Final' && !/postponed|cancel/i.test(game.status?.detailedState || ''));
    const days = [...new Set(games.map((game) => game.day))].sort();
    const teams = new Map();
    const touch = (team) => {
        if (!teams.has(team.id)) {
            teams.set(team.id, {
                id: team.id,
                abbrev: teamAbbrev(team.id, league.id, team.abbreviation, team.name),
                name: findTeam(team.id, league.id)?.name || team.name || '',
                color: teamColor(team.id, league.id),
                logo: teamLogo(team.id),
                diff: 0,
                points: []
            });
        }
        return teams.get(team.id);
    };
    for (const day of days) {
        for (const game of games.filter((item) => item.day === day)) {
            const away = game.teams?.away;
            const home = game.teams?.home;
            if (!away?.team?.id || !home?.team?.id || away.score === home.score) continue;
            const awayWon = typeof away.isWinner === 'boolean' ? away.isWinner : (away.score ?? 0) > (home.score ?? 0);
            touch(away.team).diff += awayWon ? 1 : -1;
            touch(home.team).diff += awayWon ? -1 : 1;
        }
        for (const team of teams.values()) team.points.push(team.diff);
    }
    // Los que entraron tarde a la lista empiezan en 0 los días de antes
    for (const team of teams.values()) team.points = [...new Array(days.length - team.points.length).fill(0), ...team.points];
    return { season, days, teams: [...teams.values()].map(({ diff, ...team }) => team).sort((a, b) => b.points[b.points.length - 1] - a.points[a.points.length - 1]) };
};

const fetchRace = async (leagueKey = 'lidom', now = Date.now()) => {
    const league = leagueOf(leagueKey);
    const { season } = await getSeasonInfo(league.id);
    let race = await loadRace(league, season, now);
    let isPreviousSeason = false;
    // Antes del primer juego: la de la temporada pasada
    if (!race.days.length) {
        race = await loadRace(league, season - 1, now);
        isPreviousSeason = true;
    }
    return { league: league.id, ...race, isPreviousSeason };
};

const getFeedInfo = (gamePk) => feedInfo.get(String(gamePk)) || null;

module.exports = {
    toSeries,
    poolsFromGames,
    fetchGame,
    getFeedInfo,
    fetchSchedule,
    fetchStandings,
    fetchLeaders,
    fetchRace,
    scheduleRange,
    LEADER_CATEGORIES
};
