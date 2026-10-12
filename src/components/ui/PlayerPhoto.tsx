import React, { useState } from 'react';

// Foto oficial del pelotero desde MLB (recorte sin fondo). Si no tiene, MLB devuelve una silueta;
// si la imagen no carga, se muestran sus iniciales.
export const playerPhotoUrl = (personId: number, size = 360) =>
    `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/r_max,c_pad,ar_1:1,w_${size},q_auto:best/v1/people/${personId}/headshot/silo/current`;

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();

interface PlayerPhotoProps {
    personId: number | null | undefined;
    name: string;
    size?: number;
    className?: string;
    /** Fondo detrás del recorte */
    background?: string;
}

export const PlayerPhoto: React.FC<PlayerPhotoProps> = ({ personId, name, size = 56, className = '', background = 'rgb(var(--raised))' }) => {
    const [failed, setFailed] = useState(false);
    const style = { width: size, height: size, background };
    if (!personId || failed) {
        return (
            <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-muted ${className}`} style={{ ...style, fontSize: size * 0.32 }} aria-hidden="true">
                {initials(name)}
            </span>
        );
    }
    return (
        <img
            src={playerPhotoUrl(personId, Math.min(480, Math.round(size * 2)))}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className={`shrink-0 rounded-full object-cover ${className}`}
            style={style}
        />
    );
};
