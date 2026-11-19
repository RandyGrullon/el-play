import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameLogRow } from '../../lib/stats';
import { recentHitting } from '../../lib/recentGames';

/** Encima del juego a juego: lo de esos juegos sumado («Últimos 8 juegos: 22 turnos · 2 hits · .091») */
export const RecentTotal: React.FC<{ games: Pick<GameLogRow, 'hitting'>[]; className?: string }> = ({ games, className = '' }) => {
    const { t } = useTranslation();
    const line = recentHitting(games);
    if (!line.games) return null;
    return (
        <p className={`flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded-2xl bg-raised px-3 py-2 text-sm ${className}`}>
            <span className="font-bold">{t('statsPage.recentTotal', { count: line.games })}:</span>
            <span className="font-semibold tabular-nums">
                {t('statsPage.recentAb', { count: line.ab })} · {t('statsPage.recentHits', { count: line.h })}
                {line.avg && <span className="text-muted"> · {line.avg}</span>}
            </span>
        </p>
    );
};
