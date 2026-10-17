import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';
import { useLeague } from '../../state/league';
import { usePlayer } from '../../lib/stats';
import { useColors } from '../../theme/theme';
import { ErrorState, Row, Txt } from '../../components/ui';
import { PlayerProfile, useCachedTeam } from '../../components/stats/PlayerSheet';

// Ficha del pelotero (modal). Parámetros: id; opcionales season (año) y name/teamId para pintar la cabecera mientras carga.
export default function JugadorScreen() {
    const params = useLocalSearchParams<{ id: string; season?: string; name?: string; teamId?: string }>();
    const { t } = useTranslation();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const { activeLeague } = useLeague();
    const id = Number(params.id) || 0;
    const [season, setSeason] = useState<number | undefined>(() => Number(params.season) || undefined);
    const team = useCachedTeam(Number(params.teamId) || null);
    const player = usePlayer(id || null, activeLeague, season).data;
    const name = player?.name || params.name || '';
    // En iOS el modal es una hoja con su propio borde; en Android y la web ocupa toda la pantalla
    const top = Platform.OS === 'ios' ? 8 : insets.top + 8;

    const close = () => (router.canGoBack() ? router.back() : router.replace('/posiciones'));

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            {Platform.OS === 'ios' && (
                <View style={{ alignItems: 'center', paddingTop: 8 }}>
                    <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.faint, opacity: 0.5 }} />
                </View>
            )}
            <Row gap={12} style={{ paddingHorizontal: 20, paddingTop: top, paddingBottom: 8 }}>
                <Txt size={18} weight="extrabold" numberOfLines={1} style={{ flex: 1 }}>
                    {name}
                </Txt>
                <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} color={colors.ink} />
                </Pressable>
            </Row>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
                {!id ? (
                    <ErrorState message={t('errors.not_found')} />
                ) : (
                    <PlayerProfile
                        id={id}
                        name={params.name ?? ''}
                        team={team}
                        season={season}
                        onSeasonChange={setSeason}
                        onOpenGame={(gamePk) => router.push({ pathname: '/juego/[gamePk]', params: { gamePk } })}
                    />
                )}
            </ScrollView>
        </View>
    );
}
