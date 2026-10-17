import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, Share2, Star } from 'lucide-react';
import type { ScheduleGame, ScheduleTeam } from '../../types';
import { finalLabel, inningName, isNotPlayed, stateName } from '../../lib/baseball';
import { formatCountdown, formatTime } from '../../lib/format';
import { usePrefetchGame } from '../../lib/queries';
import { teamDisplayName } from '../../lib/teams';
import { usePreferences } from '../../store/preferences';
import { alertsAvailable, useAlertToggle } from '../../hooks/useAlertToggle';
import { useLeague } from '../../store/LeagueContext';
import { useShare } from '../../share/ShareSheet';
import { resultFromSchedule } from '../../share/subjects';
import { TeamLogo } from '../ui/TeamLogo';
import { Bases, OutsDots } from '../game/Bases';

const inkOn = (hex: string) => {
    const value = parseInt(hex.replace('#', ''), 16);
    const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#14151a' : '#ffffff';
};

// Juego en vivo: dos mitades con el color de cada equipo y el marcador en grande
const LiveCard: React.FC<{ game: ScheduleGame }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const live = game.live!;
    const between = live.inningState === 'Middle' || live.inningState === 'End';
    const half = (team: ScheduleTeam, align: 'start' | 'end') => (
        <div className={`flex min-w-0 flex-1 flex-col justify-center px-4 py-4 ${align === 'end' ? 'items-end text-right' : ''}`} style={{ backgroundColor: team.color, color: inkOn(team.color) }}>
            <span className="max-w-full truncate text-[15px] font-bold">{teamDisplayName(team, i18n.language)}</span>
            <span className="text-[54px] font-extrabold leading-none tabular-nums">{team.score ?? 0}</span>
        </div>
    );
    return (
        <>
            <div className="flex">{half(game.away, 'start')}{half(game.home, 'end')}</div>
            <div className="flex min-w-0 items-center gap-3 bg-surface px-4 py-3">
                <span className="pill shrink-0 bg-live text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    {live.inning ? inningName({ n: live.inning, isTop: live.isTop, state: live.inningState }, i18n.language, true) : stateName(game.detailedState, i18n.language)}
                </span>
                {!between && live.inning ? (
                    <>
                        <Bases runners={live.runners} size={26} color={(live.isTop ? game.away : game.home).color} />
                        <OutsDots outs={live.outs} />
                        <span className="text-sm font-semibold text-muted tabular-nums">{live.balls}-{live.strikes}</span>
                        {live.batter && <span className="ml-auto min-w-0 truncate text-xs font-semibold text-muted">{t('card.batting', { name: live.batter.name })}</span>}
                    </>
                ) : (
                    <span className="text-sm font-semibold text-muted">{t('game.betweenInnings')}</span>
                )}
            </div>
        </>
    );
};

