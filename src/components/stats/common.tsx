// Piezas que comparten Posiciones, Líderes, Estadísticas y la ficha del pelotero.
import React from 'react';
import { Pressable, ScrollView, Share, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Info } from 'lucide-react-native';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { ProBadge, Row, Title, Txt } from '../ui';
import { WEB_URL } from '../../lib/config';

/** Esta pantalla no se había abierto y no hay internet (en vez de cargar para siempre) */
export const waitingForNetwork = (query: { isPending: boolean; fetchStatus: string }) => query.isPending && query.fetchStatus === 'paused';

/** Fila de pastillas con scroll de lado a lado, hasta el borde de la pantalla */
export const ChipRow: React.FC<{ children: React.ReactNode; gap?: number; label?: string }> = ({ children, gap = 8, label }) => (
    <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -16, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, gap }}
        accessibilityLabel={label}
    >
        {children}
    </ScrollView>
);

/** «LIDOM · Temporada 2026-27», el título grande y la insignia PRO si está activo */
export const SectionHeader: React.FC<{ subtitle: string; title: string; pro?: boolean; lead?: string; right?: React.ReactNode }> = ({ subtitle, title, pro, lead, right }) => (
    <Row align="flex-start" justify="space-between" gap={12}>
        <View style={{ flex: 1 }}>
            <Txt size={14} weight="semibold" tone="muted">
                {subtitle}
            </Txt>
            <Row gap={8} wrap>
                <Title>{title}</Title>
                {pro ? <ProBadge /> : null}
            </Row>
            {lead ? (
                <Txt size={14} tone="muted" style={{ marginTop: 4, maxWidth: 420 }}>
                    {lead}
                </Txt>
            ) : null}
        </View>
        {right}
    </Row>
);

/** Aviso azul de temporada pasada */
export const Notice: React.FC<{ text: string; style?: StyleProp<ViewStyle> }> = ({ text, style }) => {
    const colors = useColors();
    return (
        <Row align="flex-start" gap={8} style={[{ backgroundColor: alpha(colors.accent, 0.1), borderRadius: radius.tile, paddingHorizontal: 12, paddingVertical: 10 }, style]}>
            <Info size={16} color={colors.accentInk} style={{ marginTop: 2 }} />
            <Txt size={14} color={colors.accentInk} style={{ flex: 1 }}>
                {text}
            </Txt>
        </Row>
    );
};

/** Botón ancho «Ver 40 más» */
export const MoreButton: React.FC<{ label: string; onPress: () => void; raised?: boolean }> = ({ label, onPress, raised }) => {
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={({ pressed }) => [{ height: raised ? 40 : 44, borderRadius: radius.pill, backgroundColor: raised ? colors.raised : colors.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 }, !raised && shadow('card')]}
        >
            <Txt size={14} weight="bold">
                {label}
            </Txt>
        </Pressable>
    );
};

/** Botón cuadrado de la cabecera (compartir la tabla) */
export const HeaderButton: React.FC<{ label: string; onPress: () => void; children: React.ReactNode; size?: number }> = ({ label, onPress, children, size = 48 }) => {
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [{ width: size, height: size, borderRadius: size >= 48 ? 16 : size / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 }, shadow('card')]}
        >
            {children}
        </Pressable>
    );
};

/** Abre la ficha del pelotero (modal); nombre y equipo pintan la cabecera mientras carga */
export const openPlayer = (player: { id: number; name: string; teamId?: number | null }, season?: number) =>
    router.push({
        pathname: '/jugador/[id]',
        params: { id: player.id, name: player.name, ...(player.teamId ? { teamId: player.teamId } : {}), ...(season ? { season } : {}) }
    });

/** Compartir como texto (la imagen del post de la web todavía no está en la app) */
export const shareText = (message: string) => {
    Share.share({ message: `${message}\n${WEB_URL}` }).catch(() => undefined);
};

/** Grupo del Clásico en el idioma activo: «Pool A» → «Grupo A» */
export const poolTitle = (pool: string, lang: string) => (lang.startsWith('en') ? pool : pool.replace(/^Pool\b/, 'Grupo'));
