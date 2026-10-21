import React, { createContext, useContext, useState } from 'react';
import { RefreshControl, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../../../../theme/theme';

// Scroll de la pantalla del juego en PRO: el mismo ScrollView de `Screen` (src/components/layout.tsx) pero con el
// desplazamiento en un shared value de Reanimated, para la barra de mando que aparece al bajar y las pestañas que
// se quedan pegadas arriba. El Lite sigue con `Screen` tal cual.

export interface ProScrollState {
    /** Cuánto se bajó (px) */
    y: SharedValue<number>;
    /** Dónde empieza el contenido PRO, justo bajo la cabecera (px desde el tope del contenido) */
    top: SharedValue<number>;
}

const ProScrollContext = createContext<ProScrollState | null>(null);

export const ProScrollProvider = ProScrollContext.Provider;

/** El scroll de la pantalla del juego PRO (null fuera de ProGameScroll: entonces nada se pega) */
export const useProScroll = () => useContext(ProScrollContext);

/** Los shared values del scroll (la pantalla los crea y los comparte con la barra y con ProGame) */
export const useProScrollState = (): ProScrollState => {
    const y = useSharedValue(0);
    const top = useSharedValue(Number.POSITIVE_INFINITY);
    return { y, top };
};

interface ProGameScrollProps {
    state: ProScrollState;
    children: React.ReactNode;
    onRefresh?: () => Promise<unknown>;
    contentStyle?: StyleProp<ViewStyle>;
}

export const ProGameScroll: React.FC<ProGameScrollProps> = ({ state, children, onRefresh, contentStyle }) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    const [refreshing, setRefreshing] = useState(false);
    const { y } = state;
    const onScroll = useAnimatedScrollHandler((event) => {
        y.set(event.contentOffset.y);
    });
    return (
        <Animated.ScrollView
            onScroll={onScroll}
            scrollEventThrottle={16}
            style={{ flex: 1, backgroundColor: colors.bg }}
            contentContainerStyle={[{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120, gap: 16, paddingHorizontal: 0 }, contentStyle]}
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
            {children}
        </Animated.ScrollView>
    );
};
