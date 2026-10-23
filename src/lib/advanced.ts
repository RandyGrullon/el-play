// Métricas avanzadas del modo PRO, calculadas con las líneas de temporada de MLB.
import type { HittingLine, PitchingLine } from './stats';

/** Constante de FIP: lleva la escala a la de la efectividad. En MLB ronda 3,1; LIDOM no publica la suya (en 2025-26 da 3,41) */
export const FIP_CONSTANT = 3.1;
let fipConstant = FIP_CONSTANT;

/**
 * La constante de una liga con sus números colectivos: efectividad de la liga menos el FIP sin constante. Con menos de
 * 150 entradas (el arranque de la temporada) no es confiable y queda la de MLB.
 */
export const fipConstantOf = (teams: { pitching: PitchingLine | null }[]) => {
    let outs = 0, er = 0, hr = 0, walks = 0, k = 0;
    for (const team of teams) {
        const p = team.pitching;
        if (!p) continue;
        outs += p.outs;
        er += p.er;
        hr += p.hr;
        walks += p.bb + (p.hbp ?? 0);
        k += p.k;
    }
    const ip = outs / 3;
    if (ip < 150) return null;
    return Math.round(((er * 9) / ip - (13 * hr + 3 * walks - 2 * k) / ip) * 100) / 100;
};

export interface LeagueLine {
    obp: number;
    slg: number;
    era: number;
}

/** OBP, SLG y efectividad de toda la liga (la suma de los equipos) */
export const leagueLineOf = (teams: { hitting: HittingLine | null; pitching: PitchingLine | null }[]): LeagueLine | null => {
    let pa = 0, onBase = 0, ab = 0, tb = 0, outs = 0, er = 0;
    for (const team of teams) {
        const h = team.hitting;
        if (h) {
            const singles = h.h - h.d - h.t - h.hr;
            pa += h.ab + h.bb + h.hbp + (h.sf ?? 0);
            onBase += h.h + h.bb + h.hbp;
            ab += h.ab;
            tb += h.tb ?? singles + 2 * h.d + 3 * h.t + 4 * h.hr;
        }
        if (team.pitching) {
            outs += team.pitching.outs;
            er += team.pitching.er;
        }
    }
    if (!pa || !ab || outs < 27) return null;
    return { obp: onBase / pa, slg: tb / ab, era: (er * 27) / outs };
};

let leagueLine: LeagueLine | null = null;
/** La liga a la vista (para OPS+ y ERA+ de la tabla PRO) */
export const setLeagueLine = (line: LeagueLine | null) => {
    leagueLine = line;
};

/** OPS+: 100 es la liga; 120, 20 % mejor (con su OBP y SLG contra los de la liga) */
export const opsPlus = (h: HittingLine | null | undefined, line: LeagueLine | null = leagueLine) => {
    const obp = parseFloat(h?.obp ?? '');
    const slg = parseFloat(h?.slg ?? '');
    if (!line || !h?.pa || !Number.isFinite(obp) || !Number.isFinite(slg)) return null;
    return Math.round(100 * (obp / line.obp + slg / line.slg - 1));
};

/** ERA+: 100 es la liga; más es mejor (la EFE de la liga entre la suya) */
export const eraPlus = (p: PitchingLine | null | undefined, line: LeagueLine | null = leagueLine) => {
    if (!line || !p?.outs) return null;
    const era = (p.er * 27) / p.outs;
    return era > 0 ? Math.round((100 * line.era) / era) : null;
};

/** Usa la constante de la liga a la vista (o la de MLB si no hay). Devuelve la que quedó */
export const setFipConstant = (value: number | null) => {
    fipConstant = value !== null && Number.isFinite(value) ? value : FIP_CONSTANT;
    return fipConstant;
};

const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

export const battingAdvanced = (h: HittingLine) => {
    const singles = h.h - h.d - h.t - h.hr;
    // Bases totales: las de MLB si vienen (algunas líneas traen 0 aunque haya hits)
    const tb = h.tb || singles + 2 * h.d + 3 * h.t + 4 * h.hr;
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
        fip: ip > 0 ? (13 * p.hr + 3 * (p.bb + (p.hbp ?? 0)) - 2 * p.k) / ip + fipConstant : null,
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
