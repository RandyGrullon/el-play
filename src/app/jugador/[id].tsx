import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Share2, X } from 'lucide-react-native';
import { useLeague } from '../../state/league';
import { usePlayer } from '../../lib/stats';
import { useIsPro } from '../../lib/pro';
import { useColors } from '../../theme/theme';
import { ErrorState, ProBadge, Row, Txt } from '../../components/ui';
import { PlayerProfile, useCachedTeam } from '../../components/stats/PlayerSheet';
import { ProScroll } from '../../components/pro/estadisticas/scroll';

// Ficha del pelotero (modal). Parámetros: id; opcionales season (año) y name/teamId para pintar la cabecera mientras carga.
// En PRO la cabecera dice «Ficha del pelotero» con la insignia y un botón para compartirla como imagen.
export default function JugadorScreen() {
    const params = useLocalSearchParams<{ id: string; season?: string; name?: string; teamId?: string }>();
    const { t } = useTranslation();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const { activeLeague } = useLeague();
    const pro = useIsPro();
    const id = Number(params.id) || 0;
    const [season, setSeason] = useState<number | undefined>(() => Number(params.season) || undefined);
    const [shareOpen, setShareOpen] = useState(false);
    const team = useCachedTeam(Number(params.teamId) || null);
    const player = usePlayer(id || null, activeLeague, season).data;
    const name = player?.name || params.name || '';
    // En iOS el modal es una hoja con su propio borde; en Android y la web ocupa toda la pantalla
    const top = Platform.OS === 'ios' ? 8 : insets.top + 8;

    const close = () => (router.canGoBack() ? router.back() : router.replace('/posiciones'));
    const openGame = (gamePk: number) => router.push({ pathname: '/juego/[gamePk]', params: { gamePk } });

    const profile = !id ? (
        <ErrorState message={t('errors.not_found')} />
    ) : (
        <PlayerProfile id={id} name={params.name ?? ''} team={team} season={season} onSeasonChange={setSeason} onOpenGame={openGame} shareOpen={shareOpen} onShareClose={() => setShareOpen(false)} />
    );

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            {Platform.OS === 'ios' && (
                <View style={{ alignItems: 'center', paddingTop: 8 }}>
                    <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.faint, opacity: 0.5 }} />
                </View>
            )}
            {pro ? (
                <Row gap={8} style={{ paddingHorizontal: 16, paddingTop: top - 2, paddingBottom: 6 }}>
                    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Txt size={20} weight="black" numberOfLines={1} accessibilityRole="header" style={{ flexShrink: 1, letterSpacing: -0.3 }}>
                            {t('pro.ficha.title')}
                        </Txt>
                        <ProBadge />
                    </View>
                    <Pressable
                        onPress={() => setShareOpen(true)}
                        disabled={!player}
                        accessibilityRole="button"
                        accessibilityLabel={t('pro.ficha.share.button')}
                        accessibilityState={{ disabled: !player }}
                        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', opacity: !player ? 0.4 : pressed ? 0.8 : 1 })}
                    >
                        <Share2 size={18} color={colors.ink} />
                    </Pressable>
                    <Pressable
                        onPress={close}
                        accessibilityRole="button"
                        accessibilityLabel={t('pro.ficha.closeAria')}
                        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
                    >
                        <X size={20} color={colors.ink} />
                    </Pressable>
                </Row>
            ) : (
                <Row gap={12} style={{ paddingHorizontal: 20, paddingTop: top, paddingBottom: 8 }}>
                    <Txt size={18} weight="extrabold" numberOfLines={1} style={{ flex: 1 }}>
                        {name}
                    </Txt>
                    <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                        <X size={20} color={colors.ink} />
                    </Pressable>
                </Row>
            )}
            {pro ? (
                // Sabe cuánto se bajó: el juego a juego largo solo monta las filas que se ven
                <ProScroll tabScreen={false} contentStyle={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
                    {profile}
                </ProScroll>
            ) : (
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 640, alignSelf: 'center' }}>{profile}</ScrollView>
            )}
        </View>
    );
}
