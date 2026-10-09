const { teamLogo, teamColor, teamAbbrev, teamFlag } = require('./teams');

// Convierte las respuestas crudas de MLB StatsAPI al formato compacto que usa la app.
// Las descripciones se dejan en inglés con su código (eventType, call.code, type.code):
// la app las traduce según el idioma elegido.

const IN_PLAY_CODES = new Set(['X', 'D', 'E']);
const STRIKE_CODES = new Set(['C', 'S', 'W', 'F', 'T', 'L', 'M', 'O', 'Q', 'R', 'A', 'K']);

const num = (value, decimals = 3) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
};

const int = (value) => {
    const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
};

/** 'preview' | 'live' | 'final' a partir de status.abstractGameState (no del texto detailedState). */
const gameState = (status = {}) => {
    if (status.abstractGameState === 'Live') return 'live';
    if (status.abstractGameState === 'Final') return 'final';
    return 'preview';
};

/** Resultado de un pitcheo: 'ball' | 'strike' | 'inplay' | 'hbp'. Usa las banderas de MLB y cae a los códigos. */
const classifyPitch = (details = {}) => {
    const code = details.call?.code || details.code || '';
    if (details.isInPlay || IN_PLAY_CODES.has(code)) return 'inplay';
    if (code === 'H') return 'hbp';
    if (details.isStrike || STRIKE_CODES.has(code)) return 'strike';
    return 'ball';
};

const toPitch = (event) => {
    const details = event.details || {};
    const pitchData = event.pitchData || {};
    const coordinates = pitchData.coordinates || {};
    const pitch = {
        n: event.pitchNumber ?? null,
        x: num(coordinates.pX),
        z: num(coordinates.pZ),
        top: num(pitchData.strikeZoneTop, 2),
        bot: num(pitchData.strikeZoneBottom, 2),
        r: classifyPitch(details),
        code: details.call?.code || details.code || null,
        call: details.call?.description || details.description || '',
        type: details.type?.code || null,
        typeDesc: details.type?.description || null,
        mph: num(pitchData.startSpeed, 1),
        spin: int(pitchData.breaks?.spinRate),
        zone: int(pitchData.zone),
        b: event.count?.balls ?? null,
        s: event.count?.strikes ?? null
    };
    if (event.hitData) {
        pitch.hit = {
            ev: num(event.hitData.launchSpeed, 1),
            la: num(event.hitData.launchAngle, 0),
            dist: int(event.hitData.totalDistance)
        };
    }
    return pitch;
};

const toAtBat = (play, index) => {
    const about = play.about || {};
    const matchup = play.matchup || {};
    const result = play.result || {};
    const events = play.playEvents || [];
    return {
        i: about.atBatIndex ?? index,
        inning: about.inning ?? null,
        top: !!about.isTopInning,
        complete: !!about.isComplete,
        scoring: !!about.isScoringPlay,
        batter: { id: matchup.batter?.id ?? null, name: matchup.batter?.fullName || '', side: matchup.batSide?.code || null },
        pitcher: { id: matchup.pitcher?.id ?? null, name: matchup.pitcher?.fullName || '', hand: matchup.pitchHand?.code || null },
        event: result.eventType || null,
        eventLabel: result.event || null,
        desc: result.description || '',
        rbi: result.rbi || 0,
        away: result.awayScore ?? null,
        home: result.homeScore ?? null,
        outs: play.count?.outs ?? null,
        pitches: events.filter((event) => event.isPitch).map(toPitch),
        actions: events
            .filter((event) => !event.isPitch && event.type === 'action' && event.details?.description)
            .map((event) => ({ event: event.details.eventType || null, desc: event.details.description }))
    };
};

const leagueKeyOf = (gameData) => {
    const ids = [gameData.teams?.home?.league?.id, gameData.teams?.away?.league?.id];
    const sports = [gameData.teams?.home?.sport?.id, gameData.teams?.away?.sport?.id];
    if (ids.includes(160) || sports.includes(51)) return 'wbc';
    if (ids.includes(162)) return 'sdc';
    return 'lidom';
};

