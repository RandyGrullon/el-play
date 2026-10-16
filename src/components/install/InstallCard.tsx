import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Download, X } from 'lucide-react';
import { LogoMark } from '../brand/Logo';
import { bannerDismissed, dismissBanner, requestInstall, useInstallMode, type InstallMode } from '../../lib/install';

const canInstall = (mode: InstallMode) => mode !== 'installed' && mode !== 'unsupported';

// Tarjeta de la portada para quien entra desde el navegador; se puede cerrar y vuelve a salir en dos semanas
export const InstallBanner: React.FC = () => {
    const { t } = useTranslation();
    const mode = useInstallMode();
    const [hidden, setHidden] = useState(bannerDismissed);

    if (hidden || !canInstall(mode)) return null;

    const close = () => {
        dismissBanner();
        setHidden(true);
    };

    return (
        <section aria-labelledby="install-banner-title" className="mx-4 flex animate-fade-up items-center gap-3 rounded-card bg-surface p-3 pr-2 shadow-card">
            <LogoMark size={44} className="shrink-0" />
            <div className="min-w-0 flex-1">
                <p id="install-banner-title" className="font-extrabold leading-tight">{t('install.bannerTitle')}</p>
                <p className="text-[13px] leading-snug text-muted">{t('install.bannerBody')}</p>
            </div>
            <button type="button" onClick={requestInstall} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-extrabold text-white">
                <Download className="h-4 w-4" />
                {t('install.short')}
            </button>
            <button type="button" onClick={close} className="shrink-0 rounded-full p-1.5 text-muted" aria-label={t('install.notNow')}>
                <X className="h-4 w-4" />
            </button>
        </section>
    );
};

// Fila de «Más»: siempre a mano mientras no esté instalada
export const InstallRow: React.FC = () => {
    const { t } = useTranslation();
    const mode = useInstallMode();
    if (!canInstall(mode)) return null;

    return (
        <button type="button" onClick={requestInstall} className="card flex w-full items-center gap-3 p-4 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-white">
                <Download className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block font-extrabold">{t('install.button')}</span>
                <span className="block text-sm text-muted">{t('install.bannerBody')}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted" />
        </button>
    );
};
