import React from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { PlayerDetail, PlayerRow, StatContext } from '../../../lib/stats';
import { useColors } from '../../../theme/theme';
import { alpha, fonts } from '../../../theme/tokens';
import type { LeagueAverages } from '../../../types/pro-liga';
import { Skeleton, Txt } from '../../ui';
import { CountUp, ProNote, ProSection, heatColor, useGrow, useInView, withAlpha } from '../kit';
import { percentileRowsOf, type PercentileRow } from './model';

interface FichaPercentilesProps {
    player: PlayerDetail;
    pool: PlayerRow[];
    ctx: StatContext | null;
    averages: LeagueAverages | null;
    seasonText: string;
    league: string;
    loading: boolean;
    /** La liga se calculó con las líneas de todos los peloteros (el servidor no la mandó) */
    fromPlayers: boolean;
}

// Percentiles contra la liga: cada métrica con su cifra, el promedio de la liga, una barra de frío (azul) a caliente
// (rojo) con su punto, el percentil y su puesto entre los calificados. En «menos es mejor» el percentil va invertido.
export const FichaPercentiles: React.FC<FichaPercentilesProps> = ({ player, pool, ctx, averages, seasonText, league, loading, fromPlayers }) => {
    const { t } = useTranslation();
    const { setNode, onLayout, seen } = useInView();
    if (loading) return <Skeleton height={320} />;
    if (pool.length < 3) return null;
    const { rows, inPool } = percentileRowsOf(player, pool, ctx, averages);
    if (!rows.length) return null;
    const n = pool.length;
    const role = player.role;

    return (
        <ProSection title={t('pro.ficha.percentiles.title')} headerOutside>
            <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <Txt size={13} tone="muted" style={{ flex: 1, lineHeight: 17 }}>
                    {t(role === 'P' ? 'pro.ficha.percentiles.poolP' : 'pro.ficha.percentiles.poolB', { count: n, league, season: seasonText })}
                </Txt>
                <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt size={11} weight="bold" tone="muted">
                        0
                    </Txt>
                    <LinearGradient colors={[heatColor(0, 'heat'), heatColor(0.5, 'heat'), heatColor(1, 'heat')]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ width: 64, height: 6, borderRadius: 3 }} />
                    <Txt size={11} weight="bold" tone="muted">
                        100
                    </Txt>
                </View>
            </View>
            {!inPool && <ProNote tone="warn" style={{ marginBottom: 12 }}>{t('pro.ficha.percentiles.notQualified')}</ProNote>}
            <View ref={setNode} onLayout={onLayout} style={{ gap: 4 }}>
                {rows.map((item, index) => (
                    <PercentileLine key={item.key} item={item} index={index} seen={seen} inPool={inPool} />
                ))}
            </View>
            <Txt size={12} tone="muted" style={{ marginTop: 12, lineHeight: 17 }}>
                {t(role === 'P' ? 'pro.ficha.percentiles.noteP' : 'pro.ficha.percentiles.noteB', { count: n, step: Math.max(1, Math.round(100 / Math.max(1, n - 1))) })}
                {fromPlayers ? ` ${t('pro.ficha.percentiles.fromPlayers')}` : ''}
            </Txt>
        </ProSection>
    );
};

const PercentileLine: React.FC<{ item: PercentileRow; index: number; seen: boolean; inPool: boolean }> = ({ item, index, seen, inPool }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pct = item.standing.pct;
    const color = heatColor(pct / 100, 'heat');
    const rank = inPool ? `${item.standing.tied ? 'T-' : ''}${item.standing.rank}.º/${item.standing.n}` : null;
    const progress = useGrow(pct / 100, seen, index);
    const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
    const dot = useAnimatedStyle(() => ({ left: `${progress.get() * 100}%` }));
    const spoken = t('pro.ficha.percentiles.rowAria', {
        metric: t(`pro.estadisticas.cols.${item.key}.long`),
        value: item.value,
        pct,
        rank: rank ? t('pro.ficha.percentiles.rankAria', { rank: item.standing.rank, count: item.standing.n }) : '',
        league: item.league ?? '—'
    });
    return (
        <View accessible accessibilityLabel={spoken} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt size={12} weight="extrabold" tone="muted" style={{ width: 42 }}>
                {t(`pro.estadisticas.cols.${item.key}.short`)}
            </Txt>
            <View style={{ width: 70 }}>
                <Txt style={{ fontFamily: fonts.condensed, fontSize: 19, lineHeight: 21, color: colors.ink, fontVariant: ['tabular-nums'] }}>{item.value}</Txt>
                {item.league ? (
                    <Txt size={10} tone="muted" numberOfLines={1}>
                        {t('pro.ficha.percentiles.league', { value: item.league })}
                    </Txt>
                ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, height: 14, justifyContent: 'center' }}>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: alpha(colors.line, 0.1), overflow: 'hidden' }}>
                    <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 4, overflow: 'hidden' }, fill]}>
                        <LinearGradient colors={[withAlpha(heatColor(0, 'heat'), 0.2), color]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
                    </Animated.View>
                </View>
                <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: alpha(colors.line, 0.3) }} />
                <Animated.View style={[{ position: 'absolute', top: 0, width: 14, height: 14, marginLeft: -7, borderRadius: 7, backgroundColor: color, borderWidth: 2, borderColor: colors.surface }, dot]} />
            </View>
            <View style={{ width: 52, alignItems: 'flex-end' }}>
                <Txt style={{ fontFamily: fonts.condensed, fontSize: 19, lineHeight: 21, color: colors.ink, fontVariant: ['tabular-nums'] }}>
                    <CountUp value={pct} seen={seen} format={(value) => String(Math.round(value))} />
                </Txt>
                {rank ? (
                    <Txt size={10} tone="muted" numberOfLines={1}>
                        {rank}
                    </Txt>
                ) : null}
            </View>
        </View>
    );
};
