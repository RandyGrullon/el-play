// Colores, radios y sombras de El Play: los mismos de la web (el-play/src/styles.css y tailwind.config.js).
import { Platform } from 'react-native';

export interface Palette {
    bg: string;
    surface: string;
    raised: string;
    ink: string;
    muted: string;
    faint: string;
    line: string;
    live: string;
    ball: string;
    strike: string;
    inplay: string;
    hbp: string;
    gold: string;
    accent: string;
    accentInk: string;
    zoneBg: string;
    nav: string;
    navInk: string;
}

const rgb = (value: string) => `rgb(${value.split(' ').join(',')})`;

export const light: Palette = {
    bg: rgb('246 246 249'),
    surface: rgb('255 255 255'),
    raised: rgb('236 238 243'),
    ink: rgb('20 21 26'),
    muted: rgb('107 111 123'),
    faint: rgb('154 157 176'),
    line: 'rgba(20,21,26,0.10)',
    live: rgb('255 59 92'),
    ball: rgb('22 163 74'),
    strike: rgb('220 38 38'),
    inplay: rgb('37 99 235'),
    hbp: rgb('202 138 4'),
    gold: rgb('180 120 0'),
    accent: rgb('37 99 235'),
    accentInk: rgb('29 78 216'),
    zoneBg: rgb('20 21 26'),
    nav: rgb('20 21 26'),
    navInk: rgb('154 157 176')
};

export const dark: Palette = {
    bg: rgb('11 12 16'),
    surface: rgb('22 24 31'),
    raised: rgb('32 35 44'),
    ink: rgb('241 242 246'),
    muted: rgb('154 157 176'),
    faint: rgb('99 103 120'),
    line: 'rgba(226,232,240,0.10)',
    live: rgb('255 77 106'),
    ball: rgb('52 199 120'),
    strike: rgb('255 90 95'),
    inplay: rgb('96 152 255'),
    hbp: rgb('242 184 75'),
    gold: rgb('242 184 75'),
    accent: rgb('37 99 235'),
    accentInk: rgb('122 167 255'),
    zoneBg: rgb('226 232 240'),
    nav: rgb('32 35 44'),
    navInk: rgb('154 157 176')
};

/** Degradado de la marca (Fantasy, PRO, portada del Fantasy) */
export const BRAND_GRADIENT = ['#1e4fd8', '#6d28d9', '#e11d48'] as const;

export const radius = { card: 24, pill: 999, tile: 16, chip: 20 };

export const fonts = {
    regular: 'Outfit_400Regular',
    medium: 'Outfit_500Medium',
    semibold: 'Outfit_600SemiBold',
    bold: 'Outfit_700Bold',
    extrabold: 'Outfit_800ExtraBold',
    black: 'Outfit_900Black',
    condensed: 'BarlowCondensed_800ExtraBold'
};

/** Sombra suave de las tarjetas (shadow-card) y la flotante (shadow-float) */
export const shadow = (kind: 'card' | 'float' = 'card') =>
    Platform.select({
        web: { boxShadow: kind === 'card' ? '0 1px 3px rgba(20,21,26,0.08)' : '0 8px 24px rgba(20,21,26,0.14)' },
        default: {
            shadowColor: '#14151a',
            shadowOpacity: kind === 'card' ? 0.08 : 0.14,
            shadowRadius: kind === 'card' ? 3 : 24,
            shadowOffset: { width: 0, height: kind === 'card' ? 1 : 8 },
            elevation: kind === 'card' ? 1 : 6
        }
    }) as object;

/** Texto sobre el color de un equipo: oscuro si el color es claro (igual que inkOn de la web) */
export const inkOn = (hex: string) => {
    const value = parseInt(hex.replace('#', '').slice(0, 6), 16);
    const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#14151a' : '#ffffff';
};

/** Color con transparencia: alpha('#2563eb', 0.1); también con rgb(…) y rgba(…) (se cambia su transparencia) */
export const alpha = (color: string, opacity: number) => {
    const channels = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color);
    if (channels) return `rgba(${channels[1]},${channels[2]},${channels[3]},${opacity})`;
    const hex = color.replace('#', '');
    const value = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6), 16);
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${opacity})`;
};

// ---------------------------------------------------------------- Modo PRO
// Colores extra del PRO (los mismos de la web: variables --pro-* de styles.css). Cada uno pasa 4.5:1 sobre su fondo
// en su tema. Se leen con useProColors() del kit (src/components/pro/kit), que escoge claro u oscuro según el tema.

export interface ProPalette {
    /** Variación o dato para bien (verde) */
    up: string;
    /** Variación o dato para mal (rojo) */
    down: string;
    /** Ámbar: avisos, presión, datos viejos */
    warn: string;
    /** Texto rojo «en vivo» sobre fondo suave */
    live: string;
    /** Color propio del Fantasy (no el degradado) */
    fantasy: string;
    /** Escala de probabilidad 0 → 50 → 100 % (en contra, parejo, a favor): rellenos con texto blanco legible */
    probability: readonly [string, string, string];
}

export const proLight: ProPalette = {
    up: rgb('21 128 61'),
    down: rgb('200 30 30'),
    warn: rgb('154 103 0'),
    live: rgb('210 25 60'),
    fantasy: rgb('109 40 217'),
    probability: ['#b91c1c', '#64748b', '#15803d']
};

export const proDark: ProPalette = {
    up: rgb('52 199 120'),
    down: rgb('255 90 95'),
    warn: rgb('242 184 75'),
    live: rgb('255 107 130'),
    fantasy: rgb('167 139 250'),
    probability: ['#c2410c', '#64748b', '#15803d']
};

/** Degradado PRO: el de la marca en diagonal (insignia, bordes, botón principal) */
export const PRO_GRADIENT = BRAND_GRADIENT;
/** Inicio y fin del degradado en diagonal (135°) y en horizontal (la línea del encabezado de módulo) */
export const PRO_GRADIENT_DIAGONAL = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } as const;
export const PRO_GRADIENT_LINE = { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } } as const;

/**
 * Escalas de calor de tres paradas (iguales en claro y oscuro: colores medios con texto blanco legible encima).
 * - heat: frío azul → gris → caliente rojo (zonas calientes, percentiles de la ficha)
 * - zone: verde azulado → ámbar → magenta (mapa de calor de la zona de strike)
 * - percentile: peor naranja → gris → mejor azul (celdas de Estadísticas)
 */
export const PRO_HEAT_SCALES = {
    heat: ['#2563eb', '#64748b', '#e11d48'],
    zone: ['#0f766e', '#b45309', '#be185d'],
    percentile: ['#c2410c', '#64748b', '#2563eb']
} as const;
