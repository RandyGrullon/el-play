import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Menu, Radio, Sparkles, BarChart3 } from 'lucide-react';
import { useLeague } from '../../store/LeagueContext';
import { useSchedule } from '../../lib/queries';
import { formatTime } from '../../lib/format';
import { inningName } from '../../lib/baseball';
import { BottomSheet } from '../ui/BottomSheet';
import { TeamLogo } from '../ui/TeamLogo';
import { OfflineBanner } from './OfflineBanner';
import { UpdateToast } from './UpdateToast';
import { InstallSheet } from '../install/InstallSheet';

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

const LiveSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const { t, i18n } = useTranslation();
    const { activeLeague } = useLeague();
    const schedule = useSchedule(activeLeague);
    const games = schedule.data?.games ?? [];
    const live = games.filter((game) => game.state === 'live');
    const next = games.filter((game) => game.state === 'preview' && new Date(game.date).getTime() > Date.now()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    const list = live.length ? live : next;

    return (
        <BottomSheet open={open} onClose={onClose} title={live.length ? t('live.title') : t('live.noneTitle')}>
            {!live.length && <p className="mb-3 text-sm text-muted">{next.length ? t('live.next') : t('live.nothing')}</p>}
            <ul className="flex flex-col gap-2 pb-2">
                {list.map((game) => (
                    <li key={game.gamePk}>
                        <Link to={`/juego/${game.gamePk}`} onClick={onClose} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
                            <TeamLogo team={game.away} size={36} />
                            <span className="flex-1 font-bold">
                                {game.away.abbrev} {game.away.score ?? ''} <span className="text-muted">·</span> {game.home.abbrev} {game.home.score ?? ''}
                            </span>
                            <span className={`pill ${game.state === 'live' ? 'bg-live text-white' : 'bg-raised text-muted'}`}>
                                {game.state === 'live' && game.live ? inningName({ n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState }, i18n.language, true) : formatTime(game.date, i18n.language)}
                            </span>
                            <TeamLogo team={game.home} size={36} />
                        </Link>
                    </li>
                ))}
            </ul>
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

    useEffect(() => {
        document.documentElement.lang = i18n.language.startsWith('en') ? 'en' : 'es';
    }, [i18n.language]);

    // Volver arriba al cambiar de página
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [location.pathname]);

    // En la página de un juego la barra no estorba el contenido de abajo
    return (
        <div className="min-h-screen pb-[calc(96px+env(safe-area-inset-bottom))]">
            <OfflineBanner />
            <main className="mx-auto max-w-3xl">{children}</main>
            <UpdateToast />
            <BottomNav onLive={() => setLiveOpen(true)} liveCount={liveCount} />
            <LiveSheet open={liveOpen} onClose={() => setLiveOpen(false)} />
            <InstallSheet />
        </div>
    );
};
