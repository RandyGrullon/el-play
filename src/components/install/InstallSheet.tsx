import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { Segmented } from '../ui/Segmented';
import { TutorialArt } from './TutorialArt';
import { guideFor } from './steps';
import { BROWSERS, closeInstallSheet, detectBrowser, isIOS, openInBrowserUrl, promptInstall, safariVersion, useInstallMode, useInstallSheet, type InstallBrowser, type InstallPlatform } from '../../lib/install';

// Tutorial paso a paso para instalar El Play. Detecta el sistema y el navegador y arranca en su guía; con los
// selectores se ve la de otro sistema o de otro navegador (cada uno instala distinto, y sirve para ayudar a alguien más).
// En Android con el aviso de Chrome basta un toque: el botón va arriba y los pasos explican qué sale después.
export const InstallSheet: React.FC = () => {
    const { t } = useTranslation();
    const open = useInstallSheet();
    const mode = useInstallMode();
    const [done, setDone] = useState(false);
    const detected = useMemo(() => detectBrowser(), []);
    const [platform, setPlatform] = useState<InstallPlatform>(detected.platform);
    const [browser, setBrowser] = useState<InstallBrowser>(detected.browser);
    const [step, setStep] = useState(0);
    const touch = useRef<number | null>(null);

    useEffect(() => {
        if (!open) return;
        setPlatform(detected.platform);
        setBrowser(detected.browser);
        setStep(0);
    }, [open, detected]);
    useEffect(() => {
        if (open && mode === 'installed') setDone(true);
    }, [open, mode]);
    useEffect(() => setStep(0), [platform, browser]);

    // Otro sistema: su navegador más común (o el detectado, si se vuelve al propio)
    const choosePlatform = (next: InstallPlatform) => {
        setPlatform(next);
        setBrowser(next === detected.platform ? detected.browser : BROWSERS[next][0]);
    };
    const ownBrowser = platform === detected.platform && browser === detected.browser;
    // El navegador elegido siempre a la vista en la fila de botones (el tuyo puede estar al final)
    const chips = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        // Solo de lado (scrollIntoView también movería la hoja hacia abajo)
        const row = chips.current;
        const chip = row?.querySelector<HTMLElement>('[aria-checked="true"]');
        if (row && chip) row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    }, [open, platform, browser]);

    const guide = useMemo(
        () => guideFor(platform, browser, { prompt: mode === 'prompt' && ownBrowser, safariNew: !(isIOS() && safariVersion() > 0 && safariVersion() < 26) }, t),
        [platform, browser, mode, ownBrowser, t]
    );
    const steps = guide.steps;

    const close = () => {
        closeInstallSheet();
        setDone(false);
    };
    const install = async () => {
        if (await promptInstall()) setDone(true);
    };
    const go = (delta: number) => setStep((current) => Math.max(0, Math.min(steps.length - 1, current + delta)));

    const names = { device: t(`install.platformsA.${platform}`), browser: t(`install.browsers.${browser}`) };
    const deviceLabel = mode === 'in-app' && ownBrowser ? t('install.tutorial.detectedInApp') : ownBrowser ? t('install.tutorial.detected', names) : t('install.tutorial.viewing', names);

    if (done || mode === 'installed') {
        return (
            <BottomSheet open={open} onClose={close} title={t('install.title')}>
                <div className="flex flex-col items-center py-4 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white">
                        <Check className="h-7 w-7" />
                    </span>
                    <p className="mt-3 text-lg font-extrabold">{t('install.doneTitle')}</p>
                    <p className="mt-1 text-sm text-muted">{t('install.doneBody')}</p>
                </div>
            </BottomSheet>
        );
    }

    const current = steps[Math.min(step, steps.length - 1)];
    const last = step >= steps.length - 1;

    return (
        <BottomSheet open={open} onClose={close} title={t('install.title')}>
            <div className="space-y-3">
                <p className="text-sm text-muted">{deviceLabel}</p>

                {mode === 'in-app' && (
                    <div className="rounded-2xl bg-live/10 p-3">
                        <p className="text-sm">{t('install.inAppBody')}</p>
                        <a href={openInBrowserUrl()} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-sm font-extrabold text-white">
                            <ExternalLink className="h-4 w-4" />
                            {isIOS() ? t('install.openSafari') : t('install.openChrome')}
                        </a>
                        <p className="mt-2 text-center text-xs text-muted">{t('install.inAppFallback')}</p>
                    </div>
                )}

                {mode === 'prompt' && platform === 'android' && ownBrowser && (
                    <button type="button" onClick={install} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-extrabold text-white shadow-float">
                        <Download className="h-5 w-5" />
                        {t('install.tutorial.oneTap')}
                    </button>
                )}

                <Segmented<InstallPlatform>
                    size="sm"
                    label={t('install.tutorial.platform')}
                    value={platform}
                    onChange={choosePlatform}
                    options={(['ios', 'android', 'desktop'] as const).map((value) => ({ value, label: t(`install.platforms.${value}`) }))}
                />

                <div ref={chips} className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none" role="radiogroup" aria-label={t('install.tutorial.browser')}>
                    {BROWSERS[platform].map((id) => {
                        const mine = platform === detected.platform && id === detected.browser;
                        return (
                            <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={browser === id}
                                onClick={() => setBrowser(id)}
                                className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold ${browser === id ? 'bg-ink text-bg' : 'bg-raised text-muted'}`}
                            >
                                {t(`install.browsers.${id}`)}
                                {mine && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${browser === id ? 'bg-bg/20' : 'bg-accent/15 text-accent-ink'}`}>{t('install.tutorial.yours')}</span>}
                            </button>
                        );
                    })}
                </div>

                <div
                    className="overflow-hidden rounded-3xl bg-raised p-2"
                    onTouchStart={(event) => {
                        touch.current = event.touches[0].clientX;
                    }}
                    onTouchEnd={(event) => {
                        if (touch.current === null) return;
                        const dx = event.changedTouches[0].clientX - touch.current;
                        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
                        touch.current = null;
                    }}
                >
                    <div key={`${platform}-${step}`} className="animate-fade-up">
                        <TutorialArt kind={current.scene} art={current.art} />
                    </div>
                </div>

                <div aria-live="polite">
                    <p className="eyebrow">{t('install.tutorial.step', { n: step + 1, total: steps.length })}</p>
                    <p className="mt-1 min-h-[44px] text-[15px] font-semibold leading-snug">{current.text}</p>
                    {guide.note && <p className="mt-1 text-xs text-muted">{guide.note}</p>}
                    {platform === 'desktop' && last && <p className="mt-1 text-xs text-muted">{t('install.tutorial.phoneTip')}</p>}
                </div>

                <div className="flex items-center justify-between gap-3 pb-1">
                    <button type="button" onClick={() => go(-1)} disabled={step === 0} className="flex h-11 w-11 items-center justify-center rounded-full bg-raised disabled:opacity-30" aria-label={t('install.tutorial.prev')}>
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="flex gap-1.5" role="tablist" aria-label={t('install.tutorial.steps')}>
                        {steps.map((_, index) => (
                            <button
                                key={index}
                                type="button"
                                role="tab"
                                aria-selected={index === step}
                                aria-label={t('install.tutorial.step', { n: index + 1, total: steps.length })}
                                onClick={() => setStep(index)}
                                className={`h-2 rounded-full transition-all ${index === step ? 'w-6 bg-ink' : 'w-2 bg-faint/50'}`}
                            />
                        ))}
                    </div>
                    {last ? (
                        <button type="button" onClick={close} className="flex h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-bg">
                            {t('install.tutorial.gotIt')}
                        </button>
                    ) : (
                        <button type="button" onClick={() => go(1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-bg" aria-label={t('install.tutorial.next')}>
                            <ArrowRight className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </div>
        </BottomSheet>
    );
};
