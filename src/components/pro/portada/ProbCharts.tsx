// Probabilidad de ganar en la portada PRO (datos de MLB, turno por turno): la barra de ahora, la tira de la tarjeta
// en vivo (por entradas, con sitio para las que faltan), el vaivén de la tarjeta final y la minigráfica de las finales
// compactas. Arriba el visitante y abajo el local, cada uno con su color; la línea se dibuja al entrar en pantalla.
import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { PortadaWinProb } from '../../../lib/pro/pantallas';
import { useColors } from '../../../theme/theme';
import { alpha, fonts, radius } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { DrawPath, FadeG, MOTION_EASE, MOTION_MS, areaPath, clamp, fmtPercent, linePath, linearScale, middle, polylineLength, useChartBox, useGrow, useInView, useMotion, useSvgId, type Domain, type Point } from '../kit';
import { inningPoints, inningSpans, inningsShown, playPoints, teamText, type ProbPoint } from './logic';

interface Side {
    abbrev: string;
    name: string;
    color: string;
}

interface AreaProps {
    points: ProbPoint[];
    xDomain: Domain;
    width: number;
    height: number;
    away: Side;
    home: Side;
    seen: boolean;
    /** x de las rayas verticales (entradas) */
    grid?: number[];
    /** Siglas a la izquierda, arriba y abajo */
    labels?: boolean;
    radius?: number;
}

// Área partida en el 50 %: lo de arriba con el color del visitante y lo de abajo con el del local
const ProbArea: React.FC<AreaProps> = ({ points, xDomain, width, height, away, home, seen, grid = [], labels = false, radius: corner = 8 }) => {
    const colors = useColors();
    const clipTop = useSvgId('pp-top');
    const clipBottom = useSvgId('pp-bottom');
    const x = linearScale(xDomain, [0, width]);
    const y = linearScale([0, 100], [height, 0]);
    const mid = height / 2;
    const pts: Point[] = points.map((point) => [x(point.x), y(clamp(point.top, 0, 100))]);
    const area = areaPath(pts, mid);
    return (
        <>
            <Defs>
                <ClipPath id={clipTop}>
                    <Rect x={0} y={0} width={width} height={mid} />
                </ClipPath>
                <ClipPath id={clipBottom}>
                    <Rect x={0} y={mid} width={width} height={Math.max(0, height - mid)} />
                </ClipPath>
            </Defs>
            <Rect x={0} y={0} width={width} height={height} rx={corner} fill={alpha(colors.line, 0.04)} />
            {grid.map((value) => (
                <Line key={value} x1={x(value)} x2={x(value)} y1={0} y2={height} stroke={alpha(colors.line, 0.08)} strokeWidth={1} />
            ))}
            {area ? (
                <FadeG seen={seen} index={12} step={40} duration={MOTION_MS.count}>
                    <Path d={area} fill={away.color} fillOpacity={0.85} clipPath={`url(#${clipTop})`} />
                    <Path d={area} fill={home.color} fillOpacity={0.85} clipPath={`url(#${clipBottom})`} />
                </FadeG>
            ) : null}
            <Line x1={0} x2={width} y1={mid} y2={mid} stroke={alpha(colors.line, 0.3)} strokeWidth={1} strokeDasharray="3 3" />
            {pts.length > 1 && <DrawPath d={linePath(pts)} length={polylineLength(pts)} seen={seen} fill="none" stroke={colors.ink} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
            {labels && (
                <G>
                    <SvgText x={5} y={Math.min(11, mid - 3)} fontFamily={fonts.extrabold} fontSize={9} fill={colors.ink}>
                        {away.abbrev}
                    </SvgText>
                    <SvgText x={5} y={height - 4} fontFamily={fonts.extrabold} fontSize={9} fill={colors.ink}>
                        {home.abbrev}
                    </SvgText>
                </G>
            )}
        </>
    );
};

interface ProbProps {
    winProb: PortadaWinProb;
    away: Side;
    home: Side;
    style?: StyleProp<ViewStyle>;
}

const pct = (value: number, lang: string) => fmtPercent(value, 1, lang, true);

/** Barra de ahora en los dos colores: «LIC 38 % · EST 62 %»; se desliza (600 ms) cuando cambia */
export const ProbBar: React.FC<ProbProps> = ({ winProb, away, home, style }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    const last = winProb.last;
    const share = last ? clamp(last.away / Math.max(1, last.away + last.home), 0.02, 0.98) : 0.5;
    const grow = useGrow(share, seen, 0, MOTION_MS.count);
    const left = useAnimatedStyle(() => ({ width: `${grow.get() * 100}%` }));
    if (!last) return null;
    const lang = i18n.language;
    return (
        <View style={[{ gap: 7 }, style]}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8, rowGap: 2 }}>
                <Txt eyebrow>{t('pro.portada.live.winProb')}</Txt>
                <Txt size={13} weight="extrabold" tabular numberOfLines={1}>
                    <Txt size={13} weight="extrabold" color={teamText(away.color, colors.ink)}>{`${away.abbrev} ${pct(last.away, lang)}`}</Txt>
                    <Txt size={13} weight="extrabold" tone="muted">
                        {' · '}
                    </Txt>
                    <Txt size={13} weight="extrabold" color={teamText(home.color, colors.ink)}>{`${home.abbrev} ${pct(last.home, lang)}`}</Txt>
                </Txt>
            </View>
            <View
                ref={setNode}
                onLayout={onLayout}
                accessible
                accessibilityRole="image"
                accessibilityLabel={t('pro.portada.live.winProbAria', { away: away.name, awayPct: pct(last.away, lang), home: home.name, homePct: pct(last.home, lang) })}
                style={{ height: 10, flexDirection: 'row', borderRadius: radius.pill, overflow: 'hidden', backgroundColor: home.color }}
            >
                {/* Lo del visitante crece desde la izquierda; una raya del fondo separa los dos colores */}
                <Animated.View style={[{ height: 10, backgroundColor: away.color, borderRightWidth: 2, borderRightColor: colors.surface }, left]} />
            </View>
        </View>
    );
};

