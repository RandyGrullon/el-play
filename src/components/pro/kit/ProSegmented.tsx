import React, { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MOTION_EASE, MOTION_MS, useMotion } from '../../../lib/motion';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, alpha, radius, shadow } from '../../../theme/tokens';
import { Txt } from '../../ui';

export interface SegmentedOption<T extends string> {
    value: T;
    label: React.ReactNode;
    /** Número o chip pequeño junto al texto («Jugadas 87») */
    badge?: React.ReactNode;
    /** Nombre completo si el texto visible es corto */
    accessibilityLabel?: string;
    disabled?: boolean;
}

export interface ProSegmentedProps<T extends string> {
    value: T;
    options: SegmentedOption<T>[];
    onChange: (value: T) => void;
    /** Nombre del grupo de pestañas (lector de pantalla) */
    label: string;
    /** solid: indicador en tinta (blanco en oscuro, negro en claro); gradient: indicador con el degradado */
    variant?: 'solid' | 'gradient';
    /** Fondo del carril: raised (sobre tarjetas) o surface (sobre la página) */
    track?: 'raised' | 'surface';
    /** md: botones de 44 px; sm: 36 px (solo dentro de algo que ya da el área táctil) */
    size?: 'md' | 'sm';
    /** Los botones reparten el ancho (true) o miden su texto y la franja se desliza (false) */
    fill?: boolean;
    style?: StyleProp<ViewStyle>;
}

interface Box {
    x: number;
    width: number;
}

// Control segmentado PRO: el indicador se desliza a la opción elegida (200 ms). Para el lector es una lista de
// pestañas; la elegida se anuncia como seleccionada.
export function ProSegmented<T extends string>({ value, options, onChange, label, variant = 'solid', track = 'raised', size = 'md', fill = true, style }: ProSegmentedProps<T>) {
    const colors = useColors();
    const motion = useMotion();
    const narrow = useWindowDimensions().width < 360;
    const [boxes, setBoxes] = useState<Record<string, Box>>({});
    const left = useSharedValue(0);
    const width = useSharedValue(0);
    const placed = useRef(false);
    const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
    const [viewWidth, setViewWidth] = useState(0);
    const active = boxes[value];

    // El indicador va a la opción elegida: se desliza si ya estaba puesto; la primera vez aparece en su lugar
    useEffect(() => {
        if (!active) return;
        if (placed.current && motion.animate) {
            const timing = { duration: MOTION_MS.tab, easing: MOTION_EASE };
            left.set(withTiming(active.x, timing));
            width.set(withTiming(active.width, timing));
        } else {
            left.set(active.x);
            width.set(active.width);
        }
        placed.current = true;
        // La opción elegida queda a la vista si la franja se desliza
        if (!fill && viewWidth > 0) scroller.current?.scrollTo({ x: Math.max(0, active.x - (viewWidth - active.width) / 2), animated: motion.animate });
        return () => {
            cancelAnimation(left);
            cancelAnimation(width);
        };
    }, [active, motion.animate, fill, viewWidth, left, width]);

    const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: left.get() }], width: width.get() }));
    const height = size === 'md' ? 44 : 36;
    const activeInk = variant === 'gradient' ? '#fff' : colors.bg;
    const measure = (key: string) => (event: LayoutChangeEvent) => {
        const { x, width: w } = event.nativeEvent.layout;
        setBoxes((current) => (current[key]?.x === x && current[key]?.width === w ? current : { ...current, [key]: { x, width: w } }));
    };

    const row = (
        <View style={{ flexDirection: 'row', flexGrow: 1 }}>
            {active && (
                <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: variant === 'gradient' ? undefined : colors.ink }, shadow('card'), indicator]}>
                    {variant === 'gradient' && <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ flex: 1 }} />}
                </Animated.View>
            )}
            {options.map((option) => {
                const selected = option.value === value;
                const ink = selected ? activeInk : alpha(colors.ink, 0.7);
                return (
                    <Pressable
                        key={option.value}
                        onLayout={measure(option.value)}
                        onPress={() => onChange(option.value)}
                        disabled={option.disabled}
                        accessibilityRole="tab"
                        accessibilityState={{ selected, disabled: !!option.disabled }}
                        accessibilityLabel={option.accessibilityLabel}
                        style={[
                            { height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill, opacity: option.disabled ? 0.4 : 1 },
                            fill ? { flex: 1, paddingHorizontal: narrow ? 6 : 12 } : { paddingHorizontal: 16 },
                            // Antes de medir, la elegida lleva su fondo (sin indicador todavía)
                            selected && !active && { backgroundColor: variant === 'gradient' ? colors.accent : colors.ink }
                        ]}
                    >
                        {typeof option.label === 'string' ? (
                            <Txt size={size === 'md' ? 13 : 12} weight="bold" color={ink} numberOfLines={1}>
                                {option.label}
                            </Txt>
                        ) : (
                            option.label
                        )}
                        {option.badge}
                    </Pressable>
                );
            })}
        </View>
    );

    return (
        <View accessibilityRole="tablist" accessibilityLabel={label} style={[{ borderRadius: radius.pill, padding: 4, backgroundColor: track === 'surface' ? colors.surface : colors.raised, maxWidth: '100%' }, style]}>
            {fill ? (
                row
            ) : (
                <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} onLayout={(event) => setViewWidth(event.nativeEvent.layout.width)} contentContainerStyle={{ flexGrow: 1 }}>
                    {row}
                </ScrollView>
            )}
        </View>
    );
}
