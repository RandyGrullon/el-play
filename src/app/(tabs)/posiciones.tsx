import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { STATS_TABS, StatsTabs, type StatsTab } from '../../components/stats/StatsTabs';
import { StandingsSection } from '../../components/stats/StandingsSection';
import { LeadersSection } from '../../components/stats/LeadersSection';
import { StatsSection } from '../../components/stats/StatsSection';

// Pestaña de Posiciones con tres secciones (Posiciones | Líderes | Estadísticas).
// `?seccion=lideres` o `?seccion=estadisticas` abre directo esa sección (enlaces desde otras pantallas).
export default function PosicionesScreen() {
    const params = useLocalSearchParams<{ seccion?: string }>();
    const section: StatsTab = STATS_TABS.includes(params.seccion as StatsTab) ? (params.seccion as StatsTab) : 'posiciones';
    const tabs = <StatsTabs active={section} onChange={(next) => router.setParams({ seccion: next === 'posiciones' ? undefined : next })} />;

    if (section === 'lideres') return <LeadersSection tabs={tabs} />;
    if (section === 'estadisticas') return <StatsSection tabs={tabs} />;
    return <StandingsSection tabs={tabs} />;
}
