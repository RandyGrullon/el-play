import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { mix } from './color';
import { Enter, useReorder } from './Enter';

export type SortDir = 'asc' | 'desc';
export interface ProSort {
    id: string;
    dir: SortDir;
}

type SortValue = number | string | null | undefined;

/** Lo que recibe cada celda además de la fila: si su columna es la ordenada (para ponerla en negrita) */
export interface CellInfo {
    sorted: boolean;
}

export interface ProColumn<Row> {
    id: string;
    /** Encabezado corto («PCT», «OPS») */
    header: string;
    /** Nombre completo para el lector de pantalla y el botón de ordenar («Porcentaje de victorias») */
    title?: string;
    cell: (row: Row, index: number, info: CellInfo) => React.ReactNode;
    /** Con esto la columna se puede ordenar */
    sortValue?: (row: Row) => SortValue;
    /** Primer orden al tocarla: desc (más es mejor, por defecto) o asc (EFE, WHIP) */
    firstDir?: SortDir;
    /** left para texto; los números van a la derecha (por defecto) */
    align?: 'left' | 'right' | 'center';
    /** Ancho en px (56 por defecto; la fija 120). Si sobra espacio, las columnas que se deslizan lo reparten. */
    width?: number;
    /** Columna fija a la izquierda al deslizar (solo la primera: logo + sigla o nombre) */
    sticky?: boolean;
}

export type RowTone = 'accent' | 'gold' | 'live' | null | undefined;

export interface ProTableProps<Row> {
    columns: ProColumn<Row>[];
    rows: Row[];
    rowKey: (row: Row) => string | number;
    /** Nombre de la tabla (lector de pantalla) */
    label: string;
    /** Orden controlado por la pantalla; si no, la tabla lo guarda (empezando por `defaultSort`) */
    sort?: ProSort | null;
    defaultSort?: ProSort | null;
    onSortChange?: (sort: ProSort) => void;
    /** Fila resaltada: accent (tú), gold (tu equipo favorito), live (en vivo) */
    rowTone?: (row: Row) => RowTone;
    /** Tocar la fila (abre la ficha): la primera celda es el botón, con este nombre */
    onRowPress?: (row: Row) => void;
    rowLabel?: (row: Row) => string;
    /** Fila separadora de ancho completo después de esta (p. ej. la línea de corte «Pasan al Round Robin») */
    after?: (row: Row, index: number) => React.ReactNode;
    /** Alto de esas filas separadoras (28) */
    afterHeight?: number;
    /** Celdas de la fila de totales, por id de columna */
    footer?: Partial<Record<string, React.ReactNode>>;
    /** Filas de 36 px en vez de 40 (densidad compacta) */
    dense?: boolean;
    /** Las filas entran escalonadas (30 ms) la primera vez */
    stagger?: boolean;
    /** Fondo de la tarjeta donde va la tabla (la columna fija lo usa para tapar lo que pasa por debajo) */
    surface?: 'surface' | 'raised' | 'bg';
    style?: StyleProp<ViewStyle>;
}

/** Ordena sin mutar; los vacíos siempre al final; el orden previo se respeta en los empates */
export const sortRows = <Row,>(rows: readonly Row[], value: (row: Row) => SortValue, dir: SortDir): Row[] =>
    rows
        .map((row, index) => ({ row, index, key: value(row) }))
        .sort((a, b) => {
            const emptyA = a.key === null || a.key === undefined || (typeof a.key === 'number' && !Number.isFinite(a.key));
            const emptyB = b.key === null || b.key === undefined || (typeof b.key === 'number' && !Number.isFinite(b.key));
            if (emptyA || emptyB) return emptyA === emptyB ? a.index - b.index : emptyA ? 1 : -1;
            const diff = typeof a.key === 'number' && typeof b.key === 'number' ? a.key - b.key : String(a.key).localeCompare(String(b.key), 'es');
            return diff === 0 ? a.index - b.index : dir === 'asc' ? diff : -diff;
        })
        .map((item) => item.row);

/** Texto de una celda PRO: 13 px, números tabulares; `strong` en la columna ordenada */
export const ProCellText: React.FC<{ children: React.ReactNode; strong?: boolean; muted?: boolean; color?: string; align?: TextStyle['textAlign'] }> = ({ children, strong, muted, color, align }) => (
    <Txt size={13} weight={strong ? 'extrabold' : 'semibold'} tone={muted ? 'muted' : 'ink'} color={color} tabular numberOfLines={1} style={align ? { textAlign: align } : undefined}>
        {children}
    </Txt>
);

