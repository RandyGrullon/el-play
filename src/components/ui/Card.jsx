import React from 'react';

export const Card = ({ children, className = '' }) => {
    return (
        <div className={`bg-zinc-900/50 backdrop-blur-md border border-white/5 rounded-2xl p-6 shadow-xl ${className}`}>
            {children}
        </div>
    );
};