/** Tira de la tarjeta en vivo (30 px): por entradas, con el sitio de las que faltan */
export const ProbStrip: React.FC<ProbProps & { scheduled?: number }> = ({ winProb, away, home, scheduled = 9, style }) => {
    const { t, i18n } = useTranslation();
    const { setNode, onLayout, width, seen } = useChartBox(326);
    const innings = inningsShown(winProb, scheduled);
    const points = inningPoints(winProb);
    const last = winProb.last;
    const height = 30;
    return (
        <View style={style}>
            <View
                ref={setNode}
                onLayout={onLayout}
                accessible
                accessibilityRole="image"
                accessibilityLabel={t('pro.portada.live.stripAria', {
                    away: away.name,
                    home: home.name,
                    awayPct: last ? pct(last.away, i18n.language) : '—',
                    homePct: last ? pct(last.home, i18n.language) : '—'
                })}
            >
                <Svg width={width} height={height}>
                    <ProbArea points={points} xDomain={[0, innings]} width={width} height={height} away={away} home={home} seen={seen} grid={Array.from({ length: innings - 1 }, (_, index) => index + 1)} labels />
                </Svg>
            </View>
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={11} weight="semibold" tone="muted">
                    {t('pro.portada.live.firstInning')}
                </Txt>
                <Txt size={11} weight="semibold" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {t('pro.portada.live.byPlay')}
                </Txt>
                <Txt size={11} weight="semibold" tone="muted">
                    {t('pro.portada.live.lastInning', { n: innings })}
                </Txt>
            </View>
        </View>
    );
};

// El punto de la jugada del juego: una onda que late UNA vez cuando la gráfica entra (después de dibujarse)
const KeyPing: React.FC<{ x: number; y: number; seen: boolean; color: string }> = ({ x, y, seen, color }) => {
    const colors = useColors();
    const motion = useMotion();
    const wave = useSharedValue(0);
    useEffect(() => {
        if (!motion.animate || !seen) return;
        wave.set(withDelay(1200, withSequence(withTiming(1, { duration: 1100, easing: MOTION_EASE }), withTiming(0, { duration: 0 }))));
        return () => cancelAnimation(wave);
    }, [motion.animate, seen, wave]);
    const ring = useAnimatedStyle(() => ({ opacity: wave.get() > 0 ? 1 - wave.get() : 0, transform: [{ scale: 1 + wave.get() * 1.8 }] }));
    return (
        <View pointerEvents="none" style={{ position: 'absolute', left: x - 6, top: y - 6, width: 12, height: 12 }}>
            {motion.animate && <Animated.View style={[{ position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.ink }, ring]} />}
            <View style={{ position: 'absolute', left: 1.5, top: 1.5, width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#ffffff', borderWidth: 2, borderColor: color }} />
        </View>
    );
};

/** Vaivén de la tarjeta final (60 px + entradas): un punto por turno y la jugada del juego marcada */
export const ProbSwing: React.FC<ProbProps & { keyAt?: number | null; markerColor?: string; label: string }> = ({ winProb, away, home, keyAt, markerColor, label, style }) => {
    const colors = useColors();
    const { setNode, onLayout, width, seen } = useChartBox(326);
    const points = playPoints(winProb);
    const spans = inningSpans(winProb);
    const domain: Domain = [-0.5, Math.max(points.length - 0.5, 0.5)];
    const x = linearScale(domain, [0, width]);
    const chart = 60;
    const y = linearScale([0, 100], [chart, 0]);
    const marker = keyAt !== null && keyAt !== undefined && points[keyAt] ? points[keyAt] : null;
    return (
        <View ref={setNode} onLayout={onLayout} style={[{ width: '100%' }, style]}>
            <View accessible accessibilityRole="image" accessibilityLabel={label}>
                <Svg width={width} height={chart + 16}>
                    <ProbArea points={points} xDomain={domain} width={width} height={chart} away={away} home={home} seen={seen} grid={spans.slice(1).map((span) => span.from - 0.5)} labels radius={10} />
                    {spans.map((span) => (
                        <SvgText key={span.inning} x={x((span.from + span.to) / 2)} y={chart + 8} dy={middle(9)} textAnchor="middle" fontFamily={fonts.bold} fontSize={9} fill={colors.muted}>
                            {String(span.inning)}
                        </SvgText>
                    ))}
                </Svg>
            </View>
            {marker && <KeyPing x={x(marker.x)} y={y(clamp(marker.top, 0, 100))} seen={seen} color={markerColor ?? colors.ink} />}
        </View>
    );
};

/** Minigráfica de las finales compactas (76 × 30) */
export const ProbSpark: React.FC<ProbProps & { label: string }> = ({ winProb, away, home, label, style }) => {
    const { setNode, onLayout, seen } = useInView();
    const points = playPoints(winProb);
    return (
        <View ref={setNode} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label} style={[{ width: 76, height: 30, flexShrink: 0 }, style]}>
            <Svg width={76} height={30}>
                <ProbArea points={points} xDomain={[0, Math.max(points.length - 1, 1)]} width={76} height={30} away={away} home={home} seen={seen} radius={6} />
            </Svg>
        </View>
    );
};

/** Punto suelto (sin uso fuera de aquí): el círculo del final de la tira */
export const EndDot: React.FC<{ cx: number; cy: number }> = ({ cx, cy }) => {
    const colors = useColors();
    return <Circle cx={cx} cy={cy} r={3} fill={colors.ink} />;
};
