import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useColors } from '../../../theme/theme';
import { alpha, fonts } from '../../../theme/tokens';
import { ChartHotspot, FadeG, MarkerBadge, middle, useAxisText, useSvgId } from './chart';
import { DrawPath } from './DrawPath';
import { useChartBox } from './hooks';
import { LiveDot } from './LiveDot';
import { areaPath, linePath, polylineLength, type Point } from './paths';
import { extent, linearScale, type Domain } from './scale';

export interface WinProbPoint {
    /** Posición en x: índice del turno, o entrada con decimales (2.5 = mitad de la 2.ª) */
    x: number;
    /** Probabilidad del equipo de ARRIBA (el visitante), de 0 a 100: 100 − home de useWinProb */
    top: number;
}

export interface WinProbMarker {
    x: number;
    top: number;
    /** Lo que se ve en el círculo: «1», «2», «3» */
    badge: string;
    /** Lo que se oye: «Sencillo de Mejía en la 2.ª, +12.4 %» */
    name: string;
    onPress?: () => void;
    active?: boolean;
}

export interface WinProbChartProps {
    points: WinProbPoint[];
    /** Arriba el visitante, abajo el local (como la cabecera: visitante a la izquierda) */
    topTeam: { abbrev: string; color: string };
    bottomTeam: { abbrev: string; color: string };
    /** Para el lector, con el dato: «Probabilidad de ganar: LIC 99.9 %, ESC 0.1 %» */
    label: string;
    height?: number;
    /** Dominio en x (si no, el de los puntos); p. ej. [0, totalTurnos] o por entradas */
    xDomain?: Domain;
    /** Rótulos del eje x (entradas) */
    xTicks?: { value: number; label: string; strong?: boolean }[];
    /** Las jugadas que más movieron la probabilidad (se pueden tocar) */
    markers?: WinProbMarker[];
    /** Rótulos «LIC 100 %», «50 %», «ESC 100 %» a la derecha */
    axisLabels?: boolean;
    /** Juego en vivo: el último punto late */
    live?: boolean;
    style?: StyleProp<ViewStyle>;
}

const PAD = { top: 8, right: 4, bottom: 22, left: 4 };

// Probabilidad de ganar partida en el 50 %: arriba el color del visitante, abajo el del local.
// La línea se dibuja al entrar (900 ms) y cada jugada nueva la extiende.
export const WinProbChart: React.FC<WinProbChartProps> = ({ points, topTeam, bottomTeam, label, height = 150, xDomain, xTicks, markers = [], axisLabels = true, live = false, style }) => {
    const colors = useColors();
    const axis = useAxisText();
    const { setNode, onLayout, width, seen } = useChartBox();
    const clipTop = useSvgId('wp-top');
    const clipBottom = useSvgId('wp-bottom');
    const fillTop = useSvgId('wp-fill-top');
    const fillBottom = useSvgId('wp-fill-bottom');
    const labelRoom = axisLabels ? 58 : 0;
    const bottom = height - (xTicks?.length ? PAD.bottom : 6);
    const x = linearScale(xDomain ?? extent(points.map((point) => point.x), [0, 1]), [PAD.left, width - PAD.right - labelRoom]);
    const y = linearScale([0, 100], [bottom, PAD.top]);
    const mid = y(50);
    const pts: Point[] = points.map((point) => [x(point.x), y(Math.min(100, Math.max(0, point.top)))]);
    const last = pts[pts.length - 1];
    const area = areaPath(pts, mid);
    const strong = { fontFamily: fonts.extrabold, fontSize: 10, fill: colors.ink } as const;

    return (
        <View ref={setNode} onLayout={onLayout} style={[{ width: '100%' }, style]}>
            <View accessible accessibilityRole="image" accessibilityLabel={label}>
                <Svg width={width} height={height}>
                    <Defs>
                        <ClipPath id={clipTop}>
                            <Rect x={0} y={0} width={width} height={mid} />
                        </ClipPath>
                        <ClipPath id={clipBottom}>
                            <Rect x={0} y={mid} width={width} height={Math.max(0, height - mid)} />
                        </ClipPath>
                        <LinearGradient id={fillTop} x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={topTeam.color} stopOpacity={0.95} />
                            <Stop offset="1" stopColor={topTeam.color} stopOpacity={0.3} />
                        </LinearGradient>
                        <LinearGradient id={fillBottom} x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={bottomTeam.color} stopOpacity={0.3} />
                            <Stop offset="1" stopColor={bottomTeam.color} stopOpacity={0.95} />
                        </LinearGradient>
                    </Defs>
                    {xTicks?.map((tick) => (
                        <G key={tick.value}>
                            <Line x1={x(tick.value)} x2={x(tick.value)} y1={PAD.top} y2={bottom} stroke={alpha(colors.line, 0.08)} />
                            <SvgText x={x(tick.value)} y={height - 6} textAnchor="middle" {...axis} fill={tick.strong ? colors.ink : colors.muted}>
                                {tick.label}
                            </SvgText>
                        </G>
                    ))}
                    {area ? (
                        <FadeG seen={seen} duration={600}>
                            <Path d={area} fill={`url(#${fillTop})`} clipPath={`url(#${clipTop})`} />
                            <Path d={area} fill={`url(#${fillBottom})`} clipPath={`url(#${clipBottom})`} />
                        </FadeG>
                    ) : null}
                    <Line x1={PAD.left} x2={width - PAD.right - labelRoom} y1={mid} y2={mid} stroke={alpha(colors.line, 0.4)} strokeDasharray="3 3" />
                    {pts.length > 1 && <DrawPath d={linePath(pts)} length={polylineLength(pts)} seen={seen} fill="none" stroke={colors.ink} strokeWidth={1.5} strokeLinejoin="round" />}
                    {last && !live && <Circle cx={last[0]} cy={last[1]} r={3.5} fill={colors.ink} stroke={colors.surface} strokeWidth={1.5} />}
                    {axisLabels && (
                        <G>
                            <SvgText x={width - PAD.right} y={PAD.top + 4} dy={middle(10)} textAnchor="end" {...strong}>
                                {`${topTeam.abbrev} 100 %`}
                            </SvgText>
                            <SvgText x={width - PAD.right} y={mid} dy={middle(11)} textAnchor="end" {...axis}>
                                50 %
                            </SvgText>
                            <SvgText x={width - PAD.right} y={bottom - 4} dy={middle(10)} textAnchor="end" {...strong}>
                                {`${bottomTeam.abbrev} 100 %`}
                            </SvgText>
                        </G>
                    )}
                </Svg>
            </View>
            {/* En vivo, el último punto late (una vista encima del SVG: así late igual en el teléfono y en la web) */}
            {last && live && <LiveDot color={colors.ink} size={8} style={{ position: 'absolute', left: last[0] - 4, top: last[1] - 4 }} />}
            {markers.map((marker) => {
                const cx = x(marker.x);
                const cy = y(Math.min(100, Math.max(0, marker.top)));
                const key = `${marker.x}-${marker.badge}`;
                return marker.onPress ? (
                    <ChartHotspot key={key} x={cx} y={cy} label={marker.name} onPress={marker.onPress} active={marker.active}>
                        <MarkerBadge active={marker.active}>{marker.badge}</MarkerBadge>
                    </ChartHotspot>
                ) : (
                    <View key={key} pointerEvents="none" style={{ position: 'absolute', left: cx - 12, top: cy - 12 }}>
                        <MarkerBadge active={marker.active}>{marker.badge}</MarkerBadge>
                    </View>
                );
            })}
        </View>
    );
};
