// Compartir el equipo del día como imagen de 1080 × 1350 (4:5): la vista previa es la misma tarjeta en pequeño y se
// captura con react-native-view-shot para mandarla con la lista de apps del teléfono (como el «Compartir» de los
// juegos). En la web de la app no se puede capturar: se comparte el enlace.
import React, { useRef, useState } from 'react';
import { PixelRatio, Platform, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useTranslation } from 'react-i18next';
import { Crown, Link2, Share2 } from 'lucide-react-native';
import { fonts, PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, shadow } from '../../../theme/tokens';
import { PlayerPhoto, Sheet, Txt } from '../../ui';
import { LogoMark } from '../../feed/LogoMark';
import { SHARE_SITE } from '../../share/ShareCard';
import { shareLink } from '../../share/ShareSheet';
import { ProButton, shortName } from '../kit';

export interface ShareSlot {
    id: number;
    name: string;
    teamId: number;
    /** Puntos con la corona; null si su juego no ha empezado */
    points: string | null;
    captain: boolean;
}

export interface ShareCardData {
    title: string;
    subtitle: string;
    league: string;
    slots: ShareSlot[];
    total: string;
    unit: string;
    split: string;
    rank: string | null;
    site: string;
}

export { SHARE_SITE };

interface ShareFantasyProps {
    open: boolean;
    data: ShareCardData | null;
    /** Equipo de cada foto (logo y color) */
    teams: Record<string, { id: number; logo: string; color: string }>;
    fileName: string;
    /** Texto que acompaña al enlace si no se puede mandar la imagen */
    text: string;
    onClose: () => void;
}

/** La tarjeta (se diseña a 300 de ancho y se escala) */
type CardHandle = React.ComponentRef<typeof View>;

const FantasyCard: React.FC<{ ref?: React.Ref<CardHandle>; data: ShareCardData; teams: ShareFantasyProps['teams']; width: number }> = ({ ref, data, teams, width }) => {
    const s = (value: number) => (value * width) / 300;
    const photo = s(48);
    return (
        <View ref={ref} collapsable={false} style={{ width, height: width * 1.25, borderRadius: s(22), overflow: 'hidden' }}>
            <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ flex: 1, padding: s(14), justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(8) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), flexShrink: 1, minWidth: 0 }}>
                        <LogoMark size={s(26)} />
                        <View style={{ flexShrink: 1, minWidth: 0 }}>
                            <Txt size={s(13)} weight="black" tone="white" numberOfLines={1} style={{ letterSpacing: -0.3 }}>
                                {data.title}
                            </Txt>
                            <Txt size={s(10)} weight="semibold" color="rgba(255,255,255,0.85)" numberOfLines={1}>
                                {data.subtitle}
                            </Txt>
                        </View>
                    </View>
                    <View style={{ borderRadius: 999, borderWidth: 2, borderColor: '#fff', paddingHorizontal: s(8), paddingVertical: s(2) }}>
                        <Txt size={s(9)} weight="extrabold" tone="white">
                            {data.league}
                        </Txt>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: s(10) }}>
                    {data.slots.map((slot) => {
                        const team = teams[slot.teamId];
                        return (
                            <View key={slot.id} style={{ width: '33.33%', alignItems: 'center', gap: s(2) }}>
                                <View>
                                    {slot.captain && (
                                        <View style={{ position: 'absolute', top: -s(12), left: photo / 2 + s(2) - s(7), zIndex: 1 }}>
                                            <Crown size={s(14)} color="#f2b84b" />
                                        </View>
                                    )}
                                    <View style={{ borderRadius: 999, backgroundColor: '#fff', padding: s(2) }}>
                                        <PlayerPhoto personId={slot.id} name={slot.name} size={photo} team={team ?? null} background="rgba(255,255,255,0.2)" />
                                    </View>
                                </View>
                                <Txt size={s(9)} weight="extrabold" tone="white" numberOfLines={1} style={{ maxWidth: '92%' }}>
                                    {shortName(slot.name)}
                                </Txt>
                                <Txt tone="white" style={{ fontFamily: fonts.condensed, fontSize: s(15), lineHeight: s(16) }}>
                                    {slot.points ?? '—'}
                                </Txt>
                            </View>
                        );
                    })}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: s(8) }}>
                    <View style={{ flexShrink: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: s(4) }}>
                            <Txt tone="white" style={{ fontFamily: fonts.condensed, fontSize: s(52), lineHeight: s(50) }}>
                                {data.total}
                            </Txt>
                            <Txt size={s(14)} weight="extrabold" tone="white">
                                {data.unit}
                            </Txt>
                        </View>
                        <Txt size={s(9)} weight="semibold" color="rgba(255,255,255,0.9)" numberOfLines={1}>
                            {data.split}
                        </Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                        {data.rank ? (
                            <Txt size={s(10)} weight="extrabold" tone="white">
                                {data.rank}
                            </Txt>
                        ) : null}
                        <Txt size={s(9)} weight="bold" color="rgba(255,255,255,0.9)">
                            {data.site}
                        </Txt>
                    </View>
                </View>
            </LinearGradient>
        </View>
    );
};

