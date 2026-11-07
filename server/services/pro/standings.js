const { MLB_API_BASE, LEAGUES, TTL } = require('../../config/constants');
const http = require('../http'); // por el módulo: las pruebas sustituyen http.mlbGet
const mlb = require('../mlbService');
const { cached } = require('../../utils/cache');
const { leagueOf, todayOf, daysBetween, scheduleBetween, gameState } = require('./games');

// Posiciones PRO (GET /v2/pro/standings): las del Lite (mismo caché que GET /v2/standings) con `pro` en cada fila
// (récords por situación, récord esperado de MLB, diferencia de carreras, clasificado/eliminado y juegos respecto a
// la línea de corte) y, en LIDOM, las fases. Más las fechas y el avance de cada temporada (GET /v2/pro/season[s]).

const SPLITS = ['home', 'away', 'left', 'right', 'leftHome', 'leftAway', 'rightHome', 'rightAway', 'day', 'night', 'oneRun', 'extraInning', 'winners', 'lastTen'];
// Equipos que pasan: 4 de la regular de LIDOM al Round Robin (2 del Round Robin a la final), 2 por grupo del Clásico y
// 4 a las semifinales de la Serie del Caribe (los mismos números que usa la app)
const ADVANCE = { regular: 4, roundRobin: 2, wbc: 2, sdc: 4 };

// ---------------------------------------------------------------- temporada (fechas de MLB)

