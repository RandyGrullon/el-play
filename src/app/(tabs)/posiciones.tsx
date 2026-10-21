import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsPro } from '../../lib/pro';
import { STATS_TABS, StatsTabs, type StatsTab } from '../../components/stats/StatsTabs';
import { StandingsSection } from '../../components/stats/StandingsSection';
import { LeadersSection } from '../../components/stats/LeadersSection';
import { StatsSection } from '../../components/stats/StatsSection';
import { ProStandings } from '../../components/pro/posiciones/ProStandings';
import { ProLeaders } from '../../components/pro/lideres/ProLeaders';

// Pestaña de Posiciones con tres secciones (Posiciones | Líderes | Estadísticas).
// `?seccion=lideres` o `?seccion=estadisticas` abre directo esa sección (enlaces desde otras pantallas).
// En PRO, Posiciones y Líderes son sus pantallas PRO y hay una cuarta pastilla, «Equipos» (`?seccion=estadisticas&vista=equipos`).
export default function PosicionesScreen() {
    const params = useLocalSearchParams<{ seccion?: string; vista?: string }>();
    const pro = useIsPro();
    const section: StatsTab = STATS_TABS.includes(params.seccion as StatsTab) ? (params.seccion as StatsTab) : 'posiciones';
    const teamsView = pro && section === 'estadisticas' && params.vista === 'equipos';
    const tabs = pro ? (
        <StatsTabs
            pro
            active={section}
            teams={teamsView}
            onChange={(next) => router.setParams({ seccion: next === 'posiciones' ? undefined : next, vista: undefined })}
            onTeams={() => router.setParams({ seccion: 'estadisticas', vista: 'equipos' })}
        />
    ) : (
        <StatsTabs active={section} onChange={(next) => router.setParams({ seccion: next === 'posiciones' ? undefined : next })} />
    );

    if (section === 'lideres') return pro ? <ProLeaders tabs={tabs} fallback={<LeadersSection tabs={tabs} />} /> : <LeadersSection tabs={tabs} />;
    if (section === 'estadisticas') return <StatsSection tabs={tabs} />;
    return pro ? <ProStandings tabs={tabs} /> : <StandingsSection tabs={tabs} />;
}
