import React, { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Gauge } from 'lucide-react-native';
import type { AtBat, GameDetail, Pitch, PitchResult } from '../../../../types';
import type { Swing } from './model';
import { eventName, eventTone, pitchCallName, pitchTypeName, type EventTone } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { PRO_GRADIENT, alpha, radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { MOTION_EASE, MOTION_MS, MOTION_STAGGER, luminance, mix, teamInk, useMotion, useProColors } from '../../kit';

// Piezas comunes de la jugada a jugada PRO (igual que la web): píldora del cambio de probabilidad, chip del evento,
// presión, marcador con los colores de los equipos, outs, burbujas de pitcheo, el plegado con altura animada,
// la flecha que gira y la entrada escalonada de las filas.

type Teams = Pick<GameDetail, 'away' | 'home'>;

/** «+9.8 %» (español) o «+9.8%» (inglés) */
export const fmtSwing = (value: number, lang: string) => `${value === 0 ? '±0' : `+${value.toFixed(1)}`}${lang.startsWith('en') ? '%' : ' %'}`;

/**
 * Colores de la jugada a jugada con el tema activo:
 * - team(hex): el color del equipo mezclado con la tinta del tema (más tinta en los claros como AGU): 4.5:1 en los dos temas.
 * - tone(color): un tono (verde, ámbar, acento…) un poco más cerca de la tinta, para chips chicos con su fondo al 15 %.
 * - event(tone): fondo y tinta del chip del resultado (el error va en ámbar como «otro»).
 * - pitch(r, last): fondo y tinta de la burbuja de un pitcheo; el último va sólido.
 */
export const usePlayColors = () => {
    const colors = useColors();
    const pro = useProColors();
    const team = (hex: string) => mix(hex, colors.ink, luminance(hex) > 0.45 ? 0.55 : 0.45);
    const tone = (color: string) => mix(color, colors.ink, 0.2);
    const EVENT: Record<EventTone, { bg: string; ink: string }> = {
        hr: { bg: alpha(colors.gold, 0.15), ink: tone(pro.warn) },
        hit: { bg: alpha(colors.inplay, 0.15), ink: tone(colors.accentInk) },
        walk: { bg: alpha(colors.ball, 0.15), ink: tone(pro.up) },
        k: { bg: alpha(colors.strike, 0.15), ink: tone(pro.down) },
        out: { bg: alpha(colors.ink, 0.08), ink: alpha(colors.ink, 0.8) },
        other: { bg: alpha(pro.warn, 0.15), ink: tone(pro.warn) }
    };
    const BUBBLE: Record<PitchResult, { bg: string; ink: string }> = {
        ball: { bg: alpha(colors.ball, 0.15), ink: tone(pro.up) },
        strike: { bg: alpha(colors.strike, 0.15), ink: tone(pro.down) },
        inplay: { bg: alpha(colors.inplay, 0.15), ink: tone(colors.accentInk) },
        hbp: { bg: alpha(colors.hbp, 0.15), ink: tone(pro.warn) }
    };
    // Sólido: tinta oscura sobre los colores claros (bola, golpeado); sobre el rojo y el azul, el fondo de la tarjeta
    const SOLID: Record<PitchResult, { bg: string; ink: string }> = {
        ball: { bg: colors.ball, ink: '#14151a' },
        strike: { bg: colors.strike, ink: colors.surface },
        inplay: { bg: colors.inplay, ink: colors.surface },
        hbp: { bg: colors.hbp, ink: '#14151a' }
    };
    return {
        colors,
        pro,
        team,
        tone,
        event: (value: EventTone) => EVENT[value],
        live: { bg: alpha(colors.live, 0.15), ink: pro.live },
        pitch: (r: PitchResult, last: boolean) => (last ? SOLID[r] : BUBBLE[r])
    };
};

/** Lo que oye el lector del cambio de probabilidad */
export const useSwingLabel = () => {
    const { t, i18n } = useTranslation();
    return (swing: Swing | null, game: Teams) => {
        if (!swing) return null;
        const team = swing.side ? game[swing.side] : null;
        return team ? t('pro.jugadas.wpa.aria', { team: team.abbrev, value: fmtSwing(swing.value, i18n.language) }) : t('pro.jugadas.wpa.even');
    };
};

// Cambio en la probabilidad de ganar: sigla del equipo al que favoreció y los puntos («LIC +9.8 %»)
export const WpaPill: React.FC<{ swing: Swing | null; game: Teams; strong?: boolean; label?: boolean; style?: StyleProp<ViewStyle> }> = ({ swing, game, strong = false, label = false, style }) => {
    const { i18n } = useTranslation();
    const paint = usePlayColors();
    const swingLabel = useSwingLabel();
    if (!swing) return null;
    const team = swing.side ? game[swing.side] : null;
    const solid = strong && !!team;
    const ink = team ? (solid ? teamInk(team.color) : paint.team(team.color)) : paint.colors.muted;
    return (
        <View
            accessible={label}
            accessibilityRole={label ? 'image' : undefined}
            accessibilityLabel={label ? (swingLabel(swing, game) ?? undefined) : undefined}
            style={[{ height: 24, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: solid ? team!.color : paint.colors.raised }, style]}
        >
            {team && (
                <Txt size={10} weight="extrabold" color={ink}>
                    {team.abbrev}
                </Txt>
            )}
            <Txt size={14} condensed tabular color={ink}>
                {fmtSwing(swing.value, i18n.language)}
            </Txt>
        </View>
    );
};

// Chip del resultado de la jugada: «JONRÓN», «PONCHE», «RODADO DE OUT»
export const EventBadge: React.FC<{ atBat: AtBat; inProgress?: boolean; style?: StyleProp<ViewStyle> }> = ({ atBat, inProgress = false, style }) => {
    const { t, i18n } = useTranslation();
    const paint = usePlayColors();
    const text = inProgress ? t('pro.jugadas.inProgress') : eventName(atBat, i18n.language) || t('pro.jugadas.play');
    const tone = inProgress ? paint.live : paint.event(eventTone(atBat.event));
    return (
        <View style={[{ height: 22, flexShrink: 0, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: tone.bg }, style]}>
            <Txt size={10.5} weight="extrabold" color={tone.ink} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {text}
            </Txt>
        </View>
    );
};

// «Presión ×2.04»: índice de presión (leverage) alto
export const PressureChip: React.FC<{ li: number }> = ({ li }) => {
    const { t } = useTranslation();
    const paint = usePlayColors();
    const ink = paint.tone(paint.pro.warn);
    return (
        <View style={{ height: 22, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: alpha(paint.pro.warn, 0.15) }}>
            <Gauge size={14} color={ink} />
            <Txt size={11} weight="bold" color={ink} numberOfLines={1}>
                {t('pro.jugadas.pressure', { value: li.toFixed(2) })}
            </Txt>
        </View>
    );
};

// Marcador después de la jugada con un punto del color de cada equipo: «● 1 – 0 ●»
export const ScorePill: React.FC<{ atBat: AtBat; game: Teams }> = ({ atBat, game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    if (atBat.away === null || atBat.home === null) return null;
    return (
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('pro.jugadas.score', { away: game.away.abbrev, awayRuns: atBat.away, home: game.home.abbrev, homeRuns: atBat.home })}
            style={{ height: 22, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: colors.raised }}
        >
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: game.away.color }} />
            <Txt size={15} condensed tabular>
                {atBat.away} – {atBat.home}
            </Txt>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: game.home.color }} />
        </View>
    );
};