export const ShareFantasy: React.FC<ShareFantasyProps> = ({ open, data, teams, fileName, text, onClose }) => {
    const { t, i18n } = useTranslation();
    const window = useWindowDimensions();
    const card = useRef<CardHandle>(null);
    const [busy, setBusy] = useState(false);
    const width = Math.min(window.width - 64, 300);
    const web = Platform.OS === 'web';

    const shareImage = async () => {
        setBusy(true);
        try {
            if (web || !(await Sharing.isAvailableAsync())) throw new Error('sin compartir archivos');
            const ratio = PixelRatio.get();
            const uri = await captureRef(card.current as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, result: 'tmpfile', width: 1080 / ratio, height: 1350 / ratio, fileName });
            await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('pro.fantasy.share.title') });
        } catch {
            // Sin captura (la web) o si falla: el texto con el enlace
            await shareLink(text, '/fantasy', i18n.language);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title={t('pro.fantasy.share.title')}>
            {data && (
                <>
                    <Txt size={12} weight="semibold" tone="muted" style={{ marginTop: -4 }}>
                        {t('pro.fantasy.share.size')}
                    </Txt>
                    <View style={{ alignItems: 'center', gap: 8 }}>
                        <View
                            accessible
                            accessibilityRole="image"
                            accessibilityLabel={t('pro.fantasy.share.preview', { title: data.subtitle, total: data.total, players: data.slots.map((slot) => `${slot.name} ${slot.points ?? '—'}`).join(', ') })}
                            style={[{ borderRadius: (22 * width) / 300 }, shadow('float')]}
                        >
                            <FantasyCard ref={card} data={data} teams={teams} width={width} />
                        </View>
                        <Txt size={12} tone="muted" center>
                            {t('pro.fantasy.share.caption')}
                        </Txt>
                    </View>
                    <ProButton
                        variant="gradient"
                        size="lg"
                        block
                        label={busy ? t('pro.fantasy.share.making') : web ? t('pro.fantasy.share.link') : t('pro.fantasy.share.share')}
                        icon={(color) => (web ? <Link2 size={16} color={color} /> : <Share2 size={16} color={color} />)}
                        onPress={shareImage}
                        disabled={busy}
                    />
                    {!web && (
                        <ProButton
                            size="lg"
                            block
                            label={t('pro.fantasy.share.link')}
                            icon={(color) => <Link2 size={16} color={color} />}
                            onPress={() => {
                                onClose();
                                shareLink(text, '/fantasy', i18n.language);
                            }}
                        />
                    )}
                    <Txt size={12} tone="muted" center>
                        {web ? t('pro.fantasy.share.webNote') : t('pro.fantasy.share.phoneNote')}
                    </Txt>
                </>
            )}
        </Sheet>
    );
};
