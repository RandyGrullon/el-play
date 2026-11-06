// Piezas que comparten Posiciones, Líderes, Estadísticas y la ficha del pelotero.
import React from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react-native';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { ProBadge, Row, Title, Txt, leaveSheets } from '../ui';
import { WEB_URL } from '../../lib/config';
import { isOnPage, linkId, nameSegments, playerParams, type LinkPerson } from '../../lib/links';

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
// Desde dentro de una hoja (la jugada a jugada, el box, comparar) primero se cierra la hoja: si no, taparía la página
export const openPlayer = (player: { id: number; name?: string | null; teamId?: number | null }, season?: number) => leaveSheets(() => router.push({ pathname: '/jugador/[id]', params: playerParams(player, season) }));

/** Abre la página del equipo (pantalla completa, encima de la que se está viendo) */
export const openTeam = (id: number) => leaveSheets(() => router.push({ pathname: '/equipo/[id]', params: { id } }));

/** `label`: lo que oye el lector de pantalla, si la pieza ya decía más que «Abrir la página de…» */
type LinkProps = { style?: StyleProp<ViewStyle>; hitSlop?: number; disabled?: boolean; label?: string; children: React.ReactNode };

/**
 * Lo que muestra un equipo (logo, siglas, nombre) lleva a su página. Se pinta igual que antes: el estilo de la caja va en
 * `style`. Sin id (o `disabled`) queda una caja con el mismo estilo que no se toca. Dentro de otra pieza que se toca (la
 * tarjeta de un juego) gana esta: en el teléfono el toque es del Pressable más adentro y en la web corta el clic. En la
 * página de ese mismo equipo no enlaza (no apila otra igual).
 */
export const TeamLink: React.FC<LinkProps & { id: number | null | undefined; name: string }> = ({ id, name, style, hitSlop, disabled, label, children }) => {
    const { t } = useTranslation();
    const here = isOnPage(usePathname(), 'equipo', id);
    const target = linkId(id);
    if (!target || disabled || here) return <View style={style} accessible={label ? true : undefined} accessibilityLabel={label}>{children}</View>;
    return (
        <Pressable onPress={() => openTeam(target)} accessibilityRole="link" accessibilityLabel={label ?? t('team.open', { team: name })} hitSlop={hitSlop} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}>
            {children}
        </Pressable>
    );
};

/** Lo que muestra un pelotero (foto, nombre) lleva a su ficha (/jugador/[id], con el botón de comparar); igual que TeamLink */
export const PlayerLink: React.FC<LinkProps & { player: { id: number | null | undefined; name: string; teamId?: number | null } | null | undefined; season?: number }> = ({ player, season, style, hitSlop, disabled, label, children }) => {
    const { t } = useTranslation();
    const here = isOnPage(usePathname(), 'jugador', player?.id);
    const target = linkId(player?.id);
    if (!player || !target || disabled || here) return <View style={style} accessible={label ? true : undefined} accessibilityLabel={label}>{children}</View>;
    return (
        <Pressable
            onPress={() => openPlayer({ id: target, name: player.name, teamId: player.teamId }, season)}
            accessibilityRole="link"
            accessibilityLabel={label ?? t('statsPage.viewPlayer', { name: player.name })}
            hitSlop={hitSlop}
            style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}
        >
            {children}
        </Pressable>
    );
};

/** Un nombre dentro de una línea de texto (Txt anidado): se toca solo ese pedazo y la línea se ve igual */
export const playerTextLink = (player: { id: number | null | undefined; name: string; teamId?: number | null } | null | undefined, season?: number) => {
    const target = linkId(player?.id);
    return player && target ? { onPress: () => openPlayer({ id: target, name: player.name, teamId: player.teamId }, season), accessibilityRole: 'link' as const } : {};
};

/**
 * Un texto con nombres de peloteros dentro (la descripción de una jugada): cada nombre de la lista abre su ficha. Va dentro
 * de un Txt y hereda su letra: se ve igual.
 */
export const LinkedNames: React.FC<{ text: string; people: readonly (LinkPerson | null | undefined)[] }> = ({ text, people }) => (
    <>
        {nameSegments(text, people).map((part, index) =>
            part.person ? (
                <Text key={index} {...playerTextLink(part.person)}>
                    {part.text}
                </Text>
            ) : (
                part.text
            )
        )}
    </>
);

/** Lo mismo con equipos: las siglas (o el nombre) de cada uno dentro del texto abren su página */
export const LinkedTeams: React.FC<{ text: string; teams: readonly ({ id: number; abbrev?: string; name?: string } | null | undefined)[]; by?: 'abbrev' | 'name' }> = ({ text, teams, by = 'abbrev' }) => (
    <>
        {nameSegments(
            text,
            teams.map((team) => (team ? { id: team.id, name: (by === 'abbrev' ? team.abbrev : team.name) ?? '' } : null))
        ).map((part, index) =>
            part.person ? (
                <Text key={index} {...teamTextLink(part.person.id)}>
                    {part.text}
                </Text>
            ) : (
                part.text
            )
        )}
    </>
);

/** Las siglas o el nombre de un equipo dentro de una línea de texto */
export const teamTextLink = (id: number | null | undefined) => {
    const target = linkId(id);
    return target ? { onPress: () => openTeam(target), accessibilityRole: 'link' as const } : {};
};

/** Compartir el enlace de una página de la web (`/equipo/672`, `/jugador/123`) con un texto corto */
export const shareLink = (path: string, title: string, message: string) => {
    const url = `${WEB_URL}${path}`;
    // iOS comparte el texto y el enlace por separado; Android solo el texto (el enlace va dentro)
    Share.share(Platform.OS === 'ios' ? { title, message, url } : { title, message: `${message}\n${url}` }).catch(() => undefined);
};

/** Compartir como texto (la imagen del post de la web todavía no está en la app) */
export const shareText = (message: string) => {
    Share.share({ message: `${message}\n${WEB_URL}` }).catch(() => undefined);
};

/** Grupo del Clásico en el idioma activo: «Pool A» → «Grupo A» */
export const poolTitle = (pool: string, lang: string) => (lang.startsWith('en') ? pool : pool.replace(/^Pool\b/, 'Grupo'));
