const axios = require('axios');
const { MLB_API_BASE, MLB_API_BASE_V1_1, LEAGUES, LIDOM_TEAMS, WBC_TEAMS, SDC_TEAMS } = require('../config/constants');
const { transformGameData } = require('../utils/transformers');

// Helper to get team config based on league
const getTeamConfig = (leagueId) => {
    if (leagueId === 'wbc' || leagueId === 160) return WBC_TEAMS;
    if (leagueId === 'sdc' || leagueId === 162) return SDC_TEAMS;
    return LIDOM_TEAMS;
};

// Generate a consistent color based on team ID for international teams
// Uses a set of vibrant, distinguishable colors
const COUNTRY_COLORS = [
    '#ef4444', // red-500
    '#f97316', // orange-500
    '#f59e0b', // amber-500
    '#eab308', // yellow-500
    '#84cc16', // lime-500
    '#22c55e', // green-500
    '#10b981', // emerald-500
    '#14b8a6', // teal-500
    '#06b6d4', // cyan-500
    '#0ea5e9', // sky-500
    '#3b82f6', // blue-500
    '#6366f1', // indigo-500
    '#8b5cf6', // violet-500
    '#a855f7', // purple-500
    '#d946ef', // fuchsia-500
    '#ec4899', // pink-500
    '#f43f5e', // rose-500
    '#78716c', // stone-500
];

const getRandomColorForTeam = (teamId) => {
    // Use team ID to get a consistent index
    const index = teamId % COUNTRY_COLORS.length;
    return COUNTRY_COLORS[index];
};

const fetchLiveGameData = async (gamePk) => {
    const response = await axios.get(`${MLB_API_BASE_V1_1}/game/${gamePk}/feed/live`);
    return transformGameData(response.data);
};

const fetchScheduleData = async (startDate, endDate, leagueId = 'lidom') => {
    const league = LEAGUES[leagueId] || LEAGUES.lidom;
    const teamsConfig = getTeamConfig(leagueId);
    
    const response = await axios.get(`${MLB_API_BASE}/schedule`, {
        params: {
            sportId: league.sportId,
            leagueId: league.leagueId,
            startDate,
            endDate,
            hydrate: 'linescore'
        }
    });

    const dates = response.data.dates || [];

    // Flatten games
    let games = dates.flatMap(date => date.games);
    
    // For WBC, filter only official tournament games (F=Pool Play, S=Second Round, W=Final)
    // Exclude exhibition games (E) which are spring training matchups vs MLB teams
    if (leagueId === 'wbc') {
        games = games.filter(game => ['F', 'S', 'W', 'R'].includes(game.gameType));
    }

    // Transform
    return games.map(game => {
            const homeId = game.teams.home.team.id;
            const awayId = game.teams.away.team.id;

            const linescore = game.linescore || {};
            const offense = linescore.offense || {};
            const defense = linescore.defense || {};

            // For WBC, use team abbreviation from API if not in our config
            const getTeamAbbrev = (teamId, teamName) => {
                if (teamsConfig[teamId]) return teamsConfig[teamId].abbrev;
                // Extract 3-letter code from team name for WBC
                return teamName.substring(0, 3).toUpperCase();
            };

            const getTeamColor = (teamId) => {
                // First check if we have a configured color
                if (teamsConfig[teamId]?.color) {
                    return teamsConfig[teamId].color;
                }
                // For WBC and SDC (international tournaments), generate a consistent random color
                if (leagueId === 'wbc' || leagueId === 'sdc' || leagueId === 160 || leagueId === 162) {
                    return getRandomColorForTeam(teamId);
                }
                return '#ffffff';
            };

            return {
                gamePk: game.gamePk,
                status: game.status.detailedState,
                date: game.gameDate,
                venue: game.venue.name,
                away: {
                    id: awayId,
                    name: game.teams.away.team.name,
                    abbrev: getTeamAbbrev(awayId, game.teams.away.team.name),
                    logo: `https://www.mlbstatic.com/team-logos/${awayId}.svg`,
                    color: getTeamColor(awayId),
                    score: game.teams.away.score || 0,
                    isWinner: game.teams.away.isWinner
                },
                home: {
                    id: homeId,
                    name: game.teams.home.team.name,
                    abbrev: getTeamAbbrev(homeId, game.teams.home.team.name),
                    logo: `https://www.mlbstatic.com/team-logos/${homeId}.svg`,
                    color: getTeamColor(homeId),
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
                    },
                    batter: offense.batter ? {
                        id: offense.batter.id,
                        name: offense.batter.fullName
                    } : null,
                    pitcher: defense.pitcher ? {
                        id: defense.pitcher.id,
                        name: defense.pitcher.fullName
                    } : null
                },
                league: leagueId
            };
        });
};

