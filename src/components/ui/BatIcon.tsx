import React from 'react';

/** Bate de béisbol en diagonal (barril arriba a la derecha, mango y perilla abajo); toma el color del texto */
export const BatIcon: React.FC<{ className?: string; label?: string }> = ({ className = '', label }) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill="currentColor"
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
    >
        <path d="M15.74 3.74a3.2 3.2 0 0 1 4.52 4.52L8.64 16.64l-1.28-1.28Z" />
        <path d="M8 16 5.2 18.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="4.4" cy="19.6" r="1.8" />
    </svg>
);
