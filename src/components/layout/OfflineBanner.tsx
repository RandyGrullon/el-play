import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNow } from '../../hooks/useNow';

// Sin conexión ya no se bloquea la app: se avisa y se siguen mostrando los últimos datos
export const OfflineBanner: React.FC = () => {
    const { t } = useTranslation();
    const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

    useEffect(() => {
        const up = () => setOnline(true);
        const down = () => setOnline(false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => {
            window.removeEventListener('online', up);
            window.removeEventListener('offline', down);
        };
    }, []);

    const client = useQueryClient();
    const now = useNow(30000, !online);
    if (online) return null;
    // Lo más nuevo que hay en pantalla: los datos de la última vez que hubo señal
    const updated = Math.max(0, ...client.getQueryCache().getAll().map((query) => query.state.dataUpdatedAt || 0));
    const minutes = updated ? Math.max(0, Math.floor((now - updated) / 60000)) : null;
    return (
        <div role="status" className="flex items-center justify-center gap-2 bg-ink px-4 py-2 text-center text-xs font-semibold text-bg">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            {minutes === null || minutes < 1 ? t('offline.banner') : t('offline.bannerAge', { count: minutes })}
        </div>
    );
};
