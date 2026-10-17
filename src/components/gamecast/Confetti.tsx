import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';

// Papelitos de las animaciones: un estallido desde el centro o, en el campeonato, lloviendo desde arriba para no
// tapar el trofeo. Cada ráfaga es un solo valor animado (0→1) y cada papelito su trayectoria precalculada.

export interface Burst {
    /** ms desde que aparece la animación */
    at: number;
    count: number;
    rain?: boolean;
}

interface Piece {
    burst: number;
    x: number[];
    y: number[];
    rotate: [string, string];
    w: number;
    h: number;
    color: string;
}

const STEPS = 10;
const FRAME = 1000 / 60;

/** Trayectorias al azar de los papelitos de cada ráfaga (una sola vez por animación) */
const makePieces = (bursts: Burst[], width: number, height: number, colors: string[]) => {
    const list: Piece[] = [];
    bursts.forEach((burst, index) => {
        const frames = (burst.rain ? 3200 : 2200) / FRAME;
        for (let i = 0; i < burst.count; i++) {
            const rain = !!burst.rain;
            const x0 = rain ? Math.random() * width : width / 2 + (Math.random() - 0.5) * 80;
            const y0 = rain ? -20 - Math.random() * 120 : height * 0.4;
            const vx = rain ? (Math.random() - 0.5) * 2 : (Math.random() - 0.5) * 9;
            const vy = rain ? 1 + Math.random() * 2 : -Math.random() * 9 - 3;
            const g = rain ? 0.05 : 0.22;
            const r0 = Math.random() * 180;
            const spin = (Math.random() - 0.5) * 0.3 * frames * (180 / Math.PI);
            const xs: number[] = [];
            const ys: number[] = [];
            for (let step = 0; step <= STEPS; step++) {
                const f = (step / STEPS) * frames;
                xs.push(x0 + vx * f);
                ys.push(y0 + vy * f + (g * f * f) / 2);
            }
            list.push({ burst: index, x: xs, y: ys, rotate: [`${r0}deg`, `${r0 + spin}deg`], w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, color: colors[Math.floor(Math.random() * colors.length)] });
        }
    });
    return list;
};

export const Confetti: React.FC<{ width: number; height: number; colors: string[]; bursts: Burst[] }> = ({ width, height, colors, bursts }) => {
    // Las ráfagas quedan fijas al aparecer: si la pantalla se vuelve a pintar no se reinician
    const [plan] = useState(bursts);
    const [values] = useState(() => plan.map(() => new Animated.Value(0)));
    const [pieces] = useState(() => makePieces(plan, width, height, colors));

    useEffect(() => {
        const running = plan.map((burst, index) =>
            Animated.timing(values[index], { toValue: 1, duration: burst.rain ? 3200 : 2200, delay: burst.at, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' })
        );
        running.forEach((animation) => animation.start());
        return () => running.forEach((animation) => animation.stop());
    }, [plan, values]);

    const input = Array.from({ length: STEPS + 1 }, (_, step) => step / STEPS);
    return (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>
            {pieces.map((piece, index) => {
                const value = values[piece.burst];
                return (
                    <Animated.View
                        key={index}
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: piece.w,
                            height: piece.h,
                            marginLeft: -piece.w / 2,
                            marginTop: -piece.h / 2,
                            backgroundColor: piece.color,
                            opacity: value.interpolate({ inputRange: [0, 0.001, 0.85, 1], outputRange: [0, 1, 1, 0] }),
                            transform: [
                                { translateX: value.interpolate({ inputRange: input, outputRange: piece.x }) },
                                { translateY: value.interpolate({ inputRange: input, outputRange: piece.y }) },
                                { rotate: value.interpolate({ inputRange: [0, 1], outputRange: piece.rotate }) }
                            ]
                        }}
                    />
                );
            })}
        </View>
    );
};
