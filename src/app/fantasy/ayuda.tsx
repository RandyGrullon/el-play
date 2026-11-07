// /fantasy/ayuda: «Cómo se juega» del Fantasy a pantalla completa (Lite y PRO). Se abre desde «¿Cómo se juega?» del
// encabezado y de la portada, y desde los «?» de Créditos, Capitán, Pronósticos y Tabla (`q`: la pregunta que se abre).
// Los números son los de las reglas del día que se estaba viendo (`dia`; sin él, hoy).
import React, { useRef, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';
import { IconButton, Skeleton, Txt } from '../../components/ui';
import { HelpCenter } from '../../components/fantasy/HelpCenter';
import { rulesOf, useFantasyDay } from '../../lib/fantasy';
import { isHelpQuestion } from '../../lib/fantasyHelp';
import { useLeague } from '../../state/league';
import { useColors } from '../../theme/theme';

export default function FantasyHelpScreen() {
    const { q, dia } = useLocalSearchParams<{ q?: string; dia?: string }>();
    const { t } = useTranslation();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { activeLeague } = useLeague();
    const date = typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : undefined;
    const query = useFantasyDay(activeLeague, date);
    const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
    const close = () => (router.canGoBack() ? router.back() : router.replace('/fantasy'));
    // Mientras llegan las reglas del día no se muestran números (podrían no ser los de hoy); sin red, las de siempre
    const waiting = !query.data && query.isPending && query.fetchStatus !== 'paused';

    return (
        <ScrollView ref={scroller} style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 48, paddingHorizontal: 16, gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt eyebrow>{t('fantasy.gate.eyebrow')}</Txt>
                    <Txt size={30} weight="black" accessibilityRole="header" style={{ lineHeight: 34, letterSpacing: -0.5 }}>
                        {t('fantasyHelp.title')}
                    </Txt>
                </View>
                <IconButton label={t('common.close')} onPress={close} style={{ width: 44, height: 44, borderRadius: 22 }}>
                    <X size={20} color={colors.ink} />
                </IconButton>
            </View>
            {waiting ? (
                <View style={{ gap: 12 }}>
                    <Skeleton height={60} />
                    <Skeleton height={260} />
                    <Skeleton height={200} />
                </View>
            ) : (
                <HelpCenter rules={rulesOf(query.data)} initial={isHelpQuestion(q) ? q : null} scroller={scroller} />
            )}
        </ScrollView>
    );
}
