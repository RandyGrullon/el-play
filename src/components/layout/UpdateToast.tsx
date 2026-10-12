import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, X } from 'lucide-react';

const CHECK_MS = 5 * 60 * 1000;

// Avisa cuando hay una versión nueva desplegada (public/version.json cambia con cada build)
export const UpdateToast: React.FC = () => {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);
    const baseline = useRef<string | null>(null);

    useEffect(() => {
        if (import.meta.env.DEV) return;
        let stopped = false;
        const check = async () => {
            try {
                const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
                if (!response.ok) return;
                const { version } = (await response.json()) as { version: string };
                if (!baseline.current) baseline.current = version;
                else if (version !== baseline.current && !stopped) setVisible(true);
            } catch {
                /* sin red: se intenta en la próxima vuelta */
            }
        };
        check();
        const interval = setInterval(check, CHECK_MS);
        const onVisible = () => document.visibilityState === 'visible' && check();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            stopped = true;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    if (!visible) return null;
    return (
        <div role="status" className="fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md animate-fade-up items-center gap-3 rounded-2xl bg-ink p-3 pl-4 text-bg shadow-xl">
            <p className="flex-1 text-sm font-medium">{t('update.available')}</p>
            <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white">
                <RefreshCw className="h-4 w-4" />
                {t('update.reload')}
            </button>
            <button type="button" onClick={() => setVisible(false)} className="rounded-full p-1.5 opacity-70 hover:opacity-100" aria-label={t('common.close')}>
                <X className="h-4 w-4" />
            </button>
        </div>
    );
};
