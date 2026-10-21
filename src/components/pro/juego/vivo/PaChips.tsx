import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Txt } from '../../../ui';
import { Chip } from '../../kit';

// Chips de los turnos de hoy de un bateador: «BB», «1B», «6-3», «K». Hits en verde, bases por bolas en acento.

interface PaChipsProps {
    pas: { i: number; code: string | null; tone: 'hit' | 'walk' | 'out' }[];
    style?: StyleProp<ViewStyle>;
}

export const PaChips: React.FC<PaChipsProps> = ({ pas, style }) => {
    const { t } = useTranslation();
    if (!pas.length)
        return (
            <View style={style}>
                <Txt size={12} tone="muted">
                    {t('pro.vivo.firstPa')}
                </Txt>
            </View>
        );
    const codes = pas.map((pa) => pa.code ?? t('pro.vivo.outShort'));
    return (
        <View accessible accessibilityLabel={t('pro.vivo.pasAria', { list: codes.join(', ') })} style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, style]}>
            {pas.map((pa, index) => (
                <Chip key={pa.i} tone={pa.tone === 'hit' ? 'up' : pa.tone === 'walk' ? 'accent' : 'neutral'} style={{ height: 22, paddingHorizontal: 8 }}>
                    {codes[index]}
                </Chip>
            ))}
        </View>
    );
};
