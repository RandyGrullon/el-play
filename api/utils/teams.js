const { LIDOM_TEAMS, WBC_TEAMS, SDC_TEAMS } = require('../config/constants');

// Colores distinguibles para selecciones sin color configurado (WBC / Serie del Caribe)
const COUNTRY_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
    '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#78716c'
];

const INTERNATIONAL_LEAGUES = new Set([160, 162, 'wbc', 'sdc']);

const configFor = (leagueKey) => {
    if (leagueKey === 'wbc' || leagueKey === 160) return WBC_TEAMS;
    if (leagueKey === 'sdc' || leagueKey === 162) return SDC_TEAMS;
    return LIDOM_TEAMS;
};

const findTeam = (teamId, leagueKey) =>
    configFor(leagueKey)[teamId] || LIDOM_TEAMS[teamId] || WBC_TEAMS[teamId] || SDC_TEAMS[teamId] || null;

const teamLogo = (teamId) => `https://www.mlbstatic.com/team-logos/${teamId}.svg`;

const teamColor = (teamId, leagueKey) => {
    const config = findTeam(teamId, leagueKey);
    if (config?.color) return config.color;
    if (INTERNATIONAL_LEAGUES.has(leagueKey)) return COUNTRY_COLORS[teamId % COUNTRY_COLORS.length];
    return '#64748b';
};

/** Segundo color del uniforme (detalles, guantes, medias); null si no está configurado */
const teamColor2 = (teamId, leagueKey) => findTeam(teamId, leagueKey)?.color2 || null;

const teamAbbrev = (teamId, leagueKey, apiAbbrev, name = '') => {
    const config = findTeam(teamId, leagueKey);
    if (config?.abbrev) return config.abbrev;
    if (apiAbbrev) return apiAbbrev;
    return name.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').slice(0, 3).toUpperCase();
};

const teamFlag = (teamId, leagueKey) => findTeam(teamId, leagueKey)?.flag || null;

module.exports = { teamLogo, teamColor, teamColor2, teamAbbrev, teamFlag, findTeam };
