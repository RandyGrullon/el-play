// Piezas comunes de las gráficas PRO: ids para <Defs>, texto de los ejes, el botón táctil que va encima del SVG y
// el círculo de las jugadas clave.
import React, { useEffect, useId } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { G } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { MOTION_EASE, MOTION_MS, useMotion } from '../../../lib/motion';
import { useColors } from '../../../theme/theme';
import { fonts, radius, shadow } from '../../../theme/tokens';
import { Txt } from '../../ui';

/** id válido para url(#…) en SVG (useId trae «:» que hay que quitar) */
export const useSvgId = (prefix: string) => `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

/** Props del texto de los ejes (11 px, semibold, color apagado del tema) para <Text> de react-native-svg */
export const useAxisText = () => {
    const colors = useColors();
    return { fontFamily: fonts.semibold, fontSize: 11, fill: colors.muted } as const;
};

/** Para centrar un texto de SVG en su `y` (dy de 0.35 em) */
export const middle = (fontSize: number) => fontSize * 0.35;

interface ChartHotspotProps {
    /** Centro en px dentro del contenedor de la gráfica */
    x: number;
    y: number;
    /** Lo que dice el lector de pantalla: «Sencillo de Mejía, +12.4 %» */
    label: string;
    onPress: () => void;
    /** Lo que se ve (un círculo con número, «HR»…); el botón mide 44 px aunque se vea más chico */
    children?: React.ReactNode;
    active?: boolean;
    style?: StyleProp<ViewStyle>;
}

// Botón real encima de una gráfica (la gráfica es una imagen para el lector): 44 × 44 px centrado en (x, y).
export const ChartHotspot: React.FC<ChartHotspotProps> = ({ x, y, label, onPress, children, active = false, style }) => (
    <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        hitSlop={0}
        style={[{ position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, style]}
    >
        {children}
    </Pressable>
);

/** Círculo con número o texto corto para las jugadas clave (1, 2, 3, HR) */
export const MarkerBadge: React.FC<{ children: React.ReactNode; active?: boolean; color?: string }> = ({ children, active = false, color }) => {
    const colors = useColors();
    const fill = color ?? (active ? colors.ink : colors.surface);
    const ink = color ? '#14151a' : active ? colors.bg : colors.ink;
    return (
        <View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[{ minWidth: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: color ?? colors.ink, backgroundColor: fill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, shadow('card')]}
        >
            <Txt size={11} weight="extrabold" color={ink} style={{ lineHeight: 13 }}>
                {children}
            </Txt>
        </View>
    );
};

const AnimatedG = Animated.createAnimatedComponent(G);

/** Grupo de SVG que aparece (fundido) cuando la gráfica entra en pantalla; `index` lo escalona */
export const FadeG: React.FC<{ seen: boolean; index?: number; step?: number; duration?: number; opacity?: number; children: React.ReactNode }> = ({ seen, index = 0, step = 30, duration = MOTION_MS.flip, opacity = 1, children }) => {
    const motion = useMotion();
    const shown = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            shown.set(1);
            return;
        }
        if (!seen) return;
        shown.set(withDelay(motion.delay(index, step), withTiming(1, { duration, easing: MOTION_EASE })));
        return () => cancelAnimation(shown);
    }, [seen, motion, index, step, duration, shown]);
    const animatedProps = useAnimatedProps(() => ({ opacity: shown.get() * opacity }));
    return <AnimatedG animatedProps={animatedProps}>{children}</AnimatedG>;
};
