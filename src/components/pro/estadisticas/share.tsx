// Compartir como imagen (cara a cara y ficha PRO): la tarjeta se arma con vistas, se ve en una hoja y se manda como
// foto con la lista de apps del teléfono (captureRef + expo-sharing, como ShareSheet). En la web, o si falla, se
// comparte el texto con el enlace.
import React, { useRef, useState, type ComponentRef } from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Link2, Share2 } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useColors } from '../../../theme/theme';
import { Button, Sheet } from '../../ui';
import { shareLink } from '../../share/ShareSheet';

export type CardNode = ComponentRef<typeof View>;

interface ShareImageSheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    /** Nombre del archivo y texto (con el enlace) que acompaña la imagen o la reemplaza en la web */
    fileName: string;
    text: string;
    path?: string;
    /** Ancho de la tarjeta en la hoja (la imagen sale a 1080 px de ancho) */
    width: number;
    /** La tarjeta: recibe el ref que se captura */
    renderCard: (ref: React.Ref<CardNode>) => React.ReactNode;
}

export const ShareImageSheet: React.FC<ShareImageSheetProps> = ({ open, onClose, title, fileName, text, path, width, renderCard }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const card = useRef<CardNode>(null);
    const [busy, setBusy] = useState(false);

    const shareImage = async () => {
        setBusy(true);
        try {
            if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) throw new Error('sin compartir archivos');
            const ratio = PixelRatio.get();
            const uri = await captureRef(card.current as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, result: 'tmpfile', width: 1080 / ratio, fileName });
            await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
        } catch {
            await shareLink(text, path, i18n.language);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title={title}>
            {open && (
                <>
                    <View style={{ alignItems: 'center' }} accessibilityLabel={t('pro.ficha.share.preview')}>
                        <View style={{ width, borderRadius: 20, overflow: 'hidden' }}>{renderCard(card)}</View>
                    </View>
                    <Button label={t('pro.ficha.share.send')} icon={<Share2 size={18} color="#fff" />} busy={busy} onPress={shareImage} />
                    <Button
                        label={t('pro.ficha.share.link')}
                        kind="secondary"
                        icon={<Link2 size={18} color={colors.ink} />}
                        onPress={() => {
                            onClose();
                            shareLink(text, path, i18n.language);
                        }}
                    />
                </>
            )}
        </Sheet>
    );
};
