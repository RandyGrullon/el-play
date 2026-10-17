import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { Pitch } from '../../types';
import { pitchCallName, pitchTypeColor, pitchTypeName } from '../../lib/baseball';
import { useColors } from '../../theme/theme';
import { alpha, fonts, light as lightPalette } from '../../theme/tokens';
import { Row, Txt } from '../ui';
import { BatterFigure, type UniformColors } from './BatterFigure';
import { resultColor } from './colors';

// Zona de strike en pies reales, vista del receptor (pX > 0 = lado de primera base).
// 1 pie = 100 unidades del viewBox; el suelo (pZ = 0) está en y = 520.
const UNIT = 100;
const HALF_WIDTH = 2.35; // pies visibles a cada lado del centro del plato (cabe el bateador en su caja)
const TOP_FT = 5.45; // hasta el casco del bateador
const GROUND = TOP_FT * UNIT + 20;
const VIEW_W = HALF_WIDTH * 2 * UNIT;
const VIEW_H = GROUND + 40;
const HALF_PLATE = 17 / 12 / 2; // 8.5 pulgadas
const BALL_R = 0.145 * UNIT; // un poco mayor que la bola real para que se lea el número
const STD_TOP = 3.4;
const STD_BOT = 1.6;

const sx = (pX: number) => VIEW_W / 2 + pX * UNIT;
const sy = (pZ: number) => GROUND - pZ * UNIT;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface StrikeZoneProps {
    pitches: Pitch[];
    /** 'sequence': numerados y por resultado; 'types': todos los del lanzador por tipo */
    mode?: 'sequence' | 'types';
    batterSide?: string | null;
    /** Colores del uniforme del bateador; sin ellos se dibuja en gris */
    uniform?: UniformColors;
    selected?: number | null;
    onSelect?: (index: number | null) => void;
    showLegend?: boolean;
    style?: StyleProp<ViewStyle>;
    /** Ancho máximo del dibujo */
    maxWidth?: number;
    /** Colores fijos de tema claro (zona sobre fondo blanco en el resumen) */
    light?: boolean;
}

const median = (values: number[], fallback: number) => {
    const list = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    return list.length ? list[Math.floor(list.length / 2)] : fallback;
};

export const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <Row gap={4}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
        <Txt size={11} tone="muted">
            {label}
        </Txt>
    </Row>
);