const justify = (align: ProColumn<unknown>['align'], fallback: 'left' | 'right'): ViewStyle['alignItems'] => {
    const value = align ?? fallback;
    return value === 'left' ? 'flex-start' : value === 'center' ? 'center' : 'flex-end';
};

// Tabla PRO: primera columna fija, números tabulares a la derecha, columna ordenada resaltada con el acento al 10 %
// y filas de 40 px. Al ordenar, las filas se deslizan a su lugar nuevo (300 ms).
export function ProTable<Row>({
    columns,
    rows,
    rowKey,
    label,
    sort: sortProp,
    defaultSort = null,
    onSortChange,
    rowTone,
    onRowPress,
    rowLabel,
    after,
    afterHeight = 28,
    footer,
    dense = false,
    stagger = false,
    surface = 'surface',
    style
}: ProTableProps<Row>) {
    const { t } = useTranslation();
    const colors = useColors();
    const reorder = useReorder();
    const [ownSort, setOwnSort] = useState<ProSort | null>(defaultSort);
    const [tableWidth, setTableWidth] = useState(0);
    const [scroll, setScroll] = useState({ view: 0, content: 0, x: 0 });
    const sort = sortProp !== undefined ? sortProp : ownSort;
    const sortColumn = sort ? columns.find((column) => column.id === sort.id && column.sortValue) : undefined;
    const sorted = useMemo(() => (sortColumn?.sortValue && sort ? sortRows(rows, sortColumn.sortValue, sort.dir) : rows), [rows, sortColumn, sort]);

    const fixed = columns[0]?.sticky ? columns[0] : null;
    const moving = fixed ? columns.slice(1) : columns;
    const fixedWidth = fixed?.width ?? 120;
    const rowHeight = dense ? 36 : 40;
    const background = colors[surface];
    const toneColor = (tone: RowTone) => (tone === 'gold' ? colors.gold : tone === 'live' ? colors.live : tone === 'accent' ? colors.accent : null);
    const line = { borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08) };
    const more = scroll.content - scroll.view - scroll.x > 4;

    const toggle = (column: ProColumn<Row>) => {
        const first = column.firstDir ?? 'desc';
        const next: ProSort = sort?.id === column.id ? { id: column.id, dir: sort.dir === 'desc' ? 'asc' : 'desc' } : { id: column.id, dir: first };
        if (sortProp === undefined) setOwnSort(next);
        onSortChange?.(next);
    };

    const head = (column: ProColumn<Row>, index: number, fixedColumn: boolean) => {
        const active = sort?.id === column.id && !!column.sortValue;
        const width = column.width ?? (fixedColumn ? fixedWidth : 56);
        const box: ViewStyle = {
            height: 44,
            paddingHorizontal: 6,
            justifyContent: 'center',
            alignItems: justify(column.align, index === 0 ? 'left' : 'right'),
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            backgroundColor: active ? alpha(colors.accent, 0.1) : undefined,
            ...(fixedColumn ? { width } : { flexGrow: 1, flexBasis: width, minWidth: width })
        };
        const Icon = sort?.dir === 'asc' ? ArrowUp : ArrowDown;
        const text = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Txt size={10} weight="extrabold" color={active ? colors.accentInk : colors.muted} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {column.header}
                </Txt>
                {active && <Icon size={10} color={colors.accentInk} />}
            </View>
        );
        if (!column.sortValue)
            return (
                <View key={column.id} style={box} accessible accessibilityLabel={column.title ?? column.header}>
                    {text}
                </View>
            );
        return (
            <Pressable
                key={column.id}
                onPress={() => toggle(column)}
                accessibilityRole="button"
                accessibilityLabel={t('pro.kit.table.sortBy', { column: column.title ?? column.header })}
                accessibilityState={{ selected: active }}
                style={box}
            >
                {text}
            </Pressable>
        );
    };

    const cell = (column: ProColumn<Row>, row: Row, rowIndex: number, index: number, fixedColumn: boolean, tone: RowTone) => {
        const isSorted = sort?.id === column.id && !!column.sortValue;
        const width = column.width ?? (fixedColumn ? fixedWidth : 56);
        const tint = toneColor(tone);
        const box: ViewStyle = {
            height: rowHeight,
            paddingHorizontal: 6,
            justifyContent: 'center',
            alignItems: justify(column.align, index === 0 ? 'left' : 'right'),
            backgroundColor: isSorted ? alpha(colors.accent, 0.1) : undefined,
            ...(fixedColumn ? { width } : { flexGrow: 1, flexBasis: width, minWidth: width })
        };
        const content = column.cell(row, rowIndex, { sorted: isSorted });
        const shown = typeof content === 'string' || typeof content === 'number' ? <ProCellText strong={isSorted}>{content}</ProCellText> : content;
        if (fixedColumn && onRowPress)
            return (
                <Pressable key={column.id} onPress={() => onRowPress(row)} accessibilityRole="button" accessibilityLabel={rowLabel?.(row)} style={box}>
                    {tint && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: tint }} />}
                    {shown}
                </Pressable>
            );
        return (
            <View key={column.id} style={box}>
                {fixedColumn && tint && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: tint }} />}
                {shown}
            </View>
        );
    };

    // Una parte de la tabla (la fija o la que se desliza): encabezado, filas (con separadoras) y totales
    const part = (fixedPart: boolean) => {
        const list = fixedPart ? (fixed ? [fixed] : []) : moving;
        const offset = fixedPart ? 0 : fixed ? 1 : 0;
        return (
            <>
                <View style={{ flexDirection: 'row' }}>{list.map((column, index) => head(column, index + offset, fixedPart))}</View>
                {sorted.map((row, rowIndex) => {
                    const key = rowKey(row);
                    const tone = rowTone?.(row) ?? null;
                    const tint = toneColor(tone);
                    const extra = after?.(row, rowIndex);
                    // La columna fija tapa lo que se desliza por debajo: su fondo es opaco (mezcla del tono con la tarjeta)
                    const rowBackground = tint ? (fixedPart ? mix(background, tint, 0.12) : alpha(tint, 0.12)) : fixedPart ? background : undefined;
                    const cells = list.map((column, index) => cell(column, row, rowIndex, index + offset, fixedPart, tone));
                    const body = (
                        <View style={[{ flexDirection: 'row', backgroundColor: rowBackground }, line]}>
                            {!fixedPart && onRowPress ? (
                                // Toda la fila se toca; para el lector el botón es la primera celda y aquí se leen las cifras
                                <Pressable onPress={() => onRowPress(row)} accessible={false} style={{ flexDirection: 'row', flexGrow: 1 }}>
                                    {cells}
                                </Pressable>
                            ) : (
                                cells
                            )}
                        </View>
                    );
                    return (
                        <Animated.View key={key} layout={reorder}>
                            {stagger ? <Enter index={rowIndex}>{body}</Enter> : body}
                            {extra ? (
                                fixedPart ? (
                                    // La separadora va en la parte fija con el ancho de toda la tabla, encima de lo que se desliza
                                    <View style={{ height: afterHeight, width: tableWidth || undefined, zIndex: 3 }}>{extra}</View>
                                ) : (
                                    <View style={{ height: afterHeight }} />
                                )
                            ) : null}
                        </Animated.View>
                    );
                })}
                {footer && (
                    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.2), backgroundColor: fixedPart ? background : undefined }}>
                        {list.map((column, index) => {
                            const width = column.width ?? (fixedPart ? fixedWidth : 56);
                            const value = footer[column.id];
                            return (
                                <View
                                    key={column.id}
                                    style={[{ height: rowHeight, paddingHorizontal: 6, justifyContent: 'center', alignItems: justify(column.align, index + offset === 0 ? 'left' : 'right') }, fixedPart ? { width } : { flexGrow: 1, flexBasis: width, minWidth: width }]}
                                >
                                    {typeof value === 'string' || typeof value === 'number' ? <ProCellText strong>{value}</ProCellText> : (value ?? null)}
                                </View>
                            );
                        })}
                    </View>
                )}
            </>
        );
    };

    return (
        <View accessibilityLabel={label} onLayout={(event) => setTableWidth(event.nativeEvent.layout.width)} style={[{ flexDirection: 'row', minWidth: 0 }, style]}>
            {fixed && <View style={{ width: fixedWidth, zIndex: 2, backgroundColor: background }}>{part(true)}</View>}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
                scrollEventThrottle={32}
                onLayout={(event) => {
                    const view = event.nativeEvent.layout.width;
                    setScroll((current) => (current.view === view ? current : { ...current, view }));
                }}
                onContentSizeChange={(content) => setScroll((current) => (current.content === content ? current : { ...current, content }))}
                onScroll={(event) => {
                    const x = event.nativeEvent.contentOffset.x;
                    setScroll((current) => ({ ...current, x }));
                }}
            >
                <View style={{ flexGrow: 1 }}>{part(false)}</View>
            </ScrollView>
            {/* Sombra a la derecha mientras queden columnas por ver */}
            {more && <LinearGradient pointerEvents="none" colors={[alpha(background, 0), background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 24 }} />}
        </View>
    );
}