// Tres puntos de outs (rojos los hechos)
export const OutDots: React.FC<{ outs: number }> = ({ outs }) => {
    const { t } = useTranslation();
    const colors = useColors();
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={t('pro.kit.game.outs', { count: outs })} style={{ flexDirection: 'row', gap: 3, flexShrink: 0 }}>
            {[0, 1, 2].map((index) => (
                <View key={index} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: index < outs ? colors.strike : alpha(colors.ink, 0.2) }} />
            ))}
        </View>
    );
};

// Burbuja de un pitcheo (como la cronología del Lite): «2 · Bola · Cambio 85.2»; el último va sólido
export const PitchPill: React.FC<{ pitch: Pitch; index: number; last?: boolean; challenged?: boolean }> = ({ pitch, index, last = false, challenged = false }) => {
    const { i18n } = useTranslation();
    const paint = usePlayColors();
    const kind = pitch.type || pitch.typeDesc ? ` · ${pitchTypeName(pitch, i18n.language)}` : '';
    const tone = paint.pitch(pitch.r, last);
    return (
        <View
            style={{
                minHeight: 30,
                maxWidth: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderRadius: 15,
                paddingHorizontal: 12,
                paddingVertical: 4,
                backgroundColor: tone.bg,
                borderWidth: challenged ? 2 : 0,
                borderColor: challenged ? PRO_GRADIENT[1] : undefined
            }}
        >
            <Txt size={12.5} weight="bold" color={tone.ink} style={{ flexShrink: 1, lineHeight: 16 }}>
                {pitch.n ?? index + 1} · {pitchCallName(pitch, i18n.language)}
                {kind}
            </Txt>
            {pitch.mph != null && (
                <Txt size={15} condensed tabular color={tone.ink} style={{ flexShrink: 0 }}>
                    {pitch.mph.toFixed(1)}
                </Txt>
            )}
        </View>
    );
};

