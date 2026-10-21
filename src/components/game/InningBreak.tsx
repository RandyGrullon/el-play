// Pausa entre entradas en la zona de strike (igual que la web, components/game/InningBreak.tsx): tras el tercer out, en
// vez del último turno, una espera animada con el equipo que viene a batear, lo que hizo el que salió y a quién le toca.
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect } from 'react-native-svg';
import type { InningBreak as Pause } from '../../lib/baseball';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { PlayerPhoto, Row, TeamLogo, Txt, useReduceMotion } from '../ui';

const native = Platform.OS !== 'web';

/** Un valor de 0 a 1 que se repite (quieto en 1 con «Reducir movimiento») */
const useLoop = (duration: number, delay = 0, easing: (value: number) => number = Easing.inOut(Easing.ease)) => {
    const reduce = useReduceMotion();
    const [value] = useState(() => new Animated.Value(reduce ? 1 : 0));
    useEffect(() => {
        if (reduce) {
            value.setValue(1);
            return;
        }
        value.setValue(0);
        const loop = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: native })]));
        loop.start();
        return () => loop.stop();
    }, [value, duration, delay, easing, reduce]);
    return { value, reduce };
};

/** La zona vacía que «respira», una franja del color del equipo que la recorre y el logo dentro de un anillo que gira */
const Stage: React.FC<{ pause: Pause; ring: number; logo: number; strokeWidth: number; children?: React.ReactNode }> = ({ pause, ring, logo, strokeWidth, children }) => {
    const colors = useColors();
    const color = pause.next.color;
    const [size, setSize] = useState({ width: 0, height: 0 });
    const breathe = useLoop(2400);
    const scan = useLoop(2600);
    const spin = useLoop(1600, 0, Easing.linear);
    // La zona ocupa la mitad del ancho y del alto (como en el cuadro de la web)
    const zone = { left: size.width * 0.25, top: size.height * 0.16, width: size.width * 0.5, height: size.height * 0.5 };
    const band = zone.height / 3;
    const onLayout = (event: LayoutChangeEvent) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });
    return (
        <View onLayout={onLayout} style={{ width: '100%', aspectRatio: 470 / 605, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
            {size.width > 0 && (
                <>
                    <Animated.View
                        pointerEvents="none"
                        style={{ position: 'absolute', inset: 0, opacity: breathe.reduce ? 0.6 : breathe.value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.8, 0.35] }) }}
                    >
                        <Svg width={size.width} height={size.height}>
                            <Rect x={zone.left} y={zone.top} width={zone.width} height={zone.height} rx={5} fill="none" stroke={colors.muted} strokeWidth={strokeWidth} strokeDasharray={[strokeWidth * 2.6, strokeWidth * 2.3]} />
                        </Svg>
                    </Animated.View>
                    <Svg width={size.width} height={size.height} style={{ position: 'absolute' }} pointerEvents="none">
                        <Path
                            d={`M${size.width * 0.4} ${size.height * 0.83}h${size.width * 0.2}v${size.height * 0.04}l-${size.width * 0.1} ${size.height * 0.05}-${size.width * 0.1}-${size.height * 0.05}z`}
                            fill={alpha(colors.muted, 0.25)}
                        />
                    </Svg>
                    {!scan.reduce && (
                        <View pointerEvents="none" style={{ position: 'absolute', left: zone.left, top: zone.top, width: zone.width, height: zone.height, overflow: 'hidden' }}>
                            <Animated.View style={{ height: band, transform: [{ translateY: scan.value.interpolate({ inputRange: [0, 1], outputRange: [-band, zone.height] }) }] }}>
                                <LinearGradient colors={['transparent', alpha(color, 0.3), 'transparent']} style={{ flex: 1 }} />
                            </Animated.View>
                        </View>
                    )}
                </>
            )}
            <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center', marginTop: -ring * 0.15 }}>
                <View style={{ position: 'absolute', width: ring, height: ring, borderRadius: ring / 2, borderWidth: strokeWidth + 1, borderColor: alpha(color, 0.2) }} />
                <Animated.View
                    style={{
                        position: 'absolute',
                        width: ring,
                        height: ring,
                        borderRadius: ring / 2,
                        borderWidth: strokeWidth + 1,
                        borderColor: 'transparent',
                        borderTopColor: color,
                        borderRightColor: color,
                        transform: [{ rotate: spin.value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }]
                    }}
                />
                <View style={[{ width: logo + 16, height: logo + 16, borderRadius: (logo + 16) / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, shadow('card')]}>
                    <TeamLogo team={pause.next} size={logo} />
                </View>
            </View>
            {children}
        </View>
    );
};

