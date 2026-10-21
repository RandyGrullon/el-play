// Enfrentamientos directos: récord de la fila contra la columna; si no se han visto, el día del próximo duelo.
// Logos en los ejes, celdas de 44 px que aparecen en cascada en diagonal al entrar en pantalla.
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useColors, useTheme } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { MOTION_EASE, MOTION_MS, useElementWidth, useInView, useMotion, useProColors } from '../kit';
import { shortDay } from './data';
import type { HeadToHeadCell } from './logic';
import type { RaceTeam } from './RaceChart';

interface HeadToHeadProps {
    teams: RaceTeam[];
    matrix: (HeadToHeadCell | null)[][];
}

const GAP = 4;

// Celda que aparece (escala de 0.9 a 1 y opacidad) con retraso según su diagonal
const Pop: React.FC<{ seen: boolean; index: number; style: object; children?: React.ReactNode; label: string }> = ({ seen, index, style, children, label }) => {
    const motion = useMotion();
    const shown = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            shown.set(1);
            return;
        }
        if (!seen) return;
        shown.set(withDelay(motion.delay(index, 30), withTiming(1, { duration: MOTION_MS.flip, easing: MOTION_EASE })));
        return () => cancelAnimation(shown);
    }, [seen, motion, index, shown]);
    const pop = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: 0.9 + 0.1 * shown.get() }] }));
    return (
        <Animated.View accessible accessibilityLabel={label} style={[style, pop]}>
            {children}
        </Animated.View>
    );
};

// Rayado de la diagonal (el mismo equipo): rayitas en diagonal
const Hatch: React.FC<{ size: number }> = ({ size }) => {
    const colors = useColors();
    return (
        <View style={{ ...{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, overflow: 'hidden', borderRadius: 8 }}>
            {Array.from({ length: 8 }, (_, index) => (
                <View
                    key={index}
                    style={{ position: 'absolute', width: 4, height: size * 2, left: -size * 0.5 + index * 9, top: -size * 0.5, backgroundColor: alpha(colors.line, 0.1), transform: [{ rotate: '45deg' }] }}
                />
            ))}
        </View>
    );
};

export const HeadToHead: React.FC<HeadToHeadProps> = ({ teams, matrix }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const { isDark } = useTheme();
    const pro = useProColors();
    // Ganó / perdió con color fuerte y texto blanco (como el diseño): en oscuro el tono al 55 %, en claro entero
    // (el verde y el rojo del claro pasan 4.5:1 con blanco)
    const strong = (color: string) => (isDark ? alpha(color, 0.55) : color);
    const { setNode, onLayout: look, seen } = useInView();
    const { width, onLayout: measure } = useElementWidth(320);
    const narrow = width < 280;
    const axis = narrow ? 26 : 32;
    const cell = Math.max(32, (width - axis - GAP * teams.length) / teams.length);
    const day = (key: string) => shortDay(key, i18n.language);

    return (
        <View
            ref={setNode}
            onLayout={(event) => {
                measure(event);
                look();
            }}
            accessibilityLabel={t('pro.posiciones.h2h.caption')}
            style={{ gap: GAP }}
        >
            <View style={{ flexDirection: 'row', gap: GAP }}>
                <View style={{ width: axis }} />
                {teams.map((team) => (
                    <View key={team.id} accessible accessibilityLabel={team.name} style={{ width: cell, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                        <TeamLogo team={team} size={22} />
                    </View>
                ))}
            </View>
            {teams.map((team, row) => (
                <View key={team.id} style={{ flexDirection: 'row', gap: GAP, alignItems: 'center' }}>
                    <View accessible accessibilityLabel={team.name} style={{ width: axis, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                        <TeamLogo team={team} size={22} />
                    </View>
                    {teams.map((rival, column) => {
                        const value = matrix[row]?.[column] ?? null;
                        const box = { width: cell, height: 44, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 2 };
                        if (!value) {
                            return (
                                <Pop key={rival.id} seen={seen} index={row + column} style={box} label={t('pro.posiciones.h2h.self')}>
                                    <Hatch size={cell} />
                                </Pop>
                            );
                        }
                        const decided = value.played > 0 && value.wins !== value.losses;
                        const background = !decided ? colors.raised : value.wins > value.losses ? strong(pro.up) : strong(pro.down);
                        const ink = decided ? '#ffffff' : colors.ink;
                        const label =
                            value.played > 0
                                ? t('pro.posiciones.h2h.cellPlayed', { team: team.name, rival: rival.name, record: `${value.wins}-${value.losses}`, next: value.next ? t('pro.posiciones.h2h.nextAria', { day: day(value.next) }) : '' })
                                : value.next
                                  ? t('pro.posiciones.h2h.cellPending', { team: team.name, rival: rival.name, day: day(value.next) })
                                  : t('pro.posiciones.h2h.cellNone', { team: team.name, rival: rival.name });
                        return (
                            <Pop key={rival.id} seen={seen} index={row + column} style={{ ...box, backgroundColor: background }} label={label}>
                                {value.played > 0 ? (
                                    <>
                                        <Txt condensed size={narrow ? 15 : 17} tabular color={ink} style={{ lineHeight: narrow ? 16 : 18 }}>
                                            {`${value.wins}-${value.losses}`}
                                        </Txt>
                                        {value.next ? (
                                            <Txt size={narrow ? 8 : 9.5} weight="bold" color={alpha(ink, 0.9)} numberOfLines={1}>
                                                {day(value.next)}
                                            </Txt>
                                        ) : null}
                                    </>
                                ) : (
                                    <Txt size={narrow ? 9 : 10} weight="bold" color={alpha(colors.ink, 0.8)} center numberOfLines={2} style={{ lineHeight: narrow ? 11 : 12 }}>
                                        {value.next ? day(value.next) : '—'}
                                    </Txt>
                                )}
                            </Pop>
                        );
                    })}
                </View>
            ))}
        </View>
    );
};
