import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';

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

    if (online) return null;
    return (
        <div role="status" className="flex items-center justify-center gap-2 bg-ink px-4 py-2 text-xs font-semibold text-bg">
            <WifiOff className="h-3.5 w-3.5" />
            {t('offline.banner')}
        </div>
    );
};
