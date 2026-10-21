import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react-native';
import type { PlayerRow, StatContext, StatsTeam } from '../../../lib/stats';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { PlayerPhoto, Txt } from '../../ui';
import { CountUp, teamInk, useGrow, useInView } from '../kit';
import { columnOf, type Role, type Standing, type StatsView } from './logic';
import { barTone } from './parts';

interface LeadCardProps {
    role: Role;
    view: StatsView;
    row: PlayerRow;
    /** Puesto en el orden de la tabla */
    rank: number;
    /** Lo encontró el buscador (si no, es el primero de la vista) */
    isSearch: boolean;
    /** Sigla del equipo filtrado («Líder de TOR») */
    teamAbbrev: string | null;
    team?: StatsTeam;
    sortKey: string;
    sortStanding?: Standing;
    standings: Record<string, Map<number, Standing>>;
    ctx: StatContext | null;
    onOpen: (row: PlayerRow) => void;
}

/** Cifra que cuenta si es un número («.820», «15.3%», «136»); si no, tal cual */
const countable = (value: string) => {
    const clean = value.replace('%', '');
    const numeric = parseFloat(clean);
    if (!Number.isFinite(numeric) || !/^-?\d*\.?\d+%?$/.test(value)) return null;
    const decimals = (clean.split('.')[1] ?? '').length;
    return { numeric, format: (n: number) => `${value.startsWith('.') ? n.toFixed(decimals).replace(/^0/, '') : n.toFixed(decimals)}${value.endsWith('%') ? '%' : ''}` };
};

// Protagonista de la tabla: el pelotero buscado (o el primero de la vista) en el color de su equipo, su cifra del
// orden elegido con puesto y percentil, y una fila de barras con su percentil en cada columna de la vista.
export const LeadCard: React.FC<LeadCardProps> = ({ role, view, row, rank, isSearch, teamAbbrev, team, sortKey, sortStanding, standings, ctx, onOpen }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { width } = useWindowDimensions();
    const { setNode, onLayout, seen } = useInView();
    const color = team?.color || colors.accent;
    const dark = teamInk(color) === '#ffffff';
    const sortColumn = columnOf(role, sortKey);
    const value = sortColumn.show(row, ctx);
    const counted = countable(value);
    const line = role === 'P' ? row.pitching : row.hitting;
    const bars = view.cols.filter((key) => !columnOf(role, key).neutral).map((key) => ({ key, pct: standings[key]?.get(row.id)?.pct ?? null }));
    const eyebrow = isSearch ? t('pro.estadisticas.lead.search') : teamAbbrev ? t('pro.estadisticas.lead.teamLeader', { team: teamAbbrev }) : t('pro.estadisticas.lead.leader', { view: t(`pro.estadisticas.views.${view.key}`) });
    const sortShort = t(`pro.estadisticas.cols.${sortKey}.short`);
    const panel = width < 360 ? 92 : width < 380 ? 108 : 120;
    const rankText = `${t('pro.estadisticas.lead.rank', { rank, column: sortShort })}${sortStanding ? ` · P${sortStanding.pct}` : ''}`;
    const meta = [team?.abbrev, row.pos, line?.g ? t('pro.estadisticas.lead.games', { count: line.g }) : null].filter(Boolean).join(' · ');

    return (
        <View accessibilityLabel={t('pro.estadisticas.lead.aria', { name: row.name })} style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), overflow: 'hidden' }, shadow('card')]}>
            <View style={{ flexDirection: 'row' }}>
                <View style={{ width: panel, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, backgroundColor: color }}>
                    {dark && <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']} locations={[0.3, 1]} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />}
                    <PlayerPhoto personId={row.id} name={row.name} size={76} background="rgba(255,255,255,0.22)" team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                </View>
                <View style={{ flex: 1, minWidth: 0, paddingLeft: 14, paddingRight: 8, paddingVertical: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <Txt size={11} weight="extrabold" color={colors.accentInk} numberOfLines={1} style={{ flexShrink: 1, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                            {eyebrow}
                        </Txt>
                        <Pressable
                            onPress={() => onOpen(row)}
                            accessibilityRole="button"
                            accessibilityLabel={t('statsPage.viewPlayer', { name: row.name })}
                            hitSlop={4}
                            style={({ pressed }) => ({ height: 44, marginVertical: -10, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, borderRadius: radius.pill, opacity: pressed ? 0.7 : 1 })}
                        >
                            <Txt size={13} weight="bold" color={colors.accentInk}>
                                {t('pro.estadisticas.lead.sheet')}
                            </Txt>
                            <ChevronRight size={16} color={colors.accentInk} />
                        </Pressable>
                    </View>
                    <Txt size={20} weight="black" numberOfLines={2} style={{ marginTop: 4, lineHeight: 22, letterSpacing: -0.3 }}>
                        {row.name}
                    </Txt>
                    <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
                        <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flexShrink: 1, marginBottom: 4 }}>
                            {meta}
                        </Txt>
                        <Txt condensed size={34} tabular style={{ lineHeight: 36 }} accessibilityLabel={`${value} ${sortShort}`}>
                            {counted ? <CountUp value={counted.numeric} format={counted.format} /> : value}
                        </Txt>
                    </View>
                    <Txt size={11} weight="semibold" tone="muted" style={{ textAlign: 'right' }}>
                        {rankText}
                    </Txt>
                </View>
            </View>
            {bars.length > 0 && (
                <View
                    ref={setNode}
                    onLayout={onLayout}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={t('pro.estadisticas.lead.barsAria', { name: row.name, view: t(`pro.estadisticas.views.${view.key}`), list: bars.map((bar) => `${t(`pro.estadisticas.cols.${bar.key}.short`)} ${bar.pct ?? '—'}`).join(', ') })}
                    style={{ flexDirection: 'row', gap: 6, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08), paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 }}
                >
                    {bars.map((bar, index) => (
                        <PercentBar key={bar.key} pct={bar.pct} label={t(`pro.estadisticas.cols.${bar.key}.short`)} strong={bar.key === sortKey} index={index} seen={seen} />
                    ))}
                </View>
            )}
        </View>
    );
};

/** Barra vertical del percentil en una columna: crece desde abajo (500 ms, escalonada) */
const PercentBar: React.FC<{ pct: number | null; label: string; strong: boolean; index: number; seen: boolean }> = ({ pct, label, strong, index, seen }) => {
    const colors = useColors();
    const progress = useGrow(Math.max(6, pct ?? 0) / 100, seen, index);
    const fill = useAnimatedStyle(() => ({ height: `${progress.get() * 100}%` }));
    return (
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 4 }}>
            <Txt size={13} weight="extrabold" tabular>
                {pct ?? '—'}
            </Txt>
            <View style={{ height: 36, alignSelf: 'stretch', justifyContent: 'flex-end', borderRadius: 6, overflow: 'hidden', backgroundColor: alpha(colors.line, 0.08) }}>
                <Animated.View style={[{ borderRadius: 6, backgroundColor: barTone(pct, colors.line) }, fill]} />
            </View>
            <Txt size={10} weight={strong ? 'extrabold' : 'semibold'} tone={strong ? 'ink' : 'muted'} numberOfLines={1} style={{ textTransform: 'uppercase' }}>
                {label}
            </Txt>
        </View>
    );
};
