import React from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
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

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => <div className={`skeleton ${className}`} aria-hidden="true" />;
