// Detalle útil bajo el N.º 1 de cada categoría («1 HR cada 9.9 VB · 23 J», «3-1 · 2.10 EFE», «5 SV en 12 J»).
// Solo con números de su línea real; si falta lo necesario, no se escribe nada.
import type { ProPlayerRow } from '../../../types/pro-liga';
import type { LeaderCategoryId } from './logic';

type T = (key: string, options?: Record<string, unknown>) => string;

const one = (value: number) => (Math.round(value * 10) / 10).toFixed(1);
/** Puntos sin «.0» de sobra: 235, 149.5 */
const points = (value: number) => String(Math.round(value * 10) / 10);

export const leaderDetail = (id: LeaderCategoryId, row: ProPlayerRow, t: T): string => {
    const h = row.hitting;
    const p = row.pitching;
    const key = `pro.lideres.detail.${id}`;
    switch (id) {
        case 'hr':
            return h && h.hr > 0 ? t(key, { ab: one(h.ab / h.hr), g: h.g }) : '';
        case 'rbi':
            return h && h.g > 0 ? t(key, { perGame: (h.rbi / h.g).toFixed(2), hr: h.hr }) : '';
        case 'slg':
            return h && h.tb !== undefined ? t(key, { tb: h.tb, ab: h.ab }) : '';
        case 'iso':
            return h ? t(key, { d: h.d, t: h.t, hr: h.hr }) : '';
        case 'avg':
            return h ? t(key, { h: h.h, ab: h.ab }) : '';
        case 'h':
            return h ? t(key, { avg: h.avg, g: h.g }) : '';
        case 'ops':
            return h ? t(key, { obp: h.obp, slg: h.slg }) : '';
        case 'd':
            return h ? t(key, { xbh: h.d + h.t + h.hr, g: h.g }) : '';
        case 'obp':
            return h ? t(key, { onBase: h.h + h.bb + h.hbp, pa: h.pa }) : '';
        case 'bb':
            return h && h.pa > 0 ? t(key, { pct: one((h.bb / h.pa) * 100) }) : '';
        case 'bbPct':
            return h ? t(key, { bb: h.bb, pa: h.pa }) : '';
        case 'kPct':
            return h ? t(key, { k: h.k, pa: h.pa }) : '';
        case 'sb':
            return h ? t(key, { count: h.cs, g: h.g }) : '';
        case 'era':
            return p ? t(key, { w: p.w, l: p.l, ip: p.ip }) : '';
        case 'k':
            return p && p.outs > 0 ? t(key, { k9: one((p.k * 27) / p.outs), ip: p.ip }) : '';
        case 'w':
            return p ? t(key, { w: p.w, l: p.l, era: p.era }) : '';
        case 'sv':
            return p ? t(key, { sv: p.sv, g: p.g }) : '';
        case 'whip':
            return p ? t(key, { bb: p.bb, h: p.h, ip: p.ip }) : '';
        case 'ip':
            return p ? t(key, { gs: p.gs, g: p.g }) : '';
        case 'k9':
            return p ? t(key, { k: p.k, ip: p.ip }) : '';
        case 'bb9':
            return p ? t(key, { bb: p.bb, ip: p.ip }) : '';
        case 'fip':
            return p ? t(key, { era: p.era }) : '';
        case 'hld':
            return p ? t(key, { hld: p.hld, g: p.g }) : '';
        case 'pts':
            return row.g > 0 ? t(key, { ppg: one(row.ppg), g: row.g }) : '';
        case 'ppgB':
        case 'ppgP':
            return row.g > 0 ? t('pro.lideres.detail.ppg', { pts: points(row.pts), g: row.g }) : '';
        case 'ptsRP':
            return p ? t(key, { sv: p.sv, hld: p.hld, g: p.g }) : '';
        default:
            return '';
    }
};
