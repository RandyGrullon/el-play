import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, radius, shadow } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { MOTION_EASE, useMotion } from '../kit';

// Selector de una opción (radiogroup) con botones de 44 px y un indicador que se desliza con resorte (380 ms).
// `special` pinta con el degradado PRO la opción elegida que lo pida (Cine). `grid`: con 4 opciones, en pantallas
// angostas pasan a dos filas.

export interface Choice<T extends string> {
    value: T;
    label: string;
    /** Al elegirla, el indicador va con el degradado de la marca */
    special?: boolean;
    accessibilityLabel?: string;
}

interface ChoiceGroupProps<T extends string> {
    value: T;
    options: Choice<T>[];
    onChange: (value: T) => void;
    label: string;
    grid?: boolean;
    style?: StyleProp<ViewStyle>;
}

const SPRING = Easing.bezier(0.3, 1.35, 0.5, 1);
type Box = { x: number; y: number; width: number; height: number };

export function ChoiceGroup<T extends string>({ value, options, onChange, label, grid = false, style }: ChoiceGroupProps<T>) {
    const colors = useColors();
    const motion = useMotion();
    const [boxes, setBoxes] = useState<Record<string, Box>>({});
    const [width, setWidth] = useState(0);
    const chosen = options.find((option) => option.value === value);
    const spot = boxes[value];
    const x = useSharedValue(spot?.x ?? 0);
    const y = useSharedValue(spot?.y ?? 0);
    const w = useSharedValue(spot?.width ?? 0);
    const h = useSharedValue(spot?.height ?? 0);
    const special = useSharedValue(chosen?.special ? 1 : 0);
    // La primera vez el indicador aparece en su lugar; después se desliza
    const placed = useRef(false);

    useEffect(() => {
        if (!spot) return;
        const slide = placed.current && motion.animate;
        placed.current = true;
        const go = (sv: typeof x, to: number) => sv.set(slide ? withTiming(to, { duration: 380, easing: SPRING }) : to);
        go(x, spot.x);
        go(y, spot.y);
        go(w, spot.width);
        go(h, spot.height);
        special.set(slide ? withTiming(chosen?.special ? 1 : 0, { duration: 200, easing: MOTION_EASE }) : chosen?.special ? 1 : 0);
        return () => [x, y, w, h, special].forEach((sv) => cancelAnimation(sv));
    }, [spot, motion.animate, chosen?.special, x, y, w, h, special]);

    const indicator = useAnimatedStyle(() => ({ left: x.get(), top: y.get(), width: w.get(), height: h.get() }));
    const gradient = useAnimatedStyle(() => ({ opacity: special.get() }));
    // Cuatro opciones que no caben (menos de ~90 px cada una): dos filas
    const twoRows = grid && width > 0 && width / options.length < 88;

    const onBox = (key: string) => (event: LayoutChangeEvent) => {
        const { x: bx, y: by, width: bw, height: bh } = event.nativeEvent.layout;
        setBoxes((current) => {
            const old = current[key];
            if (old && old.x === bx && old.y === by && old.width === bw && old.height === bh) return current;
            return { ...current, [key]: { x: bx, y: by, width: bw, height: bh } };
        });
    };

    return (
        <View
            role="radiogroup"
            accessibilityLabel={label}
            onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
            style={[{ flexDirection: 'row', flexWrap: twoRows ? 'wrap' : 'nowrap', backgroundColor: colors.raised, borderRadius: twoRows ? 22 : radius.pill, padding: 4 }, style]}
        >
            {spot && (
                <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderRadius: radius.pill, backgroundColor: colors.ink, overflow: 'hidden' }, shadow('card'), indicator]}>
                    <Animated.View style={[{ flex: 1 }, gradient]}>
                        <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ flex: 1 }} />
                    </Animated.View>
                </Animated.View>
            )}
            {options.map((option) => {
                const active = option.value === value;
                const ink = active ? (option.special ? '#fff' : colors.bg) : colors.muted;
                return (
                    <Pressable
                        key={option.value}
                        onLayout={onBox(option.value)}
                        onPress={() => onChange(option.value)}
                        role="radio"
                        aria-checked={active}
                        accessibilityLabel={option.accessibilityLabel ?? option.label}
                        style={{ flexGrow: 1, flexBasis: twoRows ? '50%' : 0, minWidth: 0, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}
                    >
                        <Txt size={14} weight={active ? 'extrabold' : 'bold'} color={ink} numberOfLines={1}>
                            {option.label}
                        </Txt>
                    </Pressable>
                );
            })}
        </View>
    );
}
