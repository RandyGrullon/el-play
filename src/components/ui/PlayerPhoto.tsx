import React, { useEffect, useMemo, useState } from 'react';
import { photoSources, usePhotoIndex } from '../../lib/photos';

// Foto del pelotero con respaldos (ver lib/photos.ts): uniforme del equipo LIDOM si lo publica, MLB, MiLB
// y por último sus iniciales. Con `team` lleva el logo del equipo LIDOM en una esquina.

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
    /** Fondo detrás del recorte de MLB */
    background?: string;
    /** Equipo con el que juega aquí: su foto con uniforme (si existe) y su logo */
    team?: { id: number | null; logo?: string | null; color?: string | null } | null;
}

export const PlayerPhoto: React.FC<PlayerPhotoProps> = ({ personId, name, size = 56, className = '', background = 'rgb(var(--raised))', team }) => {
    const index = usePhotoIndex();
    const px = Math.min(480, Math.round(size * 2));
    const sources = useMemo(() => photoSources(personId, name, team?.id, index, px), [personId, name, team?.id, index, px]);
    const [step, setStep] = useState(0);
    // Si llega la foto del equipo (o cambia el pelotero) se empieza otra vez por la mejor
    useEffect(() => setStep(0), [sources[0]?.url]);

    const source = sources[step];
    const badge = team?.logo && size >= 44 ? Math.round(size * 0.36) : 0;

    return (
        <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
            {source ? (
                <img
                    key={source.url}
                    src={source.url}
                    alt=""
                    width={size}
                    height={size}
                    loading="lazy"
                    decoding="async"
                    onError={() => setStep((current) => current + 1)}
                    className="h-full w-full rounded-full object-cover"
                    // El recorte de MLB no tiene fondo; las otras son fotos completas, encuadradas en la cara
                    style={{ background: source.kind === 'mlb' ? background : undefined, objectPosition: source.kind === 'team' ? '50% 18%' : undefined }}
                />
            ) : (
                <span
                    className="flex h-full w-full items-center justify-center rounded-full font-extrabold"
                    style={{ background: team?.color ? `${team.color}33` : background, color: team?.color ?? undefined, fontSize: size * 0.32 }}
                    aria-hidden="true"
                >
                    {initials(name)}
                </span>
            )}
            {badge > 0 && (
                <span
                    className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-white shadow-card"
                    style={{ width: badge, height: badge, padding: Math.max(2, badge * 0.1) }}
                    aria-hidden="true"
                >
                    <img src={team!.logo!} alt="" className="h-full w-full object-contain" loading="lazy" decoding="async" />
                </span>
            )}
        </span>
    );
};
