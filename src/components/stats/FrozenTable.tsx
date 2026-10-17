// Tabla ancha con la primera columna fija y el resto con scroll de lado a lado (como `sticky left-0` de la web).
// Las dos partes usan el mismo alto de fila para que queden alineadas.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '../../theme/theme';
import { alpha } from '../../theme/tokens';
import { Card, Txt } from '../ui';

export interface FrozenColumn<R> {
    key: string;
    width: number;
    header: React.ReactNode;
    cell: (row: R, index: number) => React.ReactNode;
    /** Columna por la que se ordena: fondo de acento */
    active?: boolean;
    align?: 'left' | 'right';
    onHeaderPress?: () => void;
    onHeaderLongPress?: () => void;
    headerLabel?: string;
}

interface FrozenTableProps<R> {
    rows: R[];
    rowKey: (row: R, index: number) => string;
    first: { width: number; header: React.ReactNode; cell: (row: R, index: number) => React.ReactNode };
    columns: FrozenColumn<R>[];
    rowHeight: number;
    headerHeight?: number;
    onRowPress?: (row: R) => void;
    rowLabel?: (row: R) => string;
    /** Estilo extra de la fila completa (línea de corte, temporada actual) */
    rowStyle?: (row: R, index: number) => StyleProp<ViewStyle>;
    style?: StyleProp<ViewStyle>;
}

/** Texto de una celda: 13 px con números de ancho fijo */
export const CellText: React.FC<{ children: React.ReactNode; bold?: boolean; strong?: boolean; color?: string; tone?: 'muted' | 'ink' }> = ({ children, bold, strong, color, tone = 'ink' }) => (
    <Txt size={13} tabular weight={strong ? 'extrabold' : bold ? 'bold' : 'regular'} tone={tone} color={color} numberOfLines={1}>
        {children}
    </Txt>
);

/** Encabezado de columna: 11 px, mayúsculas, gris */
export const HeadText: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
    <Txt size={11} weight="bold" tone="muted" color={color} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {children}
    </Txt>
);

export function FrozenTable<R>({ rows, rowKey, first, columns, rowHeight, headerHeight = 36, onRowPress, rowLabel, rowStyle, style }: FrozenTableProps<R>) {
    const colors = useColors();
    const activeBg = alpha(colors.accent, 0.05);
    const activeHead = alpha(colors.accent, 0.1);
    const line = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line };
    // Sombra a la derecha mientras queden columnas por ver
    const [size, setSize] = useState({ view: 0, content: 0, x: 0 });
    const more = size.content - size.view - size.x > 4;

    const row = (item: R, index: number, content: React.ReactNode) => {
        const base = [{ height: rowHeight, flexDirection: 'row' as const, alignItems: 'stretch' as const }, index > 0 && line, rowStyle?.(item, index)];
        return onRowPress ? (
            <Pressable key={rowKey(item, index)} onPress={() => onRowPress(item)} accessibilityRole="button" accessibilityLabel={rowLabel?.(item)} style={({ pressed }) => [base, pressed && { backgroundColor: alpha(colors.raised, 0.6) }]}>
                {content}
            </Pressable>
        ) : (
            <View key={rowKey(item, index)} style={base}>
                {content}
            </View>
        );
    };

    const head = (column: FrozenColumn<R>) => {
        const box: ViewStyle = { width: column.width, height: headerHeight, paddingHorizontal: 8, justifyContent: 'center', alignItems: column.align === 'left' ? 'flex-start' : 'flex-end', backgroundColor: column.active ? activeHead : undefined };
        if (!column.onHeaderPress && !column.onHeaderLongPress) return <View key={column.key} style={box}>{column.header}</View>;
        return (
            <Pressable key={column.key} onPress={column.onHeaderPress} onLongPress={column.onHeaderLongPress} accessibilityRole="button" accessibilityLabel={column.headerLabel} accessibilityState={{ selected: !!column.active }} style={box}>
                {column.header}
            </Pressable>
        );
    };

    return (
        <Card padded={false} style={[{ overflow: 'hidden', flexDirection: 'row' }, style]}>
            {/* Columna fija */}
            <View style={{ width: first.width, backgroundColor: colors.surface, zIndex: 1 }}>
                <View style={{ height: headerHeight, justifyContent: 'center', paddingHorizontal: 12 }}>{first.header}</View>
                {rows.map((item, index) => row(item, index, <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 12 }}>{first.cell(item, index)}</View>))}
            </View>
            {/* El resto, de lado a lado */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
                scrollEventThrottle={32}
                onLayout={(event) => setSize((current) => ({ ...current, view: event.nativeEvent.layout.width }))}
                onContentSizeChange={(width) => setSize((current) => ({ ...current, content: width }))}
                onScroll={(event) => setSize((current) => ({ ...current, x: event.nativeEvent.contentOffset.x }))}
            >
                <View style={{ flexGrow: 1 }}>
                    <View style={{ flexDirection: 'row', height: headerHeight }}>{columns.map(head)}</View>
                    {rows.map((item, index) =>
                        row(
                            item,
                            index,
                            columns.map((column) => (
                                <View key={column.key} style={{ width: column.width, paddingHorizontal: 8, justifyContent: 'center', alignItems: column.align === 'left' ? 'flex-start' : 'flex-end', backgroundColor: column.active ? activeBg : undefined }}>
                                    {column.cell(item, index)}
                                </View>
                            ))
                        )
                    )}
                </View>
            </ScrollView>
            {more && <LinearGradient pointerEvents="none" colors={[alpha(colors.surface, 0), colors.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 28 }} />}
        </Card>
    );
}
