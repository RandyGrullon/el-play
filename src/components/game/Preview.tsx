import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, CloudSun, MapPin } from 'lucide-react';
import type { Decision, GameDetail } from '../../types';
import { formatCountdown, formatShortDate, formatTime } from '../../lib/format';
import { isNotPlayed, stateName } from '../../lib/baseball';
import { usePreferences } from '../../store/preferences';
import { TeamLogo } from '../ui/TeamLogo';

// Juego que todavía no empieza: abridores probables, hora, estadio y aviso
export const Preview: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const { subscribedGames, toggleGameSubscription } = usePreferences();
    const gamePk = game.gamePk ?? 0;
    const subscribed = subscribedGames.includes(gamePk);
    const startsIn = game.date ? new Date(game.date).getTime() - Date.now() : null;
    const notPlayed = isNotPlayed(game.detailedState);

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4" aria-label={t('preview.probables')}>
                <h2 className="eyebrow mb-3">{t('preview.probables')}</h2>
                <ul className="space-y-3">
                    <ProbableRow team={game.away} pitcher={game.probables.away} />
                    <ProbableRow team={game.home} pitcher={game.probables.home} />
                </ul>
            </section>

            <section className="card space-y-3 p-4" aria-label={t('preview.details')}>
                <h2 className="eyebrow">{t('preview.details')}</h2>
                {game.date && (
                    <p className="text-sm">
                        <span className="font-semibold capitalize">{formatShortDate(game.date, i18n.language)}</span>
                        <span className="text-muted"> · {formatTime(game.date, i18n.language)}</span>
                        {startsIn !== null && startsIn > 0 && !notPlayed && <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-ink">{formatCountdown(startsIn, i18n.language)}</span>}
                    </p>
                )}
                {notPlayed && <p className="text-sm font-semibold text-live">{stateName(game.detailedState, i18n.language)}{game.reason ? ` · ${game.reason}` : ''}</p>}
                {game.venue && (
                    <p className="flex items-center gap-2 text-sm text-muted">
                        <MapPin className="h-4 w-4" /> {game.venue}
                    </p>
                )}
                {game.weather && (
                    <p className="flex items-center gap-2 text-sm text-muted">
                        <CloudSun className="h-4 w-4" /> {game.weather.condition}
                        {game.weather.temp ? ` · ${game.weather.temp}°F` : ''}
                    </p>
                )}
                {!notPlayed && 'Notification' in window && (
                    <button
                        type="button"
                        onClick={() => toggleGameSubscription(gamePk)}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${subscribed ? 'bg-raised text-ink' : 'bg-accent text-white hover:opacity-90'}`}
                    >
                        {subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                        {subscribed ? t('preview.notifyOff') : t('preview.notifyOn')}
                    </button>
                )}
            </section>
        </div>
    );
};

const ProbableRow: React.FC<{ team: GameDetail['away']; pitcher: Decision | null }> = ({ team, pitcher }) => {
    const { t } = useTranslation();
    return (
        <li className="flex items-center gap-3">
            <TeamLogo team={team} size={36} />
            <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{pitcher?.name ?? t('preview.tbd')}</span>
                <span className="block text-xs text-muted">{team.name}</span>
            </span>
            {pitcher && (
                <span className="num text-right text-sm">
                    <span className="block font-semibold">{pitcher.wins !== null ? `${pitcher.wins}-${pitcher.losses ?? 0}` : '—'}</span>
                    <span className="block text-xs text-muted">{t('stats.era')} {pitcher.era ?? '—'}</span>
                </span>
            )}
        </li>
    );
};
