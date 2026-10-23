import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, CloudSun, ListOrdered, MapPin, SearchX, Share2, Table2, Target } from 'lucide-react';
import type { GameDetail, ScheduleGame, TopPerformer } from '../types';
import { findScheduledGame, useGame } from '../lib/queries';
import { ApiError } from '../lib/api';
import { alertsAvailable, useAlertToggle } from '../hooks/useAlertToggle';
import { atBatForZone, inningBreak, isNotPlayed, weatherName, weatherTemp } from '../lib/baseball';
import { formatCountdown, formatShortDate, formatTime, surname } from '../lib/format';
import { teamDisplayName } from '../lib/teams';
import { useAnalytics } from '../hooks/useAnalytics';
import { useLeague } from '../store/LeagueContext';
import { usePreferences } from '../store/preferences';
import { useShare } from '../share/ShareSheet';
import { playerFromPerformer, resultFromGame } from '../share/subjects';
import { GameHero, type HeroModel } from '../components/gamecast/GameHero';
import { Timeline } from '../components/gamecast/Timeline';
import { StoryRecap } from '../components/gamecast/StoryRecap';
import { StrikeZone } from '../components/game/StrikeZone';
import { SprayChart } from '../components/game/SprayChart';
import { PlayAnimation } from '../components/gamecast/PlayAnimation';
import { forMode, newPlayEvents, type PlayEvent } from '../lib/playEvents';
import { StrikeZonePanel } from '../components/game/StrikeZonePanel';
import { InningBreakMini } from '../components/game/InningBreak';
import { WinProbabilityCard } from '../components/game/WinProbability';
import { LineScore } from '../components/game/LineScore';
import { GameFlow } from '../components/game/GameFlow';
import { GameDetails, NoHitterBanner, PitcherCard, StaleNotice } from '../components/game/LiveExtras';
import { uniformColors } from '../components/game/BatterFigure';
import { Matchup } from '../components/game/Matchup';
import { PlayByPlay } from '../components/game/PlayByPlay';
import { BoxScore } from '../components/game/BoxScore';
import { Bases, OutsDots } from '../components/game/Bases';
import { BottomSheet } from '../components/ui/BottomSheet';
import { PlayerPhoto } from '../components/ui/PlayerPhoto';
import { TeamLogo } from '../components/ui/TeamLogo';
import { ErrorState, OfflineState, Skeleton, waitingForNetwork } from '../components/ui/States';
import { PullToRefresh } from '../components/common/PullToRefresh';
import { LiveProPanel } from '../components/pro/LiveProPanel';
import { useIsPro } from '../lib/pro';

type Sheet = 'zone' | 'plays' | 'box' | null;

const fromDetail = (game: GameDetail): HeroModel => ({
    state: game.state,
    detailedState: game.detailedState,
    date: game.date,
    scheduledInnings: game.scheduledInnings,
    inningsPlayed: game.linescore.length,
    inning: game.inning ? { n: game.inning.n, isTop: game.inning.isTop, state: game.inning.state } : null,
    outs: game.count.outs,
    away: { ...game.away, score: game.away.runs },
    home: { ...game.home, score: game.home.runs }
});

const fromSchedule = (game: ScheduleGame): HeroModel => ({
    state: game.state,
    detailedState: game.detailedState,
    date: game.date,
    scheduledInnings: game.scheduledInnings,
    inningsPlayed: game.inningsPlayed ?? 0,
    inning: game.live ? { n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState } : null,
    outs: game.live?.outs ?? 0,
    away: game.away,
    home: game.home
});

const ActionButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }> = ({ icon, label, onClick, primary }) => (
    <button
        type="button"
        onClick={onClick}
        className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold ${primary ? 'bg-ink text-bg' : 'bg-surface shadow-card'}`}
    >
        {icon}
        {label}
    </button>
);

// En vivo (diseño D2): situación + mini zona flotando sobre la cabecera, cronología tipo chat
const LiveView: React.FC<{ game: GameDetail; open: (sheet: Sheet) => void; onShare: () => void }> = ({ game, open, onShare }) => {
    const { t } = useTranslation();
    const { atBat } = atBatForZone(game);
    const batting = game.inning?.isTop ? game.away : game.home;
    const between = game.inning?.state === 'Middle' || game.inning?.state === 'End';
    // Tras el tercer out, hasta el primer bateador de la otra mitad: la zona espera y la situación dice quién abre
    const pause = inningBreak(game);
    const leadoff = pause?.dueUp[0] ?? null;
    const pro = useIsPro();
    const runners = (['first', 'second', 'third'] as const).flatMap((base) => (game.runners[base] ? [{ base, person: game.runners[base]! }] : []));

    return (
        <>
            <div className="relative z-10 -mt-5 flex gap-3 px-4">
                <div className="flex flex-1 items-center justify-around gap-2 rounded-[24px] bg-surface px-3 py-3.5 shadow-float">
                    <Bases runners={game.runners} size={48} color={batting.color} />
                    <div className="text-center">
                        <div className="whitespace-nowrap text-[28px] font-extrabold leading-none tabular-nums">{between ? '—' : `${game.count.balls}-${game.count.strikes}`}</div>
                        <OutsDots outs={game.count.outs} className="mt-1.5" />
                    </div>
                    {pause ? (
                        <div className="min-w-0 text-center text-xs font-semibold text-muted">
                            <b className="block truncate text-sm text-ink">{leadoff ? surname(leadoff.name) : pause.next.abbrev}</b>
                            {leadoff ? t('zone.breakLeadsOff', { team: pause.next.abbrev }) : t('zone.breakStatus')}
                        </div>
                    ) : game.matchup && (
                        <div className="min-w-0 text-center text-xs font-semibold text-muted">
                            <b className="block truncate text-sm text-ink">{surname(game.matchup.batter.name)}</b>
                            {t('zone.facing')} {surname(game.matchup.pitcher.name)}
                        </div>
                    )}
                </div>
                <button type="button" onClick={() => open('zone')} className="w-[104px] shrink-0 rounded-[24px] bg-surface p-1.5 shadow-float" aria-label={t('zone.open')}>
                    {pause ? (
                        <InningBreakMini pause={pause} />
                    ) : atBat ? (
                        <StrikeZone pitches={atBat.pitches} batterSide={atBat.batter.side} uniform={uniformColors(atBat.top ? game.away : game.home, !atBat.top)} showLegend={false} />
                    ) : (
                        <Target className="mx-auto my-6 h-8 w-8 text-faint" />
                    )}
                </button>
            </div>

            {!pause && runners.length > 0 && (
                <p className="flex flex-wrap gap-1.5 px-5 pt-2.5 text-xs" aria-label={t('runners.title')}>
                    {runners.map(({ base, person }) => (
                        <span key={base} className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 font-semibold shadow-card">
                            <span className="font-extrabold text-muted">{t(`runners.${base}`)}</span> {surname(person.name)}
                        </span>
                    ))}
                </p>
            )}

            <div className="space-y-3 px-4 pt-4 empty:hidden">
                <StaleNotice game={game} />
                <NoHitterBanner game={game} />
            </div>

            <div className="px-4 pt-4">
                <LineScore game={game} />
            </div>

            <div className="px-4 pt-5">
                <Timeline game={game} onMore={() => open('plays')} />
            </div>

            {!pause && (
                <div className="px-4 pt-4">
                    <PitcherCard game={game} />
                </div>
            )}

            <div className="px-4 pt-4">
                <GameFlow game={game} />
            </div>

            <div className="px-4 pt-4">
                <SprayChart game={game} />
            </div>

            {pro && (
                <div className="px-4 pt-4">
                    <LiveProPanel game={game} />
                </div>
            )}

            <div className="px-4 pt-4">
                <GameDetails game={game} />
            </div>

            <div className="flex gap-2 px-4 pt-5">
                <ActionButton icon={<Table2 className="h-4 w-4" />} label={t('game.tabs.box')} onClick={() => open('box')} />
                <ActionButton icon={<Target className="h-4 w-4" />} label={t('zone.full')} onClick={() => open('zone')} />
                <ActionButton icon={<Share2 className="h-4 w-4" />} label={t('share.short')} onClick={onShare} primary />
            </div>
        </>
    );
};

const FinalView: React.FC<{ game: GameDetail; open: (sheet: Sheet) => void; onShare: () => void; onSharePerformer: (performer: TopPerformer) => void }> = ({ game, open, onShare, onSharePerformer }) => {
    const { t } = useTranslation();
    const pro = useIsPro();
    return (
        <div className="space-y-4 px-4 pt-4">
            <NoHitterBanner game={game} />
            <StoryRecap game={game} onSharePerformer={onSharePerformer} />
            <LineScore game={game} />
            <GameFlow game={game} />
            <SprayChart game={game} />
            {pro && <LiveProPanel game={game} />}
            <GameDetails game={game} />
            <div className="flex gap-2">
                <ActionButton icon={<ListOrdered className="h-4 w-4" />} label={t('game.tabs.plays')} onClick={() => open('plays')} />
                <ActionButton icon={<Table2 className="h-4 w-4" />} label={t('game.tabs.box')} onClick={() => open('box')} />
                <ActionButton icon={<Share2 className="h-4 w-4" />} label={t('share.short')} onClick={onShare} primary />
            </div>
        </div>
    );
};

const PreviewView: React.FC<{ game: GameDetail; onShare: () => void }> = ({ game, onShare }) => {
    const { t, i18n } = useTranslation();
    const { subscribedGames } = usePreferences();
    const toggleAlert = useAlertToggle();
    const gamePk = game.gamePk ?? 0;
    const subscribed = subscribedGames.includes(gamePk);
    const notPlayed = isNotPlayed(game.detailedState);
    const startsIn = game.date ? new Date(game.date).getTime() - Date.now() : 0;

    return (
        <div className="space-y-3 px-4 pt-4">
            {!notPlayed && <WinProbabilityCard game={game} />}

            <section className="card p-4" aria-label={t('preview.probables')}>
                <h2 className="eyebrow mb-3">{t('preview.probables')}</h2>
                <ul className="space-y-3">
                    {(['away', 'home'] as const).map((side) => {
                        const pitcher = game.probables[side];
                        return (
                            <li key={side} className="flex items-center gap-3">
                                {pitcher ? (
                                    <PlayerPhoto personId={pitcher.id} name={pitcher.name} size={56} background={`${game[side].color}33`} team={game[side]} />
                                ) : (
                                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full" style={{ background: `${game[side].color}22` }}>
                                        <TeamLogo team={game[side]} size={38} />
                                    </span>
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-extrabold">{pitcher?.name ?? t('preview.tbd')}</span>
                                    <span className="block truncate text-sm text-muted">{teamDisplayName(game[side], i18n.language)}</span>
                                </span>
                                {pitcher && (
                                    <span className="text-right text-sm tabular-nums">
                                        <span className="block font-bold">{pitcher.wins !== null ? `${pitcher.wins}-${pitcher.losses ?? 0}` : '—'}</span>
                                        <span className="block text-xs text-muted">{t('stats.era')} {pitcher.era ?? '—'}</span>
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {/* MLB no recibe los abridores de LIDOM (0 de 185 juegos en 2025-26): se dice en vez de dejar el hueco */}
                {!game.probables.away && !game.probables.home && <p className="mt-3 text-sm text-muted">{t('preview.probablesLater')}</p>}
            </section>

            <section className="card space-y-2.5 p-4" aria-label={t('preview.details')}>
                {game.date && (
                    <p className="font-bold first-letter:uppercase">
                        {formatShortDate(game.date, i18n.language)} · {formatTime(game.date, i18n.language)}
                        {startsIn > 0 && !notPlayed && <span className="ml-2 font-semibold normal-case text-muted">{formatCountdown(startsIn, i18n.language)}</span>}
                    </p>
                )}
                {game.venue && <p className="flex items-center gap-2 text-sm text-muted"><MapPin className="h-4 w-4" /> {game.venue}</p>}
                {game.weather && (
                    <p className="flex items-center gap-2 text-sm text-muted">
                        <CloudSun className="h-4 w-4" /> {weatherName(game.weather.condition, i18n.language)}
                        {weatherTemp(game.weather.temp, i18n.language) ? ` · ${weatherTemp(game.weather.temp, i18n.language)}` : ''}
                    </p>
                )}
            </section>

            <div className="flex gap-2">
                {!notPlayed && alertsAvailable() && (
                    <ActionButton
                        icon={subscribed ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                        label={subscribed ? t('preview.notifyOff') : t('preview.notifyOn')}
                        onClick={() => toggleAlert(gamePk)}
                    />
                )}
                <ActionButton icon={<Share2 className="h-4 w-4" />} label={t('share.short')} onClick={onShare} primary />
            </div>
        </div>
    );
};


/** Una lectura que llega más de 45 s después de la anterior trae jugadas viejas (red lenta, pantalla bloqueada) */
const STALE_READ_MS = 45 * 1000;
export const GamePage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { gamePk } = useParams<{ gamePk: string }>();
    const client = useQueryClient();
    const query = useGame(gamePk);
    const game = query.data;
    const scheduled = useMemo(() => findScheduledGame(client, gamePk), [client, gamePk]);
    const { leagueConfig } = useLeague();
    const share = useShare();
    const [sheet, setSheet] = useState<Sheet>(null);
    const { trackGameView } = useAnalytics();
    const tracked = useRef<string | null>(null);
    const { animationMode, favoriteTeamId } = usePreferences();
    const previous = useRef<GameDetail | null>(null);
    const shown = useRef(new Set<string>());
    const [plays, setPlays] = useState<PlayEvent[]>([]);
    // Cuándo llegó la lectura anterior y si la app estuvo en segundo plano desde entonces
    const readAt = useRef(0);
    const wasHidden = useRef(false);
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') wasHidden.current = true;
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    // Jugadas nuevas entre una lectura del juego y la siguiente → animación (en cola si llegan juntas)
    useEffect(() => {
        if (!game) return;
        const now = Date.now();
        // Al volver de segundo plano (o tras un rato sin lecturas) lo que pasó mientras tanto ya es viejo: no se anima
        const stale = wasHidden.current || (readAt.current > 0 && now - readAt.current > STALE_READ_MS);
        readAt.current = now;
        wasHidden.current = false;
        const fresh = stale ? [] : forMode(newPlayEvents(previous.current, game), animationMode, favoriteTeamId, [game.away.id, game.home.id]).filter((play) => !shown.current.has(play.key));
        previous.current = game;
        if (!fresh.length) return;
        fresh.forEach((play) => shown.current.add(play.key));
        // Hasta 4 en cola sin sacar la que se está mostrando (la primera)
        setPlays((queue) => {
            const next = [...queue, ...fresh];
            return next.length > 4 ? [next[0], ...next.slice(-3)] : next;
        });
    }, [game, animationMode, favoriteTeamId]);

    useEffect(() => {
        if (game && gamePk && tracked.current !== gamePk) {
            tracked.current = gamePk;
            trackGameView(gamePk, game.home.name, game.away.name);
        }
    }, [game, gamePk, trackGameView]);

    useEffect(() => {
        if (game) document.title = `${game.away.abbrev} ${game.away.runs}-${game.home.runs} ${game.home.abbrev} · El Play`;
        return () => {
            document.title = 'El Play · Béisbol en vivo';
        };
    }, [game?.away.runs, game?.home.runs, game?.away.abbrev, game?.home.abbrev]); // eslint-disable-line react-hooks/exhaustive-deps

    const leagueName = t(`leagues.${game?.league ?? leagueConfig.id}.name`);
    const shareGame = () =>
        game &&
        share({
            data: resultFromGame(game, leagueName, t, i18n.language),
            fileName: `el-play-${game.away.abbrev}-${game.home.abbrev}`.toLowerCase(),
            text: `${game.away.name} ${game.away.runs} - ${game.home.runs} ${game.home.name} · El Play`,
            url: game.gamePk ? `/juego/${game.gamePk}` : undefined
        });
    const sharePerformer = (performer: TopPerformer) =>
        game &&
        share({
            data: playerFromPerformer(performer, game, leagueName, t, i18n.language),
            fileName: `el-play-${performer.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            text: `${performer.name} · El Play`,
            url: game.gamePk ? `/juego/${game.gamePk}` : undefined
        });

    const model = game ? fromDetail(game) : scheduled ? fromSchedule(scheduled) : null;
    // Juego que no existe o enlace roto: se dice claro y se ofrece volver (antes salía una previa vacía)
    const notFoundCode = !game && query.error instanceof ApiError && ['game_not_found', 'invalid_game'].includes(query.error.code) ? query.error.code : null;

    return (
        <PullToRefresh onRefresh={async () => { await query.refetch(); }}>
            {model ? <GameHero model={model} onShare={game ? shareGame : undefined} /> : notFoundCode ? null : <Skeleton className="h-[230px] rounded-none sm:mx-4 sm:mt-4 sm:rounded-card" />}

            {notFoundCode ? (
                <div className="px-4 pt-6">
                    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center" role="alert">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-raised">
                            <SearchX className="h-6 w-6 text-muted" aria-hidden="true" />
                        </span>
                        <p className="text-lg font-extrabold">{t(`errors.${notFoundCode}`)}</p>
                        <p className="max-w-xs text-sm text-muted">{t('game.notFoundHint')}</p>
                        <Link to="/" className="mt-1 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-bold text-white">
                            {t('game.backToGames')}
                        </Link>
                    </div>
                </div>
            ) : waitingForNetwork(query) && !game ? (
                <div className="px-4 pt-4">
                    <OfflineState />
                </div>
            ) : query.isError && !game ? (
                <div className="px-4 pt-4">
                    <ErrorState error={query.error} onRetry={() => query.refetch()} />
                </div>
            ) : !game ? (
                <div className="space-y-3 px-4 pt-4">
                    <Skeleton className="h-[110px] rounded-card" />
                    <Skeleton className="h-[260px] rounded-card" />
                </div>
            ) : game.state === 'live' ? (
                <LiveView game={game} open={setSheet} onShare={shareGame} />
            ) : game.state === 'final' ? (
                <FinalView game={game} open={setSheet} onShare={shareGame} onSharePerformer={sharePerformer} />
            ) : (
                <PreviewView game={game} onShare={shareGame} />
            )}

            {plays[0] && <PlayAnimation key={plays[0].key} event={plays[0]} onDone={() => setPlays((queue) => queue.slice(1))} />}

            {game && (
                <>
                    <BottomSheet open={sheet === 'zone'} onClose={() => setSheet(null)} title={t('zone.title')} tall>
                        <div className="space-y-3">
                            <StrikeZonePanel game={game} />
                            {/* En la pausa entre entradas el duelo es el del último out: la zona ya dice a quién le toca */}
                            {!inningBreak(game) && <Matchup game={game} />}
                        </div>
                    </BottomSheet>
                    <BottomSheet open={sheet === 'plays'} onClose={() => setSheet(null)} title={t('plays.title')} tall>
                        <PlayByPlay game={game} />
                    </BottomSheet>
                    <BottomSheet open={sheet === 'box'} onClose={() => setSheet(null)} title={t('game.tabs.box')} tall>
                        <BoxScore game={game} />
                    </BottomSheet>
                </>
            )}
        </PullToRefresh>
    );
};
