import React, { useCallback, useRef, useState } from 'react';
import { Linking, PixelRatio, Platform, Pressable, Share, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { Download, ImagePlus, Link2, MessageCircle, Share2, X } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { WEB_URL } from '../../lib/config';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { Button, Gradient, Segmented, Sheet, Txt } from '../ui';
import { ShareCard, type CardHandle, type ShareFormat, type ShareStyle } from './ShareCard';
import type { PostData } from './subjects';

// Compartir (la hoja de la web): se ve la imagen del resultado (historia o post, en tres estilos) y se manda como foto.
// Como en la web, WhatsApp, Facebook e Instagram no reciben la imagen directo: se abre la lista de apps del teléfono con
// la imagen lista y se dice cuál tocar. Si no se puede mandar la imagen (web, o falla la captura), WhatsApp y Facebook
// abren su página con el texto y el enlace, y lo demás comparte el texto con el enlace a la web.

export interface ShareRequest {
    data: PostData;
    /** Nombre del archivo y texto que acompaña al compartir */
    fileName: string;
    text: string;
    /** Ruta del enlace, p. ej. /juego/123 */
    path?: string;
}

type Destination = 'whatsapp' | 'facebook' | 'instagram' | 'more';

/** Comparte texto y enlace; en la web, si no hay menú de compartir, lo copia */
export const shareLink = async (text: string, path: string | undefined, lang: string) => {
    const t = i18next.getFixedT(lang.startsWith('en') ? 'en' : 'es');
    const url = `${WEB_URL}${path ?? ''}`;
    try {
        if (Platform.OS === 'web') {
            const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }) : undefined;
            if (nav?.share) await nav.share({ text, url });
            else {
                await Clipboard.setStringAsync(`${text} ${url}`);
                showToast(t('share.linkCopied'), undefined, 3000);
            }
            return;
        }
        // iOS junta mensaje y enlace; Android solo lee el mensaje
        await Share.share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text}\n${url}` });
    } catch (error) {
        if ((error as Error)?.name !== 'AbortError') showToast(t('share.failed'), undefined, 3000);
    }
};

/** Devuelve la función para abrir «Compartir» y la hoja que hay que pintar en la pantalla */
export const useShare = () => {
    const [request, setRequest] = useState<ShareRequest | null>(null);
    const share = useCallback((next: ShareRequest) => setRequest(next), []);
    const sheet = <ShareSheet request={request} onClose={() => setRequest(null)} />;
    return { share, sheet };
};

// Los íconos de marca de la web (lucide los quitó de la versión del teléfono): mismos trazos, en blanco
const glyph = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const FacebookIcon: React.FC = () => (
    <Svg {...glyph}>
        <Path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </Svg>
);
const InstagramIcon: React.FC = () => (
    <Svg {...glyph}>
        <Rect width={20} height={20} x={2} y={2} rx={5} ry={5} />
        <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <Line x1={17.5} x2={17.51} y1={6.5} y2={6.5} />
    </Svg>
);

const DESTINATIONS: { id: Exclude<Destination, 'more'>; label: string; color: string; gradient?: readonly [string, string, ...string[]]; icon: React.ReactNode }[] = [
    { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: <MessageCircle size={24} color="#fff" /> },
    { id: 'facebook', label: 'Facebook', color: '#1877F2', icon: <FacebookIcon /> },
    { id: 'instagram', label: 'Instagram', color: '#d62976', gradient: ['#feda75', '#d62976', '#4f5bd5'], icon: <InstagramIcon /> }
];

const tile = { height: 68, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4 } as const;

const ShareSheet: React.FC<{ request: ShareRequest | null; onClose: () => void }> = ({ request, onClose }) => {
    const { t, i18n } = useTranslation();
    const window = useWindowDimensions();
    const colors = useColors();
    const [format, setFormat] = useState<ShareFormat>('story');
    const [style, setStyle] = useState<ShareStyle>('color');
    const [busy, setBusy] = useState(false);
    const [picked, setPicked] = useState<Destination | null>(null);
    // Foto propia de fondo (como el «Usar mi foto» de la web): solo vive mientras la hoja está abierta
    const [photo, setPhoto] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const card = useRef<CardHandle>(null);
    // Como en la web, cada vez que se abre empieza en historia, color del equipo, sin foto y sin destino escogido
    const [opened, setOpened] = useState(request);
    if (opened !== request) {
        setOpened(request);
        if (request) {
            setFormat('story');
            setStyle('color');
            setPicked(null);
            setPhoto(null);
        }
    }
    // Como en la web: la historia a un 46 % del alto de la pantalla y el post a un 40 %
    const story = format === 'story';
    const width = Math.min(window.width - 32, window.height * (story ? 0.46 * (9 / 16) : 0.4 * (4 / 5)));

    /** La imagen a 1080 de ancho en un archivo temporal; en la web no hay */
    const capture = async (name: string) => {
        if (Platform.OS === 'web') throw new Error('sin archivos en la web');
        const ratio = PixelRatio.get();
        return captureRef(card.current as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, result: 'tmpfile', width: 1080 / ratio, height: (1080 * (story ? 16 / 9 : 5 / 4)) / ratio, fileName: name });
    };

    const openPage = (url: string) => Linking.openURL(url).catch(() => showToast(t('share.failed'), undefined, 3000));

    /** Escoger una foto de la galería (el selector del sistema, sin pedir acceso a todas las fotos) */
    const pickPhoto = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
            if (!result.canceled && result.assets?.[0]?.uri) setPhoto(result.assets[0].uri);
        } catch {
            showToast(t('share.failed'), undefined, 3000);
        }
    };

    /** Guardar la imagen en las fotos del teléfono (como «Guardar» de la web, que la descarga) */
    const save = async () => {
        if (!request) return;
        setSaving(true);
        try {
            const permission = await requestPermissionsAsync(true);
            if (!permission.granted) {
                showToast(t('share.saveDenied'), undefined, 4000);
                return;
            }
            await Asset.create(await capture(`${request.fileName}-${format}`));
            showToast(t('share.saved'), undefined, 3000);
        } catch {
            showToast(t('share.failed'), undefined, 3000);
        } finally {
            setSaving(false);
        }
    };

    const shareTo = async (destination: Destination) => {
        if (!request) return;
        setPicked(destination);
        setBusy(true);
        try {
            if (!(await Sharing.isAvailableAsync())) throw new Error('sin compartir archivos');
            const uri = await capture(`${request.fileName}-${format}`);
            await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('share.title') });
        } catch {
            const url = `${WEB_URL}${request.path ?? ''}`;
            if (destination === 'whatsapp') await openPage(`https://wa.me/?text=${encodeURIComponent(`${request.text}\n${url}`)}`);
            else if (destination === 'facebook') await openPage(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
            else await shareLink(request.text, request.path, i18n.language);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet open={!!request} onClose={onClose} title={t('share.title')}>
            {request && (
                <>
                    <View style={{ gap: 10 }}>
                        <Txt eyebrow>{t('share.format')}</Txt>
                        <Segmented<ShareFormat>
                            value={format}
                            onChange={setFormat}
                            options={[
                                { value: 'story', label: t('share.story') },
                                { value: 'post', label: t('share.post') }
                            ]}
                        />
                        <Txt eyebrow style={{ marginTop: 4 }}>
                            {t('share.style')}
                        </Txt>
                        <Segmented<ShareStyle>
                            small
                            value={style}
                            onChange={setStyle}
                            options={(['color', 'noche', 'papel'] as const).map((value) => ({ value, label: t(`share.styles.${value}`) }))}
                        />
                    </View>
                    <View style={{ alignItems: 'center' }} accessibilityLabel={t('share.previewAlt')}>
                        <View style={{ borderRadius: 20, overflow: 'hidden' }}>
                            <ShareCard ref={card} data={request.data} format={format} style={style} width={width} photo={photo} />
                        </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Button label={photo ? t('share.changePhoto') : t('share.usePhoto')} kind="secondary" icon={<ImagePlus size={18} color={colors.ink} />} onPress={pickPhoto} disabled={busy || saving} style={{ height: 44, borderRadius: 22 }} />
                        {photo && <Button label={t('share.removePhoto')} kind="ghost" icon={<X size={18} color={colors.ink} />} onPress={() => setPhoto(null)} style={{ height: 44 }} />}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {DESTINATIONS.map((destination) => {
                            const content = (
                                <>
                                    {destination.icon}
                                    <Txt size={14} weight="bold" tone="white" numberOfLines={1}>
                                        {destination.label}
                                    </Txt>
                                </>
                            );
                            return (
                                <Pressable
                                    key={destination.id}
                                    onPress={() => shareTo(destination.id)}
                                    disabled={busy}
                                    accessibilityRole="button"
                                    accessibilityLabel={destination.label}
                                    accessibilityState={{ disabled: busy }}
                                    style={({ pressed }) => ({ flex: 1, opacity: busy ? 0.5 : pressed ? 0.85 : 1 })}
                                >
                                    {destination.gradient ? (
                                        <Gradient colors={destination.gradient} style={tile}>
                                            {content}
                                        </Gradient>
                                    ) : (
                                        <View style={[tile, { backgroundColor: destination.color }]}>{content}</View>
                                    )}
                                </Pressable>
                            );
                        })}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {/* En la web del teléfono (Expo web) no hay archivo que guardar: ahí solo «Más opciones» */}
                        {Platform.OS !== 'web' && <Button label={t('share.save')} kind="secondary" icon={<Download size={18} color={colors.ink} />} busy={saving} disabled={busy} onPress={save} style={{ flex: 1 }} />}
                        <Button label={t('share.more')} icon={<Share2 size={18} color="#fff" />} busy={busy && picked === 'more'} disabled={busy || saving} onPress={() => shareTo('more')} style={{ flex: 1 }} />
                    </View>
                    <Button
                        label={t('share.linkOnly')}
                        kind="secondary"
                        icon={<Link2 size={18} color={colors.ink} />}
                        onPress={() => {
                            // Se cierra la hoja para que se vea el aviso de «enlace copiado» (en la web)
                            onClose();
                            shareLink(request.text, request.path, i18n.language);
                        }}
                    />
                    <Txt size={12} tone="muted" center accessibilityLiveRegion="polite">
                        {picked && picked !== 'more' ? t('share.pick', { app: DESTINATIONS.find((destination) => destination.id === picked)?.label }) : t('share.hint')}
                    </Txt>
                </>
            )}
        </Sheet>
    );
};
