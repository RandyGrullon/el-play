import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, CloudSun, ListOrdered, MapPin, Share2, Table2, Target } from 'lucide-react';
import type { GameDetail, ScheduleGame, TopPerformer } from '../types';
import { findScheduledGame, useGame } from '../lib/queries';
import { ApiError } from '../lib/api';
import { alertsAvailable, useAlertToggle } from '../hooks/useAlertToggle';
import { atBatForZone, delayOf, inningBreak, isNotPlayed, isRainy, weatherName, weatherTemp } from '../lib/baseball';
import { formatCountdown, formatShortDate, formatTime, surname } from '../lib/format';
import { teamDisplayName } from '../lib/teams';
import { useAnalytics } from '../hooks/useAnalytics';
import { useNow } from '../hooks/useNow';
import { useBack } from '../hooks/useBack';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useLeague } from '../store/LeagueContext';
import { usePreferences } from '../store/preferences';
import { useShare } from '../share/ShareSheet';
import { playerFromPerformer, resultFromGame } from '../share/subjects';
import { GameHero, type HeroModel } from '../components/gamecast/GameHero';
import { Timeline, type TimelineReplay } from '../components/gamecast/Timeline';
import { StoryRecap } from '../components/gamecast/StoryRecap';
import { StrikeZone } from '../components/game/StrikeZone';
import { SprayChart } from '../components/game/SprayChart';
import { PlayAnimation } from '../components/gamecast/PlayAnimation';
import { forMode, newPlayEvents, REPLAY_COOLDOWN_MS, replayActionOf, replayEventOf, replayGate, type PlayEvent } from '../lib/playEvents';
import { StrikeZonePanel } from '../components/game/StrikeZonePanel';
import { InningBreakMini } from '../components/game/InningBreak';
import { WinProbabilityCard } from '../components/game/WinProbability';
import { LineScore } from '../components/game/LineScore';
import { GameFlow } from '../components/game/GameFlow';
import { GameDetails, NoHitterBanner, PitcherCard, StaleNotice } from '../components/game/LiveExtras';
import { HeadToHeadCard, HotPlayersCard, LineupsCard, TeamFormCard } from '../components/game/PreviewCards';
import { uniformColors } from '../components/game/BatterFigure';
import { Matchup } from '../components/game/Matchup';
import { PlayByPlay } from '../components/game/PlayByPlay';
import { BoxScore } from '../components/game/BoxScore';
import { OutsDots } from '../components/game/Bases';
import { FieldButton } from '../components/field/FieldView';
import { DelayBanner } from '../components/game/Delay';
import { RainOverlay } from '../components/game/RainOverlay';
import { BottomSheet } from '../components/ui/BottomSheet';
import { PlayerPhoto } from '../components/ui/PlayerPhoto';
import { PlayerLink } from '../components/ui/PlayerLink';
import { TeamLink } from '../components/ui/TeamLink';
import { withNodes } from '../components/ui/TextLinks';
import { slot } from '../lib/links';
import { TeamLogo } from '../components/ui/TeamLogo';
import { ErrorState, NotFoundCard, OfflineState, Skeleton, waitingForNetwork } from '../components/ui/States';
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
const LiveView: React.FC<{ game: GameDetail; open: (sheet: Sheet) => void; onShare: () => void; notice?: React.ReactNode; replay?: TimelineReplay }> = ({ game, open, onShare, notice, replay }) => {
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
                    <FieldButton gamePk={game.gamePk} runners={game.runners} size={48} color={batting.color} />
                    <div className="text-center">
                        <div className="whitespace-nowrap text-[28px] font-extrabold leading-none tabular-nums">{between ? '—' : `${game.count.balls}-${game.count.strikes}`}</div>
                        <OutsDots outs={game.count.outs} className="mt-1.5" />
                    </div>
                    {pause ? (
                        <div className="min-w-0 text-center text-xs font-semibold text-muted">
                            <b className="block truncate text-sm text-ink">
                                {leadoff ? <PlayerLink id={leadoff.id}>{surname(leadoff.name)}</PlayerLink> : <TeamLink id={pause.next.id}>{pause.next.abbrev}</TeamLink>}
                            </b>
                            {leadoff ? withNodes(t('zone.breakLeadsOff', { team: slot('team') }), { team: <TeamLink id={pause.next.id}>{pause.next.abbrev}</TeamLink> }) : t('zone.breakStatus')}
                        </div>
                    ) : game.matchup && (
                        <div className="min-w-0 text-center text-xs font-semibold text-muted">
                            <b className="block truncate text-sm text-ink">
                                <PlayerLink id={game.matchup.batter.id}>{surname(game.matchup.batter.name)}</PlayerLink>
                            </b>
                            {t('zone.facing')} <PlayerLink id={game.matchup.pitcher.id}>{surname(game.matchup.pitcher.name)}</PlayerLink>
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
                            <span className="font-extrabold text-muted">{t(`runners.${base}`)}</span> <PlayerLink id={person.id}>{surname(person.name)}</PlayerLink>
                        </span>
                    ))}
                </p>
            )}

            <div className="space-y-3 px-4 pt-4 empty:hidden">
                {notice}
                <StaleNotice game={game} />
                <NoHitterBanner game={game} />
            </div>

            <div className="px-4 pt-4">
                <LineScore game={game} />
            </div>

            <div className="px-4 pt-5">
                <Timeline game={game} onMore={() => open('plays')} replay={replay} />
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

