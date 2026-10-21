import React, { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import { inningName } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { alpha, radius, shadow } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { Bases } from '../../../game/Bases';
import { MOTION_EASE, MOTION_MS, Odometer, PlusOne, UpdatedAgo, teamInk, useChanged, useMotion } from '../../kit';
import { CountDots, isBetween } from './parts';
import { useProScroll } from './scroll';

// Barra de mando del juego en vivo PRO: al bajar, la cabecera se va y esto queda fijo arriba (las dos franjas de
// color con el marcador tipo odómetro y el «+1» al anotar, el mini diamante, la entrada, el conteo y los puntos de
// bolas, strikes y outs, y «hace 3 s»). Repite lo que dice la cabecera: es solo visual (oculta para el lector).
// También el destello de la mitad de la cabecera que anota (HeroPulse).

const BAR_H = 56;

/** Alto que ocupa la barra arriba (para pegar las pestañas debajo) */
export const scoreBarBottom = (insetTop: number) => insetTop + 8 + BAR_H + 6;

const ScoreSide: React.FC<{ team: GameDetail['away']; align: 'start' | 'end' }> = ({ team, align }) => {
    const scored = useChanged(team.runs);
    const ink = teamInk(team.color);
    const end = align === 'end';
    return (
        <View style={{ height: '100%', flexDirection: end ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, backgroundColor: team.color }}>
            <View style={{ borderRadius: 999, backgroundColor: '#fff', padding: 2 }}>
                <TeamLogo team={team} size={18} />
            </View>
            <Odometer value={team.runs} size={26} color={ink} />
            <PlusOne trigger={scored} style={end ? { left: 4, top: 2 } : { right: 4, top: 2 }}>
                <Txt size={12} weight="extrabold" color={ink}>
                    +1
                </Txt>
            </PlusOne>
        </View>
    );
};

export const ProScoreBar: React.FC<{ game: GameDetail; fetchedAt?: number }> = ({ game, fetchedAt }) => {
    const { i18n } = useTranslation();
    const colors = useColors();
    const motion = useMotion();
    const insets = useSafeAreaInsets();
    const width = useWindowDimensions().width;
    const scroll = useProScroll();
    const shown = useSharedValue(0);
    const animate = motion.animate;

    // Aparece cuando el principio del contenido PRO (justo bajo la cabecera) se fue por arriba
    useAnimatedReaction(
        () => (scroll ? scroll.y.get() > scroll.top.get() - insets.top - 8 : false),
        (passed, before) => {
            if (passed === before) return;
            shown.set(animate ? withTiming(passed ? 1 : 0, { duration: MOTION_MS.tab, easing: MOTION_EASE }) : passed ? 1 : 0);
        },
        [scroll, animate, insets.top]
    );
    const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * -(BAR_H + insets.top + 16) }] }));

    const batting = game.inning?.isTop ? game.away : game.home;
    const between = isBetween(game);
    return (
        <Animated.View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 30, paddingTop: insets.top + 8, paddingHorizontal: 12 }, style]}
        >
            <View style={[{ height: BAR_H, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderRadius: radius.tile, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.1) }, shadow('float')]}>
                <ScoreSide team={game.away} align="start" />
                <ScoreSide team={game.home} align="end" />
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 6 }}>
                    <Bases runners={between ? { first: false, second: false, third: false } : { first: !!game.runners.first, second: !!game.runners.second, third: !!game.runners.third }} size={28} color={batting.color} />
                    <View style={{ alignItems: 'center' }}>
                        <Txt size={12} weight="extrabold" numberOfLines={1}>
                            {game.inning ? inningName(game.inning, i18n.language, true) : ''}
                        </Txt>
                        <Txt condensed size={16} tabular style={{ lineHeight: 18 }}>
                            {between ? '—' : `${game.count.balls}-${game.count.strikes}`}
                        </Txt>
                    </View>
                    {!between && width >= 350 && <CountDots balls={game.count.balls} strikes={game.count.strikes} outs={game.count.outs} size={7} style={{ gap: 2 }} />}
                </View>
                {width >= 380 && (
                    <View style={{ paddingRight: 10 }}>
                        <UpdatedAgo at={fetchedAt || game.updatedAt} variant="short" />
                    </View>
                )}
            </View>
        </Animated.View>
    );
};

// ---------------------------------------------------------------- Destello de la cabecera al anotar

const HalfPulse: React.FC<{ team: GameDetail['away']; align: 'start' | 'end' }> = ({ team, align }) => {
    const motion = useMotion();
    const scored = useChanged(team.runs);
    const glow = useSharedValue(0);
    useEffect(() => {
        if (scored === 0 || !motion.animate) return;
        glow.set(withSequence(withTiming(0.35, { duration: MOTION_MS.fade }), withTiming(0, { duration: 750, easing: MOTION_EASE })));
        return () => cancelAnimation(glow);
    }, [scored, motion.animate, glow]);
    const flash = useAnimatedStyle(() => ({ opacity: glow.get() }));
    // El marcador de la cabecera mide unos 44 px por dígito a 76 px: el «+1» va justo después, arriba
    const offset = 16 + String(team.runs).length * 44 + 4;
    const bottom = 28 + (team.record ? 19 : 0) + 46;
    return (
        <View style={{ flex: 1 }}>
            <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff' }, flash]} />
            <PlusOne trigger={scored} style={align === 'end' ? { right: offset, bottom } : { left: offset, bottom }}>
                <Txt size={24} weight="extrabold" color={teamInk(team.color)}>
                    +1
                </Txt>
            </PlusOne>
        </View>
    );
};

/** Capa encima de la cabecera (GameHero) que destella la mitad del equipo que anota y salta el «+1». Solo visual. */
export const HeroPulse: React.FC<{ game: GameDetail }> = ({ game }) => (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', overflow: 'hidden' }}>
        <HalfPulse team={game.away} align="start" />
        <HalfPulse team={game.home} align="end" />
    </View>
);
