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

// League Configurations
const LEAGUES = {
    lidom: {
        id: 'lidom',
        name: 'LIDOM',
        fullName: 'Liga Dominicana de Béisbol',
        sportId: 17,
        leagueId: 131,
        season: 2025,
        hasPhases: true // Regular, Round Robin, Final
    },
    wbc: {
        id: 'wbc',
        name: 'WBC',
        fullName: 'World Baseball Classic',
        sportId: 51,
        leagueId: 160,
        season: 2026,
        hasPhases: false // Uses pools instead
    }
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

// WBC Team Configuration (partial - will be populated from API)
const WBC_TEAMS = {
    805: { abbrev: 'DOM', name: 'Dominican Republic', color: '#002D62' },
    940: { abbrev: 'USA', name: 'United States', color: '#BF0A30' },
    843: { abbrev: 'JPN', name: 'Japan', color: '#BC002D' },
    867: { abbrev: 'MEX', name: 'Mexico', color: '#006847' },
    897: { abbrev: 'PUR', name: 'Puerto Rico', color: '#003893' },
    944: { abbrev: 'VEN', name: 'Venezuela', color: '#FFCC00' },
    798: { abbrev: 'CUB', name: 'Cuba', color: '#002A8F' },
    784: { abbrev: 'CAN', name: 'Canada', color: '#FF0000' },
    878: { abbrev: 'NED', name: 'Netherlands', color: '#FF6600' },
    1171: { abbrev: 'KOR', name: 'Korea', color: '#003478' },
    791: { abbrev: 'TPE', name: 'Chinese Taipei', color: '#000095' },
    841: { abbrev: 'ITA', name: 'Italy', color: '#009246' },
    760: { abbrev: 'AUS', name: 'Australia', color: '#00843D' },
    792: { abbrev: 'COL', name: 'Colombia', color: '#FCD116' },
    890: { abbrev: 'PAN', name: 'Panama', color: '#DA121A' },
    881: { abbrev: 'NCA', name: 'Nicaragua', color: '#0067C6' },
    821: { abbrev: 'GBR', name: 'Great Britain', color: '#00247D' },
    840: { abbrev: 'ISR', name: 'Israel', color: '#0038B8' },
    800: { abbrev: 'CZE', name: 'Czech Republic', color: '#11457E' },
    790: { abbrev: 'CHN', name: 'China', color: '#DE2910' }
};

module.exports = {
    MLB_API_BASE,
    MLB_API_BASE_V1_1,
    TTL,
    LEAGUES,
    LIDOM_TEAMS,
    WBC_TEAMS
};
