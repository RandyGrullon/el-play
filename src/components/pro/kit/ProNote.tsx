import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Info, Radar, TriangleAlert } from 'lucide-react-native';
import { useColors } from '../../../theme/theme';
import { alpha, radius } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { teamInk } from './color';
import { useProColors } from './theme';

export type NoteTone = 'info' | 'warn' | 'neutral' | 'pending';

interface ProNoteProps {
    children: React.ReactNode;
    tone?: NoteTone;
    /** Ícono propio (18 px); `null` para no poner ninguno */
    icon?: React.ReactNode | null;
    /** Primera frase en negrita: «Abridores: por anunciar.» */
    title?: string;
    style?: StyleProp<ViewStyle>;
}

// Nota honesta: lo que MLB no manda, de dónde sale un dato o por qué se ve otra temporada.
export const ProNote: React.FC<ProNoteProps> = ({ children, tone = 'info', icon, title, style }) => {
    const colors = useColors();
    const pro = useProColors();
    const look = {
        info: { box: { backgroundColor: alpha(colors.accent, 0.12) }, ink: colors.accentInk, Icon: Info },
        warn: { box: { backgroundColor: alpha(pro.warn, 0.12) }, ink: pro.warn, Icon: TriangleAlert },
        neutral: { box: { backgroundColor: colors.raised }, ink: colors.muted, Icon: Info },
        pending: { box: { borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.2) } as ViewStyle, ink: colors.muted, Icon: Radar }
    }[tone];
    const Icon = look.Icon;
    return (
        <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.tile, paddingHorizontal: 12, paddingVertical: 10 }, look.box, style]}>
            {icon !== null && <View style={{ marginTop: 1 }}>{icon ?? <Icon size={18} color={look.ink} />}</View>}
            <View style={{ flex: 1, minWidth: 0 }}>
                {typeof children === 'string' || title ? (
                    <Txt size={13} style={{ lineHeight: 18 }}>
                        {title ? <Txt size={13} weight="bold">{`${title} `}</Txt> : null}
                        {typeof children === 'string' ? children : null}
                    </Txt>
                ) : null}
                {typeof children === 'string' ? null : children}
            </View>
        </View>
    );
};

interface MirrorRowProps {
    /** Qué se compara (centro, en mayúsculas pequeñas) */
    label: string;
    left: React.ReactNode;
    right: React.ReactNode;
    /** Lado con el mejor valor: va en una píldora con el color de su equipo */
    best?: 'left' | 'right' | null;
    leftColor?: string;
    rightColor?: string;
    /** Línea bajo la etiqueta («menos es mejor») */
    sub?: string;
    /** Lo que oye el lector (si no: «visitante, etiqueta, local») */
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}

const Value: React.FC<{ children: React.ReactNode; color?: string; best: boolean; align: 'left' | 'right' }> = ({ children, color, best, align }) => {
    const colors = useColors();
    const pill = best && color;
    return (
        <View style={{ flex: 1, minWidth: 0, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
            <View style={[{ paddingVertical: 4 }, pill ? { backgroundColor: color, borderRadius: radius.pill, paddingHorizontal: 10 } : null]}>
                {typeof children === 'string' || typeof children === 'number' ? (
                    <Txt condensed size={20} tabular color={pill ? teamInk(color) : colors.ink} numberOfLines={1} style={{ lineHeight: 22 }}>
                        {children}
                    </Txt>
                ) : (
                    children
                )}
            </View>
        </View>
    );
};

// Fila del cara a cara en espejo: valor del visitante, qué se mide, valor del local. El mejor, resaltado.
export const MirrorRow: React.FC<MirrorRowProps> = ({ label, left, right, best = null, leftColor, rightColor, sub, accessibilityLabel, style }) => {
    const colors = useColors();
    const plain = (node: React.ReactNode) => (typeof node === 'string' || typeof node === 'number' ? String(node) : '');
    return (
        <View
            accessible
            accessibilityLabel={accessibilityLabel ?? [plain(left), label, plain(right)].filter(Boolean).join(', ')}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), paddingVertical: 10 }, style]}
        >
            <Value color={leftColor} best={best === 'left'} align="left">
                {left}
            </Value>
            <View style={{ maxWidth: 144, alignItems: 'center' }}>
                <Txt size={11} weight="extrabold" tone="muted" center style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {label}
                </Txt>
                {sub ? (
                    <Txt size={10} tone="muted" center>
                        {sub}
                    </Txt>
                ) : null}
            </View>
            <Value color={rightColor} best={best === 'right'} align="right">
                {right}
            </Value>
        </View>
    );
};
