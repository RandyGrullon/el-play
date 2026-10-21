// Pantalla de respaldo para errores de render (ErrorBoundary) y rutas que no existen (+not-found).
// Sin el tema ni las piezas de ui.tsx: tiene que pintarse aunque lo que falló sean los proveedores o las fuentes.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, type Palette } from '../theme/tokens';

interface Action {
    label: string;
    run: () => void;
}

export const ErrorScreen: React.FC<{ colors: Palette; title: string; body: string; detail?: string; actions: Action[] }> = ({ colors, title, body, detail, actions }) => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.bg }}>
        <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>
            {title}
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center', maxWidth: 320 }}>{body}</Text>
        {/* El mensaje técnico solo mientras se programa */}
        {detail ? (
            <Text selectable style={{ fontSize: 12, color: colors.faint, textAlign: 'center', maxWidth: 320 }}>
                {detail}
            </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 }}>
            {actions.map((action, index) => (
                <Pressable
                    key={action.label}
                    onPress={action.run}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ height: 44, paddingHorizontal: 20, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: index === 0 ? colors.accent : colors.surface, opacity: pressed ? 0.8 : 1 })}
                >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: index === 0 ? '#fff' : colors.ink }}>{action.label}</Text>
                </Pressable>
            ))}
        </View>
    </View>
);
