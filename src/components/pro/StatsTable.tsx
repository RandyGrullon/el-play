import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { battingAdvanced, fmtDec, fmtPct, fmtRate, pitchingAdvanced } from '../../lib/advanced';
import { sortPlayers, type PlayerRow, type SortOption, type StatsTeam } from '../../lib/stats';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { PlayerPhoto, Row, Txt } from '../ui';
import { CellText, FrozenTable, HeadText, type FrozenColumn } from '../stats/FrozenTable';
import { MoreButton } from '../stats/common';

// Estadísticas del modo PRO: la tabla completa con métricas avanzadas; se ordena tocando la columna
// (dejarla apretada dice qué es).

interface Column {
    key: string;
    value: (row: PlayerRow) => number | null;
    show: (row: PlayerRow) => string;
    /** Promedios: solo cuentan quienes tienen turnos o entradas suficientes */
    rate?: boolean;
    /** Menos es mejor (EFE, WHIP, FIP…) */
    asc?: boolean;
}

const n = (value: number | undefined | null) => (typeof value === 'number' ? value : null);
const num = (text: string | undefined) => {
    const parsed = parseFloat(String(text ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
};
const int = (value: number | undefined | null) => (typeof value === 'number' ? String(value) : '—');
const fixed = (value: number) => String(Math.round(value * 10) / 10);

const BATTING: Column[] = [
    { key: 'pts', value: (r) => r.pts, show: (r) => fixed(r.pts) },
    { key: 'ppg', value: (r) => (r.g ? r.ppg : null), show: (r) => fixed(r.ppg) },
    { key: 'g', value: (r) => n(r.hitting?.g), show: (r) => int(r.hitting?.g) },
    { key: 'pa', value: (r) => n(r.hitting?.pa), show: (r) => int(r.hitting?.pa) },
    { key: 'ab', value: (r) => n(r.hitting?.ab), show: (r) => int(r.hitting?.ab) },
    { key: 'h', value: (r) => n(r.hitting?.h), show: (r) => int(r.hitting?.h) },
    { key: 'd', value: (r) => n(r.hitting?.d), show: (r) => int(r.hitting?.d) },
    { key: 't', value: (r) => n(r.hitting?.t), show: (r) => int(r.hitting?.t) },
    { key: 'hr', value: (r) => n(r.hitting?.hr), show: (r) => int(r.hitting?.hr) },
    { key: 'rbi', value: (r) => n(r.hitting?.rbi), show: (r) => int(r.hitting?.rbi) },
    { key: 'r', value: (r) => n(r.hitting?.r), show: (r) => int(r.hitting?.r) },
    { key: 'bb', value: (r) => n(r.hitting?.bb), show: (r) => int(r.hitting?.bb) },
    { key: 'k', value: (r) => n(r.hitting?.k), show: (r) => int(r.hitting?.k), asc: true },
    { key: 'sb', value: (r) => n(r.hitting?.sb), show: (r) => int(r.hitting?.sb) },
    { key: 'avg', value: (r) => num(r.hitting?.avg), show: (r) => r.hitting?.avg ?? '—', rate: true },
    { key: 'obp', value: (r) => num(r.hitting?.obp), show: (r) => r.hitting?.obp ?? '—', rate: true },
    { key: 'slg', value: (r) => num(r.hitting?.slg), show: (r) => r.hitting?.slg ?? '—', rate: true },
    { key: 'ops', value: (r) => num(r.hitting?.ops), show: (r) => r.hitting?.ops ?? '—', rate: true },
    { key: 'iso', value: (r) => (r.hitting ? battingAdvanced(r.hitting).iso : null), show: (r) => (r.hitting ? fmtRate(battingAdvanced(r.hitting).iso) : '—'), rate: true },
    { key: 'babip', value: (r) => (r.hitting ? battingAdvanced(r.hitting).babip : null), show: (r) => (r.hitting ? fmtRate(battingAdvanced(r.hitting).babip) : '—'), rate: true },
    { key: 'kPct', value: (r) => (r.hitting ? battingAdvanced(r.hitting).kPct : null), show: (r) => (r.hitting ? fmtPct(battingAdvanced(r.hitting).kPct) : '—'), rate: true, asc: true },
    { key: 'bbPct', value: (r) => (r.hitting ? battingAdvanced(r.hitting).bbPct : null), show: (r) => (r.hitting ? fmtPct(battingAdvanced(r.hitting).bbPct) : '—'), rate: true }
];

const PITCHING: Column[] = [
    { key: 'pts', value: (r) => r.pts, show: (r) => fixed(r.pts) },
    { key: 'ppg', value: (r) => (r.g ? r.ppg : null), show: (r) => fixed(r.ppg) },
    { key: 'g', value: (r) => n(r.pitching?.g), show: (r) => int(r.pitching?.g) },
    { key: 'gs', value: (r) => n(r.pitching?.gs), show: (r) => int(r.pitching?.gs) },
    { key: 'ip', value: (r) => n(r.pitching?.outs), show: (r) => r.pitching?.ip ?? '—' },
    { key: 'w', value: (r) => n(r.pitching?.w), show: (r) => int(r.pitching?.w) },
    { key: 'l', value: (r) => n(r.pitching?.l), show: (r) => int(r.pitching?.l), asc: true },
    { key: 'sv', value: (r) => n(r.pitching?.sv), show: (r) => int(r.pitching?.sv) },
    { key: 'k', value: (r) => n(r.pitching?.k), show: (r) => int(r.pitching?.k) },
    { key: 'bb', value: (r) => n(r.pitching?.bb), show: (r) => int(r.pitching?.bb), asc: true },
    { key: 'h', value: (r) => n(r.pitching?.h), show: (r) => int(r.pitching?.h), asc: true },
    { key: 'hr', value: (r) => n(r.pitching?.hr), show: (r) => int(r.pitching?.hr), asc: true },
    { key: 'era', value: (r) => num(r.pitching?.era), show: (r) => r.pitching?.era ?? '—', rate: true, asc: true },
    { key: 'whip', value: (r) => num(r.pitching?.whip), show: (r) => r.pitching?.whip ?? '—', rate: true, asc: true },
    { key: 'k9', value: (r) => (r.pitching ? pitchingAdvanced(r.pitching).k9 : null), show: (r) => (r.pitching ? fmtDec(pitchingAdvanced(r.pitching).k9) : '—'), rate: true },
    { key: 'bb9', value: (r) => (r.pitching ? pitchingAdvanced(r.pitching).bb9 : null), show: (r) => (r.pitching ? fmtDec(pitchingAdvanced(r.pitching).bb9) : '—'), rate: true, asc: true },
    { key: 'kBb', value: (r) => (r.pitching ? pitchingAdvanced(r.pitching).kBb : null), show: (r) => (r.pitching ? fmtDec(pitchingAdvanced(r.pitching).kBb) : '—'), rate: true },
    { key: 'fip', value: (r) => (r.pitching ? pitchingAdvanced(r.pitching).fip : null), show: (r) => (r.pitching ? fmtDec(pitchingAdvanced(r.pitching).fip) : '—'), rate: true, asc: true },
    { key: 'kPct', value: (r) => (r.pitching ? pitchingAdvanced(r.pitching).kPct : null), show: (r) => (r.pitching ? fmtPct(pitchingAdvanced(r.pitching).kPct) : '—'), rate: true }
];

/** Ancho de columna según el largo del encabezado (con espacio para la flecha) */
const widthFor = (label: string, key: string) => Math.max(['avg', 'obp', 'slg', 'ops', 'iso', 'babip', 'kPct', 'bbPct', 'era', 'whip', 'fip'].includes(key) ? 56 : 44, Math.round(label.length * 8 + 30));

export const StatsTable: React.FC<{
    rows: PlayerRow[];
    role: 'B' | 'P';
    teams: Record<string, StatsTeam>;
    teamGames: number;
    limit: number;
    onOpen: (row: PlayerRow) => void;
    onMore: () => void;
}> = ({ rows, role, teams, teamGames, limit, onOpen, onMore }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const columns = role === 'P' ? PITCHING : BATTING;
    const [sort, setSort] = useState<{ key: string; asc: boolean }>({ key: 'pts', asc: false });
    const column = columns.find((item) => item.key === sort.key) ?? columns[0];

    const sorted = useMemo(() => {
        const option: SortOption = { key: 'pts', value: column.value, show: column.show, rate: column.rate, asc: sort.asc };
        return sortPlayers(rows, option, teamGames);
    }, [rows, column, sort.asc, teamGames]);

    const toggle = (item: Column) => setSort((current) => (current.key === item.key ? { key: item.key, asc: !current.asc } : { key: item.key, asc: !!item.asc }));

    const tableColumns: FrozenColumn<(typeof sorted)[number]>[] = columns.map((item) => {
        const active = item.key === column.key;
        const label = t(`pro.short.${item.key}`);
        return {
            key: item.key,
            width: widthFor(label, item.key),
            active,
            header: <HeadText color={active ? colors.accentInk : undefined}>{`${label}${active ? (sort.asc ? ' ↑' : ' ↓') : ''}`}</HeadText>,
            headerLabel: t(`pro.columns.${item.key}`, { defaultValue: label }),
            onHeaderPress: () => toggle(item),
            onHeaderLongPress: () => showToast(`${label}: ${t(`pro.columns.${item.key}`, { defaultValue: label })}`, undefined, 3000),
            cell: ({ row }) => <CellText strong={active} bold={item.key === 'pts'}>{item.show(row)}</CellText>
        };
    });

    return (
        <View style={{ gap: 8 }}>
            <FrozenTable
                rows={sorted.slice(0, limit)}
                rowKey={({ row }) => String(row.id)}
                rowHeight={48}
                onRowPress={({ row }) => onOpen(row)}
                rowLabel={({ row }) => t('statsPage.viewPlayer', { name: row.name })}
                first={{
                    width: 172,
                    header: <HeadText>{t('statsPage.labels.player')}</HeadText>,
                    cell: ({ row, ranked }, index) => {
                        const team = row.teamId ? teams[row.teamId] : undefined;
                        return (
                            <Row gap={8}>
                                <Txt size={12} weight="extrabold" tone="muted" center style={{ width: 20 }}>
                                    {ranked ? index + 1 : '·'}
                                </Txt>
                                <PlayerPhoto personId={row.id} name={row.name} size={28} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Txt size={13} weight="extrabold" numberOfLines={1}>
                                        {row.name}
                                    </Txt>
                                    <Txt size={11} tone="muted" numberOfLines={1}>
                                        {[team?.abbrev, row.pos].filter(Boolean).join(' · ')}
                                    </Txt>
                                </View>
                            </Row>
                        );
                    }
                }}
                columns={tableColumns}
            />
            {sorted.length > limit && <MoreButton label={t('statsPage.showMore', { count: sorted.length - limit })} onPress={onMore} />}
            <Txt size={12} tone="muted">
                {t('pro.tableNote')}
            </Txt>
        </View>
    );
};
