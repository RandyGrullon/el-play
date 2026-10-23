// Lo que se saca de los pitcheos de sus últimos juegos (zonas calientes, batazos, repertorio) y de la liga entera
// (percentiles y comparación).
import type { BattedKind } from './baseball';
import { isWhiff } from './baseball';
import { battingAdvanced, pitchingAdvanced } from './advanced';
import type { HittingLine, PitchingLine, PlayerRow, RecentPitch } from './stats';

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
        if (isWhiff(pitch.code)) cell.whiffs += 1;
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
        .filter((pitch) => pitch.hit && typeof pitch.hit.x === 'number')
        .map((pitch, index) => ({ key: index, x: pitch.hit!.x, y: pitch.hit!.y, kind: (pitch.event === 'home_run' ? 'hr' : HITS.has(pitch.event ?? '') ? 'hit' : 'out') as BattedKind }));

// ---------------------------------------------------------------- percentiles en la liga

export interface Metric {
    key: string;
    /** Más alto es mejor (si no, más bajo) */
    higher: boolean;
    value: (line: HittingLine | PitchingLine) => number | null;
    show: (value: number) => string;
}

const rate3 = (value: number) => value.toFixed(3).replace(/^0/, '');
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const dec2 = (value: number) => value.toFixed(2);
const num = (text: string | undefined) => {
    const value = parseFloat(text ?? '');
    return Number.isFinite(value) ? value : null;
};

export const HITTING_METRICS: Metric[] = [
    { key: 'avg', higher: true, value: (l) => num((l as HittingLine).avg), show: rate3 },
    { key: 'obp', higher: true, value: (l) => num((l as HittingLine).obp), show: rate3 },
    { key: 'slg', higher: true, value: (l) => num((l as HittingLine).slg), show: rate3 },
    { key: 'ops', higher: true, value: (l) => num((l as HittingLine).ops), show: rate3 },
    { key: 'iso', higher: true, value: (l) => battingAdvanced(l as HittingLine).iso, show: rate3 },
    { key: 'kPct', higher: false, value: (l) => battingAdvanced(l as HittingLine).kPct, show: pct },
    { key: 'bbPct', higher: true, value: (l) => battingAdvanced(l as HittingLine).bbPct, show: pct }
];

export const PITCHING_METRICS: Metric[] = [
    { key: 'era', higher: false, value: (l) => ((l as PitchingLine).outs ? ((l as PitchingLine).er * 27) / (l as PitchingLine).outs : null), show: dec2 },
    { key: 'whip', higher: false, value: (l) => num((l as PitchingLine).whip), show: dec2 },
    { key: 'fip', higher: false, value: (l) => pitchingAdvanced(l as PitchingLine).fip, show: dec2 },
    { key: 'kPct', higher: true, value: (l) => pitchingAdvanced(l as PitchingLine).kPct, show: pct },
    { key: 'bbPct', higher: false, value: (l) => pitchingAdvanced(l as PitchingLine).bbPct, show: pct },
    { key: 'h9', higher: false, value: (l) => pitchingAdvanced(l as PitchingLine).h9, show: (value) => value.toFixed(1) }
];

/** Percentil (0-100) de `value` entre los calificados: qué parte de la liga está peor (los empates cuentan la mitad) */
export const percentileOf = (value: number, others: number[], higher: boolean) => {
    if (!others.length) return null;
    let worse = 0;
    let same = 0;
    for (const other of others) {
        if (other === value) same += 1;
        else if (higher ? other < value : other > value) worse += 1;
    }
    return Math.round(((worse + same / 2) / others.length) * 100);
};

export const percentiles = (line: HittingLine | PitchingLine, pool: PlayerRow[], role: 'B' | 'P') => {
    const metrics = role === 'P' ? PITCHING_METRICS : HITTING_METRICS;
    const lines = pool.map((row) => (role === 'P' ? row.pitching : row.hitting)).filter((item): item is HittingLine & PitchingLine => !!item);
    return metrics.flatMap((metric) => {
        const value = metric.value(line);
        if (value === null || !Number.isFinite(value)) return [];
        const others = lines.map(metric.value).filter((item): item is number => item !== null && Number.isFinite(item));
        const rank = percentileOf(value, others, metric.higher);
        return rank === null ? [] : [{ metric, value, rank }];
    });
};
