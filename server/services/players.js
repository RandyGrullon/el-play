const { MLB_API_BASE, LEAGUES } = require('../config/constants');
const http = require('./http');
const { getSeasonInfo } = require('./season');
const { cached } = require('../utils/cache');
const { teamAbbrev, teamColor, teamLogo, findTeam } = require('../utils/teams');
const { batterPoints, pitcherPoints } = require('./fantasy');

// Estadísticas para buscar y consultar peloteros (pensadas para armar el fantasy):
// la temporada de todos los de la liga (con los del roster que aún no juegan) y la ficha de cada uno
// con su juego a juego y su carrera en la liga. Los puntos de fantasy salen de la misma regla del juego.

const leagueOf = (leagueKey) => LEAGUES[leagueKey] || LEAGUES.lidom;
const round1 = (value) => Math.round(value * 10) / 10;

const teamInfo = (team, leagueKey) =>
    team?.id
        ? {
              id: team.id,
              abbrev: teamAbbrev(team.id, leagueKey, team.abbreviation, team.name),
              name: findTeam(team.id, leagueKey)?.name || team.name || '',
              color: teamColor(team.id, leagueKey),
              logo: teamLogo(team.id)
          }
        : null;

/** Línea de bateo resumida (los nombres cortos son los que usa la app) */
const hittingOf = (s = {}) => ({
    g: s.gamesPlayed ?? 0,
    pa: s.plateAppearances ?? 0,
    ab: s.atBats ?? 0,
    r: s.runs ?? 0,
    h: s.hits ?? 0,
    d: s.doubles ?? 0,
    t: s.triples ?? 0,
    hr: s.homeRuns ?? 0,
    rbi: s.rbi ?? 0,
    bb: s.baseOnBalls ?? 0,
    k: s.strikeOuts ?? 0,
    sb: s.stolenBases ?? 0,
    cs: s.caughtStealing ?? 0,
    hbp: s.hitByPitch ?? 0,
    sf: s.sacFlies ?? 0,
    tb: s.totalBases ?? 0,
    gidp: s.groundIntoDoublePlay ?? 0,
    avg: s.avg ?? '.000',
    obp: s.obp ?? '.000',
    slg: s.slg ?? '.000',
    ops: s.ops ?? '.000'
});

const outsOf = (s = {}) => {
    if (typeof s.outs === 'number') return s.outs;
    const [whole, part] = String(s.inningsPitched ?? '0').split('.');
    return Number(whole || 0) * 3 + Number(part || 0);
};

/** Línea de pitcheo resumida */
const pitchingOf = (s = {}) => ({
    g: s.gamesPitched ?? s.gamesPlayed ?? 0,
    gs: s.gamesStarted ?? 0,
    ip: s.inningsPitched ?? '0.0',
    outs: outsOf(s),
    w: s.wins ?? 0,
    l: s.losses ?? 0,
    sv: s.saves ?? 0,
    hld: s.holds ?? 0,
    k: s.strikeOuts ?? 0,
    bb: s.baseOnBalls ?? 0,
    h: s.hits ?? 0,
    er: s.earnedRuns ?? 0,
    hr: s.homeRuns ?? 0,
    hbp: s.hitBatsmen ?? s.hitByPitch ?? 0,
    bf: s.battersFaced ?? 0,
    np: s.numberOfPitches ?? 0,
    era: s.era ?? '-.--',
    whip: s.whip ?? '-.--'
});

/** Puntos de fantasy con las líneas resumidas (la regla del fantasy usa los nombres de MLB) */
const pointsOf = (role, hitting, pitching) => {
    if (role === 'P') {
        if (!pitching) return 0;
        return pitcherPoints({ outs: pitching.outs, strikeOuts: pitching.k, wins: pitching.w, saves: pitching.sv, earnedRuns: pitching.er, hits: pitching.h, baseOnBalls: pitching.bb });
    }
    if (!hitting) return 0;
    return batterPoints({
        hits: hitting.h,
        doubles: hitting.d,
        triples: hitting.t,
        homeRuns: hitting.hr,
        runs: hitting.r,
        rbi: hitting.rbi,
        baseOnBalls: hitting.bb,
        hitByPitch: hitting.hbp,
        stolenBases: hitting.sb,
        strikeOuts: hitting.k
    });
};

