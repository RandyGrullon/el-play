/**
 * Transform raw MLB Game Data into clean app format
 */
const transformGameData = (data) => {
    const linescore = data.liveData.linescore;
    const boxscore = data.liveData.boxscore;
    const plays = data.liveData.plays;
    const gameStatus = data.gameData.status.detailedState;

    const getTeamInfo = (teamType) => {
        const teamData = boxscore.teams[teamType];
        const teamId = teamData.team.id;
        return {
            id: teamId,
            name: teamData.team.name,
            abbreviation: teamData.team.abbreviation,
            logo: `https://www.mlbstatic.com/team-logos/${teamId}.svg`,
            runs: linescore.teams[teamType].runs || 0,
            hits: linescore.teams[teamType].hits || 0,
            errors: linescore.teams[teamType].errors || 0,
        };
    };

    const innings = linescore.innings ? linescore.innings.map(inn => ({
        num: inn.num,
        away: inn.away.runs,
        home: inn.home.runs
    })) : [];

    return {
        status: gameStatus,
        inning: `${linescore.isTopInning ? 'Top' : 'Bot'} ${linescore.currentInningOrdinal || ''}`,
        home: getTeamInfo('home'),
        away: getTeamInfo('away'),
        count: {
            balls: linescore.balls || 0,
            strikes: linescore.strikes || 0,
            outs: linescore.outs || 0
        },
        runners: {
            first: !!linescore.offense?.first,
            second: !!linescore.offense?.second,
            third: !!linescore.offense?.third,
        },
        matchup: {
            pitcher: linescore.defense?.pitcher ? linescore.defense.pitcher.fullName : 'Unknown',
            batter: linescore.offense?.batter ? linescore.offense.batter.fullName : 'Unknown'
        },
        lastPlay: plays.currentPlay ? plays.currentPlay.result.description : 'No plays yet',
        innings
    };
};

module.exports = {
    transformGameData
};
