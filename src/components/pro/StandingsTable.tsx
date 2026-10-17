import React from 'react';
import { useTranslation } from 'react-i18next';
import type { StandingRow } from '../../types';
import { pythagorean } from '../../lib/advanced';
import { teamDisplayName } from '../../lib/teams';
import { TeamLogo } from '../ui/TeamLogo';

// Posiciones del modo PRO: carreras anotadas y permitidas, diferencia, récord esperado (Pitágoras),
// casa/visita, juegos de una carrera, extra innings, últimos 10 y racha.

const record = (split: { wins: number; losses: number } | null | undefined) => (split ? `${split.wins}-${split.losses}` : '—');

export const StandingsTable: React.FC<{ rows: StandingRow[]; cutoff?: number }> = ({ rows, cutoff }) => {
    const { t, i18n } = useTranslation();
    if (!rows.length) return <p className="card px-4 py-8 text-center text-sm text-muted">{t('standings.noData')}</p>;
    const heads = ['w', 'l', 'pct', 'gb', 'rs', 'ra', 'diff', 'expected', 'home', 'away', 'oneRun', 'extra', 'last10', 'streak'];

    return (
        <div className="card overflow-x-auto">
            <table className="w-full whitespace-nowrap text-[13px] tabular-nums">
                <thead>
                    <tr className="text-[11px] font-bold uppercase tracking-wide text-muted">
                        <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2.5 text-left">
                            {t('pro.standings.team')}
                        </th>
                        {heads.map((key) => (
                            <th key={key} scope="col" className="px-2 py-2.5 text-right" title={t(`pro.standings.long.${key}`)}>
                                {t(`pro.standings.${key}`)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-line/10">
                    {rows.map((row, index) => {
                        const diff = row.runsScored != null && row.runsAllowed != null ? row.runsScored - row.runsAllowed : null;
                        const expected = pythagorean(row.runsScored, row.runsAllowed, row.wins + row.losses);
                        const luck = expected ? row.wins - expected.wins : null;
                        return (
                            <tr key={row.team.id} className={cutoff !== undefined && index === cutoff ? 'border-t-2 border-accent/40' : ''}>
                                <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-normal">
                                    <span className="flex items-center gap-2">
                                        <span className="w-4 text-center text-xs font-extrabold text-muted">{row.rank}</span>
                                        <TeamLogo team={row.team} size={22} />
                                        <span className="max-w-[110px] truncate font-extrabold">{teamDisplayName(row.team, i18n.language)}</span>
                                    </span>
                                </th>
                                <td className="px-2 py-2 text-right font-bold">{row.wins}</td>
                                <td className="px-2 py-2 text-right font-bold">{row.losses}</td>
                                <td className="px-2 py-2 text-right">{row.pct}</td>
                                <td className="px-2 py-2 text-right text-muted">{row.gamesBack === '-' ? '—' : row.gamesBack}</td>
                                <td className="px-2 py-2 text-right">{row.runsScored ?? '—'}</td>
                                <td className="px-2 py-2 text-right">{row.runsAllowed ?? '—'}</td>
                                <td className={`px-2 py-2 text-right font-bold ${diff === null ? '' : diff > 0 ? 'text-ball' : diff < 0 ? 'text-live' : ''}`}>{diff === null ? '—' : diff > 0 ? `+${diff}` : diff}</td>
                                <td className="px-2 py-2 text-right" title={luck !== null ? t('pro.standings.luck', { n: luck > 0 ? `+${luck}` : luck }) : undefined}>
                                    {expected ? `${expected.wins}-${expected.losses}` : '—'}
                                </td>
                                <td className="px-2 py-2 text-right">{record(row.home)}</td>
                                <td className="px-2 py-2 text-right">{record(row.away)}</td>
                                <td className="px-2 py-2 text-right">{record(row.oneRun)}</td>
                                <td className="px-2 py-2 text-right">{record(row.extraInning)}</td>
                                <td className="px-2 py-2 text-right">{record(row.lastTen)}</td>
                                <td className="px-2 py-2 text-right font-bold">{row.streak === '-' ? '—' : row.streak}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
