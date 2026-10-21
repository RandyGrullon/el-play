import React, { useEffect } from 'react';
import { Path, type PathProps } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { MOTION_EASE, MOTION_MS, MOTION_STAGGER, useMotion } from '../../../lib/motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface DrawPathProps extends Omit<PathProps, 'strokeDasharray' | 'strokeDashoffset'> {
    d: string;
    /** Largo del trazo en px (polylineLength, stepLength o arcLength de paths.ts) */
    length: number;
    /** La gráfica ya entró en pantalla: empieza a dibujarse (900 ms) */
    seen: boolean;
    /** Para escalonar varias líneas (40 ms cada una) */
    index?: number;
    duration?: number;
    /** Hasta dónde se dibuja (0-1): 1 la línea entera; un arco de medidor usa la parte llena */
    share?: number;
}

/** Cuánto del trazo se ve (0-1): se dibuja al verse y se desliza si cambia `share` */
export const useDraw = (seen: boolean, share = 1, index = 0, duration: number = MOTION_MS.line) => {
    const motion = useMotion();
    const target = Math.min(1, Math.max(0, share));
    const progress = useSharedValue(motion.animate ? 0 : target);
    useEffect(() => {
        if (!motion.animate) {
            progress.set(target);
            return;
        }
        if (!seen) return;
        const timing = withTiming(target, { duration, easing: MOTION_EASE });
        progress.set(progress.get() === 0 ? withDelay(motion.delay(index, MOTION_STAGGER.bar), timing) : timing);
        return () => cancelAnimation(progress);
    }, [target, seen, motion, index, duration, progress]);
    return progress;
};

// Línea que se dibuja de un extremo al otro (strokeDashoffset). Sin movimiento sale entera.
// No sirve para líneas punteadas: el trazo animado usa su propio strokeDasharray.
export const DrawPath: React.FC<DrawPathProps> = ({ d, length, seen, index = 0, duration = MOTION_MS.line, share = 1, ...rest }) => {
    const progress = useDraw(seen, share, index, duration);
    // Un pelo más largo que el trazo: sin la rayita del final al terminar
    const total = Math.max(1, length + 1);
    const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: total * (1 - progress.get()) }));
    return <AnimatedPath {...rest} d={d} strokeDasharray={[total, total]} animatedProps={animatedProps} />;
};
