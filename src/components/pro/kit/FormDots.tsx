import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { Enter } from './Enter';
import { toneColors, useProColors } from './theme';

export type GameResult = 'W' | 'L';

interface FormDotsProps {
    /** Resultados del más reciente al más viejo */
    results: GameResult[];
    /** Casillas en total (10): las que faltan salen punteadas, «por jugar» */
    slots?: number;
    /** dots: puntos; letters: casillas con G/P (W/L en inglés) */
    variant?: 'dots' | 'letters';
    /** Texto para el lector de pantalla (si no: «Últimos 10: 1 ganados y 0 perdidos») */
    label?: string;
    style?: StyleProp<ViewStyle>;
}

// Puntos de los últimos 10 (G/P): verde ganado, rojo perdido, punteado lo que falta por jugar. Entran en cascada.
export const FormDots: React.FC<FormDotsProps> = ({ results, slots = 10, variant = 'dots', label, style }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const shown = results.slice(0, slots);
    const wins = shown.filter((result) => result === 'W').length;
    const aria = label ?? t('pro.kit.form.aria', { count: slots, wins, losses: shown.length - wins });
    const empty = Math.max(0, slots - shown.length);
    const letters = variant === 'letters';
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={aria} style={[{ flexDirection: 'row', alignItems: 'center', gap: letters ? 4 : 3 }, style]}>
            {shown.map((result, index) => {
                const win = result === 'W';
                const tone = toneColors(win ? 'up' : 'down', colors, pro);
                return (
                    <Enter key={index} index={index} step={30}>
                        {letters ? (
                            <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
                                <Txt size={10} weight="extrabold" color={tone.ink}>
                                    {win ? t('pro.kit.form.win') : t('pro.kit.form.loss')}
                                </Txt>
                            </View>
                        ) : (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: win ? colors.ball : colors.strike }} />
                        )}
                    </Enter>
                );
            })}
            {Array.from({ length: empty }, (_, index) => (
                <View
                    key={`e${index}`}
                    style={letters ? { width: 18, height: 18, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.25) } : { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.3) }}
                />
            ))}
        </View>
    );
};
