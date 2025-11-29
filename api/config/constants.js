// API Configuration
const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';
const MLB_API_BASE_V1_1 = 'https://statsapi.mlb.com/api/v1.1';

// Cache TTL (Time To Live) in seconds
const TTL = {
    GAME_LIVE: 1,       // 1 second for live game data
    SCHEDULE: 1,        // 1 second for schedule (immediate updates)
    STANDINGS: 60 * 10, // 10 minutes for standings
    LEADERS: 60 * 30    // 30 minutes for leaders
};

// LIDOM Team Configuration
const LIDOM_TEAMS = {
    667: { abbrev: 'AGU', name: 'Aguilas Cibaeñas', logo: 'https://www.mlbstatic.com/team-logos/667.svg', color: '#FDB927' }, // Yellow
    668: { abbrev: 'TOR', name: 'Toros del Este', logo: 'https://www.mlbstatic.com/team-logos/668.svg', color: '#FA4616' }, // Orange
    670: { abbrev: 'GIG', name: 'Gigantes del Cibao', logo: 'https://www.mlbstatic.com/team-logos/670.svg', color: '#aa1141' }, // Wine
    671: { abbrev: 'ESC', name: 'Leones del Escogido', logo: 'https://www.mlbstatic.com/team-logos/671.svg', color: '#E31837' }, // Red
    672: { abbrev: 'LIC', name: 'Tigres del Licey', logo: 'https://www.mlbstatic.com/team-logos/672.svg', color: '#0069e0' }, // Blue
    673: { abbrev: 'EST', name: 'Estrellas Orientales', logo: 'https://www.mlbstatic.com/team-logos/673.svg', color: '#00be66' } // Green
};

module.exports = {
    MLB_API_BASE,
    MLB_API_BASE_V1_1,
    TTL,
    LIDOM_TEAMS
};
