const DEFAULT_GAME_PK = 826304;

export const fetchGameData = async (gamePk = DEFAULT_GAME_PK) => {
    const apiUrl = import.meta.env.DEV
        ? `http://localhost:5000/api/game/${gamePk}`
        : `/api/game/${gamePk}`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return await response.json();
};

export const fetchSchedule = async () => {
    const apiUrl = import.meta.env.DEV
        ? `http://localhost:5000/api/schedule`
        : `/api/schedule`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return await response.json();
};

export const fetchStandings = async () => {
    const apiUrl = import.meta.env.DEV
        ? `http://localhost:5000/api/standings`
        : `/api/standings`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return await response.json();
};

export const fetchLeaders = async () => {
    const apiUrl = import.meta.env.DEV
        ? `http://localhost:5000/api/leaders`
        : `/api/leaders`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return await response.json();
};
