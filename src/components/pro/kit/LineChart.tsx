import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useColors } from '../../../theme/theme';
import { alpha, fonts } from '../../../theme/tokens';
import { FadeG, middle, useAxisText } from './chart';
import { DrawPath } from './DrawPath';
import { useChartBox } from './hooks';
import { areaPath, linePath, polylineLength, type Point } from './paths';
import { extent, linearScale, niceDomain, niceTicks, type Domain } from './scale';

export interface LinePoint {
    x: number;
    /** null deja un hueco (día sin juego, dato que no llegó) */
    y: number | null;
}

export interface LineSeries {
    id: string;
    /** Nombre para la leyenda y el lector de pantalla */
    name: string;
    /** Color del equipo (hex) o del tema (colors.accent…) */
    color: string;
    points: LinePoint[];
    /** Punteada (promedio de la liga, proyección): no se dibuja animada, aparece */
    dashed?: boolean;
    /** Grosor (2; el favorito 3.5) */
    width?: number;
    /** Área suave debajo, hasta el piso de la gráfica */
    area?: boolean;
    /** Punto al final */
    endDot?: boolean;
    /** Rótulo al final de la línea («EST», «Tú 96») */
    endLabel?: string;
}

export interface LineChartProps {
    series: LineSeries[];
    /** Qué muestra, para el lector de pantalla: «Juegos sobre .500 por fecha…» (con los datos) */
    label: string;
    height?: number;
    xDomain?: Domain;
    yDomain?: Domain;
    /** Marcas del eje x con su texto («Inicio», «vie 16», «Hoy») */
    xTicks?: { value: number; label: string; strong?: boolean }[];
    /** Marcas del eje y (si no, unas 4 redondas) */
    yTicks?: number[];
    formatY?: (value: number) => string;
    /** Línea de referencia horizontal punteada (.500, promedio de la liga) */
    reference?: { y: number; label?: string };
    /** Franja sombreada en y (la línea de corte del 4.º) */
    band?: { from: number; to: number; label?: string };
    /** Zona sombreada en x (lo que falta por jugar) */
    xBand?: { from: number; to: number; label?: string };
    /** Serie resaltada: las demás quedan al 25 % */
    highlight?: string | null;
    style?: StyleProp<ViewStyle>;
}

const PAD = { top: 10, right: 10, bottom: 22, left: 34 };

