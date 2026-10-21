import React, { useEffect } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Pitch } from '../../../../types';
import type { ProPitch } from '../../../../lib/pro/juego';
import { pitchTypeColor } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { alpha, fonts, type Palette } from '../../../../theme/tokens';
import { BatterFigure, type UniformColors } from '../../../game/BatterFigure';
import { MOTION_EASE, MOTION_MS, middle, readableInk, useMotion, useProColors } from '../../kit';

// Zona de strike PRO en pies reales, vista del receptor (la misma geometría que la zona del Lite): bateador
// uniformado, puntos del color del tipo de pitcheo con el número o la velocidad dentro, anillo ✓/✗ en los
// pitcheos retados por ABS y el último pitcheo con un pulso y una estela corta. Es una sola imagen para el lector:
// los toques van en botones encima, y la lista de pitcheos de al lado es la vía accesible.

const UNIT = 100;
const HALF_WIDTH = 2.35;
const TOP_FT = 5.45;
const GROUND = TOP_FT * UNIT + 20;
const VIEW_W = HALF_WIDTH * 2 * UNIT;
const VIEW_H = GROUND + 40;
const HALF_PLATE = 17 / 12 / 2;
const STD_TOP = 3.4;
const STD_BOT = 1.6;

const sx = (pX: number) => VIEW_W / 2 + pX * UNIT;
const sy = (pZ: number) => GROUND - pZ * UNIT;
const clampTo = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const median = (values: number[], fallback: number) => {
    const list = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    return list.length ? list[Math.floor(list.length / 2)] : fallback;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

export interface ZoneItem {
    pitch: Pitch;
    pro: ProPitch | null;
}

interface ZoneFieldProps {
    items: ZoneItem[];
    /** 'sequence': un turno (número o velocidad dentro); 'cloud': muchos bateadores, zona normalizada y puntos chicos */
    mode?: 'sequence' | 'cloud';
    /** Qué va dentro de cada punto en 'sequence' */
    inner?: 'number' | 'speed';
    batterSide?: string | null;
    uniform?: UniformColors;
    selected?: number | null;
    onSelect?: (index: number) => void;
    /** Rótulos del tope y el fondo de la zona («3.3 pies») */
    heights?: (feet: number) => string;
    label: string;
    /** Ancho máximo del dibujo */
    maxWidth?: number;
    style?: StyleProp<ViewStyle>;
}

/** Color de un pitcheo: su tipo; sin tipo (estadio sin rastreo), su resultado */
export const pitchColor = (pitch: Pick<Pitch, 'type' | 'r'>, typed: boolean, colors: Palette) => (typed ? pitchTypeColor(pitch.type) : colors[pitch.r]);

/** Pulso y estela del pitcheo que acaba de entrar (una vez, 500 ms) */
const LastPulse: React.FC<{ cx: number; cy: number; r: number; color: string }> = ({ cx, cy, r, color }) => {
    const progress = useSharedValue(0);
    useEffect(() => {
        progress.set(withTiming(1, { duration: MOTION_MS.bar, easing: MOTION_EASE }));
        return () => cancelAnimation(progress);
    }, [progress]);
    const ping = useAnimatedProps(() => ({ r: r * (1 + progress.get() * 0.9), opacity: 0.5 * (1 - progress.get()) }));
    const trail = useAnimatedProps(() => ({ opacity: 0.35 * (1 - progress.get()) }));
    return (
        <G>
            <AnimatedLine x1={cx} y1={cy - r * 4.2} x2={cx} y2={cy - r} stroke={color} strokeWidth={r * 0.7} strokeLinecap="round" animatedProps={trail} />
            <AnimatedCircle cx={cx} cy={cy} fill={color} animatedProps={ping} />
        </G>
    );
};

export const ZoneField: React.FC<ZoneFieldProps> = ({ items, mode = 'sequence', inner = 'number', batterSide, uniform, selected = null, onSelect, heights, label, maxWidth = 340, style }) => {
    const colors = useColors();
    const pro = useProColors();
    const motion = useMotion();
    const cloud = mode === 'cloud';
    const top = cloud ? STD_TOP : median(items.map(({ pitch }) => pitch.top ?? NaN), STD_TOP);
    const bot = cloud ? STD_BOT : median(items.map(({ pitch }) => pitch.bot ?? NaN), STD_BOT);
    const zoneLeft = sx(-HALF_PLATE);
    const zoneWidth = HALF_PLATE * 2 * UNIT;
    const zoneTop = sy(top);
    const zoneHeight = (top - bot) * UNIT;
    const typed = items.some(({ pitch }) => pitch.type);
    const radius = cloud ? 11 : inner === 'speed' ? 21 : 18;
    const side = batterSide === 'L' ? 'L' : batterSide === 'R' ? 'R' : null;

    const located = items
        .map((item, index) => ({ ...item, index }))
        .filter(({ pitch }) => pitch.x !== null && pitch.z !== null)
        .map((item) => {
            let z = item.pitch.z as number;
            if (cloud && item.pitch.top && item.pitch.bot && item.pitch.top > item.pitch.bot) {
                z = STD_BOT + ((z - item.pitch.bot) / (item.pitch.top - item.pitch.bot)) * (STD_TOP - STD_BOT);
            }
            const x = item.pitch.x as number;
            return { ...item, cx: sx(clampTo(x, -HALF_WIDTH + 0.2, HALF_WIDTH - 0.2)), cy: sy(clampTo(z, 0.2, TOP_FT - 0.2)) };
        });
    const lastIndex = located.length ? located[located.length - 1].index : -1;

    return (
        <View style={[{ width: '100%', maxWidth, alignSelf: 'center' }, style]}>
            <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: '100%', aspectRatio: VIEW_W / VIEW_H }}>
                <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
                    {side && !cloud && <BatterFigure side={side} top={top} bot={bot} colors={uniform ?? { jersey: colors.faint, trim: colors.muted, pants: colors.raised }} sx={sx} sy={sy} unit={UNIT} />}

                    {/* Una bola por fuera de la zona (lo que todavía puede ser strike) y la zona 3 × 3 */}
                    <Rect x={zoneLeft - 15} y={zoneTop - 15} width={zoneWidth + 30} height={zoneHeight + 30} rx={10} fill={alpha(colors.zoneBg, 0.03)} stroke={alpha(colors.zoneBg, 0.14)} strokeDasharray="6 6" />
                    <Rect x={zoneLeft} y={zoneTop} width={zoneWidth} height={zoneHeight} fill={alpha(colors.zoneBg, 0.05)} stroke={alpha(colors.zoneBg, 0.6)} strokeWidth={3} />
                    {[1, 2].map((step) => (
                        <G key={step} stroke={alpha(colors.zoneBg, 0.2)} strokeWidth={1.5}>
                            <Line x1={zoneLeft + (zoneWidth * step) / 3} y1={zoneTop} x2={zoneLeft + (zoneWidth * step) / 3} y2={zoneTop + zoneHeight} />
                            <Line x1={zoneLeft} y1={zoneTop + (zoneHeight * step) / 3} x2={zoneLeft + zoneWidth} y2={zoneTop + (zoneHeight * step) / 3} />
                        </G>
                    ))}
                    {heights && !cloud && (
                        <G>
                            <SvgText x={zoneLeft - 26} y={zoneTop + middle(19)} textAnchor="end" fontSize={19} fontFamily={fonts.semibold} fill={colors.muted}>
                                {heights(top)}
                            </SvgText>
                            <SvgText x={zoneLeft - 26} y={zoneTop + zoneHeight + middle(19)} textAnchor="end" fontSize={19} fontFamily={fonts.semibold} fill={colors.muted}>
                                {heights(bot)}
                            </SvgText>
                        </G>
                    )}
                    <Path
                        d={`M ${sx(-HALF_PLATE)} ${GROUND + 6} L ${sx(HALF_PLATE)} ${GROUND + 6} L ${sx(HALF_PLATE)} ${GROUND + 16} L ${sx(0)} ${GROUND + 28} L ${sx(-HALF_PLATE)} ${GROUND + 16} Z`}
                        fill={alpha(colors.zoneBg, 0.2)}
                    />

                    {located.map(({ pitch, pro: extra, index, cx, cy }) => {
                        const color = pitchColor(pitch, typed, colors);
                        const isLast = index === lastIndex && !cloud;
                        const isSelected = selected === index;
                        const dim = selected !== null && !isSelected;
                        // Bola: punto hueco; strike: lleno; en juego: lleno con anillo de tinta
                        const ball = pitch.r === 'ball' || pitch.r === 'hbp';
                        const review = extra?.rev && extra.rev.type === 'MJ' ? extra.rev : null;
                        const fontSize = inner === 'speed' ? 15 : 19;
                        return (
                            <G key={`${index}-${pitch.n}`} opacity={dim ? 0.3 : cloud ? 0.85 : 1}>
                                {isLast && motion.animate && <LastPulse key={`${index}-${items.length}`} cx={cx} cy={cy} r={radius} color={color} />}
                                {(isSelected || (isLast && selected === null)) && <Circle cx={cx} cy={cy} r={radius + 8} fill="none" stroke={color} strokeWidth={3.5} opacity={0.6} />}
                                {review && <Circle cx={cx} cy={cy} r={radius + 5} fill="none" stroke={colors.ink} strokeWidth={3} strokeDasharray={review.over ? undefined : '5 4'} />}
                                <Circle
                                    cx={cx}
                                    cy={cy}
                                    r={radius}
                                    fill={color}
                                    fillOpacity={ball && !cloud ? 0.28 : 1}
                                    stroke={ball && !cloud ? color : pitch.r === 'inplay' && !cloud ? colors.ink : colors.surface}
                                    strokeWidth={ball && !cloud ? 4 : 3}
                                />
                                {!cloud && (
                                    <SvgText x={cx} y={cy + middle(fontSize)} textAnchor="middle" fontSize={fontSize} fontFamily={fonts.extrabold} fill={ball ? colors.ink : readableInk(color)}>
                                        {inner === 'speed' ? (typeof pitch.mph === 'number' ? pitch.mph.toFixed(1) : String(pitch.n ?? index + 1)) : String(pitch.n ?? index + 1)}
                                    </SvgText>
                                )}
                                {review && !cloud && (
                                    <G transform={`translate(${cx + radius * 0.85} ${cy - radius * 0.85})`}>
                                        <Circle r={10} fill={review.over ? pro.up : pro.down} stroke={colors.surface} strokeWidth={2.5} />
                                        <Path d={review.over ? 'M -4.5 0.5 L -1.5 3.5 L 4.5 -3' : 'M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5'} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                                    </G>
                                )}
                            </G>
                        );
                    })}
                </Svg>
                {/* Botones de 44 px encima de cada pitcheo (la lista del turno es la vía para el lector) */}
                {onSelect &&
                    !cloud &&
                    located.map(({ index, cx, cy }) => (
                        <Pressable
                            key={`hit-${index}`}
                            onPress={() => onSelect(index)}
                            accessibilityElementsHidden
                            importantForAccessibility="no"
                            style={{ position: 'absolute', left: `${(cx / VIEW_W) * 100}%`, top: `${(cy / VIEW_H) * 100}%`, width: 44, height: 44, marginLeft: -22, marginTop: -22, borderRadius: 22 }}
                        />
                    ))}
            </View>
        </View>
    );
};
