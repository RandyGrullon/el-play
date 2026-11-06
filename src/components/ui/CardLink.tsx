import React from 'react';
import { Link } from 'react-router-dom';

/** Lo que va encima del enlace de la tarjeta (los enlaces a equipos y peloteros, los botones) */
export const OVER_CARD = 'relative z-[2]';

interface CardLinkProps {
    to: string;
    /** Lo que dice el lector (el enlace no tiene texto: cubre la tarjeta) */
    label: string;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    onFocus?: () => void;
}

/**
 * Enlace que cubre toda una tarjeta («stretched link»): la tarjeta va `relative isolate`, este enlace por encima de
 * su contenido y los enlaces o botones de adentro encima de él con OVER_CARD. Así el nombre del equipo abre su página
 * y el resto de la tarjeta, el juego (un <a> no puede ir dentro de otro).
 */
export const CardLink: React.FC<CardLinkProps> = ({ to, label, onClick, onFocus }) => (
    <Link to={to} aria-label={label} onClick={onClick} onFocus={onFocus} className="absolute inset-0 z-[1] rounded-[inherit]" />
);
