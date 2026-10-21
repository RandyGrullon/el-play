import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Activity, BarChart3, Check, Sparkles, Star, Table2, User as UserIcon } from 'lucide-react-native';
import { useSession } from '../../../lib/account';
import { justActivatedPro, setUiMode, useUiModeSyncState, type UiMode } from '../../../lib/pro';
import { PRO_GRADIENT, PRO_GRADIENT_LINE, fonts, radius, shadow } from '../../../theme/tokens';
import { ProBadge, TeamLogo, Txt } from '../../ui';
import { CountUp, MOTION_EASE, useMotion } from '../kit';
import type { StatsTeam } from '../../../lib/stats';
import { LogoMark } from './LogoMark';
import { useNotificationPermission } from './notifications';

// Centro PRO: la cabecera de «Más» con el degradado de la marca (que se mueve lento), la cuenta, el interruptor
// Lite ↔ PRO y el estado de la app (instalada, avisos, juegos con aviso). Al activar PRO, un barrido cruza la tarjeta.
// Va sobre el degradado (con un velo oscuro): el texto blanco se lee igual en el tema claro y en el oscuro.

const PERKS = [
    { key: 'stats', Icon: Table2 },
    { key: 'live', Icon: Activity },
    { key: 'standings', Icon: BarChart3 },
    { key: 'fantasy', Icon: Star }
] as const;

const SPRING = Easing.bezier(0.3, 1.35, 0.5, 1);
const WHITE_85 = 'rgba(255,255,255,0.88)';
const PURPLE = '#6d28d9';

/** El degradado de la marca, el doble de ancho, que va y viene despacio (quieto sin movimiento) */
const FlowingGradient: React.FC<{ width: number; animate: boolean }> = ({ width, animate }) => {
    const shift = useSharedValue(0);
    useEffect(() => {
        if (!animate) {
            shift.set(0);
            return;
        }
        shift.set(withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.quad) }), -1, true));
        return () => cancelAnimation(shift);
    }, [animate, shift]);
    const style = useAnimatedStyle(() => ({ transform: [{ translateX: -shift.get() * width }] }));
    return (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: width * 2 }, style]}>
            <LinearGradient colors={[...PRO_GRADIENT, PRO_GRADIENT[1], PRO_GRADIENT[0]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.35 }} style={{ flex: 1 }} />
        </Animated.View>
    );
};

/** Barrido de luz que cruza la tarjeta una vez (al activar PRO) */
const Sweep: React.FC<{ width: number }> = ({ width }) => {
    const pass = useSharedValue(0);
    useEffect(() => {
        pass.set(withTiming(1, { duration: 950, easing: MOTION_EASE }));
        return () => cancelAnimation(pass);
    }, [pass]);
    const style = useAnimatedStyle(() => ({ opacity: pass.get() < 1 ? 1 : 0, transform: [{ translateX: -width * 0.8 + pass.get() * width * 1.8 }, { skewX: '-18deg' }] }));
    return (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: width * 0.7 }, style]}>
            <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']} {...PRO_GRADIENT_LINE} style={{ flex: 1 }} />
        </Animated.View>
    );
};

