const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { getLiveFeed } = require('./liveFeed');
const { getSeasonInfo } = require('./season');
const { transformGame, transformScheduleGame } = require('../utils/transformers');
const { teamLogo, teamColor, teamAbbrev, teamFlag, findTeam } = require('../utils/teams');

const leagueOf = (leagueKey) => LEAGUES[leagueKey] || LEAGUES.lidom;

// ---------------------------------------------------------------- Juego

// La transformación se reutiliza mientras el documento no cambie (diffPatch devolvió []).
const transformed = new Map(); // gamePk -> { version, data }

const fetchGame = async (gamePk) => {
    const { doc, version } = await getLiveFeed(gamePk);
    const key = String(gamePk);
    const previous = transformed.get(key);
    if (previous && previous.version === version) return previous.data;
    const data = transformGame(doc);
    transformed.set(key, { version, data });
    if (transformed.size > 50) transformed.delete(transformed.keys().next().value);
    return data;
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

    let games = (data?.dates || []).flatMap((date) => date.games || []);
    if (league.id === 'wbc') games = games.filter((game) => WBC_OFFICIAL_TYPES.has(game.gameType));

    return {
        league: league.id,
        timeZone: league.timeZone,
        startDate,
        endDate,
        games: games.map((game) => transformScheduleGame(game, league.id))
    };
};

// ---------------------------------------------------------------- Posiciones

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
    lastTen: (record.records?.splitRecords || []).find((split) => split.type === 'lastTen') || null
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
        roundRobinInfo: postseason?.records?.[0]?.roundRobin?.games ? postseason.records[0].roundRobin : null
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

const loadLeaders = async (league, season) => {
    const categories = await Promise.all(
        LEADER_CATEGORIES.map(async (category) => {
            try {
                const response = await http.mlbGet(`${MLB_API_BASE}/stats`, {
                    stats: 'season',
                    group: category.group,
                    gameType: 'R',
                    leagueId: league.leagueId,
                    season,
                    limit: 5,
                    sortStat: category.sortStat,
                    order: category.order || 'desc',
                    playerPool: category.qualified ? 'QUALIFIED' : 'ALL'
                });
                const splits = response?.stats?.[0]?.splits || [];
                return {
                    id: category.id,
                    group: category.group,
                    leaders: splits.map((split, index) => ({
                        rank: split.rank || index + 1,
                        id: split.player?.id,
                        name: split.player?.fullName || '',
                        teamId: split.team?.id ?? null,
                        teamName: split.team?.name || '',
                        teamAbbrev: split.team ? teamAbbrev(split.team.id, league.id, split.team.abbreviation, split.team.name) : '',
                        logo: split.team ? teamLogo(split.team.id) : null,
                        color: split.team ? teamColor(split.team.id, league.id) : null,
                        value: split.stat?.[category.stat] ?? null
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

module.exports = {
    poolsFromGames,
    fetchGame,
    fetchSchedule,
    fetchStandings,
    fetchLeaders,
    scheduleRange,
    LEADER_CATEGORIES
};
