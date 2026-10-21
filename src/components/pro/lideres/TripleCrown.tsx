// Triple corona (igual que la web): quién va primero en AVG, HR y CI (con su lugar en la distribución de los
// calificados) y en G, K y EFE. Siempre de la temporada regular.
import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react-native';
import type { StatsTeam } from '../../../lib/stats';
import type { ProPlayerRow } from '../../../types/pro-liga';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { Chip, CountUp, GradientCard, ModuleHeader, fmtSigned, shortName, useGrow, useInView, useProColors } from '../kit';
import { histogram, joinList, marginOverSecond, tripleCrown, type LeaderBoard, type LeaderContext } from './logic';
import { LeaderPhoto } from './LeaderPhoto';

interface TripleCrownProps {
    /** AVG, HR y CI de la temporada regular */
    hitting: [LeaderBoard, LeaderBoard, LeaderBoard];
    /** G, K y EFE */
    pitching: [LeaderBoard, LeaderBoard, LeaderBoard];
    /** Bateadores calificados (para las barritas de cada tile) */
    qualified: ProPlayerRow[];
    context: LeaderContext;
    teams: Record<string, StatsTeam>;
    /** «Regular 2025-26» */
    aside: string;
    onOpen: (row: ProPlayerRow) => void;
    /** Rótulo corto sin confusiones («Sanó», «B. De La Cruz») */
    label: (row: ProPlayerRow) => string;
}

type T = (key: string, options?: Record<string, unknown>) => string;

/** «Corbett y Guduan», «Corbett, Guduan y 1 más» */
const names = (rows: ProPlayerRow[], label: (row: ProPlayerRow) => string, t: T) => {
    const list = rows.map(label);
    if (list.length <= 2) return joinList(list, t('pro.lideres.crown.and'));
    return t('pro.lideres.crown.more', { names: list.slice(0, 2).join(', '), count: list.length - 2 });
};

// Una barrita del histograma: crece hacia arriba al verse (500 ms, +40 ms por barra)
const SpreadBar: React.FC<{ share: number; color: string; seen: boolean; index: number }> = ({ share, color, seen, index }) => {
    const progress = useGrow(1, seen, index);
    const grow = useAnimatedStyle(() => ({ height: `${share * progress.get() * 100}%` }));
    return (
        <View style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <Animated.View style={[{ borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: color }, grow]} />
        </View>
    );
};

// Barritas de la distribución: en color el tramo donde está el N.º 1
const Spread: React.FC<{ values: number[]; leader: number; color: string; label: string; seen: boolean }> = ({ values, leader, color, label, seen }) => {
    const colors = useColors();
    const { counts, binOf } = histogram(values, 8);
    const top = Math.max(1, ...counts);
    const mine = binOf(leader);
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ marginTop: 8, height: 28, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
            {counts.map((count, index) => (
                <SpreadBar key={index} share={Math.max(count ? 0.12 : 0.04, count / top)} color={index === mine ? color : alpha(colors.line, 0.25)} seen={seen} index={index} />
            ))}
        </View>
    );
};

