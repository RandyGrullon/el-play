import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { TeamLogo } from '../ui/TeamLogo';

export const LineScore: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const total = Math.max(game.scheduledInnings || 9, game.linescore.length);
    const innings = Array.from({ length: total }, (_, index) => game.linescore[index] || { n: index + 1, away: null, home: null });
    const current = game.state === 'live' ? game.inning?.n : null;

    const cell = (value: number | null, inning: number, side: 'away' | 'home') => {
        if (value !== null) return value;
        // Baja de la última entrada sin jugar porque el home club iba ganando
        if (game.state === 'final' && side === 'home' && inning === game.linescore.length) return 'x';
        return '';
    };

    return (
        <section className="card overflow-hidden" aria-label={t('lineScore.title')}>
            <div className="overflow-x-auto scrollbar-none">
                <table className="w-full min-w-[420px] text-center text-sm">
                    <thead>
                        <tr className="border-b border-line/10 text-[11px] text-faint">
                            <th className="sticky left-0 bg-surface px-3 py-2 text-left font-semibold">{t('lineScore.team')}</th>
                            {innings.map((inning) => (
                                <th key={inning.n} className={`num w-7 py-2 font-semibold ${inning.n === current ? 'text-accent-ink' : ''}`}>{inning.n}</th>
                            ))}
                            <th className="num w-9 border-l border-line/10 py-2 font-bold text-ink">{t('lineScore.runs')}</th>
                            <th className="num w-8 py-2 font-semibold">{t('lineScore.hits')}</th>
                            <th className="num w-8 py-2 pr-2 font-semibold">{t('lineScore.errors')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(['away', 'home'] as const).map((side) => {
                            const team = game[side];
                            return (
                                <tr key={side} className="border-b border-line/5 last:border-0">
                                    <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left">
                                        <span className="flex items-center gap-2">
                                            <TeamLogo team={team} size={20} />
                                            <span className="font-display text-base font-bold">{team.abbrev}</span>
                                        </span>
                                    </th>
                                    {innings.map((inning) => (
                                        <td key={inning.n} className={`num py-2 ${inning.n === current ? 'bg-accent/5 font-semibold' : 'text-muted'}`}>
                                            {cell(inning[side], inning.n, side)}
                                        </td>
                                    ))}
                                    <td className="num border-l border-line/10 py-2 font-display text-lg font-bold">{team.runs}</td>
                                    <td className="num py-2 text-muted">{team.hits}</td>
                                    <td className="num py-2 pr-2 text-muted">{team.errors}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
};
