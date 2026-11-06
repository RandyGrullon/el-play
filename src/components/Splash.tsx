import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue, type WithTimingConfig } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useIsFetching } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MOTION_MS, useMotion } from '../lib/motion';
import { useColors } from '../theme/theme';
import { Txt } from './ui';
import { BALL, Ball, Plate } from './feed/LogoMark';

// Pantalla de entrada (la de la web, components/brand/Splash.tsx), justo después del splash del sistema: aparece el plato,
// la pelota cae girando como un lanzamiento, rebota con un destello y entra el nombre letra por letra. Se va cuando
// terminó la animación y cargaron los datos, y nunca tapa la app más que en la web. Sin animaciones (Más o «Reducir
// movimiento» del sistema) se ve quieta y se va con un fundido.

const MIN_MS = 1500; // lo que dura la animación completa
const QUIET_MS = 400; // sin animaciones, lo mínimo que se ve
const MAX_MS = 3500; // nunca tapar la app más de esto aunque la red esté lenta
const EXIT_MS = 380;
const WORD = ['E', 'L', ' ', 'P', 'L', 'A', 'Y'];

// El dibujo es de 64 × 64 (como el logo) y se pinta a 132
const SIZE = 132;
const UNIT = SIZE / 64;
// La pelota va en su propio cuadro (con 1 de margen para el borde) para que gire y rebote sobre su centro
const BALL_BOX = BALL.r * 2 + 2;
const BALL_VIEW = `${BALL.cx - BALL.r - 1} ${BALL.cy - BALL.r - 1} ${BALL_BOX} ${BALL_BOX}`;
const ballFrame = { position: 'absolute', left: (BALL.cx - BALL.r - 1) * UNIT, top: (BALL.cy - BALL.r - 1) * UNIT, width: BALL_BOX * UNIT, height: BALL_BOX * UNIT } as const;

// Las curvas de la web (src/styles.css)
const PLATE_EASE = Easing.bezier(0.2, 0.9, 0.25, 1.15);
const DROP_EASE = Easing.bezier(0.45, 0, 0.2, 1);
const SPIN_EASE = Easing.bezier(0.3, 0.6, 0.3, 1);
const LETTER_EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const PROGRESS_EASE = Easing.bezier(0.42, 0, 0.58, 1); // ease-in-out
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);
const EASE_IN = Easing.bezier(0.42, 0, 1, 1);

const DROP_MS = 620;
// El rebote: cae hasta el 72 %, sube un poco hasta el 86 % y se posa
const DROP_STEPS = [0.72, 0.14, 0.14];

/** Valor que va de 0 a 1 una vez (después de `delay`), o que ya está en 1 sin animaciones */
const useOnce = (animate: boolean, delay: number, duration: number, easing: WithTimingConfig['easing']) => {
    const value = useSharedValue(animate ? 0 : 1);
    useEffect(() => {
        if (!animate) return;
        value.set(withDelay(delay, withTiming(1, { duration, easing })));
        return () => cancelAnimation(value);
        // Solo al montarse
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return value;
};

const Letter: React.FC<{ letter: string; index: number; animate: boolean; color: string }> = ({ letter, index, animate, color }) => {
    const shown = useOnce(animate, 780 + index * 45, 420, LETTER_EASE);
    const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * 16 }] }));
    return (
        <Animated.View style={[{ width: letter === ' ' ? 42 * 0.35 : undefined }, style]}>
            <Txt size={42} weight="extrabold" color={color} style={{ lineHeight: 46, letterSpacing: 42 * 0.06 }}>
                {letter === ' ' ? '' : letter}
            </Txt>
        </Animated.View>
    );
};

/** Lo que sube y aparece tarde (el lema y la barrita) */
const fadeUp = (value: SharedValue<number>) => {
    'worklet';
    return { opacity: value.get(), transform: [{ translateY: (1 - value.get()) * 6 }] };
};

