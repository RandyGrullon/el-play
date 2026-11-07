import React, { useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useTheme } from '../../theme/theme';

// Lluvia sobre toda la pantalla del juego detenido por lluvia (como RainOverlay de la web): gotas inclinadas en tres
// capas (lejos: lentas, cortas y tenues; cerca: rápidas, largas y marcadas), salpicaduras abajo y un velo azul frío.
// Un solo reloj en el hilo de la interfaz mueve todo: cada gota da un número entero de vueltas por ciclo, así el ciclo
// empata sin salto. No se toca (pointerEvents none) y no la lee el lector de pantalla. Se detiene fuera de la pantalla
// o en segundo plano; entra y sale con un fundido de 600 ms.

const CYCLE_MS = 6000;
const FADE_MS = 600;
/** Cuánto se corre a la derecha por cada px que cae (el viento), igual que la web */
const TAN = 0.24;
const SLANT_DEG = (Math.atan(TAN) * 180) / Math.PI;

interface LayerSpec {
    count: number;
    /** Vueltas por ciclo (más = más rápida) */
    laps: [number, number];
    length: [number, number];
    width: number;
    opacity: [number, number];
}

// Unos 70 trazos (en el teléfono cada gota es una vista); por pantalla: lejos ~1,7 s, en medio ~1,1 s, cerca ~0,8 s
const LAYERS: LayerSpec[] = [
    { count: 30, laps: [3, 4], length: [8, 12], width: 1, opacity: [0.26, 0.34] },
    { count: 24, laps: [5, 6], length: [13, 18], width: 1.2, opacity: [0.4, 0.5] },
    { count: 16, laps: [7, 8], length: [20, 28], width: 1.6, opacity: [0.56, 0.66] }
];
const SPLASHES = 10;

interface Drop {
    x: number;
    phase: number;
    laps: number;
    length: number;
    width: number;
    opacity: number;
}

interface Splash {
    seed: number;
    phase: number;
    y: number;
    size: number;
}

// Azar con semilla: las gotas quedan en el mismo lugar en cada render
const seeded = (start: number) => {
    let seed = start;
    return () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };
};
const between = (random: () => number, [min, max]: [number, number]) => min + random() * (max - min);

const makeDrops = (): Drop[] => {
    const random = seeded(20261107);
    return LAYERS.flatMap((layer) =>
        Array.from({ length: layer.count }, () => ({
            x: random(),
            phase: random(),
            laps: Math.round(between(random, layer.laps)),
            length: Math.round(between(random, layer.length)),
            width: layer.width,
            opacity: between(random, layer.opacity)
        }))
    );
};

const makeSplashes = (): Splash[] => {
    const random = seeded(7);
    return Array.from({ length: SPLASHES }, () => ({ seed: random(), phase: random(), y: 0.88 + random() * 0.1, size: 14 + random() * 10 }));
};

const DropView: React.FC<{ drop: Drop; clock: SharedValue<number>; width: number; height: number; color: string }> = ({ drop, clock, width, height, color }) => {
    // Sale por arriba (también un poco a la izquierda: se corre a la derecha al caer) y cae hasta abajo
    const travel = height + drop.length * 2;
    const startX = drop.x * (width + TAN * travel) - TAN * travel;
    const style = useAnimatedStyle(() => {
        const turn = (clock.get() * drop.laps + drop.phase) % 1;
        const y = turn * travel - drop.length;
        return { transform: [{ translateX: startX + TAN * (y + drop.length) }, { translateY: y }, { rotate: `${-SLANT_DEG}deg` }] };
    });
    return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: drop.width, height: drop.length, borderRadius: drop.width, backgroundColor: color, opacity: drop.opacity }, style]} />;
};

const SplashView: React.FC<{ splash: Splash; clock: SharedValue<number>; width: number; height: number; color: string }> = ({ splash, clock, width, height, color }) => {
    const style = useAnimatedStyle(() => {
        // Una por segundo cada una: el anillo se abre y se apaga en 0,4 s (24 cuadros, como la web) y luego espera
        const value = clock.get() * 6 + splash.phase;
        const turn = value % 1;
        // Cada vuelta cae en otro lugar
        const place = (Math.floor(value) * 0.618 + splash.seed) % 1;
        const grow = Math.min(1, turn / 0.4);
        return {
            opacity: turn < 0.4 ? 0.6 * (1 - grow) : 0,
            transform: [{ translateX: place * width - splash.size / 2 }, { translateY: splash.y * height }, { scaleX: 0.25 + 0.75 * grow }, { scaleY: 0.25 + 0.75 * grow }]
        };
    });
    return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: splash.size, height: splash.size * 0.32, borderRadius: splash.size, borderWidth: 1, borderColor: color }, style]} />;
};

