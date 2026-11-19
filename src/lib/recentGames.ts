// Lo que bateó en sus últimos juegos, sumado: turnos, hits y promedio («22 turnos, 2 hits, .091»)
import type { GameLogRow } from './stats';

export interface RecentHitting {
    /** Juegos en que bateó */
    games: number;
    ab: number;
    h: number;
    /** «.091» (null sin turnos) */
    avg: string | null;
}

export const recentHitting = (games: Pick<GameLogRow, 'hitting'>[]): RecentHitting => {
    const played = games.filter((game) => game.hitting);
    const ab = played.reduce((total, game) => total + (game.hitting?.ab ?? 0), 0);
    const h = played.reduce((total, game) => total + (game.hitting?.h ?? 0), 0);
    return { games: played.length, ab, h, avg: ab > 0 ? (h / ab).toFixed(3).replace(/^0/, '') : null };
};

/** Los últimos `count` juegos antes del de hoy (el de hoy ya sale aparte como «Hoy») */
export const gamesBefore = <T extends Pick<GameLogRow, 'gamePk'>>(log: T[], gamePk: number | null, count = 8) =>
    log.filter((game) => game.gamePk !== gamePk).slice(0, count);
