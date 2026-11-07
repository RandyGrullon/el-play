import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Menu, Radio, Sparkles, BarChart3 } from 'lucide-react';
import { useLeague } from '../../store/LeagueContext';
import { usePrefetchGame, useSchedule } from '../../lib/queries';
import { formatShortDate, formatTime } from '../../lib/format';
import { delayOf, inningName } from '../../lib/baseball';
import { DelayPill } from '../game/Delay';
import { useNow } from '../../hooks/useNow';
import { BottomSheet } from '../ui/BottomSheet';
import { TeamLogo } from '../ui/TeamLogo';
import { TeamLink } from '../ui/TeamLink';
import { PlayerLink } from '../ui/PlayerLink';
import { CardLink, OVER_CARD } from '../ui/CardLink';
import { withNodes } from '../ui/TextLinks';
import { slot } from '../../lib/links';
import { teamDisplayName } from '../../lib/teams';
import { ErrorState, OfflineState, Skeleton, waitingForNetwork } from '../ui/States';
import { FieldButton, FieldViewProvider } from '../field/FieldView';
import { OfflineBanner } from './OfflineBanner';
import { UpdateToast } from './UpdateToast';
import { Toast } from './Toast';
import { InstallSheet } from '../install/InstallSheet';
import { useFantasyAlerts } from '../../hooks/useFantasyAlerts';
import { useGameAlerts } from '../../hooks/useGameAlerts';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { syncPush } from '../../lib/push';
import { usePreferences } from '../../store/preferences';
import { ErrorBoundary } from '../common/ErrorBoundary';

/** Avisa lo que suma tu equipo del Fantasy mientras la app está abierta (en cualquier página) */
const FantasyWatcher: React.FC = () => {
    useFantasyAlerts();
    return null;
};

