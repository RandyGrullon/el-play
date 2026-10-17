import React, { useId } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

// Marca de El Play (igual que la web): un home plate con los colores de la bandera dominicana y una pelota con sus costuras
const PLATE_PATH = 'M14 5h36a6 6 0 0 1 6 6v21.6a6 6 0 0 1-1.76 4.24L36.24 54.84a6 6 0 0 1-8.48 0L9.76 36.84A6 6 0 0 1 8 32.6V11a6 6 0 0 1 6-6z';
const SEAM_LEFT = 'M23.4 17.4c3.1 2.6 4.8 5.8 4.8 9.3s-1.7 6.7-4.8 9.3';
const SEAM_RIGHT = 'M40.6 17.4c-3.1 2.6-4.8 5.8-4.8 9.3s1.7 6.7 4.8 9.3';

export const LogoMark: React.FC<{ size?: number }> = ({ size = 28 }) => {
    const id = useId().replace(/[^a-zA-Z0-9]/g, '');
    return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
            <Defs>
                <LinearGradient id={`plate${id}`} x1="8" y1="5" x2="56" y2="57" gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#1e4fd8" />
                    <Stop offset="0.55" stopColor="#1e3a8a" />
                    <Stop offset="1" stopColor="#d61f3a" />
                </LinearGradient>
            </Defs>
            <Path d={PLATE_PATH} fill={`url(#plate${id})`} />
            <Path d={PLATE_PATH} fill="none" stroke="#fff" strokeOpacity={0.18} strokeWidth={1.2} />
            <Circle cx={32} cy={26.7} r={13} fill="#fff" />
            <Circle cx={32} cy={26.7} r={13} fill="none" stroke="#0b1220" strokeOpacity={0.12} strokeWidth={1} />
            {[SEAM_LEFT, SEAM_RIGHT].map((d) => (
                <G key={d} fill="none" stroke="#e11d2e" strokeLinecap="round">
                    <Path d={d} strokeWidth={1.3} />
                    <Path d={d} strokeWidth={1.7} strokeDasharray="0.01 2.3" transform={`translate(${d === SEAM_LEFT ? -1.1 : 1.1} 0)`} />
                </G>
            ))}
        </Svg>
    );
};
