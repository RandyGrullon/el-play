// Colores del PRO según el tema (claro u oscuro, el que escogió el usuario o el del sistema).
import { useTheme } from '../../../theme/theme';
import { alpha, proDark, proLight, type Palette, type ProPalette } from '../../../theme/tokens';

/** Colores PRO del tema activo: up, down, warn, live, fantasy y la escala de probabilidad */
export const useProColors = (): ProPalette => (useTheme().isDark ? proDark : proLight);

/** Tonos de chips, tiles y notas */
export type ProTone = 'neutral' | 'live' | 'up' | 'down' | 'warn' | 'accent' | 'fantasy';

/** Texto y fondo suave (15 %) de un tono, con los colores del tema */
export const toneColors = (tone: ProTone, colors: Palette, pro: ProPalette): { ink: string; bg: string } => {
    switch (tone) {
        case 'live':
            return { ink: pro.live, bg: alpha(colors.live, 0.15) };
        case 'up':
            return { ink: pro.up, bg: alpha(pro.up, 0.15) };
        case 'down':
            return { ink: pro.down, bg: alpha(pro.down, 0.15) };
        case 'warn':
            return { ink: pro.warn, bg: alpha(pro.warn, 0.15) };
        case 'accent':
            return { ink: colors.accentInk, bg: alpha(colors.accent, 0.15) };
        case 'fantasy':
            return { ink: pro.fantasy, bg: alpha(pro.fantasy, 0.15) };
        default:
            return { ink: colors.ink, bg: colors.raised };
    }
};
