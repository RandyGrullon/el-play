import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { MOTION_EASE, MOTION_MS, MOTION_STAGGER, useMotion } from '../../../lib/motion';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { useInView } from './hooks';

interface GrowBarProps {
    /** Largo de 0 a 1 */
    value: number;
    /** Color del relleno (hex de equipo o un color del tema); acento por defecto */
    color?: string;
    /** Desde dónde crece: izquierda o derecha (barras en espejo) */
    origin?: 'left' | 'right';
    /** Posición en una lista: crece 40 ms después de la anterior */
    index?: number;
    /** Pinta el carril de fondo */
    track?: boolean;
    /** Alto en px (6) */
    height?: number;
    /** Ya se vio (si la lista lo controla); si no, la barra mira su propia entrada en pantalla */
    seen?: boolean;
    style?: StyleProp<ViewStyle>;
}

/** Largo animado de 0 a `share` (0-1): crece al verse (escalonado) y se desliza al nuevo largo si cambia */
export const useGrow = (share: number, seen: boolean, index = 0, duration: number = MOTION_MS.bar) => {
    const motion = useMotion();
    const target = Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0));
    const progress = useSharedValue(motion.animate ? 0 : target);
    useEffect(() => {
        if (!motion.animate) {
            progress.set(target);
            return;
        }
        if (!seen) return;
        // La primera vez espera su turno en la fila; después solo se desliza
        const first = progress.get() === 0;
        const timing = withTiming(target, { duration, easing: MOTION_EASE });
        progress.set(first ? withDelay(motion.delay(index, MOTION_STAGGER.bar), timing) : timing);
        return () => cancelAnimation(progress);
    }, [target, seen, motion, index, duration, progress]);
    return progress;
};

// Barra que crece desde 0 al entrar en pantalla (500 ms, +40 ms por fila) y se desliza al nuevo largo si cambia.
// Decorativa: el número va escrito al lado.
export const GrowBar: React.FC<GrowBarProps> = ({ value, color, origin = 'left', index = 0, track = true, height = 6, seen: seenProp, style }) => {
    const colors = useColors();
    const { setNode, onLayout, seen: inView } = useInView(seenProp === undefined);
    const seen = seenProp ?? inView;
    const progress = useGrow(value, seen, index);
    const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
    return (
        <View
            ref={setNode}
            onLayout={onLayout}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[{ height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: track ? alpha(colors.line, 0.1) : 'transparent' }, style]}
        >
            <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, borderRadius: height / 2, backgroundColor: color ?? colors.accent }, origin === 'right' ? { right: 0 } : { left: 0 }, fill]} />
        </View>
    );
};
