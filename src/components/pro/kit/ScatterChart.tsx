import React from 'react';
import { Pressable, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { useColors } from '../../../theme/theme';
import { alpha, fonts } from '../../../theme/tokens';
import { FadeG, middle, useAxisText } from './chart';
import { useChartBox } from './hooks';
import { LiveDot } from './LiveDot';
import { linearScale, niceTicks, type Domain } from './scale';

export interface ScatterPoint {
    id: string;
    x: number;
    y: number;
    /** Color del equipo o del tipo de pitcheo */
    color: string;
    /** Para el lector de pantalla */
    name: string;
    /** Rótulo visible junto al punto («SI», «G. Celestino») */
    label?: string;
    /** Radio en px (5) */
    r?: number;
    /** Radio de la nube punteada alrededor (la dispersión de un tipo de pitcheo) */
    halo?: number;
    /** Tenue (lo que no pasa el filtro) */
    muted?: boolean;
}

export interface ScatterChartProps {
    points: ScatterPoint[];
    /** Para el lector, con el dato: «OBP contra SLG de 37 calificados; Celestino .418 y .402» */
    label: string;
    xDomain: Domain;
    yDomain: Domain;
    height?: number;
    xTicks?: number[];
    yTicks?: number[];
    formatX?: (value: number) => string;
    formatY?: (value: number) => string;
    /** Título de los ejes («HB · quiebre horizontal», «IVB · subida inducida») */
    xLabel?: string;
    yLabel?: string;
    /** Líneas de referencia (0, promedio de la liga): forman los cuadrantes */
    refX?: { value: number; label?: string };
    refY?: { value: number; label?: string };
    /** Rótulos de cada cuadrante («ÉLITE», «SOLO PODER») */
    quadrants?: { tl?: string; tr?: string; bl?: string; br?: string };
    /** Cuadrante sombreado con el acento */
    highlightQuadrant?: 'tl' | 'tr' | 'bl' | 'br';
    /** Punto elegido: lleva anillo y late */
    selectedId?: string | null;
    /** Tocar cerca de un punto (24 px) lo elige. La pantalla debe dar otra vía para el lector (buscador o lista). */
    onSelect?: (id: string) => void;
    style?: StyleProp<ViewStyle>;
}

const PAD = { top: 10, right: 12, bottom: 34, left: 44 };

// Nube de puntos: IVB vs HB por tipo de pitcheo, OBP vs SLG de los calificados, velocidad de salida vs ángulo.
export const ScatterChart: React.FC<ScatterChartProps> = ({
    points,
    label,
    xDomain,
    yDomain,
    height = 260,
    xTicks,
    yTicks,
    formatX = String,
    formatY = String,
    xLabel,
    yLabel,
    refX,
    refY,
    quadrants,
    highlightQuadrant,
    selectedId = null,
    onSelect,
    style
}) => {
    const colors = useColors();
    const axis = useAxisText();
    const { setNode, onLayout, width, seen } = useChartBox();
    const left = PAD.left;
    const right = width - PAD.right;
    const top = PAD.top;
    const bottom = height - PAD.bottom;
    const x = linearScale(xDomain, [left, right]);
    const y = linearScale(yDomain, [bottom, top]);
    const xt = xTicks ?? niceTicks(xDomain[0], xDomain[1], 4);
    const yt = yTicks ?? niceTicks(yDomain[0], yDomain[1], 4);
    const cx = refX ? x(refX.value) : (left + right) / 2;
    const cy = refY ? y(refY.value) : (top + bottom) / 2;
    const small = { fontFamily: fonts.bold, fontSize: 10, fill: colors.muted } as const;
    const selected = points.find((point) => point.id === selectedId);

    const pick = (event: GestureResponderEvent) => {
        if (!onSelect) return;
        const { locationX, locationY } = event.nativeEvent;
        let best: { id: string; d: number } | null = null;
        for (const point of points) {
            const d = Math.hypot(x(point.x) - locationX, y(point.y) - locationY);
            if (d <= 24 && (!best || d < best.d)) best = { id: point.id, d };
        }
        if (best) onSelect(best.id);
    };

    const quadrantRect = (which: 'tl' | 'tr' | 'bl' | 'br') => {
        const qx = which.endsWith('l') ? left : cx;
        const qy = which.startsWith('t') ? top : cy;
        return { x: qx, y: qy, w: which.endsWith('l') ? cx - left : right - cx, h: which.startsWith('t') ? cy - top : bottom - cy };
    };
    const lit = highlightQuadrant ? quadrantRect(highlightQuadrant) : null;

    const chart = (
        <Svg width={width} height={height}>
            {lit && <Rect x={lit.x} y={lit.y} width={Math.max(0, lit.w)} height={Math.max(0, lit.h)} fill={alpha(colors.accent, 0.12)} />}
            {xt.map((tick) => (
                <G key={`x${tick}`}>
                    <Line x1={x(tick)} x2={x(tick)} y1={top} y2={bottom} stroke={alpha(colors.line, 0.07)} />
                    <SvgText x={x(tick)} y={bottom + 14} textAnchor="middle" {...axis}>
                        {formatX(tick)}
                    </SvgText>
                </G>
            ))}
            {yt.map((tick) => (
                <G key={`y${tick}`}>
                    <Line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke={alpha(colors.line, 0.07)} />
                    <SvgText x={left - 6} y={y(tick)} dy={middle(11)} textAnchor="end" {...axis}>
                        {formatY(tick)}
                    </SvgText>
                </G>
            ))}
            {refX && <Line x1={cx} x2={cx} y1={top} y2={bottom} stroke={alpha(colors.line, 0.4)} strokeDasharray="4 4" />}
            {refY && <Line x1={left} x2={right} y1={cy} y2={cy} stroke={alpha(colors.line, 0.4)} strokeDasharray="4 4" />}
            {refX?.label ? (
                <SvgText x={cx + 4} y={top + 10} {...small}>
                    {refX.label}
                </SvgText>
            ) : null}
            {refY?.label ? (
                <SvgText x={right - 2} y={cy - 5} textAnchor="end" {...small}>
                    {refY.label}
                </SvgText>
            ) : null}
            {quadrants &&
                (['tl', 'tr', 'bl', 'br'] as const).map((which) => {
                    const text = quadrants[which];
                    if (!text) return null;
                    const q = quadrantRect(which);
                    const isLeft = which.endsWith('l');
                    const isTop = which.startsWith('t');
                    return (
                        <SvgText key={which} x={isLeft ? q.x + 8 : q.x + q.w - 8} y={isTop ? q.y + 16 : q.y + q.h - 8} textAnchor={isLeft ? 'start' : 'end'} fontFamily={fonts.extrabold} fontSize={10} letterSpacing={0.6} fill={colors.muted}>
                            {text.toUpperCase()}
                        </SvgText>
                    );
                })}
            {points.map((point, index) => {
                const px = x(point.x);
                const py = y(point.y);
                const r = point.r ?? 5;
                const isSelected = point.id === selectedId;
                return (
                    <FadeG key={point.id} seen={seen} index={index} step={15} opacity={point.muted ? 0.3 : 1}>
                        {point.halo ? <Circle cx={px} cy={py} r={point.halo} fill={point.color} fillOpacity={0.12} stroke={point.color} strokeOpacity={0.6} strokeDasharray="3 3" /> : null}
                        <Circle cx={px} cy={py} r={isSelected ? r + 2 : r} fill={point.color} stroke={isSelected ? colors.ink : colors.surface} strokeWidth={isSelected ? 2.5 : 1.5} />
                        {point.label ? (
                            <SvgText x={px} y={py + r + 12} textAnchor="middle" fontFamily={fonts.extrabold} fontSize={11} fill={colors.ink}>
                                {point.label}
                            </SvgText>
                        ) : null}
                    </FadeG>
                );
            })}
            {xLabel ? (
                <SvgText x={(left + right) / 2} y={height - 2} textAnchor="middle" fontFamily={fonts.bold} fontSize={11} fill={colors.muted}>
                    {xLabel}
                </SvgText>
            ) : null}
            {yLabel ? (
                <SvgText x={12} y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(top + bottom) / 2})`} fontFamily={fonts.bold} fontSize={11} fill={colors.muted}>
                    {yLabel}
                </SvgText>
            ) : null}
        </Svg>
    );

    return (
        <View ref={setNode} onLayout={onLayout} style={[{ width: '100%' }, style]}>
            <View accessible accessibilityRole="image" accessibilityLabel={label}>
                {onSelect ? (
                    <Pressable onPress={pick} accessible={false}>
                        {chart}
                    </Pressable>
                ) : (
                    chart
                )}
            </View>
            {/* El punto elegido late: una onda encima del SVG (el punto ya está dibujado) */}
            {selected && <LiveDot color={selected.color} core={false} size={(selected.r ?? 5) * 2 + 4} style={{ position: 'absolute', left: x(selected.x) - (selected.r ?? 5) - 2, top: y(selected.y) - (selected.r ?? 5) - 2 }} />}
        </View>
    );
};