const record = (source) => {
    const r = source?.leagueRecord || source;
    return r && typeof r.wins === 'number' ? { wins: r.wins, losses: r.losses } : null;
};

/** Feed crudo de /api/v1.1/game/{pk}/feed/live → detalle compacto del juego. */
const transformGame = (feed) => {
    if (!feed || !feed.gameData || !feed.liveData) throw new Error('Invalid Game Data received from MLB API');

    const { gameData, liveData } = feed;
    const linescore = liveData.linescore || {};
    const boxscore = liveData.boxscore || { teams: {} };
    const allPlays = liveData.plays?.allPlays || [];
    const state = gameState(gameData.status);
    const leagueKey = leagueKeyOf(gameData);
    const people = gameData.players || {};

    const shortName = (id, fallback = '') => {
        const person = people[`ID${id}`];
        return person?.boxscoreName || person?.lastName || fallback;
    };

    const boxPlayer = (id) => {
        for (const side of ['away', 'home']) {
            const player = boxscore.teams?.[side]?.players?.[`ID${id}`];
            if (player) return player;
        }
        return null;
    };

    const team = (side) => {
        const info = gameData.teams?.[side] || {};
        const box = boxscore.teams?.[side]?.team || {};
        const line = linescore.teams?.[side] || {};
        const id = info.id ?? box.id;
        const name = info.name || box.name || '';
        return {
            id,
            name,
            teamName: info.teamName || name,
            abbrev: teamAbbrev(id, leagueKey, info.abbreviation, name),
            logo: teamLogo(id),
            color: teamColor(id, leagueKey),
            flag: teamFlag(id, leagueKey),
            record: record(info.record),
            runs: line.runs ?? 0,
            hits: line.hits ?? 0,
            errors: line.errors ?? 0,
            lob: line.leftOnBase ?? 0,
            isWinner: state === 'final' && (line.runs ?? 0) > (linescore.teams?.[side === 'home' ? 'away' : 'home']?.runs ?? 0)
        };
    };

    const atBats = allPlays.map(toAtBat);
    const currentPlay = liveData.plays?.currentPlay;
    const currentIndex = currentPlay?.about?.atBatIndex ?? (atBats.length ? atBats[atBats.length - 1].i : null);

    const offense = linescore.offense || {};
    const runner = (base) => (offense[base]?.id ? { id: offense[base].id, name: shortName(offense[base].id, offense[base].fullName) } : null);

    let matchup = null;
    if (state === 'live' && currentPlay?.matchup) {
        const m = currentPlay.matchup;
        const pitcherBox = boxPlayer(m.pitcher?.id);
        const batterBox = boxPlayer(m.batter?.id);
        matchup = {
            pitcher: {
                id: m.pitcher?.id ?? null,
                name: m.pitcher?.fullName || '',
                hand: m.pitchHand?.code || null,
                pitches: pitcherBox?.stats?.pitching?.numberOfPitches ?? pitcherBox?.stats?.pitching?.pitchesThrown ?? null,
                ip: pitcherBox?.stats?.pitching?.inningsPitched ?? null,
                k: pitcherBox?.stats?.pitching?.strikeOuts ?? null,
                era: pitcherBox?.seasonStats?.pitching?.era ?? null
            },
            batter: {
                id: m.batter?.id ?? null,
                name: m.batter?.fullName || '',
                side: m.batSide?.code || null,
                h: batterBox?.stats?.batting?.hits ?? null,
                ab: batterBox?.stats?.batting?.atBats ?? null,
                avg: batterBox?.seasonStats?.batting?.avg ?? null
            },
            onDeck: offense.onDeck?.id ? { id: offense.onDeck.id, name: offense.onDeck.fullName } : null
        };
    }

    const boxTeam = (side) => {
        const source = boxscore.teams?.[side] || {};
        const players = source.players || {};
        const get = (id) => players[`ID${id}`];

        const batters = (source.batters || [])
            .map(get)
            .filter((p) => p && p.battingOrder && p.stats?.batting && Object.keys(p.stats.batting).length > 0)
            .map((p) => {
                const s = p.stats.batting;
                const order = int(p.battingOrder);
                return {
                    id: p.person.id,
                    name: shortName(p.person.id, p.person.fullName),
                    pos: p.position?.abbreviation || '',
                    sub: order !== null && order % 100 !== 0,
                    ab: s.atBats ?? 0,
                    r: s.runs ?? 0,
                    h: s.hits ?? 0,
                    rbi: s.rbi ?? 0,
                    bb: s.baseOnBalls ?? 0,
                    k: s.strikeOuts ?? 0,
                    hr: s.homeRuns ?? 0,
                    avg: p.seasonStats?.batting?.avg ?? null
                };
            });

        const pitchers = (source.pitchers || [])
            .map(get)
            .filter((p) => p && p.stats?.pitching && Object.keys(p.stats.pitching).length > 0)
            .map((p) => {
                const s = p.stats.pitching;
                return {
                    id: p.person.id,
                    name: shortName(p.person.id, p.person.fullName),
                    note: s.note || null,
                    ip: s.inningsPitched ?? '0.0',
                    h: s.hits ?? 0,
                    r: s.runs ?? 0,
                    er: s.earnedRuns ?? 0,
                    bb: s.baseOnBalls ?? 0,
                    k: s.strikeOuts ?? 0,
                    hr: s.homeRuns ?? 0,
                    np: s.numberOfPitches ?? s.pitchesThrown ?? null,
                    st: s.strikes ?? null,
                    era: p.seasonStats?.pitching?.era ?? null
                };
            });

        const batting = source.teamStats?.batting || {};
        return {
            batters,
            pitchers,
            totals: {
                ab: batting.atBats ?? null,
                r: batting.runs ?? null,
                h: batting.hits ?? null,
                rbi: batting.rbi ?? null,
                bb: batting.baseOnBalls ?? null,
                k: batting.strikeOuts ?? null,
                hr: batting.homeRuns ?? null,
                lob: batting.leftOnBase ?? null,
                avg: batting.avg ?? null
            }
        };
    };

    const decisionsSource = liveData.decisions || {};
    const decision = (person, kind) => {
        if (!person?.id) return null;
        const season = boxPlayer(person.id)?.seasonStats?.pitching || {};
        return {
            id: person.id,
            name: person.fullName || shortName(person.id),
            wins: season.wins ?? null,
            losses: season.losses ?? null,
            saves: kind === 'save' ? season.saves ?? null : undefined,
            era: season.era ?? null
        };
    };

    const probable = (side) => {
        const person = gameData.probablePitchers?.[side];
        if (!person?.id) return null;
        const season = boxPlayer(person.id)?.seasonStats?.pitching || {};
        return {
            id: person.id,
            name: person.fullName || shortName(person.id),
            wins: season.wins ?? null,
            losses: season.losses ?? null,
            era: season.era ?? null
        };
    };

    const away = team('away');
    const home = team('home');
    const box = { away: boxTeam('away'), home: boxTeam('home') };

    // Mejores actuaciones: el mejor bateador de cada equipo y el pitcher ganador
    const topPerformers = [];
    const winner = decision(decisionsSource.winner, 'winner');
    if (winner) {
        const winnerSide = box.home.pitchers.some((p) => p.id === winner.id) ? 'home' : 'away';
        const line = box[winnerSide].pitchers.find((p) => p.id === winner.id);
        if (line) topPerformers.push({ kind: 'pitcher', teamId: winnerSide === 'home' ? home.id : away.id, ...line });
    }
    for (const side of state === 'final' && home.runs > away.runs ? ['home', 'away'] : ['away', 'home']) {
        const score = (b) => b.h + 3 * b.hr + 1.5 * b.rbi + b.r + 0.5 * b.bb;
        const best = [...box[side].batters].sort((a, b) => score(b) - score(a))[0];
        if (best && score(best) > 0) topPerformers.push({ kind: 'hitter', teamId: side === 'home' ? home.id : away.id, ...best });
    }

    return {
        gamePk: gameData.game?.pk ?? null,
        league: leagueKey,
        state,
        detailedState: gameData.status?.detailedState || '',
        reason: gameData.status?.reason || null,
        date: gameData.datetime?.dateTime || null,
        venue: gameData.venue?.name || '',
        weather: gameData.weather?.condition ? { condition: gameData.weather.condition, temp: gameData.weather.temp || null } : null,
        description: gameData.game?.description || null,
        scheduledInnings: linescore.scheduledInnings ?? 9,
        away,
        home,
        inning: linescore.currentInning
            ? {
                n: linescore.currentInning,
                ordinal: linescore.currentInningOrdinal || String(linescore.currentInning),
                isTop: !!linescore.isTopInning,
                state: linescore.inningState || (linescore.isTopInning ? 'Top' : 'Bottom')
            }
            : null,
        count: {
            balls: linescore.balls ?? 0,
            strikes: linescore.strikes ?? 0,
            outs: linescore.outs ?? 0
        },
        runners: { first: runner('first'), second: runner('second'), third: runner('third') },
        matchup,
        probables: { away: probable('away'), home: probable('home') },
        linescore: (linescore.innings || []).map((inning) => ({
            n: inning.num,
            away: inning.away?.runs ?? null,
            home: inning.home?.runs ?? null
        })),
        atBats,
        currentAtBat: currentIndex,
        box,
        decisions: {
            winner,
            loser: decision(decisionsSource.loser, 'loser'),
            save: decision(decisionsSource.save, 'save')
        },
        topPerformers,
        updatedAt: feed.metaData?.timeStamp || null
    };
};

