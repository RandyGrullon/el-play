import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react-native';
import { Txt } from '../ui';

/**
 * Etiqueta «Repetición» de una jugada repetida desde el historial, para que nadie crea que está pasando ahora (la misma
 * píldora oscura de la web). Va encima de la animación, centrada en una franja de ancho completo; no se toca.
 */
export const ReplayTag: React.FC<{ style?: StyleProp<ViewStyle>; align?: 'center' | 'flex-start' }> = ({ style, align = 'center' }) => {
    const { t } = useTranslation();
    return (
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[{ position: 'absolute', left: 0, right: 0, zIndex: 2, alignItems: align }, style]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.62)', paddingHorizontal: 12, paddingVertical: 4 }}>
                <RotateCcw size={12} color="#fff" />
                <Txt size={11} weight="extrabold" color="#fff" numberOfLines={1} style={{ letterSpacing: 1.5, textTransform: 'uppercase' }}>
                    {t('anim.replay')}
                </Txt>
            </View>
        </View>
    );
};
