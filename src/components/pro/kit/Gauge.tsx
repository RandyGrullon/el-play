import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MOTION_MS } from '../../../lib/motion';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { DrawPath } from './DrawPath';
import { useInView } from './hooks';
import { arcLength, arcPath } from './paths';

interface GaugeProps {
    value: number;
    max: number;
    /** Para el lector: «43 pitcheos de 100», «Game Score 70» */
    label: string;
    /** Diámetro en px (56) */
    size?: number;
    /** Grosor del arco (6) */
    thickness?: number;
    /** Color del arco: hex de equipo o un color del tema (acento por defecto) */
    color?: string;
    /** Grados del arco: 360 anillo completo (empieza arriba); 270 medidor abierto abajo */
    sweep?: number;
    /** Lo de adentro (la cifra en Barlow, un logo) */
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

// Arco o medidor circular: pitcheos del lanzador, Game Score, % de victorias en el anillo del logo.
// Se llena al entrar en pantalla (600 ms) y se desliza si cambia el valor.
export const Gauge: React.FC<GaugeProps> = ({ value, max, label, size = 56, thickness = 6, color, sweep = 360, children, style }) => {
    const colors = useColors();
    const { setNode, onLayout, seen: inView } = useInView();
    const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
    const r = (size - thickness) / 2;
    const c = size / 2;
    const arc = Math.min(sweep, 360);
    // Anillo: desde las 12. Medidor abierto: desde abajo a la izquierda, por arriba, hasta abajo a la derecha
    const from = sweep >= 360 ? 0 : 180 + (360 - sweep) / 2;
    const track = arcPath(c, c, r, from, from + arc);
    return (
        <View ref={setNode} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label} style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
            <Svg width={size} height={size} style={{ position: 'absolute', left: 0, top: 0 }}>
                <Path d={track} fill="none" stroke={alpha(colors.line, 0.12)} strokeWidth={thickness} strokeLinecap="round" />
                {share > 0 && (
                    <DrawPath d={track} length={arcLength(r, arc)} share={share} seen={inView} duration={MOTION_MS.count} fill="none" stroke={color ?? colors.accent} strokeWidth={thickness} strokeLinecap="round" />
                )}
            </Svg>
            {children ? <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View> : null}
        </View>
    );
};