export const TripleCrown: React.FC<TripleCrownProps> = ({ hitting, pitching, qualified, context, teams, aside, onOpen, label }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const { setNode, onLayout, seen } = useInView();
    const crown = tripleCrown(hitting);
    const teamOf = (row: ProPlayerRow) => (row.teamId !== null ? teams[row.teamId] : undefined);

    const headline = crown.leadsAll.length ? t('pro.lideres.crown.sweep', { name: crown.leadsAll[0].name }) : t('pro.lideres.crown.none');
    // «están Sanó, De Los Santos y B. De La Cruz» (con «y» antes del último, como se dice)
    const inAll = crown.inAll.length ? t('pro.lideres.crown.inAll', { names: joinList(crown.inAll.slice(0, 4).map(label), t('pro.lideres.crown.and')) }) : t('pro.lideres.crown.inAllNone');
    const tile = { flex: 1, flexBasis: 0, minWidth: 0, borderRadius: 16, backgroundColor: colors.raised, padding: 10 } as const;

    return (
        <GradientCard accessibilityLabel={t('pro.lideres.crown.title')}>
            <View ref={setNode} onLayout={onLayout}>
                <ModuleHeader
                    title={
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                            <Crown size={14} color={colors.gold} />
                            <Txt eyebrow accessibilityRole="header" numberOfLines={1}>
                                {t('pro.lideres.crown.title')}
                            </Txt>
                        </View>
                    }
                    aside={aside}
                    style={{ marginBottom: 10 }}
                />
                <Txt size={14} weight="extrabold" style={{ lineHeight: 19, marginBottom: 12 }}>
                    {headline}{' '}
                    <Txt size={14} tone="muted">
                        {inAll}
                    </Txt>
                </Txt>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    {hitting.map((board) => {
                        const first = board.leaders[0];
                        const abbr = t(`pro.lideres.categories.${board.category.id}.abbr`);
                        if (!first) {
                            return (
                                <View key={board.category.id} style={tile}>
                                    <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase' }}>
                                        {abbr}
                                    </Txt>
                                    <Txt size={14} tone="muted">
                                        —
                                    </Txt>
                                </View>
                            );
                        }
                        const team = teamOf(first.row);
                        const firsts = board.leaders.filter((item) => item.rank === 1);
                        const margin = marginOverSecond(board);
                        const values = qualified.map((row) => board.category.value(row, context)).filter((value): value is number => value !== null && Number.isFinite(value));
                        return (
                            <Pressable
                                key={board.category.id}
                                onPress={() => onOpen(first.row)}
                                accessibilityRole="button"
                                accessibilityLabel={t('pro.lideres.crown.tileAria', { stat: abbr, name: firsts.map((item) => item.row.name).join(', '), team: team?.abbrev ?? '', value: first.display })}
                                style={({ pressed }) => [tile, { opacity: pressed ? 0.85 : 1 }]}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                                    <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        {abbr}
                                    </Txt>
                                    <LeaderPhoto personId={first.row.id} name={first.row.name} size={30} color={team?.color ?? '#64748b'} teamId={first.row.teamId} logo={team?.logo} />
                                </View>
                                <Txt condensed size={28} tabular numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 4, lineHeight: 30 }}>
                                    <CountUp value={first.value} format={board.category.format} seen={seen} />
                                </Txt>
                                <Txt size={13} weight="extrabold" numberOfLines={2} style={{ marginTop: 2, lineHeight: 16 }}>
                                    {firsts.length > 1 ? names(firsts.map((item) => item.row), label, t) : label(first.row)}
                                </Txt>
                                <Txt size={11} weight="bold" tone="muted">
                                    {team?.abbrev ?? ''}
                                </Txt>
                                <Spread values={values} leader={first.value} color={team?.color ?? colors.accent} seen={seen} label={t('pro.lideres.crown.spreadAria', { stat: abbr, count: values.length })} />
                                <Txt size={10} weight="bold" color={pro.up} style={{ marginTop: 6, lineHeight: 13 }}>
                                    {margin === null
                                        ? ''
                                        : margin === 0
                                          ? t('pro.lideres.crown.tied')
                                          : t('pro.lideres.crown.overSecond', { value: board.category.kind === 'rate' ? fmtSigned(margin, 3).replace(/^([+−])0\./, '$1.') : fmtSigned(margin) })}
                                </Txt>
                            </Pressable>
                        );
                    })}
                </View>
                <Txt size={11} tone="muted" style={{ marginTop: 8, lineHeight: 15 }}>
                    {t('pro.lideres.crown.bars', { count: qualified.length })}
                </Txt>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    {pitching.map((board) => {
                        const first = board.leaders[0];
                        const abbr = t(`pro.lideres.categories.${board.category.id}.abbr`);
                        if (!first) {
                            return (
                                <View key={board.category.id} style={tile}>
                                    <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase' }}>
                                        {abbr}
                                    </Txt>
                                    <Txt size={14} tone="muted">
                                        —
                                    </Txt>
                                </View>
                            );
                        }
                        const firsts = board.leaders.filter((item) => item.rank === 1);
                        const spoken = joinList(
                            firsts.map((item) => `${item.row.name} (${teamOf(item.row)?.abbrev ?? '—'})`),
                            t('pro.lideres.crown.and')
                        );
                        return (
                            <Pressable
                                key={board.category.id}
                                onPress={() => onOpen(first.row)}
                                accessibilityRole="button"
                                accessibilityLabel={t('pro.lideres.crown.pitchAria', { stat: abbr, value: first.display, names: spoken })}
                                style={({ pressed }) => [tile, { opacity: pressed ? 0.85 : 1 }]}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        {abbr}
                                    </Txt>
                                    {firsts.length > 1 && (
                                        <Chip tone="accent" style={{ height: 20, paddingHorizontal: 6 }}>
                                            T-1
                                        </Chip>
                                    )}
                                </View>
                                <Txt condensed size={26} tabular numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 4, lineHeight: 28 }}>
                                    <CountUp value={first.value} format={board.category.format} seen={seen} />
                                </Txt>
                                <Txt size={12} weight="extrabold" numberOfLines={2} style={{ marginTop: 2, lineHeight: 15 }}>
                                    {firsts.length > 1 ? names(firsts.map((item) => item.row), label, t) : shortName(first.row.name)}
                                </Txt>
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        </GradientCard>
    );
};