export const Splash: React.FC = () => {
    const { t } = useTranslation();
    const colors = useColors();
    const motion = useMotion();
    const animate = motion.animate;
    const fetching = useIsFetching();
    const started = useRef(Date.now());
    const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>('show');

    const plate = useOnce(animate, 0, 550, PLATE_EASE);
    const spin = useOnce(animate, 220, DROP_MS, SPIN_EASE);
    const impact = useOnce(animate, 780, 700, EASE_OUT);
    const tagline = useOnce(animate, 1100, 500, EASE_OUT);
    // La caída en tres tramos (0 → 1 → 2 → 3), cada uno con la curva de la web
    const drop = useSharedValue(animate ? 0 : 3);
    const progress = useSharedValue(0);
    const leave = useSharedValue(0);

    useEffect(() => {
        if (!animate) return;
        drop.set(withDelay(220, withSequence(...DROP_STEPS.map((step, index) => withTiming(index + 1, { duration: DROP_MS * step, easing: DROP_EASE })))));
        progress.set(withRepeat(withTiming(1, { duration: 1100, easing: PROGRESS_EASE }), -1, false));
        return () => {
            cancelAnimation(drop);
            cancelAnimation(progress);
        };
        // Solo al montarse
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Se va al terminar la animación si ya no se está cargando nada, o a los 3,5 s pase lo que pase
    useEffect(() => {
        if (phase !== 'show') return;
        const tick = () => {
            const elapsed = Date.now() - started.current;
            if ((elapsed >= (animate ? MIN_MS : QUIET_MS) && fetching === 0) || elapsed >= MAX_MS) setPhase('leave');
        };
        tick();
        const timer = setInterval(tick, 100);
        return () => clearInterval(timer);
    }, [fetching, phase, animate]);

    useEffect(() => {
        if (phase !== 'leave') return;
        const exit = animate ? EXIT_MS : MOTION_MS.fade;
        leave.set(withTiming(1, { duration: exit, easing: EASE_IN }));
        const timer = setTimeout(() => setPhase('gone'), exit);
        return () => clearTimeout(timer);
    }, [phase, animate, leave]);

    const rootStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.get(), transform: [{ scale: animate ? 1 + leave.get() * 0.06 : 1 }] }));
    const plateStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, plate.get()), transform: [{ scale: 0.55 + plate.get() * 0.45 }, { rotate: `${(1 - plate.get()) * -10}deg` }] }));
    const ballStyle = useAnimatedStyle(() => {
        const at = drop.get();
        return {
            opacity: interpolate(at, [0, 0.25], [0, 1], 'clamp'),
            transform: [
                { translateY: interpolate(at, [0, 1, 2, 3], [-95, 1.5, -3, 0]) * UNIT },
                { scaleX: interpolate(at, [0, 1, 2, 3], [0.5, 1.06, 0.98, 1]) },
                { scaleY: interpolate(at, [0, 1, 2, 3], [0.5, 0.94, 1.02, 1]) },
                { rotate: `${(1 - spin.get()) * -540}deg` }
            ]
        };
    });
    // El aro marca dónde cae la pelota y, al tocar el plato, se abre y se apaga
    const impactStyle = useAnimatedStyle(() => ({ opacity: 0.8 * (1 - impact.get()), transform: [{ scale: 1 + impact.get() * 1.4 }] }));
    const taglineStyle = useAnimatedStyle(() => fadeUp(tagline));
    const trackStyle = useAnimatedStyle(() => fadeUp(tagline));
    const barStyle = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(progress.get(), [0, 1], [-1.1, 3.3]) * (112 / 3) }] }));

    if (phase === 'gone') return null;

    return (
        <Animated.View
            pointerEvents={phase === 'show' ? 'auto' : 'none'}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('splash.loading')}
            accessibilityViewIsModal
            style={[StyleSheet.absoluteFill, { zIndex: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }, rootStyle]}
        >
            <View style={{ width: SIZE, height: SIZE }}>
                <Animated.View style={[StyleSheet.absoluteFill, plateStyle]}>
                    <Svg width={SIZE} height={SIZE} viewBox="0 0 64 64">
                        <Plate />
                    </Svg>
                </Animated.View>
                {animate && (
                    <Animated.View style={[ballFrame, impactStyle]}>
                        <Svg width="100%" height="100%" viewBox={BALL_VIEW}>
                            <Circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill="none" stroke="#fff" strokeWidth={1.5} />
                        </Svg>
                    </Animated.View>
                )}
                <Animated.View style={[ballFrame, ballStyle]}>
                    <Svg width="100%" height="100%" viewBox={BALL_VIEW}>
                        <Ball />
                    </Svg>
                </Animated.View>
            </View>

            <View style={{ flexDirection: 'row', marginTop: 20 }}>
                {WORD.map((letter, index) => (
                    <Letter key={index} letter={letter} index={index} animate={animate} color={index >= 3 ? colors.accentInk : colors.ink} />
                ))}
            </View>
            <Animated.View style={taglineStyle}>
                <Txt size={12} weight="semibold" tone="muted" style={{ marginTop: 8, textTransform: 'uppercase', letterSpacing: 12 * 0.3 }}>
                    {t('splash.tagline')}
                </Txt>
            </Animated.View>
            <Animated.View style={[{ marginTop: 32, width: 112, height: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.line }, trackStyle]}>
                <Animated.View style={[{ width: 112 / 3, height: 3, borderRadius: 999, backgroundColor: colors.accent }, animate ? barStyle : null]} />
            </Animated.View>
        </Animated.View>
    );
};
