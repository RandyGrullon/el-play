// Formato de respuesta de la versión anterior de la app (rutas /api/* sin v2).
// Existe solo para que quien tenga la PWA vieja abierta durante el despliegue no vea la app rota;
// se puede borrar cuando ya nadie use el bundle anterior.

const legacyStatus = (detailedState) => detailedState || 'Scheduled';

const toLegacySchedule = (schedule) =>
    schedule.games.map((game) => ({
        gamePk: game.gamePk,
        status: legacyStatus(game.detailedState),
        date: game.date,
        venue: game.venue,
        league: game.league,
        away: { ...game.away, score: game.away.score ?? 0 },
        home: { ...game.home, score: game.home.score ?? 0 },
        liveData: game.live
            ? {
                inning: game.live.ordinal,
                isTopInning: game.live.isTop,
                balls: game.live.balls,
                strikes: game.live.strikes,
                outs: game.live.outs,
                runners: game.live.runners,
                batter: game.live.batter,
                pitcher: game.live.pitcher
            }
            : { inning: undefined, isTopInning: undefined, balls: 0, strikes: 0, outs: 0, runners: { first: false, second: false, third: false }, batter: null, pitcher: null }
    }));

const toLegacyGame = (game) => {
    const current = game.atBats.find((atBat) => atBat.i === game.currentAtBat);
    const team = (side) => ({
        id: game[side].id,
        name: game[side].name,
        abbreviation: game[side].abbrev,
        logo: game[side].logo,
        color: game[side].color,
        runs: game[side].runs,
        hits: game[side].hits,
        errors: game[side].errors,
        players: [],
        teamStats: { batting: {}, pitching: {}, fielding: {} }
    });
    const pitcherRecord = (d) => (d ? { name: d.name, record: `${d.wins ?? 0}-${d.losses ?? 0}`, era: d.era ?? '-.--' } : null);
    return {
        status: legacyStatus(game.detailedState),
        gameDate: game.date,
        venue: game.venue,
        isTopInning: !!game.inning?.isTop,
        inning: game.inning ? `${game.inning.isTop ? 'Top' : 'Bot'} ${game.inning.ordinal}` : '',
        home: team('home'),
        away: team('away'),
        count: game.count,
        runners: { first: !!game.runners.first, second: !!game.runners.second, third: !!game.runners.third },
        matchup: { pitcher: game.matchup?.pitcher.name || '', batter: game.matchup?.batter.name || '' },
        lastPlay: current?.desc || '',
        playHistory: [...game.atBats].reverse().filter((atBat) => atBat.eventLabel).map((atBat) => ({
            event: atBat.eventLabel,
            description: atBat.desc,
            inning: `${atBat.top ? 'Alta' : 'Baja'} ${atBat.inning}`
        })),
        currentPitches: (current?.pitches || [])
            .filter((pitch) => pitch.x !== null && pitch.z !== null)
            .map((pitch, index) => ({
                id: index + 1,
                coordinates: { pX: pitch.x, pZ: pitch.z },
                strikeZoneTop: pitch.top,
                strikeZoneBottom: pitch.bot,
                call: pitch.call,
                code: pitch.code,
                speed: pitch.mph,
                type: pitch.type
            })),
        innings: game.linescore.map((inning) => ({ num: inning.n, away: inning.away, home: inning.home })),
        decisions: {
            winner: pitcherRecord(game.decisions.winner),
            loser: pitcherRecord(game.decisions.loser),
            save: pitcherRecord(game.decisions.save)
        },
        topPerformers: []
    };
};

const toLegacyLeaders = (data) => {
    const labels = { homeRuns: 'HR', battingAverage: 'AVG', runsBattedIn: 'RBI', ops: 'OPS', hits: 'H', stolenBases: 'SB' };
    const result = { league: data.league };
    for (const category of data.categories) {
        if (!labels[category.id]) continue;
        result[category.id] = category.leaders.map((leader) => ({
            rank: leader.rank,
            player: leader.name,
            team: leader.teamName,
            teamId: leader.teamId,
            teamLogo: leader.logo,
            value: leader.value,
            statName: labels[category.id]
        }));
    }
    return result;
};

module.exports = { toLegacySchedule, toLegacyGame, toLegacyLeaders };
