// Métricas avanzadas del modo PRO, calculadas con las líneas de temporada de MLB.
import type { HittingLine, PitchingLine } from './stats';

/** Constante de FIP: lleva la escala a la de la efectividad (en MLB ronda 3,1; LIDOM no publica la suya) */
export const FIP_CONSTANT = 3.1;

const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

export const battingAdvanced = (h: HittingLine) => {
    const singles = h.h - h.d - h.t - h.hr;
    const tb = h.tb ?? singles + 2 * h.d + 3 * h.t + 4 * h.hr;
    return {
        iso: ratio(tb - h.h, h.ab),
        babip: ratio(h.h - h.hr, h.ab - h.k - h.hr + (h.sf ?? 0)),
        kPct: ratio(h.k, h.pa),
        bbPct: ratio(h.bb, h.pa),
        bbK: ratio(h.bb, h.k),
        abHr: h.hr ? h.ab / h.hr : null,
        xbh: h.d + h.t + h.hr
    };
};

export const pitchingAdvanced = (p: PitchingLine) => {
    const ip = p.outs / 3;
    return {
        k9: ratio(p.k * 9, ip),
        bb9: ratio(p.bb * 9, ip),
        h9: ratio(p.h * 9, ip),
        hr9: ratio(p.hr * 9, ip),
        kBb: ratio(p.k, p.bb),
        kPct: ratio(p.k, p.bf ?? 0),
        bbPct: ratio(p.bb, p.bf ?? 0),
        fip: ip > 0 ? (13 * p.hr + 3 * (p.bb + (p.hbp ?? 0)) - 2 * p.k) / ip + FIP_CONSTANT : null,
        pitchesPerInning: ratio(p.np ?? 0, ip)
    };
};

/** Récord esperado por carreras anotadas y permitidas (Pitágoras de béisbol, exponente 1,83) */
export const pythagorean = (runsScored: number | null | undefined, runsAllowed: number | null | undefined, games: number) => {
    if (!runsScored && !runsAllowed) return null;
    const rs = (runsScored ?? 0) ** 1.83;
    const ra = (runsAllowed ?? 0) ** 1.83;
    if (rs + ra === 0 || games <= 0) return null;
    const pct = rs / (rs + ra);
    const wins = Math.round(pct * games);
    return { pct, wins, losses: games - wins };
};

// ---------------------------------------------------------------- formato

/** .312 */
export const fmtRate = (value: number | null) => (value === null || !Number.isFinite(value) ? '—' : value.toFixed(3).replace(/^0(?=\.)/, ''));
/** 23.4% */
export const fmtPct = (value: number | null) => (value === null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(1)}%`);
/** 8.25 */
export const fmtDec = (value: number | null, digits = 2) => (value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits));
