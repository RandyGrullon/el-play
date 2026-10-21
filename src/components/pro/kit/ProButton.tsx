import React from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, alpha, radius, shadow } from '../../../theme/tokens';
import { Txt } from '../../ui';

export type ButtonVariant = 'gradient' | 'solid' | 'soft' | 'ghost';

interface ProButtonProps extends Omit<PressableProps, 'style' | 'children'> {
    label: string;
    variant?: ButtonVariant;
    /** Ícono lucide de 16-18 px: función que recibe el color del texto */
    icon?: (color: string) => React.ReactNode;
    /** El ícono va después del texto («Ver el final ›») */
    iconEnd?: boolean;
    /** Ocupa todo el ancho (o reparte con flex: 1) */
    block?: boolean;
    size?: 'md' | 'lg';
    style?: StyleProp<ViewStyle>;
}

/** Color del texto de cada variante (para pintar el ícono igual) */
const useInk = (variant: ButtonVariant) => {
    const colors = useColors();
    return { gradient: '#fff', solid: colors.bg, soft: colors.ink, ghost: colors.accentInk }[variant];
};

// Botón PRO en píldora: 44 px (md) o 48 px (lg) de alto. gradient: acción principal PRO («Compartir imagen»);
// solid: principal sin degradado; soft: secundaria; ghost: enlace con área táctil («Ver el final ›»).
export const ProButton: React.FC<ProButtonProps> = ({ label, variant = 'soft', icon, iconEnd = false, block = false, size = 'md', style, disabled, ...rest }) => {
    const colors = useColors();
    const ink = useInk(variant);
    const height = size === 'lg' ? 48 : 44;
    const content = (
        <>
            {!iconEnd && icon?.(ink)}
            <Txt size={14} weight="bold" color={ink} numberOfLines={1} style={{ flexShrink: 1 }}>
                {label}
            </Txt>
            {iconEnd && icon?.(ink)}
        </>
    );
    const inner: ViewStyle = { height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, borderRadius: radius.pill };
    return (
        <Pressable
            {...rest}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={rest.accessibilityLabel ?? label}
            accessibilityState={{ disabled: !!disabled }}
            style={({ pressed }) => [
                { borderRadius: radius.pill, minWidth: 0, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
                block && { alignSelf: 'stretch' },
                !block && { alignSelf: 'flex-start' },
                variant === 'gradient' && shadow('float'),
                style
            ]}
        >
            {({ pressed }) =>
                variant === 'gradient' ? (
                    <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={inner}>
                        {content}
                    </LinearGradient>
                ) : (
                    <View
                        style={[
                            inner,
                            variant === 'solid' && { backgroundColor: colors.ink },
                            variant === 'soft' && { backgroundColor: pressed ? alpha(colors.line, 0.2) : colors.raised },
                            variant === 'ghost' && pressed && { backgroundColor: alpha(colors.accent, 0.1) }
                        ]}
                    >
                        {content}
                    </View>
                )
            }
        </Pressable>
    );
};