/**
 * Plegado con altura animada (300 ms): al abrir se monta, se mide y crece; al cerrar se encoge y se desmonta
 * (lo cerrado no queda para el lector). Sin movimiento se abre y cierra de golpe.
 */
export const Collapse: React.FC<{ open: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ open, children, style }) => {
    const motion = useMotion();
    const [mounted, setMounted] = useState(open);
    if (open && !mounted) setMounted(true);
    const measured = useSharedValue(0);
    const progress = useSharedValue(open ? 1 : 0);
    useEffect(() => {
        if (!motion.animate) {
            progress.set(open ? 1 : 0);
            return;
        }
        progress.set(withTiming(open ? 1 : 0, { duration: MOTION_MS.flip, easing: MOTION_EASE }));
        if (open) return () => cancelAnimation(progress);
        const timer = setTimeout(() => setMounted(false), MOTION_MS.flip);
        return () => clearTimeout(timer);
    }, [open, motion.animate, progress]);
    const animated = useAnimatedStyle(() => {
        const height = measured.get();
        const share = progress.get();
        // Antes de medir: abierto, su alto natural; cerrado, nada
        if (!height) return share >= 1 ? { opacity: 1 } : { height: 0, opacity: 0 };
        return { height: height * share, opacity: share };
    });
    const onLayout = (event: LayoutChangeEvent) => measured.set(event.nativeEvent.layout.height);
    if (!motion.animate) return open ? <View style={style}>{children}</View> : null;
    if (!mounted) return null;
    return (
        <Animated.View style={[{ overflow: 'hidden' }, animated]}>
            <View onLayout={onLayout} style={style}>
                {children}
            </View>
        </Animated.View>
    );
};

// Flecha › que gira a ⌄ al abrir (200 ms)
export const Turn: React.FC<{ open: boolean; size?: number; color?: string }> = ({ open, size = 18, color }) => {
    const colors = useColors();
    const motion = useMotion();
    const angle = useSharedValue(open ? 90 : 0);
    useEffect(() => {
        angle.set(motion.animate ? withTiming(open ? 90 : 0, { duration: MOTION_MS.tab, easing: MOTION_EASE }) : open ? 90 : 0);
    }, [open, motion.animate, angle]);
    const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));
    return (
        <Animated.View style={style}>
            <ChevronRight size={size} color={color ?? colors.muted} />
        </Animated.View>
    );
};

/**
 * Fila que entra escalonada (sube 8 px y aparece, 300 ms + 30 ms por fila) solo si `play` era true al montarse:
 * las que aparecen después al desplazar una lista larga entran tal cual.
 */
export const RowIn: React.FC<{ index: number; play: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ index, play, children, style }) => {
    const motion = useMotion();
    const [animate] = useState(() => play && motion.animate);
    const shown = useSharedValue(animate ? 0 : 1);
    useEffect(() => {
        if (!animate) return;
        shown.set(withDelay(motion.delay(index, MOTION_STAGGER.row), withTiming(1, { duration: MOTION_MS.flip, easing: MOTION_EASE })));
        return () => cancelAnimation(shown);
        // Solo al montarse
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const enter = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * 8 }] }));
    return <Animated.View style={[style, enter]}>{children}</Animated.View>;
};
