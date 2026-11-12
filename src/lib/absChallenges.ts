import type { AbsCount } from '../types';

/**
 * Retos del ABS de un equipo para dibujarlos como barra. Cada equipo empieza con 2; el reto ganado no se gasta (lo
 * conserva) y el perdido sí; en extra innings, el que se quedó sin retos recibe uno más por entrada. Por eso los que
 * «ha tenido» son los que le quedan más los que perdió. `total` y `left` son null si no llega cuántos le quedan.
 */
export interface AbsTally {
    total: number | null;
    left: number | null;
    won: number;
    lost: number;
}

/** Mínimo de casillas de la barra (los 2 del inicio) aunque los datos digan menos */
export const ABS_PER_GAME = 2;

export const absTally = (count: AbsCount): AbsTally => {
    const won = Math.max(0, count.won || 0);
    const lost = Math.max(0, count.lost || 0);
    if (count.remaining === null || count.remaining === undefined) return { total: null, left: null, won, lost };
    const left = Math.max(0, count.remaining);
    return { total: Math.max(ABS_PER_GAME, left + lost), left, won, lost };
};

/** Casillas de la barra, en orden: primero las que le quedan, después las perdidas (y las que falten, vacías) */
export const absSlots = (tally: AbsTally): ('left' | 'lost' | 'empty')[] => {
    if (tally.total === null || tally.left === null) return [];
    const slots: ('left' | 'lost' | 'empty')[] = [];
    for (let index = 0; index < tally.total; index++) slots.push(index < tally.left ? 'left' : index < tally.left + tally.lost ? 'lost' : 'empty');
    return slots;
};