/** Un juego del endpoint /schedule (hydrate=linescore,probablePitcher,decisions) → tarjeta del calendario. */
const transformScheduleGame = (game, leagueKey) => {
    const state = gameState(game.status);
    const linescore = game.linescore || {};
    const offense = linescore.offense || {};
    const defense = linescore.defense || {};

    const side = (key) => {
        const source = game.teams?.[key] || {};
        const id = source.team?.id;
        const name = source.team?.name || '';
        const pitcher = source.probablePitcher;
        return {
            id,
            name,
            abbrev: teamAbbrev(id, leagueKey, source.team?.abbreviation, name),
            logo: teamLogo(id),
            color: teamColor(id, leagueKey),
            flag: teamFlag(id, leagueKey),
            score: state === 'preview' ? null : source.score ?? 0,
            isWinner: !!source.isWinner,
            record: record(source.leagueRecord),
            probable: pitcher?.id ? { id: pitcher.id, name: pitcher.fullName } : null
        };
    };

    const person = (p) => (p?.id ? { id: p.id, name: p.fullName } : null);

    return {
        gamePk: game.gamePk,
        league: leagueKey,
        date: game.gameDate,
        state,
        detailedState: game.status?.detailedState || '',
        gameType: game.gameType || null,
        description: game.seriesDescription || null,
        venue: game.venue?.name || '',
        scheduledInnings: linescore.scheduledInnings ?? game.scheduledInnings ?? 9,
        inningsPlayed: linescore.innings?.length ?? null,
        away: side('away'),
        home: side('home'),
        live:
            state === 'live'
                ? {
                    inning: linescore.currentInning ?? null,
                    ordinal: linescore.currentInningOrdinal || null,
                    isTop: !!linescore.isTopInning,
                    inningState: linescore.inningState || null,
                    balls: linescore.balls ?? 0,
                    strikes: linescore.strikes ?? 0,
                    outs: linescore.outs ?? 0,
                    runners: { first: !!offense.first, second: !!offense.second, third: !!offense.third },
                    batter: person(offense.batter),
                    pitcher: person(defense.pitcher)
                }
                : null,
        decisions: game.decisions
            ? { winner: person(game.decisions.winner), loser: person(game.decisions.loser), save: person(game.decisions.save) }
            : null
    };
};

module.exports = { transformGame, transformScheduleGame, transformGameData: transformGame, gameState, classifyPitch };
