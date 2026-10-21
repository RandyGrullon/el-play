// Pantalla con scroll del PRO de Estadísticas y de la ficha: igual que Screen (layout.tsx), pero sabe cuánto se bajó.
// Con eso las tablas largas solo montan las filas que se ven (y unas de más) y su cabecera se queda pegada arriba
// mientras la tabla está en pantalla. Dentro de otra cosa (sin ProScroll) las tablas se pintan enteras.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { RefreshControl, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOTION_EASE, MOTION_MS, MOTION_STAGGER, useMotion } from '../../../lib/motion';
import { useColors } from '../../../theme/theme';

type ContentNode = ComponentRef<typeof View>;

interface ScrollShape {
    /** Cuánto se bajó (hilo de la interfaz) */
    y: SharedValue<number>;
    /** Alto de la parte que se ve */
    viewport: number;
    /** Contenido (para medir dónde queda cada tabla) */
    content: React.RefObject<ContentNode | null>;
    /** Sube cuando cambia el alto del contenido: las tablas vuelven a medir dónde quedaron */
    version: number;
    /** Dónde se pega la cabecera de una tabla (debajo de la barra de estado si la pantalla va detrás de ella) */
    stickTop: number;
}

const ScrollContext = createContext<ScrollShape | null>(null);
// Aparte, para que solo las tablas se vuelvan a pintar al bajar (cada CHUNK px)
const ChunkContext = createContext(0);
const CHUNK = 160;

interface ProScrollProps {
    children: React.ReactNode;
    onRefresh?: () => Promise<unknown>;
    /** Espacio de la barra de abajo y de la barra de estado (como Screen); false dentro de un modal con cabecera propia */
    tabScreen?: boolean;
    padded?: boolean;
    contentStyle?: StyleProp<ViewStyle>;
}

export const ProScroll: React.FC<ProScrollProps> = ({ children, onRefresh, tabScreen = true, padded = true, contentStyle }) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    const [refreshing, setRefreshing] = useState(false);
    const [viewport, setViewport] = useState(800);
    const [version, setVersion] = useState(0);
    const [chunk, setChunk] = useState(0);
    const content = useRef<ContentNode | null>(null);
    const y = useSharedValue(0);
    const onScroll = useAnimatedScrollHandler({
        onScroll: (event) => {
            y.set(event.contentOffset.y);
        }
    });
    useAnimatedReaction(
        () => Math.floor(y.get() / CHUNK),
        (next, previous) => {
            if (next !== previous) scheduleOnRN(setChunk, next);
        }
    );
    const shape = useMemo<ScrollShape>(() => ({ y, viewport, content, version, stickTop: tabScreen ? insets.top : 0 }), [y, viewport, version, tabScreen, insets.top]);
    return (
        <ScrollContext.Provider value={shape}>
            <ChunkContext.Provider value={chunk}>
                <Animated.ScrollView
                    style={{ flex: 1, backgroundColor: colors.bg }}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    onLayout={(event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.height)}
                    onContentSizeChange={() => setVersion((current) => current + 1)}
                    contentContainerStyle={{ paddingTop: tabScreen ? insets.top + 12 : 4, paddingBottom: tabScreen ? insets.bottom + 120 : insets.bottom + 32 }}
                    refreshControl={
                        onRefresh ? (
                            <RefreshControl
                                refreshing={refreshing}
                                tintColor={colors.accent}
                                colors={[colors.accent]}
                                onRefresh={async () => {
                                    setRefreshing(true);
                                    await onRefresh().catch(() => undefined);
                                    setRefreshing(false);
                                }}
                            />
                        ) : undefined
                    }
                >
                    <View ref={content} collapsable={false} style={[{ gap: 16, paddingHorizontal: padded ? 16 : 0 }, contentStyle]}>
                        {children}
                    </View>
                </Animated.ScrollView>
            </ChunkContext.Provider>
        </ScrollContext.Provider>
    );
};

/** Filas que se montan por encima y por debajo de lo que se ve */
const OVERSCAN_PX = 480;

export interface RowWindow {
    /** Va en el `ref` de la vista que contiene las filas (sin padding arriba) */
    setNode: (node: ContentNode | null) => void;
    onLayout: () => void;
    /** Primera y última fila a montar (incluidas) */
    first: number;
    last: number;
    /** Dónde empieza la tabla dentro del contenido (para la cabecera pegada); null antes de medir */
    offset: SharedValue<number>;
    /** Ya se midió */
    measured: boolean;
}