// Línea o tendencia multiserie: carrera por la clasificación, puntos por día, OPS móvil, velocidad por pitcheo.
// Las líneas se dibujan al entrar en pantalla (900 ms, escalonadas); las punteadas aparecen.
export const LineChart: React.FC<LineChartProps> = ({ series, label, height = 180, xDomain, yDomain, xTicks, yTicks, formatY = String, reference, band, xBand, highlight = null, style }) => {
    const colors = useColors();
    const axis = useAxisText();
    const { setNode, onLayout, width, seen } = useChartBox();
    const labelRoom = series.some((item) => item.endLabel) ? 44 : 0;
    const allX = series.flatMap((item) => item.points.map((point) => point.x));
    const allY = series.flatMap((item) => item.points.map((point) => point.y));
    if (reference) allY.push(reference.y);
    const xd = xDomain ?? extent(allX, [0, 1]);
    const [rawMin, rawMax] = extent(allY, [0, 1]);
    const yd = yDomain ?? niceDomain(rawMin, rawMax, 4);
    const right = width - PAD.right - labelRoom;
    const x = linearScale(xd, [PAD.left, right]);
    const y = linearScale(yd, [height - PAD.bottom, PAD.top]);
    const ticks = yTicks ?? niceTicks(yd[0], yd[1], 4);
    const small = { fontFamily: fonts.extrabold, fontSize: 10 } as const;

    return (
        <View ref={setNode} onLayout={onLayout} style={[{ width: '100%' }, style]}>
            <View accessible accessibilityRole="image" accessibilityLabel={label}>
                <Svg width={width} height={height}>
                    {xBand && (
                        <G>
                            <Rect x={x(xBand.from)} y={PAD.top} width={Math.max(0, x(xBand.to) - x(xBand.from))} height={height - PAD.top - PAD.bottom} rx={8} fill={alpha(colors.line, 0.05)} stroke={alpha(colors.line, 0.2)} strokeDasharray="3 3" />
                            {xBand.label ? (
                                <SvgText x={x(xBand.from) + 6} y={PAD.top + 14} {...small} fill={colors.muted}>
                                    {xBand.label.toUpperCase()}
                                </SvgText>
                            ) : null}
                        </G>
                    )}
                    {band && (
                        <G>
                            <Rect x={PAD.left} y={y(Math.max(band.from, band.to))} width={Math.max(0, right - PAD.left)} height={Math.abs(y(band.from) - y(band.to))} fill={alpha(colors.accent, 0.12)} />
                            {band.label ? (
                                <SvgText x={PAD.left + 6} y={y(Math.min(band.from, band.to)) - 4} {...small} fill={colors.accentInk}>
                                    {band.label.toUpperCase()}
                                </SvgText>
                            ) : null}
                        </G>
                    )}
                    {ticks.map((tick) => (
                        <G key={tick}>
                            <Line x1={PAD.left} x2={right} y1={y(tick)} y2={y(tick)} stroke={alpha(colors.line, 0.08)} />
                            <SvgText x={PAD.left - 6} y={y(tick)} dy={middle(11)} textAnchor="end" {...axis}>
                                {formatY(tick)}
                            </SvgText>
                        </G>
                    ))}
                    {reference && (
                        <G>
                            <Line x1={PAD.left} x2={right} y1={y(reference.y)} y2={y(reference.y)} stroke={alpha(colors.line, 0.4)} strokeDasharray="4 4" />
                            {reference.label ? (
                                <SvgText x={right} y={y(reference.y) - 5} textAnchor="end" fontFamily={fonts.bold} fontSize={10} fill={colors.muted}>
                                    {reference.label}
                                </SvgText>
                            ) : null}
                        </G>
                    )}
                    {xTicks?.map((tick) => (
                        <SvgText key={tick.value} x={x(tick.value)} y={height - 6} textAnchor="middle" {...axis} fill={tick.strong ? colors.accentInk : colors.muted}>
                            {tick.label}
                        </SvgText>
                    ))}
                    {series.map((item, index) => {
                        const points: (Point | null)[] = item.points.map((point) => (point.y === null ? null : [x(point.x), y(point.y)]));
                        const solid = points.filter((point): point is Point => point !== null);
                        const last = solid[solid.length - 1];
                        const dim = highlight !== null && highlight !== item.id;
                        const strokeWidth = item.width ?? 2;
                        return (
                            <G key={item.id} opacity={dim ? 0.25 : 1}>
                                {item.area && solid.length > 1 && (
                                    <FadeG seen={seen} index={index}>
                                        <Path d={areaPath(solid, height - PAD.bottom)} fill={item.color} opacity={0.14} />
                                    </FadeG>
                                )}
                                {item.dashed ? (
                                    <FadeG seen={seen} index={index}>
                                        <Path d={linePath(points)} fill="none" stroke={item.color} strokeWidth={strokeWidth} strokeDasharray="4 4" strokeLinecap="round" />
                                    </FadeG>
                                ) : (
                                    <DrawPath d={linePath(points)} length={polylineLength(points)} seen={seen} index={index} fill="none" stroke={item.color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
                                )}
                                {item.endDot && last && <Circle cx={last[0]} cy={last[1]} r={strokeWidth + 2} fill={item.color} stroke={colors.surface} strokeWidth={2} />}
                                {item.endLabel && last ? (
                                    <SvgText x={last[0] + 8} y={last[1]} dy={middle(11)} fontFamily={fonts.extrabold} fontSize={11} fill={colors.ink}>
                                        {item.endLabel}
                                    </SvgText>
                                ) : null}
                            </G>
                        );
                    })}
                </Svg>
            </View>
        </View>
    );
};
