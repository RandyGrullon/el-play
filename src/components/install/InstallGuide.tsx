// Pasarle El Play a alguien que no tiene la app: los pasos de la web para instalar elplay.grullonb.com según su teléfono y su
// navegador (src/components/install/steps.ts, los mismos textos), más copiar o compartir el enlace.
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Share2 } from 'lucide-react-native';
import { WEB_URL } from '../../lib/config';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { radius } from '../../theme/tokens';
import { Button, Card, Row, Segmented, Sheet, Txt } from '../ui';
import { BROWSERS, guideFor, type InstallBrowser, type InstallPlatform } from './steps';

const HOST = WEB_URL.replace(/^https?:\/\//, '');

export const InstallGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { t } = useTranslation();
    const colors = useColors();
    // Empieza por el mismo sistema de este teléfono (lo más probable es que se lo pase a alguien con uno igual)
    const [platform, setPlatform] = useState<InstallPlatform>(Platform.OS === 'android' ? 'android' : 'ios');
    const [browser, setBrowser] = useState<InstallBrowser>(BROWSERS[platform][0]);
    const guide = useMemo(() => guideFor(platform, browser, { prompt: false, safariNew: true }, t), [platform, browser, t]);
    const browserName = t(`install.browsers.${browser}`);
    // Dentro de Instagram o Facebook el enlace se abre ahí mismo; los pasos empiezan por sacarlo al navegador
    const steps = [browser === 'inapp' ? null : t('install.invite.open', { url: HOST, browser: browserName }), ...guide.steps.map((step) => step.text)].filter((text): text is string => !!text);

    const pickPlatform = (next: InstallPlatform) => {
        setPlatform(next);
        setBrowser(BROWSERS[next][0]);
    };
    const copy = async () => {
        try {
            await Clipboard.setStringAsync(WEB_URL);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            showToast(t('install.invite.copied'));
        } catch {
            /* sin portapapeles: el enlace se ve escrito en la hoja */
        }
    };
    const share = async () => {
        const text = t('install.invite.shareText');
        try {
            await Share.share(Platform.OS === 'ios' ? { message: text, url: WEB_URL } : { message: `${text}\n${WEB_URL}` });
        } catch {
            /* cancelado */
        }
    };
    const chip = (active: boolean) => ({ height: 34, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: active ? colors.ink : colors.raised }) as const;

    return (
        <Sheet open onClose={onClose} title={t('install.invite.title')}>
            <View style={{ gap: 14, paddingBottom: 12 }}>
                <Txt size={14} tone="muted">
                    {t('install.invite.body')}
                </Txt>
                <Segmented<InstallPlatform>
                    small
                    value={platform}
                    onChange={pickPlatform}
                    options={(['ios', 'android', 'desktop'] as const).map((value) => ({ value, label: t(`install.platforms.${value}`) }))}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} accessibilityLabel={t('install.tutorial.browser')}>
                    {BROWSERS[platform].map((value) => (
                        <Pressable key={value} onPress={() => setBrowser(value)} accessibilityRole="button" accessibilityState={{ selected: browser === value }} style={chip(browser === value)}>
                            <Txt size={12} weight="bold" color={browser === value ? colors.bg : colors.muted}>
                                {t(`install.browsers.${value}`)}
                            </Txt>
                        </Pressable>
                    ))}
                </ScrollView>
                <Card style={{ gap: 12 }}>
                    {steps.map((text, index) => (
                        <Row key={`${platform}-${browser}-${index}`} gap={12} align="flex-start">
                            <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
                                <Txt size={12} weight="extrabold" color="#fff" tabular>
                                    {index + 1}
                                </Txt>
                            </View>
                            <Txt size={14} style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                                {text}
                            </Txt>
                        </Row>
                    ))}
                    {guide.note && (
                        <Txt size={12} tone="muted">
                            {guide.note}
                        </Txt>
                    )}
                </Card>
                <Txt size={14} weight="bold" tone="accentInk" selectable center>
                    {HOST}
                </Txt>
                <Row gap={8}>
                    <Button kind="secondary" label={t('install.invite.copy')} icon={<Copy size={16} color={colors.ink} />} onPress={copy} style={{ flex: 1 }} />
                    <Button label={t('install.invite.share')} icon={<Share2 size={16} color="#fff" />} onPress={share} style={{ flex: 1 }} />
                </Row>
            </View>
        </Sheet>
    );
};
