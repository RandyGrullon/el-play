import React, { useEffect, useRef, useState } from 'react';
import { Text, type TextProps } from 'react-native';
import { MOTION_MS, useMotion } from '../../../lib/motion';
import { decimalsOf, tween } from './tween';

interface CountUpProps extends Omit<TextProps, 'children'> {
    value: number;
    /** Cómo se escribe el número (por defecto con los decimales del valor final) */
    format?: (value: number) => string;
    /** Desde dónde cuenta la primera vez (0) */
    from?: number;
    duration?: number;
    /**
     * Ya entró en pantalla: empieza a contar. Por defecto cuenta al montarse. Un texto dentro de otro texto no se puede
     * medir: el padre (una vista) usa useInView y pasa `seen`.
     */
    seen?: boolean;
}

// Número que cuenta hacia arriba (600 ms) y del valor viejo al nuevo cuando cambia. Va por tiempo, no por cuadros.
// Dentro de un <Txt> hereda su letra; el lector de pantalla oye solo el valor final.
export const CountUp: React.FC<CountUpProps> = ({ value, format, from = 0, duration = MOTION_MS.count, seen = true, ...rest }) => {
    const motion = useMotion();
    const [shown, setShown] = useState(from);
    const shownRef = useRef(from);
    const write = format ?? ((n: number) => n.toFixed(decimalsOf(value)));

    useEffect(() => {
        if (!motion.animate || !seen) return;
        const start = shownRef.current;
        if (start === value) return;
        let frame = 0;
        const began = Date.now();
        const step = () => {
            const next = tween(start, value, Date.now() - began, duration);
            shownRef.current = next;
            setShown(next);
            if (next !== value) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [value, seen, motion.animate, duration]);

    // Sin animar (o antes de verse con animación apagada) sale el valor final tal cual
    const display = motion.animate ? shown : value;
    return (
        <Text {...rest} accessibilityLabel={write(value)} style={[{ fontVariant: ['tabular-nums'] }, rest.style]}>
            {write(display)}
        </Text>
    );
};
