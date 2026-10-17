import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useColors } from '../../theme/theme';
import { alpha } from '../../theme/tokens';

interface BasesProps {
    runners: { first: unknown; second: unknown; third: unknown };
    size?: number;
    color?: string;
}

// Diamante con las tres bases; las ocupadas van en el color del equipo al bate
export const Bases: React.FC<BasesProps> = ({ runners, size = 28, color }) => {
    const colors = useColors();
    const fill = color ?? colors.accent;
    const base = (x: number, y: number, on: boolean, key: string) => (
        <Rect
            key={key}
            x={x - 5}
            y={y - 5}
            width={10}
            height={10}
            rx={1.5}
            transform={`rotate(45 ${x} ${y})`}
            fill={on ? fill : 'transparent'}
            stroke={on ? fill : colors.faint}
            strokeWidth={1.6}
        />
    );
    return (
        <View aria-hidden>
            <Svg width={size} height={size * 0.8} viewBox="0 0 40 32">
                {base(20, 7, !!runners.second, 'second')}
                {base(32, 19, !!runners.first, 'first')}
                {base(8, 19, !!runners.third, 'third')}
            </Svg>
        </View>
    );
};

export const OutsDots: React.FC<{ outs: number; style?: StyleProp<ViewStyle>; size?: number }> = ({ outs, style, size = 6 }) => {
    const colors = useColors();
    return (
        <View style={[{ flexDirection: 'row', gap: 4 }, style]} accessibilityLabel={`${outs} outs`}>
            {[0, 1, 2].map((index) => (
                <View key={index} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: index < outs ? colors.ink : alpha(colors.ink, 0.2) }} />
            ))}
        </View>
    );
};
