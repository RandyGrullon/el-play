import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pill } from '../ui';
import { ChipRow } from './common';

// Posiciones, Líderes y Estadísticas comparten lugar en la barra de abajo: se cambia con estas pastillas
export type StatsTab = 'posiciones' | 'lideres' | 'estadisticas';

export const STATS_TABS: StatsTab[] = ['posiciones', 'lideres', 'estadisticas'];

export const StatsTabs: React.FC<{ active: StatsTab; onChange: (tab: StatsTab) => void }> = ({ active, onChange }) => {
    const { t } = useTranslation();
    const labels: Record<StatsTab, string> = { posiciones: t('standings.title'), lideres: t('leaders.title'), estadisticas: t('statsPage.title') };
    return (
        <ChipRow label={t('nav.standings')}>
            {STATS_TABS.map((tab) => (
                <Pill key={tab} label={labels[tab]} active={active === tab} onPress={() => onChange(tab)} />
            ))}
        </ChipRow>
    );
};
