import React from 'react';

export const Badge = ({ children, className = '', variant = 'default' }) => {
    const variants = {
        default: 'bg-zinc-800 text-zinc-300',
        success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
        warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        info: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
    };

    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide ${variants[variant]} ${className}`}>
            {children}
        </span>
    );
};