const TeamRow: React.FC<{ team: ScheduleTeam; dim: boolean; showScore: boolean }> = ({ team, dim, showScore }) => {
    const { i18n } = useTranslation();
    const { favoriteTeamId } = usePreferences();
    return (
        <div className={`flex items-center gap-3 ${dim ? 'text-muted' : ''}`}>
            <TeamLogo team={team} size={30} />
            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-base font-bold">
                <span className="truncate">{teamDisplayName(team, i18n.language)}</span>
                {favoriteTeamId === team.id && <Star className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" />}
            </span>
            {showScore && <span className="text-2xl font-extrabold tabular-nums">{team.score ?? 0}</span>}
        </div>
    );
};

export const GameFeedCard: React.FC<{ game: ScheduleGame }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const prefetch = usePrefetchGame();
    const share = useShare();
    const { leagueConfig } = useLeague();
    const { subscribedGames } = usePreferences();
    const toggleAlert = useAlertToggle();
    const notPlayed = isNotPlayed(game.detailedState);
    const final = game.state === 'final';
    const subscribed = subscribedGames.includes(game.gamePk);
    const startsIn = new Date(game.date).getTime() - Date.now();
    const handlers = { onMouseEnter: () => prefetch(game.gamePk), onTouchStart: () => prefetch(game.gamePk), onFocus: () => prefetch(game.gamePk) };

    if (game.state === 'live' && game.live) {
        return (
            <Link to={`/juego/${game.gamePk}`} {...handlers} className="block animate-fade-up overflow-hidden rounded-card shadow-float">
                <LiveCard game={game} />
            </Link>
        );
    }

    const shareResult = (event: React.MouseEvent) => {
        event.preventDefault();
        share({
            data: resultFromSchedule(game, t(`leagues.${leagueConfig.id}.name`), t, i18n.language),
            fileName: `el-play-${game.away.abbrev}-${game.home.abbrev}`.toLowerCase(),
            text: `${game.away.name} ${game.away.score ?? ''} - ${game.home.score ?? ''} ${game.home.name} · El Play`,
            url: `/juego/${game.gamePk}`
        });
    };

    return (
        <Link to={`/juego/${game.gamePk}`} {...handlers} className="card block animate-fade-up p-4">
            <div className="mb-3 flex items-center gap-2">
                {notPlayed ? (
                    <span className="pill bg-live/10 text-live">{stateName(game.detailedState, i18n.language)}</span>
                ) : final ? (
                    <span className="pill bg-raised text-muted">{finalLabel(game.inningsPlayed ?? 0, game.scheduledInnings, i18n.language)}</span>
                ) : (
                    <span className="pill bg-raised text-ink">
                        {formatTime(game.date, i18n.language)}
                        {startsIn > 0 && startsIn < 6 * 3600000 && <span className="font-semibold text-muted">· {formatCountdown(startsIn, i18n.language)}</span>}
                    </span>
                )}
                {game.description && game.gameType !== 'R' && <span className="truncate text-xs text-muted">{game.description}</span>}
                <span className="ml-auto flex items-center gap-1">
                    {final && (
                        <button type="button" onClick={shareResult} className="flex h-9 w-9 items-center justify-center rounded-full bg-raised text-ink" aria-label={t('share.shareResult')}>
                            <Share2 className="h-4 w-4" />
                        </button>
                    )}
                    {game.state === 'preview' && !notPlayed && alertsAvailable() && (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.preventDefault();
                                toggleAlert(game.gamePk);
                            }}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${subscribed ? 'bg-raised text-ink' : 'bg-ink text-bg'}`}
                            aria-pressed={subscribed}
                        >
                            {subscribed ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                            {subscribed ? t('card.notifying') : t('preview.notifyShort')}
                        </button>
                    )}
                </span>
            </div>
            <div className="space-y-2.5">
                <TeamRow team={game.away} dim={final && !game.away.isWinner} showScore={game.state !== 'preview' && !notPlayed} />
                <TeamRow team={game.home} dim={final && !game.home.isWinner} showScore={game.state !== 'preview' && !notPlayed} />
            </div>
            {(final && game.decisions?.winner) || (game.state === 'preview' && (game.away.probable || game.home.probable)) ? (
                <p className="mt-3 truncate border-t border-line/10 pt-2.5 text-xs font-semibold text-muted">
                    {final && game.decisions?.winner
                        ? [t('card.win', { name: game.decisions.winner.name }), game.decisions.save ? t('card.save', { name: game.decisions.save.name }) : game.decisions.loser ? t('card.loss', { name: game.decisions.loser.name }) : ''].filter(Boolean).join(' · ')
                        : `${game.away.probable?.name ?? t('preview.tbd')} vs ${game.home.probable?.name ?? t('preview.tbd')} · ${game.venue}`}
                </p>
            ) : null}
        </Link>
    );
};

export const GameFeedCardSkeleton: React.FC = () => (
    <div className="card space-y-3 p-4" aria-hidden="true">
        <div className="skeleton h-6 w-24 rounded-full" />
        {[0, 1].map((index) => (
            <div key={index} className="flex items-center gap-3">
                <div className="skeleton h-[30px] w-[30px] rounded-full" />
                <div className="skeleton h-5 flex-1" />
                <div className="skeleton h-7 w-7" />
            </div>
        ))}
    </div>
);