const fetchStandingsData = async (leagueId = 'lidom') => {
    const league = LEAGUES[leagueId] || LEAGUES.lidom;
    
    // For WBC and Serie del Caribe, fetch pool standings differently
    if (leagueId === 'wbc') {
        return fetchWBCStandings(league);
    }
    
    if (leagueId === 'sdc') {
        return fetchSDCStandings(league);
    }
    
    // LIDOM: Fetch regular season, postseason (round robin) standings and final series schedule
    const [regularResponse, postseasonResponse, finalSeriesResponse] = await Promise.all([
        axios.get(`${MLB_API_BASE}/standings`, {
            params: {
                leagueId: league.leagueId,
                season: league.season,
                standingsTypes: 'regularSeason'
            }
        }),
        axios.get(`${MLB_API_BASE}/standings`, {
            params: {
                leagueId: league.leagueId,
                season: league.season,
                standingsTypes: 'postseason'
            }
        }),
        // Get final series games (gameType W = World Series / Final)
        axios.get(`${MLB_API_BASE}/schedule`, {
            params: {
                sportId: league.sportId,
                leagueId: league.leagueId,
                season: league.season,
                gameTypes: 'W'
            }
        })
    ]);

    const transformRecords = (records) => {
        if (!records || !records[0]) return [];
        return records[0].teamRecords.map(record => ({
            rank: record.rank || record.leagueRank,
            team: {
                name: record.team.name,
                id: record.team.id,
                logo: `https://www.mlbstatic.com/team-logos/${record.team.id}.svg`
            },
            wins: record.wins,
            losses: record.losses,
            gamesPlayed: record.gamesPlayed || (record.wins + record.losses),
            pct: record.winningPercentage,
            gamesBack: record.gamesBack,
            streak: record.streak?.streakCode || '-'
        }));
    };

    const regularStandings = transformRecords(regularResponse.data.records);
    const roundRobinStandings = transformRecords(postseasonResponse.data.records);

    // Check if round robin info exists in postseason response
    const roundRobinInfo = postseasonResponse.data.records?.[0]?.roundRobin || null;

    // Build final series standings from W games
    const finalGames = finalSeriesResponse.data.dates?.flatMap(d => d.games) || [];
    let finalStandings = [];
    
    if (finalGames.length > 0) {
        // Get unique teams from final series games
        const teamsMap = new Map();
        
        finalGames.forEach(game => {
            const homeTeam = game.teams.home;
            const awayTeam = game.teams.away;
            
            if (!teamsMap.has(homeTeam.team.id)) {
                teamsMap.set(homeTeam.team.id, {
                    team: {
                        name: homeTeam.team.name,
                        id: homeTeam.team.id,
                        logo: `https://www.mlbstatic.com/team-logos/${homeTeam.team.id}.svg`
                    },
                    wins: homeTeam.leagueRecord?.wins || 0,
                    losses: homeTeam.leagueRecord?.losses || 0,
                    gamesPlayed: (homeTeam.leagueRecord?.wins || 0) + (homeTeam.leagueRecord?.losses || 0),
                    pct: homeTeam.leagueRecord?.pct || '.000',
                    gamesBack: '-',
                    streak: '-'
                });
            } else {
                const existing = teamsMap.get(homeTeam.team.id);
                existing.wins = Math.max(existing.wins, homeTeam.leagueRecord?.wins || 0);
                existing.losses = Math.max(existing.losses, homeTeam.leagueRecord?.losses || 0);
                existing.gamesPlayed = existing.wins + existing.losses;
                existing.pct = homeTeam.leagueRecord?.pct || existing.pct;
            }
            
            if (!teamsMap.has(awayTeam.team.id)) {
                teamsMap.set(awayTeam.team.id, {
                    team: {
                        name: awayTeam.team.name,
                        id: awayTeam.team.id,
                        logo: `https://www.mlbstatic.com/team-logos/${awayTeam.team.id}.svg`
                    },
                    wins: awayTeam.leagueRecord?.wins || 0,
                    losses: awayTeam.leagueRecord?.losses || 0,
                    gamesPlayed: (awayTeam.leagueRecord?.wins || 0) + (awayTeam.leagueRecord?.losses || 0),
                    pct: awayTeam.leagueRecord?.pct || '.000',
                    gamesBack: '-',
                    streak: '-'
                });
            } else {
                const existing = teamsMap.get(awayTeam.team.id);
                existing.wins = Math.max(existing.wins, awayTeam.leagueRecord?.wins || 0);
                existing.losses = Math.max(existing.losses, awayTeam.leagueRecord?.losses || 0);
                existing.gamesPlayed = existing.wins + existing.losses;
                existing.pct = awayTeam.leagueRecord?.pct || existing.pct;
            }
        });
        
        finalStandings = Array.from(teamsMap.values())
            .map((team, idx) => ({ ...team, rank: idx + 1 }))
            .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
        
        // Update ranks after sorting
        finalStandings.forEach((team, idx) => team.rank = idx + 1);
    }

    // Determine which phase is currently active based on game progress
    let activePhase = 'regular';
    
    // Check if we have final series games (gameType W) - highest priority
    const hasStartedFinalSeries = finalGames.some(game => 
        game.status?.abstractGameState === 'Final' || 
        game.status?.abstractGameState === 'Live'
    );
    
    if (hasStartedFinalSeries) {
        // Final series has started
        activePhase = 'final';
    } else if (roundRobinStandings.length > 0) {
        // Check if Round Robin has started by looking at games played
        const roundRobinGamesPlayed = roundRobinStandings[0]?.wins + roundRobinStandings[0]?.losses || 0;
        
        if (roundRobinGamesPlayed > 0) {
            // Round Robin has games, check if it's complete (18 games each team)
            const roundRobinComplete = roundRobinStandings.every(team => 
                (team.wins + team.losses) >= 18
            );
            
            // Check if 2 teams have qualified for final (more wins than losses after 18 games)
            const qualifiedTeams = roundRobinStandings.filter(team => 
                (team.wins + team.losses) >= 18 && team.wins > team.losses
            );
            
            if (roundRobinComplete && qualifiedTeams.length >= 2 && finalGames.length > 0) {
                activePhase = 'final';
            } else {
                activePhase = 'roundRobin';
            }
        } else {
            // Round Robin hasn't started yet, check regular season
            // Regular season is 50 games per team
            const regularGamesPlayed = regularStandings[0]?.wins + regularStandings[0]?.losses || 0;
            if (regularGamesPlayed >= 50) {
                // Regular season complete, Round Robin should start
                activePhase = 'roundRobin';
            } else {
                activePhase = 'regular';
            }
        }
    } else {
        // No Round Robin data, we're in regular season
        activePhase = 'regular';
    }

    return {
        regular: regularStandings,
        roundRobin: roundRobinStandings,
        final: finalStandings,
        activePhase,
        roundRobinInfo
    };
};

