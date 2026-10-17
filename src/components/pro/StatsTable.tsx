import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { battingAdvanced, fmtDec, fmtPct, fmtRate, pitchingAdvanced } from '../../lib/advanced';
import { sortPlayers, type PlayerRow, type SortOption, type StatsTeam } from '../../lib/stats';
import { PlayerPhoto } from '../ui/PlayerPhoto';

// Estadísticas del modo PRO: la tabla completa con métricas avanzadas; se ordena tocando la columna.

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
    const columns = role === 'P' ? PITCHING : BATTING;
    const [sort, setSort] = useState<{ key: string; asc: boolean }>({ key: 'pts', asc: false });
    const column = columns.find((item) => item.key === sort.key) ?? columns[0];

    const sorted = useMemo(() => {
        const option: SortOption = { key: 'pts', value: column.value, show: column.show, rate: column.rate, asc: sort.asc };
        return sortPlayers(rows, option, teamGames);
    }, [rows, column, sort.asc, teamGames]);

    const toggle = (item: Column) => setSort((current) => (current.key === item.key ? { key: item.key, asc: !current.asc } : { key: item.key, asc: !!item.asc }));

    return (
        <div className="space-y-2 px-4">
            <div className="card overflow-x-auto">
                <table className="w-full whitespace-nowrap text-[13px] tabular-nums">
                    <thead>
                        <tr className="text-[11px] font-bold uppercase tracking-wide text-muted">
                            <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2.5 text-left">
                                {t('statsPage.labels.player')}
                            </th>
                            {columns.map((item) => {
                                const active = item.key === column.key;
                                return (
                                    <th key={item.key} scope="col" aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : 'none'} className={`px-2 py-2.5 text-right ${active ? 'bg-accent/10 text-accent-ink' : ''}`}>
                                        <button type="button" onClick={() => toggle(item)} className="font-bold uppercase" title={t(`pro.columns.${item.key}`)}>
                                            {t(`pro.short.${item.key}`)}
                                            {active ? (sort.asc ? ' ↑' : ' ↓') : ''}
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line/10">
                        {sorted.slice(0, limit).map(({ row, ranked }, index) => {
                            const team = row.teamId ? teams[row.teamId] : undefined;
                            // Toda la fila abre la ficha; el botón (teclado y lector) no deja subir su toque a la fila: una sola entrada en el historial
                            return (
                                <tr key={row.id} className="cursor-pointer hover:bg-raised/60" onClick={() => onOpen(row)}>
                                    <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-normal">
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onOpen(row);
                                            }}
                                            className="flex max-w-[150px] items-center gap-2 text-left"
                                            aria-label={t('statsPage.viewPlayer', { name: row.name })}
                                        >
                                            <span className="w-5 shrink-0 text-center text-xs font-extrabold text-muted">{ranked ? index + 1 : '·'}</span>
                                            <PlayerPhoto personId={row.id} name={row.name} size={28} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                                            <span className="min-w-0">
                                                <span className="block truncate text-[13px] font-extrabold">{row.name}</span>
                                                <span className="block truncate text-[11px] text-muted">{[team?.abbrev, row.pos].filter(Boolean).join(' · ')}</span>
                                            </span>
                                        </button>
                                    </th>
                                    {columns.map((item) => (
                                        <td key={item.key} className={`px-2 py-2 text-right ${item.key === column.key ? 'bg-accent/5 font-extrabold' : ''} ${item.key === 'pts' ? 'font-bold' : ''}`}>
                                            {item.show(row)}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {sorted.length > limit && (
                <button type="button" onClick={onMore} className="h-11 w-full rounded-full bg-surface text-sm font-bold shadow-card">
                    {t('statsPage.showMore', { count: sorted.length - limit })}
                </button>
            )}
            <p className="text-xs text-muted">{t('pro.tableNote')}</p>
        </div>
    );
};
