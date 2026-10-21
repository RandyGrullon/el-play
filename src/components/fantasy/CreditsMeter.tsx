// Barra de créditos del equipo (igual que CreditsMeter de la web): cuánto lleva gastado, cuánto le queda o por cuánto se pasó
import React, { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RULES, creditsLeft, entryCost, type DayEntry, type FantasyDay } from '../../lib/fantasy';
import { useColors } from '../../theme/theme';
import { radius } from '../../theme/tokens';
import { Card, Row, Txt, useReduceMotion } from '../ui';
import { formatCredits } from './shared';

export const CreditsMeter: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const reduce = useReduceMotion();
    const budget = day.credits?.budget ?? 0;
    const spent = entryCost(day, entry);
    const share = budget > 0 ? Math.min(1, spent / budget) : 0;
    // La barra se llena con una transición corta (como la web); con «Reducir movimiento» salta de una vez
    const [fill] = useState(() => new Animated.Value(share));
    useEffect(() => {
        if (reduce) {
            fill.setValue(share);
            return;
        }
        const animation = Animated.timing(fill, { toValue: share, duration: 500, useNativeDriver: false });
        animation.start();
        return () => animation.stop();
    }, [fill, share, reduce]);

    if (!day.credits) return null;
    const lang = i18n.language;
    const left = creditsLeft(day, entry) ?? 0;
    const over = left < -1e-9;
    // Le faltan peloteros y lo que queda no alcanza ni para los más baratos: tiene que cambiar a alguien caro
    const missing = Math.max(0, RULES.batters + RULES.pitchers - entry.lineup.length);
    const short = !over && missing > 0 && left + 1e-9 < missing * day.credits.min;
    const spentText = t('fantasy.credits.spent', { spent: formatCredits(spent, lang), budget: formatCredits(budget, lang) });
    const message = over
        ? t('fantasy.credits.over', { over: formatCredits(-left, lang) })
        : short
          ? t('fantasy.credits.short', { left: formatCredits(left, lang), count: missing, min: formatCredits(day.credits.min, lang) })
          : t('fantasy.credits.left', { left: formatCredits(left, lang) });

    return (
        <Card style={{ padding: 14, gap: 8 }}>
            <Row justify="space-between" align="baseline" gap={12}>
                <Txt eyebrow>{t('fantasy.credits.label')}</Txt>
                <Txt size={14} weight="bold" tabular>
                    {spentText}
                </Txt>
            </Row>
            {/* accessibilityValue pide enteros: el número exacto va en el texto del valor */}
            <View
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={t('fantasy.credits.label')}
                aria-valuemin={0}
                aria-valuemax={budget}
                aria-valuenow={Math.min(budget, Math.round(spent))}
                aria-valuetext={spentText}
                style={{ height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.raised }}
            >
                <Animated.View
                    style={{
                        height: '100%',
                        borderRadius: radius.pill,
                        backgroundColor: over ? colors.live : colors.accent,
                        width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                    }}
                />
            </View>
            <Txt size={12} weight="semibold" tone={over || short ? 'live' : 'muted'}>
                {message}
            </Txt>
        </Card>
    );
};
