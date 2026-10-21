// Foto del pelotero en Líderes. Sobre el degradado de su equipo (el N.º 1) va con aro blanco y, si MLB no tiene
// foto, las iniciales sobre el fondo elevado (las del color del equipo sobre su mismo color no se verían).
import React from 'react';
import { View } from 'react-native';
import { PlayerPhoto } from '../../ui';

interface LeaderPhotoProps {
    personId: number;
    name: string;
    size: number;
    /** Color del equipo (o el neutro si no tiene) */
    color: string;
    teamId: number | null;
    logo?: string | null;
    /** N.º 1 sobre el degradado de su equipo: aro blanco y el logo en la esquina */
    hero?: boolean;
}

export const LeaderPhoto: React.FC<LeaderPhotoProps> = ({ personId, name, size, color, teamId, logo = null, hero = false }) => (
    <View style={hero ? { borderRadius: size / 2 + 2, borderWidth: 2, borderColor: '#ffffff' } : undefined}>
        <PlayerPhoto personId={personId} name={name} size={size} team={hero ? { id: teamId, logo } : { id: teamId, logo, color }} />
    </View>
);
