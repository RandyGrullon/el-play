import React, { useEffect } from 'react';

interface AdBannerProps {
    dataAdSlot: string;
    dataAdFormat?: string;
    dataFullWidthResponsive?: boolean;
    className?: string;
}

const AdBanner: React.FC<AdBannerProps> = ({
    dataAdSlot,
    dataAdFormat = 'auto',
    dataFullWidthResponsive = true,
    className = '',
}) => {
    useEffect(() => {
        try {
            // @ts-ignore
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
            console.error("AdSense error", e);
        }
    }, []);

    return (
        <div className={`my-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 text-center ${className}`}>
            <p className="text-[10px] uppercase tracking-wider text-zinc-600 py-1">Publicidad</p>
            <ins
                className="adsbygoogle block"
                style={{ display: 'block' }}
                data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" // REEMPLAZAR CON TU ID DE ADSENSE
                data-ad-slot={dataAdSlot}
                data-ad-format={dataAdFormat}
                data-full-width-responsive={dataFullWidthResponsive ? "true" : "false"}
            />
        </div>
    );
};

export default AdBanner;
