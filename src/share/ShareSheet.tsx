import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showToast } from '../lib/toast';
import { Download, Facebook, ImagePlus, Instagram, MessageCircle, Share2, X } from 'lucide-react';
import { track } from '@vercel/analytics';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Segmented } from '../components/ui/Segmented';
import type { PostData, ShareFormat, ShareStyle } from './render';

// El dibujo del post se carga solo cuando alguien abre «Compartir»
const loadRender = () => import('./render');

interface ShareRequest {
    data: PostData;
    /** Nombre del archivo y texto que acompaña al compartir */
    fileName: string;
    text: string;
    /** Enlace que va con el texto (si falta, la página actual) */
    url?: string;
}

type Destination = 'whatsapp' | 'facebook' | 'instagram' | 'more';

// Botones de destino: la web no puede abrir WhatsApp o Facebook directo con una imagen, así que en el teléfono
// se abre la lista de apps con la imagen lista (y se le dice cuál tocar). Donde no se puede compartir archivos
// (computadora), WhatsApp y Facebook abren su página con el texto y el enlace.
const DESTINATIONS: { id: Exclude<Destination, 'more'>; label: string; color: string; Icon: typeof Share2 }[] = [
    { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', Icon: MessageCircle },
    { id: 'facebook', label: 'Facebook', color: '#1877F2', Icon: Facebook },
    { id: 'instagram', label: 'Instagram', color: 'linear-gradient(135deg, #feda75, #d62976 50%, #4f5bd5)', Icon: Instagram }
];

const ShareContext = createContext<{ share: (request: ShareRequest) => void } | undefined>(undefined);

export const useShare = () => {
    const context = useContext(ShareContext);
    if (!context) throw new Error('useShare must be used within ShareProvider');
    return context.share;
};

const STYLES: { value: ShareStyle; swatch: string }[] = [
    { value: 'color', swatch: 'linear-gradient(135deg, #FDB927 50%, #0069e0 50%)' },
    { value: 'noche', swatch: '#0b0c10' },
    { value: 'papel', swatch: '#f2ead8' }
];

export const ShareProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [request, setRequest] = useState<ShareRequest | null>(null);
    const share = useCallback((next: ShareRequest) => setRequest(next), []);
    const value = useMemo(() => ({ share }), [share]);
    return (
        <ShareContext.Provider value={value}>
            {children}
            {request && <ShareSheet request={request} onClose={() => setRequest(null)} />}
        </ShareContext.Provider>
    );
};

