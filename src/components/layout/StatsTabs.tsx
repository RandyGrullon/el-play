import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Posiciones, Líderes y Estadísticas comparten lugar en la barra de abajo: se cambia con estas pestañas
type StatsTab = 'standings' | 'leaders' | 'stats';

export const StatsTabs: React.FC<{ active: StatsTab }> = ({ active }) => {
    const { t } = useTranslation();
    const tab = (to: string, key: StatsTab, label: string) => (
        <Link to={to} replace aria-current={active === key ? 'page' : undefined} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${active === key ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card'}`}>
            {label}
        </Link>
    );
    return (
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none" aria-label={t('nav.standings')}>
            {tab('/posiciones', 'standings', t('standings.title'))}
            {tab('/lideres', 'leaders', t('leaders.title'))}
            {tab('/estadisticas', 'stats', t('statsPage.title'))}
        </nav>
    );
};
