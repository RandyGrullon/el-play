import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RotateCw, SearchX, WifiOff } from 'lucide-react';
import { ApiError } from '../../lib/api';

export const ErrorState: React.FC<{ error: unknown; onRetry?: () => void; compact?: boolean }> = ({ error, onRetry, compact }) => {
    const { t } = useTranslation();
    const code = error instanceof ApiError ? error.code : 'network';
    return (
        <div className={`card flex flex-col items-center justify-center gap-3 text-center ${compact ? 'p-5' : 'px-6 py-10'}`} role="alert">
            <p className="text-sm text-muted">{t(`errors.${code}`, { defaultValue: t('errors.internal_error') })}</p>
            {onRetry && (
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                    <RotateCw className="h-4 w-4" />
                    {t('common.retry')}
                </button>
            )}
        </div>
    );
};

export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; children?: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        {icon && <div className="mb-1 text-faint">{icon}</div>}
        <p className="font-semibold">{title}</p>
        {children && <div className="text-sm text-muted">{children}</div>}
    </div>
);

/** La consulta no tiene datos y está esperando internet (react-query la pausa sin red) */
export const waitingForNetwork = (query: { isPending: boolean; fetchStatus: string }) => query.isPending && query.fetchStatus === 'paused';

/** En vez de cargar para siempre: esta pantalla no se había abierto y no hay internet */
export const OfflineState: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="card flex flex-col items-center justify-center gap-2 px-6 py-10 text-center" role="status">
            <WifiOff className="h-7 w-7 text-faint" aria-hidden="true" />
            <p className="font-semibold">{t('offline.title')}</p>
            <p className="max-w-xs text-sm text-muted">{t('offline.notLoaded')}</p>
        </div>
    );
};

/**
 * Juego o pelotero que no existe (o enlace roto): se dice claro y se ofrece volver a donde se estaba. Con `action`, ese
 * enlace va primero y «Volver» queda debajo, más discreto.
 */
export const NotFoundCard: React.FC<{ title: string; hint?: string; action?: { to: string; label: string }; onBack: () => void }> = ({ title, hint, action, onBack }) => {
    const { t } = useTranslation();
    return (
        <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center" role="alert">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-raised">
                <SearchX className="h-6 w-6 text-muted" aria-hidden="true" />
            </span>
            <p className="text-lg font-extrabold">{title}</p>
            {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
            {action ? (
                <>
                    <Link to={action.to} className="mt-1 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-bold text-white">
                        {action.label}
                    </Link>
                    <button type="button" onClick={onBack} className="inline-flex h-11 items-center px-4 text-sm font-semibold text-muted">
                        {t('team.back')}
                    </button>
                </>
            ) : (
                <button type="button" onClick={onBack} className="mt-1 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-bold text-white">
                    {t('team.back')}
                </button>
            )}
        </div>
    );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => <div className={`skeleton ${className}`} aria-hidden="true" />;
