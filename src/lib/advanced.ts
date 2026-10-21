// Métricas avanzadas del modo PRO, calculadas con las líneas de temporada de MLB.
import type { HittingLine, PitchingLine } from './stats';

/**
 * Constante de FIP de respaldo (la de MLB ronda 3,1). La buena es la de la liga: la manda /api/v2/pro/team-stats en
 * `constants.fip` (LIDOM 2025-26: 3.413) o sale de sumar las líneas de todos los lanzadores (leagueFromPlayers del PRO).
 * Pásala a pitchingAdvanced.
 */
export const FIP_CONSTANT = 3.1;

const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

/** Número de una cifra de MLB («.316», «3.81»); null si no es un número («-.--», «.---») */
export const numOf = (value: string | number | null | undefined) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
};

export const battingAdvanced = (h: HittingLine) => {
    const singles = h.h - h.d - h.t - h.hr;
    const tb = h.tb ?? singles + 2 * h.d + 3 * h.t + 4 * h.hr;
    const attempts = h.sb + (h.cs ?? 0);
    return {
        iso: ratio(tb - h.h, h.ab),
        babip: ratio(h.h - h.hr, h.ab - h.k - h.hr + (h.sf ?? 0)),
        kPct: ratio(h.k, h.pa),
        bbPct: ratio(h.bb, h.pa),
        bbK: ratio(h.bb, h.k),
        abHr: h.hr ? h.ab / h.hr : null,
        xbh: h.d + h.t + h.hr,
        /** Éxito robando (null sin intentos) */
        sbPct: ratio(h.sb, attempts)
    };
};

/** Con `fipConstant` el FIP queda en la escala de la liga; sin ella usa la de respaldo */
export const pitchingAdvanced = (p: PitchingLine, fipConstant: number = FIP_CONSTANT) => {
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

/** OPS+ (100 = promedio de la liga): 100 × (OBP / OBP liga + SLG / SLG liga − 1) */
export const opsPlus = (obp: number | null, slg: number | null, league: { obp: number | null; slg: number | null }) => {
    if (obp === null || slg === null || !league.obp || !league.slg) return null;
    return 100 * (obp / league.obp + slg / league.slg - 1);
};

/** EFE+ (100 = promedio, más es mejor): 100 × EFE liga / EFE. Sin carreras limpias no hay cifra (sería infinito) */
export const eraPlus = (era: number | null, leagueEra: number | null) => (era === null || !leagueEra || era <= 0 ? null : (100 * leagueEra) / era);

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
