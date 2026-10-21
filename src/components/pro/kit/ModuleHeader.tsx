import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_LINE, alpha, radius, shadow } from '../../../theme/tokens';
import { ProBadge, Txt } from '../../ui';
import { GradientCard } from './StatTile';

/** Texto o nodo: el texto sale con el estilo indicado; lo demás tal cual */
const textOr = (node: React.ReactNode, render: (text: string) => React.ReactNode) => (typeof node === 'string' || typeof node === 'number' ? render(String(node)) : node);

interface ModuleHeaderProps {
    title: React.ReactNode;
    /** A la derecha de la línea: «por turno · MLB», «Top 10», un botón corto */
    aside?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

// Encabezado de módulo PRO: eyebrow de 11 px en mayúsculas y una línea fina con el degradado de la marca.
export const ModuleHeader: React.FC<ModuleHeaderProps> = ({ title, aside, style }) => (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }, style]}>
        {textOr(title, (text) => (
            <Txt eyebrow accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1, lineHeight: 16 }}>
                {text}
            </Txt>
        ))}
        <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_LINE} style={{ height: 1, flex: 1, minWidth: 16, opacity: 0.7 }} />
        {aside
            ? textOr(aside, (text) => (
                  <Txt size={11} weight="semibold" tone="muted" numberOfLines={1} style={{ flexShrink: 0, maxWidth: '55%' }}>
                      {text}
                  </Txt>
              ))
            : null}
    </View>
);

interface ProSectionProps {
    title?: React.ReactNode;
    aside?: React.ReactNode;
    /** Nombre de la sección si no lleva título visible (lector de pantalla) */
    label?: string;
    /** El encabezado va fuera de la tarjeta (como «Cara a cara» en la previa) */
    headerOutside?: boolean;
    /** Borde con el degradado de la marca (lo destacado) */
    gradient?: boolean;
    style?: StyleProp<ViewStyle>;
    /** Estilo de la tarjeta (padding 16 por defecto) */
    bodyStyle?: StyleProp<ViewStyle>;
    children: React.ReactNode;
}

// Módulo PRO: tarjeta de radio 24 con su encabezado (dentro o encima).
export const ProSection: React.FC<ProSectionProps> = ({ title, aside, label, headerOutside = false, gradient = false, style, bodyStyle, children }) => {
    const colors = useColors();
    const header = title ? <ModuleHeader title={title} aside={aside} style={{ marginBottom: headerOutside ? 12 : 14 }} /> : null;
    const inner = (
        <>
            {!headerOutside && header}
            {children}
        </>
    );
    return (
        <View accessibilityLabel={title ? undefined : label} style={style}>
            {headerOutside && header}
            {gradient ? (
                <GradientCard innerStyle={[{ padding: 16 }, bodyStyle]}>{inner}</GradientCard>
            ) : (
                <View style={[{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16 }, shadow('card'), bodyStyle]}>{inner}</View>
            )}
        </View>
    );
};

interface ScreenTitleProps {
    title: React.ReactNode;
    /** Arriba, pequeño: «LIDOM · Temporada 2026-27» */
    eyebrow?: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Botones a la derecha (compartir, glosario): de 44 px */
    actions?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

// Título de pantalla PRO: 32 px, 900, con la insignia PRO al lado (siempre visible).
export const ScreenTitle: React.FC<ScreenTitleProps> = ({ title, eyebrow, subtitle, actions, style }) => (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, style]}>
        <View style={{ flex: 1, minWidth: 0 }}>
            {eyebrow
                ? textOr(eyebrow, (text) => (
                      <Txt size={14} weight="semibold" tone="muted" style={{ marginBottom: 2 }}>
                          {text}
                      </Txt>
                  ))
                : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 }}>
                {textOr(title, (text) => (
                    <Txt size={32} weight="black" accessibilityRole="header" style={{ lineHeight: 34, letterSpacing: -0.5, flexShrink: 1 }}>
                        {text}
                    </Txt>
                ))}
                <ProBadge />
            </View>
            {subtitle
                ? textOr(subtitle, (text) => (
                      <Txt size={14} tone="muted" style={{ marginTop: 4 }}>
                          {text}
                      </Txt>
                  ))
                : null}
        </View>
        {actions ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</View> : null}
    </View>
);
