// Categorías avanzadas (igual que la web): el N.º 1 de cada una (siempre de la regular), su valor y la ventaja sobre
// el 2.º. Cuatro columnas que caben a 320 px sin deslizar (por eso no es ProTable: filas de dos líneas más altas).
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react-native';
import type { StatsTeam } from '../../../lib/stats';
import type { ProPlayerRow } from '../../../types/pro-liga';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { Enter, ModuleHeader, fmtSigned, useProColors } from '../kit';
import type { LeaderBoard } from './logic';
import { LeaderPhoto } from './LeaderPhoto';

interface AdvancedTableProps {
    boards: LeaderBoard[];
    teams: Record<string, StatsTeam>;
    /** «Siempre la regular» */
    aside: string;
    caption: string;
    /** Constante FIP de la liga (para el nombre de la fila) */
    fip: number | null;
    onOpen: (row: ProPlayerRow) => void;
    /** Rótulo corto sin confusiones («Weigel», «O. De La Cruz») */
    label: (row: ProPlayerRow) => string;
}

type T = (key: string, options?: Record<string, unknown>) => string;

// Ventaja del N.º 1 sobre el 2.º con el signo del valor (en WHIP, BB/9 y FIP la ventaja es un número negativo)
const advantage = (board: LeaderBoard, t: T) => {
    const [first, second] = board.leaders;
    if (!first || !second) return null;
    const diff = first.value - second.value;
    if (board.category.id === 'ip') return diff === 0 ? '=' : t('pro.lideres.advanced.outs', { count: Math.round(diff) });
    if (diff === 0) return '=';
    const digits = board.category.kind === 'count' ? 0 : ['k9', 'bb9'].includes(board.category.id) ? 1 : 2;
    return fmtSigned(diff, digits);
};


export const AdvancedTable: React.FC<AdvancedTableProps> = ({ boards, teams, aside, caption, fip, onOpen, label }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    // A 320 px las columnas fijas se encogen para que el N.º 1 tenga sitio
    const narrow = useWindowDimensions().width < 360;
    const CATEGORY = narrow ? 72 : 84;
    const VALUE = narrow ? 54 : 64;
    const VS = narrow ? 48 : 56;
    const rows = boards.filter((board) => board.leaders.length > 0);
    if (!rows.length) return null;
    const teamOf = (row: ProPlayerRow) => (row.teamId !== null ? teams[row.teamId] : undefined);
    const head = (text: string, width: number | null, align: 'left' | 'right', highlight = false) => (
        <View style={[{ height: 40, justifyContent: 'center', paddingHorizontal: 6 }, width ? { width } : { flex: 1, minWidth: 0 }, highlight && { backgroundColor: alpha(colors.accent, 0.1), borderTopLeftRadius: 8, borderTopRightRadius: 8 }]}>
            <Txt size={10} weight="extrabold" color={highlight ? colors.accentInk : colors.muted} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.4, textAlign: align }}>
                {text}
            </Txt>
        </View>
    );

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.lideres.advanced.title')} aside={aside} />
            <View accessibilityLabel={caption} style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: alpha(colors.line, 0.06), paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4 }}>
                <View style={{ flexDirection: 'row' }}>
                    {head(t('pro.lideres.advanced.cols.category'), CATEGORY, 'left')}
                    {head(t('pro.lideres.advanced.cols.first'), null, 'left')}
                    {head(t('pro.lideres.advanced.cols.value'), VALUE, 'right', true)}
                    {head(t('pro.lideres.advanced.cols.vsSecond'), VS, 'right')}
                </View>
                {rows.map((board, index) => {
                    const [first, second] = board.leaders;
                    const team = teamOf(first.row);
                    const text = advantage(board, t);
                    const abbr = t(`pro.lideres.categories.${board.category.id}.abbr`);
                    const name = board.category.id === 'fip' && fip !== null ? t('pro.lideres.advanced.fipConstant', { c: fip.toFixed(2) }) : t(`pro.lideres.categories.${board.category.id}.title`);
                    return (
                        <Enter key={board.category.id} index={index}>
                            <View style={{ flexDirection: 'row', alignItems: 'stretch', minHeight: 60, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08) }}>
                                <View style={{ width: CATEGORY, justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 8 }}>
                                    <Txt size={15} weight="black">
                                        {abbr}
                                    </Txt>
                                    <Txt size={11} weight="semibold" tone="muted" style={{ lineHeight: 14 }}>
                                        {name}
                                    </Txt>
                                </View>
                                <Pressable
                                    onPress={() => onOpen(first.row)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${abbr}: ${first.row.name} (${team?.abbrev ?? '—'}), ${first.display}${second ? t('pro.lideres.advanced.secondAria', { name: second.row.name, value: second.display }) : ''}`}
                                    style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, opacity: pressed ? 0.8 : 1 })}
                                >
                                    <LeaderPhoto personId={first.row.id} name={first.row.name} size={narrow ? 24 : 28} color={team?.color ?? '#64748b'} teamId={first.row.teamId} logo={team?.logo} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Txt size={13} weight="extrabold" numberOfLines={1}>
                                            {label(first.row)}
                                        </Txt>
                                        <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                                            {team?.abbrev ?? '—'}
                                            {second ? ` · ${t('pro.lideres.advanced.second', { name: label(second.row) })}` : ''}
                                        </Txt>
                                    </View>
                                </Pressable>
                                <View style={{ width: VALUE, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: alpha(colors.accent, 0.1) }}>
                                    <Txt condensed size={22} tabular numberOfLines={1} adjustsFontSizeToFit>
                                        {first.display}
                                    </Txt>
                                </View>
                                <View style={{ width: VS, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 6 }}>
                                    <Txt size={12} weight="extrabold" tabular color={text === '=' || text === null ? colors.muted : pro.up} numberOfLines={1}>
                                        {text ?? '—'}
                                    </Txt>
                                </View>
                            </View>
                        </Enter>
                    );
                })}
                <View style={{ flexDirection: 'row' }}>
                    <View style={{ width: CATEGORY }} />
                    <View style={{ flex: 1 }} />
                    <View style={{ width: VALUE, height: 6, backgroundColor: alpha(colors.accent, 0.1), borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }} />
                    <View style={{ width: VS }} />
                </View>
                <Pressable
                    onPress={() => router.setParams({ seccion: 'estadisticas', vista: undefined })}
                    accessibilityRole="link"
                    style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.7 : 1, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08) })}
                >
                    <Txt size={14} weight="bold" color={colors.accentInk}>
                        {t('pro.lideres.advanced.more')}
                    </Txt>
                    <ChevronRight size={16} color={colors.accentInk} />
                </Pressable>
            </View>
        </View>
    );
};
