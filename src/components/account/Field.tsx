// Campo de texto con el estilo de la web (fondo «raised», borde de acento al escribir).
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useColors } from '../../theme/theme';
import { fonts } from '../../theme/tokens';
import { Txt } from '../ui';

/** Botón corto al lado de un campo: oscuro («Guardar», «Crear») o del color de la liga («Unirme») */
export const FieldButton: React.FC<{ label: string; onPress: () => void; tone?: 'ink' | 'accent'; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle> }> = ({ label, onPress, tone = 'ink', disabled, busy, style }) => {
    const colors = useColors();
    const ink = tone === 'ink' ? colors.bg : '#fff';
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!(disabled || busy) }}
            style={({ pressed }) => [
                { height: 44, borderRadius: 16, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'ink' ? colors.ink : colors.accent, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
                style
            ]}
        >
            {busy ? (
                <ActivityIndicator color={ink} />
            ) : (
                <Txt size={14} weight="bold" color={ink}>
                    {label}
                </Txt>
            )}
        </Pressable>
    );
};

// En la web el navegador pinta su anillo de foco encima del borde de acento: se quita
const NO_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

export const Field: React.FC<TextInputProps & { style?: StyleProp<TextStyle>; height?: number }> = ({ style, height = 44, onFocus, onBlur, ...props }) => {
    const colors = useColors();
    const [focused, setFocused] = useState(false);
    return (
        <TextInput
            placeholderTextColor={colors.faint}
            selectionColor={colors.accent}
            {...props}
            onFocus={(event) => {
                setFocused(true);
                onFocus?.(event);
            }}
            onBlur={(event) => {
                setFocused(false);
                onBlur?.(event);
            }}
            style={[
                {
                    height,
                    minWidth: 0,
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    backgroundColor: colors.raised,
                    color: colors.ink,
                    fontFamily: fonts.regular,
                    fontSize: 15,
                    borderWidth: 2,
                    borderColor: focused ? colors.accent : 'transparent'
                },
                NO_OUTLINE,
                style
            ]}
        />
    );
};
