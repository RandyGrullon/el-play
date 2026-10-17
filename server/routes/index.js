const express = require('express');
const router = express.Router();

const { getGame, getGameData } = require('../controllers/gameController');
const { getSchedule, getScheduleV2 } = require('../controllers/scheduleController');
const { getStandings, getLeaders, getLeadersV2 } = require('../controllers/statsController');
const { getPhotos, getPhoto } = require('../controllers/photoController');
const { getFantasyDay } = require('../controllers/fantasyController');

// v2: formato actual de la app
router.get('/v2/game/:gamePk', getGame);
router.get('/v2/schedule', getScheduleV2);
router.get('/v2/standings', getStandings);
router.get('/v2/leaders', getLeadersV2);
router.get('/v2/photos', getPhotos);
router.get('/v2/photos/:teamId/:file', getPhoto);
router.get('/v2/fantasy', getFantasyDay);

// v1: formato anterior (PWA vieja abierta durante el despliegue)
router.get('/game/:gamePk', getGameData);
router.get('/schedule', getSchedule);
router.get('/standings', getStandings);
router.get('/leaders', getLeaders);

module.exports = router;
