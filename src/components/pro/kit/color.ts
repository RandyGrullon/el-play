// Colores del PRO calculados: texto sobre el color de un equipo, mezclas y escalas de frío a caliente (como la web).
// Los colores de equipo vienen de la API (team.color, team.color2); aquí no se inventa ninguno.
// Aceptan hex (#fdb927, #fff) y los rgb()/rgba() de los tokens del tema.
import { PRO_HEAT_SCALES } from '../../../theme/tokens';

export type Rgb = [number, number, number];

/** Canales de un color hex, rgb() o rgba(); null si no se entiende */
export const hexToRgb = (color: string): Rgb | null => {
    const channels = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color.trim());
    if (channels) return [Number(channels[1]), Number(channels[2]), Number(channels[3])];
    const clean = color.trim().replace(/^#/, '');
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.slice(0, 6);
    if (!/^[0-9a-f]{6}$/i.test(full)) return null;
    const value = parseInt(full, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

export const rgbToHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;

/** Mezcla dos colores: t = 0 es `a`, t = 1 es `b` (devuelve hex) */
export const mix = (a: string, b: string, t: number) => {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    if (!ca || !cb) return a;
    const k = Math.min(1, Math.max(0, t));
    return rgbToHex([ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k]);
};

/** rgba() de un color (para rellenos suaves con el color del equipo o de un token) */
export const withAlpha = (color: string, opacity: number) => {
    const rgb = hexToRgb(color);
    return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${opacity})` : color;
};

const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

/** Luminancia relativa (WCAG) */
export const luminance = (color: string) => {
    const rgb = hexToRgb(color);
    if (!rgb) return 0;
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
};

/** Contraste WCAG entre dos colores (1 a 21) */
export const contrastRatio = (a: string, b: string) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export const INK_DARK = '#14151a';
export const INK_LIGHT = '#ffffff';

/** Texto sobre el color de un equipo: misma regla que inkOn de los tokens (blanco salvo fondos claros como AGU) */
export const teamInk = (color: string) => {
    const rgb = hexToRgb(color);
    if (!rgb) return INK_LIGHT;
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 160 ? INK_DARK : INK_LIGHT;
};

/** Texto con el mejor contraste (para celdas de calor, no para equipos) */
export const readableInk = (color: string) => (contrastRatio(color, INK_LIGHT) >= contrastRatio(color, INK_DARK) ? INK_LIGHT : INK_DARK);

/** Escalas de calor de los tokens (heat, zone, percentile) */
export const HEAT_SCALES = PRO_HEAT_SCALES;

export type HeatScale = keyof typeof HEAT_SCALES;

/** Color de una escala de tres paradas en t (0 a 1) */
export const scaleColor = (t: number, stops: readonly [string, string, string] | readonly string[]) => {
    const [low, mid, high] = stops;
    const k = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5;
    return k <= 0.5 ? mix(low, mid, k / 0.5) : mix(mid, high, (k - 0.5) / 0.5);
};

/** Color de la escala de calor en t (0 a 1) */
export const heatColor = (t: number, scale: HeatScale = 'heat') => scaleColor(t, HEAT_SCALES[scale]);

/** Fracción de `value` en [min, max] (0.5 si el rango no tiene ancho) */
export const fraction = (value: number, min: number, max: number) => (max === min ? 0.5 : Math.min(1, Math.max(0, (value - min) / (max - min))));
