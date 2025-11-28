const express = require('express');
const router = express.Router();

const { getGameData } = require('../controllers/gameController');
const { getSchedule } = require('../controllers/scheduleController');
const { getStandings, getLeaders } = require('../controllers/statsController');

router.get('/game/:gamePk', getGameData);
router.get('/schedule', getSchedule);
router.get('/standings', getStandings);
router.get('/leaders', getLeaders);

module.exports = router;
