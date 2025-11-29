const { LIDOM_TEAMS } = require('../config/constants');
const { GameDataSchema } = require('../schemas/mlb');

/**
 * Transform raw MLB Game Data into clean app format
 */
const transformGameData = (data) => {
    // Validate incoming data
    const validation = GameDataSchema.safeParse(data);
    if (!validation.success) {
        console.error('Validation Error:', JSON.stringify(validation.error.format(), null, 2));
        // In production, we might want to throw or return a partial object.
        // For now, let's throw to be caught by the global error handler.
        throw new Error('Invalid Game Data received from MLB API');
    }

    const { gameData, liveData } = validation.data;
    const linescore = liveData.linescore;
    const boxscore = liveData.boxscore;
    const plays = liveData.plays;
    const gameStatus = gameData.status.detailedState;

    const getTeamInfo = (teamType) => {
        const teamData = boxscore.teams[teamType];
        const teamId = teamData.team.id;
        const lidomTeam = LIDOM_TEAMS[teamId] || LIDOM_TEAMS[String(teamId)] || {};

        // Extract players
        const players = Object.values(teamData.players)
            .filter(p => p.person.id) // Ensure valid player
            .map(p => ({
                id: p.person.id,
                name: p.person.fullName,
                position: p.position.abbreviation,
                battingOrder: p.battingOrder,
                stats: {
                    batting: p.stats.batting || {},
                    pitching: p.stats.pitching || {}
                }
            }))
            .sort((a, b) => {
                // Sort by batting order if available, otherwise by name
                if (a.battingOrder && b.battingOrder) return parseInt(a.battingOrder) - parseInt(b.battingOrder);
                return 0;
            });

        return {
            id: teamId,
            name: teamData.team.name,
            abbreviation: teamData.team.abbreviation,
            logo: `https://www.mlbstatic.com/team-logos/${teamId}.svg`,
            color: lidomTeam.color || '#000000', // Default to black if not found
            runs: linescore.teams[teamType].runs || 0,
            hits: linescore.teams[teamType].hits || 0,
            errors: linescore.teams[teamType].errors || 0,
            players: players
        };
    };

    const innings = linescore.innings ? linescore.innings.map(inn => ({
        num: inn.num,
        away: inn.away.runs,
        home: inn.home.runs
    })) : [];

    const currentPlay = plays.currentPlay;
    let currentPitches = [];

    if (currentPlay && currentPlay.playEvents && currentPlay.playEvents.length > 0) {
        const pitchEvents = currentPlay.playEvents.filter(e => e.isPitch);
        currentPitches = pitchEvents.map((event, index) => {
            if (event.pitchData) {
                return {
                    id: index + 1,
                    coordinates: {
                        pX: event.pitchData.coordinates.pX,
                        pZ: event.pitchData.coordinates.pZ
                    },
                    strikeZoneTop: event.pitchData.strikeZoneTop,
                    strikeZoneBottom: event.pitchData.strikeZoneBottom,
                    call: event.details.description,
                    code: event.details.code, // B, S, X, etc.
                    speed: event.pitchData.startSpeed,
                    type: event.details.type ? event.details.type.code : null
                };
            }
            return null;
        }).filter(p => p !== null);
    }

    const translateEvent = (event) => {
        const translations = {
            'Strikeout': 'Ponche',
            'Walk': 'Base por Bolas',
            'Home Run': 'Cuadrangular',
            'Single': 'Sencillo',
            'Double': 'Doble',
            'Triple': 'Triple',
            'Groundout': 'Rodado de Out',
            'Flyout': 'Elevado de Out',
            'Lineout': 'Línea de Out',
            'Pop Out': 'Elevado al Cuadro',
            'Forceout': 'Out Forzado',
            'Sac Fly': 'Elevado de Sacrificio',
            'Sac Bunt': 'Toque de Sacrificio',
            'Hit By Pitch': 'Golpeado',
            'Field Error': 'Error',
            'Game Advisory': 'Aviso',
            'Stolen Base 2B': 'Robo de 2da',
            'Stolen Base 3B': 'Robo de 3ra',
            'Caught Stealing 2B': 'Atrapado Robando 2da',
            'Wild Pitch': 'Lanzamiento Descontrolado',
            'Passed Ball': 'Pasbol',
            'Pickoff 1B': 'Revire a 1ra',
            'Pickoff 2B': 'Revire a 2da',
            'Defensive Indiff': 'Indiferencia Defensiva'
        };
        return translations[event] || event;
    };

    const translateDescription = (desc) => {
        if (!desc) return '';
        let translated = desc;

        // Basic replacements
        translated = translated.replace(/strikes out/g, 'se poncha');
        translated = translated.replace(/walks/g, 'recibe base por bolas');
        translated = translated.replace(/homers/g, 'conecta cuadrangular');
        translated = translated.replace(/singles/g, 'conecta sencillo');
        translated = translated.replace(/doubles/g, 'conecta doble');
        translated = translated.replace(/triples/g, 'conecta triple');
        translated = translated.replace(/grounds out/g, 'falla con rodado');
        translated = translated.replace(/flies out/g, 'falla con elevado');
        translated = translated.replace(/lines out/g, 'falla con línea');
        translated = translated.replace(/pops out/g, 'falla con elevado al cuadro');
        translated = translated.replace(/to pitcher/g, 'al lanzador');
        translated = translated.replace(/to catcher/g, 'al receptor');
        translated = translated.replace(/to first base/g, 'a primera base');
        translated = translated.replace(/to second base/g, 'a segunda base');
        translated = translated.replace(/to third base/g, 'a tercera base');
        translated = translated.replace(/to shortstop/g, 'al campocorto');
        translated = translated.replace(/to left field/g, 'al jardín izquierdo');
        translated = translated.replace(/to center field/g, 'al jardín central');
        translated = translated.replace(/to right field/g, 'al jardín derecho');
        translated = translated.replace(/swinging/g, 'tirándole');
        translated = translated.replace(/called out on strikes/g, 'ponchado mirando');

        return translated;
    };

    // Get ALL plays, reverse to show newest first
    const playHistory = plays.allPlays ? plays.allPlays.slice().reverse().map(play => ({
        event: translateEvent(play.result.event),
        description: translateDescription(play.result.description),
        inning: `${play.about.isTopInning ? 'Alta' : 'Baja'} ${play.about.inning}`,
        time: play.about.startTime
    })) : [];

    return {
        status: gameStatus,
        gameDate: data.gameData.datetime.dateTime,
        isTopInning: linescore.isTopInning,
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
        playHistory,
        currentPitches,
        innings
    };
};

module.exports = {
    transformGameData
};
