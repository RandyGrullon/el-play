// Banners de publicidad (nunca de pantalla completa). Cada espacio muestra, en este orden:
// 1) un patrocinador propio vigente para ese espacio (public/patrocinadores/patrocinadores.json),
// 2) un anuncio de Google AdSense si está configurado (VITE_ADSENSE_CLIENT y VITE_ADSENSE_SLOT en Vercel),
// 3) nada: sin anuncio no queda hueco.
//
// Formato de patrocinadores.json (las imágenes van en public/patrocinadores/, 1600×500, JPG o WebP):
// { "sponsors": [{ "id": "colmado-luis", "name": "Colmado Luis", "image": "/patrocinadores/colmado-luis.jpg",
//   "imageDark": "/patrocinadores/colmado-luis-noche.jpg", "url": "https://…", "placements": ["portada", "tabla"],
//   "from": "2026-10-20", "until": "2026-12-31", "weight": 2 }] }
// Sin "placements" sale en todos los espacios; "from"/"until" son días completos en hora de RD; "weight" reparte las vistas.
import { useQuery } from '@tanstack/react-query';

export type AdPlacement = 'portada' | 'tabla' | 'lideres';

export interface Sponsor {
    id: string;
    name: string;
    image: string;
    imageDark?: string;
    url: string;
    placements?: AdPlacement[];
    from?: string;
    until?: string;
    weight?: number;
}

interface SponsorFile {
    sponsors: Sponsor[];
}

export const ADSENSE_CLIENT: string | undefined = import.meta.env.VITE_ADSENSE_CLIENT || undefined;
export const ADSENSE_SLOT: string | undefined = import.meta.env.VITE_ADSENSE_SLOT || undefined;
export const adsenseEnabled = () => !!ADSENSE_CLIENT && !!ADSENSE_SLOT;

const dayStart = (day: string) => Date.parse(`${day}T00:00:00-04:00`);
const dayEnd = (day: string) => Date.parse(`${day}T23:59:59-04:00`);

export const activeSponsors = (sponsors: Sponsor[], placement: AdPlacement, now = Date.now()) =>
    sponsors.filter(
        (sponsor) =>
            sponsor.image &&
            sponsor.url &&
            (!sponsor.placements || sponsor.placements.includes(placement)) &&
            (!sponsor.from || dayStart(sponsor.from) <= now) &&
            (!sponsor.until || now <= dayEnd(sponsor.until))
    );

/** Elige según el peso; `roll` entre 0 y 1 (fijo por vista para que el banner no cambie en cada render) */
export const pickSponsor = (sponsors: Sponsor[], roll: number): Sponsor | null => {
    const total = sponsors.reduce((sum, sponsor) => sum + Math.max(1, sponsor.weight ?? 1), 0);
    let target = roll * total;
    for (const sponsor of sponsors) {
        target -= Math.max(1, sponsor.weight ?? 1);
        if (target < 0) return sponsor;
    }
    return sponsors[sponsors.length - 1] ?? null;
};

/** El patrocinador ve en sus estadísticas que la visita vino de El Play */
export const sponsorHref = (url: string, placement: AdPlacement) => {
    try {
        const link = new URL(url);
        link.searchParams.set('utm_source', 'el-play');
        link.searchParams.set('utm_medium', 'banner');
        link.searchParams.set('utm_campaign', placement);
        return link.toString();
    } catch {
        return url;
    }
};

const EMPTY: SponsorFile = { sponsors: [] };

export const useSponsors = () =>
    useQuery({
        queryKey: ['sponsors'],
        queryFn: async () => {
            try {
                const response = await fetch('/patrocinadores/patrocinadores.json', { headers: { Accept: 'application/json' } });
                if (!response.ok) return EMPTY;
                const data = (await response.json()) as Partial<SponsorFile>;
                return { sponsors: Array.isArray(data.sponsors) ? data.sponsors : [] };
            } catch {
                return EMPTY;
            }
        },
        staleTime: 30 * 60 * 1000,
        retry: false
    }).data;

let adsenseScript: Promise<void> | null = null;

/** El script de Google se baja solo cuando hay un banner por mostrar (no frena la carga de la app) */
export const loadAdSense = () =>
    (adsenseScript ||= new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
        script.onload = () => resolve();
        script.onerror = () => {
            adsenseScript = null;
            reject(new Error('adsense'));
        };
        document.head.appendChild(script);
    }));
