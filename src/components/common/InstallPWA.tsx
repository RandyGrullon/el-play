import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, PlusSquare, Share, X } from 'lucide-react';

interface InstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPWA: React.FC = () => {
    const { t } = useTranslation();
    const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
        if (standalone) return;
        setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
        const handler = (event: Event) => {
            event.preventDefault();
            setDeferred(event as InstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    if (!deferred && !isIOS) return null;

    const install = async () => {
        if (isIOS) {
            setShowHelp(true);
            return;
        }
        if (!deferred) return;
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
    };

    return (
        <>
            <button type="button" onClick={install} className="rounded-full p-2 text-muted hover:bg-raised hover:text-ink" aria-label={t('install.button')} title={t('install.button')}>
                <Download className="h-[18px] w-[18px]" />
            </button>
            {showHelp && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setShowHelp(false)}>
                    <div className="card relative w-full max-w-sm animate-fade-up p-5" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="install-title">
                        <button type="button" onClick={() => setShowHelp(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-muted hover:bg-raised" aria-label={t('common.close')}>
                            <X className="h-4 w-4" />
                        </button>
                        <h2 id="install-title" className="display text-2xl">{t('install.iosTitle')}</h2>
                        <ol className="mt-4 space-y-3 text-sm">
                            <li className="flex items-center gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-raised text-xs font-bold">1</span>
                                <span>{t('install.step1')} <Share className="mx-1 inline h-4 w-4" /></span>
                            </li>
                            <li className="flex items-center gap-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-raised text-xs font-bold">2</span>
                                <span>{t('install.step2')} <PlusSquare className="mx-1 inline h-4 w-4" /></span>
                            </li>
                        </ol>
                        <button type="button" onClick={() => setShowHelp(false)} className="mt-5 w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white">
                            {t('install.gotIt')}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
