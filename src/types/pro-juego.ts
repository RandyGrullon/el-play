// Contrato de la API del modo PRO, parte «juego»: lo que el servidor agregó al calendario (/api/v2/schedule) sin cambiar
// el Lite. En la web está en src/types/index.ts; aquí va aparte para no tocar src/types.ts. Los tipos de
// /api/v2/game/:pk/pro, /winprob, /live, /matchup y /zones están en src/lib/pro/juego.ts (igual que en la web).
import type { PersonRef, ScheduleGame, SeriesStatus } from '../types';

/** Carreras, hits, errores y quedados en base de una mitad de entrada o del juego */
export interface LineHalf {
    r: number | null;
    h: number | null;
    e: number | null;
    lob: number | null;
}

type ScheduleLive = NonNullable<ScheduleGame['live']>;

/**
 * Tarjeta del calendario con los campos PRO. Todos son opcionales: llegan en null si MLB no los manda y no llegan
 * mientras producción no tenga el servidor nuevo. Se lee con `game as ScheduleGamePro`.
 */
export interface ScheduleGamePro extends ScheduleGame {
    live: (ScheduleLive & {
        /** En espera y en el hoyo */
        onDeck?: PersonRef | null;
        inHole?: PersonRef | null;
    }) | null;
    /** 'Y' doble juego, 'S' doble con boletos separados; null si no es doble */
    doubleHeader?: 'Y' | 'S' | null;
    /** 1 o 2 en un doble juego */
    gameNumber?: number | null;
    seriesGameNumber?: number | null;
    gamesInSeries?: number | null;
    /** «Si es necesario» (finales) */
    ifNecessary?: boolean;
    dayNight?: 'day' | 'night' | null;
    /** Motivo de demora o posposición («Rain») */
    reason?: string | null;
    series?: SeriesStatus | null;
    flags?: { noHitter: boolean; perfectGame: boolean } | null;
    gameInfo?: { firstPitch: string | null; durationMin: number | null; delayMin: number | null } | null;
    /** Pizarra por entradas con R/H/E/LOB ([] antes de empezar) */
    innings?: { n: number; away: LineHalf; home: LineHalf }[];
    totals?: { away: LineHalf; home: LineHalf } | null;
}
