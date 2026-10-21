// Chips de días PRO: cada día con su número de juegos y un punto rojo por juego en vivo. El indicador del día
// elegido se desliza al nuevo (no cambia de golpe) y, con un equipo filtrado, se atenúan los días en que no juega.
import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { formatLongDate } from '../../../lib/format';
import { useColors } from '../../../theme/theme';
import { radius, shadow } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { LiveDot, MOTION_EASE, useElementWidth, useMotion } from '../kit';
import { shiftDay, type DayInfo } from './logic';
import { weekdayShort } from './shared';

const CHIP = 80;
const GAP = 8;
const HEIGHT = 52;
const SIDE = 16;

interface DayChipsProProps {
    days: DayInfo[];
    selected: string;
    today: string;
    onSelect: (day: string) => void;
}

export const DayChipsPro: React.FC<DayChipsProProps> = ({ days, selected, today, onSelect }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const motion = useMotion();
    const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
    const { width: viewport, onLayout } = useElementWidth(390);
    const index = Math.max(0, days.findIndex((info) => info.day === selected));
    const yesterday = shiftDay(today, -1);
    const tomorrow = shiftDay(today, 1);
    const offset = useSharedValue(index * (CHIP + GAP));

    // El indicador se desliza al día elegido (350 ms); sin movimiento salta
    useEffect(() => {
        const target = index * (CHIP + GAP);
        if (motion.animate) offset.set(withTiming(target, { duration: 350, easing: MOTION_EASE }));
        else offset.set(target);
        return () => cancelAnimation(offset);
    }, [index, motion.animate, offset]);
    const slide = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

    // El día elegido queda en el centro de la franja
    useEffect(() => {
        const left = SIDE + index * (CHIP + GAP) - (viewport - CHIP) / 2;
        scroller.current?.scrollTo({ x: Math.max(0, left), animated: motion.animate });
    }, [index, days.length, viewport, motion.animate]);

    const label = (day: string) => (day === today ? t('games.today') : day === yesterday ? t('games.yesterday') : day === tomorrow ? t('games.tomorrow') : weekdayShort(day, i18n.language));

    if (!days.length) return null;
    const width = days.length * CHIP + (days.length - 1) * GAP;

    return (
        <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            onLayout={onLayout}
            accessibilityLabel={t('pro.portada.days.label')}
            style={{ flexGrow: 0, marginHorizontal: -SIDE }}
            contentContainerStyle={{ paddingHorizontal: SIDE, paddingVertical: 4 }}
        >
            <View style={{ width, height: HEIGHT }}>
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, flexDirection: 'row', gap: GAP }}>
                    {days.map((info) => (
                        <View key={info.day} style={[{ width: CHIP, height: HEIGHT, borderRadius: radius.pill, backgroundColor: colors.surface }, shadow('card')]} />
                    ))}
                </View>
                <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: CHIP, height: HEIGHT, borderRadius: radius.pill, backgroundColor: colors.ink }, slide]} />
                <View style={{ position: 'absolute', left: 0, top: 0, flexDirection: 'row', gap: GAP }}>
                    {days.map((info) => {
                        const active = info.day === selected;
                        const count = info.total ? t('pro.portada.days.games', { count: info.total }) : t('pro.portada.days.none');
                        const ink = active ? colors.bg : colors.ink;
                        return (
                            <Pressable
                                key={info.day}
                                onPress={() => onSelect(info.day)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={[formatLongDate(info.day, i18n.language), count, info.live ? t('pro.portada.days.live', { count: info.live }) : null].filter(Boolean).join(', ')}
                                style={{ width: CHIP, height: HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: radius.pill, opacity: !info.withTeam && !active ? 0.35 : 1 }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Txt size={14} weight="extrabold" color={ink} numberOfLines={1}>
                                        {label(info.day)}
                                    </Txt>
                                    {Array.from({ length: Math.min(3, info.live) }, (_, dot) => (
                                        <LiveDot key={dot} size={6} />
                                    ))}
                                </View>
                                <Txt size={11} weight="semibold" color={ink} numberOfLines={1} style={{ opacity: 0.75 }}>
                                    {count}
                                </Txt>
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        </ScrollView>
    );
};