/**
 * Ventana de filas de una tabla larga (todas de `rowHeight`): fuera de un ProScroll, o antes de medir, monta las
 * primeras que caben en dos pantallas; después solo las que se ven y OVERSCAN_PX de más.
 */
export const useRowWindow = (count: number, rowHeight: number): RowWindow => {
    const scroll = useContext(ScrollContext);
    const chunk = useContext(ChunkContext);
    const [node, setNode] = useState<ContentNode | null>(null);
    const [top, setTop] = useState<number | null>(null);
    const offset = useSharedValue(-1);
    const version = scroll?.version ?? 0;
    const measure = useCallback(() => {
        const content = scroll?.content.current;
        if (!node || !content) return;
        node.measureLayout(
            content,
            (_x, y) => {
                setTop(y);
                offset.set(y);
            },
            () => undefined
        );
    }, [node, scroll?.content, offset]);
    // Se vuelve a medir cuando cambia el alto del contenido (algo de arriba creció o se encogió)
    useEffect(() => {
        measure();
    }, [measure, version]);

    if (!scroll || top === null) {
        const fit = Math.ceil(((scroll?.viewport ?? 800) * 2) / rowHeight);
        return { setNode, onLayout: measure, first: 0, last: Math.min(count, fit) - 1, offset, measured: false };
    }
    const scrolled = chunk * CHUNK;
    const from = scrolled - top - OVERSCAN_PX;
    const to = scrolled + scroll.viewport + CHUNK - top + OVERSCAN_PX;
    const first = Math.max(0, Math.floor(from / rowHeight));
    const last = Math.min(count - 1, Math.ceil(to / rowHeight));
    return { setNode, onLayout: measure, first, last, offset, measured: true };
};

/**
 * Fila de una tabla con ventana: va en su lugar (index × rowHeight) y se desliza al nuevo cuando cambia el orden
 * (300 ms). La primera vez, con la tabla recién montada (`born`), entra escalonada; las que aparecen al bajar, no.
 */
export const MovingRow: React.FC<{ index: number; rowHeight: number; born: number; children: React.ReactNode }> = ({ index, rowHeight, born, children }) => {
    const motion = useMotion();
    const y = useSharedValue(index * rowHeight);
    const shown = useSharedValue(1);
    useEffect(() => {
        if (!motion.animate) {
            y.set(index * rowHeight);
            return;
        }
        y.set(withTiming(index * rowHeight, { duration: MOTION_MS.flip, easing: MOTION_EASE }));
        return () => cancelAnimation(y);
    }, [index, rowHeight, motion.animate, y]);
    useEffect(() => {
        if (!motion.animate || Date.now() - born > 700) return;
        shown.set(0);
        shown.set(withDelay(motion.delay(index, MOTION_STAGGER.row), withTiming(1, { duration: MOTION_MS.flip, easing: MOTION_EASE })));
        return () => cancelAnimation(shown);
        // Solo al montarse
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: y.get() + (1 - shown.get()) * 8 }] }));
    return <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: rowHeight }, style]}>{children}</Animated.View>;
};

/**
 * Cabecera que se queda pegada arriba mientras su tabla se ve: baja con el scroll dentro de la tabla (sin salirse
 * de ella). `offset` es el de useRowWindow del cuerpo; `bodyHeight` el alto de todas las filas; `gap` lo que hay
 * entre la cabecera y el cuerpo (la fila fijada por la búsqueda).
 */
export const StickyHeader: React.FC<{ offset: SharedValue<number>; height: number; bodyHeight: number; gap?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({
    offset,
    height,
    bodyHeight,
    gap = 0,
    children,
    style
}) => {
    const scroll = useContext(ScrollContext);
    const y = useSharedValue(0);
    const source = scroll?.y ?? y;
    const stickTop = scroll?.stickTop ?? 0;
    // Con pocas filas no vale la pena: la tabla entera cabe en la pantalla
    const sticky = !!scroll && bodyHeight > 6 * height;
    const pinned = useAnimatedStyle(() => {
        const start = offset.get();
        if (!sticky || start < 0) return { transform: [{ translateY: 0 }] };
        // Empieza a bajar cuando su borde de arriba llega a stickTop; se detiene antes de la última fila
        const natural = start - gap - height;
        const shift = source.get() + stickTop - natural;
        return { transform: [{ translateY: Math.min(Math.max(0, shift), Math.max(0, bodyHeight + gap - height)) }] };
    });
    return <Animated.View style={[{ zIndex: 2, height }, style, pinned]}>{children}</Animated.View>;
};
