import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '../../../theme/theme';
import { fonts } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { ChartHotspot, FadeG, middle } from './chart';
import { fraction, heatColor, readableInk, teamInk, type HeatScale } from './color';
import { useChartBox } from './hooks';
import { extent } from './scale';

export interface HeatCell {
    /** Zona de MLB, vista del receptor: 1-9 dentro (1 arriba a la izquierda), 11-14 las esquinas de afuera */
    zone: number;
    value: number | null;
    /** El valor escrito («.381», «16»); por defecto el número */
    display?: string;
    /** Segunda línea pequeña («37.2 %») */
    sub?: string;
}

export interface HeatGridProps {
    cells: HeatCell[];
    /** «Pitcheos por zona de Armstrong hoy, vista del receptor…» (con los datos) */
    label: string;
    /** Escala de colores (heat, zone, percentile) o un color propio que se intensifica con la opacidad */
    scale?: HeatScale | { color: string };
    /** Rango de la escala (si no, el de los valores) */
    domain?: [number, number];
    /** Lado máximo en px (300) */
    maxSize?: number;
    /** Zona elegida y qué hacer al tocar una (opcional) */
    selected?: number | null;
    onSelect?: (zone: number) => void;
    /** Nombre de cada zona para el lector de pantalla al tocar: «Arriba y adentro» */
    zoneName?: (zone: number) => string;
    /** Rótulos de la leyenda («Frío», «Caliente») */
    legend?: { low: string; high: string };
    style?: StyleProp<ViewStyle>;
}

const INNER = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const OUTER = [11, 12, 13, 14];

const short = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/^0/, ''));

// Rejilla de calor: la zona de strike 3 × 3 sobre los 4 cuadrantes de afuera. Las celdas aparecen en cascada.
export const HeatGrid: React.FC<HeatGridProps> = ({ cells, label, scale = 'zone', domain, maxSize = 300, selected = null, onSelect, zoneName, legend, style }) => {
    const colors = useColors();
    const { setNode, onLayout, width, seen } = useChartBox();
    // La vista que se mide ya tiene el tope de maxSize: la rejilla es cuadrada con ese ancho
    const size = Math.min(width, maxSize);
    const byZone = new Map(cells.map((cell) => [cell.zone, cell]));
    const hasOuter = OUTER.some((zone) => byZone.has(zone));
    const [min, max] = domain ?? extent(cells.map((cell) => cell.value), [0, 1]);
    const inset = hasOuter ? size * 0.18 : 0;
    const inner = size - inset * 2;
    const cellSize = inner / 3;

    const paint = (cell: HeatCell | undefined) => {
        if (!cell || cell.value === null) return { fill: colors.raised, ink: colors.muted, opacity: 1 };
        const t = fraction(cell.value, min, max);
        if (typeof scale === 'object') return { fill: scale.color, ink: t > 0.7 ? teamInk(scale.color) : colors.ink, opacity: 0.14 + 0.8 * t };
        const fill = heatColor(t, scale);
        return { fill, ink: readableInk(fill), opacity: 1 };
    };

    const rect = (zone: number) => {
        if (zone > 10) {
            const half = size / 2;
            const left = zone === 11 || zone === 13 ? 0 : half;
            const top = zone === 11 || zone === 12 ? 0 : half;
            return { x: left, y: top, w: half, h: half };
        }
        const col = (zone - 1) % 3;
        const row = Math.floor((zone - 1) / 3);
        return { x: inset + col * cellSize, y: inset + row * cellSize, w: cellSize, h: cellSize };
    };

    const text = (zone: number, cell: HeatCell | undefined, ink: string) => {
        const r = rect(zone);
        const outer = zone > 10;
        // En las esquinas el número va en la punta de afuera, lejos de la zona
        const tx = outer ? (zone === 11 || zone === 13 ? r.x + 8 : r.x + r.w - 8) : r.x + r.w / 2;
        const ty = outer ? (zone === 11 || zone === 12 ? r.y + 18 : r.y + r.h - 20) : r.y + r.h / 2 - (cell?.sub ? 4 : 0);
        const anchor = outer ? (zone === 11 || zone === 13 ? 'start' : 'end') : 'middle';
        return (
            <G>
                <SvgText x={tx} y={ty} dy={middle(15)} textAnchor={anchor} fontFamily={fonts.extrabold} fontSize={15} fill={ink}>
                    {cell ? (cell.value === null ? '—' : (cell.display ?? String(cell.value))) : ''}
                </SvgText>
                {cell?.sub ? (
                    <SvgText x={tx} y={ty + 14} dy={middle(10)} textAnchor={anchor} fontFamily={fonts.bold} fontSize={10} fill={ink}>
                        {cell.sub}
                    </SvgText>
                ) : null}
            </G>
        );
    };

    const zones = [...(hasOuter ? OUTER : []), ...INNER];

    return (
        <View style={style}>
            <View ref={setNode} onLayout={onLayout} style={{ width: '100%', maxWidth: maxSize, alignSelf: 'center' }}>
                <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ alignItems: 'center' }}>
                    <Svg width={size} height={size}>
                        {zones.map((zone, order) => {
                            const r = rect(zone);
                            const cell = byZone.get(zone);
                            const { fill, ink, opacity } = paint(cell);
                            return (
                                <FadeG key={zone} seen={seen} index={order} step={30}>
                                    <Rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={zone > 10 ? 6 : 3} fill={fill} fillOpacity={opacity} />
                                    {selected === zone && <Rect x={r.x + 2} y={r.y + 2} width={Math.max(0, r.w - 4)} height={Math.max(0, r.h - 4)} rx={3} fill="none" stroke={colors.ink} strokeWidth={2.5} />}
                                    {text(zone, cell, ink)}
                                </FadeG>
                            );
                        })}
                        {hasOuter && <Rect x={inset} y={inset} width={inner} height={inner} fill="none" stroke={colors.ink} strokeWidth={1.5} rx={3} />}
                    </Svg>
                </View>
                {onSelect &&
                    zones.map((zone) => {
                        const r = rect(zone);
                        const cx = zone > 10 ? (zone === 11 || zone === 13 ? r.x + 22 : r.x + r.w - 22) : r.x + r.w / 2;
                        const cy = zone > 10 ? (zone === 11 || zone === 12 ? r.y + 22 : r.y + r.h - 22) : r.y + r.h / 2;
                        const cell = byZone.get(zone);
                        return (
                            <ChartHotspot
                                key={zone}
                                x={cx}
                                y={cy}
                                label={`${zoneName ? zoneName(zone) : zone}: ${cell?.display ?? cell?.value ?? '—'}`}
                                onPress={() => onSelect(zone)}
                                active={selected === zone}
                            />
                        );
                    })}
            </View>
            {legend && typeof scale === 'string' && (
                <View style={{ width: '100%', maxWidth: maxSize, alignSelf: 'center', marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <Txt size={11} weight="semibold" tone="muted" tabular>
                        {short(min)}
                    </Txt>
                    <View style={{ flex: 1, paddingTop: 4 }}>
                        <LinearGradient colors={[heatColor(0, scale), heatColor(0.5, scale), heatColor(1, scale)]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ height: 6, borderRadius: 3 }} />
                        <View style={{ marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Txt size={11} weight="semibold" tone="muted">
                                {legend.low}
                            </Txt>
                            <Txt size={11} weight="semibold" tone="muted">
                                {legend.high}
                            </Txt>
                        </View>
                    </View>
                    <Txt size={11} weight="semibold" tone="muted" tabular>
                        {short(max)}
                    </Txt>
                </View>
            )}
        </View>
    );
};