export const StrikeZone: React.FC<StrikeZoneProps> = ({ pitches, mode = 'sequence', batterSide, uniform, selected = null, onSelect, showLegend = true, style, maxWidth = 340, light }) => {
    const { t, i18n } = useTranslation();
    const theme = useColors();
    const colors = light ? { ...lightPalette, accent: theme.accent } : theme;
    const byType = mode === 'types';

    // En "sequence" es un solo bateador: su zona. En "types" hay muchos bateadores: se normaliza cada
    // pitcheo a una zona estándar (como los mapas de Statcast) para que sean comparables.
    const top = byType ? STD_TOP : median(pitches.map((p) => p.top ?? NaN), STD_TOP);
    const bot = byType ? STD_BOT : median(pitches.map((p) => p.bot ?? NaN), STD_BOT);
    const zoneLeft = sx(-HALF_PLATE);
    const zoneWidth = HALF_PLATE * 2 * UNIT;
    const zoneTop = sy(top);
    const zoneHeight = (top - bot) * UNIT;

    const located = pitches
        .map((pitch, index) => ({ pitch, index }))
        .filter(({ pitch }) => pitch.x !== null && pitch.z !== null)
        .map(({ pitch, index }) => {
            let z = pitch.z as number;
            if (byType && pitch.top && pitch.bot && pitch.top > pitch.bot) {
                z = STD_BOT + ((z - pitch.bot) / (pitch.top - pitch.bot)) * (STD_TOP - STD_BOT);
            }
            const x = pitch.x as number;
            const outside = Math.abs(x) > HALF_WIDTH - 0.15 || z < 0.15 || z > TOP_FT - 0.15;
            return { pitch, index, cx: sx(clamp(x, -HALF_WIDTH + 0.15, HALF_WIDTH - 0.15)), cy: sy(clamp(z, 0.15, TOP_FT - 0.15)), outside };
        });

    const lastIndex = located.length ? located[located.length - 1].index : -1;
    // Sin tipos (estadio o juego sin rastreo) la vista del lanzador se colorea por resultado
    const anyType = pitches.some((pitch) => pitch.type);
    const estimated = located.filter(({ pitch }) => pitch.est).length;
    const missing = pitches.length - located.length;
    const side = batterSide === 'L' ? 'L' : batterSide === 'R' ? 'R' : null;
    const label = (pitch: Pitch) => `${pitch.n ?? ''} ${pitchTypeName(pitch, i18n.language)} ${pitch.mph ? `${pitch.mph} mph` : ''} — ${pitchCallName(pitch, i18n.language)}`;

    const legend = (
        <>
            <Legend color={resultColor(colors, 'ball')} label={t('zone.ball')} />
            <Legend color={resultColor(colors, 'strike')} label={t('zone.strike')} />
            <Legend color={resultColor(colors, 'inplay')} label={t('zone.inPlay')} />
        </>
    );

    // Si los pitcheos no traen ubicación (a veces llega unos segundos después), en vez de una zona vacía
    // se muestra la secuencia del turno con el resultado y el conteo de cada pitcheo.
    if (!byType && pitches.length > 0 && located.length === 0) {
        return (
            <View style={[{ alignItems: 'center', width: '100%' }, style]}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 8, rowGap: 12, paddingVertical: 16 }} accessibilityLabel={t('zone.sequence')}>
                    {pitches.map((pitch, index) => {
                        const isSelected = selected === index;
                        const color = resultColor(colors, pitch.r);
                        return (
                            <View key={`${index}-${pitch.n}`} style={{ alignItems: 'center', gap: 4 }}>
                                <Pressable
                                    accessibilityLabel={label(pitch)}
                                    disabled={!onSelect}
                                    onPress={() => onSelect?.(isSelected ? null : index)}
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 20,
                                        backgroundColor: color,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: selected !== null && !isSelected ? 0.4 : 1,
                                        borderWidth: isSelected ? 3 : 0,
                                        borderColor: colors.surface
                                    }}
                                >
                                    <Txt size={14} weight="bold" tone="white">
                                        {pitch.n ?? index + 1}
                                    </Txt>
                                </Pressable>
                                <Txt size={11} tone="muted" tabular>
                                    {pitch.b !== null && pitch.s !== null && pitch.r !== 'inplay' ? `${pitch.b}-${pitch.s}` : '·'}
                                </Txt>
                            </View>
                        );
                    })}
                </View>
                {showLegend && (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                        <Row gap={12} wrap justify="center">
                            {legend}
                        </Row>
                        <Txt size={11} tone="faint" center style={{ maxWidth: 300 }}>
                            {t('zone.untracked')}
                        </Txt>
                    </View>
                )}
            </View>
        );
    }

    return (
        <View style={[{ alignItems: 'center', width: '100%' }, style]}>
            <View style={{ width: '100%', maxWidth, aspectRatio: VIEW_W / VIEW_H }} accessibilityRole="image" accessibilityLabel={t('zone.aria', { count: pitches.length })}>
                <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
                    {/* Bateador en su caja con el uniforme de su equipo (no en la vista por lanzador: son varios bateadores) */}
                    {side && !byType && (
                        <BatterFigure side={side} top={top} bot={bot} colors={uniform ?? { jersey: colors.faint, trim: colors.muted, pants: colors.raised }} sx={sx} sy={sy} unit={UNIT} />
                    )}

                    {/* Borde de la zona (una bola por fuera) */}
                    <Rect
                        x={zoneLeft - BALL_R}
                        y={zoneTop - BALL_R}
                        width={zoneWidth + BALL_R * 2}
                        height={zoneHeight + BALL_R * 2}
                        rx={10}
                        fill={alpha(colors.zoneBg, 0.03)}
                        stroke={alpha(colors.zoneBg, 0.12)}
                        strokeDasharray="6 6"
                    />
                    {/* Zona reglamentaria 3x3 */}
                    <Rect x={zoneLeft} y={zoneTop} width={zoneWidth} height={zoneHeight} fill={alpha(colors.zoneBg, 0.05)} stroke={alpha(colors.zoneBg, 0.55)} strokeWidth={3} />
                    {[1, 2].map((step) => (
                        <G key={step} stroke={alpha(colors.zoneBg, 0.18)} strokeWidth={1.5}>
                            <Line x1={zoneLeft + (zoneWidth * step) / 3} y1={zoneTop} x2={zoneLeft + (zoneWidth * step) / 3} y2={zoneTop + zoneHeight} />
                            <Line x1={zoneLeft} y1={zoneTop + (zoneHeight * step) / 3} x2={zoneLeft + zoneWidth} y2={zoneTop + (zoneHeight * step) / 3} />
                        </G>
                    ))}

                    {/* Plato */}
                    <Path
                        d={`M ${sx(-HALF_PLATE)} ${GROUND + 6} L ${sx(HALF_PLATE)} ${GROUND + 6} L ${sx(HALF_PLATE)} ${GROUND + 16} L ${sx(0)} ${GROUND + 28} L ${sx(-HALF_PLATE)} ${GROUND + 16} Z`}
                        fill={alpha(colors.zoneBg, 0.18)}
                    />

                    {/* Pitcheos: el más reciente encima */}
                    {located.map(({ pitch, index, cx, cy, outside }) => {
                        const isLast = index === lastIndex && !byType;
                        const isSelected = selected === index;
                        const color = byType && anyType ? pitchTypeColor(pitch.type) : resultColor(colors, pitch.r);
                        const radius = byType ? BALL_R * 0.72 : BALL_R;
                        return (
                            <G key={`${index}-${pitch.n}-${pitch.mph}`} opacity={selected !== null && !isSelected ? 0.35 : outside ? 0.7 : byType ? 0.85 : 1}>
                                {(isLast || isSelected) && <Circle cx={cx} cy={cy} r={radius + 9} fill="none" stroke={color} strokeWidth={3} opacity={0.55} />}
                                <Circle cx={cx} cy={cy} r={radius} fill={color} stroke={colors.surface} strokeWidth={3} />
                                {!byType && (
                                    <SvgText x={cx} y={cy + radius * 0.42} textAnchor="middle" fontSize={radius * 1.15} fontFamily={fonts.bold} fill="#fff">
                                        {String(pitch.n ?? index + 1)}
                                    </SvgText>
                                )}
                            </G>
                        );
                    })}
                </Svg>
                {/* Zonas para tocar cada pitcheo (encima del dibujo: los toques en el SVG no van igual en web y en el teléfono) */}
                {onSelect &&
                    located.map(({ pitch, index, cx, cy }) => (
                        <Pressable
                            key={`hit-${index}`}
                            accessibilityRole="button"
                            accessibilityLabel={label(pitch)}
                            onPress={() => onSelect(selected === index ? null : index)}
                            style={{ position: 'absolute', left: `${(cx / VIEW_W) * 100}%`, top: `${(cy / VIEW_H) * 100}%`, width: 28, height: 28, marginLeft: -14, marginTop: -14, borderRadius: 14 }}
                        />
                    ))}
            </View>

            {showLegend && (
                <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 12, rowGap: 4 }}>
                    {(!byType || !anyType) && legend}
                    <Txt size={11} tone="faint">
                        {t('zone.catcherView')}
                    </Txt>
                    {missing > 0 && (
                        <Txt size={11} tone="faint">
                            · {t('zone.noTracking', { count: missing })}
                        </Txt>
                    )}
                    {estimated > 0 && (
                        <Txt size={11} tone="faint" center style={{ width: '100%' }}>
                            {estimated === located.length ? t('zone.estimated') : t('zone.estimatedSome', { count: estimated })}
                        </Txt>
                    )}
                </View>
            )}
        </View>
    );
};
