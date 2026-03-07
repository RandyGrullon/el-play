import React from 'react';

interface OfflineFallbackProps {
    onRetry: () => void;
    accentColor?: string;
}

export const OfflineFallback: React.FC<OfflineFallbackProps> = ({ onRetry, accentColor = '#22d3ee' }) => {
    return (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-zinc-950 px-4">
            <p className="text-zinc-400 text-center mb-2">Sin conexión</p>
            <p className="text-zinc-500 text-sm text-center mb-6">Revisa tu conexión e inténtalo de nuevo.</p>
            <button
                type="button"
                onClick={onRetry}
                className="px-5 py-2.5 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: accentColor }}
            >
                Reintentar
            </button>
        </div>
    );
};