/** La lluvia en sí (montada solo mientras se ve o se desvanece) */
const RainLayer: React.FC<{ opacity: SharedValue<number>; running: boolean }> = ({ opacity, running }) => {
    const { isDark } = useTheme();
    const { width, height } = useWindowDimensions();
    const clock = useSharedValue(0);
    const drops = useMemo(makeDrops, []);
    const splashes = useMemo(makeSplashes, []);

    useEffect(() => {
        if (!running) {
            cancelAnimation(clock);
            return;
        }
        // Siempre desde 0: withRepeat vuelve al valor con que empezó y el ciclo tiene que empatar
        clock.set(0);
        clock.set(withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }), -1, false));
        return () => cancelAnimation(clock);
    }, [running, clock]);

    const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
    // Los colores de la web (--rain-drop y el velo de .rain-overlay)
    const streak = isDark ? 'rgb(196,220,250)' : 'rgb(52,92,140)';
    const ripple = isDark ? 'rgba(196,220,250,0.9)' : 'rgba(52,92,140,0.9)';

    return (
        <Animated.View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[StyleSheet.absoluteFill, { zIndex: 60, overflow: 'hidden' }, fade]}>
            {/* Velo azul frío, más denso abajo */}
            <LinearGradient colors={isDark ? ['rgba(8,24,48,0.26)', 'rgba(8,24,48,0.4)'] : ['rgba(28,62,108,0.1)', 'rgba(28,62,108,0.2)']} style={StyleSheet.absoluteFill} />
            {drops.map((drop, index) => (
                <DropView key={index} drop={drop} clock={clock} width={width} height={height} color={streak} />
            ))}
            {splashes.map((splash, index) => (
                <SplashView key={`s${index}`} splash={splash} clock={clock} width={width} height={height} color={ripple} />
            ))}
        </Animated.View>
    );
};

/** La app está a la vista (no en segundo plano) */
const useAppActive = () => {
    const [active, setActive] = useState(AppState.currentState !== 'background');
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (status) => setActive(status !== 'background'));
        return () => subscription?.remove();
    }, []);
    return active;
};

/**
 * Capa de lluvia de la pantalla del juego. `active`: el juego está detenido por lluvia, la lluvia no se quitó y se
 * anima (con «Apagadas» o reducir movimiento no se pinta). Al cambiar a false se desvanece.
 */
export const RainOverlay: React.FC<{ active: boolean }> = ({ active }) => {
    const focused = useIsFocused();
    const appActive = useAppActive();
    const running = active && focused && appActive;
    const [mounted, setMounted] = useState(running);
    const opacity = useSharedValue(0);
    // Montarla en cuanto toca llover (el patrón de React para ajustar estado con las props)
    if (running && !mounted) setMounted(true);

    useEffect(() => {
        if (running) {
            opacity.set(withTiming(1, { duration: FADE_MS, easing: Easing.out(Easing.quad) }));
            return;
        }
        opacity.set(withTiming(0, { duration: FADE_MS, easing: Easing.in(Easing.quad) }));
        const timer = setTimeout(() => setMounted(false), FADE_MS + 50);
        return () => clearTimeout(timer);
    }, [running, opacity]);

    if (!mounted) return null;
    // Mientras se desvanece sigue cayendo (en segundo plano ya no se ve: se detiene)
    return <RainLayer opacity={opacity} running={appActive && (running || focused)} />;
};

// «Quitar lluvia» vale para ese juego mientras la app siga abierta (no se guarda)
const hiddenRain = new Set<number>();

/** Si la lluvia de este juego se quitó, y el botón para quitarla o ponerla otra vez */
export const useRainToggle = (gamePk: number | null | undefined) => {
    const [hidden, setHidden] = useState(() => !!gamePk && hiddenRain.has(gamePk));
    const toggle = () => {
        const next = !hidden;
        if (gamePk) {
            if (next) hiddenRain.add(gamePk);
            else hiddenRain.delete(gamePk);
        }
        setHidden(next);
    };
    return [hidden, toggle] as const;
};
