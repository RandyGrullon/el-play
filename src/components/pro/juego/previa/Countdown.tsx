import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, Clock3, MapPin } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import { isNotPlayed, stateName } from '../../../../lib/baseball';
import { formatCountdown, formatShortDate, formatTime } from '../../../../lib/format';
import { usePreferences } from '../../../../state/preferences';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { useAlertToggle } from '../../../feed/alerts';
import { capitalize } from '../../../feed/DayChips';
import { GradientCard, LiveDot, MOTION_EASE, MOTION_MS, Odometer, ProButton, countdownParts, pad2, useMotion, useNow, useProColors } from '../../kit';
import { shortVenue } from './logica';
import { useDivider } from './shared';

// Antesala: cuenta regresiva que corre segundo a segundo (dígitos tipo odómetro), fase o serie, fecha, estadio y
// «Avisarme». Cuando llega la hora y MLB todavía no lo pone en vivo, la cuenta se funde con «A punto de empezar»;
// el paso al marcador en vivo lo hace ProGame cuando el juego cambia de estado.

const Digits: React.FC<{ value: number; label: string }> = ({ value, label }) => {
    const colors = useColors();
    return (
        <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ height: 56, minWidth: 54, paddingHorizontal: 7, borderRadius: radius.tile, backgroundColor: alpha(colors.bg, 0.72), alignItems: 'center', justifyContent: 'center' }}>
                <Odometer value={pad2(value)} size={40} />
            </View>
            <Txt size={10} weight="bold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                {label}
            </Txt>
        </View>
    );
};

const Colon: React.FC = () => (
    <Txt condensed size={32} tone="muted" style={{ lineHeight: 56 }} importantForAccessibility="no" accessibilityElementsHidden>
        :
    </Txt>
);

/** Capa que aparece o se va con un fundido (600 ms); sin movimiento cambia de golpe */
const useFade = (visible: boolean) => {
    const motion = useMotion();
    const shown = useSharedValue(visible ? 1 : 0);
    useEffect(() => {
        if (!motion.animate) {
            shown.set(visible ? 1 : 0);
            return;
        }
        shown.set(withTiming(visible ? 1 : 0, { duration: MOTION_MS.count, easing: MOTION_EASE }));
        return () => cancelAnimation(shown);
    }, [visible, motion.animate, shown]);
    return useAnimatedStyle(() => ({ opacity: shown.get() }));
};

export const Countdown: React.FC<{ game: GameDetail; phase: string | null }> = ({ game, phase }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const divider = useDivider();
    const now = useNow(1000);
    const { subscribedGames } = usePreferences();
    const toggleAlert = useAlertToggle();
    const gamePk = game.gamePk ?? 0;
    const subscribed = subscribedGames.includes(gamePk);
    const notPlayed = isNotPlayed(game.detailedState);
    const start = game.date ? Date.parse(game.date) : NaN;
    const left = Number.isFinite(start) ? start - now : NaN;
    const counting = !notPlayed && Number.isFinite(left) && left > 0;
    const parts = countdownParts(counting ? left : 0);
    const time = game.date ? formatTime(game.date, i18n.language) : null;
    const before = useFade(counting);
    const after = useFade(!counting);
    const hidden = (visible: boolean) => (visible ? {} : ({ importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const));

    return (
        <GradientCard accessibilityLabel={t('pro.previa.countdown.title')} innerStyle={{ paddingTop: 14 }}>
            <View>
                {/* Capa 1: la cuenta regresiva */}
                <Animated.View style={[{ gap: 12 }, before]} pointerEvents={counting ? 'auto' : 'none'} {...hidden(counting)}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8, rowGap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Clock3 size={14} color={colors.muted} />
                            <Txt eyebrow>{t('pro.previa.countdown.startsIn')}</Txt>
                        </View>
                        {phase ? (
                            <View style={{ maxWidth: '100%', height: 24, borderRadius: radius.pill, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: colors.raised }}>
                                <Txt size={11} weight="bold" numberOfLines={1}>
                                    {phase}
                                </Txt>
                            </View>
                        ) : null}
                    </View>
                    <View
                        accessible
                        accessibilityRole="timer"
                        accessibilityLabel={counting ? t('pro.previa.countdown.aria', { time: formatCountdown(left, i18n.language) }) : undefined}
                        style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 6 }}
                    >
                        {parts.days > 0 ? (
                            <>
                                <Digits value={parts.days} label={t('pro.previa.countdown.days')} />
                                <Colon />
                                <Digits value={parts.hours} label={t('pro.previa.countdown.hours')} />
                                <Colon />
                                <Digits value={parts.minutes} label={t('pro.previa.countdown.minutes')} />
                            </>
                        ) : (
                            <>
                                <Digits value={parts.hours} label={t('pro.previa.countdown.hours')} />
                                <Colon />
                                <Digits value={parts.minutes} label={t('pro.previa.countdown.minutes')} />
                                <Colon />
                                <Digits value={parts.seconds} label={t('pro.previa.countdown.seconds')} />
                            </>
                        )}
                    </View>
                </Animated.View>
                {/* Capa 2: llegó la hora (o se pospuso): lo que dice MLB */}
                <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', gap: 8 }, after]} pointerEvents="none" {...hidden(!counting)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {!notPlayed && <LiveDot tone="live" pulse />}
                        <Txt eyebrow color={notPlayed ? pro.warn : pro.live}>
                            {notPlayed ? stateName(game.detailedState, i18n.language) : t('pro.previa.countdown.soon')}
                        </Txt>
                    </View>
                    <Txt size={22} weight="black" style={{ lineHeight: 26, letterSpacing: -0.5 }}>
                        {notPlayed
                            ? game.reason
                                ? t('pro.previa.countdown.notPlayedReason', { reason: game.reason })
                                : t('pro.previa.countdown.notPlayed')
                            : t('pro.previa.countdown.waiting', { state: stateName(game.detailedState, i18n.language) })}
                    </Txt>
                </Animated.View>
            </View>

            <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    {game.date ? (
                        <Txt size={15} weight="extrabold" style={{ letterSpacing: -0.3 }}>
                            {capitalize(formatShortDate(game.date, i18n.language))} · {time}
                        </Txt>
                    ) : null}
                    {game.venue ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
                            <MapPin size={14} color={colors.muted} />
                            <Txt size={12} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                                {shortVenue(game.venue)}
                            </Txt>
                        </View>
                    ) : null}
                </View>
                {!notPlayed && game.date ? (
                    <ProButton
                        variant={subscribed ? 'soft' : 'solid'}
                        label={subscribed ? t('pro.previa.countdown.notified') : t('preview.notifyShort')}
                        accessibilityLabel={subscribed ? t('preview.notifyOff') : t('preview.notifyOn')}
                        icon={(color) => (subscribed ? <BellRing size={16} color={color} /> : <Bell size={16} color={color} />)}
                        onPress={() => toggleAlert({ gamePk, date: game.date!, away: game.away, home: game.home })}
                        style={{ flexShrink: 0 }}
                    />
                ) : null}
            </View>
            {counting && time ? (
                <View style={[{ marginTop: 12, paddingTop: 10 }, divider]}>
                    <Txt size={12} tone="muted" style={{ lineHeight: 16 }}>
                        {t('pro.previa.countdown.note', { time })}
                    </Txt>
                </View>
            ) : null}
        </GradientCard>
    );
};
