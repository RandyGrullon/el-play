// Movimiento del modo PRO: si animar y cuánto, según «Animaciones» (Más) y «Reducir movimiento» del sistema.
// Con «Apagadas» o con reducir movimiento cada pieza muestra su estado final (como mucho un fundido de 150 ms).
// Igual que src/lib/motion.ts de la web; aquí las curvas son las de Reanimated.
import { useMemo } from 'react';
import { Easing } from 'react-native-reanimated';
import { usePreferences } from '../state/preferences';
import { useReduceMotion } from '../components/ui';

/** Duraciones de referencia del diseño PRO (ms) */
export const MOTION_MS = {
    /** Salida al tocar y fundido que queda sin movimiento */
    fade: 150,
    /** Cambio de pestaña y segmentado */
    tab: 200,
    /** Filas que se reordenan y tarjetas que entran */
    flip: 300,
    /** Marcador tipo odómetro */
    odometer: 400,
    /** Hojas con resorte */
    sheet: 450,
    /** Barras que crecen */
    bar: 500,
    /** Cifras que cuentan */
    count: 600,
    /** «+1» del marcador */
    plusOne: 700,
    /** Líneas que se dibujan */
    line: 900
} as const;

/** Pausa entre elementos de una entrada escalonada (ms) */
export const MOTION_STAGGER = { row: 30, list: 35, bar: 40 } as const;

/** Curva de salida suave (cubic-bezier(.2,.8,.2,1), la de la web) para withTiming */
export const MOTION_EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Curva para las animaciones por tiempo hechas a mano (contar cifras): rápida al principio, se posa al final */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// En listas largas la fila 40 no espera más de medio segundo
const MAX_STAGGERED = 12;

export type MotionReason = 'reduced' | 'off' | null;

export interface Motion {
    /** true: las piezas se mueven (cuentan, crecen, se dibujan, se deslizan) */
    animate: boolean;
    /** Por qué no se anima: «Reducir movimiento» del sistema o «Animaciones: Apagadas» */
    reason: MotionReason;
    /** La preferencia tal cual: all, smart u off (y «cine» si algún día existe) */
    mode: string;
    /** Duración de una pieza de interfaz: la de referencia si anima; 0 si no */
    ms: (reference: number) => number;
    /** Retraso de la pieza `index` en una entrada escalonada (0 si no anima) */
    delay: (index: number, step?: number) => number;
    /** Duración de una jugada (2–3,5 s): «cine» la alarga un 30 % */
    playMs: (reference: number) => number;
}

/** Regla pura: qué hacer con este modo y esta preferencia del sistema */
export const motionFor = (mode: string, reduced: boolean): Motion => {
    const reason: MotionReason = reduced ? 'reduced' : mode === 'off' ? 'off' : null;
    const animate = reason === null;
    const playScale = mode === 'cine' ? 1.3 : 1;
    return {
        animate,
        reason,
        mode,
        ms: (reference) => (animate ? reference : 0),
        delay: (index, step = MOTION_STAGGER.bar) => (animate ? Math.min(Math.max(Math.floor(index), 0), MAX_STAGGERED) * step : 0),
        playMs: (reference) => (animate ? Math.round(reference * playScale) : 0)
    };
};

// Fuera del proveedor de preferencias (imágenes para compartir) se anima como en «smart»
const useAnimationMode = (): string => {
    try {
        return usePreferences().animationMode;
    } catch {
        return 'smart';
    }
};

/** «Reducir movimiento» del sistema (iOS, Android y la web), al día si se cambia con la app abierta */
export const useReducedMotion = useReduceMotion;

/** Cuánto animar en el modo PRO. Toda pieza animada del kit lo respeta. */
export const useMotion = (): Motion => {
    const mode = useAnimationMode();
    const reduced = useReduceMotion();
    return useMemo(() => motionFor(mode, reduced), [mode, reduced]);
};