// ---------------------------------------------------------------- piezas de MLB (con caché)

const seasonSplits = (league, season, group) =>
    cached(
        `season_splits_${league.id}_${season}_${group}`,
        300,
        async () => {
            const data = await http.mlbGet(`${MLB_API_BASE}/stats`, { stats: 'season', group, gameType: league.statsGameType || 'R', leagueId: league.leagueId, season, playerPool: 'ALL', limit: 2000 });
            return data?.stats?.[0]?.splits || [];
        },
        { staleSec: 3600 }
    );

/** Rosters activos de los equipos de la liga: así se encuentra también a quien todavía no ha jugado */
const rosters = (league, season) =>
    cached(
        `rosters_${league.id}_${season}`,
        3600,
        async () => {
            const teams = await http.mlbGet(`${MLB_API_BASE}/teams`, { sportId: league.sportId, leagueIds: league.leagueId, season });
            const list = (teams?.teams || []).slice(0, 24);
            const rows = await Promise.all(
                list.map(async (team) => {
                    const data = await http.mlbGet(`${MLB_API_BASE}/teams/${team.id}/roster`, { season, rosterType: 'active' }).catch(() => null);
                    return (data?.roster || []).map((entry) => ({ team, entry }));
                })
            );
            return rows.flat();
        },
        { staleSec: 6 * 3600 }
    );

// ---------------------------------------------------------------- todos los peloteros de una temporada

const fetchPlayers = async (leagueKey, requested) => {
    const league = leagueOf(leagueKey);
    const { season: current } = await getSeasonInfo(league.id);
    let season = requested && requested <= current && requested >= current - 5 ? requested : current;
    const load = (year) => Promise.all([seasonSplits(league, year, 'hitting'), seasonSplits(league, year, 'pitching')]);

    let [hitting, pitching] = await load(season);
    let isPreviousSeason = false;
    // Antes del primer juego de la temporada se muestra la anterior (a menos que se pida una)
    if (!requested && !hitting.length && !pitching.length) {
        season = current - 1;
        [hitting, pitching] = await load(season);
        isPreviousSeason = true;
    }
    const roster = season === current ? await rosters(league, season).catch(() => []) : [];

    const teams = {};
    const players = new Map();
    const touch = (person, team) => {
        if (!person?.id) return null;
        const info = teamInfo(team, league.id);
        if (info && !teams[info.id]) teams[info.id] = info;
        if (!players.has(person.id)) players.set(person.id, { id: person.id, name: person.fullName || '', teamId: info?.id ?? null, pos: '', number: null, hitting: null, pitching: null, games: 0 });
        return players.get(person.id);
    };

    for (const { team, entry } of roster) {
        const player = touch(entry.person, team);
        if (!player) continue;
        player.teamId = team.id;
        player.pos = entry.position?.abbreviation || player.pos;
        player.number = entry.jerseyNumber || null;
    }
    // Si cambió de equipo hay una fila por equipo: se queda la de más juegos (y el equipo del roster si lo hay)
    for (const [group, splits] of [['hitting', hitting], ['pitching', pitching]]) {
        for (const split of splits) {
            const player = touch(split.player, split.team);
            if (!player) continue;
            const line = group === 'hitting' ? hittingOf(split.stat) : pitchingOf(split.stat);
            const previous = player[group];
            if (previous && previous.g >= line.g) continue;
            player[group] = line;
            if (!player.pos) player.pos = split.position?.abbreviation || '';
            if (!roster.length && split.team?.id) player.teamId = split.team.id;
        }
    }

    const list = [...players.values()].map(({ games, ...player }) => {
        const role = player.pos === 'P' || (!player.pos && player.pitching && !player.hitting) || (player.pitching && !player.hitting) ? 'P' : 'B';
        const line = role === 'P' ? player.pitching : player.hitting;
        const g = line?.g ?? 0;
        const pts = pointsOf(role, player.hitting, player.pitching);
        return { ...player, pos: player.pos || (role === 'P' ? 'P' : ''), role, g, pts, ppg: g ? round1(pts / g) : 0 };
    });
    list.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));

    return {
        league: league.id,
        season,
        currentSeason: current,
        seasons: [current, current - 1, current - 2],
        isPreviousSeason,
        teams,
        players: list
    };
};

