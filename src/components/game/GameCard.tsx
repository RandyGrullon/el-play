import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Star } from 'lucide-react';
import type { ScheduleGame, ScheduleTeam } from '../../types';
import { finalLabel, inningName, isNotPlayed, stateName } from '../../lib/baseball';
import { formatCountdown, formatTime } from '../../lib/format';
import { usePrefetchGame } from '../../lib/queries';
import { teamDisplayName } from '../../lib/teams';
import { usePreferences } from '../../store/preferences';
import { TeamLogo } from '../ui/TeamLogo';
import { Bases, OutsDots } from './Bases';

export const GameCard: React.FC<{ game: ScheduleGame }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const prefetch = usePrefetchGame();
    const { favoriteTeamId, subscribedGames } = usePreferences();
    const live = game.state === 'live' ? game.live : null;
    const final = game.state === 'final';
    const notPlayed = isNotPlayed(game.detailedState);
    const showScores = game.state !== 'preview' && !notPlayed;
    const subscribed = subscribedGames.includes(game.gamePk);
    const between = live?.inningState === 'Middle' || live?.inningState === 'End';
    const startsIn = new Date(game.date).getTime() - Date.now();

    const row = (team: ScheduleTeam, batting: boolean) => (
        <div className="flex items-center gap-3">
            <TeamLogo team={team} size={30} />
            <div className="min-w-0 flex-1">
                <p className={`flex items-center gap-1.5 truncate font-semibold ${final && !team.isWinner ? 'text-muted' : ''}`}>
                    <span className="truncate">{teamDisplayName(team, i18n.language)}</span>
                    {favoriteTeamId === team.id && <Star className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" aria-label={t('teams.favorite')} />}
                    {batting && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-live" aria-label={t('game.atBatNow')} />}
                </p>
                <p className="truncate text-xs text-faint">
                    {game.state === 'preview' && team.probable ? team.probable.name : team.record ? `${team.record.wins}-${team.record.losses}` : ''}
                </p>
            </div>
            {showScores && (
                <span className={`display num w-8 text-right text-3xl leading-none ${final && !team.isWinner ? 'text-faint' : ''}`}>{team.score ?? 0}</span>
            )}
        </div>
    );

    let status: React.ReactNode;
    if (notPlayed) status = <span className="font-semibold text-live">{stateName(game.detailedState, i18n.language)}</span>;
    else if (live && live.inning) {
        status = (
            <span className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold text-live">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
                    {inningName({ n: live.inning, isTop: live.isTop, state: live.inningState }, i18n.language, true)}
                </span>
                {!between && (
                    <>
                        <Bases runners={live.runners} size={24} color={(live.isTop ? game.away : game.home).color} />
                        <OutsDots outs={live.outs} />
                        <span className="num text-xs text-muted">{live.balls}-{live.strikes}</span>
                    </>
                )}
            </span>
        );
    } else if (game.state === 'live') status = <span className="font-semibold text-live">{stateName(game.detailedState, i18n.language)}</span>;
    else if (final) status = <span className="font-semibold text-muted">{finalLabel(game.inningsPlayed ?? 0, game.scheduledInnings, i18n.language)}</span>;
    else {
        status = (
            <span className="flex items-center gap-2">
                <span className="font-semibold">{formatTime(game.date, i18n.language)}</span>
                {startsIn > 0 && startsIn < 3 * 3600000 && <span className="text-xs text-muted">{formatCountdown(startsIn, i18n.language)}</span>}
            </span>
        );
    }

    let footer: React.ReactNode = null;
    if (live?.batter && live.pitcher && !between) {
        footer = (
            <>
                <span className="truncate">{t('card.pitching', { name: live.pitcher.name })}</span>
                <span className="truncate text-right">{t('card.batting', { name: live.batter.name })}</span>
            </>
        );
    } else if (final && game.decisions?.winner) {
        footer = (
            <>
                <span className="truncate">{t('card.win', { name: game.decisions.winner.name })}</span>
                <span className="truncate text-right">{game.decisions.save ? t('card.save', { name: game.decisions.save.name }) : game.decisions.loser ? t('card.loss', { name: game.decisions.loser.name }) : ''}</span>
            </>
        );
    } else if (game.state === 'preview') {
        footer = <span className="col-span-2 truncate">{game.venue}</span>;
    }

    return (
        <Link
            to={`/juego/${game.gamePk}`}
            onMouseEnter={() => prefetch(game.gamePk)}
            onTouchStart={() => prefetch(game.gamePk)}
            onFocus={() => prefetch(game.gamePk)}
            className={`card group block animate-fade-up p-4 transition-colors hover:border-line/25 ${live ? 'ring-1 ring-live/25' : ''}`}
        >
            <div className="mb-3 flex items-center justify-between gap-2 text-sm">
                {status}
                <span className="flex items-center gap-2 text-faint">
                    {subscribed && <Bell className="h-3.5 w-3.5 fill-current text-accent-ink" aria-label={t('card.notifying')} />}
                    {game.description && game.gameType !== 'R' && <span className="truncate text-xs">{game.description}</span>}
                </span>
            </div>
            <div className="space-y-2.5">
                {row(game.away, !!live && live.isTop && !between)}
                {row(game.home, !!live && !live.isTop && !between)}
            </div>
            {footer && <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line/10 pt-2.5 text-xs text-muted">{footer}</div>}
        </Link>
    );
};

export const GameCardSkeleton: React.FC = () => (
    <div className="card space-y-3 p-4" aria-hidden="true">
        <div className="skeleton h-4 w-24" />
        {[0, 1].map((index) => (
            <div key={index} className="flex items-center gap-3">
                <div className="skeleton h-[30px] w-[30px] rounded-full" />
                <div className="skeleton h-4 flex-1" />
                <div className="skeleton h-7 w-7" />
            </div>
        ))}
    </div>
);
