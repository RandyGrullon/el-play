import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Decision, GameDetail, TopPerformer } from '../../types';
import { TeamLogo } from '../ui/TeamLogo';
import { LineScore } from './LineScore';
import { PlayByPlay } from './PlayByPlay';

// Pestaña "Resumen" de un juego terminado
export const Summary: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const { winner, loser, save } = game.decisions;
    const teamOf = (teamId: number) => (game.home.id === teamId ? game.home : game.away);

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
                <LineScore game={game} />

                {(winner || loser) && (
                    <section className="card p-4" aria-label={t('summary.decisions')}>
                        <h2 className="eyebrow mb-3">{t('summary.decisions')}</h2>
                        <ul className="space-y-2.5">
                            <DecisionRow tag={t('summary.win')} tone="bg-ball text-white" decision={winner} />
                            <DecisionRow tag={t('summary.loss')} tone="bg-strike text-white" decision={loser} />
                            {save && <DecisionRow tag={t('summary.save')} tone="bg-inplay text-white" decision={save} isSave />}
                        </ul>
                    </section>
                )}

                {game.topPerformers.length > 0 && (
                    <section className="card p-4" aria-label={t('summary.topPerformers')}>
                        <h2 className="eyebrow mb-3">{t('summary.topPerformers')}</h2>
                        <ul className="divide-y divide-line/10">
                            {game.topPerformers.map((player) => (
                                <li key={`${player.kind}-${player.id}`} className="flex items-center gap-3 py-2.5">
                                    <TeamLogo team={teamOf(player.teamId)} size={28} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-semibold">{player.name}</span>
                                        <span className="block text-xs text-muted">{performerLine(player, t)}</span>
                                    </span>
                                    <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-muted">
                                        {player.kind === 'pitcher' ? t('game.pitcher') : t('game.batter')}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>

            <div className="space-y-4">
                <section className="card overflow-hidden" aria-label={t('summary.scoringPlays')}>
                    <h2 className="eyebrow border-b border-line/10 px-4 py-3">{t('summary.scoringPlays')}</h2>
                    {game.atBats.some((atBat) => atBat.scoring) ? (
                        <PlayByPlay game={{ ...game, atBats: game.atBats.filter((atBat) => atBat.scoring) }} compact />
                    ) : (
                        <p className="px-4 py-8 text-center text-sm text-muted">{t('plays.noScoring')}</p>
                    )}
                </section>
            </div>
        </div>
    );
};

const DecisionRow: React.FC<{ tag: string; tone: string; decision: Decision | null; isSave?: boolean }> = ({ tag, tone, decision, isSave }) => {
    const { t } = useTranslation();
    if (!decision) return null;
    const record = isSave
        ? decision.saves !== null && decision.saves !== undefined ? t('summary.saves', { count: decision.saves }) : ''
        : decision.wins !== null ? `${decision.wins}-${decision.losses ?? 0}` : '';
    return (
        <li className="flex items-center gap-3">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${tone}`}>{tag}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{decision.name}</span>
            <span className="num text-sm text-muted">
                {record}
                {decision.era ? ` · ${t('stats.era')} ${decision.era}` : ''}
            </span>
        </li>
    );
};

const performerLine = (player: TopPerformer, t: (key: string, options?: Record<string, unknown>) => string) => {
    if (player.kind === 'pitcher') {
        return [`${player.ip} ${t('stats.ip')}`, `${player.k} ${t('stats.k')}`, `${player.er} ${t('stats.er')}`, `${player.h} ${t('stats.h')}`].join(', ');
    }
    const parts = [`${player.h}-${player.ab}`];
    if (player.hr) parts.push(`${player.hr} ${t('stats.hr')}`);
    if (player.rbi) parts.push(`${player.rbi} ${t('stats.rbi')}`);
    if (player.r) parts.push(`${player.r} ${t('stats.r')}`);
    if (player.bb) parts.push(`${player.bb} ${t('stats.bb')}`);
    return parts.join(', ');
};
