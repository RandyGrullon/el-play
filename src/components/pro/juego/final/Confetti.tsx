import React, { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useMotion } from '../../kit';

// Confeti del campeonato con los colores del campeón. Va por tiempo, no por cuadros: un solo reloj de 0 a 1 en 3,5 s
// (Reanimated) y cada pieza calcula su posición con los segundos que pasaron (corrige el de PlayAnimation, que
// avanzaba por cuadro). Sale una vez por juego mientras la app esté abierta, y nunca con «menos movimiento» ni con
// las animaciones apagadas. Es decorativo: el lector no lo ve y no tapa los toques.

const DURATION = 3500;
const PIECES = 90;

// Juegos que ya tiraron su confeti en esta sesión
const played = new Set<string>();

/** Números al azar repetibles (mulberry32): el mismo juego da el mismo confeti */
const random = (seed: number) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

interface Piece {
    x: number;
    y: number;
    vx: number;
    vy: number;
    spin: number;
    size: number;
    color: string;
}

const Bit: React.FC<{ piece: Piece; clock: SharedValue<number> }> = ({ piece, clock }) => {
    const style = useAnimatedStyle(() => {
        const elapsed = clock.get() * DURATION;
        const t = elapsed / 1000;
        const fade = Math.max(0, 1 - Math.max(0, elapsed - (DURATION - 800)) / 800);
        return {
            opacity: fade,
            transform: [
                { translateX: piece.x + piece.vx * t + Math.sin(t * 3 + piece.size) * 12 },
                { translateY: piece.y + piece.vy * t + 160 * t * t },
                { rotate: `${piece.spin * t}rad` }
            ]
        };
    });
    return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: piece.size, height: piece.size / 2, backgroundColor: piece.color }, style]} />;
};

export const Confetti: React.FC<{ colors: string[]; gameKey: string }> = ({ colors, gameKey }) => {
    const motion = useMotion();
    const window = useWindowDimensions();
    const [fresh] = useState(() => !played.has(gameKey));
    const [pieces] = useState(() => {
        const next = random(gameKey.split('').reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7));
        return Array.from({ length: PIECES }, (_, index): Piece => ({
            x: next() * window.width,
            y: -20 - next() * window.height * 0.4,
            vx: (next() - 0.5) * 120,
            vy: 120 + next() * 220,
            spin: (next() - 0.5) * 12,
            size: 6 + next() * 6,
            color: colors[index % colors.length]
        }));
    });
    const clock = useSharedValue(0);
    const show = motion.animate && fresh;

    useEffect(() => {
        if (!show) return;
        played.add(gameKey);
        clock.set(withTiming(1, { duration: DURATION, easing: Easing.linear }));
        return () => cancelAnimation(clock);
    }, [show, gameKey, clock]);

    if (!show) return null;
    return (
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ position: 'absolute', top: -200, left: -16, width: window.width, height: window.height, zIndex: 50, overflow: 'hidden' }}>
            {pieces.map((piece, index) => (
                <Bit key={index} piece={piece} clock={clock} />
            ))}
        </View>
    );
};
