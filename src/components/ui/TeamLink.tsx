import React from 'react';
import { Link } from 'react-router-dom';
import { teamPath } from '../../lib/links';

interface TeamLinkProps {
    id: number | null | undefined;
    className?: string;
    children: React.ReactNode;
    /** Nombre para el lector cuando lo de adentro no lo dice (solo el logo) */
    label?: string;
    /** Repite el enlace de al lado (el logo junto al nombre): fuera del tabulador y del lector */
    decorative?: boolean;
    /** Al irse a su página (cerrar la hoja abierta, por ejemplo) */
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Nombre, sigla o logo de un equipo que abre su página (como PlayerLink); sin id queda como texto. El toque no sube a
 * lo de afuera.
 */
export const TeamLink: React.FC<TeamLinkProps> = ({ id, className = '', children, label, decorative, onClick }) =>
    id ? (
        <Link
            to={teamPath(id)}
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
