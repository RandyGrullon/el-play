// Puntos del fantasy en el servidor, con la misma aritmética de la app (src/lib/fantasy.ts): si cambia allá, cambia aquí.
// Sirven para el perfil de cada fanático y la tabla de la temporada.

const RULES = { batters: 5, pitchers: 1, perTeam: 2, captain: 1.5, pick: 10 };

const round1 = (value) => Math.round(value * 10) / 10;

/** Equipo guardado en Supabase (fila de fantasy_entries) con la forma que usa la app */
const toEntry = (row = {}) => ({
    lineup: Array.isArray(row.lineup) ? row.lineup : [],
    captain: row.captain ?? null,
    picks: row.picks && typeof row.picks === 'object' ? row.picks : {}
});

/** El día tiene equipo o pronósticos (un día vacío no cuenta) */
const hasPlay = (entry) => entry.lineup.length > 0 || Object.keys(entry.picks).length > 0;

const playerScore = (entry, player) => (entry.captain === player.id ? Math.round(player.points * RULES.captain * 10) / 10 : player.points);

const teamPoints = (day, entry) =>
    Math.round(
        entry.lineup.reduce((sum, id) => {
            const player = day.players.find((p) => p.id === id);
            return sum + (player ? playerScore(entry, player) : 0);
        }, 0) * 10
    ) / 10;

const winnerOf = (game) => (game.state !== 'final' ? null : game.away?.isWinner ? game.away.id : game.home?.isWinner ? game.home.id : null);

const pickPoints = (day, entry) =>
    day.games.filter((game) => {
        const pick = entry.picks[game.gamePk];
        const winner = winnerOf(game);
        return !!pick && !!winner && winner === pick;
    }).length * RULES.pick;

/** Al menos un juego del día empezó (antes de eso el día cuenta 0) */
const dayStarted = (day) => day.games.some((game) => game.state !== 'preview');

/** Resultado de un fanático en un día del fantasy (`day` es lo que devuelve fantasyDay) */
const dayResult = (day, entry) => {
    const team = teamPoints(day, entry);
    const picks = pickPoints(day, entry);
    return {
        final: day.games.length > 0 && day.games.every((game) => game.state === 'final'),
        live: day.games.some((game) => game.state === 'live'),
        started: dayStarted(day),
        team,
        picks,
        total: round1(team + picks),
        picksMade: Object.values(entry.picks).filter(Boolean).length
    };
};

module.exports = { RULES, round1, toEntry, hasPlay, playerScore, teamPoints, pickPoints, dayStarted, dayResult };
