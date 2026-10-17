const express = require('express');
const router = express.Router();
const { LEAGUES } = require('../config/constants');

const { getGame, getGameData } = require('../controllers/gameController');
const { getSchedule, getScheduleV2 } = require('../controllers/scheduleController');
const { getStandings, getLeaders, getLeadersV2 } = require('../controllers/statsController');
const { getPhotos, getPhoto } = require('../controllers/photoController');
const { getFantasyDay, getFantasyFan, getFantasySeason } = require('../controllers/fantasyController');
const { getPlayers, getPlayer } = require('../controllers/playersController');

// Una liga que no existe es un error (antes se respondía LIDOM sin avisar); sin `league` sigue siendo LIDOM
router.use((req, res, next) => (req.query.league && !LEAGUES[req.query.league] ? res.status(400).json({ error: 'invalid_league' }) : next()));

// v2: formato actual de la app
router.get('/v2/game/:gamePk', getGame);
router.get('/v2/schedule', getScheduleV2);
router.get('/v2/standings', getStandings);
router.get('/v2/leaders', getLeadersV2);
router.get('/v2/photos', getPhotos);
router.get('/v2/photos/:teamId/:file', getPhoto);
router.get('/v2/fantasy/fan/:userId', getFantasyFan);
router.get('/v2/fantasy/season', getFantasySeason);
router.get('/v2/fantasy', getFantasyDay);
router.get('/v2/players', getPlayers);
router.get('/v2/player/:id', getPlayer);

// v1: formato anterior (PWA vieja abierta durante el despliegue)
router.get('/game/:gamePk', getGameData);
router.get('/schedule', getSchedule);
router.get('/standings', getStandings);
router.get('/leaders', getLeaders);

module.exports = router;
