import React, { useEffect } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BellRing, CircleCheck } from 'lucide-react-native';
import type { GameDetail } from '../../../types';
import { toggleFollow, useFollow } from '../../../lib/follow';
import { MOTION_EASE, MOTION_MS, useMotion } from '../../../lib/motion';
import { showToast } from '../../../lib/toast';
import { useColors } from '../../../theme/theme';
import { alpha, radius } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { ProNote } from '../kit';
import { FollowSettings } from './FollowSettings';

// En vivo, en la pantalla del juego PRO (va en la prop `follow` de ProGame): el botón «Seguir en segundo plano»
// y debajo la tarjeta de alertas y de «Seguir en la pantalla de bloqueo». En la web y en Expo Go no hay segundo
// plano: sale una nota honesta en vez del botón.
export const ProFollow: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const motion = useMotion();
    const { supported, following, busy } = useFollow(game.gamePk);
    const ios = Platform.OS === 'ios';
    const green = colors.ball;
    // El ícono entra (crece y aparece) al cambiar de estado
    const pop = useSharedValue(1);
    useEffect(() => {
        if (!motion.animate) {
            pop.set(1);
            return;
        }
        pop.set(0);
        pop.set(withTiming(1, { duration: MOTION_MS.flip, easing: MOTION_EASE }));
        return () => cancelAnimation(pop);
    }, [following, motion.animate, pop]);
    const iconStyle = useAnimatedStyle(() => ({ opacity: 0.3 + pop.get() * 0.7, transform: [{ scale: 0.6 + pop.get() * 0.4 }] }));

    if (!supported) {
        return (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <ProNote tone="neutral" title={t('pro.segundo-plano.unsupportedTitle')}>
                    {t('pro.segundo-plano.unsupported')}
                </ProNote>
            </View>
        );
    }

    const onPress = async () => {
        const result = await toggleFollow(game);
        if (result === 'on') showToast(t('pro.segundo-plano.on'), undefined, 3500);
        else if (result === 'blocked') showToast(t(ios ? 'pro.segundo-plano.blockedIos' : 'pro.segundo-plano.blockedAndroid'), { label: t('pro.segundo-plano.settings'), run: () => Linking.openSettings().catch(() => undefined) }, 9000);
        else if (result === 'error') showToast(t('pro.segundo-plano.error'), undefined, 4000);
    };
    const hint = following ? t(ios ? 'pro.segundo-plano.followingIos' : 'pro.segundo-plano.followingAndroid') : t(ios ? 'pro.segundo-plano.hintIos' : 'pro.segundo-plano.hintAndroid');

    return (
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 8 }}>
            <Pressable
                onPress={onPress}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={following ? t('pro.segundo-plano.followingA11y') : t('pro.segundo-plano.follow')}
                accessibilityState={{ busy, selected: following }}
                style={({ pressed }) => ({
                    height: 54,
                    borderRadius: radius.pill,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    paddingHorizontal: 16,
                    backgroundColor: following ? colors.surface : colors.accent,
                    borderWidth: following ? 1 : 0,
                    borderColor: alpha(green, 0.55),
                    opacity: pressed || busy ? 0.75 : 1
                })}
            >
                <Animated.View style={iconStyle}>{following ? <CircleCheck size={20} color={green} /> : <BellRing size={20} color="#fff" />}</Animated.View>
                <Txt size={16} weight="extrabold" color={following ? colors.ink : '#fff'} numberOfLines={1} style={{ letterSpacing: -0.2, flexShrink: 1 }}>
                    {following ? t('pro.segundo-plano.following') : t('pro.segundo-plano.follow')}
                </Txt>
            </Pressable>
            <Txt size={12} tone="muted" center style={{ lineHeight: 17, paddingHorizontal: 8 }}>
                {hint}
            </Txt>
            <FollowSettings game={game} style={{ marginTop: 8 }} />
        </View>
    );
};