const dateOf = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);
const numberOf = (value) => (value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

/** Datos de la liga en MLB (/league/{id}): temporada, estado, juegos, fechas y regla de calificado. 6 h en caché. */
const leagueInfo = (leagueKey, season) => {
    const league = leagueOf(leagueKey);
    return cached(
        `pro_league_${league.id}_${season || 'actual'}`,
        TTL.SEASON[0],
        async () => {
            const data = await http.mlbGet(`${MLB_API_BASE}/league/${league.leagueId}`, season ? { season } : undefined);
            const info = data?.leagues?.[0] || {};
            const d = info.seasonDateInfo || {};
            const dates = {
                seasonStart: dateOf(d.seasonStartDate) ?? dateOf(d.preSeasonStartDate),
                regularStart: dateOf(d.regularSeasonStartDate),
                regularEnd: dateOf(d.regularSeasonEndDate),
                postStart: dateOf(d.postSeasonStartDate),
                postEnd: dateOf(d.postSeasonEndDate),
                seasonEnd: dateOf(d.seasonEndDate),
                offseasonEnd: dateOf(d.offseasonEndDate) ?? dateOf(d.offSeasonEndDate)
            };
            const qualifier = { plateAppearances: numberOf(d.qualifierPlateAppearances), outsPitched: numberOf(d.qualifierOutsPitched) };
            return {
                season: parseInt(info.season ?? d.seasonId, 10) || season || league.season,
                seasonState: info.seasonState || null,
                regularSeasonGames: info.numGames || league.regularSeasonGames || null,
                dates: Object.values(dates).some(Boolean) ? dates : null,
                qualifier: qualifier.plateAppearances !== null || qualifier.outsPitched !== null ? qualifier : null
            };
        },
        { staleSec: 86400 }
    );
};

/** Dónde va la temporada hoy: etapa, día N de la regular o de la postemporada y días que faltan para empezar */
const stageOf = (dates, today) => {
    if (!dates || !dates.regularStart) return { stage: null, day: null, daysToStart: null };
    const { regularStart, regularEnd, postStart, postEnd, seasonEnd } = dates;
    if (today < regularStart) return { stage: 'preseason', day: null, daysToStart: daysBetween(today, regularStart) };
    if (!regularEnd || today <= regularEnd) return { stage: 'regular', day: daysBetween(regularStart, today) + 1, daysToStart: null };
    if (postStart && today < postStart) return { stage: 'break', day: null, daysToStart: null };
    if (postStart && today <= (postEnd || seasonEnd || today)) return { stage: 'postseason', day: daysBetween(postStart, today) + 1, daysToStart: null };
    return { stage: 'offseason', day: null, daysToStart: null };
};

/** Fechas y avance de la temporada de una liga */
const seasonOverview = async (leagueKey, now = new Date()) => {
    const league = leagueOf(leagueKey);
    const info = await leagueInfo(league.id);
    const today = todayOf(league.id, now);
    return {
        league: league.id,
        season: info.season,
        seasonState: info.seasonState,
        today,
        timeZone: league.timeZone,
        regularSeasonGames: info.regularSeasonGames,
        dates: info.dates,
        qualifier: info.qualifier,
        ...stageOf(info.dates, today)
    };
};

/** Las tres ligas (si una falla, las otras igual llegan) */
const allSeasons = async (now = new Date()) => {
    const results = await Promise.all(
        Object.keys(LEAGUES).map((key) =>
            seasonOverview(key, now).catch((error) => {
                console.warn(`[pro] temporada ${key}: ${error.message}`);
                return null;
            })
        )
    );
    const leagues = results.filter(Boolean);
    if (!leagues.length) throw new Error('sin temporadas');
    return { leagues };
};

// ---------------------------------------------------------------- posiciones

/** /standings crudo (con splitRecords, expectedRecords y eliminationNumber), 5 min en caché */
const rawStandings = (league, season, standingsTypes) =>
    cached(
        `pro_standings_raw_${league.id}_${season}_${standingsTypes}`,
        300,
        () => http.mlbGet(`${MLB_API_BASE}/standings`, { leagueId: league.leagueId, season, standingsTypes, hydrate: 'team' }).catch(() => ({ records: [] })),
        { staleSec: 3600 }
    );

const recordsById = (response) => new Map((response?.records || []).flatMap((record) => record.teamRecords || []).map((record) => [record.team?.id, record]));

const lastUpdatedOf = (response) => (response?.records || []).map((record) => record.lastUpdated).filter(Boolean).sort().pop() || null;

/** Juegos para alcanzar al de la línea (negativo = por encima, 0 = en la línea) */
const gamesBehind = (row, cut) => (cut ? (cut.wins - row.wins + (row.losses - cut.losses)) / 2 : null);

const eliminationOf = (value) => (value === 'E' ? 'E' : /^\d+$/.test(String(value ?? '')) ? Number(value) : null);

/**
 * `pro` de una fila. `cut` es el último equipo que pasa (el `advance`-ésimo); `firstOut`, el primero que no. Con
 * `perTeam` (juegos por equipo de la fase) se calcula si ya clasificó o quedó fuera cuando MLB no lo dice.
 */
const proOf = (row, record, { cut, firstOut, perTeam, rank, advance }) => {
    const splits = {};
    for (const split of record?.records?.splitRecords || []) {
        if (SPLITS.includes(split.type) && typeof split.wins === 'number' && typeof split.losses === 'number') splits[split.type] = { wins: split.wins, losses: split.losses };
    }
    const expected = (record?.records?.expectedRecords || []).find((item) => item.type === 'xWinLoss');
    const runDiff =
        typeof record?.runDifferential === 'number'
            ? record.runDifferential
            : typeof row.runsScored === 'number' && typeof row.runsAllowed === 'number'
              ? row.runsScored - row.runsAllowed
              : typeof row.runDiff === 'number'
                ? row.runDiff
                : null;
    let eliminationNumber = eliminationOf(record?.eliminationNumber);
    let clinched = !!(record?.clinched ?? row.clinched);
    // Sin el dato de MLB (Round Robin): con los juegos de la fase, contra la línea (un empate todavía no elimina)
    if (perTeam && advance && cut && firstOut) {
        if (rank > advance && eliminationNumber === null) {
            const number = perTeam + 1 - cut.wins - row.losses;
            eliminationNumber = number <= 0 ? 'E' : number;
        }
        if (rank <= advance && !clinched && perTeam + 1 - row.wins - firstOut.losses <= 0) clinched = true;
    }
    return {
        runDiff,
        expected: expected && typeof expected.wins === 'number' ? { wins: expected.wins, losses: expected.losses } : null,
        splits,
        clinched,
        eliminated: eliminationNumber === 'E',
        eliminationNumber,
        cutGamesBack: gamesBehind(row, cut)
    };
};

/** Las filas de una tabla con su `pro` (la línea es el `advance`-ésimo de la tabla ya ordenada) */
const withPro = (rows, records, advance, perTeam = null) => {
    const cut = advance && rows.length > advance ? rows[advance - 1] : null;
    const firstOut = advance && rows.length > advance ? rows[advance] : null;
    return rows.map((row, index) => ({ ...row, pro: proOf(row, records.get(row.team.id), { cut, firstOut, perTeam, rank: row.rank || index + 1, advance }) }));
};

const playedIn = (rows) => Math.round(rows.reduce((sum, row) => sum + (row.wins || 0) + (row.losses || 0), 0) / 2);

/** Serie final de LIDOM: juegos jugados, de cuántos es, si ya terminó y quién va arriba */
const finalSeries = async (league, season, rows) => {
    const schedule = await cached(
        `pro_final_${league.id}_${season}`,
        300,
        () => http.mlbGet(`${MLB_API_BASE}/schedule`, { sportId: league.sportId, leagueId: league.leagueId, season, gameTypes: 'W' }).catch(() => ({ dates: [] })),
        { staleSec: 3600 }
    );
    const games = (schedule?.dates || []).flatMap((date) => date.games || []);
    const total = games.reduce((max, game) => Math.max(max, Number(game.gamesInSeries) || 0), 0) || null;
    const sorted = [...rows].sort((a, b) => b.wins - a.wins);
    const leader = sorted[0] && (!sorted[1] || sorted[0].wins > sorted[1].wins) ? sorted[0] : null;
    const needed = total ? Math.ceil(total / 2) : null;
    return { played: playedIn(rows), total, over: !!(needed && leader && leader.wins >= needed), leaderId: leader?.team.id ?? null };
};

/** ¿Hay juegos de la liga en vivo hoy? (las posiciones se renuevan cada minuto) */
const liveToday = async (league) => {
    const today = todayOf(league.id);
    try {
        const games = await scheduleBetween(league.id, today, today);
        return games.some((game) => gameState(game.status) === 'live');
    } catch {
        return false;
    }
};

const proStandings = async (leagueKey) => {
    const league = leagueOf(leagueKey);
    const base = await cached(`standings_${league.id}`, TTL.STANDINGS[0], () => mlb.fetchStandings(league.id), { staleSec: 3600 });
    const live = await liveToday(league);

    if (base.type === 'wbc') {
        const raw = recordsById(await rawStandings(league, base.season, 'regularSeason'));
        const pools = Object.fromEntries(Object.entries(base.pools || {}).map(([pool, rows]) => [pool, withPro(rows, raw, ADVANCE.wbc)]));
        return { ...base, pools, pro: { live } };
    }
    if (base.type === 'sdc') {
        const raw = recordsById(await rawStandings(league, base.season, 'regularSeason'));
        return { ...base, teams: withPro(base.teams || [], raw, ADVANCE.sdc), pro: { live } };
    }

    const [regularRaw, postRaw, info] = await Promise.all([
        rawStandings(league, base.season, 'regularSeason'),
        rawStandings(league, base.season, 'postseason'),
        leagueInfo(league.id, base.isPreviousSeason ? base.season : undefined).catch(() => null)
    ]);
    const roundRobin = base.roundRobinInfo || postRaw?.records?.[0]?.roundRobin || null;
    const regularGames = base.regularSeasonGames ?? info?.regularSeasonGames ?? league.regularSeasonGames ?? null;
    const rrAdvance = Number(roundRobin?.advance) || ADVANCE.roundRobin;
    const rrGames = Number(roundRobin?.games) || league.roundRobinGames || null;
    const final = await finalSeries(league, base.season, base.final || []);
    return {
        ...base,
        regular: withPro(base.regular || [], recordsById(regularRaw), ADVANCE.regular),
        roundRobin: withPro(base.roundRobin || [], recordsById(postRaw), rrAdvance, rrGames),
        final: withPro(base.final || [], new Map(), null),
        pro: {
            live,
            dates: info?.dates ?? null,
            regularSeasonGames: regularGames,
            advance: { regular: ADVANCE.regular, roundRobin: rrAdvance },
            phases: {
                regular: { played: playedIn(base.regular || []), perTeam: regularGames },
                roundRobin: { played: playedIn(base.roundRobin || []), perTeam: rrGames, startDate: dateOf(roundRobin?.startDate), endDate: dateOf(roundRobin?.endDate) },
                final
            },
            lastUpdated: (base.activePhase === 'roundRobin' ? lastUpdatedOf(postRaw) : null) ?? lastUpdatedOf(regularRaw)
        }
    };
};

module.exports = { leagueInfo, stageOf, seasonOverview, allSeasons, proStandings, proOf, withPro, ADVANCE };
