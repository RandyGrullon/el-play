import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LeagueId } from '../../../types';
import { normalize } from '../../../lib/stats';
import { useProFielding, type FieldingRow } from '../../../lib/pro/pantallas';
import { isPermanent } from '../../../lib/pro/http';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import type { ProPhaseId } from '../../../types/pro-liga';
import { ErrorState, Skeleton, TeamLogo, Txt, useErrorText } from '../../ui';
import { ChipButton, ChipRow, ModuleHeader, ProButton, ProTable, sortRows, type ProColumn, type ProSort } from '../kit';
import { tintOf } from '../StatsTable';
import { minFieldingOuts, standingsOf, type Standing } from './logic';
import { PercentileLegend } from './parts';

const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const PAGE = 10;
const MORE = 20;

interface FieldingPanelProps {
    league: LeagueId;
    season: number;
    phase: ProPhaseId;
    teamId: number | null;
    /** Búsqueda ya normalizada (resalta la fila) */
    search: string;
    names: Map<number, string>;
    /** Juegos del equipo que más ha jugado (la misma base de la regla de calificado de la tabla) */
    teamGames: number;
    onOpen: (row: { id: number; name: string; teamId: number | null }) => void;
}

type Key = 'a' | 'e' | 'fpct' | 'rf9' | 'dp' | 'csPct' | 'pb';
// Qué es mejor en cada cifra de defensa (para el percentil dentro de su posición)
const LOWER: Partial<Record<Key, boolean>> = { e: true, pb: true };
const valueOf = (row: FieldingRow, key: Key): number | null => (row[key] === null || row[key] === undefined ? null : Number(row[key]));
const show = (row: FieldingRow, key: Key) => {
    const value = valueOf(row, key);
    if (value === null) return '—';
    if (key === 'fpct') return value.toFixed(3).replace(/^0(?=\.)/, '');
    if (key === 'rf9') return value.toFixed(2);
    if (key === 'csPct') return `${Math.round(value * 100)}%`;
    return String(value);
};

