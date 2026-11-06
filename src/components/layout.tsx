import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { StatusBar } from 'expo-status-bar';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart3, Home, Menu, Radio, Sparkles, WifiOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColors, useTheme } from '../theme/theme';
import { shadow } from '../theme/tokens';
import { Txt } from './ui';
import { useNow } from './feed/useNow';
import { useSchedule } from '../lib/queries';
import { offlineAge } from '../lib/format';
import { useLeague } from '../state/league';

/** Pantalla con scroll, «desliza para recargar» y espacio para la barra de abajo */
export const Screen: React.FC<{ children: React.ReactNode; onRefresh?: () => Promise<unknown>; contentStyle?: StyleProp<ViewStyle>; padded?: boolean }> = ({ children, onRefresh, contentStyle, padded = true }) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    const [refreshing, setRefreshing] = useState(false);
    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: colors.bg }}
            contentContainerStyle={[{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120, gap: 16, paddingHorizontal: padded ? 16 : 0 }, contentStyle]}
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
        </ScrollView>
    );
};

// ---------------------------------------------------------------- barra de abajo

const ICONS: Record<string, typeof Home> = { index: Home, posiciones: BarChart3, fantasy: Sparkles, mas: Menu };

/** Igual que la web: barra oscura flotante, cuatro secciones y el botón rojo de los juegos en vivo en el centro */
export const ElPlayTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, emitter, navigateToTab }) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    const { t } = useTranslation();
    const { activeLeague } = useLeague();
    const schedule = useSchedule(activeLeague);
    const live = schedule.data?.games.filter((game) => game.state === 'live').length ?? 0;
    const labels: Record<string, string> = { index: t('nav.games'), posiciones: t('nav.standings'), fantasy: t('nav.fantasy'), mas: t('nav.more') };

    const tab = (name: string) => {
        const index = state.routes.findIndex((route) => route.name === name);
        if (index < 0) return null;
        const route = state.routes[index];
        const focused = state.index === index;
        const Icon = ICONS[name] ?? Home;
        const color = focused ? '#fff' : colors.navInk;
        return (
            <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={labels[name]}
                onPress={() => {
                    // Como la barra de Expo Router: avisa tabPress (lo usan useScrollToTop y los listeners) y deja cancelarlo
                    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) navigateToTab(route.key);
                    Haptics.selectionAsync().catch(() => undefined);
                }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, height: 64 }}
            >
                <Icon size={22} color={color} />
                <Txt size={11} weight="semibold" color={color} numberOfLines={1}>
                    {labels[name] ?? descriptors[route.key]?.options.title}
                </Txt>
            </Pressable>
        );
    };

    return (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 16 }}>
            <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.nav, borderRadius: 28, height: 64, maxWidth: 520, width: '100%', alignSelf: 'center' }, shadow('float')]}>
                {tab('index')}
                {tab('posiciones')}
                <View style={{ width: 76, alignItems: 'center' }}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('nav.live')}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                            router.push('/en-vivo');
                        }}
                        style={({ pressed }) => [
                            { marginTop: -30, width: 64, height: 64, borderRadius: 32, backgroundColor: colors.live, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.bg, transform: [{ scale: pressed ? 0.95 : 1 }] },
                            shadow('float')
                        ]}
                    >
                        <Radio size={26} color="#fff" />
                        {live > 0 && (
                            <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                                <Txt size={11} weight="extrabold" color={colors.live}>
                                    {live}
                                </Txt>
                            </View>
                        )}
                    </Pressable>
                </View>
                {tab('fantasy')}
                {tab('mas')}
            </View>
        </View>
    );
};

// ---------------------------------------------------------------- sin conexión

// Hay internet según React Query (que lo sabe por NetInfo, ver app/_layout.tsx)
const subscribeOnline = (listener: () => void) => onlineManager.subscribe(listener);
const useOnline = () => useSyncExternalStore(subscribeOnline, () => onlineManager.isOnline());

/** Igual que la web: sin conexión no se bloquea la app; se avisa arriba y se siguen viendo los últimos datos */
const OfflineBanner: React.FC<{ top: number }> = ({ top }) => {
    const { t } = useTranslation();
    const { colors, isDark } = useTheme();
    const client = useQueryClient();
    const now = useNow(30000);
    // Lo más nuevo que hay en pantalla: los datos de la última vez que hubo señal
    const updated = Math.max(0, ...client.getQueryCache().getAll().map((query) => query.state.dataUpdatedAt || 0));
    const minutes = offlineAge(updated, now);
    return (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.ink, paddingHorizontal: 16, paddingTop: top + 8, paddingBottom: 8 }}>
            {/* La barra de estado va sobre el aviso (fondo del color del texto): sus íconos del color contrario */}
            <StatusBar style={isDark ? 'dark' : 'light'} />
            <WifiOff size={14} color={colors.bg} />
            <Txt size={12} weight="semibold" color={colors.bg} center style={{ flexShrink: 1 }}>
                {minutes === null ? t('offline.banner') : t('offline.bannerAge', { count: minutes })}
            </Txt>
        </View>
    );
};

/**
 * Marco de toda la app (el AppShell de la web): el aviso de «sin conexión» arriba, encima de cualquier pantalla. Con el
 * aviso puesto, el aviso ya cubre la barra de estado y las pantallas quedan debajo: para ellas el margen de arriba es 0.
 */
export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const insets = useSafeAreaInsets();
    const online = useOnline();
    const inner = useMemo(() => (online ? insets : { ...insets, top: 0 }), [online, insets]);
    return (
        <View style={{ flex: 1 }}>
            {!online && <OfflineBanner top={insets.top} />}
            <SafeAreaInsetsContext.Provider value={inner}>{children}</SafeAreaInsetsContext.Provider>
        </View>
    );
};

// ---------------------------------------------------------------- aviso corto

// Vive en ui.tsx porque la hoja (Sheet) también lo pinta: así no hay import circular
export { Toast } from './ui';
