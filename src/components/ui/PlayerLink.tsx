import React from 'react';
import { Link } from 'react-router-dom';
import { playerPath } from '../../lib/links';

interface PlayerLinkProps {
    id: number | null | undefined;
    className?: string;
    children: React.ReactNode;
    /** Abre su página en esa temporada (?temporada=) */
    season?: number | null;
    /** Nombre para el lector cuando lo de adentro no lo dice (solo la foto) */
    label?: string;
    /** Repite el enlace de al lado (la foto junto al nombre): fuera del tabulador y del lector */
    decorative?: boolean;
    /** Al irse a su página (cerrar la hoja abierta, por ejemplo) */
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Nombre (o foto) de un pelotero que abre su página; si no se sabe su id queda como texto. El toque no sube a lo de
 * afuera (una fila que abre otra cosa).
 */
export const PlayerLink: React.FC<PlayerLinkProps> = ({ id, className = '', children, season, label, decorative, onClick }) =>
    id ? (
        <Link
            to={playerPath(id, season)}
            className={`underline-offset-2 hover:underline ${className}`}
            aria-label={decorative ? undefined : label}
            aria-hidden={decorative || undefined}
            tabIndex={decorative ? -1 : undefined}
            onClick={(event) => {
                event.stopPropagation();
                onClick?.(event);
            }}
        >
            {children}
        </Link>
    ) : (
        <span className={className}>{children}</span>
    );
