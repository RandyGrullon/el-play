import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { GrowBar, useGrow } from './GrowBar';
import { useInView } from './hooks';
import { useProColors } from './theme';

export interface HBarRow {
    id: string;
    /** Nombre para el lector de pantalla («Toros del Este») */
    name: string;
    /** Lo que se ve a la izquierda (logo + sigla); por defecto `name` */
    label?: React.ReactNode;
    value: number | null;
    /** El valor escrito (.285, 3.72); por defecto el número tal cual */
    display?: string;
    /** Color de la barra (el del equipo); acento por defecto */
    color?: string;
    /** Valor en negrita (el líder, tu equipo) */
    emphasis?: boolean;
}

export interface HBarChartProps {
    rows: HBarRow[];
    /** Qué compara: «Promedio de bateo por equipo, de mayor a menor» */
    label: string;
    /** Máximo de la escala (si no, el mayor valor) */
    max?: number;
    /**
     * Con `center` las barras salen de ese valor hacia los lados (p. ej. el promedio de la liga):
     * a la derecha lo que está por encima y a la izquierda lo que está por debajo.
     */
    center?: number;
    /** Si menos es mejor (EFE, WHIP): con `center`, lo de abajo del promedio se pinta hacia la derecha */
    lowerIsBetter?: boolean;
    /** Raya vertical de referencia (promedio de la liga) sin `center` */
    reference?: { value: number; label?: string };
    /** Ancho de la columna del rótulo (92 px) */
    labelWidth?: number;
    /** Alto de la barra (8 px) */
    barHeight?: number;
    style?: StyleProp<ViewStyle>;
}

// Barras horizontales con el color de cada equipo; crecen escalonadas (40 ms por fila) al entrar en pantalla.
// Para el lector todo el bloque es una imagen con el resumen de valores.
export const HBarChart: React.FC<HBarChartProps> = ({ rows, label, max, center, lowerIsBetter = false, reference, labelWidth = 92, barHeight = 8, style }) => {
    const colors = useColors();
    const { setNode, onLayout, seen: inView } = useInView();
    const values = rows.map((row) => row.value).filter((value): value is number => value !== null && Number.isFinite(value));
    const summary = `${label}: ${rows.map((row) => `${row.name} ${row.display ?? row.value ?? '—'}`).join(', ')}`;
    const top = max ?? Math.max(0, ...values);
    const spread = center !== undefined ? Math.max(1e-9, ...values.map((value) => Math.abs(value - center))) : 0;

    return (
        <View ref={setNode} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={summary} style={[{ gap: 6 }, style]}>
            {rows.map((row, index) => {
                const color = row.color ?? colors.accent;
                return (
                    <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: labelWidth, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            {row.label ?? (
                                <Txt size={13} weight="bold" numberOfLines={1}>
                                    {row.name}
                                </Txt>
                            )}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            {row.value === null ? (
                                <View style={{ height: barHeight, borderRadius: barHeight / 2, backgroundColor: alpha(colors.line, 0.1) }} />
                            ) : center !== undefined ? (
                                <DivergingBar value={row.value} center={center} spread={spread} color={color} lowerIsBetter={lowerIsBetter} index={index} seen={inView} height={barHeight} />
                            ) : (
                                <View>
                                    <GrowBar value={top > 0 ? row.value / top : 0} color={color} index={index} seen={inView} height={barHeight} />
                                    {reference && top > 0 && <View style={{ position: 'absolute', top: -4, bottom: -4, width: 1, left: `${Math.min(1, reference.value / top) * 100}%`, backgroundColor: alpha(colors.ink, 0.6) }} />}
                                </View>
                            )}
                        </View>
                        <Txt size={13} weight={row.emphasis ? 'extrabold' : 'semibold'} color={row.emphasis ? colors.ink : alpha(colors.ink, 0.8)} tabular numberOfLines={1} style={{ minWidth: 44, textAlign: 'right' }}>
                            {row.display ?? (row.value === null ? '—' : String(row.value))}
                        </Txt>
                    </View>
                );
            })}
        </View>
    );
};

interface DivergingBarProps {
    value: number;
    /** Desde dónde sale (0 para la diferencia de carreras; el promedio de la liga) */
    center?: number;
    /** Distancia al centro que llena medio carril */
    spread: number;
    /** Color fijo; si no, verde para bien y rojo para mal */
    color?: string;
    lowerIsBetter?: boolean;
    index?: number;
    /** Ya se vio (si la lista lo controla); si no, la barra mira su propia entrada en pantalla */
    seen?: boolean;
    /** Alto en px (8) */
    height?: number;
    style?: StyleProp<ViewStyle>;
}

// Barra divergente: sale de una línea central hacia la derecha (por encima del centro) o la izquierda (por debajo).
// Decorativa: el número va al lado.
export const DivergingBar: React.FC<DivergingBarProps> = ({ value, center = 0, spread, color, lowerIsBetter = false, index = 0, seen: seenProp, height = 8, style }) => {
    const colors = useColors();
    const pro = useProColors();
    const { setNode, onLayout, seen: inView } = useInView(seenProp === undefined);
    const seen = seenProp ?? inView;
    const delta = value - center;
    const right = lowerIsBetter ? delta < 0 : delta > 0;
    const share = Math.min(1, Math.abs(delta) / Math.max(1e-9, spread)) * 0.5;
    const fill = color ?? (right ? pro.up : pro.down);
    const progress = useGrow(share, seen, index);
    const grow = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
    return (
        <View
            ref={setNode}
            onLayout={onLayout}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[{ height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: alpha(colors.line, 0.1) }, style]}
        >
            <Animated.View
                style={[
                    { position: 'absolute', top: 0, bottom: 0, backgroundColor: fill },
                    right ? { left: '50%', borderTopRightRadius: height / 2, borderBottomRightRadius: height / 2 } : { right: '50%', borderTopLeftRadius: height / 2, borderBottomLeftRadius: height / 2 },
                    grow
                ]}
            />
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, marginLeft: -0.5, backgroundColor: alpha(colors.ink, 0.5) }} />
        </View>
    );
};

interface MirrorBarProps {
    left: { value: number; color: string };
    right: { value: number; color: string };
    /** Escala: lo que llena medio carril (si no, el mayor de los dos) */
    max?: number;
    index?: number;
    /** Alto en px (6) */
    height?: number;
    style?: StyleProp<ViewStyle>;
}

// Barras en espejo del cara a cara: cada lado crece desde el centro hacia su equipo. Decorativa.
export const MirrorBar: React.FC<MirrorBarProps> = ({ left, right, max, index = 0, height = 6, style }) => {
    const { setNode, onLayout, seen: inView } = useInView();
    const top = max ?? Math.max(left.value, right.value, 1e-9);
    return (
        <View ref={setNode} onLayout={onLayout} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[{ flexDirection: 'row', gap: 4 }, style]}>
            <GrowBar value={top > 0 ? left.value / top : 0} color={left.color} origin="right" index={index} seen={inView} height={height} style={{ flex: 1 }} />
            <GrowBar value={top > 0 ? right.value / top : 0} color={right.color} origin="left" index={index} seen={inView} height={height} style={{ flex: 1 }} />
        </View>
    );
};
