import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';

// Lanzador contra bateador con su línea del día
export const Matchup: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const matchup = game.matchup;
    if (!matchup) return null;
    const { pitcher, batter } = matchup;
    const hand = (code: string | null, kind: 'throws' | 'bats') => (code ? t(`game.${kind}${code}`, { defaultValue: code }) : '');

    return (
        <section className="card grid grid-cols-2 divide-x divide-line/10" aria-label={t('game.matchup')}>
            <div className="p-4">
                <p className="eyebrow">{t('game.pitcher')}</p>
                <p className="mt-1 truncate font-semibold">{pitcher.name}</p>
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
                <p className="mt-1 truncate font-semibold">{batter.name}</p>
                <p className="text-xs text-muted">{hand(batter.side, 'bats')}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <Stat label={t('game.today')} value={batter.ab !== null ? `${batter.h ?? 0}-${batter.ab}` : null} />
                    <Stat label={t('stats.avg')} value={batter.avg} />
                </dl>
                {matchup.onDeck && <p className="mt-2 truncate text-[11px] text-faint">{t('game.onDeck', { name: matchup.onDeck.name })}</p>}
            </div>
        </section>
    );
};

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="rounded-lg bg-raised px-1 py-1.5">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
        <dd className="num font-display text-lg font-bold leading-tight">{value ?? '—'}</dd>
    </div>
);
