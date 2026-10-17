import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDayNumber, formatLongDate, formatWeekday } from '../../lib/format';
import { useColors } from '../../theme/theme';
import { radius, shadow } from '../../theme/tokens';
import { Txt } from '../ui';
import { PulseDot } from './PulseDot';

const DAY = 86400000;

/** La primera letra en mayúscula (capitalize de la web) */
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Esperando la red sin datos: en vez de cargar para siempre se dice que no hay internet */
export const waitingForNetwork = (query: { isPending: boolean; fetchStatus: string }) => query.isPending && query.fetchStatus === 'paused';

// Días de la temporada: Hoy/Ayer/Mañana y el resto con su fecha; el punto rojo dice que ese día hay juegos en vivo
export const DayChips: React.FC<{ days: string[]; selected: string; today: string; counts: Record<string, { total: number; live: number }>; onSelect: (day: string) => void }> = ({ days, selected, today, counts, onSelect }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const window = useWindowDimensions();
    const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
    const layout = useRef<Record<string, { x: number; width: number }>>({});
    const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - DAY).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + DAY).toISOString().slice(0, 10);

    // El día elegido queda en el centro
    const center = (animated: boolean) => {
        const item = layout.current[selected];
        if (item) scroller.current?.scrollTo({ x: Math.max(0, item.x - (window.width - item.width) / 2), animated });
    };
    useEffect(() => center(true), [selected, days.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const label = (day: string) => (day === today ? t('games.today') : day === yesterday ? t('games.yesterday') : day === tomorrow ? t('games.tomorrow') : `${capitalize(formatWeekday(day, i18n.language))} ${formatDayNumber(day)}`);

    return (
        <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 4 }} accessibilityRole="tablist" accessibilityLabel={t('games.selectDate')}>
            {days.map((day) => {
                const active = day === selected;
                const info = counts[day];
                return (
                    <Pressable
                        key={day}
                        onLayout={(event) => {
                            layout.current[day] = { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width };
                            if (day === selected) center(false);
                        }}
                        onPress={() => onSelect(day)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={formatLongDate(day, i18n.language)}
                        style={[
                            { height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 16, backgroundColor: active ? colors.ink : colors.surface, opacity: !info && !active ? 0.5 : 1 },
                            !active && shadow('card')
                        ]}
                    >
                        <Txt size={14} weight="bold" color={active ? colors.bg : colors.ink}>
                            {label(day)}
                        </Txt>
                        {info?.live ? <PulseDot color={colors.live} size={8} /> : null}
                    </Pressable>
                );
            })}
        </ScrollView>
    );
};
