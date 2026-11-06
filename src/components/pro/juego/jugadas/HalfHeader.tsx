import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { HalfInning, NameBook } from './model';
import { nameForms } from '../../../../lib/links';
import { shadow } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { MOTION_EASE, MOTION_MS, useMotion } from '../../kit';
import { HalfSwing } from './PlayRow';
import { Turn, fmtSwing, usePlayColors } from './parts';
import { halfAria, halfSummary, halfTitle, halfVs } from './texts';
import { LinkedNames, LinkedTeams } from '../../../stats/common';

type Game = Pick<GameDetail, 'away' | 'home' | 'state'>;

interface HalfHeaderProps {
    half: HalfInning;
    game: Game;
    names: NameBook;
    open: boolean;
    onToggle: () => void;
    /** Ya está pegado arriba (la lista pasa por debajo): gana sombra */
    stuck?: boolean;
}

// Encabezado de una media entrada: «▲ 5.ª · LIC 2 C, 3 H» con los lanzadores (abierta) o el resumen (cerrada), el
// cambio de probabilidad de toda la mitad y la flecha. En la hoja va pegajoso y gana sombra al pegarse (200 ms).
export const HalfHeader: React.FC<HalfHeaderProps> = ({ half, game, names, open, onToggle, stuck = false }) => {
    const { t, i18n } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const motion = useMotion();
    const team = game[half.side];
    const lift = useSharedValue(stuck ? 1 : 0);
    useEffect(() => {
        lift.set(motion.animate ? withTiming(stuck ? 1 : 0, { duration: MOTION_MS.tab, easing: MOTION_EASE }) : stuck ? 1 : 0);
    }, [stuck, motion.animate, lift]);
    const shade = useAnimatedStyle(() => ({ opacity: lift.get() }));
    const sub = open || half.current ? halfVs(t, half, names) : halfSummary(t, half, names, i18n.language);
    // Las siglas del título van a la página del equipo y los lanzadores del resumen, a su ficha
    const pitchers = [...half.pitchers, ...half.plays.flatMap((item) => item.events.filter((event) => event.kind === 'pitching_change').map((event) => event.player))];
    const people = nameForms(
        pitchers.flatMap((id) => (id ? [{ id, name: names.full(id) || names.label(id) }] : [])),
        (person) => [names.label(person.id)]
    );
    const swing = half.swing ? `${half.swing.side ? `${game[half.swing.side].abbrev} ` : ''}${fmtSwing(half.swing.value, i18n.language)}` : null;

    return (
        // El fondo de la hoja tapa las filas que pasan por debajo cuando el encabezado está pegado
        <View style={{ backgroundColor: colors.bg, paddingTop: 10, paddingBottom: 6 }}>
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 10, bottom: 6, borderRadius: 16, backgroundColor: colors.raised }, shadow('float'), shade]} />
            <Pressable
                onPress={onToggle}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={[halfAria(t, half, game, i18n.language), half.current ? t('pro.jugadas.half.now') : null, sub, swing].filter(Boolean).join('. ')}
                style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: colors.raised, paddingVertical: 8, paddingLeft: 14, paddingRight: 10 }}
            >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt size={13.5} weight="extrabold" numberOfLines={1}>
                        <Txt size={13.5} color={paint.team(team.color)}>
                            {half.top ? '▲' : '▼'}{' '}
                        </Txt>
                        <LinkedTeams text={halfTitle(t, half, game, i18n.language)} teams={[team]} />
                        {half.current ? (
                            <Txt size={11} weight="bold" color={paint.pro.live}>
                                {'  '}
                                {t('pro.jugadas.half.now')}
                            </Txt>
                        ) : null}
                    </Txt>
                    <Txt size={12} tone="muted" style={{ lineHeight: 16 }}>
                        <LinkedNames text={sub} people={people} />
                    </Txt>
                </View>
                <HalfSwing swing={half.swing} game={game} />
                <Turn open={open} />
            </Pressable>
        </View>
    );
};

