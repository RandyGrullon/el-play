// Lo que se saca de los pitcheos de sus últimos juegos (zonas calientes y batazos), igual que playerPitches.ts de la
// web. Los percentiles en la liga salen de la lógica de la ficha PRO (pro/ficha/model.ts).
import { isWhiff, type BattedKind } from './baseball';
import type { RecentPitch } from './stats';

const HITS = new Set(['single', 'double', 'triple', 'home_run']);
/** Turnos que no cuentan como turno al bate */
const NOT_AT_BAT = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt', 'sac_fly_double_play', 'catcher_interf']);
const SWINGS = new Set(['S', 'W', 'M', 'Q', 'F', 'T', 'L', 'O', 'R', 'X', 'D', 'E']);

export interface ZoneCell {
    pitches: number;
    swings: number;
    whiffs: number;
    atBats: number;
    hits: number;
}

const emptyCell = (): ZoneCell => ({ pitches: 0, swings: 0, whiffs: 0, atBats: 0, hits: 0 });

/** Cuadro de 3×3 dentro de la zona (vista del receptor) y lo de afuera. Mitad del plato: 0,83 pies */
export const zoneGrid = (pitches: RecentPitch[]) => {
    const cells = Array.from({ length: 9 }, emptyCell);
    const outside = emptyCell();
    for (const pitch of pitches) {
        if (pitch.x === null || pitch.z === null) continue;
        const top = pitch.top ?? 3.4;
        const bot = pitch.bot ?? 1.6;
        const inside = Math.abs(pitch.x) <= 0.83 && pitch.z >= bot && pitch.z <= top;
        let cell = outside;
        if (inside) {
            const col = Math.min(2, Math.floor((pitch.x + 0.83) / (1.66 / 3)));
            const row = Math.min(2, 2 - Math.floor(((pitch.z - bot) / (top - bot)) * 3));
            cell = cells[Math.max(0, row) * 3 + Math.max(0, col)];
        }
        cell.pitches += 1;
        if (pitch.code && SWINGS.has(pitch.code)) cell.swings += 1;
        if (isWhiff(pitch)) cell.whiffs += 1;
        if (pitch.event && !NOT_AT_BAT.has(pitch.event)) {
            cell.atBats += 1;
            if (HITS.has(pitch.event)) cell.hits += 1;
        }
    }
    return { cells, outside, total: cells.reduce((sum, cell) => sum + cell.pitches, outside.pitches) };
};

/** Bolas puestas en juego con dónde cayeron */
export const recentBatted = (pitches: RecentPitch[]) =>
    pitches
        .filter((pitch) => pitch.hit && typeof pitch.hit.x === 'number' && typeof pitch.hit.y === 'number')
        .map((pitch, index) => ({ key: index, x: pitch.hit!.x, y: pitch.hit!.y, kind: (pitch.event === 'home_run' ? 'hr' : HITS.has(pitch.event ?? '') ? 'hit' : 'out') as BattedKind }));
