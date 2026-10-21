import React, { useEffect } from 'react';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { MOTION_EASE, MOTION_MS, useMotion } from '../../../lib/motion';
import { useColors } from '../../../theme/theme';
import { fonts } from '../../../theme/tokens';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface OdometerProps {
    value: number | string;
    /** Tamaño de la letra (Barlow Condensed); la altura de cada dígito sale de aquí */
    size?: number;
    color?: string;
    /** Texto para el lector de pantalla (por defecto el valor) */
    label?: string;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
}

/** Una columna: la tira 0-9 que rueda hasta el dígito (400 ms) */
const DigitColumn: React.FC<{ digit: number; height: number; text: StyleProp<TextStyle> }> = ({ digit, height, text }) => {
    const motion = useMotion();
    const offset = useSharedValue(-digit * height);
    useEffect(() => {
        const target = -digit * height;
        if (motion.animate) offset.set(withTiming(target, { duration: MOTION_MS.odometer, easing: MOTION_EASE }));
        else offset.set(target);
        return () => cancelAnimation(offset);
    }, [digit, height, motion.animate, offset]);
    const strip = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
    return (
        <View style={{ height, overflow: 'hidden' }}>
            <Animated.View style={strip}>
                {DIGITS.map((d) => (
                    <Text key={d} style={[text, { height, lineHeight: height }]}>
                        {d}
                    </Text>
                ))}
            </Animated.View>
        </View>
    );
};

// Marcador tipo odómetro: cada dígito es una tira 0-9 que rueda al nuevo valor (400 ms). Los dígitos se alinean por
// la derecha para que 9 → 10 no salte. Lo que no es dígito («7:47», «-») queda fijo.
export const Odometer: React.FC<OdometerProps> = ({ value, size = 32, color, label, style, textStyle }) => {
    const colors = useColors();
    const chars = String(value).split('');
    const height = Math.round(size * 1.08);
    const text: StyleProp<TextStyle> = [{ fontFamily: fonts.condensed, fontSize: size, color: color ?? colors.ink, fontVariant: ['tabular-nums'], textAlign: 'center' }, textStyle];
    return (
        <View accessible accessibilityRole="text" accessibilityLabel={label ?? String(value)} style={[{ flexDirection: 'row', alignItems: 'flex-start' }, style]}>
            {chars.map((char, index) => {
                const key = chars.length - index;
                const digit = DIGITS.indexOf(char);
                if (digit < 0)
                    return (
                        <Text key={`c${key}`} style={[text, { height, lineHeight: height }]}>
                            {char}
                        </Text>
                    );
                return <DigitColumn key={`d${key}`} digit={digit} height={height} text={text} />;
            })}
        </View>
    );
};
