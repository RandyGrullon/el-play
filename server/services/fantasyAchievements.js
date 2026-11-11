const { round1 } = require('./fantasyScore');

// Logros del fantasy: una sola definición para la web y la app. GET /v2/fantasy/fan/:userId/stats los da todos,
// desbloqueados (con el día) o no (con su avance cuando se puede medir). Se miden sobre la temporada completa del
// fanático con el equipo que cuenta (effectiveEntry). Lo que depende de puntos o puestos se mide solo en días
// terminados (en vivo los puntos todavía bajan y suben); lo de jugar (días y rachas), en días con juegos empezados.

const ACHIEVEMENTS = [
    { id: 'firstTeam', kind: 'firstTeam' },
    { id: 'days10', kind: 'days', goal: 10 },
    { id: 'days30', kind: 'days', goal: 30 },
    { id: 'day50', kind: 'day', goal: 50 },
    { id: 'day100', kind: 'day', goal: 100 },
    { id: 'day150', kind: 'day', goal: 150 },
    { id: 'streak3', kind: 'streak', goal: 3 },
    { id: 'streak7', kind: 'streak', goal: 7 },
    { id: 'streak14', kind: 'streak', goal: 14 },
    // Todos los pronósticos acertados en un día con al menos 3
    { id: 'perfectPicks', kind: 'perfectPicks', picks: 3 },
    // El capitán fue el que más puntos hizo del equipo (empatado también) con al menos 15 sin el ×1,5
    { id: 'captainMvp', kind: 'captainMvp', points: 15 },
    { id: 'season500', kind: 'season', goal: 500 },
    { id: 'season1000', kind: 'season', goal: 1000 },
    { id: 'top10Day', kind: 'rank', top: 10, fans: 10 },
    { id: 'dayLeader', kind: 'rank', top: 1, fans: 5 },
    // Un pelotero de 5 créditos o menos le dio 20 puntos o más (con el ×1,5 si era el capitán)
    { id: 'bargain', kind: 'bargain', price: 5, points: 20 },
    // Ganó una semana (lunes a domingo) en una liga privada
    { id: 'weekChampion', kind: 'weekChampion' }
];

const progressOf = (value, goal) => ({ value: Math.min(Math.max(0, round1(value)), goal), goal });

const captainMvp = (day, min) => {
    const captain = day.lineup.find((item) => item.captain);
    return !!captain && captain.points >= min && day.lineup.every((item) => item.points <= captain.points);
};

/**
 * Logros de un fanático.
 * - `days`: sus días de la temporada (cualquier orden), cada uno { date, saved (guardó peloteros), started, final,
 *   team (el equipo que cuenta tiene peloteros), total, rank, fans (cuántos jugaron ese día), picksMade y picksHit
 *   (pronósticos ya decididos), lineup: [{ points (sin el ×1,5), score, captain, price }] }.
 * - `gameDays`: días con juegos empezados de la liga (para las rachas: un día de juego sin equipo la corta).
 * - `weekTitles`: semanas que ganó en una liga privada (el domingo de cada una), o null si no se sabe.
 * @returns {{ id: string, unlockedAt: string | null, progress: { value: number, goal: number } | null }[]}
 */
const achievementsOf = ({ days = [], gameDays = [], weekTitles = null } = {}) => {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const byDate = new Map(sorted.map((day) => [day.date, day]));
    const finals = sorted.filter((day) => day.final);

    // Días con equipo y el día en que se llegó a cada cantidad
    const played = sorted.filter((day) => day.started && day.team);
    // Rachas: días de juego seguidos con equipo (un día de juego sin equipo la corta)
    const calendar = [...new Set([...gameDays, ...played.map((day) => day.date)])].sort();
    const streakReached = new Map();
    let run = 0;
    let longest = 0;
    for (const date of calendar) {
        const day = byDate.get(date);
        run = day && day.started && day.team ? run + 1 : 0;
        if (run > longest) {
            longest = run;
            if (!streakReached.has(run)) streakReached.set(run, date);
        }
    }
    // Puntos de la temporada acumulados en días terminados
    let season = 0;
    const seasonReached = [];
    for (const day of finals) {
        season += day.total;
        seasonReached.push({ date: day.date, points: round1(season) });
    }
    const bestDay = finals.reduce((best, day) => Math.max(best, day.total), 0);

    const first = (list, test) => list.find(test)?.date ?? null;
    return ACHIEVEMENTS.map((def) => {
        switch (def.kind) {
            case 'firstTeam':
                return { id: def.id, unlockedAt: first(sorted, (day) => day.saved), progress: null };
            case 'days':
                return { id: def.id, unlockedAt: played[def.goal - 1]?.date ?? null, progress: progressOf(played.length, def.goal) };
            case 'day':
                return { id: def.id, unlockedAt: first(finals, (day) => day.total >= def.goal), progress: progressOf(bestDay, def.goal) };
            case 'streak':
                return { id: def.id, unlockedAt: streakReached.get(def.goal) ?? null, progress: progressOf(longest, def.goal) };
            case 'season':
                return { id: def.id, unlockedAt: seasonReached.find((item) => item.points >= def.goal)?.date ?? null, progress: progressOf(season, def.goal) };
            case 'perfectPicks':
                return { id: def.id, unlockedAt: first(finals, (day) => day.picksMade >= def.picks && day.picksHit === day.picksMade), progress: null };
            case 'captainMvp':
                return { id: def.id, unlockedAt: first(finals, (day) => captainMvp(day, def.points)), progress: null };
            case 'rank':
                return { id: def.id, unlockedAt: first(finals, (day) => day.rank !== null && day.rank !== undefined && day.fans >= def.fans && day.rank <= def.top), progress: null };
            case 'bargain':
                return { id: def.id, unlockedAt: first(finals, (day) => day.lineup.some((item) => Number.isFinite(item.price) && item.price <= def.price && item.score >= def.points)), progress: null };
            case 'weekChampion':
                return { id: def.id, unlockedAt: Array.isArray(weekTitles) && weekTitles.length ? [...weekTitles].sort()[0] : null, progress: null };
            default:
                return { id: def.id, unlockedAt: null, progress: null };
        }
    });
};

module.exports = { ACHIEVEMENTS, achievementsOf };
