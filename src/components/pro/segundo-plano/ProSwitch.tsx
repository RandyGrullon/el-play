import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Txt } from '../../ui';
import { SwitchTrack } from '../../AppSwitch';

interface ProSwitchProps {
    value: boolean;
    onChange: (next: boolean) => void;
    label: string;
    /** Línea chica debajo del nombre («Solo los de LIC») */
    hint?: string;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}

// Interruptor de una fila (alertas del juego): toda la fila es el botón (44 px de alto) y para el lector es un
// «switch» con su estado. La pista y la bolita son las del interruptor de la app (AppSwitch).
export const ProSwitch: React.FC<ProSwitchProps> = ({ value, onChange, label, hint, disabled, style }) => (
    <Pressable
        onPress={() => onChange(!value)}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ checked: value, disabled: !!disabled }}
        // En la web (react-native-web) el estado solo llega como aria-*
        aria-checked={value}
        aria-disabled={disabled || undefined}
        style={({ pressed }) => [{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}
    >
        <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={14} weight="semibold">
                {label}
            </Txt>
            {!!hint && (
                <Txt size={12} tone="muted" style={{ marginTop: 1 }}>
                    {hint}
                </Txt>
            )}
        </View>
        <SwitchTrack value={value} />
    </Pressable>
);
