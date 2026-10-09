const { MLB_API_BASE, LEAGUES, TTL } = require('../config/constants');
const http = require('./http');
const { cached } = require('../utils/cache');

// Respaldo si /league/{id} falla. LIDOM cuenta la temporada por el año en que empieza (oct-ene → "2025" = 2025-26).
const fallbackSeason = (leagueKey, now = new Date()) => {
    const league = LEAGUES[leagueKey] || LEAGUES.lidom;
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0 = enero
    if (leagueKey === 'lidom') return month >= 8 ? year : year - 1;
    return league.season;
};

/**
 * Temporada vigente de la liga según MLB (antes estaba fija en el código).
 * @returns {Promise<{ season: number, regularSeasonGames: number | null }>}
 */
const getSeasonInfo = (leagueKey) => {
    const league = LEAGUES[leagueKey] || LEAGUES.lidom;
    return cached(`season_${league.id}`, (info) => (info.fromApi ? TTL.SEASON[0] : 300), async () => {
        try {
            const data = await http.mlbGet(`${MLB_API_BASE}/league/${league.leagueId}`);
            const info = data?.leagues?.[0];
            const season = parseInt(info?.season ?? info?.seasonDateInfo?.seasonId, 10);
            if (season) {
                return { season, regularSeasonGames: info?.numGames || league.regularSeasonGames || null, fromApi: true };
            }
        } catch (error) {
            console.warn(`[season] /league/${league.leagueId} falló: ${error.message}`);
        }
        return { season: fallbackSeason(league.id), regularSeasonGames: league.regularSeasonGames || null, fromApi: false };
    });
};

module.exports = { getSeasonInfo, fallbackSeason };
