import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => {
    return (
        <div className={`bg-zinc-900/50 backdrop-blur-md border border-white/5 rounded-2xl p-6 shadow-xl ${className}`}>
            {children}
        </div>
    );
};
