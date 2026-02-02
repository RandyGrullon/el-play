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
    },
    sdc: {
        id: 'sdc',
        name: 'SDC',
        fullName: 'Serie del Caribe',
        sportId: 17,
        leagueId: 162,
        season: 2026,
        hasPhases: false // Tournament format
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

// Serie del Caribe Team Configuration - Colores por país con banderas
const SDC_TEAMS = {
    // República Dominicana - Azul 🇩🇴
    667: { abbrev: 'AGU', name: 'Águilas Cibaeñas', color: '#002D62', flag: '🇩🇴', country: 'DOM' },
    668: { abbrev: 'TOR', name: 'Toros del Este', color: '#002D62', flag: '🇩🇴', country: 'DOM' },
    670: { abbrev: 'GIG', name: 'Gigantes del Cibao', color: '#002D62', flag: '🇩🇴', country: 'DOM' },
    671: { abbrev: 'ESC', name: 'Leones del Escogido', color: '#002D62', flag: '🇩🇴', country: 'DOM' },
    672: { abbrev: 'LIC', name: 'Tigres del Licey', color: '#002D62', flag: '🇩🇴', country: 'DOM' },
    673: { abbrev: 'EST', name: 'Estrellas Orientales', color: '#002D62', flag: '🇩🇴', country: 'DOM' },
    
    // Venezuela - Vinotinto 🇻🇪
    4935: { abbrev: 'CAR', name: 'Leones del Caracas', color: '#8B0000', flag: '🇻🇪', country: 'VEN' },
    4936: { abbrev: 'MAG', name: 'Navegantes del Magallanes', color: '#8B0000', flag: '🇻🇪', country: 'VEN' },
    4937: { abbrev: 'ARA', name: 'Tigres de Aragua', color: '#8B0000', flag: '🇻🇪', country: 'VEN' },
    4938: { abbrev: 'ZUL', name: 'Águilas del Zulia', color: '#8B0000', flag: '🇻🇪', country: 'VEN' },
    4939: { abbrev: 'LAR', name: 'Cardenales de Lara', color: '#8B0000', flag: '🇻🇪', country: 'VEN' },
    4940: { abbrev: 'GUA', name: 'Tiburones de La Guaira', color: '#8B0000', flag: '🇻🇪', country: 'VEN' },
    
    // Puerto Rico - Rojo 🇵🇷
    4941: { abbrev: 'CAG', name: 'Criollos de Caguas', color: '#ED0A3F', flag: '🇵🇷', country: 'PUR' },
    4942: { abbrev: 'MAY', name: 'Indios de Mayagüez', color: '#ED0A3F', flag: '🇵🇷', country: 'PUR' },
    4943: { abbrev: 'SAN', name: 'Cangrejeros de Santurce', color: '#ED0A3F', flag: '🇵🇷', country: 'PUR' },
    
    // México - Verde 🇲🇽
    4944: { abbrev: 'YAQ', name: 'Yaquis de Obregón', color: '#006341', flag: '🇲🇽', country: 'MEX' },
    4945: { abbrev: 'MAZ', name: 'Venados de Mazatlán', color: '#006341', flag: '🇲🇽', country: 'MEX' },
    4946: { abbrev: 'JAL', name: 'Charros de Jalisco', color: '#006341', flag: '🇲🇽', country: 'MEX' },
    4947: { abbrev: 'CUL', name: 'Tomateros de Culiacán', color: '#006341', flag: '🇲🇽', country: 'MEX' },
    4948: { abbrev: 'HER', name: 'Naranjeros de Hermosillo', color: '#006341', flag: '🇲🇽', country: 'MEX' },
    
    // Cuba - Rojo 🇨🇺
    4950: { abbrev: 'CUB', name: 'Cuba', color: '#CC0000', flag: '🇨🇺', country: 'CUB' },
    
    // Panamá - Rojo 🇵🇦
    4951: { abbrev: 'PAN', name: 'Panamá', color: '#D52B1E', flag: '🇵🇦', country: 'PAN' },
    
    // Colombia - Amarillo 🇨🇴
    4952: { abbrev: 'COL', name: 'Colombia', color: '#FCD116', flag: '🇨🇴', country: 'COL' },
    
    // Nicaragua - Azul 🇳🇮
    4953: { abbrev: 'NIC', name: 'Nicaragua', color: '#0067C6', flag: '🇳🇮', country: 'NIC' },
    
    // Curazao - Azul 🇨🇼
    4954: { abbrev: 'CUR', name: 'Curazao', color: '#003DA5', flag: '🇨🇼', country: 'CUR' },
};

// WBC Team Configuration - Todos los países participantes con colores nacionales
const WBC_TEAMS = {
    // Pool A - Típicamente Asia
    843: { abbrev: 'JPN', name: 'Japan', color: '#BC002D', flag: '🇯🇵' },
    1171: { abbrev: 'KOR', name: 'Korea', color: '#003478', flag: '🇰🇷' },
    791: { abbrev: 'TPE', name: 'Chinese Taipei', color: '#000095', flag: '🇹🇼' },
    790: { abbrev: 'CHN', name: 'China', color: '#DE2910', flag: '🇨🇳' },
    
    // Pool B - Típicamente Norteamérica/Europa
    940: { abbrev: 'USA', name: 'United States', color: '#BF0A30', flag: '🇺🇸' },
    784: { abbrev: 'CAN', name: 'Canada', color: '#FF0000', flag: '🇨🇦' },
    821: { abbrev: 'GBR', name: 'Great Britain', color: '#00247D', flag: '🇬🇧' },
    800: { abbrev: 'CZE', name: 'Czech Republic', color: '#11457E', flag: '🇨🇿' },
    
    // Pool C - Típicamente Caribe/Latinoamérica
    805: { abbrev: 'DOM', name: 'Dominican Republic', color: '#002D62', flag: '🇩🇴' },
    944: { abbrev: 'VEN', name: 'Venezuela', color: '#8B0000', flag: '🇻🇪' },
    897: { abbrev: 'PUR', name: 'Puerto Rico', color: '#ED0A3F', flag: '🇵🇷' },
    881: { abbrev: 'NCA', name: 'Nicaragua', color: '#0067C6', flag: '🇳🇮' },
    
    // Pool D - Típicamente Latinoamérica/Otros
    867: { abbrev: 'MEX', name: 'Mexico', color: '#006847', flag: '🇲🇽' },
    798: { abbrev: 'CUB', name: 'Cuba', color: '#002A8F', flag: '🇨🇺' },
    792: { abbrev: 'COL', name: 'Colombia', color: '#FCD116', flag: '🇨🇴' },
    890: { abbrev: 'PAN', name: 'Panama', color: '#DA121A', flag: '🇵🇦' },
    
    // Otros países participantes
    878: { abbrev: 'NED', name: 'Netherlands', color: '#FF6600', flag: '🇳🇱' },
    841: { abbrev: 'ITA', name: 'Italy', color: '#009246', flag: '🇮🇹' },
    760: { abbrev: 'AUS', name: 'Australia', color: '#00843D', flag: '🇦🇺' },
    840: { abbrev: 'ISR', name: 'Israel', color: '#0038B8', flag: '🇮🇱' },
    
    // Países adicionales que pueden clasificar
    4960: { abbrev: 'BRA', name: 'Brazil', color: '#009739', flag: '🇧🇷' },
    4961: { abbrev: 'ARG', name: 'Argentina', color: '#74ACDF', flag: '🇦🇷' },
    4962: { abbrev: 'RSA', name: 'South Africa', color: '#007749', flag: '🇿🇦' },
    4963: { abbrev: 'PHI', name: 'Philippines', color: '#0038A8', flag: '🇵🇭' },
    4964: { abbrev: 'PAK', name: 'Pakistan', color: '#01411C', flag: '🇵🇰' },
    4965: { abbrev: 'NZL', name: 'New Zealand', color: '#00247D', flag: '🇳🇿' },
    4966: { abbrev: 'GER', name: 'Germany', color: '#000000', flag: '🇩🇪' },
    4967: { abbrev: 'FRA', name: 'France', color: '#002395', flag: '🇫🇷' },
    4968: { abbrev: 'ESP', name: 'Spain', color: '#AA151B', flag: '🇪🇸' },
    4969: { abbrev: 'CRC', name: 'Costa Rica', color: '#002B7F', flag: '🇨🇷' },
    4970: { abbrev: 'HON', name: 'Honduras', color: '#0073CF', flag: '🇭🇳' },
    4971: { abbrev: 'GUA', name: 'Guatemala', color: '#4997D0', flag: '🇬🇹' },
    4972: { abbrev: 'ECU', name: 'Ecuador', color: '#FFD100', flag: '🇪🇨' },
    4973: { abbrev: 'PER', name: 'Peru', color: '#D91023', flag: '🇵🇪' },
    4974: { abbrev: 'CHI', name: 'Chile', color: '#D52B1E', flag: '🇨🇱' },
    4975: { abbrev: 'URU', name: 'Uruguay', color: '#0038A8', flag: '🇺🇾' },
    4976: { abbrev: 'BOL', name: 'Bolivia', color: '#007934', flag: '🇧🇴' },
    4977: { abbrev: 'SLV', name: 'El Salvador', color: '#0F47AF', flag: '🇸🇻' },
};

module.exports = {
    MLB_API_BASE,
    MLB_API_BASE_V1_1,
    TTL,
    LEAGUES,
    LIDOM_TEAMS,
    WBC_TEAMS,
    SDC_TEAMS
};
