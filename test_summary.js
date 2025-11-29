const axios = require('axios');
const { transformGameData } = require('./api/utils/transformers');
const { MLB_API_BASE_V1_1 } = require('./api/config/constants');

// Game PK for a finished game (from user request: 826254)
const GAME_PK = 826254;

const testGameSummaryData = async () => {
    try {
        console.log(`Fetching data for game ${GAME_PK}...`);
        const response = await axios.get(`${MLB_API_BASE_V1_1}/game/${GAME_PK}/feed/live`);

        console.log('GameData Status:', JSON.stringify(response.data.gameData.status, null, 2));
        console.log('LiveData Keys:', Object.keys(response.data.liveData));

        if (response.data.liveData.decisions) {
            console.log('Decisions found in liveData');
        } else {
            console.log('Decisions NOT found in liveData');
        }

        console.log('Transforming data...');
        const gameData = transformGameData(response.data);

        console.log('--- Game Summary Data Verification ---');
        console.log('Status:', gameData.status);

        console.log('\nDecisions:');
        console.log(JSON.stringify(gameData.decisions, null, 2));

        console.log('\nTop Performers:');
        console.log(JSON.stringify(gameData.topPerformers, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
};

testGameSummaryData();
