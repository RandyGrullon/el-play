// Fantasy: los logros de cada fanático (igual que fantasyExtras.ts de la web). De dónde salen los puntos de cada
// pelotero (el desglose) lo cuenta pointParts de pro/fantasy/logic.ts, que es la misma regla.
import { RULES } from './fantasy';
import type { FanDay, FanProfileData } from '../components/fantasy/fans';

export interface Achievement {
    key: string;
    done: boolean;
    /** Cuánto lleva para los que se cuentan (p. ej. 4 de 7 días seguidos) */
    progress?: { value: number; goal: number };
}

const DAY_MS = 86400000;
const played = (day: FanDay) => day.lineup.length > 0 || day.picksMade > 0;

/** La racha más larga de días seguidos jugando (días del calendario) */
const longestStreak = (days: FanDay[]) => {
    const dates = days
        .filter(played)
        .map((day) => Date.parse(`${day.date}T12:00:00Z`))
        .sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    let previous: number | null = null;
    for (const time of dates) {
        run = previous !== null && Math.round((time - previous) / DAY_MS) === 1 ? run + 1 : 1;
        best = Math.max(best, run);
        previous = time;
    }
    return best;
};

export const achievements = (profile: FanProfileData): Achievement[] => {
    const days = profile.days.filter((day) => day.final);
    const best = Math.max(0, ...days.map((day) => day.total));
    const streak = longestStreak(profile.days);
    const count = (goal: number, value: number) => ({ done: value >= goal, progress: { value: Math.min(value, goal), goal } });
    // Todos los pronósticos de un día acertados (al menos 3)
    const perfectPicks = days.some((day) => day.picksMade >= 3 && day.picks === day.picksMade * RULES.pick);
    return [
        { key: 'firstTeam', ...count(1, profile.season.days) },
        { key: 'tenDays', ...count(10, profile.season.days) },
        { key: 'fifty', done: best >= 50 },
        { key: 'hundred', done: best >= 100 },
        { key: 'streak3', ...count(3, streak) },
        { key: 'streak7', ...count(7, streak) },
        { key: 'perfectPicks', done: perfectPicks },
        { key: 'fiveHundred', ...count(500, Math.round(profile.season.points)) }
    ];
};