/** Avisos con la app abierta (en cualquier página) y la suscripción para los de la app cerrada */
const AlertsWatcher: React.FC = () => {
    const { activeLeague } = useLeague();
    const schedule = useSchedule(activeLeague);
    useGameAlerts(schedule.data?.games);
    const { subscribedGames, favoriteTeamId, alertKinds } = usePreferences();
    const { i18n } = useTranslation();
    const lang = i18n.language.startsWith('en') ? 'en' : 'es';
    useEffect(() => {
        const timer = window.setTimeout(() => {
            syncPush({ games: subscribedGames, teams: favoriteTeamId ? [favoriteTeamId] : [], kinds: alertKinds, lang }).catch(() => undefined);
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [subscribedGames, favoriteTeamId, alertKinds, lang]);
    return null;
};

// Barra inferior flotante (diseño D): Inicio · Tabla · [En vivo] · Líderes · Más
const BottomNav: React.FC<{ onLive: () => void; liveCount: number }> = ({ onLive, liveCount }) => {
    const { t } = useTranslation();
    const location = useLocation();
    const item = (to: string, label: string, Icon: typeof Home, end = false, also: string[] = []) => (
        <NavLink
            to={to}
            end={end}
            className={({ isActive }) => `flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive || also.some((path) => location.pathname.startsWith(path)) ? 'text-white' : 'text-nav-ink'}`}
        >
            <Icon className="h-[22px] w-[22px]" />
            {label}
        </NavLink>
    );
    return (
        <nav
            aria-label={t('nav.label')}
            data-no-swipe
            className="fixed inset-x-0 bottom-0 z-30 mx-auto mb-[calc(10px+env(safe-area-inset-bottom))] grid h-[70px] w-[calc(100%-24px)] max-w-md grid-cols-5 rounded-[26px] bg-nav shadow-float"
        >
            {item('/', t('nav.games'), Home, true)}
            {item('/posiciones', t('nav.standings'), BarChart3, false, ['/lideres', '/estadisticas'])}
            <button type="button" onClick={onLive} aria-label={t('nav.live')} className="relative flex items-center justify-center">
                <span className="-mt-8 flex h-[62px] w-[62px] items-center justify-center rounded-full border-[5px] border-bg bg-live text-white shadow-float">
                    <Radio className="h-6 w-6" />
                </span>
                {liveCount > 0 && (
                    <span className="absolute right-2 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-extrabold text-live">{liveCount}</span>
                )}
            </button>
            {item('/fantasy', t('nav.fantasy'), Sparkles)}
            {item('/mas', t('nav.more'), Menu)}
        </nav>
    );
};

// Hoja del botón rojo de la barra: los juegos en vivo de la liga (quién batea y las bases); si no hay, los próximos tres
// con su fecha. Al tocar o pasar por un juego se precarga, para que abra ya listo. Los equipos y el bateador abren su
// página (la hoja es de toda la app: se cierra al irse a cualquiera de ellos).
const LiveSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const { t, i18n } = useTranslation();
    const { activeLeague } = useLeague();
    const schedule = useSchedule(activeLeague);
    const prefetch = usePrefetchGame();
    // Mientras está abierta, la hora avanza sola (el que ya empezó sale de «próximos»)
    const now = useNow(30000, open);
    const games = schedule.data?.games ?? [];
    const live = games.filter((game) => game.state === 'live');
    const next = games.filter((game) => game.state === 'preview' && new Date(game.date).getTime() > now).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    const list = live.length ? live : next;

    return (
        <BottomSheet open={open} onClose={onClose} title={live.length ? t('live.title') : t('live.noneTitle')}>
            {waitingForNetwork(schedule) ? (
                <div className="pb-2">
                    <OfflineState />
                </div>
            ) : schedule.isPending ? (
                <div className="flex flex-col gap-2 pb-2">
                    {[0, 1, 2].map((index) => (
                        <Skeleton key={index} className="h-16 rounded-2xl" />
                    ))}
                </div>
            ) : schedule.isError && !schedule.data ? (
                <div className="pb-2">
                    <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} compact />
                </div>
            ) : (
                <>
                    {!live.length && <p className="mb-3 text-sm text-muted">{next.length ? t('live.next') : t('live.nothing')}</p>}
                    <ul className="flex flex-col gap-2 pb-2">
                        {list.map((game) => {
                            const playing = game.state === 'live' ? game.live : null;
                            const between = playing?.inningState === 'Middle' || playing?.inningState === 'End';
                            // Detenido (lluvia…): la pastilla azul y, abajo, en qué entrada se paró
                            const delay = delayOf(game.detailedState);
                            const inning = playing ? inningName({ n: playing.inning, isTop: playing.isTop, state: playing.inningState }, i18n.language, true) : '';
                            const warm = () => {
                                prefetch(game.gamePk).catch(() => undefined);
                            };
                            const team = (side: 'away' | 'home') => (
                                <TeamLink id={game[side].id} onClick={onClose} className={OVER_CARD}>
                                    {game[side].abbrev}
                                </TeamLink>
                            );
                            const logo = (side: 'away' | 'home') => (
                                <TeamLink id={game[side].id} decorative onClick={onClose} className={`${OVER_CARD} flex shrink-0`}>
                                    <TeamLogo team={game[side]} size={36} />
                                </TeamLink>
                            );
                            return (
                                <li key={game.gamePk} onPointerEnter={warm} onTouchStart={warm} className="relative isolate flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
                                    <CardLink to={`/juego/${game.gamePk}`} onClick={onClose} onFocus={warm} label={t('card.openGame', { away: teamDisplayName(game.away, i18n.language), home: teamDisplayName(game.home, i18n.language) })} />
                                    {logo('away')}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-bold">
                                            {team('away')} {game.away.score ?? ''} <span className="text-muted">·</span> {team('home')} {game.home.score ?? ''}
                                        </span>
                                        {playing && delay ? (
                                            !delay.start && playing.inning ? (
                                                <span className="block truncate text-xs text-muted">{t('delay.stoppedAt', { inning: inningName({ n: playing.inning, isTop: playing.isTop, state: playing.inningState }, i18n.language) })}</span>
                                            ) : null
                                        ) : playing ? (
                                            playing.batter && (
                                                <span className="block truncate text-xs text-muted">
                                                    {withNodes(t('card.batting', { name: slot('name') }), {
                                                        name: (
                                                            <PlayerLink id={playing.batter.id} onClick={onClose} className={OVER_CARD}>
                                                                {playing.batter.name}
                                                            </PlayerLink>
                                                        )
                                                    })}
                                                </span>
                                            )
                                        ) : (
                                            <span className="block truncate text-xs text-muted">{formatShortDate(game.date, i18n.language)}</span>
                                        )}
                                    </span>
                                    {playing && !between && <FieldButton gamePk={game.gamePk} runners={playing.runners} size={24} color={(playing.isTop ? game.away : game.home).color} className={OVER_CARD} onLeave={onClose} />}
                                    {delay && (playing || game.state === 'preview') ? (
                                        <DelayPill delay={delay} />
                                    ) : (
                                        <span className={`pill shrink-0 ${playing ? 'bg-live text-white' : 'bg-raised text-muted'}`}>
                                            {playing && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
                                            {playing ? inning : formatTime(game.date, i18n.language)}
                                        </span>
                                    )}
                                    {logo('home')}
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </BottomSheet>
    );
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { i18n } = useTranslation();
    const location = useLocation();
    const { activeLeague } = useLeague();
    const schedule = useSchedule(activeLeague);
    const [liveOpen, setLiveOpen] = useState(false);
    const liveCount = schedule.data?.games.filter((game) => game.state === 'live').length ?? 0;
    // Deslizar a la derecha vuelve: se mueve la página (main), no la barra de abajo
    const shellRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef<HTMLElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    useSwipeBack(shellRef, pageRef, backdropRef);

    useEffect(() => {
        document.documentElement.lang = i18n.language.startsWith('en') ? 'en' : 'es';
    }, [i18n.language]);

    // Volver arriba al cambiar de página
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [location.pathname]);

    // En la página de un juego la barra no estorba el contenido de abajo. El terreno (tocar el diamante de un juego en
    // vivo) se abre desde cualquier página, también desde la hoja de En vivo
    return (
        <FieldViewProvider>
        <div ref={shellRef} className="min-h-screen pb-[calc(96px+env(safe-area-inset-bottom))]">
            <OfflineBanner />
            {/* Lo que queda a la izquierda de la página mientras se desliza para volver: oscurecido, con la sombra de su borde */}
            <div ref={backdropRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-20 hidden bg-black/10">
                <span className="absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-black/15 to-transparent" />
            </div>
            <main ref={pageRef} className="mx-auto max-w-3xl">
                <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
            </main>
            {/* Avisos uno sobre otro (no se tapan) y encima de las hojas abiertas */}
            <div data-no-swipe className="pointer-events-none fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md flex-col gap-2 [&>*]:pointer-events-auto">
                <UpdateToast />
                <Toast />
            </div>
            <BottomNav onLive={() => setLiveOpen(true)} liveCount={liveCount} />
            <LiveSheet open={liveOpen} onClose={() => setLiveOpen(false)} />
            <InstallSheet />
            <FantasyWatcher />
            <AlertsWatcher />
        </div>
        </FieldViewProvider>
    );
};
