import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import type { GameDetail } from '../../types';
import { useTextScale } from '../../state/preferences';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { Card, TeamLogo, Txt } from '../ui';
import { openPlayer, teamTextLink } from '../stats/common';

const NAME_W = 150;
const COL_W = 44;
const ROW_H = 38;
const HEAD_H = 30;

/** Una fila de la tabla: el nombre (columna fija) y sus números (de lado a lado) */
interface BoxRow {
    key: string;
    name: React.ReactNode;
    cells: React.ReactNode[];
    /** Fila de totales: raya más marcada arriba */
    total?: boolean;
}

/** Tabla del box con la columna del nombre fija al moverla de lado a lado (como `sticky left-0` de la web) */
const FrozenBox: React.FC<{ nameHead: string; heads: React.ReactNode[]; rows: BoxRow[] }> = ({ nameHead, heads, rows }) => {
    const colors = useColors();
    const scale = useTextScale();
    const rowH = Math.round(ROW_H * scale);
    const line = (row: BoxRow) => ({ height: rowH, borderTopWidth: 1, borderTopColor: row.total ? alpha(colors.ink, 0.15) : colors.line });
    return (
        <View style={{ flexDirection: 'row' }}>
            <View style={{ width: NAME_W, backgroundColor: colors.surface, zIndex: 1 }}>
                <View style={{ height: HEAD_H, justifyContent: 'center', paddingLeft: 16, paddingRight: 8 }}>
                    <Txt size={11} weight="semibold" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        {nameHead}
                    </Txt>
                </View>
                {rows.map((row) => (
                    <View key={row.key} style={[line(row), { justifyContent: 'center' }]}>
                        {row.name}
                    </View>
                ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
                <View style={{ paddingRight: 16 }}>
                    <View style={{ height: HEAD_H, flexDirection: 'row', alignItems: 'center' }}>{heads}</View>
                    {rows.map((row) => (
                        <View key={row.key} style={[line(row), { flexDirection: 'row', alignItems: 'center' }]}>
                            {row.cells}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

/** Lista que se abre y se cierra (el <details> de la web): banca o bullpen */
const Collapsible: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    const colors = useColors();
    const [open, setOpen] = useState(false);
    const Icon = open ? ChevronDown : ChevronRight;
    return (
        <View>
            <Pressable onPress={() => setOpen((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}>
                <Icon size={14} color={colors.muted} />
                <Txt size={11} weight="bold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {title}
                </Txt>
            </Pressable>
            {open && <View style={{ marginTop: 6 }}>{children}</View>}
        </View>
    );
};

// Box score de un equipo: bateo, pitcheo y la banca y el bullpen; se cambia de equipo arriba y el nombre abre la ficha
// del pelotero
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
    const link = (id: number, children: React.ReactNode, indent = 16) => (
        <Pressable onPress={() => openPlayer({ id, teamId: team.id })} accessibilityRole="link" style={{ height: '100%', paddingLeft: indent, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {children}
        </Pressable>
    );

    const batting: BoxRow[] = [
        ...box.batters.map((batter) => ({
            key: String(batter.id),
            name: link(
                batter.id,
                <>
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
                </>,
                batter.sub ? 32 : 16
            ),
            cells: [
                cell(batter.ab, 'ab'),
                cell(batter.r, 'r'),
                cell(batter.h, 'h', { bold: batter.h > 0 }),
                cell(batter.rbi, 'rbi'),
                cell(batter.bb, 'bb'),
                cell(batter.k, 'k'),
                cell(batter.avg ?? '—', 'avg', { muted: true, wide: true })
            ]
        })),
        {
            key: 'totals',
            total: true,
            name: (
                <Txt size={14} weight="semibold" style={{ paddingLeft: 16 }}>
                    {t('box.totals')}
                </Txt>
            ),
            cells: [...(['ab', 'r', 'h', 'rbi', 'bb', 'k'] as const).map((key) => cell(box.totals[key] ?? '—', key, { bold: true })), cell(box.totals.avg ?? '', 'avg', { muted: true, wide: true })]
        }
    ];

    const pitching: BoxRow[] = box.pitchers.map((pitcher) => ({
        key: String(pitcher.id),
        name: link(
            pitcher.id,
            <>
                <Txt size={14} weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {pitcher.name}
                </Txt>
                {pitcher.note ? (
                    <Txt size={12} weight="semibold" tone="accentInk">
                        {pitcher.note}
                    </Txt>
                ) : null}
            </>
        ),
        cells: [
            cell(pitcher.ip, 'ip'),
            cell(pitcher.h, 'h'),
            cell(pitcher.r, 'r'),
            cell(pitcher.er, 'er'),
            cell(pitcher.bb, 'bb'),
            cell(pitcher.k, 'k'),
            cell(pitcher.np !== null ? `${pitcher.np}${pitcher.st !== null ? `-${pitcher.st}` : ''}` : '—', 'np', { wide: true }),
            cell(pitcher.era ?? '—', 'era', { muted: true, wide: true })
        ]
    }));

    const bench = box.bench ?? [];
    const bullpen = box.bullpen ?? [];
    const listRow = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 6 };

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
                <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                    <Txt eyebrow accessibilityRole="header">
                        {t('box.batting')} · <Text {...teamTextLink(team.id)}>{team.name}</Text>
                    </Txt>
                </View>
                {box.batters.length === 0 ? (
                    <Txt size={14} tone="muted" center style={{ paddingVertical: 32 }}>
                        {t('box.noData')}
                    </Txt>
                ) : (
                    <FrozenBox nameHead={t('box.player')} heads={[...['ab', 'r', 'h', 'rbi', 'bb', 'k'].map((key) => head(t(`stats.${key}`), key)), head(t('stats.avg'), 'avg', true)]} rows={batting} />
                )}
                {box.totals.lob !== null && (
                    <Txt size={12} tone="muted" style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                        {t('box.lob', { count: box.totals.lob })}
                    </Txt>
                )}
            </Card>

            <Card padded={false} style={{ overflow: 'hidden' }}>
                <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                    <Txt eyebrow accessibilityRole="header">
                        {t('box.pitching')} · <Text {...teamTextLink(team.id)}>{team.name}</Text>
                    </Txt>
                </View>
                {box.pitchers.length === 0 ? (
                    <Txt size={14} tone="muted" center style={{ paddingVertical: 32 }}>
                        {t('box.noData')}
                    </Txt>
                ) : (
                    <FrozenBox
                        nameHead={t('box.pitcher')}
                        heads={[...['ip', 'h', 'r', 'er', 'bb', 'k'].map((key) => head(t(`stats.${key}`), key)), head(t('stats.pitches'), 'np', true), head(t('stats.era'), 'era', true)]}
                        rows={pitching}
                    />
                )}
            </Card>

            {/* Los que no han jugado y los relevistas que quedan (si vienen en el feed) */}
            {bench.length + bullpen.length > 0 && (
                <Card padded={false} style={{ overflow: 'hidden' }}>
                    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                        <Txt eyebrow accessibilityRole="header">
                            {t('box.benchTitle')} · <Text {...teamTextLink(team.id)}>{team.name}</Text>
                        </Txt>
                    </View>
                    <View style={{ gap: 16, padding: 16 }}>
                        {bench.length > 0 && (
                            <Collapsible title={`${t('box.bench')} · ${bench.length}`}>
                                {bench.map((player, index) => (
                                    <Pressable key={player.id} onPress={() => openPlayer({ id: player.id, name: player.name, teamId: team.id })} accessibilityRole="link" style={[listRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                                        <Txt size={14} weight="medium" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                            {player.name}
                                        </Txt>
                                        <Txt size={12} tone="faint">
                                            {player.pos}
                                        </Txt>
                                        <Txt size={14} tabular tone="muted" style={{ width: 48, textAlign: 'right' }}>
                                            {player.avg ?? '—'}
                                        </Txt>
                                    </Pressable>
                                ))}
                            </Collapsible>
                        )}
                        {bullpen.length > 0 && (
                            <Collapsible title={`${t('box.bullpen')} · ${bullpen.length}`}>
                                {bullpen.map((arm, index) => (
                                    <Pressable key={arm.id} onPress={() => openPlayer({ id: arm.id, name: arm.name, teamId: team.id })} accessibilityRole="link" style={[listRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                                        <Txt size={14} weight="medium" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                            {arm.name}
                                        </Txt>
                                        {arm.throws ? (
                                            <Txt size={12} tone="faint">
                                                {t(`box.hand${arm.throws}`, { defaultValue: arm.throws })}
                                            </Txt>
                                        ) : null}
                                        <Txt size={14} tabular tone="muted" style={{ width: 72, textAlign: 'right' }}>
                                            {arm.era ? t('box.era', { era: arm.era }) : '—'}
                                        </Txt>
                                    </Pressable>
                                ))}
                            </Collapsible>
                        )}
                    </View>
                </Card>
            )}
        </View>
    );
};
