import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useTranslation } from 'react-i18next';
import { BarChart3, Home, Menu, Radio, Sparkles, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '../theme/theme';
import { radius, shadow } from '../theme/tokens';
import { Txt } from './ui';
import { hideToast, useToast } from '../lib/toast';
import { useSchedule } from '../lib/queries';
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
export const ElPlayTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigateToTab }) => {
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
                    if (!focused) navigateToTab(route.key);
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

// ---------------------------------------------------------------- aviso corto

export const Toast: React.FC = () => {
    const toast = useToast();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    if (!toast) return null;
    return (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 96 }}>
            <View accessibilityRole="alert" style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.ink, borderRadius: radius.tile, padding: 12, paddingLeft: 16, maxWidth: 480, alignSelf: 'center', width: '100%' }, shadow('float')]}>
                <Txt size={14} weight="medium" color={colors.bg} style={{ flex: 1 }}>
                    {toast.text}
                </Txt>
                {toast.action && (
                    <Pressable
                        onPress={() => {
                            toast.action?.run();
                            hideToast();
                        }}
                        style={{ backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                        <Txt size={13} weight="semibold" tone="white">
                            {toast.action.label}
                        </Txt>
                    </Pressable>
                )}
                <Pressable onPress={hideToast} hitSlop={8}>
                    <X size={16} color={colors.bg} />
                </Pressable>
            </View>
        </View>
    );
};
