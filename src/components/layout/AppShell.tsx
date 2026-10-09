import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart3, CalendarDays, Check, ChevronDown, Monitor, Moon, Sun, Trophy } from 'lucide-react';
import { useLeague } from '../../store/LeagueContext';
import { usePreferences } from '../../store/preferences';
import { InstallPWA } from '../common/InstallPWA';
import { OfflineBanner } from './OfflineBanner';
import { UpdateToast } from './UpdateToast';
import { Logo } from '../brand/Logo';

const NAV = [
    { to: '/', key: 'nav.games', icon: CalendarDays, end: true },
    { to: '/posiciones', key: 'nav.standings', icon: Trophy, end: false },
    { to: '/lideres', key: 'nav.leaders', icon: BarChart3, end: false }
];

const LeagueMenu: React.FC = () => {
    const { t } = useTranslation();
    const { leagues, leagueConfig, setActiveLeague } = useLeague();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (event: MouseEvent | KeyboardEvent) => {
            if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', close);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="flex items-center gap-2 rounded-full border border-line/15 bg-surface py-1.5 pl-2.5 pr-2 text-sm font-semibold hover:border-line/30"
            >
                <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                <span className="max-w-[9rem] truncate">{t(`leagues.${leagueConfig.id}.name`)}</span>
                <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <ul role="listbox" aria-label={t('leagues.choose')} className="card absolute left-0 top-full z-40 mt-2 w-64 animate-fade-up overflow-hidden p-1">
                    {leagues.map((league) => {
                        const active = league.id === leagueConfig.id;
                        return (
                            <li key={league.id}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    onClick={() => {
                                        setActiveLeague(league.id);
                                        setOpen(false);
                                    }}
                                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-raised ${active ? 'bg-raised' : ''}`}
                                >
                                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: league.color }} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold">{t(`leagues.${league.id}.name`)}</span>
                                        <span className="block truncate text-xs text-muted">{t(`leagues.${league.id}.fullName`)}</span>
                                    </span>
                                    {active && <Check className="h-4 w-4 text-accent-ink" />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

const ThemeButton: React.FC = () => {
    const { t } = useTranslation();
    const { theme, cycleTheme } = usePreferences();
    const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
    return (
        <button type="button" onClick={cycleTheme} className="rounded-full p-2 text-muted hover:bg-raised hover:text-ink" aria-label={t('theme.label', { mode: t(`theme.${theme}`) })} title={t(`theme.${theme}`)}>
            <Icon className="h-[18px] w-[18px]" />
        </button>
    );
};

const LanguageButton: React.FC = () => {
    const { t, i18n } = useTranslation();
    const next = i18n.language.startsWith('en') ? 'es' : 'en';
    return (
        <button
            type="button"
            onClick={() => i18n.changeLanguage(next)}
            className="rounded-full px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-muted hover:bg-raised hover:text-ink"
            aria-label={t('a11y.selectLanguage')}
        >
            {next}
        </button>
    );
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { t, i18n } = useTranslation();
    const location = useLocation();

    useEffect(() => {
        document.documentElement.lang = i18n.language.startsWith('en') ? 'en' : 'es';
    }, [i18n.language]);

    // Volver arriba al cambiar de página
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [location.pathname]);

    return (
        <div className="min-h-screen pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-10">
            <header className="sticky top-0 z-30 border-b border-line/10 bg-bg/85 backdrop-blur-md">
                <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
                    <Link to="/" aria-label={t('nav.home')} className="shrink-0">
                        <Logo />
                    </Link>
                    <LeagueMenu />
                    <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label={t('nav.label')}>
                        {NAV.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) => `rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${isActive ? 'bg-raised text-ink' : 'text-muted hover:text-ink'}`}
                            >
                                {t(item.key)}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="ml-auto flex items-center gap-0.5">
                        <InstallPWA />
                        <LanguageButton />
                        <ThemeButton />
                    </div>
                </div>
            </header>

            <OfflineBanner />
            <main className="mx-auto max-w-6xl px-4 pt-4">{children}</main>
            <UpdateToast />

            <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/10 bg-surface/95 backdrop-blur-md safe-bottom md:hidden" aria-label={t('nav.label')}>
                <div className="grid h-16 grid-cols-3">
                    {NAV.map(({ to, key, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) => `flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? 'text-accent-ink' : 'text-muted'}`}
                        >
                            <Icon className="h-5 w-5" />
                            {t(key)}
                        </NavLink>
                    ))}
                </div>
            </nav>
        </div>
    );
};