/** Los tres puntos que esperan */
const Dots: React.FC<{ color: string }> = ({ color }) => (
    <Row gap={3}>
        {[0, 180, 360].map((delay) => (
            <Dot key={delay} color={color} delay={delay} />
        ))}
    </Row>
);

const Dot: React.FC<{ color: string; delay: number }> = ({ color, delay }) => {
    const { value, reduce } = useLoop(1200, delay);
    return (
        <Animated.View
            style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: color,
                opacity: reduce ? 0.7 : value.interpolate({ inputRange: [0, 0.4, 0.8, 1], outputRange: [0.25, 1, 0.25, 0.25] }),
                transform: [{ translateY: reduce ? 0 : value.interpolate({ inputRange: [0, 0.4, 0.8, 1], outputRange: [0, -2, 0, 0] }) }]
            }}
        />
    );
};

/** Panel completo: la espera, quién viene a batear, lo que hizo el que salió y a quién le toca */
export const InningBreak: React.FC<{ pause: Pause }> = ({ pause }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { next, ended, runs, dueUp } = pause;
    return (
        <View style={{ padding: 16, gap: 16 }}>
            <View accessible accessibilityRole="image" accessibilityLabel={t('zone.breakAria', { team: next.name })} style={{ width: '100%', maxWidth: 300, alignSelf: 'center' }}>
                <Stage pause={pause} ring={96} logo={52} strokeWidth={2}>
                    <View style={[{ position: 'absolute', bottom: '24%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 4 }, shadow('card')]}>
                        <Txt size={12} weight="bold">
                            {t('zone.breakWaiting')}
                        </Txt>
                        <Dots color={colors.ink} />
                    </View>
                </Stage>
            </View>
            <Row gap={12}>
                <TeamLogo team={next} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt eyebrow>{t('zone.breakNext')}</Txt>
                    <Txt size={18} weight="extrabold" numberOfLines={1}>
                        {next.name}
                    </Txt>
                </View>
            </Row>
            {runs !== null && (
                <Txt size={14} tone="muted">
                    {t('zone.breakRuns', { team: ended.abbrev, count: runs })}
                </Txt>
            )}
            {dueUp.length > 0 && (
                <View style={{ gap: 6 }}>
                    <Txt eyebrow>{t('zone.breakDueUp')}</Txt>
                    {dueUp.map((batter, index) => (
                        <Row key={batter.id} gap={12} style={{ borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 10, paddingVertical: 6 }}>
                            <Txt size={12} weight="extrabold" tone="faint" style={{ width: 14, textAlign: 'center' }}>
                                {index + 1}
                            </Txt>
                            <PlayerPhoto personId={batter.id} name={batter.name} size={32} team={{ id: next.id, logo: next.logo, color: next.color }} />
                            <Txt size={14} weight="semibold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                {batter.name}
                            </Txt>
                        </Row>
                    ))}
                </View>
            )}
        </View>
    );
};

/** La misma espera en el cuadrito de la zona que flota junto a la situación (sin textos: no caben) */
export const InningBreakMini: React.FC<{ pause: Pause }> = ({ pause }) => {
    const colors = useColors();
    return (
        <Stage pause={pause} ring={48} logo={26} strokeWidth={2}>
            <View style={{ position: 'absolute', bottom: '22%' }}>
                <Dots color={alpha(colors.ink, 0.7)} />
            </View>
        </Stage>
    );
};
