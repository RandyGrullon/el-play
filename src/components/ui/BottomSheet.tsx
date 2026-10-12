import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface BottomSheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    /** Alto casi completo (zona, jugadas, box) en vez de ajustarse al contenido */
    tall?: boolean;
}

// Hoja que sube desde abajo (en escritorio, panel centrado). Cierra con la X, tocando fuera o con Escape.
export const BottomSheet: React.FC<BottomSheetProps> = ({ open, onClose, title, children, tall = false }) => {
    const { t } = useTranslation();
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
            previous?.focus?.();
        };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
            <button type="button" className="absolute inset-0 animate-[fade-up_.2s_ease-out] bg-black/45" aria-label={t('common.close')} onClick={onClose} tabIndex={-1} />
            <div
                className={`relative flex w-full max-w-xl animate-fade-up flex-col rounded-t-[28px] bg-bg shadow-float sm:rounded-[28px] ${tall ? 'h-[92dvh] sm:h-[86dvh]' : 'max-h-[92dvh]'}`}
            >
                <div className="flex items-center gap-3 px-5 pb-2 pt-3">
                    <span className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-line/20 sm:hidden" aria-hidden="true" />
                    <h2 className="mt-2 flex-1 truncate text-lg font-extrabold">{title}</h2>
                    <button ref={closeRef} type="button" onClick={onClose} className="mt-2 flex h-10 w-10 items-center justify-center rounded-full bg-raised text-ink" aria-label={t('common.close')}>
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">{children}</div>
            </div>
        </div>,
        document.body
    );
};
