import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Share2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLeague } from '../store/LeagueContext';
import { usePreferences, type AnimationMode, type ThemePreference } from '../store/preferences';
import { LogoMark } from '../components/brand/Logo';
import { Segmented } from '../components/ui/Segmented';
import { InstallRow } from '../components/install/InstallCard';
import { InviteSheet } from '../components/install/InviteSheet';
import { shortVersion } from '../lib/appUpdate';
import { AccountCard } from '../components/account/AccountCard';
import { ModeCard } from '../components/pro/ModeCard';
import { setLanguage } from '../i18n';
import { enablePush, pushConfig, pushSupported, type PushStatus } from '../lib/push';
import type { AlertKinds } from '../store/preferences';
import { Switch } from '../components/ui/Switch';

// "Más": liga, tema, idioma e instalación (antes estaban en la barra de arriba)
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const MorePage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { leagues, activeLeague, setActiveLeague } = useLeague();
    const { theme, setTheme, animationMode, setAnimationMode, largeText, setLargeText } = usePreferences();
    const lang = i18n.language.startsWith('en') ? 'en' : 'es';
    const [invite, setInvite] = useState(false);

    return (
        <div className="space-y-6 px-4 pt-5">
            <header>
                <h1 className="display text-[32px] leading-tight">{t('more.title')}</h1>
            </header>

            <InstallRow />

            <section aria-labelledby="more-account">
                <h2 id="more-account" className="eyebrow mb-2">{t('more.account')}</h2>
                <AccountCard />
            </section>

            <section aria-labelledby="more-mode">
                <h2 id="more-mode" className="eyebrow mb-2">{t('pro.section')}</h2>
                <ModeCard />
            </section>

            <section aria-labelledby="more-league">
                <h2 id="more-league" className="eyebrow mb-2">{t('leagues.choose')}</h2>
                <ul className="card divide-y divide-line/10 overflow-hidden">
                    {leagues.map((league) => {
                        const active = league.id === activeLeague;
                        return (
                            <li key={league.id}>
                                <button type="button" onClick={() => setActiveLeague(league.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-pressed={active}>
                                    <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: league.color }} />
                                    <span className="flex-1">
                                        <span className="block font-bold">{t(`leagues.${league.id}.name`)}</span>
                                        <span className="block text-sm text-muted">{t(`leagues.${league.id}.fullName`)}</span>
                                    </span>
                                    {active && <Check className="h-5 w-5 text-accent-ink" />}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section aria-labelledby="more-look" className="space-y-3">
                <h2 id="more-look" className="eyebrow">{t('more.look')}</h2>
                <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
                    <span className="font-semibold">{t('more.theme')}</span>
                    <Segmented<ThemePreference>
                        size="sm"
                        label={t('more.theme')}
                        value={theme}
                        onChange={setTheme}
                        options={[
                            { value: 'system', label: capitalize(t('theme.system')) },
                            { value: 'light', label: capitalize(t('theme.light')) },
                            { value: 'dark', label: capitalize(t('theme.dark')) }
                        ]}
                    />
                </div>
                <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
                    <span className="font-semibold">{t('more.language')}</span>
                    <Segmented<'es' | 'en'>
                        size="sm"
                        label={t('more.language')}
                        value={lang}
                        onChange={(value) => setLanguage(value)}
                        options={[
                            { value: 'es', label: 'Español' },
                            { value: 'en', label: 'English' }
                        ]}
                    />
                </div>
                <label className="card flex items-center justify-between gap-3 p-4">
                    <span className="min-w-0">
                        <span className="block font-semibold">{t('more.largeText')}</span>
                        <span className="block text-sm text-muted">{t('more.largeTextHint')}</span>
                    </span>
                    <Switch checked={largeText} onChange={setLargeText} />
                </label>
                <div className="card space-y-3 p-4">
                    <span className="block min-w-0">
                        <span className="block font-semibold">{t('more.playAnimations')}</span>
                        <span className="block text-sm text-muted">{t(`more.animationHint.${animationMode}`)}</span>
                    </span>
                    <Segmented<AnimationMode>
                        size="sm"
                        label={t('more.playAnimations')}
                        value={animationMode}
                        onChange={setAnimationMode}
                        options={[
                            { value: 'smart', label: t('more.animationMode.smart') },
                            { value: 'all', label: t('more.animationMode.all') },
                            { value: 'off', label: t('more.animationMode.off') }
                        ]}
                    />
                </div>
            </section>

            <AlertSettings />

            {/* Pasarle El Play a alguien: los pasos para instalar la web en otro teléfono, según su navegador */}
            <section className="card overflow-hidden">
                <button type="button" onClick={() => setInvite(true)} className="flex w-full items-center gap-3 p-4 text-left">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised">
                        <Share2 className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t('install.invite.row')}</span>
                        <span className="block text-sm text-muted">{t('install.invite.rowHint')}</span>
                    </span>
                    <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted" />
                </button>
            </section>
            <InviteSheet open={invite} onClose={() => setInvite(false)} />

            <section className="card flex items-center gap-3 p-4">
                <LogoMark size={44} />
                <div className="flex-1">
                    <p className="font-extrabold">El Play</p>
                    <p className="text-sm text-muted">{t('more.tagline')}</p>
                    {/* El commit de este build (el mismo de /version.json) */}
                    <p className="text-xs font-semibold tabular-nums text-faint">{t('more.version', { v: shortVersion() })}</p>
                </div>
            </section>

            <Link to="/privacidad" className="card flex items-center gap-3 p-4">
                <ShieldCheck className="h-5 w-5 text-muted" />
                <span className="flex-1 font-semibold">{t('privacy.title')}</span>
                <ChevronRight className="h-5 w-5 text-muted" />
            </Link>
        </div>
    );
};

const KINDS: (keyof AlertKinds)[] = ['soon', 'start', 'runs', 'lead', 'hr', 'hits', 'final', 'noHitter', 'fantasy'];

/** Qué avisos quiere y si llegan también con la app cerrada */
const AlertSettings: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { alertKinds, setAlertKind, subscribedGames, favoriteTeamId } = usePreferences();
    const [status, setStatus] = useState<PushStatus | 'checking'>('checking');
    const lang = i18n.language.startsWith('en') ? 'en' : 'es';
    const prefs = { games: subscribedGames, teams: favoriteTeamId ? [favoriteTeamId] : [], kinds: alertKinds, lang } as const;
    useEffect(() => {
        let alive = true;
        (async () => {
            if (!pushSupported()) return alive && setStatus('unsupported');
            const server = await pushConfig();
            if (!alive) return;
            if (!server.enabled) return setStatus('server-off');
            setStatus(Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off');
        })();
        return () => {
            alive = false;
        };
    }, []);

    return (
        <section aria-labelledby="more-alerts" className="space-y-3">
            <h2 id="more-alerts" className="eyebrow">{t('alertsMore.title')}</h2>
            <div className="card divide-y divide-line/10">
                {KINDS.map((kind) => (
                    <label key={kind} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="min-w-0">
                            <span className="block font-semibold">{t(`alertsMore.kinds.${kind}`)}</span>
                            <span className="block text-xs text-muted">{t(`alertsMore.hints.${kind}`)}</span>
                        </span>
                        <Switch checked={alertKinds[kind]} onChange={(on) => setAlertKind(kind, on)} />
                    </label>
                ))}
            </div>
            <div className="card space-y-2 p-4 text-sm">
                <p className="font-semibold">{t('alertsMore.closed')}</p>
                <p className="text-muted">{t(`alertsMore.status.${status}`)}</p>
                {status === 'off' && (
                    <button type="button" onClick={async () => setStatus(await enablePush(prefs))} className="mt-1 h-11 w-full rounded-full bg-ink text-sm font-bold text-bg">
                        {t('alertsMore.enable')}
                    </button>
                )}
                <p className="text-xs text-faint">{t('alertsMore.how')}</p>
            </div>
        </section>
    );
};
