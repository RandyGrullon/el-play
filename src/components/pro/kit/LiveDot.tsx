import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useMotion } from '../../../lib/motion';
import { useColors } from '../../../theme/theme';
import { Txt } from '../../ui';
import { agoParts, toTime } from './format';
import { useNow } from './hooks';
import { useProColors } from './theme';

export type LiveTone = 'live' | 'ok' | 'warn' | 'muted';

interface LiveDotProps {
    tone?: LiveTone;
    /** Diámetro en px (8) */
    size?: number;
    /** Late con una onda (solo si se anima) */
    pulse?: boolean;
    /** Color propio (por ejemplo el de un equipo) en vez del tono */
    color?: string;
    /** false: solo la onda, sin el punto (para un punto que ya está dibujado debajo) */
    core?: boolean;
    style?: StyleProp<ViewStyle>;
}

const useDotColor = (tone: LiveTone) => {
    const colors = useColors();
    const pro = useProColors();
    return { live: colors.live, ok: colors.ball, warn: pro.warn, muted: colors.faint }[tone];
};

// Punto «en vivo» que late (una onda que crece y se apaga, 1,6 s). Es decorativo: va siempre junto a un texto que
// diga lo mismo. Con reducir movimiento o animaciones apagadas queda quieto.
export const LiveDot: React.FC<LiveDotProps> = ({ tone = 'live', size = 8, pulse = true, color, core = true, style }) => {
    const motion = useMotion();
    const fill = useDotColor(tone);
    const dot = color ?? fill;
    const wave = useSharedValue(0);
    const beating = pulse && motion.animate;
    useEffect(() => {
        if (!beating) {
            wave.set(0);
            return;
        }
        wave.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.cubic) }), -1, false));
        return () => cancelAnimation(wave);
    }, [beating, wave]);
    const ring = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - wave.get()), transform: [{ scale: 1 + wave.get() * 1.6 }] }));
    return (
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[{ width: size, height: size }, style]}>
            {beating && <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: dot }, ring]} />}
            {core && <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dot }} />}
        </View>
    );
};

interface UpdatedAgoProps {
    /** Hora de la última lectura: ms (dataUpdatedAt de react-query), ISO o el timecode de MLB (GameDetail.updatedAt) */
    at: string | number | Date | null | undefined;
    /** Pasado este tiempo (s) el punto se vuelve ámbar */
    staleAfter?: number;
    /** «full»: «Actualizado hace 7 s»; «short»: «hace 7 s» */
    variant?: 'full' | 'short';
    style?: StyleProp<ViewStyle>;
}

// «Actualizado hace 7 s» con el punto verde que late; ámbar si la lectura tiene más de un minuto.
export const UpdatedAgo: React.FC<UpdatedAgoProps> = ({ at, staleAfter = 60, variant = 'full', style }) => {
    const { t } = useTranslation();
    const now = useNow(1000);
    const time = toTime(at);
    if (!Number.isFinite(time)) return null;
    const elapsed = Math.max(0, now - time);
    const stale = elapsed > staleAfter * 1000;
    const { count, unit } = agoParts(elapsed);
    const ago = t(`pro.kit.time.${unit}`, { count });
    return (
        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}>
            <LiveDot tone={stale ? 'warn' : 'ok'} size={6} pulse={!stale} />
            <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                {variant === 'short' ? t('pro.kit.updated.short', { time: ago }) : t('pro.kit.updated.full', { time: ago })}
            </Txt>
        </View>
    );
};
