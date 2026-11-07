import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, Share2, Star } from 'lucide-react';
import type { ScheduleGame, ScheduleTeam } from '../../types';
import { delayOf, finalLabel, inningName, isOnHold, isSuspended, stateName } from '../../lib/baseball';
import { formatCountdown, formatTime } from '../../lib/format';
import { usePrefetchGame } from '../../lib/queries';
import { teamDisplayName } from '../../lib/teams';
import { usePreferences } from '../../store/preferences';
import { alertsAvailable, useAlertToggle } from '../../hooks/useAlertToggle';
import { useLeague } from '../../store/LeagueContext';
import { useShare } from '../../share/ShareSheet';
import { resultFromSchedule } from '../../share/subjects';
import { TeamLogo } from '../ui/TeamLogo';
import { TeamLink } from '../ui/TeamLink';
import { PlayerLink } from '../ui/PlayerLink';
import { CardLink, OVER_CARD } from '../ui/CardLink';
import { withNodes } from '../ui/TextLinks';
import { slot } from '../../lib/links';
import { OutsDots } from '../game/Bases';
import { FieldButton } from '../field/FieldView';
import { DelayPill } from '../game/Delay';
import { useNow } from '../../hooks/useNow';

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
    // Detenido (lluvia…): la pastilla azul con la entrada en que se paró, en vez de la roja; nadie está bateando
    const delay = delayOf(game.detailedState);
    const inning = live.inning ? inningName({ n: live.inning, isTop: live.isTop, state: live.inningState }, i18n.language, true) : '';
    const half = (team: ScheduleTeam, align: 'start' | 'end') => (
        <div className={`flex min-w-0 flex-1 flex-col justify-center px-4 py-4 ${align === 'end' ? 'items-end text-right' : ''}`} style={{ backgroundColor: team.color, color: inkOn(team.color) }}>
            <TeamLink id={team.id} className={`${OVER_CARD} max-w-full truncate text-[15px] font-bold`}>
                {teamDisplayName(team, i18n.language)}
            </TeamLink>
            <span className="text-[54px] font-extrabold leading-none tabular-nums">{team.score ?? 0}</span>
            {team.record && <span className="text-xs font-semibold tabular-nums opacity-75">{team.record.wins}-{team.record.losses}</span>}
        </div>
    );
    return (
        <>
            <div className="flex">{half(game.away, 'start')}{half(game.home, 'end')}</div>
            <div className="flex min-w-0 items-center gap-3 bg-surface px-4 py-3">
                {delay ? (
                    <DelayPill delay={delay} suffix={inning} />
                ) : (
                    <span className="pill shrink-0 bg-live text-white">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                        {inning || stateName(game.detailedState, i18n.language)}
                    </span>
                )}
                {!between && live.inning ? (
                    <>
                        <FieldButton gamePk={game.gamePk} runners={live.runners} size={26} color={(live.isTop ? game.away : game.home).color} className={OVER_CARD} />
                        <OutsDots outs={live.outs} />
                        <span className="text-sm font-semibold text-muted tabular-nums">{live.balls}-{live.strikes}</span>
                        {live.batter && !delay && (
                            <span className="ml-auto min-w-0 truncate text-xs font-semibold text-muted">
                                {withNodes(t('card.batting', { name: slot('name') }), {
                                    name: (
                                        <PlayerLink id={live.batter.id} className={OVER_CARD}>
                                            {live.batter.name}
                                        </PlayerLink>
                                    )
                                })}
                            </span>
                        )}
                    </>
                ) : delay ? null : (
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
            <TeamLink id={team.id} decorative className={`${OVER_CARD} flex shrink-0`}>
                <TeamLogo team={team} size={30} />
            </TeamLink>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-base font-bold">
                <TeamLink id={team.id} className={`${OVER_CARD} truncate`}>
                    {teamDisplayName(team, i18n.language)}
                </TeamLink>
                {favoriteTeamId === team.id && <Star className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" />}
                {team.record && <span className="shrink-0 text-xs font-semibold text-muted tabular-nums">{team.record.wins}-{team.record.losses}</span>}
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
    const notPlayed = isOnHold(game);
    const final = game.state === 'final';
    // Inicio demorado (lluvia antes del primer lanzamiento)
    const previewDelay = game.state === 'preview' ? delayOf(game.detailedState) : null;
    const subscribed = subscribedGames.includes(game.gamePk);
    // La cuenta regresiva avanza sola (cada 30 s) en todo juego por empezar: así sale también la del que entra en las
    // 6 horas con la página abierta (antes solo corría si ya faltaban menos de 6 horas al pintar la tarjeta)
    const now = useNow(30000, game.state === 'preview' && !notPlayed);
    const startsIn = new Date(game.date).getTime() - now;
    const warm = () => prefetch(game.gamePk);
    const handlers = { onMouseEnter: warm, onTouchStart: warm };
    // Toda la tarjeta abre el juego (un enlace por encima del contenido); los equipos, los peloteros y los botones van
    // encima de ese enlace y abren lo suyo
    const cardLink = <CardLink to={`/juego/${game.gamePk}`} label={t('card.openGame', { away: teamDisplayName(game.away, i18n.language), home: teamDisplayName(game.home, i18n.language) })} onFocus={warm} />;

    if (game.state === 'live' && game.live) {
        return (
            <div {...handlers} className="relative isolate block animate-fade-up overflow-hidden rounded-card shadow-float">
                {cardLink}
                <LiveCard game={game} />
            </div>
        );
    }

    const person = (who: { id: number; name: string }) => (
        <PlayerLink id={who.id} className={OVER_CARD}>
            {who.name}
        </PlayerLink>
    );
    const decision = (key: string, who: { id: number; name: string }) => withNodes(t(key, { name: slot('name') }), { name: person(who) });
    const probable = (who: { id: number; name: string } | null) => (who ? person(who) : t('preview.tbd'));

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
        <div {...handlers} className="card relative isolate block animate-fade-up p-4">
            {cardLink}
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
                {game.state === 'preview' && !notPlayed && isSuspended(game.detailedState) && <span className="pill shrink-0 bg-accent/10 text-accent-ink">{t('card.rescheduled')}</span>}
                {game.state === 'preview' && !notPlayed && previewDelay && <DelayPill delay={previewDelay} />}
                {game.doubleheader?.game && <span className="pill shrink-0 bg-accent/10 text-accent-ink">{t('card.doubleheader', { n: game.doubleheader.game })}</span>}
                {game.description && game.gameType !== 'R' && <span className="truncate text-xs text-muted">{game.description}</span>}
                <span className="ml-auto flex items-center gap-1">
                    {final && (
                        <button type="button" onClick={shareResult} className={`${OVER_CARD} flex h-9 w-9 items-center justify-center rounded-full bg-raised text-ink`} aria-label={t('share.shareResult')}>
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
                            className={`${OVER_CARD} inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${subscribed ? 'bg-raised text-ink' : 'bg-ink text-bg'}`}
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
                    {final && game.decisions?.winner ? (
                        <>
                            {decision('card.win', game.decisions.winner)}
                            {game.decisions.save ? <> · {decision('card.save', game.decisions.save)}</> : game.decisions.loser ? <> · {decision('card.loss', game.decisions.loser)}</> : null}
                        </>
                    ) : (
                        <>
                            {probable(game.away.probable)} vs {probable(game.home.probable)} · {game.venue}
                        </>
                    )}
                </p>
            ) : null}
        </div>
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
