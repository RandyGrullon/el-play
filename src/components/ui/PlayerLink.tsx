import React from 'react';
import { Link } from 'react-router-dom';

/** Nombre de un pelotero que abre su página (si no se sabe su id queda como texto) */
export const PlayerLink: React.FC<{ id: number | null | undefined; className?: string; children: React.ReactNode }> = ({ id, className = '', children }) =>
    id ? (
        <Link to={`/jugador/${id}`} className={`underline-offset-2 hover:underline ${className}`}>
            {children}
        </Link>
    ) : (
        <span className={className}>{children}</span>
    );