// WBC Standings - organized by pools
const fetchWBCStandings = async (league) => {
    try {
        const response = await axios.get(`${MLB_API_BASE}/standings`, {
            params: {
                leagueId: league.leagueId,
                season: league.season,
                standingsTypes: 'regularSeason'
            }
        });

        const records = response.data.records || [];
        const pools = {};
        
        records.forEach(record => {
            const divisionName = record.division?.name || 'Pool';
            if (!pools[divisionName]) {
                pools[divisionName] = [];
            }
            
            record.teamRecords?.forEach(teamRecord => {
                pools[divisionName].push({
                    rank: teamRecord.rank || teamRecord.divisionRank,
                    team: {
                        name: teamRecord.team.name,
                        id: teamRecord.team.id,
                        logo: `https://www.mlbstatic.com/team-logos/${teamRecord.team.id}.svg`
                    },
                    wins: teamRecord.wins,
                    losses: teamRecord.losses,
                    gamesPlayed: teamRecord.gamesPlayed || (teamRecord.wins + teamRecord.losses),
                    pct: teamRecord.winningPercentage,
                    gamesBack: teamRecord.gamesBack || '-',
                    streak: teamRecord.streak?.streakCode || '-'
                });
            });
        });

        // Sort each pool by rank
        Object.keys(pools).forEach(poolName => {
            pools[poolName].sort((a, b) => a.rank - b.rank);
        });

        return {
            pools,
            type: 'wbc',
            league: 'wbc'
        };
    } catch (error) {
        console.error('Error fetching WBC standings:', error);
        return { pools: {}, type: 'wbc', league: 'wbc' };
    }
};

