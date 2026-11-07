// Deslizar a la derecha para volver, desde cualquier punto de la pantalla y no solo desde el borde (como en iOS).
//
// iOS: lo hace el gesto nativo de pantalla completa (gestureEnabled + fullScreenGestureEnabled en app/_layout.tsx); aquí
// no se agrega nada, para que no peleen dos gestos.
// Android y la web: la pantalla entra como «transparentModal» (la de abajo se queda pintada) y un Pan de gesture-handler
// la corre con el dedo en el hilo de la interfaz, con una sombra suave en el borde y la de abajo un poco oscurecida. Al
// soltar pasado el 35 % del ancho, o rápido hacia la derecha, termina de irse y llama a `onBack` (el mismo atrás de la
// pantalla: si no hay adónde volver, va adonde va su botón); si no, regresa a su sitio con un resorte. Vibra al cruzar
// la raya. Con «Animaciones: Apagadas» o «Reducir movimiento» la pantalla no se mueve: un deslizamiento válido vuelve sin
// más. Los umbrales están en lib/swipeBack.ts.
//
// No le quita el toque a nadie: el scroll vertical (failOffsetY; y si la lista empieza a moverse primero, la vista nativa
// cancela el Pan), las filas que se deslizan de lado (empiezan a moverse antes de los 20 puntos y ganan; en la web, el
// toque que empieza dentro de algo con desplazamiento horizontal no cuenta), la historia del final del juego (su Pan
// bloquea este: useSwipeBackGesture), los toques del mapa de batazos y del terreno (un toque no es un deslizamiento) y
// las hojas y el terreno, que son Modal (van en otra ventana).
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { GestureDetector, usePanGesture, type PanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useColors } from '../theme/theme';
import { MOTION_EASE, useMotion } from '../lib/motion';
import { SWIPE_BACK, pastSwipeThreshold, shouldSwipeBack, swipeOffset, swipeOutMs, swipeProgress } from '../lib/swipeBack';

/** El gesto de volver de la pantalla de afuera (null en iOS o fuera de una pantalla que se cierra deslizando) */
const SwipeBackContext = createContext<PanGesture | null>(null);

/**
 * Para un gesto de lado dentro de la pantalla (la historia del final del juego): pasarlo en `block` hace que el de volver
 * espere a que ese falle, así gana el que empieza adentro
 */
export const useSwipeBackGesture = () => useContext(SwipeBackContext);

/** Ancho de la sombra del borde y cuánto se oscurece la pantalla de abajo al empezar */
const EDGE = 16;
const DIM = 0.16;

// En la web expo-haptics no vibra
const vibrate =
    Platform.OS === 'web'
        ? () => undefined
        : () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          };

/** Web: el toque empezó dentro de algo que se desplaza de lado (una fila de pastillas, una tabla ancha) */
const inSideScroller = (target: unknown, root: unknown): boolean => {
    if (typeof window === 'undefined' || typeof Element === 'undefined' || !(target instanceof Element)) return false;
    let node: Element | null = target;
    while (node && node !== root) {
        if (node.scrollWidth > node.clientWidth + 1) {
            const overflow = window.getComputedStyle(node).overflowX;
            if (overflow === 'auto' || overflow === 'scroll') return true;
        }
        node = node.parentElement;
    }
    return false;
};

