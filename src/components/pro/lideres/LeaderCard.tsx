// Tarjeta de una categoría del tablero (igual que la web): el N.º 1 con foto sobre el degradado de su equipo y un detalle
// útil, y las filas 2-10 con mini foto, nombre, sigla y una barra proporcional al líder (desde el promedio de la liga
// en las tasas). «T-4» en los empates y «+2 empatados» cuando no caben.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react-native';
import type { StatsTeam } from '../../../lib/stats';
import type { ProPlayerRow } from '../../../types/pro-liga';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { CountUp, GrowBar, mix, teamInk, useInView } from '../kit';
import { leaderBar, type LeaderBoard, type RankedLeader } from './logic';
import { leaderDetail } from './detail';
import { LeaderPhoto } from './LeaderPhoto';

interface LeaderCardProps {
    board: LeaderBoard;
    teams: Record<string, StatsTeam>;
    onOpen: (row: ProPlayerRow) => void;
    onShare: (board: LeaderBoard) => void;
    /** Rótulo corto sin confusiones («Sanó», «B. De La Cruz»; ver shortLabels) */
    label: (row: ProPlayerRow) => string;
}

const NEUTRAL = '#64748b';

/** Puesto con empate: «T-4» */
export const rankText = (item: Pick<RankedLeader, 'rank' | 'tied'>) => (item.tied ? `T-${item.rank}` : String(item.rank));

/** Los dos tonos del degradado del equipo: hacia oscuro si el texto va blanco, hacia claro si va oscuro (AGU) */
export const teamGradient = (color: string): [string, string] => [color, mix(color, teamInk(color) === '#ffffff' ? '#000000' : '#ffffff', 0.32)];

