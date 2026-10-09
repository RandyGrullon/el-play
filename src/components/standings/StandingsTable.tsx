import React from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import type { StandingRow } from '../../types';
import { usePreferences } from '../../store/preferences';
import { TeamLogo } from '../ui/TeamLogo';
import { teamDisplayName } from '../../lib/teams';

interface StandingsTableProps {
    rows: StandingRow[];
    title?: string;
    /** Marca con una línea a los que clasifican (p. ej. 4 al Round Robin, 2 a la final) */
    cutoff?: number;
    compact?: boolean;
}

export const StandingsTable: React.FC<StandingsTableProps> = ({ rows, title, cutoff, compact = false }) => {
    const { t, i18n } = useTranslation();
    const { favoriteTeamId, toggleFavoriteTeam } = usePreferences();
    // El Clásico no trae racha ni últimos 10: esas columnas se ocultan si nadie las tiene
    const showLastTen = !compact && rows.some((row) => row.lastTen);
    const showStreak = !compact && rows.some((row) => row.streak && row.streak !== '-');

    if (!rows.length) return <p className="px-4 py-8 text-center text-sm text-muted">{t('standings.noData')}</p>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                {title && <caption className="eyebrow px-4 pb-2 pt-3 text-left">{title}</caption>}
                <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-faint">
                        <th className="w-8 py-2 pl-4 text-left font-semibold">#</th>
                        <th className="py-2 text-left font-semibold">{t('standings.team')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{t('standings.w')}</th>
                        <th className="px-2 py-2 text-right font-semibold">{t('standings.l')}</th>
                        {!compact && <th className="px-2 py-2 text-right font-semibold">{t('standings.pct')}</th>}
                        <th className="px-2 py-2 text-right font-semibold">{t('standings.gb')}</th>
                        {showLastTen && <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">{t('standings.last10')}</th>}
                        {showStreak && <th className="px-2 py-2 pr-4 text-right font-semibold">{t('standings.streak')}</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => {
                        const favorite = favoriteTeamId === row.team.id;
                        return (
                            <tr key={row.team.id} className={`border-t ${cutoff && index === cutoff ? 'border-dashed border-line/30' : 'border-line/10'} ${favorite ? 'bg-gold/5' : ''}`}>
                                <td className="num py-2.5 pl-4 text-muted">{row.rank}</td>
                                <td className="py-2.5">
                                    <span className="flex items-center gap-2.5">
                                        <TeamLogo team={row.team} size={24} />
                                        <span className="min-w-0">
                                            <span className="block truncate font-semibold">
                                                {compact ? (
                                                    row.team.shortName
                                                ) : (
                                                    <>
                                                        <span className="sm:hidden">{row.team.abbrev}</span>
                                                        <span className="hidden sm:inline">{teamDisplayName(row.team, i18n.language)}</span>
                                                    </>
                                                )}
                                            </span>
                                        </span>
                                        {!compact && (
                                            <button
                                                type="button"
                                                onClick={() => toggleFavoriteTeam(row.team.id)}
                                                className={`rounded p-0.5 ${favorite ? 'text-gold' : 'text-faint/60 hover:text-muted'}`}
                                                aria-pressed={favorite}
                                                aria-label={favorite ? t('teams.removeFavorite', { name: row.team.name }) : t('teams.addFavorite', { name: row.team.name })}
                                            >
                                                <Star className={`h-3.5 w-3.5 ${favorite ? 'fill-current' : ''}`} />
                                            </button>
                                        )}
                                    </span>
                                </td>
                                <td className="num px-2 text-right font-semibold">{row.wins}</td>
                                <td className="num px-2 text-right">{row.losses}</td>
                                {!compact && <td className="num px-2 text-right text-muted">{row.pct}</td>}
                                <td className={`num px-2 text-right text-muted ${compact || !showStreak ? 'pr-4' : ''}`}>{row.gamesBack}</td>
                                {showLastTen && <td className="num hidden px-2 text-right text-muted sm:table-cell">{row.lastTen ? `${row.lastTen.wins}-${row.lastTen.losses}` : '—'}</td>}
                                {showStreak && (
                                    <td className={`num px-2 pr-4 text-right font-semibold ${row.streak.startsWith('W') ? 'text-ball' : row.streak.startsWith('L') ? 'text-strike' : 'text-muted'}`}>
                                        {streakLabel(row.streak, t)}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const streakLabel = (code: string, t: (key: string) => string) => {
    const match = code.match(/^([WL])(\d+)$/);
    if (!match) return code;
    return `${match[1] === 'W' ? t('standings.wonShort') : t('standings.lostShort')}${match[2]}`;
};