// Defensa por posición (dato de MLB que la tabla de siempre no trae; no está en el diseño, va en su propio módulo):
// una fila por pelotero y posición con entradas, asistencias, errores, % de fildeo, factor de alcance y doble plays; en
// receptores, % de atrapados y passed balls. Las celdas se pintan por percentil contra los de su misma posición.
// Si el servidor no tiene la ruta, el módulo no sale.
export const FieldingPanel: React.FC<FieldingPanelProps> = ({ league, season, phase, teamId, search, names, teamGames: baseGames, onOpen }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const errorText = useErrorText();
    const [pos, setPos] = useState<string | null>(null);
    const [sort, setSort] = useState<ProSort | null>(null);
    const [limit, setLimit] = useState(PAGE);
    const query = useProFielding(league, season, phase);
    const data = query.data;
    const teamGames = useMemo(() => baseGames || Math.max(0, ...(data?.rows ?? []).map((row) => row.g)), [baseGames, data]);
    const pool = useMemo(() => (data?.rows ?? []).filter((row) => row.pos !== 'P' && row.outs >= minFieldingOuts(teamGames)), [data, teamGames]);
    const keys: Key[] = pos === 'C' ? ['a', 'e', 'fpct', 'csPct', 'pb'] : ['a', 'e', 'fpct', 'rf9', 'dp'];

    // Percentil de cada fila contra su misma posición
    const standings = useMemo(() => {
        const out = new Map<string, Standing>();
        for (const position of POSITIONS) {
            const group = pool.filter((row) => row.pos === position);
            for (const key of ['a', 'e', 'fpct', 'rf9', 'dp', 'csPct', 'pb'] as Key[]) {
                const items = group.flatMap((row) => {
                    const value = valueOf(row, key);
                    return value === null ? [] : [{ id: row.id, value, label: show(row, key) }];
                });
                standingsOf(items, !!LOWER[key]).forEach((standing, id) => out.set(`${position}|${key}|${id}`, standing));
            }
        }
        return out;
    }, [pool]);

    // Sin la ruta en el servidor (o sin defensa de MLB para esta fase) el módulo no sale
    if (isPermanent(query.error) || (data && !data.rows.length)) return null;

    const rows = pool.filter((row) => (teamId === null || row.teamId === teamId) && (pos === null || row.pos === pos));
    const columns: ProColumn<FieldingRow>[] = [
        {
            id: 'name',
            header: t('pro.estadisticas.table.player'),
            sticky: true,
            width: 112,
            align: 'left',
            cell: (row) => {
                const team = row.teamId ? data?.teams[row.teamId] : undefined;
                return (
                    <View style={{ minWidth: 0 }}>
                        <Txt size={13} weight="bold" numberOfLines={1} style={{ lineHeight: 16 }}>
                            {names.get(row.id) ?? row.name}
                        </Txt>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {team && <TeamLogo team={team} size={12} />}
                            <Txt size={11} tone="muted">
                                {team?.abbrev ?? ''}
                            </Txt>
                        </View>
                    </View>
                );
            },
            sortValue: (row) => row.name,
            firstDir: 'asc'
        },
        { id: 'pos', header: t('pro.estadisticas.fielding.cols.pos.short'), title: t('pro.estadisticas.fielding.cols.pos.long'), cell: (row) => row.pos, sortValue: (row) => POSITIONS.indexOf(row.pos), firstDir: 'asc', align: 'center', width: 48 },
        { id: 'inn', header: t('pro.estadisticas.fielding.cols.inn.short'), title: t('pro.estadisticas.fielding.cols.inn.long'), cell: (row) => row.inn ?? '—', sortValue: (row) => row.outs, width: 60 },
        ...keys.map(
            (key): ProColumn<FieldingRow> => ({
                id: key,
                header: t(`pro.estadisticas.fielding.cols.${key}.short`),
                title: t(`pro.estadisticas.fielding.cols.${key}.long`),
                width: 56,
                cell: (row) => (
                    <View style={{ borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, minWidth: 34, alignItems: 'flex-end', backgroundColor: tintOf(standings.get(`${row.pos}|${key}|${row.id}`)?.pct, colors.line) }}>
                        <Txt size={13} weight="bold" tabular>
                            {show(row, key)}
                        </Txt>
                    </View>
                ),
                sortValue: (row) => valueOf(row, key),
                firstDir: LOWER[key] ? 'asc' : 'desc'
            })
        )
    ];

    // Orden controlado: se ordena todo el grupo y se muestran los 10 primeros (y de 20 en 20 más)
    const activeSort: ProSort = sort ?? (pos ? { id: 'fpct', dir: 'desc' } : { id: 'inn', dir: 'desc' });
    const sortColumn = columns.find((column) => column.id === activeSort.id) ?? columns[2];
    const sorted = sortColumn.sortValue ? sortRows(rows, sortColumn.sortValue, activeSort.dir) : rows;
    const shown = sorted.slice(0, limit);
    const choosePos = (next: string | null) => {
        setPos(next);
        setSort(null);
        setLimit(PAGE);
    };

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.estadisticas.fielding.title')} />
            {query.isPending ? (
                <Skeleton height={360} />
            ) : query.isError && !data ? (
                <ErrorState message={errorText(query.error)} onRetry={() => query.refetch()} />
            ) : (
                <>
                    <ChipRow label={t('pro.estadisticas.fielding.posFilter')}>
                        <ChipButton active={pos === null} onPress={() => choosePos(null)}>
                            {t('pro.estadisticas.fielding.allPositions')}
                        </ChipButton>
                        {POSITIONS.map((item) => (
                            <ChipButton key={item} active={pos === item} onPress={() => choosePos(pos === item ? null : item)} accessibilityLabel={t(`pro.estadisticas.fielding.positions.${item}`)}>
                                {item}
                            </ChipButton>
                        ))}
                    </ChipRow>
                    <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), overflow: 'hidden' }, shadow('card')]}>
                        {rows.length ? (
                            <ProTable
                                key={pos ?? 'todas'}
                                columns={columns}
                                rows={shown}
                                rowKey={(row) => `${row.id}-${row.pos}`}
                                label={t('pro.estadisticas.fielding.caption', { pos: pos ? t(`pro.estadisticas.fielding.positions.${pos}`) : t('pro.estadisticas.fielding.allPositions') })}
                                sort={activeSort}
                                onSortChange={(next) => {
                                    setSort(next);
                                    setLimit(PAGE);
                                }}
                                rowTone={(row) => (search.length >= 2 && normalize(row.name).includes(search) ? 'accent' : null)}
                                onRowPress={(row) => onOpen({ id: row.id, name: row.name, teamId: row.teamId })}
                                rowLabel={(row) => t('statsPage.viewPlayer', { name: row.name })}
                                stagger
                            />
                        ) : (
                            <Txt size={14} tone="muted" center style={{ paddingHorizontal: 16, paddingVertical: 32 }}>
                                {data?.rows.length ? t('pro.estadisticas.fielding.emptyFilter') : t('pro.estadisticas.fielding.empty')}
                            </Txt>
                        )}
                        <View style={{ gap: 12, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08), padding: 12 }}>
                            <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                                {t('pro.estadisticas.fielding.note', { inn: Math.round(minFieldingOuts(teamGames) / 3) })}
                            </Txt>
                            <PercentileLegend />
                            {sorted.length > limit ? (
                                <ProButton block label={t('pro.estadisticas.fielding.more', { count: Math.min(MORE, sorted.length - limit), total: sorted.length })} onPress={() => setLimit((now) => now + MORE)} />
                            ) : sorted.length > PAGE ? (
                                <ProButton block label={t('pro.estadisticas.table.less')} onPress={() => setLimit(PAGE)} />
                            ) : null}
                        </View>
                    </View>
                </>
            )}
        </View>
    );
};