// Serie del Caribe Standings - tournament format
const fetchSDCStandings = async (league) => {
    try {
        const response = await axios.get(`${MLB_API_BASE}/standings`, {
            params: {
                leagueId: league.leagueId,
                season: league.season,
                standingsTypes: 'regularSeason'
            }
        });

        const records = response.data.records || [];
        const teams = [];
        
        records.forEach(record => {
            record.teamRecords?.forEach(teamRecord => {
                teams.push({
                    rank: teamRecord.rank || teamRecord.leagueRank,
                    team: {
                        name: teamRecord.team.name,
                        id: teamRecord.team.id,
                        logo: `https://www.mlbstatic.com/team-logos/${teamRecord.team.id}.svg`
                    },
                    wins: teamRecord.wins,
                    losses: teamRecord.losses,
                    gamesPlayed: teamRecord.gamesPlayed || (teamRecord.wins + teamRecord.losses),
                    pct: teamRecord.winningPercentage,
                    gamesBack: teamRecord.gamesBack || '-',
                    streak: teamRecord.streak?.streakCode || '-'
                });
            });
        });

        // Sort by wins (descending), then by losses (ascending)
        teams.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
        
        // Update ranks after sorting
        teams.forEach((team, idx) => team.rank = idx + 1);

        return {
            teams,
            type: 'sdc',
            league: 'sdc'
        };
    } catch (error) {
        console.error('Error fetching Serie del Caribe standings:', error);
        return { teams: [], type: 'sdc', league: 'sdc' };
    }
};

const fetchLeadersData = async (leagueId = 'lidom') => {
    const league = LEAGUES[leagueId] || LEAGUES.lidom;
    
    const statsToFetch = [
        { stat: 'homeRuns', label: 'HR', sortStat: 'homeRuns' },
        { stat: 'avg', label: 'AVG', sortStat: 'battingAverage' },
        { stat: 'rbi', label: 'RBI', sortStat: 'runsBattedIn' },
        { stat: 'ops', label: 'OPS', sortStat: 'ops' },
        { stat: 'hits', label: 'H', sortStat: 'hits' },
        { stat: 'stolenBases', label: 'SB', sortStat: 'stolenBases' }
    ];

    const promises = statsToFetch.map(async ({ stat, label, sortStat }) => {
        try {
            const response = await axios.get(`${MLB_API_BASE}/stats`, {
                params: {
                    stats: 'season',
                    group: 'hitting',
                    gameType: 'R',
                    leagueId: league.leagueId,
                    season: league.season,
                    limit: 5,
                    sortStat: sortStat
                }
            });

            if (!response.data.stats || !response.data.stats[0]) return [];

            return response.data.stats[0].splits.map(split => ({
                rank: split.rank,
                player: split.player.fullName,
                team: split.team.name,
                teamId: split.team.id,
                teamLogo: `https://www.mlbstatic.com/team-logos/${split.team.id}.svg`,
                value: split.stat[stat],
                statName: label
            }));
        } catch (error) {
            console.error(`Error fetching leaders for ${stat}:`, error);
            return [];
        }
    });

    const [homeRuns, battingAverage, runsBattedIn, ops, hits, stolenBases] = await Promise.all(promises);

    return {
        homeRuns,
        battingAverage,
        runsBattedIn,
        ops,
        hits,
        stolenBases,
        league: leagueId
    };
};

module.exports = {
    fetchLiveGameData,
    fetchScheduleData,
    fetchStandingsData,
    fetchLeadersData
};
