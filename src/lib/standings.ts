// Quién ya aseguró su puesto y quién ya no lo alcanza, con lo que le falta jugar a cada uno.
import type { StandingRow } from '../types';

export type RaceStatus = 'clinched' | 'eliminated' | null;

/**
 * `spots`: cuántos pasan (en LIDOM, 4 de 6 al Round Robin). Se usan solo victorias: un empate al final lo decide el
 * desempate de la liga, así que en ese caso no se marca nada (mejor tarde que equivocado).
 * - Asegurado: menos de `spots` rivales pueden llegar a sus victorias de hoy.
 * - Eliminado: ya hay `spots` equipos con más victorias de las que él puede sumar ganando todo lo que le queda.
 */
export const raceStatus = (rows: StandingRow[], spots: number, totalGames: number | null | undefined): Map<number, RaceStatus> => {
    const result = new Map<number, RaceStatus>();
    if (!totalGames || rows.length <= spots) return result;
    const maxWins = (row: StandingRow) => row.wins + Math.max(0, totalGames - row.wins - row.losses);
    for (const row of rows) {
        const threats = rows.filter((other) => other !== row && maxWins(other) >= row.wins).length;
        const ahead = rows.filter((other) => other !== row && other.wins > maxWins(row)).length;
        result.set(row.team.id, row.clinched || threats < spots ? 'clinched' : ahead >= spots ? 'eliminated' : null);
    }
    return result;
};