const PreviewView: React.FC<{ game: GameDetail; onShare: () => void; notice?: React.ReactNode }> = ({ game, onShare, notice }) => {
    const { t, i18n } = useTranslation();
    const { subscribedGames } = usePreferences();
    const toggleAlert = useAlertToggle();
    const gamePk = game.gamePk ?? 0;
    const subscribed = subscribedGames.includes(gamePk);
    const notPlayed = isNotPlayed(game.detailedState);
    // La cuenta regresiva avanza sola
    const now = useNow();
    const startsIn = game.date ? new Date(game.date).getTime() - now : 0;

    return (
        <div className="space-y-3 px-4 pt-4">
            {notice}
            {!notPlayed && <WinProbabilityCard game={game} />}

            <section className="card p-4" aria-label={t('preview.probables')}>
                <h2 className="eyebrow mb-3">{t('preview.probables')}</h2>
                <ul className="space-y-3">
                    {(['away', 'home'] as const).map((side) => {
                        const pitcher = game.probables[side];
                        return (
                            <li key={side} className="flex items-center gap-3">
                                {pitcher ? (
                                    <PlayerLink id={pitcher.id} decorative className="flex shrink-0">
                                        <PlayerPhoto personId={pitcher.id} name={pitcher.name} size={56} background={`${game[side].color}33`} team={game[side]} />
                                    </PlayerLink>
                                ) : (
                                    <TeamLink id={game[side].id} label={t('team.open', { team: game[side].name })} className="flex shrink-0 rounded-full">
                                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full" style={{ background: `${game[side].color}22` }}>
                                            <TeamLogo team={game[side]} size={38} />
                                        </span>
                                    </TeamLink>
                                )}
                                <span className="min-w-0 flex-1">
                                    {pitcher ? (
                                        <PlayerLink id={pitcher.id} className="block truncate font-extrabold">{pitcher.name}</PlayerLink>
                                    ) : (
                                        <span className="block truncate font-extrabold">{t('preview.tbd')}</span>
                                    )}
                                    <TeamLink id={game[side].id} className="block truncate text-sm text-muted">
                                        {teamDisplayName(game[side], i18n.language)}
                                    </TeamLink>
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
                {/* MLB no recibe los abridores de LIDOM (0 de 185 juegos en 2025-26): se dice en vez de dejar el hueco (no en pospuestos ni cancelados) */}
                {!notPlayed && !game.probables.away && !game.probables.home && <p className="mt-3 text-sm text-muted">{t('preview.probablesLater')}</p>}
            </section>

            {!notPlayed && (
                <>
                    <TeamFormCard game={game} />
                    <HeadToHeadCard game={game} />
                    <HotPlayersCard game={game} />
                    <LineupsCard game={game} />
                </>
            )}

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

            {/* Pospuesto o cancelado: ni aviso ni Compartir (saldría «0 - 0») */}
            {!notPlayed && (
                <div className="flex gap-2">
                    {alertsAvailable() && (
                        <ActionButton
                            icon={subscribed ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                            label={subscribed ? t('preview.notifyOff') : t('preview.notifyOn')}
                            onClick={() => toggleAlert(gamePk)}
                        />
                    )}
                    <ActionButton icon={<Share2 className="h-4 w-4" />} label={t('share.short')} onClick={onShare} primary />
                </div>
            )}
        </div>
    );
};


// «Quitar lluvia» vale para ese juego mientras dure la sesión (sessionStorage puede no existir o lanzar)
const rainKey = (gamePk: string | undefined) => `el-play-rain-off-${gamePk ?? ''}`;
const readRainOff = (gamePk: string | undefined) => {
    try {
        return sessionStorage.getItem(rainKey(gamePk)) === '1';
    } catch {
        return false;
    }
};
const writeRainOff = (gamePk: string | undefined, off: boolean) => {
    try {
        if (off) sessionStorage.setItem(rainKey(gamePk), '1');
        else sessionStorage.removeItem(rainKey(gamePk));
    } catch {
        /* sin almacenamiento: dura mientras la página esté abierta */
    }
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
    const back = useBack('/');
    const [sheet, setSheet] = useState<Sheet>(null);
    const { trackGameView } = useAnalytics();
    const tracked = useRef<string | null>(null);
    const { animationMode, favoriteTeamId, playAnimations } = usePreferences();
    const reducedMotion = useReducedMotion();
    const [rainOff, setRainOff] = useState(() => readRainOff(gamePk));
    useEffect(() => setRainOff(readRainOff(gamePk)), [gamePk]);
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

    // Repetir una jugada del historial (encima de la hoja abierta): una a la vez y con una pausa entre repeticiones, para
    // que tocar varias veces no la reinicie ni la ponga en cola. El candado es de esta pantalla de juego, en memoria.
    const gate = useRef(replayGate.idle);
    const [replay, setReplay] = useState<PlayEvent | null>(null);
    const [replayCooling, setReplayCooling] = useState(false);
    const cooldown = useRef(0);
    useEffect(() => {
        gate.current = replayGate.idle;
        setReplay(null);
        setReplayCooling(false);
        return () => window.clearTimeout(cooldown.current);
    }, [gamePk]);
    // Con las animaciones apagadas en «Más» o si el sistema pide menos movimiento, el historial no ofrece repetir
    const canReplay = playAnimations && !reducedMotion;
    // Desde la hoja de jugadas o desde la cronología del juego en vivo (ahí también los robos, cambios de lanzador y emergentes)
    const startReplay = (atBatIndex: number, actionIndex?: number) => {
        // Con una animación en vivo saliendo, el toque también se ignora
        if (!game || !canReplay || plays.length > 0) return;
        const event = actionIndex === undefined ? replayEventOf(game, atBatIndex) : replayActionOf(game, atBatIndex, actionIndex);
        const started = event ? replayGate.start(gate.current, Date.now()) : null;
        if (!event || !started) return;
        gate.current = started;
        setReplay(event);
    };
    const endReplay = () => {
        gate.current = replayGate.end(gate.current, Date.now());
        setReplay(null);
        setReplayCooling(true);
        window.clearTimeout(cooldown.current);
        cooldown.current = window.setTimeout(() => setReplayCooling(false), REPLAY_COOLDOWN_MS);
    };
    const replayLocked = !!replay || replayCooling || plays.length > 0;

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
    const notPlayed = !!game && isNotPlayed(game.detailedState);
    // Detenido (lluvia…) o con el inicio demorado: aviso bajo la cabecera y, con lluvia, a llover en toda la pantalla
    // (no con las animaciones apagadas ni si el sistema pide menos movimiento)
    const delay = game && game.state !== 'final' && !notPlayed ? delayOf(game.detailedState) : null;
    const canRain = !!delay && isRainy(delay) && playAnimations && !reducedMotion;
    const toggleRain = () => {
        writeRainOff(gamePk, !rainOff);
        setRainOff(!rainOff);
    };
    const delayNotice = game && delay ? <DelayBanner game={game} delay={delay} rain={canRain ? { on: !rainOff, toggle: toggleRain } : null} /> : null;

    return (
        <PullToRefresh onRefresh={async () => { await query.refetch(); }}>
            {model ? <GameHero model={model} onShare={game && !notPlayed ? shareGame : undefined} /> : notFoundCode ? null : <Skeleton className="h-[230px] rounded-none sm:mx-4 sm:mt-4 sm:rounded-card" />}

            {notFoundCode ? (
                <div className="px-4 pt-6">
                    <NotFoundCard title={t(`errors.${notFoundCode}`)} hint={t('game.notFoundHint')} action={{ to: '/', label: t('game.backToGames') }} onBack={back} />
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
                <LiveView game={game} open={setSheet} onShare={shareGame} notice={delayNotice} replay={canReplay ? { locked: replayLocked, onReplay: startReplay } : undefined} />
            ) : game.state === 'final' && !notPlayed ? (
                // MLB da los pospuestos y cancelados como «final»: van con la previa (sin resumen ni marcador 0 - 0)
                <FinalView game={game} open={setSheet} onShare={shareGame} onSharePerformer={sharePerformer} />
            ) : (
                <PreviewView game={game} onShare={shareGame} notice={delayNotice} />
            )}

            <RainOverlay active={canRain && !rainOff} />

            {/* La repetición va primero: lo que llegue en vivo mientras sale espera en su cola */}
            {replay ? (
                <PlayAnimation key={replay.key} event={replay} onDone={endReplay} />
            ) : (
                plays[0] && <PlayAnimation key={plays[0].key} event={plays[0]} onDone={() => setPlays((queue) => queue.slice(1))} />
            )}

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
                        <PlayByPlay game={game} replay={canReplay ? { locked: replayLocked, onReplay: startReplay } : undefined} />
                    </BottomSheet>
                    <BottomSheet open={sheet === 'box'} onClose={() => setSheet(null)} title={t('game.tabs.box')} tall>
                        <BoxScore game={game} />
                    </BottomSheet>
                </>
            )}
        </PullToRefresh>
    );
};
