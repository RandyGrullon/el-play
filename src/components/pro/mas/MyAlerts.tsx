import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import Animated, { FadeOut, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BellRing, Send, Settings, ShieldAlert, Smartphone, Star } from 'lucide-react-native';
import type { ScheduleGame } from '../../../types';
import { dayKey, formatDayNumber, formatTime, formatWeekday, todayKey } from '../../../lib/format';
import { followSupported } from '../../../lib/follow';
import { showToast } from '../../../lib/toast';
import { usePreferences } from '../../../state/preferences';
import { useColors } from '../../../theme/theme';
import { alpha, fonts, radius, shadow } from '../../../theme/tokens';
import { Skeleton, TeamLogo, Txt } from '../../ui';
import { useAlertToggle } from '../../feed/alerts';
import { Enter, MOTION_EASE, ModuleHeader, ProNote, useMotion, useProColors, useReorder } from '../kit';
import { alertGamesOf } from './logic';
import { LogoMark } from './LogoMark';
import { askPermission, recheckPermission, sendTestAlert, useNotificationPermission } from './notifications';
import { setFollowMode, useFollowMode, type FollowMode } from './prefs';

// Mis avisos: el permiso de avisos del teléfono (con «Probar aviso» y «Revisar permiso»), cómo llega el aviso y los
// juegos con y sin campana (10 minutos antes y al empezar, programados en el teléfono). Al quitar un aviso la fila se
// va con un fundido y las demás suben (altura animada); las filas entran escalonadas. En la app del teléfono, además,
// cómo seguir el juego en la pantalla de bloqueo.

const SPRING = 380;

/** Interruptor grande (60 × 44) con resorte */
const Switch: React.FC<{ on: boolean; label: string; onToggle: () => void }> = ({ on, label, onToggle }) => {
    const colors = useColors();
    const motion = useMotion();
    const knob = useSharedValue(on ? 1 : 0);
    useEffect(() => {
        knob.set(motion.animate ? withTiming(on ? 1 : 0, { duration: SPRING, easing: MOTION_EASE }) : on ? 1 : 0);
        return () => cancelAnimation(knob);
    }, [on, motion.animate, knob]);
    const style = useAnimatedStyle(() => ({ transform: [{ translateX: knob.get() * 22 }] }));
    return (
        <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} style={{ width: 60, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: on ? '#16a34a' : alpha(colors.line, 0.25), borderWidth: 1, borderColor: on ? '#16a34a' : alpha(colors.line, 0.15) }}>
                <Animated.View style={[{ position: 'absolute', left: 2, top: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }, shadow('card'), style]} />
            </View>
        </Pressable>
    );
};