const SwipeBackPan: React.FC<{ onBack: () => void; children: React.ReactNode }> = ({ onBack, children }) => {
    const colors = useColors();
    const { width } = useWindowDimensions();
    const motion = useMotion();
    // Cuánto está corrida la pantalla; el ancho y si se anima van en shared values para leerlos en el hilo de la interfaz
    const offset = useSharedValue(0);
    const span = useSharedValue(width);
    const animate = useSharedValue(motion.animate);
    // Ya pasó la raya (para vibrar una vez al cruzarla), ya se va (no se toma otro gesto) y, en la web, empezó en una fila
    const armed = useSharedValue(false);
    const leaving = useSharedValue(false);
    const blocked = useSharedValue(false);
    useEffect(() => {
        span.set(width);
    }, [span, width]);
    useEffect(() => {
        animate.set(motion.animate);
        if (!motion.animate) offset.set(0);
    }, [animate, motion.animate, offset]);

    // El atrás de la pantalla puede cambiar entre pintadas: se llama el último
    const back = useRef(onBack);
    useEffect(() => {
        back.current = onBack;
    }, [onBack]);
    const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (reset.current) clearTimeout(reset.current);
        },
        []
    );
    const leave = useCallback(() => {
        back.current();
        // Si por algo la pantalla sigue aquí (no se fue), vuelve a su sitio y se puede deslizar otra vez
        if (reset.current) clearTimeout(reset.current);
        reset.current = setTimeout(() => {
            leaving.set(false);
            offset.set(0);
        }, 1000);
    }, [leaving, offset]);

    const pan = usePanGesture({
        // Solo a la derecha; a la izquierda, o subiendo o bajando, no es para volver
        activeOffsetX: SWIPE_BACK.start,
        failOffsetX: -SWIPE_BACK.start,
        failOffsetY: [-SWIPE_BACK.failY, SWIPE_BACK.failY],
        maxPointers: 1,
        onBegin: () => {
            'worklet';
            armed.set(false);
        },
        onUpdate: (event) => {
            'worklet';
            if (leaving.get() || blocked.get()) return;
            const w = span.get();
            const x = swipeOffset(event.translationX, w);
            if (animate.get()) offset.set(x);
            const past = pastSwipeThreshold(x, w);
            if (past && !armed.get()) scheduleOnRN(vibrate);
            armed.set(past);
        },
        onDeactivate: (event) => {
            'worklet';
            if (leaving.get() || blocked.get()) return;
            const w = span.get();
            const moving = animate.get();
            if (!event.canceled && shouldSwipeBack(event.translationX, event.velocityX, w)) {
                leaving.set(true);
                if (!moving) {
                    scheduleOnRN(leave);
                    return;
                }
                offset.set(
                    withTiming(w, { duration: swipeOutMs(w - offset.get(), event.velocityX), easing: MOTION_EASE }, (finished) => {
                        if (finished) scheduleOnRN(leave);
                        else leaving.set(false);
                    })
                );
                return;
            }
            offset.set(moving ? withSpring(0, { duration: 300, dampingRatio: 1, overshootClamping: true, velocity: event.velocityX }) : 0);
        }
    });

    const page = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
    // La sombra y el oscurecido se van apagando mientras se va: al salir del todo no queda nada en el borde
    const edge = useAnimatedStyle(() => ({ opacity: offset.get() > 0 ? 1 - swipeProgress(offset.get(), span.get()) : 0 }));
    const dim = useAnimatedStyle(() => ({ opacity: offset.get() > 0 ? DIM * (1 - swipeProgress(offset.get(), span.get())) : 0 }));

    // Web: con el ratón una fila de lado no se arrastra; el toque que empieza dentro de una no vuelve (como en Android)
    const onPointerDown =
        Platform.OS === 'web'
            ? (event: unknown) => {
                  const pointer = event as { target?: unknown; currentTarget?: unknown; nativeEvent?: { target?: unknown } };
                  blocked.set(inSideScroller(pointer.target ?? pointer.nativeEvent?.target, pointer.currentTarget));
              }
            : undefined;

    return (
        <SwipeBackContext.Provider value={pan}>
            <View style={styles.root}>
                <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dim]} />
                <GestureDetector gesture={pan}>
                    <Animated.View collapsable={false} onPointerDown={onPointerDown} style={[styles.page, { backgroundColor: colors.bg }, page]}>
                        <Animated.View style={[styles.edge, edge]}>
                            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.14)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
                        </Animated.View>
                        {children}
                    </Animated.View>
                </GestureDetector>
            </View>
        </SwipeBackContext.Provider>
    );
};

/** Envuelve una pantalla que se apila (no una pestaña). `onBack`: lo mismo que hace su botón de atrás. */
export const SwipeBack: React.FC<{ onBack: () => void; children: React.ReactNode }> = ({ onBack, children }) => {
    if (Platform.OS === 'ios') return <>{children}</>;
    return <SwipeBackPan onBack={onBack}>{children}</SwipeBackPan>;
};

const styles = StyleSheet.create({
    root: { flex: 1 },
    page: { flex: 1 },
    dim: { backgroundColor: '#000', pointerEvents: 'none' },
    edge: { position: 'absolute', top: 0, bottom: 0, left: -EDGE, width: EDGE, pointerEvents: 'none' }
});
