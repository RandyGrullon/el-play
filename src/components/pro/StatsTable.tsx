// Tabla de Estadísticas del modo PRO: una vista de columnas (Clásico, Poder…), celdas pintadas por percentil contra
// los calificados (azul mejor, rojo peor, gris en el medio), cabecera que ordena y se queda pegada arriba, el
// pelotero buscado fijado arriba y solo las filas que se ven montadas (las demás se montan al bajar). Al ordenar,
// cada fila se desliza a su nuevo lugar. Cada vista cabe en el ancho del teléfono (de 320 px en adelante).
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import type { StatContext, StatsTeam } from '../../lib/stats';
import { useColors } from '../../theme/theme';
import { alpha, fonts } from '../../theme/tokens';
import { TeamLogo, Txt } from '../ui';
import { HEAT_SCALES, MOTION_EASE, MOTION_MS, useElementWidth, useMotion, useProColors, withAlpha } from './kit';
import { columnOf, percentileTint, type Role, type Standing, type StatsView } from './estadisticas/logic';
import { MovingRow, StickyHeader, useRowWindow } from './estadisticas/scroll';
import type { ProPlayerRow } from '../../types/pro-liga';
import type { PlayerRow } from '../../lib/stats';

export interface StatsTableSort {
    key: string;
    asc: boolean;
}

type Row = PlayerRow | ProPlayerRow;

interface StatsTableProps {
    role: Role;
    view: StatsView;
    /** Ya ordenados; la tabla muestra los primeros `limit` (todos con null) */
    rows: Row[];
    /** Percentil de cada pelotero por columna (contra todo el grupo de la liga) */
    standings: Record<string, Map<number, Standing>>;
    ctx: StatContext | null;
    teams: Record<string, StatsTeam>;
    names: Map<number, string>;
    sort: StatsTableSort;
    onSort: (key: string) => void;
    /** El pelotero de la búsqueda (si está en el grupo) */
    match: Row | null;
    limit: number | null;
    onOpen: (row: Row) => void;
    /** Qué es la tabla (lector de pantalla) */
    label: string;
}

const ROW = 44;
const HEAD = 44;
const PIN_LABEL = 26;

/** Fondo de una celda por percentil: casi nada cerca del 50; azul o rojo con más fuerza hacia los extremos */
export const tintOf = (pct: number | undefined, line: string) => {
    if (pct === undefined) return 'transparent';
    const { side, alpha: strength } = percentileTint(pct);
    if (side === 'mid') return alpha(line, 0.07);
    // Tope de 0.5: con la tinta del tema encima el contraste pasa 4.5:1 en claro y en oscuro
    return withAlpha(HEAT_SCALES.percentile[side === 'good' ? 2 : 0], Math.min(0.5, 0.12 + strength * 0.5));
};

