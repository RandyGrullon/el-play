import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLeague } from '../store/LeagueContext';
import { usePreferences, type AnimationMode, type ThemePreference } from '../store/preferences';
import { LogoMark } from '../components/brand/Logo';
import { Segmented } from '../components/ui/Segmented';
import { InstallRow } from '../components/install/InstallCard';
import { AccountCard } from '../components/account/AccountCard';

// "Más": liga, tema, idioma e instalación (antes estaban en la barra de arriba)
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const MorePage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { leagues, activeLeague, setActiveLeague } = useLeague();
    const { theme, setTheme, animationMode, setAnimationMode } = usePreferences();
    const lang = i18n.language.startsWith('en') ? 'en' : 'es';

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
                        onChange={(value) => i18n.changeLanguage(value)}
                        options={[
                            { value: 'es', label: 'Español' },
                            { value: 'en', label: 'English' }
                        ]}
                    />
                </div>
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

            <section className="card flex items-center gap-3 p-4">
                <LogoMark size={44} />
                <div className="flex-1">
                    <p className="font-extrabold">El Play</p>
                    <p className="text-sm text-muted">{t('more.tagline')}</p>
                </div>
                <Link to="/privacidad" className="text-sm font-semibold text-accent-ink">
                    {t('privacy.title')}
                </Link>
            </section>
        </div>
    );
};
