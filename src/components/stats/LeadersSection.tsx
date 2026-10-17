// Líderes (igual que LeadersPage de la web): un carrusel por categoría de bateo y pitcheo;
// la primera tarjeta va en el color del equipo del líder, con su foto grande. Tocar foto o nombre abre la ficha.
import React, { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react-native';
import type { Leader, Leaders } from '../../types';
import { useLeaders } from '../../lib/queries';
import { seasonLabel } from '../../lib/format';
import { useIsPro } from '../../lib/pro';
import { useLeague } from '../../state/league';
import { useColors } from '../../theme/theme';
import { alpha, inkOn, radius, shadow } from '../../theme/tokens';
import { Screen } from '../layout';
import { Card, ErrorState, OfflineState, Pill, PlayerPhoto, Row, Skeleton, Txt, useErrorText } from '../ui';
import { ChipRow, Notice, SectionHeader, openPlayer, shareText, waitingForNetwork } from './common';

const GAP = 12;

const detailOf = (leader: Leader, t: (key: string, options?: Record<string, unknown>) => string) => {
    const extra = leader.extra || {};
    if (extra.h !== null && extra.h !== undefined && extra.ab) return t('share.hitsInAtBats', { h: extra.h, ab: extra.ab });
    if (extra.ip) return t('share.innings', { ip: extra.ip, k: extra.k ?? 0 });
    return '';
};

/** Ancho de las tarjetas como en la web: la primera 78 % (máx. 300), las demás 62 % (máx. 240) */
const useCardWidths = () => {
    const { width } = useWindowDimensions();
    const inner = Math.min(width, 640) - 32;
    return { first: Math.min(300, Math.round(inner * 0.78)), rest: Math.min(240, Math.round(inner * 0.62)) };
};

const LeaderCard: React.FC<{ leader: Leader; first: boolean; width: number; categoryId: string; season: string; seasonYear?: number }> = ({ leader, first, width, categoryId, season, seasonYear }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { activeLeague } = useLeague();
    const color = leader.color || '#2563eb';
    const ink = first ? inkOn(color) : colors.ink;
    const soft = first ? ink : colors.muted;
    const open = () => openPlayer({ id: leader.id, name: leader.name, teamId: leader.teamId }, seasonYear);
    const share = () =>
        shareText(`${leader.name} · ${t(`leaders.${categoryId}`)} ${leader.value ?? '—'} · ${t('share.rankIn', { rank: leader.rank, league: t(`leagues.${activeLeague}.name`), season })} · El Play`);

    return (
        <View style={[{ width, borderRadius: 28, padding: 20, overflow: 'hidden', backgroundColor: first ? color : colors.surface }, shadow(first ? 'float' : 'card')]}>
            <Row justify="space-between">
                <Txt size={13} weight="bold" color={soft} style={first && { opacity: 0.85 }}>
                    {t('leaders.rank', { rank: leader.rank })}
                </Txt>
                <Txt size={13} weight="bold" color={soft} style={first && { opacity: 0.85 }}>
                    {leader.teamAbbrev}
                </Txt>
            </Row>
            <Row align="flex-end" justify="space-between" gap={8} style={{ marginTop: 12 }}>
                <Txt size={first ? 64 : 48} weight="extrabold" color={ink} tabular numberOfLines={1} adjustsFontSizeToFit style={{ lineHeight: first ? 66 : 50, letterSpacing: -1, flexShrink: 1 }}>
                    {leader.value ?? '—'}
                </Txt>
                <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={t('statsPage.viewPlayer', { name: leader.name })} style={{ borderRadius: 999 }}>
                    <PlayerPhoto personId={leader.id} name={leader.name} size={first ? 96 : 72} background={first ? 'rgba(255,255,255,0.25)' : alpha(color, 0.15)} team={{ id: leader.teamId, logo: leader.logo, color: leader.color }} />
                </Pressable>
            </Row>
            <Pressable onPress={open} accessibilityRole="button" style={{ marginTop: 12 }}>
                <Txt size={first ? 24 : 18} weight="extrabold" color={ink} numberOfLines={1}>
                    {leader.name}
                </Txt>
            </Pressable>
            <Txt size={14} weight="semibold" color={soft} numberOfLines={1} style={first && { opacity: 0.8 }}>
                {detailOf(leader, t) || leader.teamName}
            </Txt>
            <Pressable
                onPress={share}
                accessibilityRole="button"
                accessibilityLabel={t('share.sharePlayer', { name: leader.name })}
                style={({ pressed }) => ({ marginTop: 16, height: 40, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: first ? 'rgba(255,255,255,0.9)' : colors.raised, opacity: pressed ? 0.8 : 1 })}
            >
                <Share2 size={16} color={first ? '#14151a' : colors.ink} />
                <Txt size={14} weight="bold" color={first ? '#14151a' : colors.ink}>
                    {t('share.short')}
                </Txt>
            </Pressable>
        </View>
    );
};

// Carrusel de una categoría
const CategoryCarousel: React.FC<{ data: Leaders; group: 'hitting' | 'pitching'; season: string }> = ({ data, group, season }) => {
    const { t } = useTranslation();
    const widths = useCardWidths();
    const categories = data.categories.filter((category) => category.group === group);
    const [selected, setSelected] = useState(categories[0]?.id);
    const category = categories.find((item) => item.id === selected) ?? categories[0];
    if (!category) return null;
    // Imán: cada tarjeta queda pegada al borde izquierdo
    const offsets = category.leaders.map((_, index) => (index === 0 ? 0 : widths.first + GAP + (index - 1) * (widths.rest + GAP)));

    return (
        <View style={{ gap: 12 }} accessibilityLabel={t(`leaders.${group}`)}>
            <Txt size={20} weight="extrabold">
                {t(`leaders.${group}`)}
            </Txt>
            <ChipRow label={t('leaders.group')}>
                {categories.map((item) => (
                    <Pill key={item.id} label={t(`leaders.${item.id}`)} active={item.id === category.id} onPress={() => setSelected(item.id)} />
                ))}
            </ChipRow>
            {category.leaders.length === 0 ? (
                <Card style={{ paddingVertical: 32 }}>
                    <Txt size={14} tone="muted" center>
                        {category.error ? t('errors.leaders') : t('leaders.noData')}
                    </Txt>
                </Card>
            ) : (
                <ScrollView
                    key={category.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToOffsets={offsets}
                    decelerationRate="fast"
                    style={{ marginHorizontal: -16, flexGrow: 0 }}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 12, gap: GAP }}
                >
                    {category.leaders.map((leader, index) => (
                        <LeaderCard
                            key={`${leader.id}-${leader.rank}`}
                            leader={leader}
                            first={index === 0}
                            width={index === 0 ? widths.first : widths.rest}
                            categoryId={category.id}
                            season={season}
                            seasonYear={data.isPreviousSeason ? data.season : undefined}
                        />
                    ))}
                </ScrollView>
            )}
        </View>
    );
};

