import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { useColors } from '../../theme/theme';
import { Card, Txt } from '../ui';

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => {
    const colors = useColors();
    return (
        <View style={{ flexGrow: 1, flexBasis: 'auto', backgroundColor: colors.raised, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 6, alignItems: 'center' }}>
            <Txt size={10} weight="semibold" tone="faint" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {label}
            </Txt>
            <Txt size={18} weight="bold" tabular>
                {value ?? '—'}
            </Txt>
        </View>
    );
};

// Lanzador contra bateador con su línea del día
export const Matchup: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const matchup = game.matchup;
    if (!matchup) return null;
    const { pitcher, batter } = matchup;
    const hand = (code: string | null, kind: 'throws' | 'bats') => (code ? t(`game.${kind}${code}`, { defaultValue: code }) : '');

    return (
        <Card padded={false} style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, padding: 16, borderRightWidth: 1, borderRightColor: colors.line }} accessibilityLabel={t('game.pitcher')}>
                <Txt eyebrow>{t('game.pitcher')}</Txt>
                <Txt weight="semibold" numberOfLines={1} style={{ marginTop: 4 }}>
                    {pitcher.name}
                </Txt>
                <Txt size={12} tone="muted">
                    {hand(pitcher.hand, 'throws')}
                </Txt>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                    <Stat label={t('game.pitchCount')} value={pitcher.pitches} />
                    <Stat label={t('stats.ip')} value={pitcher.ip} />
                    <Stat label={t('stats.k')} value={pitcher.k} />
                </View>
                {pitcher.era ? (
                    <Txt size={11} tone="faint" style={{ marginTop: 8 }}>
                        {t('game.seasonEra', { era: pitcher.era })}
                    </Txt>
                ) : null}
            </View>
            <View style={{ flex: 1, padding: 16 }} accessibilityLabel={t('game.batter')}>
                <Txt eyebrow>{t('game.batter')}</Txt>
                <Txt weight="semibold" numberOfLines={1} style={{ marginTop: 4 }}>
                    {batter.name}
                </Txt>
                <Txt size={12} tone="muted">
                    {hand(batter.side, 'bats')}
                </Txt>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                    <Stat label={t('game.today')} value={batter.ab !== null ? `${batter.h ?? 0}-${batter.ab}` : null} />
                    <Stat label={t('stats.avg')} value={batter.avg} />
                </View>
                {matchup.onDeck ? (
                    <Txt size={11} tone="faint" numberOfLines={1} style={{ marginTop: 8 }}>
                        {t('game.onDeck', { name: matchup.onDeck.name })}
                    </Txt>
                ) : null}
            </View>
        </Card>
    );
};
