import React from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useColors } from '../../theme/theme';
import { PRO_GRADIENT, radius, shadow } from '../../theme/tokens';
import { Pill, Txt } from '../ui';
import { ChipRow } from './common';

// Posiciones, Líderes y Estadísticas comparten lugar en la barra de abajo: se cambia con estas pastillas.
// En PRO hay una cuarta, «Equipos» (nueva, con un puntito del degradado): abre Estadísticas en la vista de equipos
// (?seccion=estadisticas&vista=equipos), como la web.
export type StatsTab = 'posiciones' | 'lideres' | 'estadisticas';

export const STATS_TABS: StatsTab[] = ['posiciones', 'lideres', 'estadisticas'];

const ProTab: React.FC<{ label: string; active: boolean; onPress: () => void; isNew?: boolean; newLabel?: string }> = ({ label, active, onPress, isNew, newLabel }) => {
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={isNew && newLabel ? `${label} (${newLabel})` : label}
            style={({ pressed }) => [
                { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: active ? colors.ink : colors.surface, opacity: pressed ? 0.8 : 1 },
                !active && shadow('card')
            ]}
        >
            <Txt size={13} weight="bold" color={active ? colors.bg : colors.muted}>
                {label}
            </Txt>
            {isNew && <LinearGradient colors={PRO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 6, height: 6, borderRadius: 3 }} />}
        </Pressable>
    );
};

export const StatsTabs: React.FC<{
    active: StatsTab;
    onChange: (tab: StatsTab) => void;
    /** Modo PRO: pastillas de 44 px y la cuarta, «Equipos» */
    pro?: boolean;
    /** Estadísticas está en la vista de equipos (la pastilla «Equipos» va activa) */
    teams?: boolean;
    onTeams?: () => void;
}> = ({ active, onChange, pro = false, teams = false, onTeams }) => {
    const { t } = useTranslation();
    const labels: Record<StatsTab, string> = { posiciones: t('standings.title'), lideres: t('leaders.title'), estadisticas: t('statsPage.title') };
    if (pro) {
        return (
            <ChipRow label={t('nav.standings')}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    {STATS_TABS.map((tab) => (
                        <ProTab key={tab} label={labels[tab]} active={active === tab && !teams} onPress={() => onChange(tab)} />
                    ))}
                    {onTeams && <ProTab label={t('pro.posiciones.tabs.teams')} active={teams} onPress={onTeams} isNew newLabel={t('pro.posiciones.tabs.new')} />}
                </View>
            </ChipRow>
        );
    }
    return (
        <ChipRow label={t('nav.standings')}>
            {STATS_TABS.map((tab) => (
                <Pill key={tab} label={labels[tab]} active={active === tab} onPress={() => onChange(tab)} />
            ))}
        </ChipRow>
    );
};
