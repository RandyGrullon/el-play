// «Hay una versión nueva de El Play» con «Actualizar», como el UpdateToast de la web: sale cuando la versión nueva ya
// está bajada (hooks/useAppUpdate.ts) y recarga solo si se toca. Nunca encima de una animación de jugada ni de otro aviso
// corto: espera a que terminen. Va en la raíz, después del Stack, a la altura del aviso corto (encima de la barra de abajo).
import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { RefreshCw, X } from 'lucide-react-native';
import { useColors } from '../theme/theme';
import { radius, shadow } from '../theme/tokens';
import { useToast } from '../lib/toast';
import { showUpdateBanner } from '../lib/appUpdate';
import { updatesOn, useAnimating, useAppUpdate } from '../hooks/useAppUpdate';
import { Txt } from './ui';

const ActiveUpdateBanner: React.FC = () => {
    const { t } = useTranslation();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const toast = useToast();
    const animating = useAnimating();
    const { ready, dismissed, dismiss, reloading, reload } = useAppUpdate();

    if (!reloading && !showUpdateBanner({ ready, dismissed, animating, toast: !!toast })) return null;
    return (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 96 }}>
            <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.ink, borderRadius: radius.tile, padding: 12, paddingLeft: 16, maxWidth: 480, alignSelf: 'center', width: '100%' }, shadow('float')]}
            >
                <Txt size={14} weight="medium" color={colors.bg} style={{ flex: 1 }}>
                    {reloading ? t('update.updating') : t('update.available')}
                </Txt>
                {reloading ? (
                    <ActivityIndicator size="small" color={colors.bg} style={{ marginRight: 8 }} />
                ) : (
                    <>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => reload({ backgroundColor: colors.bg, fade: true, spinner: { color: colors.accent } })}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}
                        >
                            <RefreshCw size={14} color="#fff" />
                            <Txt size={13} weight="semibold" tone="white">
                                {t('update.reload')}
                            </Txt>
                        </Pressable>
                        <Pressable onPress={dismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                            <X size={16} color={colors.bg} />
                        </Pressable>
                    </>
                )}
            </View>
        </View>
    );
};

/** En la web, en desarrollo, en Expo Go o sin EAS Update configurado no se monta (no busca ni avisa) */
export const UpdateBanner: React.FC = () => (updatesOn ? <ActiveUpdateBanner /> : null);
