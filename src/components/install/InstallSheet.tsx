import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Check, Download, ExternalLink, MoreHorizontal, MoreVertical, PlusSquare, Share, ToggleRight } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { LogoMark } from '../brand/Logo';
import { closeInstallSheet, isIOS, isIPad, openInBrowserUrl, promptInstall, safariVersion, useInstallMode, useInstallSheet } from '../../lib/install';

interface Step {
    text: string;
    icon?: React.ReactNode;
}

const icon = (Icon: typeof Share) => <Icon className="mx-1 inline h-[18px] w-[18px] align-[-3px] text-accent-ink" aria-hidden="true" />;

const Steps: React.FC<{ steps: Step[] }> = ({ steps }) => (
    <ol className="space-y-2.5">
        {steps.map((step, index) => (
            <li key={step.text} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-extrabold text-bg">{index + 1}</span>
                <span className="text-[15px] leading-snug">
                    {step.text}
                    {step.icon}
                </span>
            </li>
        ))}
    </ol>
);

// En Safari del iPhone los botones están en la barra de abajo, fuera de la página: una flecha señala dónde tocar
const PointDown: React.FC<{ align: 'center' | 'right'; label: string }> = ({ align, label }) => (
    <div className={`mt-4 flex ${align === 'right' ? 'justify-end pr-1' : 'justify-center'}`} aria-hidden="true">
        <span className="flex flex-col items-center gap-1 text-xs font-bold text-accent-ink">
            {label}
            <ArrowDown className="h-7 w-7 animate-bounce" />
        </span>
    </div>
);

// Guía para instalar según el teléfono y el navegador; en Android es un solo botón y el sistema pide autorizar
export const InstallSheet: React.FC = () => {
    const { t } = useTranslation();
    const open = useInstallSheet();
    const mode = useInstallMode();
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (open && mode === 'installed') setDone(true);
    }, [open, mode]);

    const close = () => {
        closeInstallSheet();
        setDone(false);
    };

    const install = async () => {
        if (await promptInstall()) setDone(true);
    };

    const modernSafari = safariVersion() >= 26;
    const iPad = isIPad();

    let body: React.ReactNode;
    if (done || mode === 'installed') {
        body = (
            <div className="flex flex-col items-center py-4 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="h-7 w-7" />
                </span>
                <p className="mt-3 text-lg font-extrabold">{t('install.doneTitle')}</p>
                <p className="mt-1 text-sm text-muted">{t('install.doneBody')}</p>
            </div>
        );
    } else if (mode === 'prompt') {
        body = (
            <button type="button" onClick={install} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-extrabold text-white shadow-float">
                <Download className="h-5 w-5" />
                {t('install.button')}
            </button>
        );
    } else if (mode === 'in-app') {
        const ios = isIOS();
        body = (
            <>
                <p className="mb-3 text-[15px]">{t('install.inAppBody')}</p>
                <a href={openInBrowserUrl()} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-extrabold text-white shadow-float">
                    <ExternalLink className="h-5 w-5" />
                    {ios ? t('install.openSafari') : t('install.openChrome')}
                </a>
                <p className="mt-3 text-center text-sm text-muted">{t('install.inAppFallback')}</p>
            </>
        );
    } else if (mode === 'ios-safari') {
        const steps: Step[] = modernSafari
            ? [
                  { text: iPad ? t('install.iosMoreTop') : t('install.iosMore'), icon: icon(MoreHorizontal) },
                  { text: t('install.iosShare'), icon: icon(Share) },
                  { text: t('install.iosAdd'), icon: icon(PlusSquare) },
                  { text: t('install.iosWebApp'), icon: icon(ToggleRight) }
              ]
            : [
                  { text: iPad ? t('install.iosShareTop') : t('install.iosShareBottom'), icon: icon(Share) },
                  { text: t('install.iosAdd'), icon: icon(PlusSquare) },
                  { text: t('install.iosConfirm') }
              ];
        body = (
            <>
                <Steps steps={steps} />
                {!iPad && <PointDown align={modernSafari ? 'right' : 'center'} label={t('install.here')} />}
            </>
        );
    } else if (mode === 'ios-browser') {
        body = (
            <>
                <Steps
                    steps={[
                        { text: t('install.browserShare'), icon: icon(Share) },
                        { text: t('install.iosAdd'), icon: icon(PlusSquare) },
                        { text: t('install.iosConfirm') }
                    ]}
                />
                <a href={openInBrowserUrl()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-raised text-sm font-bold text-ink">
                    <ExternalLink className="h-4 w-4" />
                    {t('install.orSafari')}
                </a>
            </>
        );
    } else {
        body = (
            <Steps
                steps={[
                    { text: t('install.androidMenu'), icon: icon(MoreVertical) },
                    { text: t('install.androidInstall'), icon: icon(PlusSquare) },
                    { text: t('install.androidConfirm') }
                ]}
            />
        );
    }

    return (
        <BottomSheet open={open} onClose={close} title={t('install.title')}>
            {!done && mode !== 'installed' && (
                <div className="mb-4 flex items-center gap-3">
                    <LogoMark size={52} className="shrink-0" />
                    <p className="text-sm text-muted">{t('install.why')}</p>
                </div>
            )}
            {body}
        </BottomSheet>
    );
};
