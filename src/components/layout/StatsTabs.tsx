import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Posiciones y Líderes comparten lugar en la barra de abajo: se cambia con estas pestañas
export const StatsTabs: React.FC<{ active: 'standings' | 'leaders' }> = ({ active }) => {
    const { t } = useTranslation();
    const tab = (to: string, key: 'standings' | 'leaders', label: string) => (
        <Link to={to} replace aria-current={active === key ? 'page' : undefined} className={`rounded-full px-4 py-2 text-sm font-bold ${active === key ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card'}`}>
            {label}
        </Link>
    );
    return (
        <nav className="flex gap-2" aria-label={t('nav.standings')}>
            {tab('/posiciones', 'standings', t('standings.title'))}
            {tab('/lideres', 'leaders', t('leaders.title'))}
        </nav>
    );
};
