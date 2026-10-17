import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { Card, TeamLogo, Txt } from '../ui';

const NAME_W = 170;
const COL_W = 44;

// Box score de un equipo: bateo y pitcheo; se cambia de equipo arriba y el nombre abre la ficha del pelotero
export const BoxScore: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [side, setSide] = useState<'away' | 'home'>(game.inning && !game.inning.isTop ? 'home' : 'away');
    const team = game[side];
    const box = game.box[side];

    const head = (label: string, key: string, wide?: boolean) => (
        <Txt key={key} size={11} weight="semibold" tone="faint" style={{ width: wide ? COL_W + 12 : COL_W, textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {label}
        </Txt>
    );
    const cell = (value: React.ReactNode, key: string, options: { bold?: boolean; muted?: boolean; wide?: boolean } = {}) => (
        <Txt key={key} size={14} tabular weight={options.bold ? 'semibold' : 'regular'} tone={options.muted ? 'muted' : 'ink'} style={{ width: options.wide ? COL_W + 12 : COL_W, textAlign: 'right' }}>
            {value}
        </Txt>
    );
    const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 8, paddingRight: 16, borderTopWidth: 1, borderTopColor: colors.line };

    return (
        <View style={{ gap: 16 }}>
            {/* Selector de equipo con el logo */}
            <View style={{ flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.raised, borderRadius: radius.pill, padding: 4 }} accessibilityRole="tablist" accessibilityLabel={t('box.team')}>
                {(['away', 'home'] as const).map((key) => {
                    const active = key === side;
                    return (
                        <Pressable
                            key={key}
                            onPress={() => setSide(key)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                            style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 7 }, active && [{ backgroundColor: colors.surface }, shadow('card')]]}
                        >
                            <TeamLogo team={game[key]} size={18} />
                            <Txt size={14} weight="semibold" tone={active ? 'ink' : 'muted'}>
                                {game[key].abbrev}
                            </Txt>
                        </Pressable>
                    );
                })}
            </View>

            <Card padded={false} style={{ overflow: 'hidden' }}>
                <Txt eyebrow style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                    {t('box.batting')} · {team.name}
                </Txt>
                {box.batters.length === 0 ? (
                    <Txt size={14} tone="muted" center style={{ paddingVertical: 32 }}>
                        {t('box.noData')}
                    </Txt>
                ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ minWidth: '100%' }}>
                            <View style={[rowStyle, { paddingVertical: 6 }]}>
                                <Txt size={11} weight="semibold" tone="faint" style={{ width: NAME_W, paddingLeft: 16, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                    {t('box.player')}
                                </Txt>
                                {['ab', 'r', 'h', 'rbi', 'bb', 'k'].map((key) => head(t(`stats.${key}`), key))}
                                {head(t('stats.avg'), 'avg', true)}
                            </View>
                            {box.batters.map((batter) => (
                                <View key={batter.id} style={rowStyle}>
                                    <Pressable onPress={() => router.push(`/jugador/${batter.id}`)} accessibilityRole="link" style={{ width: NAME_W, paddingLeft: batter.sub ? 32 : 16, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Txt size={14} weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
                                            {batter.name}
                                        </Txt>
                                        <Txt size={12} tone="faint">
                                            {batter.pos}
                                        </Txt>
                                        {batter.hr > 0 && (
                                            <View style={{ borderRadius: 4, backgroundColor: alpha(colors.gold, 0.15), paddingHorizontal: 4 }}>
                                                <Txt size={10} weight="bold" color={colors.gold}>
                                                    HR{batter.hr > 1 ? ` ${batter.hr}` : ''}
                                                </Txt>
                                            </View>
                                        )}
                                    </Pressable>
                                    {cell(batter.ab, 'ab')}
                                    {cell(batter.r, 'r')}
                                    {cell(batter.h, 'h', { bold: batter.h > 0 })}
                                    {cell(batter.rbi, 'rbi')}
                                    {cell(batter.bb, 'bb')}
                                    {cell(batter.k, 'k')}
                                    {cell(batter.avg ?? '—', 'avg', { muted: true, wide: true })}
                                </View>
                            ))}
                            <View style={[rowStyle, { borderTopColor: alpha(colors.ink, 0.15) }]}>
                                <Txt size={14} weight="semibold" style={{ width: NAME_W, paddingLeft: 16 }}>
                                    {t('box.totals')}
                                </Txt>
                                {(['ab', 'r', 'h', 'rbi', 'bb', 'k'] as const).map((key) => cell(box.totals[key] ?? '—', key, { bold: true }))}
                                {cell(box.totals.avg ?? '', 'avg', { muted: true, wide: true })}
                            </View>
                        </View>
                    </ScrollView>
                )}
                {box.totals.lob !== null && (
                    <Txt size={12} tone="muted" style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                        {t('box.lob', { count: box.totals.lob })}
                    </Txt>
                )}
            </Card>

            <Card padded={false} style={{ overflow: 'hidden' }}>
                <Txt eyebrow style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                    {t('box.pitching')} · {team.name}
                </Txt>
                {box.pitchers.length === 0 ? (
                    <Txt size={14} tone="muted" center style={{ paddingVertical: 32 }}>
                        {t('box.noData')}
                    </Txt>
                ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ minWidth: '100%' }}>
                            <View style={[rowStyle, { paddingVertical: 6 }]}>
                                <Txt size={11} weight="semibold" tone="faint" style={{ width: NAME_W, paddingLeft: 16, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                    {t('box.pitcher')}
                                </Txt>
                                {['ip', 'h', 'r', 'er', 'bb', 'k'].map((key) => head(t(`stats.${key}`), key))}
                                {head(t('stats.pitches'), 'np', true)}
                                {head(t('stats.era'), 'era', true)}
                            </View>
                            {box.pitchers.map((pitcher) => (
                                <View key={pitcher.id} style={rowStyle}>
                                    <Pressable onPress={() => router.push(`/jugador/${pitcher.id}`)} accessibilityRole="link" style={{ width: NAME_W, paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Txt size={14} weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
                                            {pitcher.name}
                                        </Txt>
                                        {pitcher.note ? (
                                            <Txt size={12} weight="semibold" tone="accentInk">
                                                {pitcher.note}
                                            </Txt>
                                        ) : null}
                                    </Pressable>
                                    {cell(pitcher.ip, 'ip')}
                                    {cell(pitcher.h, 'h')}
                                    {cell(pitcher.r, 'r')}
                                    {cell(pitcher.er, 'er')}
                                    {cell(pitcher.bb, 'bb')}
                                    {cell(pitcher.k, 'k')}
                                    {cell(pitcher.np !== null ? `${pitcher.np}${pitcher.st !== null ? `-${pitcher.st}` : ''}` : '—', 'np', { wide: true })}
                                    {cell(pitcher.era ?? '—', 'era', { muted: true, wide: true })}
                                </View>
                            ))}
                        </View>
                    </ScrollView>
                )}
            </Card>
        </View>
    );
};
