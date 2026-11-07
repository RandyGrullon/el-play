// Cómo se llega a «Cómo se juega» (igual que la web): el botón «¿Cómo se juega?» del encabezado y de la portada, y los
// «?» chiquitos junto a Créditos, Capitán, Pronósticos y Tabla, que abren la ayuda en su pregunta. La ayuda es su propia
// pantalla (src/app/fantasy/ayuda.tsx), en el Lite y en PRO.
import React, { useCallback } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BookOpen, CircleHelp } from 'lucide-react-native';
import { HELP_TOPICS, type HelpQuestion, type HelpTopic } from '../../lib/fantasyHelp';
import { useColors } from '../../theme/theme';
import { radius, shadow } from '../../theme/tokens';
import { Txt } from '../ui';

/** Abre la ayuda (en una pregunta si se pasa) con las reglas del día que se está viendo (`date`: sin él, hoy) */
export const useOpenHelp = (date?: string) => {
    const router = useRouter();
    return useCallback(
        (question?: HelpQuestion) => router.push({ pathname: '/fantasy/ayuda', params: { ...(question ? { q: question } : {}), ...(date ? { dia: date } : {}) } }),
        [router, date]
    );
};

/** «?» junto a Créditos, Capitán, Pronósticos o Tabla: abre la ayuda en su pregunta */
export const HelpButton: React.FC<{ topic: HelpTopic; date?: string; color?: string; style?: StyleProp<ViewStyle> }> = ({ topic, date, color, style }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const open = useOpenHelp(date);
    return (
        <Pressable
            onPress={() => open(HELP_TOPICS[topic])}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('fantasyHelp.about', { topic: t(`fantasyHelp.topic.${topic}`) })}
            style={({ pressed }) => [{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 }, style]}
        >
            <CircleHelp size={18} color={color ?? colors.muted} />
        </Pressable>
    );
};

/** «¿Cómo se juega?»: el botón del encabezado del Fantasy y de la portada */
export const HowToPlayButton: React.FC<{ date?: string; compact?: boolean; tone?: 'surface' | 'onGradient'; style?: StyleProp<ViewStyle> }> = ({ date, compact, tone = 'surface', style }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const open = useOpenHelp(date);
    const onGradient = tone === 'onGradient';
    const ink = onGradient ? '#fff' : colors.ink;
    return (
        <Pressable
            onPress={() => open()}
            accessibilityRole="button"
            accessibilityLabel={t('fantasyHelp.open')}
            style={({ pressed }) => [
                { height: compact ? 44 : 48, minWidth: compact ? 44 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: compact ? 0 : 14, borderRadius: compact ? 22 : radius.tile, backgroundColor: onGradient ? 'rgba(255,255,255,0.2)' : colors.surface, opacity: pressed ? 0.8 : 1 },
                !onGradient && shadow('card'),
                style
            ]}
        >
            <BookOpen size={20} color={ink} />
            {!compact && (
                <Txt size={14} weight="bold" color={ink} numberOfLines={1}>
                    {t('fantasyHelp.open')}
                </Txt>
            )}
        </Pressable>
    );
};
