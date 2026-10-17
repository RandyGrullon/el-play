// Colores de cada resultado de pitcheo y de jugada con la paleta del tema (en la web son variables CSS)
import type { EventTone } from '../../lib/baseball';
import type { PitchResult } from '../../types';
import { alpha, type Palette } from '../../theme/tokens';

export const resultColor = (colors: Palette, result: PitchResult) => colors[result];

/** Fondo y tinta de la etiqueta de una jugada (jonrón dorado, hit azul, boleto verde, ponche rojo) */
export const toneColors = (colors: Palette, tone: EventTone) => {
    const ink = tone === 'hr' ? colors.gold : tone === 'hit' ? colors.inplay : tone === 'walk' ? colors.ball : tone === 'k' ? colors.strike : null;
    return ink ? { bg: alpha(ink, 0.15), ink } : { bg: colors.raised, ink: colors.muted };
};
