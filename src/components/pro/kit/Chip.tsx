import React from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '../../../theme/theme';
import { alpha, radius } from '../../../theme/tokens';
import { TeamLogo, Txt, type LogoTeam } from '../../ui';
import { teamInk } from './color';
import { toneColors, useProColors, type ProTone } from './theme';

export type ChipTone = ProTone;

interface ChipProps {
    children: React.ReactNode;
    tone?: ChipTone;
    /** Ícono de 14 px a la izquierda (lucide, con el color que devuelve useChipInk) */
    icon?: React.ReactNode;
    /** Borde punteado: dato que todavía no llega («por jugar») */
    dashed?: boolean;
    /** Lo que oye el lector si el texto visible no basta */
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}

/** Color del texto de un chip de ese tono (para pintar el ícono igual) */
export const useChipInk = (tone: ChipTone = 'neutral') => {
    const colors = useColors();
    const pro = useProColors();
    return toneColors(tone, colors, pro).ink;
};

// Chip informativo (no se toca), 24 px de alto: «G1», «BB», «Presión ×2.04», «Actualizado hace 3 s».
export const Chip: React.FC<ChipProps> = ({ children, tone = 'neutral', icon, dashed = false, accessibilityLabel, style }) => {
    const colors = useColors();
    const pro = useProColors();
    const { ink, bg } = toneColors(tone, colors, pro);
    return (
        <View
            accessible={!!accessibilityLabel}
            accessibilityLabel={accessibilityLabel}
            style={[
                { height: 24, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10 },
                dashed ? { borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.25), backgroundColor: 'transparent' } : { backgroundColor: bg },
                style
            ]}
        >
            {icon}
            {typeof children === 'string' || typeof children === 'number' ? (
                <Txt size={12} weight="bold" color={dashed ? colors.muted : ink} numberOfLines={1}>
                    {children}
                </Txt>
            ) : (
                children
            )}
        </View>
    );
};

interface ChipButtonProps {
    children: React.ReactNode;
    active: boolean;
    onPress: () => void;
    icon?: React.ReactNode;
    /** Nombre completo si el texto visible es corto («AVG» → «Ordenar por promedio») */
    accessibilityLabel?: string;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}

// Chip que se toca (filtro u opción): 44 px de alto, el activo en tinta con texto del fondo (como los días de la portada).
export const ChipButton: React.FC<ChipButtonProps> = ({ children, active, onPress, icon, accessibilityLabel, disabled = false, style }) => {
    const colors = useColors();
    const ink = active ? colors.bg : colors.ink;
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={accessibilityLabel}
            style={({ pressed }) => [
                { height: 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 16, backgroundColor: active ? colors.ink : colors.raised, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
                style
            ]}
        >
            {icon}
            {typeof children === 'string' || typeof children === 'number' ? (
                <Txt size={13} weight="bold" color={ink} numberOfLines={1}>
                    {children}
                </Txt>
            ) : (
                children
            )}
        </Pressable>
    );
};

interface ChipRowProps {
    children: React.ReactNode;
    /** Nombre del grupo para lectores de pantalla */
    label: string;
    /** Llega hasta el borde de la pantalla (compensa los 16 px de la página) */
    bleed?: boolean;
    /** Sin `bleed`: margen de los lados dentro de la franja (p. ej. 16 si la franja va de borde a borde) */
    inset?: number;
    /** Espacio entre chips (8) */
    gap?: number;
    style?: StyleProp<ViewStyle>;
}

// Franja de chips que se desliza de lado sin barra visible; nunca ensancha la página.
export const ChipRow: React.FC<ChipRowProps> = ({ children, label, bleed = true, inset = 0, gap = 8, style }) => (
    <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={label}
        style={[{ flexGrow: 0 }, bleed && { marginHorizontal: -16 }, style]}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap, paddingHorizontal: bleed ? 16 : inset }}
    >
        {children}
    </ScrollView>
);

interface TeamChipProps {
    team: LogoTeam & { abbrev: string; color: string };
    /** Texto (la sigla por defecto) */
    children?: React.ReactNode;
    /** Logo a la izquierda (lado del visitante) o a la derecha */
    logo?: 'start' | 'end';
    size?: 'sm' | 'md';
    style?: StyleProp<ViewStyle>;
}

// Píldora con el color del equipo, su sigla y el logo en un círculo blanco (cara a cara, pronósticos).
export const TeamChip: React.FC<TeamChipProps> = ({ team, children, logo = 'end', size = 'md', style }) => {
    const logoSize = size === 'md' ? 20 : 16;
    const mark = (
        <View style={{ borderRadius: radius.pill, backgroundColor: '#fff', padding: 2 }}>
            <TeamLogo team={team} size={logoSize} />
        </View>
    );
    return (
        <View
            style={[
                { height: size === 'md' ? 28 : 24, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: team.color },
                logo === 'end' ? { paddingLeft: 10, paddingRight: 4 } : { paddingLeft: 4, paddingRight: 10 },
                style
            ]}
        >
            {logo === 'start' && mark}
            {typeof children === 'string' || children === undefined ? (
                <Txt size={size === 'md' ? 13 : 12} weight="extrabold" color={teamInk(team.color)} numberOfLines={1}>
                    {children ?? team.abbrev}
                </Txt>
            ) : (
                children
            )}
            {logo === 'end' && mark}
        </View>
    );
};
