// Pasarle El Play a alguien que no lo tiene: los pasos para instalar la web según su teléfono y su navegador (los mismos
// textos de la guía de instalación, steps.ts), más copiar o compartir el enlace. Igual que InstallGuide de la app.
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Share2 } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { Segmented } from '../ui/Segmented';
import { showToast } from '../../lib/toast';
import { BROWSERS, detectBrowser, type InstallBrowser, type InstallPlatform } from '../../lib/install';
import { guideFor } from './steps';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Los pasos en texto para otra persona: primero abrir la web en su navegador (dentro de Instagram o Facebook el enlace se
 * abre ahí mismo, así que los pasos empiezan por sacarlo al navegador) y luego los de su guía de instalación.
 */
export const inviteSteps = (platform: InstallPlatform, browser: InstallBrowser, host: string, t: Translate): { steps: string[]; note?: string } => {
    const guide = guideFor(platform, browser, { prompt: false, safariNew: true }, t);
    const open = browser === 'inapp' ? null : t('install.invite.open', { url: host, browser: t(`install.browsers.${browser}`) });
    return { steps: [open, ...guide.steps.map((step) => step.text)].filter((text): text is string => !!text), note: guide.note };
};

export const InviteSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const { t } = useTranslation();
    // Empieza por el mismo sistema de este teléfono (lo más probable es que se lo pase a alguien con uno igual)
    const [platform, setPlatform] = useState<InstallPlatform>(() => (detectBrowser().platform === 'android' ? 'android' : 'ios'));
    const [browser, setBrowser] = useState<InstallBrowser>(() => BROWSERS[platform][0]);
    const url = window.location.origin;
    const host = url.replace(/^https?:\/\//, '');
    const { steps, note } = useMemo(() => inviteSteps(platform, browser, host, t), [platform, browser, host, t]);

    const pickPlatform = (next: InstallPlatform) => {
        setPlatform(next);
        setBrowser(BROWSERS[next][0]);
    };
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            showToast(t('install.invite.copied'));
        } catch {
            /* sin portapapeles: el enlace se ve escrito en la hoja */
        }
    };
    const share = async () => {
        const text = t('install.invite.shareText');
        try {
            if (navigator.share) {
                await navigator.share({ title: 'El Play', text, url });
                return;
            }
            await navigator.clipboard.writeText(`${text} ${url}`);
            showToast(t('install.invite.copied'));
        } catch {
            /* cancelado */
        }
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={t('install.invite.title')}>
            <div className="space-y-3.5 pb-2">
                <p className="text-sm text-muted">{t('install.invite.body')}</p>
                <Segmented<InstallPlatform>
                    size="sm"
                    label={t('install.tutorial.platform')}
                    value={platform}
                    onChange={pickPlatform}
                    options={(['ios', 'android', 'desktop'] as const).map((value) => ({ value, label: t(`install.platforms.${value}`) }))}
                />
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none" role="radiogroup" aria-label={t('install.tutorial.browser')}>
                    {BROWSERS[platform].map((id) => (
                        <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={browser === id}
                            onClick={() => setBrowser(id)}
                            className={`flex h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-bold ${browser === id ? 'bg-ink text-bg' : 'bg-raised text-muted'}`}
                        >
                            {t(`install.browsers.${id}`)}
                        </button>
                    ))}
                </div>
                <ol className="card space-y-3 p-4">
                    {steps.map((text, index) => (
                        <li key={`${platform}-${browser}-${index}`} className="flex items-start gap-3">
                            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold tabular-nums text-white">{index + 1}</span>
                            <span className="min-w-0 flex-1 pt-[3px] text-sm">{text}</span>
                        </li>
                    ))}
                    {note && <li className="text-xs text-muted">{note}</li>}
                </ol>
                <p className="select-all text-center text-sm font-bold text-accent-ink">{host}</p>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={copy} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-raised text-sm font-bold">
                        <Copy className="h-4 w-4" />
                        {t('install.invite.copy')}
                    </button>
                    <button type="button" onClick={share} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-bold text-white">
                        <Share2 className="h-4 w-4" />
                        {t('install.invite.share')}
                    </button>
                </div>
            </div>
        </BottomSheet>
    );
};
