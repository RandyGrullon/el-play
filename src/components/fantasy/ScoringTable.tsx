// Cuántos puntos da cada jugada (viene del servidor con el día) y, los días con créditos, cuánto cuesta cada pelotero
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SCORING_ORDER, creditsOf, rulesOf, type FantasyDay } from '../../lib/fantasy';
import { useColors } from '../../theme/theme';
import { Card, Row, Txt } from '../ui';

export const ScoringTable: React.FC<{ day: FantasyDay }> = ({ day }) => {
    const { t } = useTranslation();
    const colors = useColors();
    // Todo de las reglas del día (rules), con el orden de la ayuda
    const rules = rulesOf(day);
    const credits = creditsOf(day);
    const rows = (group: 'batter' | 'pitcher') =>
        SCORING_ORDER[group]
            .filter((key) => typeof rules.scoring[group][key] === 'number')
            .map((key) => [key, rules.scoring[group][key]] as const)
            .map(([key, value], index) => (
            <Row key={`${group}-${key}`} justify="space-between" gap={12} style={{ paddingVertical: 6, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                <Txt size={14} style={{ flex: 1 }}>
                    {t(`fantasy.scoring.${group}.${key}`)}
                </Txt>
                <Txt size={14} weight="bold" tabular color={value < 0 ? colors.live : undefined}>
                    {value > 0 ? `+${value}` : value}
                </Txt>
            </Row>
        ));
    return (
        <Card style={{ gap: 16 }}>
            <View>
                <Txt eyebrow style={{ marginBottom: 4 }}>
                    {t('fantasy.batters')}
                </Txt>
                {rows('batter')}
            </View>
            <View>
                <Txt eyebrow style={{ marginBottom: 4 }}>
                    {t('fantasy.pitchers')}
                </Txt>
                {rows('pitcher')}
                <Txt size={12} tone="muted" style={{ marginTop: 12 }}>
                    {t('fantasy.captainRule', { x: rules.captain })}
                </Txt>
                <Txt size={12} tone="muted" style={{ marginTop: 4 }}>
                    {t('fantasy.pickRule', { pts: rules.picks.points })}
                </Txt>
                {credits && (
                    <Txt size={12} tone="muted" style={{ marginTop: 4 }}>
                        {t('fantasy.credits.rule', { budget: credits.budget, min: credits.min, max: credits.max })}
                    </Txt>
                )}
            </View>
            <View style={{ gap: 4 }}>
                <Txt eyebrow style={{ marginBottom: 2 }}>
                    {t('fantasy.smart.howTitle')}
                </Txt>
                {(['howProj', 'howValue', 'howOwned', 'howBest'] as const).map((key) => (
                    <Txt key={key} size={12} tone="muted">
                        {t(`fantasy.smart.${key}`)}
                    </Txt>
                ))}
            </View>
        </Card>
    );
};
