import React, { useEffect } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MOTION_EASE, MOTION_MS, useMotion } from '../../../lib/motion';
import { useColors, useTheme } from '../../../theme/theme';
import { Txt } from '../../ui';

interface ProSwitchProps {
    value: boolean;
    onChange: (next: boolean) => void;
    label: string;
    /** Línea chica debajo del nombre («Solo los de LIC») */
    hint?: string;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}

const TRACK_W = 46;
const TRACK_H = 28;
const THUMB = 20;

// Interruptor de una fila (alertas del juego): toda la fila es el botón (44 px de alto) y para el lector es un
// «switch» con su estado. El círculo se desliza y la pista cambia de color en 200 ms; sin animación salta.
export const ProSwitch: React.FC<ProSwitchProps> = ({ value, onChange, label, hint, disabled, style }) => {
    const colors = useColors();
    const { isDark } = useTheme();
    const motion = useMotion();
    const on = useSharedValue(value ? 1 : 0);
    const offColor = isDark ? colors.faint : colors.muted;
    const onColor = colors.ball;

    useEffect(() => {
        const target = value ? 1 : 0;
        if (!motion.animate) {
            on.set(target);
            return;
        }
        on.set(withTiming(target, { duration: MOTION_MS.tab, easing: MOTION_EASE }));
        return () => cancelAnimation(on);
    }, [value, motion.animate, on]);

    const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(on.get(), [0, 1], [offColor, onColor]) }));
    const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: 4 + on.get() * (TRACK_W - THUMB - 8) }] }));

    return (
        <Pressable
            onPress={() => onChange(!value)}
            disabled={disabled}
            accessibilityRole="switch"
            accessibilityLabel={label}
            accessibilityHint={hint}
            accessibilityState={{ checked: value, disabled: !!disabled }}
            style={({ pressed }) => [{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}
        >
            <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={14} weight="semibold">
                    {label}
                </Txt>
                {!!hint && (
                    <Txt size={12} tone="muted" style={{ marginTop: 1 }}>
                        {hint}
                    </Txt>
                )}
            </View>
            <Animated.View style={[{ width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, justifyContent: 'center' }, track]}>
                <Animated.View style={[{ width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: '#fff' }, thumb]} />
            </Animated.View>
        </Pressable>
    );
};
