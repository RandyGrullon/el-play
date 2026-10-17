import React, { useCallback, useRef, useState } from 'react';
import { PixelRatio, Platform, Share, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Link2, Share2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { WEB_URL } from '../../lib/config';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { Button, Segmented, Sheet, Txt } from '../ui';
import { ShareCard, type CardHandle, type ShareFormat, type ShareStyle } from './ShareCard';
import type { PostData } from './subjects';

// Compartir: se ve la imagen del resultado (historia o post, en tres estilos) y se manda como foto con la lista de apps
// del teléfono. Si no se puede (web, o falla la captura) se comparte el texto con el enlace a la web.

export interface ShareRequest {
    data: PostData;
    /** Nombre del archivo y texto que acompaña al compartir */
    fileName: string;
    text: string;
    /** Ruta del enlace, p. ej. /juego/123 */
    path?: string;
}

const TEXTS = {
    es: { copied: 'Enlace copiado.', failed: 'No se pudo compartir.', link: 'Solo el enlace' },
    en: { copied: 'Link copied.', failed: 'Could not share.', link: 'Just the link' }
};

/** Comparte texto y enlace; en la web, si no hay menú de compartir, lo copia */
export const shareLink = async (text: string, path: string | undefined, lang: string) => {
    const words = lang.startsWith('en') ? TEXTS.en : TEXTS.es;
    const url = `${WEB_URL}${path ?? ''}`;
    try {
        if (Platform.OS === 'web') {
            const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }) : undefined;
            if (nav?.share) await nav.share({ text, url });
            else {
                await Clipboard.setStringAsync(`${text} ${url}`);
                showToast(words.copied, undefined, 3000);
            }
            return;
        }
        // iOS junta mensaje y enlace; Android solo lee el mensaje
        await Share.share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text}\n${url}` });
    } catch (error) {
        if ((error as Error)?.name !== 'AbortError') showToast(words.failed, undefined, 3000);
    }
};

/** Devuelve la función para abrir «Compartir» y la hoja que hay que pintar en la pantalla */
export const useShare = () => {
    const [request, setRequest] = useState<ShareRequest | null>(null);
    const share = useCallback((next: ShareRequest) => setRequest(next), []);
    const sheet = <ShareSheet request={request} onClose={() => setRequest(null)} />;
    return { share, sheet };
};

const ShareSheet: React.FC<{ request: ShareRequest | null; onClose: () => void }> = ({ request, onClose }) => {
    const { t, i18n } = useTranslation();
    const window = useWindowDimensions();
    const colors = useColors();
    const [format, setFormat] = useState<ShareFormat>('post');
    const [style, setStyle] = useState<ShareStyle>('color');
    const [busy, setBusy] = useState(false);
    const card = useRef<CardHandle>(null);
    const words = i18n.language.startsWith('en') ? TEXTS.en : TEXTS.es;
    // La historia es alta: más angosta para que se vea entera en la hoja
    const width = Math.min(window.width - 32, format === 'story' ? 300 : 360);

    const shareImage = async () => {
        if (!request) return;
        setBusy(true);
        try {
            if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) throw new Error('sin compartir archivos');
            const ratio = PixelRatio.get();
            const uri = await captureRef(card.current as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, result: 'tmpfile', width: 1080 / ratio, height: (1080 * (format === 'story' ? 16 / 9 : 5 / 4)) / ratio, fileName: request.fileName });
            await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('share.title') });
        } catch {
            await shareLink(request.text, request.path, i18n.language);
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
                                { value: 'post', label: t('share.post') },
                                { value: 'story', label: t('share.story') }
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
                            <ShareCard ref={card} data={request.data} format={format} style={style} width={width} />
                        </View>
                    </View>
                    <Button label={t('share.share')} icon={<Share2 size={18} color="#fff" />} busy={busy} onPress={shareImage} />
                    <Button
                        label={words.link}
                        kind="secondary"
                        icon={<Link2 size={18} color={colors.ink} />}
                        onPress={() => {
                            // Se cierra la hoja para que se vea el aviso de «enlace copiado» (en la web)
                            onClose();
                            shareLink(request.text, request.path, i18n.language);
                        }}
                    />
                </>
            )}
        </Sheet>
    );
};