export const ProCenter: React.FC<{ favorite: StatsTeam | null; alertCount: number }> = ({ favorite, alertCount }) => {
    const { t } = useTranslation();
    const session = useSession();
    const motion = useMotion();
    const insets = useSafeAreaInsets();
    const sync = useUiModeSyncState();
    const permission = useNotificationPermission();
    const [sweep] = useState(() => justActivatedPro());
    const [mode, setMode] = useState<UiMode>('pro');
    const [width, setWidth] = useState(390);
    const [switchWidth, setSwitchWidth] = useState(0);
    const knob = useSharedValue(1);

    useEffect(() => {
        knob.set(motion.animate ? withTiming(mode === 'pro' ? 1 : 0, { duration: 420, easing: SPRING }) : mode === 'pro' ? 1 : 0);
        return () => cancelAnimation(knob);
    }, [mode, motion.animate, knob]);
    const half = Math.max(0, (switchWidth - 8) / 2);
    const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.get() * half }] }));

    const choose = (next: UiMode) => {
        if (!session || next === mode) return;
        setMode(next);
        // El interruptor llega a su lado y luego cambia la app (sin movimiento, al instante)
        setTimeout(() => setUiMode(session.user.id, next), motion.animate ? 260 : 0);
    };

    const name = session?.name || t('pro.mas.center.noName');
    const email = session?.user.email ?? '';
    const where = sync === 'account' ? t('pro.mas.center.syncAccount') : sync === 'device' ? t('pro.mas.center.syncDevice') : null;
    const version = Constants.expoConfig?.version ?? '1.0.0';
    const dot = permission === 'granted' ? '#5fe39a' : permission === 'denied' ? '#f2b84b' : 'rgba(255,255,255,0.6)';
    const chip = { height: 32, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, borderRadius: radius.pill, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.25)' };

    return (
        <View onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))} style={[{ borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' }, shadow('float')]}>
            <FlowingGradient width={width} animate={motion.animate} />
            <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.22)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
            {sweep && motion.animate && <Sweep width={width} />}
            <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 20, gap: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt eyebrow color={WHITE_85}>
                            {t('pro.mas.center.eyebrow')}
                        </Txt>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Txt size={32} weight="black" tone="white" accessibilityRole="header" style={{ lineHeight: 36, letterSpacing: -0.5 }}>
                                {t('more.title')}
                            </Txt>
                            <View style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }}>
                                <ProBadge />
                            </View>
                        </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                            <LogoMark size={36} />
                        </View>
                        <Txt size={11} weight="semibold" color={WHITE_85} style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) }} accessibilityLabel={t('pro.mas.about.versionAria', { version })}>
                            v {version}
                        </Txt>
                    </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                        {session?.name ? (
                            <Txt size={20} weight="black" tone="white">
                                {session.name.trim().charAt(0).toUpperCase()}
                            </Txt>
                        ) : (
                            <UserIcon size={24} color="#fff" />
                        )}
                        {favorite && (
                            <View style={{ position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: PURPLE, alignItems: 'center', justifyContent: 'center' }}>
                                <TeamLogo team={favorite} size={16} />
                            </View>
                        )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={18} weight="extrabold" tone="white" numberOfLines={1}>
                            {name}
                        </Txt>
                        <Txt size={13} color={WHITE_85} numberOfLines={1}>
                            {[email, where].filter(Boolean).join(' · ')}
                        </Txt>
                    </View>
                </View>

                <View
                    role="radiogroup"
                    accessibilityLabel={t('pro.title')}
                    onLayout={(event) => setSwitchWidth(Math.round(event.nativeEvent.layout.width))}
                    style={{ height: 56, flexDirection: 'row', borderRadius: radius.pill, padding: 4, backgroundColor: 'rgba(0,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                >
                    {switchWidth > 0 && <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: half, borderRadius: radius.pill, backgroundColor: '#fff' }, shadow('float'), knobStyle]} />}
                    {(['lite', 'pro'] as const).map((value) => {
                        const active = mode === value;
                        const color = active ? PURPLE : '#fff';
                        return (
                            <Pressable key={value} onPress={() => choose(value)} role="radio" aria-checked={active} accessibilityLabel={value === 'pro' ? 'PRO' : 'Lite'} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill }}>
                                {value === 'pro' && <Sparkles size={16} color={color} />}
                                <Txt size={16} weight="extrabold" color={color}>
                                    {value === 'pro' ? 'PRO' : 'Lite'}
                                </Txt>
                            </Pressable>
                        );
                    })}
                </View>

                <Txt size={14} color="rgba(255,255,255,0.95)" style={{ lineHeight: 19 }}>
                    {t('pro.hintPro')}
                </Txt>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {PERKS.map(({ key, Icon }) => (
                        <View key={key} style={{ flexBasis: '47%', flexGrow: 1, minWidth: 0, borderRadius: radius.tile, padding: 12, gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                            <Icon size={18} color="#fff" />
                            <Txt size={13} weight="semibold" tone="white" style={{ lineHeight: 17 }}>
                                {t(`pro.perks.${key}`)}
                            </Txt>
                        </View>
                    ))}
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    {Platform.OS !== 'web' && (
                        <View style={chip}>
                            <Check size={16} color="#7ef0ad" />
                            <Txt size={13} weight="bold" tone="white">
                                {t('pro.mas.center.installed')}
                            </Txt>
                        </View>
                    )}
                    <View style={chip}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
                        <Txt size={13} weight="bold" tone="white">
                            {t(`pro.mas.center.permission.${permission}`)}
                        </Txt>
                    </View>
                    <View style={chip} accessible accessibilityLabel={`${alertCount} ${t('pro.mas.center.withAlert', { count: alertCount })}`}>
                        <Txt tone="white" style={{ fontFamily: fonts.condensed, fontSize: 18 }}>
                            <CountUp value={alertCount} format={(n) => String(Math.round(n))} />
                        </Txt>
                        <Txt size={13} weight="bold" tone="white">
                            {t('pro.mas.center.withAlert', { count: alertCount })}
                        </Txt>
                    </View>
                </View>
            </View>
        </View>
    );
};
