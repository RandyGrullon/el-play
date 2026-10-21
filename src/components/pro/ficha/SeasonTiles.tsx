import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { STAT_COLUMNS, type PlayerDetail, type PlayerRow } from '../../../lib/stats';
import { useColors } from '../../../theme/theme';
import { radius } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { Delta, useProColors, type DeltaProps } from '../kit';
import { countRank, poolAverage } from '../estadisticas/logic';
import { rowOf } from './model';

interface SeasonTilesProps {
    player: PlayerDetail;
    /** Los calificados (o lanzadores con entradas suficientes) de la liga esa temporada */
    pool: PlayerRow[];
    /** Todos los peloteros de la liga (para «1.º en LIDOM») */
    all: PlayerRow[];
    league: string;
}

/**
 * Tile chico de la ficha (4 por fila a 390 px): cifra en Barlow, variación al lado y etiqueta de dos líneas sin cortar
 * palabras. Variante del StatTile del kit, que a este ancho partía «CARRE-RAS».
 */
export const FichaTile: React.FC<{ value: string; label: string; delta?: DeltaProps; sub?: string; style?: object }> = ({ value, label, delta, sub, style }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const spoken = delta && delta.value ? t(delta.value > 0 ? 'pro.kit.delta.up' : 'pro.kit.delta.down', { value: delta.display ?? String(Math.abs(delta.value)) }) : null;
    return (
        <View accessible accessibilityLabel={[value, label, spoken, sub].filter(Boolean).join(', ')} style={[{ minHeight: 84, minWidth: 0, alignItems: 'center', gap: 4, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 6, paddingVertical: 10 }, style]}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Txt condensed size={26} tabular style={{ lineHeight: 28 }}>
                    {value}
                </Txt>
                {delta && <Delta {...delta} />}
            </View>
            <Txt size={10} weight="extrabold" tone="muted" center style={{ textTransform: 'uppercase', letterSpacing: 0.4, lineHeight: 13 }}>
                {label}
            </Txt>
            {sub ? (
                <Txt size={10} weight="bold" color={pro.warn} center style={{ lineHeight: 13 }}>
                    {sub}
                </Txt>
            ) : null}
        </View>
    );
};

/** Tiles en filas de 4 (2 a menos de 340 px) */
export const TileRows: React.FC<{ children: React.ReactNode[] }> = ({ children }) => {
    const { width } = useWindowDimensions();
    const per = width < 340 ? 2 : 4;
    const rows: React.ReactNode[][] = [];
    for (let index = 0; index < children.length; index += per) rows.push(children.slice(index, index + per));
    return (
        <View style={{ gap: 8 }}>
            {rows.map((row, index) => (
                <View key={index} style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
                    {row.map((child, inner) => (
                        <View key={inner} style={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
                            {child}
                        </View>
                    ))}
                    {Array.from({ length: per - row.length }, (_, fill) => (
                        <View key={`fill-${fill}`} style={{ flex: 1, flexBasis: 0 }} />
                    ))}
                </View>
            ))}
        </View>
    );
};

// Cuatro cifras de la temporada con su flecha contra el promedio de los calificados y su puesto en la liga si es
// de los 3 primeros; debajo, el resto de la línea.
export const SeasonTiles: React.FC<SeasonTilesProps> = ({ player, pool, all, league }) => {
    const { t } = useTranslation();
    const row = rowOf(player);
    const pitcher = player.role === 'P';
    const p = player.pitching;
    const h = player.hitting;
    const reliever = !!p && p.gs * 2 < p.g;
    const keys = pitcher ? ['g', 'ip', 'k', reliever ? (p!.hld > p!.sv ? 'hld' : 'sv') : 'w'] : ['g', 'h', 'r', 'sb'];
    const columns = STAT_COLUMNS[player.role];
    const label = (key: string) => (key === 'r' ? t('pro.ficha.tiles.runs') : key === 'sb' ? t('pro.ficha.tiles.sb') : t(`pro.estadisticas.cols.${key}.long`));
    const others = all.filter((item) => item.role === player.role);

    const tiles = keys.map((key) => {
        const column = columns[key];
        const value = column.value(row);
        const average = pool.length ? poolAverage(pool, column) : null;
        const diff = value !== null && average !== null ? (key === 'ip' ? (value - average) / 3 : value - average) : null;
        const rank = others.length ? countRank(others.some((item) => item.id === player.id) ? others : [...others, row], player.id, column) : null;
        return {
            key,
            value: column.show(row),
            label: label(key),
            delta: diff !== null && Math.round(diff) !== 0 ? { value: Math.round(diff), display: String(Math.abs(Math.round(diff))) } : undefined,
            sub: rank !== null && rank <= 3 && key !== 'g' && key !== 'ip' ? t('pro.ficha.tiles.rank', { rank, league }) : undefined
        };
    });

    const line = pitcher
        ? p
            ? [t('pro.ficha.tiles.wl', { w: p.w, l: p.l }), `${p.era} ${t('pro.estadisticas.cols.era.short')}`, `${p.whip} WHIP`, `${p.bb} BB`, `${p.h} H`, `${p.hr} HR`, p.bf ? `${p.bf} ${t('pro.estadisticas.cols.bf.short')}` : null]
            : []
        : h
          ? [`${h.pa} ${t('pro.estadisticas.cols.pa.short')}`, `${h.d} 2B`, `${h.t} 3B`, `${h.hr} HR`, `${h.rbi} ${t('pro.estadisticas.cols.rbi.short')}`, `${h.bb} BB`, `${h.k} K`]
          : [];

    return (
        <View accessibilityLabel={t('statsPage.seasonStats')} style={{ gap: 8 }}>
            <TileRows>
                {tiles.map((tile) => (
                    <FichaTile key={tile.key} value={tile.value} label={tile.label} delta={tile.delta} sub={tile.sub} />
                ))}
            </TileRows>
            <Txt size={12} weight="semibold" tone="muted" center>
                {line.filter(Boolean).join(' · ')}
            </Txt>
            {pool.length > 0 && (
                <Txt size={11} tone="muted" center>
                    {t(pitcher ? 'pro.ficha.tiles.arrowsP' : 'pro.ficha.tiles.arrowsB', { count: pool.length })}
                </Txt>
            )}
        </View>
    );
};
