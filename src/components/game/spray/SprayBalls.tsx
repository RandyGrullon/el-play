import React from 'react';
import { Circle } from 'react-native-svg';
import { Path } from 'react-native-svg';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';

// Una bola del mapa: el vuelo que se dibuja (strokeDashoffset), la marca que cae con un anillo y, si es jonrón, el brillo.
// Todo sale de un solo reloj (ms) en el hilo de la interfaz: sin volver a pintar React mientras vuela.

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Parte del tiempo en la que el vuelo llega y cae la marca */
const LAND = 0.68;

export interface BallArt {
    k: number;
    d: string;
    length: number;
    cx: number;
    cy: number;
    r: number;
    color: string;
    hollow: boolean;
    glow: boolean;
    /** ms del reloj en que sale (−1: ya está quieta; muy grande: todavía no) */
    start: number;
    dur: number;
    u: number;
    glowFill: string;
}

interface Clocks {
    clock: SharedValue<number>;
    focus: SharedValue<number>;
    focusStart: SharedValue<number>;
}

export const SprayBallArt: React.FC<BallArt & Clocks> = React.memo(function SprayBallArt({ k, d, length, cx, cy, r, color, hollow, glow, start, dur, u, glowFill, clock, focus, focusStart }) {
    const total = Math.max(1, length + 1);
    const path = useAnimatedProps(() => {
        const s = focus.get() === k ? focusStart.get() : start;
        const p = s < 0 ? 1 : Math.min(1, Math.max(0, (clock.get() - s) / dur));
        const f = focus.get();
        return {
            strokeDashoffset: total * (1 - Math.min(1, p / LAND)),
            strokeOpacity: f < 0 ? 0.5 : f === k ? 0.95 : 0.1,
            strokeWidth: (f === k ? 2.6 : 1.3) * u
        };
    });
    const mark = useAnimatedProps(() => {
        const s = focus.get() === k ? focusStart.get() : start;
        const p = s < 0 ? 1 : Math.min(1, Math.max(0, (clock.get() - s) / dur));
        const q = Math.max(0, (p - LAND) / (1 - LAND));
        // Cae con un rebotito: crece un poco más y se posa
        const pop = p < LAND ? 0 : q < 0.5 ? (q / 0.5) * 1.25 : 1.25 - (q - 0.5) * 0.5;
        const f = focus.get();
        return { r: r * pop, opacity: f < 0 || f === k ? 1 : 0.3 };
    });
    const ripple = useAnimatedProps(() => {
        const s = focus.get() === k ? focusStart.get() : start;
        const p = s < 0 ? 1 : Math.min(1, Math.max(0, (clock.get() - s) / dur));
        const q = Math.max(0, (p - LAND) / (1 - LAND));
        return { r: r * (1 + 2.4 * q), opacity: p >= LAND && p < 1 ? 0.6 * (1 - q) : 0 };
    });
    const halo = useAnimatedProps(() => {
        const s = focus.get() === k ? focusStart.get() : start;
        const p = s < 0 ? 1 : Math.min(1, Math.max(0, (clock.get() - s) / dur));
        const f = focus.get();
        return { opacity: p < LAND ? 0 : f < 0 || f === k ? 1 : 0.25 };
    });
    return (
        <>
            <AnimatedPath d={d} fill="none" stroke={color} strokeLinecap="round" strokeDasharray={[total, total]} animatedProps={path} />
            {glow && <AnimatedCircle cx={cx} cy={cy} r={r * 4} fill={glowFill} animatedProps={halo} />}
            <AnimatedCircle cx={cx} cy={cy} r={0} fill="none" stroke={hollow ? '#ffffff' : color} strokeWidth={1.4 * u} animatedProps={ripple} />
            <AnimatedCircle cx={cx} cy={cy} r={0} fill={hollow ? 'rgba(255,255,255,0.18)' : color} stroke={hollow ? '#ffffff' : 'rgba(0,0,0,0.45)'} strokeWidth={(hollow ? 1.8 : 1) * u} animatedProps={mark} />
        </>
    );
});
