import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Line, Text as SvgText } from 'react-native-svg';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { ChartHotspot, MarkerBadge, middle, useAxisText } from './chart';
import { DrawPath } from './DrawPath';
import { useChartBox } from './hooks';
import { stepLength, stepPath } from './paths';
import { linearScale, niceDomain, niceTicks } from './scale';

export interface StepSeries {
    id: string;
    name: string;
    /** Color del equipo */
    color: string;
    /** Carreras ACUMULADAS al terminar cada entrada (1.ª, 2.ª…); se corta donde va el juego */
    values: number[];
}

export interface StepMarker {
    seriesId: string;
    /** Entrada (1 = la 1.ª) */
    inning: number;
    /** Texto del círculo: «HR» */
    badge: string;
    /** «Jonrón de Made en la 1.ª» */
    name: string;
    onPress?: () => void;
}

export interface StepChartProps {
    series: StepSeries[];
    /** Entradas del eje (9, o las extras que hubo) */
    innings: number;
    /** Para el lector, con el dato: «Marcador por entrada: LIC 12, ESC 2…» */
    label: string;
    height?: number;
    markers?: StepMarker[];
    /** Entrada en curso (rótulo resaltado) */
    currentInning?: number | null;
    style?: StyleProp<ViewStyle>;
}

const PAD = { top: 10, right: 26, bottom: 22, left: 8 };

// Gráfica del marcador: escalones por entrada en el color de cada equipo, con círculos en los jonrones.
export const StepChart: React.FC<StepChartProps> = ({ series, innings, label, height = 150, markers = [], currentInning = null, style }) => {
    const colors = useColors();
    const axis = useAxisText();
    const { setNode, onLayout, width, seen } = useChartBox();
    const total = Math.max(1, innings);
    const maxRuns = Math.max(1, ...series.flatMap((item) => item.values));
    const [, top] = niceDomain(0, maxRuns, 3);
    const x = linearScale([0, total], [PAD.left, width - PAD.right]);
    const y = linearScale([0, top], [height - PAD.bottom, PAD.top]);
    const ticks = niceTicks(0, top, 3);
    const inningX = (inning: number) => x(inning - 0.5);

    return (
        <View ref={setNode} onLayout={onLayout} style={[{ width: '100%' }, style]}>
            <View accessible accessibilityRole="image" accessibilityLabel={label}>
                <Svg width={width} height={height}>
                    {ticks.map((tick) => (
                        <G key={tick}>
                            <Line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={alpha(colors.line, 0.08)} />
                            <SvgText x={width - PAD.right + 6} y={y(tick)} dy={middle(11)} {...axis}>
                                {String(tick)}
                            </SvgText>
                        </G>
                    ))}
                    {Array.from({ length: total }, (_, index) => (
                        <SvgText key={index} x={inningX(index + 1)} y={height - 6} textAnchor="middle" {...axis} fill={currentInning === index + 1 ? colors.ink : colors.muted}>
                            {String(index + 1)}
                        </SvgText>
                    ))}
                    {series.map((item, index) => {
                        const values = item.values.slice(0, total);
                        return (
                            <DrawPath
                                key={item.id}
                                d={stepPath(values, x, y)}
                                length={stepLength(values, x, y)}
                                seen={seen}
                                index={index}
                                fill="none"
                                stroke={item.color}
                                strokeWidth={2.5}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        );
                    })}
                </Svg>
            </View>
            {markers.map((marker) => {
                const item = series.find((entry) => entry.id === marker.seriesId);
                const runs = item?.values[marker.inning - 1];
                if (runs === undefined) return null;
                const cx = inningX(marker.inning);
                const cy = y(runs);
                const key = `${marker.seriesId}-${marker.inning}-${marker.badge}`;
                const badge = <MarkerBadge color={colors.gold}>{marker.badge}</MarkerBadge>;
                return marker.onPress ? (
                    <ChartHotspot key={key} x={cx} y={cy} label={marker.name} onPress={marker.onPress}>
                        {badge}
                    </ChartHotspot>
                ) : (
                    <View key={key} pointerEvents="none" style={{ position: 'absolute', left: cx - 14, top: cy - 12 }}>
                        {badge}
                    </View>
                );
            })}
        </View>
    );
};
