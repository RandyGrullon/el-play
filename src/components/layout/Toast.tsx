import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { hideToast, useToast } from '../../lib/toast';

// El aviso corto del momento, encima de la barra de abajo
export const Toast: React.FC = () => {
    const { t } = useTranslation();
    const toast = useToast();
    if (!toast) return null;
    return (
        <div key={toast.id} role="status" className="fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md animate-fade-up items-center gap-3 rounded-2xl bg-ink p-3 pl-4 text-bg shadow-xl">
            <p className="flex-1 text-sm font-medium">{toast.text}</p>
            {toast.action && (
                <button
                    type="button"
                    onClick={() => {
                        toast.action?.run();
                        hideToast();
                    }}
                    className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white"
                >
                    {toast.action.label}
                </button>
            )}
            <button type="button" onClick={hideToast} className="shrink-0 rounded-full p-1.5 opacity-70 hover:opacity-100" aria-label={t('common.close')}>
                <X className="h-4 w-4" />
            </button>
        </div>
    );
};
