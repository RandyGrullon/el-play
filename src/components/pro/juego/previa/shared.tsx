import React, { useEffect } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { RotateCw, WifiOff } from 'lucide-react-native';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { Skeleton, Txt } from '../../../ui';
import { MOTION_EASE, MOTION_MS, ProButton, ProNote, ProSection, teamInk, useMotion } from '../../kit';
import type { Better } from './logica';
import { isOffline } from './datos';

// Piezas de la previa y del final PRO: estado de cada bloque (cargando / sin red / error) y la fila en espejo del
// cara a cara.

interface BlockStateProps {
    title: string;
    loading: boolean;
    error?: unknown;
    /** Alto del esqueleto mientras carga */
    height?: number;
    onRetry?: () => void;
    /** El encabezado va fuera de la tarjeta (bloques de la previa) */
    headerOutside?: boolean;
}

/** Bloque que todavía carga o que falló: esqueleto del alto del bloque, «sin conexión» o nota con «Reintentar» */
export const BlockState: React.FC<BlockStateProps> = ({ title, loading, error, height = 160, onRetry, headerOutside = true }) => {
    const { t } = useTranslation();
    const offline = isOffline(error);
    return (
        <ProSection title={title} headerOutside={headerOutside}>
            {loading ? (
                <View accessible accessibilityLabel={t('pro.previa.loading', { name: title })} accessibilityState={{ busy: true }}>
                    <Skeleton height={height} round={radius.tile} />
                </View>
            ) : (
                <View style={{ gap: 8 }}>
                    <ProNote tone={offline ? 'neutral' : 'warn'} icon={offline ? <OfflineIcon /> : undefined} title={offline ? t('pro.previa.offline.title') : t('pro.previa.error.title')}>
                        {offline ? t('pro.previa.offline.body') : t('pro.previa.error.body')}
                    </ProNote>
                    {onRetry && <ProButton variant="ghost" label={t('common.retry')} icon={(color) => <RotateCw size={16} color={color} />} onPress={onRetry} />}
                </View>
            )}
        </ProSection>
    );
};

const OfflineIcon: React.FC = () => {
    const colors = useColors();
    return <WifiOff size={18} color={colors.muted} />;
};

/** Rótulo pequeño en mayúsculas (11 px, apagado) */
export const Eyebrow: React.FC<{ children: React.ReactNode; center?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }> = ({ children, center, style, numberOfLines }) => (
    <Txt size={11} weight="extrabold" tone="muted" center={center} numberOfLines={numberOfLines} style={[{ textTransform: 'uppercase', letterSpacing: 0.6, lineHeight: 14 }, style]}>
        {children}
    </Txt>
);

/** Línea divisoria de las tarjetas PRO (1 px de la línea al 10 %) */
export const useDivider = (): ViewStyle => {
    const colors = useColors();
    return { borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1) };
};

interface MirrorLineProps {
    label: string;
    /** Lo que oye el lector después de los valores: «ventaja GIG», «parejos» */
    verdict?: string;
    /** Lo que oye el lector de cada lado (si no se entiende del dibujo) */
    leftText: string;
    rightText: string;
    left: React.ReactNode;
    right: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

// Fila del cara a cara: valor del visitante · qué se mide · valor del local (en espejo). Un elemento para el lector.
export const MirrorLine: React.FC<MirrorLineProps> = ({ label, verdict, leftText, rightText, left, right, style }) => {
    const divider = useDivider();
    return (
        <View
            accessible
            accessibilityLabel={[label, leftText, rightText, verdict].filter(Boolean).join(', ')}
            style={[{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 }, divider, style]}
        >
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>{left}</View>
            <View style={{ width: 96, alignItems: 'center' }}>
                <Eyebrow center>{label}</Eyebrow>
            </View>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>{right}</View>
        </View>
    );
};

/** Cifra grande del cara a cara: en píldora con el color del equipo si es la mejor; apagada si gana el otro lado */
export const MirrorValue: React.FC<{ better: Better; side: 'left' | 'right'; color: string; children: React.ReactNode; size?: number }> = ({ better, side, color, children, size = 22 }) => {
    const colors = useColors();
    const best = better === side;
    return (
        <View style={best ? { height: 28, borderRadius: radius.pill, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: color } : undefined}>
            <Txt condensed size={size} tabular numberOfLines={1} color={best ? teamInk(color) : better ? colors.muted : colors.ink} style={{ lineHeight: size + 2 }}>
                {children}
            </Txt>
        </View>
    );
};

/** Lado que gana la comparación, para el lector */
export const verdictOf = (better: Better, left: string, right: string, even: string, ahead: (team: string) => string) =>
    better === 'left' ? ahead(left) : better === 'right' ? ahead(right) : even;

interface SeenEnterProps {
    /** La lista ya entró en pantalla (useInView del padre) */
    seen: boolean;
    index?: number;
    /** Retraso entre una pieza y la siguiente (30 ms) */
    step?: number;
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
}

// Entrada escalonada cuando la lista se ve (no al montarse): sube 8 px, crece un poco y aparece (300 ms).
export const SeenEnter: React.FC<SeenEnterProps> = ({ seen, index = 0, step = 30, style, children }) => {
    const motion = useMotion();
    const shown = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            shown.set(1);
            return;
        }
        if (!seen) return;
        shown.set(withDelay(motion.delay(index, step), withTiming(1, { duration: MOTION_MS.flip, easing: MOTION_EASE })));
        return () => cancelAnimation(shown);
    }, [seen, motion, index, step, shown]);
    const enter = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * 8 }, { scale: 0.94 + shown.get() * 0.06 }] }));
    return <Animated.View style={[style, enter]}>{children}</Animated.View>;
};
