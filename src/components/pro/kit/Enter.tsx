import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Animated, { LinearTransition, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { MOTION_EASE, MOTION_MS, MOTION_STAGGER, useMotion } from '../../../lib/motion';
import { useColors } from '../../../theme/theme';
import { useChanged } from './hooks';
import { useProColors } from './theme';

interface EnterProps extends ViewProps {
    /** Posición en la lista: entra 30 ms (o `step`) después de la anterior */
    index?: number;
    step?: number;
    style?: StyleProp<ViewStyle>;
}

// Entrada escalonada: sube 8 px y aparece (300 ms). Sin movimiento, aparece tal cual.
export const Enter: React.FC<EnterProps> = ({ index = 0, step = MOTION_STAGGER.row, style, children, ...rest }) => {
    const motion = useMotion();
    const shown = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            shown.set(1);
            return;
        }
        shown.set(withDelay(motion.delay(index, step), withTiming(1, { duration: MOTION_MS.flip, easing: MOTION_EASE })));
        return () => cancelAnimation(shown);
        // Solo al montarse: si la fila cambia de lugar no vuelve a entrar
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const enter = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * 8 }] }));
    return (
        <Animated.View {...rest} style={[style, enter]}>
            {children}
        </Animated.View>
    );
};

export type FlashTone = 'accent' | 'up' | 'down' | 'live';

interface FlashProps {
    /** El dato que se vigila: cuando cambia, el fondo destella una vez (900 ms) */
    value: unknown;
    tone?: FlashTone;
    /** Radio del destello (6) */
    radius?: number;
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
}

// Resaltado del dato que cambió (marcador, puntos, puesto). No destella al montarse, solo al cambiar.
export const Flash: React.FC<FlashProps> = ({ value, tone = 'accent', radius = 6, style, children }) => {
    const motion = useMotion();
    const colors = useColors();
    const pro = useProColors();
    const changes = useChanged(value);
    const glow = useSharedValue(0);
    useEffect(() => {
        if (changes === 0 || !motion.animate) return;
        glow.set(withSequence(withTiming(0.35, { duration: MOTION_MS.fade }), withTiming(0, { duration: 750, easing: MOTION_EASE })));
        return () => cancelAnimation(glow);
    }, [changes, motion.animate, glow]);
    const color = { accent: colors.accent, up: pro.up, down: pro.down, live: colors.live }[tone];
    const overlay = useAnimatedStyle(() => ({ opacity: glow.get() }));
    return (
        <View style={style}>
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -2, bottom: -2, left: -4, right: -4, borderRadius: radius, backgroundColor: color }, overlay]} />
            {children}
        </View>
    );
};

interface PlusOneProps {
    /** Contador de eventos (p. ej. carreras): cada vez que sube salta el texto */
    trigger: number;
    children: React.ReactNode;
    /** Posición absoluta dentro del padre (top, left, right…) */
    style?: StyleProp<ViewStyle>;
}

// «+1» que salta sobre el marcador al anotar (700 ms) y se va. Va con posición absoluta: el padre la ubica.
export const PlusOne: React.FC<PlusOneProps> = ({ trigger, children, style }) => {
    const motion = useMotion();
    const jump = useSharedValue(1);
    useEffect(() => {
        if (trigger <= 0 || !motion.animate) return;
        jump.set(0);
        jump.set(withTiming(1, { duration: MOTION_MS.plusOne, easing: MOTION_EASE }));
        return () => cancelAnimation(jump);
    }, [trigger, motion.animate, jump]);
    const moving = useAnimatedStyle(() => ({ opacity: jump.get() < 1 ? 1 - jump.get() : 0, transform: [{ translateY: -14 * jump.get() }] }));
    if (!motion.animate || trigger <= 0) return null;
    return (
        <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[{ position: 'absolute' }, style, moving]}>
            {children}
        </Animated.View>
    );
};

/**
 * Reordenar: las filas que cambian de lugar se deslizan del viejo al nuevo (300 ms). Va en `layout` de cada fila
 * (Animated.View de Reanimated con `key` estable). Sin movimiento devuelve undefined: cambian de golpe.
 *   const reorder = useReorder();
 *   rows.map((row) => <Animated.View key={row.id} layout={reorder}>…</Animated.View>)
 */
export const useReorder = () => {
    const motion = useMotion();
    return motion.animate ? LinearTransition.duration(MOTION_MS.flip).easing(MOTION_EASE) : undefined;
};
