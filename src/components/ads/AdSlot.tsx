import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ADSENSE_CLIENT, ADSENSE_SLOT, activeSponsors, adsenseEnabled, loadAdSense, pickSponsor, sponsorHref, useSponsors, type AdPlacement } from '../../lib/ads';

// Espacio de banner con el estilo de la app: tarjeta redondeada, etiqueta pequeña y alto fijo (no mueve la página).
// Ver lib/ads.ts para el orden (patrocinador propio → AdSense → nada).

const Label: React.FC<{ text: string }> = ({ text }) => <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">{text}</p>;

declare global {
    interface Window {
        adsbygoogle?: unknown[];
    }
}

const AdSenseBanner: React.FC<{ className: string }> = ({ className }) => {
    const { t } = useTranslation();
    const box = useRef<HTMLDivElement>(null);
    const ins = useRef<HTMLModElement>(null);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        const element = box.current;
        if (!element) return;
        let pushed = false;
        let status: MutationObserver | null = null;
        // Se pide cuando el banner está por entrar en pantalla
        const seen = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting || pushed) return;
                pushed = true;
                seen.disconnect();
                loadAdSense()
                    .then(() => {
                        if (!ins.current || ins.current.dataset.adsbygoogleStatus) return;
                        (window.adsbygoogle = window.adsbygoogle || []).push({});
                        // Si Google no tiene anuncio para este espacio, se quita en vez de dejar el hueco
                        status = new MutationObserver(() => ins.current?.dataset.adStatus === 'unfilled' && setHidden(true));
                        status.observe(ins.current, { attributes: true, attributeFilter: ['data-ad-status'] });
                    })
                    .catch(() => setHidden(true));
            },
            { rootMargin: '300px 0px' }
        );
        seen.observe(element);
        return () => {
            seen.disconnect();
            status?.disconnect();
        };
    }, []);

    if (hidden) return null;
    return (
        <aside ref={box} className={className} aria-label={t('ads.label')}>
            <Label text={t('ads.label')} />
            <div className="flex h-[100px] items-center justify-center overflow-hidden rounded-[20px] bg-surface shadow-card">
                <ins ref={ins} className="adsbygoogle" style={{ display: 'inline-block', width: 320, height: 100 }} data-ad-client={ADSENSE_CLIENT} data-ad-slot={ADSENSE_SLOT} />
            </div>
        </aside>
    );
};

export const AdSlot: React.FC<{ placement: AdPlacement; className?: string }> = ({ placement, className = '' }) => {
    const { t } = useTranslation();
    const file = useSponsors();
    // Un sorteo por vista: el banner no cambia mientras se usa la página
    const roll = useMemo(() => Math.random(), []);
    const sponsor = useMemo(() => pickSponsor(activeSponsors(file?.sponsors ?? [], placement), roll), [file, placement, roll]);

    if (!file) return null; // todavía cargando la lista: no se reserva espacio para no saltar a AdSense antes de tiempo
    if (sponsor) {
        return (
            <aside className={className} aria-label={t('ads.sponsored')}>
                <Label text={t('ads.sponsored')} />
                <a href={sponsorHref(sponsor.url, placement)} target="_blank" rel="sponsored noopener" className="block overflow-hidden rounded-[20px] shadow-card">
                    <img src={sponsor.image} alt={sponsor.name} width={1600} height={500} loading="lazy" decoding="async" className={`aspect-[16/5] w-full object-cover ${sponsor.imageDark ? 'only-light' : ''}`} />
                    {sponsor.imageDark && <img src={sponsor.imageDark} alt={sponsor.name} width={1600} height={500} loading="lazy" decoding="async" className="only-dark aspect-[16/5] w-full object-cover" />}
                </a>
            </aside>
        );
    }
    return adsenseEnabled() ? <AdSenseBanner className={className} /> : null;
};
