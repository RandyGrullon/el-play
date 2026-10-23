const { cached } = require('../utils/cache');
const { fetchPlayers, fetchPlayer, fetchPlayerPitches, fetchTransactions } = require('../services/players');
const { fetchGame } = require('../services/mlbService');
const { fetchTeamStats } = require('../services/teamStats');
const { LEAGUES, isLeague } = require('../config/constants');

const leagueFrom = (req) => (isLeague(req.query.league) ? req.query.league : 'lidom');
const seasonFrom = (req) => (typeof req.query.season === 'string' && /^\d{4}$/.test(req.query.season) ? Number(req.query.season) : undefined);

// Temporada vigente: cambia con cada juego (5 min); una pasada ya no cambia
const ttlOf = (data) => (data.season === data.currentSeason ? 300 : 6 * 3600);
const setCache = (res, seconds) => res.set('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`);

const getPlayers = async (req, res, next) => {
    try {
        if (req.query.season && !seasonFrom(req)) return res.status(400).json({ error: 'invalid_season' });
        const league = leagueFrom(req);
        const season = seasonFrom(req);
        const data = await cached(`players_${league}_${season || 'actual'}`, ttlOf, () => fetchPlayers(league, season), { staleSec: 3600 });
        setCache(res, ttlOf(data));
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getPlayer = async (req, res, next) => {
    try {
        if (!/^\d{1,9}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_player' });
        if (req.query.season && !seasonFrom(req)) return res.status(400).json({ error: 'invalid_season' });
        const league = leagueFrom(req);
        const season = seasonFrom(req);
        const data = await cached(`player_${league}_${req.params.id}_${season || 'actual'}`, ttlOf, () => fetchPlayer(league, Number(req.params.id), season), { staleSec: 3600 });
        setCache(res, ttlOf(data));
        res.json(data);
    } catch (error) {
        next(error);
    }
};

// Pitcheos de sus últimos juegos (batazos, zonas y repertorio): cambian con cada juego terminado
const getPlayerPitches = async (req, res, next) => {
    try {
        if (!/^\d{1,9}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid_player' });
        if (req.query.season && !seasonFrom(req)) return res.status(400).json({ error: 'invalid_season' });
        const league = leagueFrom(req);
        const season = seasonFrom(req);
        const data = await cached(`player_pitches_${league}_${req.params.id}_${season || 'actual'}`, 1800, () => fetchPlayerPitches(league, Number(req.params.id), season, fetchGame), { staleSec: 3600 });
        setCache(res, 1800);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

// Movimientos de los equipos (30 días)
const getTransactions = async (req, res, next) => {
    try {
        const league = leagueFrom(req);
        const data = await cached(`transactions_${league}`, 1800, () => fetchTransactions(league), { staleSec: 3600 });
        setCache(res, 1800);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

// Estadísticas colectivas de bateo y pitcheo de cada equipo
const getTeamStats = async (req, res, next) => {
    try {
        if (req.query.season && !seasonFrom(req)) return res.status(400).json({ error: 'invalid_season' });
        const league = leagueFrom(req);
        const season = seasonFrom(req);
        const data = await cached(`team_stats_${league}_${season || 'actual'}`, ttlOf, () => fetchTeamStats(league, season), { staleSec: 3600 });
        setCache(res, ttlOf(data));
        res.json(data);
    } catch (error) {
        next(error);
    }
};

module.exports = { getPlayers, getPlayer, getPlayerPitches, getTeamStats, getTransactions };
