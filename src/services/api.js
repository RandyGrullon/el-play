const DEFAULT_GAME_PK = 826304;

export const fetchGameData = async (gamePk = DEFAULT_GAME_PK) => {
    const apiUrl = import.meta.env.DEV
        ? `http://localhost:5000/api/game/${gamePk}`
        : `/api/game/${gamePk}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
        const response = await fetch(apiUrl, { signal: controller.signal });
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
};

export const fetchSchedule = async () => {
    const apiUrl = import.meta.env.DEV
        ? `http://localhost:5000/api/schedule`
        : `/api/schedule`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
        const response = await fetch(apiUrl, { signal: controller.signal });
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
};

export const fetchStandings = async () => {
    const apiUrl = import.meta.env.DEV
        ? `http://localhost:5000/api/standings`
        : `/api/standings`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
        const response = await fetch(apiUrl, { signal: controller.signal });
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
};

export const fetchLeaders = async () => {
    const apiUrl = import.meta.env.DEV
        ? `http://localhost:5000/api/leaders`
        : `/api/leaders`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
        const response = await fetch(apiUrl, { signal: controller.signal });
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
};
