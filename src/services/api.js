const DEFAULT_GAME_PK = 826304;
const TIMEOUT_MS = 5000;

function getApiBase() {
    const env = import.meta.env;
    if (env.VITE_API_URL !== undefined && env.VITE_API_URL !== '') return env.VITE_API_URL;
    return env.DEV ? 'http://localhost:5001' : '';
}

async function fetchApi(path, options = {}) {
    const base = getApiBase();
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? TIMEOUT_MS);

    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout - servidor no disponible');
        }
        throw error;
    }
}

export const fetchGameData = async (gamePk = DEFAULT_GAME_PK) => {
    return fetchApi(`/api/game/${gamePk}`);
};

export const fetchSchedule = async (league = 'lidom') => {
    return fetchApi(`/api/schedule?league=${encodeURIComponent(league)}`);
};

export const fetchStandings = async (league = 'lidom') => {
    return fetchApi(`/api/standings?league=${encodeURIComponent(league)}`);
};

export const fetchLeaders = async (league = 'lidom') => {
    return fetchApi(`/api/leaders?league=${encodeURIComponent(league)}`);
};