export const MyAlerts: React.FC<{ games: ScheduleGame[] | undefined; loading: boolean }> = ({ games, loading }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const motion = useMotion();
    const reorder = useReorder();
    const permission = useNotificationPermission();
    const followMode = useFollowMode();
    const { subscribedGames, favoriteTeamId } = usePreferences();
    const toggleAlert = useAlertToggle();
    const [checked, setChecked] = useState<'idle' | 'checking' | 'done'>('idle');
    const [tested, setTested] = useState(false);
    const { on, off } = alertGamesOf(games ?? [], subscribedGames);
    const sample = on[0] ?? off[0] ?? null;
    const favoriteName = [...(games ?? [])].flatMap((game) => [game.away, game.home]).find((team) => team.id === favoriteTeamId)?.name ?? null;

    const tone =
        permission === 'granted'
            ? { box: alpha(pro.up, 0.08), ring: alpha(pro.up, 0.35), title: pro.up }
            : permission === 'denied'
              ? { box: alpha(pro.warn, 0.1), ring: alpha(pro.warn, 0.4), title: pro.warn }
              : { box: colors.raised, ring: alpha(colors.line, 0.1), title: colors.ink };

    const test = async () => {
        const state = permission === 'default' ? await askPermission() : permission;
        if (state !== 'granted') return;
        const body = sample ? t('notifications.gameStartingBody', { away: sample.away.name, home: sample.home.name }) : t('pro.mas.alerts.testBody');
        const shown = await sendTestAlert(body);
        setTested(true);
        showToast(shown ? t('pro.mas.alerts.testSent') : t('pro.mas.alerts.testFailed'), undefined, 4000);
    };

    const recheck = async () => {
        setChecked('checking');
        await recheckPermission();
        setTimeout(() => setChecked('done'), motion.animate ? 400 : 0);
    };

    const dayLabel = (game: ScheduleGame) => {
        const key = dayKey(game.date);
        return key === todayKey() ? t('pro.mas.alerts.today') : `${formatWeekday(key, lang)} ${formatDayNumber(key)}`;
    };
    const timeParts = (game: ScheduleGame) => {
        const text = formatTime(game.date, lang);
        const match = /^(\d{1,2}:\d{2})\s*(.*)$/.exec(text);
        return match ? { time: match[1], suffix: match[2] } : { time: text, suffix: '' };
    };

    const row = (game: ScheduleGame, subscribed: boolean, index: number) => {
        const mine = favoriteTeamId !== null && (game.away.id === favoriteTeamId || game.home.id === favoriteTeamId);
        const { time, suffix } = timeParts(game);
        const today = dayKey(game.date) === todayKey();
        const label = t(subscribed ? 'pro.mas.alerts.rowOn' : 'pro.mas.alerts.rowOff', { away: game.away.name, home: game.home.name, day: dayLabel(game), time: formatTime(game.date, lang) });
        return (
            <Animated.View key={game.gamePk} layout={reorder} exiting={motion.animate ? FadeOut.duration(260) : undefined}>
                <Enter index={index} step={35} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: alpha(colors.line, 0.1) }}>
                    <View style={{ width: 70 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                            <Txt style={{ fontFamily: fonts.condensed, fontSize: 24, lineHeight: 26, fontVariant: ['tabular-nums'] }}>{time}</Txt>
                            {suffix ? (
                                <Txt size={10} weight="bold" tone="muted">
                                    {suffix}
                                </Txt>
                            ) : null}
                        </View>
                        <Txt size={11} weight="extrabold" color={today ? colors.accentInk : colors.muted} numberOfLines={1} style={{ textTransform: 'uppercase' }}>
                            {dayLabel(game)}
                        </Txt>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <TeamLogo team={game.away} size={22} />
                            <Txt weight="extrabold">{game.away.abbrev}</Txt>
                            <Txt size={12} weight="semibold" tone="muted">
                                {t('pro.mas.alerts.at')}
                            </Txt>
                            <TeamLogo team={game.home} size={22} />
                            <Txt weight="extrabold">{game.home.abbrev}</Txt>
                            {mine && <Star size={14} color={pro.warn} fill={pro.warn} />}
                        </View>
                        <Txt size={12} tone="muted" numberOfLines={1}>
                            {game.venue}
                        </Txt>
                    </View>
                    <Switch on={subscribed} label={label} onToggle={() => void toggleAlert(game)} />
                </Enter>
            </Animated.View>
        );
    };

    const followOptions: FollowMode[] = ['auto', 'ask', 'never'];
    const subhead = (left: string, right: string) => (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <Txt eyebrow>{left}</Txt>
            <Txt size={12} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {right}
            </Txt>
        </View>
    );

    return (
        <View>
            <ModuleHeader title={t('pro.mas.alerts.title')} aside={t('pro.mas.alerts.limit')} style={{ marginBottom: 12 }} />
            <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, padding: 16, gap: 16, borderWidth: 1, borderColor: alpha(colors.line, 0.06) }, shadow('card')]}>
                <View style={{ borderRadius: radius.tile, padding: 14, backgroundColor: tone.box, borderWidth: 1, borderColor: tone.ring, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: permission === 'granted' ? pro.up : permission === 'denied' ? pro.warn : colors.muted }} />
                        <Txt size={16} weight="extrabold" color={tone.title} accessibilityRole="header">
                            {t(`pro.mas.alerts.state.${permission}.title`)}
                        </Txt>
                    </View>
                    <Txt size={13} style={{ lineHeight: 18 }}>
                        {t(`pro.mas.alerts.state.${permission}.text`)}
                    </Txt>
                    {permission !== 'unsupported' && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                            {permission === 'denied' ? (
                                <Pressable
                                    onPress={() => void Linking.openSettings().catch(() => undefined)}
                                    accessibilityRole="button"
                                    style={({ pressed }) => ({ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 16, backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 })}
                                >
                                    <Settings size={16} color="#fff" />
                                    <Txt size={14} weight="bold" tone="white">
                                        {t('pro.mas.alerts.howToEnable')}
                                    </Txt>
                                </Pressable>
                            ) : (
                                <Pressable
                                    onPress={() => void test()}
                                    accessibilityRole="button"
                                    style={({ pressed }) => ({ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 16, backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 })}
                                >
                                    <Send size={16} color="#fff" />
                                    <Txt size={14} weight="bold" tone="white">
                                        {permission === 'default' ? t('pro.mas.alerts.allow') : t('pro.mas.alerts.test')}
                                    </Txt>
                                </Pressable>
                            )}
                            <Pressable
                                onPress={() => void recheck()}
                                accessibilityRole="button"
                                style={({ pressed }) => ({ height: 44, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 16, borderWidth: 1, borderColor: alpha(colors.line, 0.25), backgroundColor: pressed ? colors.raised : 'transparent' })}
                            >
                                <Txt size={14} weight="bold">
                                    {checked === 'checking' ? t('pro.mas.alerts.checking') : t('pro.mas.alerts.check')}
                                </Txt>
                            </Pressable>
                        </View>
                    )}
                    {permission !== 'unsupported' && (
                        <Txt size={12} tone="muted" accessibilityLiveRegion="polite">
                            {checked === 'done' ? t(`pro.mas.alerts.checked.${permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'other'}`) : t('pro.mas.alerts.checkHint')}
                        </Txt>
                    )}
                    {permission === 'denied' && (
                        <ProNote tone="warn" icon={<ShieldAlert size={18} color={pro.warn} />}>
                            {t(Platform.OS === 'ios' ? 'pro.mas.alerts.howToUnblockIos' : 'pro.mas.alerts.howToUnblockAndroid')}
                        </ProNote>
                    )}
                </View>

                <View>
                    <Txt eyebrow style={{ marginBottom: 8 }}>
                        {t('pro.mas.alerts.preview')}
                    </Txt>
                    <View style={{ flexDirection: 'row', gap: 12, borderRadius: radius.tile, padding: 12, backgroundColor: colors.raised }}>
                        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                            <LogoMark size={28} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                                <Txt size={11} weight="bold" tone="muted" style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>
                                    El Play
                                </Txt>
                                <Txt size={11} weight="bold" tone="muted">
                                    {tested ? t('pro.mas.alerts.now') : t('pro.mas.alerts.before')}
                                </Txt>
                            </View>
                            <Txt weight="extrabold">{t('notifications.gameStarting')}</Txt>
                            <Txt size={13} style={{ lineHeight: 18 }}>
                                {sample ? t('notifications.gameStartingBody', { away: sample.away.name, home: sample.home.name }) : t('pro.mas.alerts.testBody')}
                            </Txt>
                        </View>
                    </View>
                </View>

                {loading && !games ? (
                    <Skeleton height={180} round={16} />
                ) : (
                    <>
                        <View>
                            {subhead(t('pro.mas.alerts.on'), t('pro.mas.alerts.count', { count: on.length }))}
                            {on.length ? (
                                on.map((game, index) => row(game, true, index))
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
                                    <BellRing size={16} color={colors.muted} />
                                    <Txt size={13} tone="muted" style={{ flex: 1 }}>
                                        {t('pro.mas.alerts.noneOn')}
                                    </Txt>
                                </View>
                            )}
                        </View>
                        {off.length > 0 && (
                            <View>
                                {subhead(t('pro.mas.alerts.off'), t('pro.mas.alerts.tapToAdd'))}
                                {off.map((game, index) => row(game, false, index + on.length))}
                            </View>
                        )}
                        {!on.length && !off.length && (
                            <Txt size={13} tone="muted">
                                {t('pro.mas.alerts.noGames')}
                            </Txt>
                        )}
                    </>
                )}

                {followSupported && (
                    <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), paddingTop: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <Txt weight="extrabold" style={{ flex: 1 }}>
                                {t('pro.mas.alerts.follow.title')}
                            </Txt>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.raised }}>
                                <Smartphone size={12} color={colors.muted} />
                                <Txt size={11} weight="bold" tone="muted">
                                    {t('pro.mas.alerts.follow.app')}
                                </Txt>
                            </View>
                        </View>
                        <Txt size={13} tone="muted" style={{ lineHeight: 18 }}>
                            {t('pro.mas.alerts.follow.hint')}
                        </Txt>
                        <View role="radiogroup" accessibilityLabel={t('pro.mas.alerts.follow.title')} style={{ gap: 8 }}>
                            {followOptions.map((option) => {
                                const active = followMode === option;
                                return (
                                    <Pressable
                                        key={option}
                                        onPress={() => setFollowMode(option)}
                                        role="radio"
                                        aria-checked={active}
                                        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: active ? alpha(colors.accent, 0.12) : colors.raised, borderWidth: 1, borderColor: active ? alpha(colors.accent, 0.5) : 'transparent' }}
                                    >
                                        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? colors.accentInk : colors.muted, alignItems: 'center', justifyContent: 'center' }}>
                                            {active && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentInk }} />}
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Txt weight="extrabold">{t(`pro.mas.alerts.follow.${option}`)}</Txt>
                                            <Txt size={12} tone="muted">
                                                {option === 'auto' && favoriteName ? t('pro.mas.alerts.follow.autoTeam', { team: favoriteName }) : t(`pro.mas.alerts.follow.${option}Hint`)}
                                            </Txt>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                )}
            </View>
        </View>
    );
};
