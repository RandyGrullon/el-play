import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { PlayerLink } from '../ui/PlayerLink';
import { withNodes } from '../ui/TextLinks';
import { slot } from '../../lib/links';
import { usePlayer } from '../../lib/stats';
import { gamesBefore, recentHitting } from '../../lib/recentGames';

/** Hits-turnos del bateador en sus últimos 8 juegos antes de hoy («2-22»); de su perfil, que ya viene en caché si lo abriste */
const useRecentLine = (batterId: number | null | undefined, game: GameDetail) => {
    const { data: player } = usePlayer(batterId ?? null, game.league);
    if (!player || player.id !== batterId) return null;
    const line = recentHitting(gamesBefore(player.log, game.gamePk));
    return line.games ? line : null;
};

// Lanzador contra bateador con su línea del día
export const Matchup: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const matchup = game.matchup;
    const recent = useRecentLine(matchup?.batter.id, game);
    if (!matchup) return null;
    const { pitcher, batter } = matchup;
    const hand = (code: string | null, kind: 'throws' | 'bats') => (code ? t(`game.${kind}${code}`, { defaultValue: code }) : '');

    return (
        <section className="card grid grid-cols-2 divide-x divide-line/10" aria-label={t('game.matchup')}>
            <div className="p-4">
                <p className="eyebrow">{t('game.pitcher')}</p>
                <PlayerLink id={pitcher.id} className="mt-1 block truncate font-semibold">{pitcher.name}</PlayerLink>
                <p className="text-xs text-muted">{hand(pitcher.hand, 'throws')}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Stat label={t('game.pitchCount')} value={pitcher.pitches} />
                    <Stat label={t('stats.ip')} value={pitcher.ip} />
                    <Stat label={t('stats.k')} value={pitcher.k} />
                </dl>
                {pitcher.era && <p className="mt-2 text-[11px] text-faint">{t('game.seasonEra', { era: pitcher.era })}</p>}
            </div>
            <div className="p-4">
                <p className="eyebrow">{t('game.batter')}</p>
                <PlayerLink id={batter.id} className="mt-1 block truncate font-semibold">{batter.name}</PlayerLink>
                <p className="text-xs text-muted">{hand(batter.side, 'bats')}</p>
                <dl className={`mt-3 grid gap-2 text-center ${recent ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <Stat label={t('game.today')} value={batter.ab !== null ? `${batter.h ?? 0}-${batter.ab}` : null} />
                    {recent && (
                        <Stat
                            label={t('game.lastGames', { count: recent.games })}
                            value={`${recent.h}-${recent.ab}`}
                            title={`${t('statsPage.recentTotal', { count: recent.games })}: ${t('statsPage.recentAb', { count: recent.ab })} · ${t('statsPage.recentHits', { count: recent.h })}`}
                        />
                    )}
                    <Stat label={t('stats.avg')} value={batter.avg} />
                </dl>
                {matchup.onDeck && (
                    <p className="mt-2 truncate text-[11px] text-faint">
                        {withNodes(t('game.onDeck', { name: slot('name') }), { name: <PlayerLink id={matchup.onDeck.id}>{matchup.onDeck.name}</PlayerLink> })}
                    </p>
                )}
            </div>
        </section>
    );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; title?: string }> = ({ label, value, title }) => (
    <div className="rounded-lg bg-raised px-1 py-1.5" title={title}>
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
        <dd className="num font-display text-lg font-bold leading-tight">{value ?? '—'}</dd>
    </div>
);