export const LeadersSection: React.FC<{ tabs: React.ReactNode }> = ({ tabs }) => {
    const { t } = useTranslation();
    const errorText = useErrorText();
    const { activeLeague } = useLeague();
    const leaders = useLeaders(activeLeague);
    const pro = useIsPro();
    const widths = useCardWidths();
    const data = leaders.data;
    const season = data ? seasonLabel(data.season, activeLeague) : '';

    return (
        <Screen onRefresh={() => leaders.refetch()} contentStyle={{ gap: 24 }}>
            <View style={{ gap: 16 }}>
                {tabs}
                <SectionHeader subtitle={`${t(`leagues.${activeLeague}.name`)}${season ? ` · ${t('common.season', { season })}` : ''}`} title={t('leaders.title')} pro={pro} />
            </View>

            {data?.isPreviousSeason && <Notice text={t('leaders.previousSeason')} />}

            {waitingForNetwork(leaders) ? (
                <OfflineState />
            ) : leaders.isPending ? (
                <Row gap={12} style={{ overflow: 'hidden', marginRight: -16 }}>
                    <Skeleton height={300} width={widths.first} round={28} />
                    <Skeleton height={300} width={widths.rest} round={28} />
                </Row>
            ) : leaders.isError && !data ? (
                <ErrorState message={errorText(leaders.error)} onRetry={() => leaders.refetch()} />
            ) : data ? (
                <>
                    <CategoryCarousel key={`${activeLeague}-hitting`} data={data} group="hitting" season={season} />
                    <CategoryCarousel key={`${activeLeague}-pitching`} data={data} group="pitching" season={season} />
                    <Txt size={12} tone="muted">
                        {t('leaders.qualifiedNote')}
                    </Txt>
                </>
            ) : null}
        </Screen>
    );
};
