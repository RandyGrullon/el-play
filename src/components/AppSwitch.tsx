import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/theme';
import { alpha } from '../theme/tokens';
import { useReduceMotion } from './ui';

// El interruptor de la app, el mismo en el teléfono y en la web (el Switch del sistema se ve distinto en cada uno y en
// la web la bolita no queda centrada): pista de 48 × 28 y bolita de 24 a 2 px del borde por los cuatro lados, que
// recorre 20 px. Encendido, la pista va con el acento; apagado, un gris que también se ve en el modo oscuro. La bolita
// se desliza en 180 ms (con «Reducir movimiento», salta). Para el lector de pantalla es un «switch» con su estado.

export const SWITCH_W = 48;
export const SWITCH_H = 28;
const KNOB = 24;
/** Lo mismo arriba, abajo y a los lados */
const INSET = (SWITCH_H - KNOB) / 2;
const TRAVEL = SWITCH_W - KNOB - INSET * 2;
const SLIDE_MS = 180;
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

const knobShadow = Platform.select({
    web: { boxShadow: '0 1px 3px rgba(0,0,0,0.28)' },
    default: { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 }
}) as object;

/** Solo el dibujo (pista y bolita), para una fila entera que es el interruptor (ProSwitch) */
export const SwitchTrack: React.FC<{ value: boolean }> = ({ value }) => {
    const { colors, isDark } = useTheme();
    const reduce = useReduceMotion();
    // 0 = apagado, 1 = encendido (mueve la bolita y tiñe la pista; el color no va por el hilo nativo)
    const [progress] = useState(() => new Animated.Value(value ? 1 : 0));
    useEffect(() => {
        const to = value ? 1 : 0;
        if (reduce) {
            progress.setValue(to);
            return;
        }
        const slide = Animated.timing(progress, { toValue: to, duration: SLIDE_MS, easing: EASE, useNativeDriver: false });
        slide.start();
        return () => slide.stop();
    }, [value, reduce, progress]);
    const off = alpha(colors.ink, isDark ? 0.28 : 0.16);
    return (
        <Animated.View
            style={{
                width: SWITCH_W,
                height: SWITCH_H,
                borderRadius: SWITCH_H / 2,
                backgroundColor: progress.interpolate({ inputRange: [0, 1], outputRange: [off, colors.accent] })
            }}
        >
            <Animated.View
                style={[
                    { position: 'absolute', top: INSET, left: INSET, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#fff' },
                    knobShadow,
                    { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }] }
                ]}
            />
        </Animated.View>
    );
};

interface AppSwitchProps {
    value: boolean;
    onValueChange: (next: boolean) => void;
    /** Lo que oye el lector de pantalla (el nombre de la opción) */
    accessibilityLabel: string;
    accessibilityHint?: string;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}

/** El interruptor solo (al lado de su texto): se toca con 44 px de alto aunque mida 28 */
export const AppSwitch: React.FC<AppSwitchProps> = ({ value, onValueChange, accessibilityLabel, accessibilityHint, disabled, style }) => (
    <Pressable
        onPress={() => onValueChange(!value)}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ checked: value, disabled: !!disabled }}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={({ pressed }) => [{ flexShrink: 0, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}
    >
        <SwitchTrack value={value} />
    </Pressable>
);