// ---------------------------------------------------------------- ficha de un pelotero

const placeOf = (person) => [person.birthCity, person.birthStateProvince, person.birthCountry].filter(Boolean).join(', ');

const fetchPlayer = async (leagueKey, personId, requested) => {
    const league = leagueOf(leagueKey);
    const { season: current } = await getSeasonInfo(league.id);
    const season = requested && requested <= current && requested >= current - 30 ? requested : current;
    const hydrate = `currentTeam,stats(group=[hitting,pitching],type=[season,gameLog,yearByYear],season=${season},sportId=${league.sportId},leagueId=${league.leagueId})`;
    const data = await http.mlbGet(`${MLB_API_BASE}/people/${personId}`, { hydrate });
    const person = data?.people?.[0];
    if (!person) throw Object.assign(new Error('player not found'), { response: { status: 404 } });

    const blocks = person.stats || [];
    const block = (type, group) => blocks.find((item) => item.type?.displayName === type && item.group?.displayName === group)?.splits || [];
    const role = ['1', 'Y'].includes(person.primaryPosition?.code) ? 'P' : 'B';

    const seasonHitting = block('season', 'hitting')[0];
    const seasonPitching = block('season', 'pitching')[0];
    const hitting = seasonHitting ? hittingOf(seasonHitting.stat) : null;
    const pitching = seasonPitching ? pitchingOf(seasonPitching.stat) : null;
    const team = teamInfo((role === 'P' ? seasonPitching : seasonHitting)?.team || person.currentTeam, league.id);

    // Juego a juego (si bateó y lanzó el mismo día, una sola fila)
    const games = new Map();
    for (const group of ['hitting', 'pitching']) {
        for (const split of block('gameLog', group)) {
            const gamePk = split.game?.gamePk;
            if (!gamePk) continue;
            if (!games.has(gamePk)) {
                games.set(gamePk, { gamePk, date: split.date, isHome: !!split.isHome, isWin: split.isWin ?? null, opponent: teamInfo(split.opponent, league.id), hitting: null, pitching: null, pts: 0 });
            }
            games.get(gamePk)[group] = group === 'hitting' ? hittingOf(split.stat) : pitchingOf(split.stat);
        }
    }
    const log = [...games.values()]
        .map((game) => ({ ...game, pts: pointsOf(role, game.hitting, game.pitching) }))
        .sort((a, b) => b.date.localeCompare(a.date) || b.gamePk - a.gamePk);

    // Carrera en esta liga (una fila por temporada y equipo)
    const career = [];
    for (const group of ['hitting', 'pitching']) {
        if ((role === 'P') !== (group === 'pitching')) continue;
        for (const split of block('yearByYear', group)) {
            const line = group === 'hitting' ? hittingOf(split.stat) : pitchingOf(split.stat);
            career.push({ season: Number(split.season), team: teamInfo(split.team, league.id), [group]: line, pts: pointsOf(role, group === 'hitting' ? line : null, group === 'pitching' ? line : null) });
        }
    }
    career.sort((a, b) => b.season - a.season);

    const line = role === 'P' ? pitching : hitting;
    const pts = pointsOf(role, hitting, pitching);
    return {
        league: league.id,
        season,
        currentSeason: current,
        id: person.id,
        name: person.fullName,
        number: person.primaryNumber || null,
        pos: person.primaryPosition?.abbreviation || (role === 'P' ? 'P' : ''),
        role,
        bats: person.batSide?.code || null,
        throws: person.pitchHand?.code || null,
        age: person.currentAge ?? null,
        birthDate: person.birthDate || null,
        birthPlace: placeOf(person) || null,
        height: person.height || null,
        weight: person.weight || null,
        mlbDebut: person.mlbDebutDate || null,
        team,
        hitting,
        pitching,
        g: line?.g ?? 0,
        pts,
        ppg: line?.g ? round1(pts / line.g) : 0,
        log,
        career
    };
};

module.exports = { fetchPlayers, fetchPlayer, hittingOf, pitchingOf, pointsOf };
