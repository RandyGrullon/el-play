/** Colores por liga: única fuente de verdad para LIDOM, WBC, SDC */
export type LeagueId = 'lidom' | 'wbc' | 'sdc';

export const LEAGUE_COLORS: Record<LeagueId, string> = {
    lidom: '#22d3ee', // cyan-400
    wbc: '#f59e0b',   // amber-500
    sdc: '#ef4444',   // red-500
};
