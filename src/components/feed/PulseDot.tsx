import React, { useEffect, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { useReduceMotion } from '../ui';

// Punto que late (en vivo): como animate-pulse de la web
export const PulseDot: React.FC<{ color: string; size?: number }> = ({ color, size = 6 }) => {
    const [pulse] = useState(() => new Animated.Value(1));
    // Con «Reducir movimiento» el punto queda fijo
    const reduce = useReduceMotion();
    useEffect(() => {
        if (reduce) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' })
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulse, reduce]);
    return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: reduce ? 1 : pulse }} />;
};
