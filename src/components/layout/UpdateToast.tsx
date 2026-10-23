import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, X } from 'lucide-react';
import { applyUpdate, fetchServerVersion, isOutdated, markIconSeen, shouldShowIconNotice } from '../../lib/appUpdate';
import { LogoMark } from '../brand/Logo';

const CHECK_MS = 5 * 60 * 1000;
// Recién abierta la app se actualiza sola (todavía no se está usando); después solo se avisa
const SILENT_WINDOW_MS = 15 * 1000;
const TRIED_KEY = 'el-play-update-tried';

type State = 'idle' | 'available' | 'updating';

// Avisa (o aplica) la versión nueva cuando lo que corre no coincide con public/version.json del servidor
export const UpdateToast: React.FC = () => {
    const { t } = useTranslation();
    const [state, setState] = useState<State>('idle');
    const [iconNotice, setIconNotice] = useState(false);

    useEffect(() => {
        if (import.meta.env.DEV) return;
        setIconNotice(shouldShowIconNotice());
        let stopped = false;
        const update = () => {
            setState('updating');
            applyUpdate();
        };
        const check = async () => {
            const server = await fetchServerVersion();
            if (stopped || !isOutdated(server)) return;
            let tried: string | null = null;
            try {
                tried = sessionStorage.getItem(TRIED_KEY);
                sessionStorage.setItem(TRIED_KEY, server!);
            } catch {
                /* sin almacenamiento */
            }
            // Una sola vez por versión: si tras recargar sigue vieja, se deja el botón en vez de recargar en bucle
            if (performance.now() < SILENT_WINDOW_MS && tried !== server) update();
            else setState((current) => (current === 'idle' ? 'available' : current));
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

    const closeIconNotice = () => {
        markIconSeen();
        setIconNotice(false);
    };

    if (state !== 'idle') {
        return (
            <div role="status" className="flex w-full animate-fade-up items-center gap-3 rounded-2xl bg-ink p-3 pl-4 text-bg shadow-xl">
                <p className="flex-1 text-sm font-medium">{state === 'updating' ? t('update.updating') : t('update.available')}</p>
                {state === 'updating' ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setState('updating');
                                applyUpdate();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white"
                        >
                            <RefreshCw className="h-4 w-4" />
                            {t('update.reload')}
                        </button>
                        <button type="button" onClick={() => setState('idle')} className="rounded-full p-1.5 opacity-70 hover:opacity-100" aria-label={t('common.close')}>
                            <X className="h-4 w-4" />
                        </button>
                    </>
                )}
            </div>
        );
    }

    if (!iconNotice) return null;
    return (
        <div role="dialog" aria-labelledby="icon-notice-title" className="w-full animate-fade-up rounded-card bg-surface p-4 shadow-float">
            <div className="flex items-start gap-3">
                <LogoMark size={48} className="shrink-0" />
                <div className="min-w-0 flex-1">
                    <p id="icon-notice-title" className="font-extrabold">{t('update.iconTitle')}</p>
                    <p className="mt-1 text-sm text-muted">{t('update.iconBody')}</p>
                </div>
                <button type="button" onClick={closeIconNotice} className="-mr-1 -mt-1 rounded-full p-1.5 text-muted" aria-label={t('common.close')}>
                    <X className="h-4 w-4" />
                </button>
            </div>
            <button type="button" onClick={closeIconNotice} className="mt-3 h-10 w-full rounded-full bg-ink text-sm font-bold text-bg">
                {t('update.iconOk')}
            </button>
        </div>
    );
};
