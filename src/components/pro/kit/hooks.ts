// Ganchos del kit PRO: ver si algo entró en pantalla, medir el ancho de una gráfica, reloj y cambios de un dato.
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Dimensions, type LayoutChangeEvent, type View } from 'react-native';
import { useMotion } from '../../../lib/motion';

// Cada cuánto se mira si una pieza que todavía no se ve ya entró en pantalla (React Native no tiene IntersectionObserver)
const VIEW_POLL_MS = 300;

/** Lo que llega en el `ref` de una <View> */
export type ViewNode = ComponentRef<typeof View>;

export interface InView {
    /** Va en el `ref` de la vista que se vigila: ref={view.setNode} (ref de función; no se lee durante el render) */
    setNode: (node: ViewNode | null) => void;
    /** Va en `onLayout` de esa misma vista */
    onLayout: () => void;
    /** Ya se vio (una vez). Sin animaciones es true desde el principio. */
    seen: boolean;
}

/**
 * La vista entró en pantalla (una vez). Sin animar (Apagadas o reducir movimiento) se da por vista enseguida.
 * Se mide con measureInWindow al acomodarse y cada 300 ms mientras siga fuera de la pantalla.
 * Con `watch` en false no mira nada (cuando quien la usa ya recibe `seen` de su lista).
 */
export const useInView = (watch = true): InView => {
    const motion = useMotion();
    const [node, setNode] = useState<ViewNode | null>(null);
    const [seen, setSeen] = useState(false);
    const check = useCallback(() => {
        node?.measureInWindow((x, y, width, height) => {
            const screen = Dimensions.get('window');
            // Entra cuando asoma por lo menos un poco por abajo (el 8 % de abajo no cuenta, como la web)
            if (width > 0 && y < screen.height * 0.92 && y + height > 0 && x < screen.width && x + width > 0) setSeen(true);
        });
    }, [node]);
    useEffect(() => {
        if (!motion.animate || seen || !watch || !node) return;
        check();
        const id = setInterval(check, VIEW_POLL_MS);
        return () => clearInterval(id);
    }, [motion.animate, seen, check, watch, node]);
    return { setNode, onLayout: check, seen: seen || !motion.animate };
};

/** Ancho en px de una vista, al día si cambia (girar el teléfono). `fallback` antes de medir. */
export const useElementWidth = (fallback = 320) => {
    const [width, setWidth] = useState(fallback);
    const onLayout = useCallback((event: LayoutChangeEvent) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0) setWidth(next);
    }, []);
    return { width, onLayout };
};

/** Lo que necesita una gráfica: su ancho y si ya se vio (para dibujarse al entrar) */
export const useChartBox = (fallback = 320) => {
    const { width, onLayout: measure } = useElementWidth(fallback);
    const view = useInView();
    const { onLayout: look } = view;
    const onLayout = useCallback(
        (event: LayoutChangeEvent) => {
            measure(event);
            look();
        },
        [measure, look]
    );
    return { setNode: view.setNode, onLayout, width, seen: view.seen };
};

/** La hora actual, al día cada `interval` ms (para «hace 7 s» y cuentas regresivas). null pausa el reloj. */
export const useNow = (interval: number | null = 1000) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (interval === null) return;
        const id = setInterval(() => setNow(Date.now()), interval);
        return () => clearInterval(id);
    }, [interval]);
    return now;
};

/**
 * Cuántas veces cambió `value` desde que se montó (0 al principio). Sirve de `key` o de disparador para repetir
 * una animación de resaltado cada vez que llega un dato nuevo.
 */
export const useChanged = (value: unknown) => {
    const previous = useRef(value);
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (Object.is(previous.current, value)) return;
        previous.current = value;
        setCount((current) => current + 1);
    }, [value]);
    return count;
};

/** Dirección del último cambio de un número: 1 subió, −1 bajó, 0 igual (para flechas y destellos verde/rojo) */
export const useTrend = (value: number | null | undefined) => {
    const previous = useRef(value);
    const [trend, setTrend] = useState<1 | -1 | 0>(0);
    useEffect(() => {
        const before = previous.current;
        previous.current = value;
        if (before === null || before === undefined || value === null || value === undefined || before === value) return;
        setTrend(value > before ? 1 : -1);
    }, [value]);
    return trend;
};
