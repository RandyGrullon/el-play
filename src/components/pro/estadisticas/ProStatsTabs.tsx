import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { ChipButton, ChipRow } from '../kit';

// Pestañas de Posiciones, Líderes, Estadísticas y Equipos del modo PRO (variante de stats/StatsTabs, que el Lite sigue
// usando con 3). «Equipos» es nueva: abre la vista completa de equipos de Estadísticas (?seccion=estadisticas&vista=equipos).
export type ProStatsTab = 'posiciones' | 'lideres' | 'estadisticas' | 'equipos';

/** Cambia de pestaña sin apilar pantallas (los mismos parámetros que lee app/(tabs)/posiciones.tsx) */
export const goToStatsTab = (tab: ProStatsTab) =>
    router.setParams({ seccion: tab === 'posiciones' ? undefined : tab === 'equipos' ? 'estadisticas' : tab, vista: tab === 'equipos' ? 'equipos' : undefined });

export const ProStatsTabs: React.FC<{ active: ProStatsTab }> = ({ active }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const tabs: { key: ProStatsTab; label: string; isNew?: boolean }[] = [
        { key: 'posiciones', label: t('standings.title') },
        { key: 'lideres', label: t('leaders.title') },
        { key: 'estadisticas', label: t('statsPage.title') },
        { key: 'equipos', label: t('pro.estadisticas.teams.title'), isNew: true }
    ];
    return (
        <ChipRow label={t('pro.estadisticas.tabs.label')}>
            {tabs.map((tab) => (
                <ChipButton
                    key={tab.key}
                    active={active === tab.key}
                    onPress={() => goToStatsTab(tab.key)}
                    accessibilityLabel={tab.isNew ? t('pro.estadisticas.tabs.newAria', { label: tab.label }) : tab.label}
                >
                    <Txt size={13} weight="bold" color={active === tab.key ? colors.bg : colors.ink} numberOfLines={1}>
                        {tab.label}
                    </Txt>
                    {tab.isNew ? (
                        <View style={{ width: 6, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                            <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ flex: 1 }} />
                        </View>
                    ) : null}
                </ChipButton>
            ))}
        </ChipRow>
    );
};
