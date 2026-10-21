import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, radius as radii } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { CountUp } from './CountUp';
import { useInView } from './hooks';
import { toneColors, useProColors } from './theme';

export interface DeltaProps {
    /** Variación con signo (lo que subió o bajó) */
    value: number;
    /** Cómo se escribe sin signo (la flecha ya lo dice): «8», «.057», «1.6 mph» */
    display?: string;
    /** Si subir es bueno (por defecto) o malo (EFE, WHIP, K% del bateador) */
    better?: 'higher' | 'lower';
    variant?: 'chip' | 'text';
    style?: StyleProp<ViewStyle>;
}

const Arrow: React.FC<{ up: boolean; color: string }> = ({ up, color }) => (
    <Svg width={8} height={8} viewBox="0 0 10 10">
        <Path d={up ? 'M5 1 L9.5 8.5 H0.5 Z' : 'M5 9 L9.5 1.5 H0.5 Z'} fill={color} />
    </Svg>
);

/** Lo que oye el lector por una variación: «sube 8», «baja .057», «sin cambio» */
const useDeltaText = () => {
    const { t } = useTranslation();
    return ({ value, display }: Pick<DeltaProps, 'value' | 'display'>) => {
        if (!Number.isFinite(value) || value === 0) return t('pro.kit.delta.same');
        return t(value > 0 ? 'pro.kit.delta.up' : 'pro.kit.delta.down', { value: display ?? String(Math.abs(value)) });
    };
};

// Variación con flecha y color: verde si es para bien, rojo si es para mal (según `better`). El lector oye «sube 8».
export const Delta: React.FC<DeltaProps> = ({ value, display, better = 'higher', variant = 'chip', style }) => {
    const colors = useColors();
    const pro = useProColors();
    const spoken = useDeltaText()({ value, display });
    const text = display ?? String(Math.abs(value));
    const box: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' };
    if (!Number.isFinite(value) || value === 0) {
        return (
            <View accessible accessibilityLabel={spoken} style={[box, style]}>
                <Txt size={11} weight="extrabold" tone="muted">
                    =
                </Txt>
            </View>
        );
    }
    const up = value > 0;
    const good = up === (better === 'higher');
    const { ink, bg } = toneColors(good ? 'up' : 'down', colors, pro);
    return (
        <View accessible accessibilityLabel={spoken} style={[box, variant === 'chip' && { backgroundColor: bg }, style]}>
            <Arrow up={up} color={ink} />
            <Txt size={11} weight="extrabold" color={ink} tabular numberOfLines={1}>
                {text}
            </Txt>
        </View>
    );
};

export type TileTone = 'default' | 'live' | 'up' | 'down' | 'warn' | 'accent';

const SIZE = { sm: 24, md: 30, lg: 38 } as const;

export interface StatTileProps {
    /** La cifra ya escrita (o usa `countTo` para que cuente) */
    value?: React.ReactNode;
    /** Número que cuenta desde 0 al entrar en pantalla */
    countTo?: number;
    /** Formato del número que cuenta */
    format?: (value: number) => string;
    /** Unidad pequeña junto a la cifra: «pts», «mph», «%» */
    unit?: React.ReactNode;
    label: React.ReactNode;
    /** Línea pequeña debajo de la etiqueta */
    sub?: React.ReactNode;
    delta?: DeltaProps;
    size?: keyof typeof SIZE;
    align?: 'start' | 'center';
    tone?: TileTone;
    /** Borde con el degradado de la marca */
    gradient?: boolean;
    /** Lo que oye el lector (si no: cifra, unidad y etiqueta) */
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}

// Tile de cifra PRO: fondo elevado, radio 16, número grande en Barlow Condensed y etiqueta en mayúsculas.
export const StatTile: React.FC<StatTileProps> = ({ value, countTo, format, unit, label, sub, delta, size = 'md', align = 'start', tone = 'default', gradient = false, accessibilityLabel, style }) => {
    const colors = useColors();
    const pro = useProColors();
    const deltaText = useDeltaText();
    const { setNode, onLayout, seen: inView } = useInView();
    const centered = align === 'center';
    const ink = tone === 'default' ? colors.ink : toneColors(tone === 'accent' ? 'accent' : tone, colors, pro).ink;
    const fontSize = SIZE[size];
    const plain = (node: React.ReactNode) => typeof node === 'string' || typeof node === 'number';
    const spoken = accessibilityLabel ?? [countTo !== undefined ? (format ? format(countTo) : String(countTo)) : plain(value) ? String(value) : '', plain(unit) ? String(unit) : '', plain(label) ? String(label) : '', delta ? deltaText(delta) : ''].filter(Boolean).join(' ');
    const tile = (
        <View
            ref={setNode}
            onLayout={onLayout}
            accessible
            accessibilityLabel={spoken || undefined}
            style={[{ flexGrow: 1, minWidth: 0, gap: 4, backgroundColor: colors.raised, borderRadius: radii.tile - 1, paddingHorizontal: 11, paddingVertical: 9 }, centered && { alignItems: 'center' }]}
        >
            <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 4, minWidth: 0 }, centered && { justifyContent: 'center' }]}>
                <Txt condensed size={fontSize} color={ink} tabular numberOfLines={1} style={{ lineHeight: Math.round(fontSize * 1.05) }}>
                    {countTo !== undefined ? <CountUp value={countTo} format={format} seen={inView} /> : value}
                </Txt>
                {unit ? (
                    <Txt size={12} weight="bold" tone="muted">
                        {unit}
                    </Txt>
                ) : null}
                {delta ? <Delta {...delta} /> : null}
            </View>
            {plain(label) ? (
                <Txt size={11} weight="extrabold" tone="muted" center={centered} style={{ textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 14 }}>
                    {label}
                </Txt>
            ) : (
                label
            )}
            {sub ? (
                plain(sub) ? (
                    <Txt size={11} tone="muted" center={centered} style={{ lineHeight: 15 }}>
                        {sub}
                    </Txt>
                ) : (
                    sub
                )
            ) : null}
        </View>
    );
    // Siempre un marco de 1 px (degradado o del mismo fondo): así varios tiles con flex reparten igual el ancho
    if (!gradient) return <View style={[{ minWidth: 0, borderRadius: radii.tile, padding: 1, backgroundColor: colors.raised }, style]}>{tile}</View>;
    return (
        <GradientCard radius="tile" surface="raised" innerStyle={{ padding: 0 }} style={[{ minWidth: 0 }, style]}>
            {tile}
        </GradientCard>
    );
};

interface GradientCardProps extends ViewProps {
    /** Fondo de dentro: la tarjeta (surface), elevado (raised) o el de la página (bg) */
    surface?: 'surface' | 'raised' | 'bg';
    /** Radio de tarjeta (24) o de tile (16) */
    radius?: 'card' | 'tile';
    style?: StyleProp<ViewStyle>;
    /** Estilo de la tarjeta de dentro (padding 16 por defecto) */
    innerStyle?: StyleProp<ViewStyle>;
}

// Borde degradado para lo destacado: un píxel del degradado de la marca alrededor de la tarjeta.
export const GradientCard: React.FC<GradientCardProps> = ({ surface = 'surface', radius = 'card', style, innerStyle, children, ...rest }) => {
    const colors = useColors();
    const inner = radius === 'card' ? radii.card : radii.tile;
    return (
        <LinearGradient {...rest} colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={[{ borderRadius: inner + 1, padding: 1 }, style]}>
            <View style={[{ flexGrow: 1, backgroundColor: colors[surface], borderRadius: inner, padding: 16 }, innerStyle]}>{children}</View>
        </LinearGradient>
    );
};
