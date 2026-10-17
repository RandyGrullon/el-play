// Resumen del día con el degradado de la marca: puntos, pronósticos, temporada y los últimos días en barras
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react-native';
import { radius, shadow } from '../../theme/tokens';
import { Gradient, Row, Txt } from '../ui';

const round = (value: number) => Math.round(value * 10) / 10;

export const SummaryCard: React.FC<{ points: number; picks: number; season: number; past: { date: string; points: number }[] }> = ({ points, picks, season, past }) => {
    const { t } = useTranslation();
    return (
        <View style={[{ borderRadius: radius.card }, shadow('float')]}>
            <Gradient style={{ borderRadius: radius.card, padding: 20, overflow: 'hidden' }}>
                <View pointerEvents="none" style={{ position: 'absolute', right: -12, top: -12, opacity: 0.15 }}>
                    <Sparkles size={96} color="#fff" />
                </View>
                <Txt eyebrow color="rgba(255,255,255,0.85)">
                    {t('fantasy.yourPoints')}
                </Txt>
                <Txt size={64} weight="extrabold" tone="white" tabular style={{ lineHeight: 70, marginTop: 4 }} accessibilityRole="text">
                    {round(points + picks)}
                </Txt>
                <Row wrap gap={4} style={{ columnGap: 20, marginTop: 8 }}>
                    <Txt size={14} weight="semibold" tone="white">
                        {t('fantasy.teamPts', { pts: points })}
                    </Txt>
                    <Txt size={14} weight="semibold" tone="white">
                        {t('fantasy.picksPts', { pts: picks })}
                    </Txt>
                    <Txt size={14} weight="semibold" tone="white">
                        {t('fantasy.seasonPts', { pts: round(season), days: past.length })}
                    </Txt>
                </Row>
                {past.length > 0 && <HistoryBars days={past.slice(0, 7).reverse()} />}
            </Gradient>
        </View>
    );
};

const HistoryBars: React.FC<{ days: { date: string; points: number }[] }> = ({ days }) => {
    const max = Math.max(...days.map((d) => d.points), 1);
    return (
        <View aria-hidden style={{ marginTop: 16, height: 48, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            {days.map((d) => (
                <View key={d.date} style={{ flex: 1, height: `${Math.max(8, (Math.max(0, d.points) / max) * 100)}%`, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: 'rgba(255,255,255,0.7)' }} />
            ))}
        </View>
    );
};
