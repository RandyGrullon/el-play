import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    className?: string;
    variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'live';
}

export const Badge: React.FC<BadgeProps> = ({ children, className = '', variant = 'default' }) => {
    const variants: Record<string, string> = {
        default: 'bg-zinc-800 text-zinc-300',
        success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
        warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        info: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
        live: 'bg-red-600 text-white animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)]',
    };

    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide ${variants[variant] || variants.default} ${className}`}>
            {children}
        </span>
    );
};