export const LeaderCard: React.FC<LeaderCardProps> = ({ board, teams, onOpen, onShare, label }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    const [showTied, setShowTied] = useState(false);
    const { category, leaders, tiedOut, average } = board;
    const title = t(`pro.lideres.categories.${category.id}.title`);
    const abbr = t(`pro.lideres.categories.${category.id}.abbr`);
    const first = leaders[0];
    const rest = leaders.slice(1);
    const teamOf = (row: ProPlayerRow) => (row.teamId !== null ? teams[row.teamId] : undefined);
    const firstTeam = first ? teamOf(first.row) : undefined;
    const color = firstTeam?.color ?? NEUTRAL;
    const ink = teamInk(color);

    return (
        <View
            ref={setNode}
            onLayout={onLayout}
            accessibilityLabel={title}
            style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: alpha(colors.line, 0.06), paddingHorizontal: 6, paddingBottom: 10 }}
        >
            {/* Título de 13.5 px y el botón de compartir pegado al borde, para que «Poder aislado» quepa */}
            <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 6 }}>
                <Txt size={13.5} weight="extrabold" accessibilityRole="header" numberOfLines={2} style={{ flex: 1, minWidth: 0, lineHeight: 15, letterSpacing: -0.2 }}>
                    {title}
                    <Txt size={10} weight="extrabold" tone="muted" style={{ letterSpacing: 0.6 }}>
                        {`  ${abbr}`}
                    </Txt>
                </Txt>
                {first && (
                    <Pressable
                        onPress={() => onShare(board)}
                        accessibilityRole="button"
                        accessibilityLabel={t('pro.lideres.board.share', { category: title })}
                        style={{ width: 44, height: 44, marginRight: -4, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                            <Share2 size={14} color={colors.muted} />
                        </View>
                    </Pressable>
                )}
            </View>

            {!first ? (
                <View style={{ backgroundColor: colors.raised, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 24 }}>
                    <Txt size={12} weight="semibold" tone="muted" center>
                        {category.kind === 'rate' ? t('pro.lideres.board.emptyRate') : t('pro.lideres.board.empty')}
                    </Txt>
                </View>
            ) : (
                <>
                    <Pressable
                        onPress={() => onOpen(first.row)}
                        accessibilityRole="button"
                        accessibilityLabel={t('pro.lideres.board.heroAria', { rank: rankText(first), name: first.row.name, team: firstTeam?.abbrev ?? '', value: first.display, category: title })}
                        style={({ pressed }) => ({ borderRadius: 16, overflow: 'hidden', opacity: pressed ? 0.9 : 1 })}
                    >
                        <LinearGradient colors={teamGradient(color)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ minHeight: 150, padding: 12 }}>
                            <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: ink === '#ffffff' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.45)' }}>
                                <Txt size={10} weight="extrabold" color={ink} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                    {first.tied ? t('pro.lideres.board.rankTied', { rank: first.rank, team: firstTeam?.abbrev ?? '' }) : t('pro.lideres.board.rank', { team: firstTeam?.abbrev ?? '' })}
                                </Txt>
                            </View>
                            <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 }}>
                                <Txt condensed size={38} color={ink} tabular numberOfLines={1} adjustsFontSizeToFit style={{ lineHeight: 40, letterSpacing: -0.5, flexShrink: 1 }}>
                                    <CountUp value={first.value} format={category.format} seen={seen} />
                                </Txt>
                                <View style={{ marginBottom: -4 }}>
                                    <LeaderPhoto personId={first.row.id} name={first.row.name} size={56} color={color} teamId={first.row.teamId} logo={firstTeam?.logo} hero />
                                </View>
                            </View>
                            <Txt size={15} weight="black" color={ink} numberOfLines={2} style={{ marginTop: 8, lineHeight: 18 }}>
                                {first.row.name}
                            </Txt>
                            <Txt size={11} weight="semibold" color={ink} numberOfLines={2} style={{ marginTop: 2, lineHeight: 15, opacity: 0.85 }}>
                                {leaderDetail(category.id, first.row, t)}
                            </Txt>
                        </LinearGradient>
                    </Pressable>

                    <View style={{ marginTop: 6 }}>
                        {rest.map((item, index) => {
                            const team = teamOf(item.row);
                            const barColor = team?.color ?? NEUTRAL;
                            return (
                                <Pressable
                                    key={item.row.id}
                                    onPress={() => onOpen(item.row)}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('pro.lideres.board.rowAria', { rank: rankText(item), name: item.row.name, team: team?.abbrev ?? '', value: item.display })}
                                    style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, backgroundColor: pressed ? alpha(colors.raised, 0.7) : 'transparent' })}
                                >
                                    <Txt condensed size={11} tone="muted" tabular numberOfLines={1} style={{ width: 22 }}>
                                        {rankText(item)}
                                    </Txt>
                                    <LeaderPhoto personId={item.row.id} name={item.row.name} size={22} color={barColor} teamId={item.row.teamId} logo={team?.logo} />
                                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <Txt size={11} weight="bold" numberOfLines={1} style={{ flex: 1, minWidth: 0, lineHeight: 13 }}>
                                                {label(item.row)}
                                            </Txt>
                                            <Txt condensed size={15} tabular style={{ lineHeight: 15 }}>
                                                {item.display}
                                            </Txt>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <GrowBar value={leaderBar(item.value, first.value, category, average)} color={barColor} index={index} seen={seen} height={4} style={{ flex: 1 }} />
                                            <Txt size={10} weight="bold" tone="muted" style={{ lineHeight: 11 }}>
                                                {team?.abbrev ?? ''}
                                            </Txt>
                                        </View>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>

                    {(tiedOut.length > 0 || (average !== null && category.kind === 'rate')) && (
                        <View style={{ marginTop: 2, paddingHorizontal: 4, gap: 2 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                {tiedOut.length > 0 ? (
                                    <Pressable
                                        onPress={() => setShowTied((value) => !value)}
                                        accessibilityRole="button"
                                        accessibilityState={{ expanded: showTied }}
                                        accessibilityHint={showTied ? t('pro.lideres.board.tiedOutHide') : t('pro.lideres.board.tiedOutShow')}
                                        style={{ minHeight: 44, justifyContent: 'center', flexShrink: 1 }}
                                    >
                                        <Txt size={11} weight="extrabold" color={alpha(colors.ink, 0.8)}>
                                            {t('pro.lideres.board.tiedOut', { count: tiedOut.length })}
                                        </Txt>
                                    </Pressable>
                                ) : (
                                    <View />
                                )}
                                {average !== null && category.kind === 'rate' && (
                                    <Txt size={11} weight="semibold" tone="muted" style={{ paddingVertical: 8 }}>
                                        {t('pro.lideres.board.league')}{' '}
                                        <Txt size={11} weight="extrabold" color={alpha(colors.ink, 0.8)}>
                                            {category.format(average)}
                                        </Txt>
                                    </Txt>
                                )}
                            </View>
                            {showTied && tiedOut.length > 0 && (
                                <Txt size={11} weight="semibold" tone="muted" style={{ lineHeight: 15 }}>
                                    {t('pro.lideres.board.tiedOutDetail', {
                                        rank: tiedOut[0].rank,
                                        value: tiedOut[0].display,
                                        names: tiedOut.map((item) => `${item.row.name} (${teamOf(item.row)?.abbrev ?? '—'})`).join(', ')
                                    })}
                                </Txt>
                            )}
                        </View>
                    )}
                </>
            )}
        </View>
    );
};