export const StatsTable: React.FC<StatsTableProps> = ({ role, view, rows, standings, ctx, teams, names, sort, onSort, match, limit, onOpen, label }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const { width, onLayout } = useElementWidth(358);
    // La primera vez que se pinta, las filas entran escalonadas; después solo se deslizan
    const [born] = useState(() => Date.now());
    const shown = limit === null ? rows : rows.slice(0, limit);
    const matchIndex = match ? rows.findIndex((row) => row.id === match.id) : -1;
    const pinned = match && matchIndex >= shown.length ? match : null;
    const body = useRowWindow(shown.length, ROW);
    const { setNode, onLayout: measureBody, first, last, offset } = body;
    const cols = view.cols.map((key) => ({ key, column: columnOf(role, key) }));
    const sortShort = t(`pro.estadisticas.cols.${sort.key}.short`);

    // Anchos: el nombre con su sigla y lo demás repartido; la letra baja con más columnas para caber en 320 px
    const nameWidth = Math.round(Math.min(118, Math.max(84, width * 0.29)));
    const colWidth = Math.max(26, (width - nameWidth - 6) / Math.max(1, cols.length));
    const base = cols.length >= 7 ? 14 : cols.length === 6 ? 15 : 16;
    const cellFont = Math.max(11, Math.min(base, Math.floor(colWidth / 2.45)));
    const bodyHeight = shown.length * ROW;
    const pinHeight = pinned ? PIN_LABEL + ROW + 4 : 0;

    const cells = (item: Row) =>
        cols.map(({ key, column }) => {
            const pct = column.neutral ? undefined : standings[key]?.get(item.id)?.pct;
            return <Cell key={`${view.key}-${key}`} text={column.show(item, ctx)} tint={tintOf(pct, colors.line)} width={colWidth} active={key === sort.key} font={cellFont} />;
        });

    const nameCell = (item: Row, rankText: string, hit: boolean) => {
        const team = item.teamId ? teams[item.teamId] : undefined;
        const sub = [rankText, team?.abbrev, item.pos].filter(Boolean).join(' · ');
        return (
            <View style={{ width: nameWidth, paddingLeft: 10, paddingRight: 4, justifyContent: 'center' }}>
                <Txt size={13} weight={hit ? 'extrabold' : 'bold'} numberOfLines={1} style={{ lineHeight: 16 }}>
                    {names.get(item.id) ?? item.name}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    {team && <TeamLogo team={team} size={12} />}
                    <Txt size={11} color={hit ? pro.fantasy : colors.muted} numberOfLines={1} style={{ flexShrink: 1, lineHeight: 15 }}>
                        {sub}
                    </Txt>
                </View>
            </View>
        );
    };

    const rowLabel = (item: Row, rankText: string) => {
        const team = item.teamId ? teams[item.teamId] : undefined;
        const values = cols.map(({ key, column }) => `${t(`pro.estadisticas.cols.${key}.short`)} ${column.show(item, ctx)}`).join(', ');
        return `${t('pro.estadisticas.table.rowAria', { name: item.name, sub: [rankText, team?.abbrev, item.pos].filter(Boolean).join(', ') })}. ${values}`;
    };

    return (
        <View onLayout={onLayout} accessibilityLabel={label}>
            {/* Cabecera: cada columna ordena (botón de 44 px); se queda pegada arriba mientras la tabla se ve */}
            <StickyHeader offset={offset} height={HEAD} bodyHeight={bodyHeight} gap={pinHeight} style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: alpha(colors.line, 0.08) }}>
                <View style={{ flexDirection: 'row', height: HEAD, alignItems: 'stretch' }}>
                    <View style={{ width: nameWidth, paddingLeft: 10, justifyContent: 'center' }}>
                        <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            {t('pro.estadisticas.table.player')}
                        </Txt>
                    </View>
                    {cols.map(({ key, column }) => {
                        const active = key === sort.key;
                        const Icon = sort.asc ? ArrowUp : ArrowDown;
                        return (
                            <Pressable
                                key={key}
                                onPress={() => onSort(key)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={t('pro.estadisticas.table.sortAria', { column: t(`pro.estadisticas.cols.${key}.long`), extra: column.asc ? t('pro.estadisticas.table.lowerBetter') : '' })}
                                style={({ pressed }) => [
                                    { width: colWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 1, paddingRight: 3, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
                                    active && { backgroundColor: alpha(colors.accent, 0.1) },
                                    pressed && { opacity: 0.7 }
                                ]}
                            >
                                <Txt size={10} weight="extrabold" color={active ? colors.accentInk : colors.muted} numberOfLines={1} style={{ textTransform: 'uppercase', flexShrink: 1 }}>
                                    {t(`pro.estadisticas.cols.${key}.short`)}
                                </Txt>
                                {active && <Icon size={10} color={colors.accentInk} />}
                            </Pressable>
                        );
                    })}
                </View>
            </StickyHeader>

            {pinned && (
                <View style={{ height: pinHeight }}>
                    <View style={{ height: PIN_LABEL, justifyContent: 'flex-end', paddingHorizontal: 10, paddingBottom: 4 }}>
                        <Txt size={10} weight="extrabold" color={pro.fantasy} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                            {t('pro.estadisticas.table.pinned', { rank: matchIndex + 1, column: sortShort })}
                        </Txt>
                    </View>
                    <RowPress label={rowLabel(pinned, `#${matchIndex + 1}`)} onPress={() => onOpen(pinned)} hit height={ROW + 4}>
                        {nameCell(pinned, `#${matchIndex + 1}`, true)}
                        {cells(pinned)}
                    </RowPress>
                </View>
            )}

            {/* Cuerpo: alto de todas las filas; solo se montan las que se ven */}
            <View ref={setNode} onLayout={measureBody} collapsable={false} style={{ height: bodyHeight }}>
                {shown.map((item, index) => {
                    if (index < first || index > last) return null;
                    const hit = match?.id === item.id;
                    return (
                        <MovingRow key={item.id} index={index} rowHeight={ROW} born={born}>
                            <RowPress label={rowLabel(item, String(index + 1))} onPress={() => onOpen(item)} hit={hit} height={ROW}>
                                {nameCell(item, String(index + 1), hit)}
                                {cells(item)}
                            </RowPress>
                        </MovingRow>
                    );
                })}
            </View>
        </View>
    );
};

const RowPress: React.FC<{ label: string; onPress: () => void; hit: boolean; height: number; children: React.ReactNode }> = ({ label, onPress, hit, height, children }) => {
    const colors = useColors();
    const pro = useProColors();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [
                { height, flexDirection: 'row', alignItems: 'stretch', borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08) },
                hit && { backgroundColor: alpha(pro.fantasy, 0.14), borderLeftWidth: 3, borderLeftColor: pro.fantasy },
                pressed && { backgroundColor: alpha(colors.line, 0.08) }
            ]}
        >
            {children}
        </Pressable>
    );
};

/** Celda con su color de percentil: el color aparece con un fundido al cambiar de vista */
const Cell: React.FC<{ text: string; tint: string; width: number; active: boolean; font: number }> = ({ text, tint, width, active, font }) => {
    const colors = useColors();
    const motion = useMotion();
    const fade = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            fade.set(1);
            return;
        }
        fade.set(0);
        fade.set(withTiming(1, { duration: MOTION_MS.flip, easing: MOTION_EASE }));
        return () => cancelAnimation(fade);
    }, [tint, motion.animate, fade]);
    const tinted = useAnimatedStyle(() => ({ opacity: fade.get() }));
    return (
        <View style={[{ width, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 2 }, active && { backgroundColor: alpha(colors.accent, 0.1) }]}>
            <View style={{ borderRadius: 6, paddingHorizontal: 3, paddingVertical: 2, minWidth: 24, alignItems: 'flex-end' }}>
                <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 6, backgroundColor: tint }, tinted]} />
                <Txt numberOfLines={1} style={{ fontFamily: fonts.condensed, fontSize: font, lineHeight: font + 5, color: colors.ink, fontVariant: ['tabular-nums'], opacity: active ? 1 : 0.92 }}>
                    {text}
                </Txt>
            </View>
        </View>
    );
};
