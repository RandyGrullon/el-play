import React, { useState } from 'react';

interface TeamLogoProps {
    team: { id: number; abbrev: string; logo: string; color: string; name?: string; flag?: string | null };
    size?: number;
    className?: string;
    /** 'eager' para logos visibles al abrir (cabecera del juego) */
    loading?: 'lazy' | 'eager';
}

// Logo de mlbstatic con respaldo: si no carga (equipo sin logo, red bloqueada) se pinta la sigla en el color del equipo
export const TeamLogo: React.FC<TeamLogoProps> = ({ team, size = 32, className = '', loading = 'lazy' }) => {
    const [failed, setFailed] = useState(false);
    const style = { width: size, height: size };

    if (failed || !team.logo) {
        return (
            <span
                className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ${className}`}
                style={{ ...style, backgroundColor: team.color, fontSize: size * 0.34 }}
                aria-hidden="true"
            >
                {team.flag || team.abbrev}
            </span>
        );
    }

    return (
        <img
            src={team.logo}
            alt=""
            width={size}
            height={size}
            loading={loading}
            decoding="async"
            className={`shrink-0 object-contain ${className}`}
            style={style}
            onError={() => setFailed(true)}
        />
    );
};
