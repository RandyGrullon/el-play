const axios = require('axios');
const { MLB_API_BASE, MLB_API_BASE_V1_1, LIDOM_TEAMS } = require('../config/constants');
const { transformGameData } = require('../utils/transformers');

const fetchLiveGameData = async (gamePk) => {
    const response = await axios.get(`${MLB_API_BASE_V1_1}/game/${gamePk}/feed/live`);
    return transformGameData(response.data);
};

const fetchScheduleData = async (startDate, endDate) => {
    const response = await axios.get(`${MLB_API_BASE}/schedule`, {
        params: {
            sportId: 17, // Winter Leagues
            leagueId: 131, // LIDOM
            startDate,
            endDate,
            hydrate: 'linescore'
        }
    });

    const dates = response.data.dates || [];

    // Flatten and Transform
    return dates.flatMap(date => date.games)
        .filter(game => {
            const homeId = game.teams.home.team.id;
            const awayId = game.teams.away.team.id;
            return LIDOM_TEAMS[homeId] || LIDOM_TEAMS[awayId];
        })
        .map(game => {
            const homeId = game.teams.home.team.id;
            const awayId = game.teams.away.team.id;

            const linescore = game.linescore || {};
            const offense = linescore.offense || {};

            return {
                gamePk: game.gamePk,
                status: game.status.detailedState,
                date: game.gameDate,
                away: {
                    id: awayId,
                    name: game.teams.away.team.name,
                    abbrev: LIDOM_TEAMS[awayId]?.abbrev || 'UNK',
                    logo: `https://www.mlbstatic.com/team-logos/${awayId}.svg`,
                    score: game.teams.away.score || 0,
                    isWinner: game.teams.away.isWinner
                },
                home: {
                    id: homeId,
                    name: game.teams.home.team.name,
                    abbrev: LIDOM_TEAMS[homeId]?.abbrev || 'UNK',
                    logo: `https://www.mlbstatic.com/team-logos/${homeId}.svg`,
                    score: game.teams.home.score || 0,
                    isWinner: game.teams.home.isWinner
                },
                liveData: {
                    inning: linescore.currentInningOrdinal,
                    isTopInning: linescore.isTopInning,
                    balls: linescore.balls || 0,
                    strikes: linescore.strikes || 0,
                    outs: linescore.outs || 0,
                    runners: {
                        first: !!offense.first,
                        second: !!offense.second,
                        third: !!offense.third
                    }
                }
            };
        });
};

const fetchStandingsData = async () => {
    const response = await axios.get(`${MLB_API_BASE}/standings`, {
        params: {
            leagueId: 131,
            season: 2025,
            standingsTypes: 'regularSeason'
        }
    });

    if (!response.data.records || !response.data.records[0]) return [];

    return response.data.records[0].teamRecords.map(record => ({
        rank: record.rank,
        team: {
            name: record.team.name,
            id: record.team.id,
            logo: `https://www.mlbstatic.com/team-logos/${record.team.id}.svg`
        },
        wins: record.wins,
        losses: record.losses,
        pct: record.winningPercentage,
        gamesBack: record.gamesBack,
        streak: record.streak.streakCode
    }));
};

const fetchLeadersData = async () => {
    const response = await axios.get(`${MLB_API_BASE}/stats`, {
        params: {
            stats: 'season',
            group: 'hitting',
            gameType: 'R',
            leagueId: 131,
            season: 2025,
            limit: 5,
            sortStat: 'homeRuns'
        }
    });

    if (!response.data.stats || !response.data.stats[0]) return [];

    return response.data.stats[0].splits.map(split => ({
        rank: split.rank,
        player: split.player.fullName,
        team: split.team.name,
        teamId: split.team.id,
        teamLogo: `https://www.mlbstatic.com/team-logos/${split.team.id}.svg`,
        value: split.stat.homeRuns,
        statName: 'HR'
    }));
};

module.exports = {
    fetchLiveGameData,
    fetchScheduleData,
    fetchStandingsData,
    fetchLeadersData
};
