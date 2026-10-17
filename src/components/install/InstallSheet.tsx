import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { Segmented } from '../ui/Segmented';
import { TutorialArt, type SceneKind } from './TutorialArt';
import { closeInstallSheet, isAndroid, isIOS, isIOSSafari, openInBrowserUrl, promptInstall, safariVersion, useInstallMode, useInstallSheet } from '../../lib/install';

type Platform = 'ios' | 'android';
interface Step {
    scene: SceneKind;
    text: string;
}

// Tutorial paso a paso para instalar El Play. Detecta el teléfono y el navegador y arranca en su guía;
// con el selector se ve la del otro sistema (para ayudar a alguien más). En Android con el aviso de Chrome
// basta un toque: el botón va arriba y los pasos explican qué sale después.
export const InstallSheet: React.FC = () => {
    const { t } = useTranslation();
    const open = useInstallSheet();
    const mode = useInstallMode();
    const [done, setDone] = useState(false);
    const detected: Platform = isIOS() ? 'ios' : 'android';
    const [platform, setPlatform] = useState<Platform>(detected);
    const [step, setStep] = useState(0);
    const touch = useRef<number | null>(null);

    useEffect(() => {
        if (!open) return;
        setPlatform(detected);
        setStep(0);
    }, [open, detected]);
    useEffect(() => {
        if (open && mode === 'installed') setDone(true);
    }, [open, mode]);
    useEffect(() => setStep(0), [platform]);

    const steps = useMemo<Step[]>(() => {
        const finish: Step = { scene: platform === 'ios' ? 'home' : 'home-android', text: t('install.tutorial.done') };
        if (platform === 'android') {
            return mode === 'prompt'
                ? [{ scene: 'app-button', text: t('install.tutorial.tapInstall') }, { scene: 'android-dialog', text: t('install.androidConfirm') }, finish]
                : [
                      { scene: 'chrome-android-bar', text: t('install.androidMenu') },
                      { scene: 'chrome-menu', text: t('install.androidInstall') },
                      { scene: 'android-dialog', text: t('install.androidConfirm') },
                      finish
                  ];
        }
        // En un iPhone se usa la guía de su navegador; viéndola desde otro teléfono, la de Safari actual
        if (isIOS() && !isIOSSafari() && mode !== 'in-app') {
            return [
                { scene: 'chrome-ios-bar', text: t('install.browserShare') },
                { scene: 'share-sheet', text: t('install.iosAdd') },
                { scene: 'add-ios-old', text: t('install.iosConfirm') },
                finish
            ];
        }
        if (isIOS() && safariVersion() > 0 && safariVersion() < 26) {
            return [
                { scene: 'safari-old-bar', text: t('install.iosShareBottom') },
                { scene: 'share-sheet', text: t('install.iosAdd') },
                { scene: 'add-ios-old', text: t('install.iosConfirm') },
                finish
            ];
        }
        return [
            { scene: 'safari26-bar', text: t('install.iosMore') },
            { scene: 'safari-menu', text: t('install.iosShare') },
            { scene: 'share-sheet', text: t('install.iosAdd') },
            { scene: 'add-ios', text: t('install.iosWebApp') },
            finish
        ];
    }, [platform, mode, t]);

    const close = () => {
        closeInstallSheet();
        setDone(false);
    };
    const install = async () => {
        if (await promptInstall()) setDone(true);
    };
    const go = (delta: number) => setStep((current) => Math.max(0, Math.min(steps.length - 1, current + delta)));

    const deviceLabel =
        mode === 'in-app'
            ? t('install.tutorial.detectedInApp')
            : isIOS()
              ? t('install.tutorial.detectedIphone', { browser: isIOSSafari() ? 'Safari' : t('install.tutorial.otherBrowser') })
              : isAndroid()
                ? t('install.tutorial.detectedAndroid')
                : t('install.tutorial.detectedDesktop');

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

                {mode === 'prompt' && platform === 'android' && (
                    <button type="button" onClick={install} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-extrabold text-white shadow-float">
                        <Download className="h-5 w-5" />
                        {t('install.tutorial.oneTap')}
                    </button>
                )}

                <Segmented<Platform>
                    size="sm"
                    label={t('install.tutorial.platform')}
                    value={platform}
                    onChange={setPlatform}
                    options={[
                        { value: 'ios', label: 'iPhone' },
                        { value: 'android', label: 'Android' }
                    ]}
                />

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
                        <TutorialArt kind={current.scene} />
                    </div>
                </div>

                <div aria-live="polite">
                    <p className="eyebrow">{t('install.tutorial.step', { n: step + 1, total: steps.length })}</p>
                    <p className="mt-1 min-h-[44px] text-[15px] font-semibold leading-snug">{current.text}</p>
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
