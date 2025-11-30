const axios = require('axios');
const { fetchScheduleData, fetchLiveGameData } = require('./api/services/mlbService');
const fs = require('fs');

async function verifyData() {
    console.log('--- Verifying Schedule Data ---');
    try {
        // Fetch schedule for a range of dates, e.g., today and tomorrow
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const startDate = today.toISOString().split('T')[0];
        const endDate = tomorrow.toISOString().split('T')[0];

        const output = {};
        console.log(`Fetching schedule from ${startDate} to ${endDate}...`);
        const schedule = await fetchScheduleData(startDate, endDate);

        console.log(`Found ${schedule.length} games.`);
        if (schedule.length > 0) {
            const sampleGame = schedule[0];
            output.scheduleSample = sampleGame;

            // Now verify game detail for this game
            console.log('\n--- Verifying Game Detail Data ---');
            console.log(`Fetching details for gamePk: ${sampleGame.gamePk}...`);
            const gameDetail = await fetchLiveGameData(sampleGame.gamePk);
            output.gameDetailSample = gameDetail;
        } else {
            console.log('No games found in schedule to verify details.');
            output.message = "No games found";
        }

        fs.writeFileSync('verification_output.json', JSON.stringify(output, null, 2));
        console.log('Verification data written to verification_output.json');

    } catch (error) {
        console.error('Error verifying data:', error);
    }
}

verifyData();