const ShareSheet: React.FC<{ request: ShareRequest; onClose: () => void }> = ({ request, onClose }) => {
    const { t } = useTranslation();
    const [format, setFormat] = useState<ShareFormat>('story');
    const [style, setStyle] = useState<ShareStyle>('color');
    const [photo, setPhoto] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState(false);
    const [picked, setPicked] = useState<Destination | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const input = useRef<HTMLInputElement>(null);

    // Redibuja el post cada vez que cambia el formato, el estilo o la foto
    useEffect(() => {
        let cancelled = false;
        setBusy(true);
        setError(false);
        loadRender()
            .then(({ renderPost }) => renderPost(request.data, { format, style, photo, labels: { site: 'el-play.vercel.app' } }))
            .then((canvas) => {
                if (cancelled) return;
                canvasRef.current = canvas;
                setPreview(canvas.toDataURL('image/jpeg', 0.82));
            })
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setBusy(false));
        return () => {
            cancelled = true;
        };
    }, [request, format, style, photo]);

    useEffect(() => () => {
        if (photo) URL.revokeObjectURL(photo);
    }, [photo]);

    const file = async () => {
        if (!canvasRef.current) return null;
        const { canvasToFile } = await loadRender();
        return canvasToFile(canvasRef.current, `${request.fileName}-${format}.png`);
    };

    const download = async () => {
        const result = await file();
        if (!result) return;
        const url = URL.createObjectURL(result);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        track('share_download', { kind: request.data.kind, format, style });
    };

    const link = new URL(request.url ?? window.location.pathname, window.location.origin).toString();
    const message = `${request.text}\n${link}`;

    const shareTo = async (destination: Destination) => {
        setPicked(destination);
        const result = await file();
        if (!result) return;
        track('share', { kind: request.data.kind, format, style, to: destination });
        if (navigator.canShare?.({ files: [result] })) {
            try {
                await navigator.share({ files: [result], title: 'El Play', text: message });
                return;
            } catch (shareError) {
                if ((shareError as Error).name === 'AbortError') return;
            }
        }
        // Sin compartir archivos: WhatsApp y Facebook con el texto y el enlace; Instagram solo recibe imágenes desde el teléfono
        if (destination === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
        else if (destination === 'facebook') window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank', 'noopener');
        else {
            await download();
            if (destination === 'instagram') showToast(t('share.instagramSaved'), undefined, 7000);
        }
    };

    const pickPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
        const chosen = event.target.files?.[0];
        if (chosen) setPhoto(URL.createObjectURL(chosen));
        event.target.value = '';
    };

    return (
        <BottomSheet open onClose={onClose} title={t('share.title')} tall>
            <div className="flex flex-col gap-4 pb-2">
                <div className="relative mx-auto flex w-full justify-center">
                    <div className={`relative overflow-hidden rounded-2xl bg-raised shadow-float ${format === 'story' ? 'aspect-[9/16] h-[46dvh]' : 'aspect-[4/5] h-[40dvh]'}`}>
                        {preview && <img src={preview} alt={t('share.previewAlt')} className={`h-full w-full object-cover transition-opacity ${busy ? 'opacity-60' : ''}`} />}
                        {busy && !preview && <div className="skeleton absolute inset-0 rounded-none" />}
                        {error && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">{t('share.error')}</p>}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Segmented<ShareFormat>
                        label={t('share.format')}
                        value={format}
                        onChange={setFormat}
                        options={[
                            { value: 'story', label: t('share.story') },
                            { value: 'post', label: t('share.post') }
                        ]}
                    />
                    <div className="flex items-center gap-2" role="radiogroup" aria-label={t('share.style')}>
                        {STYLES.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={style === option.value}
                                aria-label={t(`share.styles.${option.value}`)}
                                title={t(`share.styles.${option.value}`)}
                                onClick={() => setStyle(option.value)}
                                className={`h-10 w-10 rounded-full border-2 transition-transform ${style === option.value ? 'scale-110 border-ink' : 'border-line/20'}`}
                                style={{ background: option.swatch }}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <input ref={input} type="file" accept="image/*" className="sr-only" onChange={pickPhoto} aria-label={t('share.usePhoto')} />
                    <button type="button" onClick={() => input.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold shadow-card">
                        <ImagePlus className="h-4 w-4" />
                        {photo ? t('share.changePhoto') : t('share.usePhoto')}
                    </button>
                    {photo && (
                        <button type="button" onClick={() => setPhoto(null)} className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted" aria-label={t('share.removePhoto')}>
                            <X className="h-4 w-4" />
                            {t('share.removePhoto')}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {DESTINATIONS.map(({ id, label, color, Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => shareTo(id)}
                            disabled={busy || error}
                            className="flex h-[68px] flex-col items-center justify-center gap-1 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                            style={{ background: color }}
                        >
                            <Icon className="h-6 w-6" />
                            {label}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={download} disabled={busy || error} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface font-bold shadow-card disabled:opacity-50">
                        <Download className="h-5 w-5" />
                        {t('share.save')}
                    </button>
                    <button type="button" onClick={() => shareTo('more')} disabled={busy || error} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink font-bold text-bg disabled:opacity-50">
                        <Share2 className="h-5 w-5" />
                        {t('share.more')}
                    </button>
                </div>
                <p className="text-center text-xs text-muted" aria-live="polite">
                    {picked && picked !== 'more' ? t('share.pick', { app: DESTINATIONS.find((d) => d.id === picked)?.label }) : t('share.hint')}
                </p>
            </div>
        </BottomSheet>
    );
};
