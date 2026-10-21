// Piezas comunes de las jugadas del modo PRO: el escenario (entra, se va solo o al tocarlo), el reloj de la escena
// (todo por tiempo, nunca por cuadros), el marcador de arriba (odómetro, «+1», outs y conteo) y los colores del tema.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PlayEvent } from '../../../lib/playEvents';
import { proKeys, type GamePro, type WinProb } from '../../../lib/pro/juego';
import { useColors } from '../../../theme/theme';
import { alpha, fonts, inkOn, shadow } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { CountUp, MOTION_EASE, Odometer, PlusOne, useProColors } from '../kit';

/** Colores del escenario con los del tema (claro u oscuro) */
export const useStagePalette = () => {
    const colors = useColors();
    const pro = useProColors();
    return {
        bg: colors.surface,
        ink: colors.ink,
        muted: colors.muted,
        tile: colors.raised,
        grass: alpha(pro.up, 0.2),
        dirt: alpha(colors.hbp, 0.24),
        wall: colors.hbp,
        chalk: alpha(colors.ink, 0.45),
        base: colors.ink,
        ball: '#fbf4dc',
        ballEdge: '#b08d4f',
        trail: colors.gold,
        label: pro.warn,
        down: pro.down,
        up: pro.up,
        warn: pro.warn
    };
};
export type StagePalette = ReturnType<typeof useStagePalette>;

/** Los extras PRO del juego que ya están en caché (los pide el juego PRO o la vista de animaciones): aquí no se piden */
export const useCachedPro = (gamePk: number | null | undefined) => {
    const pro = useQuery<GamePro>({ queryKey: proKeys.game(gamePk ?? ''), queryFn: skipToken });
    const winProb = useQuery<WinProb>({ queryKey: proKeys.winProb(gamePk ?? ''), queryFn: skipToken });
    return { pro: gamePk ? pro.data : undefined, winProb: gamePk ? winProb.data : undefined };
};

export interface StageOptions {
    /** Duración total de la escena (ms); puede crecer si los datos PRO llegan después de empezar */
    total: number;
    /** Sin movimiento («Apagadas» o «Reducir movimiento»): el estado final con un fundido */
    reduce: boolean;
    /** Dentro de una página (vista de animaciones): no se va al terminar */
    inline?: boolean;
    onDone: () => void;
}

/**
 * Ciclo de vida de la escena: entra en 150 ms, se va sola al terminar (300 ms) o al tocarla (150 ms). `clock` va de 0
 * al total en ms (lineal); cada pieza lee su momento de ahí. Sin movimiento, `clock` empieza en el final.
 */
export const useStage = ({ total, reduce, inline = false, onDone }: StageOptions) => {
    const [start] = useState(() => Date.now());
    const shown = useSharedValue(reduce || inline ? 1 : 0);
    const lift = useSharedValue(0);
    const clock = useSharedValue(reduce ? total + 1 : 0);
    const done = useRef(onDone);
    const closing = useRef(false);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    useEffect(() => {
        done.current = onDone;
    });

    const close = useCallback(
        (fast: boolean) => {
            if (closing.current) return;
            closing.current = true;
            if (inline) {
                done.current();
                return;
            }
            const ms = fast || reduce ? 150 : 300;
            shown.set(withTiming(0, { duration: ms, easing: Easing.in(Easing.quad) }));
            if (!fast && !reduce) lift.set(withTiming(-10, { duration: ms, easing: Easing.in(Easing.quad) }));
            timers.current.push(setTimeout(() => done.current(), ms + 20));
        },
        [inline, reduce, shown, lift]
    );

    useEffect(() => {
        if (!inline && !reduce) shown.set(withTiming(1, { duration: 150, easing: MOTION_EASE }));
        const list = timers.current;
        return () => list.forEach(clearTimeout);
    }, [inline, reduce, shown]);

    // La escena puede alargarse si los datos llegan después de empezar: se cuenta desde el inicio
    useEffect(() => {
        const elapsed = Date.now() - start;
        if (reduce) clock.set(total + 1);
        else clock.set(withTiming(total, { duration: Math.max(0, total - elapsed), easing: Easing.linear }));
        const hold = reduce ? Math.min(total, 2000) : total;
        const timer = setTimeout(() => close(false), Math.max(0, hold - elapsed));
        return () => {
            clearTimeout(timer);
            cancelAnimation(clock);
        };
    }, [total, reduce, start, clock, close]);

    const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: lift.get() }] }));
    return { start, clock, close, style };
};

/** true desde el instante `at` de la escena (ms); sin movimiento, desde el principio */
export const useAt = (at: number, start: number, reduce: boolean) => {
    const [reached, setReached] = useState(reduce);
    useEffect(() => {
        if (reduce) return;
        const timer = setTimeout(() => setReached(true), Math.max(0, at - (Date.now() - start)));
        return () => clearTimeout(timer);
    }, [at, start, reduce]);
    return reached || reduce;
};

interface StageFrameProps {
    /** Alto sin la zona segura de arriba */
    height: number;
    style: ReturnType<typeof useAnimatedStyle>;
    inline: boolean;
    /** Lo que oye el lector de pantalla: la jugada completa (lo de adentro es decorativo) */
    summary: string;
    onClose: () => void;
    children: React.ReactNode;
}

/** El escenario: arriba de la pantalla (encima del juego) o dentro de una página (`inline`) */
export const StageFrame: React.FC<StageFrameProps> = ({ height, style, inline, summary, onClose, children }) => {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const window = useWindowDimensions();
    const palette = useStagePalette();
    const body = (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flex: 1 }}>
            {children}
        </View>
    );
    if (inline) {
        return (
            <Animated.View accessible accessibilityRole="image" accessibilityLabel={summary} style={[{ height, borderRadius: 24, overflow: 'hidden', backgroundColor: palette.bg }, shadow('card'), style]}>
                {body}
            </Animated.View>
        );
    }
    const width = Math.min(window.width, 480);
    return (
        <View pointerEvents="box-none" style={styles.root} accessibilityLiveRegion="polite">
            <Animated.View style={[{ width, height: height + insets.top, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden', backgroundColor: palette.bg }, shadow('float'), style]}>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={summary} accessibilityHint={t('anim.close')} style={{ flex: 1, paddingTop: insets.top }}>
                    {body}
                </Pressable>
            </Animated.View>
        </View>
    );
};

// ---------------------------------------------------------------- marcador de arriba

/** Marcador antes de la jugada (lo de después menos las carreras que entraron) */
export const scoreBefore = (event: PlayEvent) => {
    const after = { away: event.runs?.away ?? event.away.runs, home: event.runs?.home ?? event.home.runs };
    if (!event.runs) return { before: after, after };
    const side = event.team.id === event.away.id ? 'away' : 'home';
    return { before: { ...after, [side]: Math.max(0, after[side] - event.runs.count) }, after };
};

interface ScoreStripProps {
    event: PlayEvent;
    /** Ya entraron las carreras: el odómetro rueda y salta el «+1» */
    scored: boolean;
    outs: number;
    count: string | null;
    narrow?: boolean;
}

export const ScoreStrip: React.FC<ScoreStripProps> = ({ event, scored, outs, count, narrow = false }) => {
    const { before, after } = scoreBefore(event);
    const score = scored ? after : before;
    const scoringSide = event.runs ? (event.team.id === event.away.id ? 'away' : 'home') : null;
    const inning = event.atBat ? { n: event.atBat.inning, top: event.atBat.top } : event.inning ? { n: event.inning.n, top: event.inning.isTop } : null;
    const side = (key: 'away' | 'home') => {
        const team = event[key];
        const ink = inkOn(team.color);
        const end = key === 'home';
        return (
            <View style={{ flex: 1, minWidth: 0, flexDirection: end ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <TeamLogo team={team} size={24} />
                </View>
                {!narrow && (
                    <Txt size={13} weight="extrabold" color={ink} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {team.abbrev}
                    </Txt>
                )}
                <View style={{ flex: 1 }} />
                <View>
                    <Odometer value={score[key]} size={34} color={ink} />
                    {scoringSide === key && scored && event.runs && (
                        <PlusOne trigger={1} style={{ top: -12, [end ? 'right' : 'left']: '100%' }}>
                            <Txt size={16} weight="extrabold" color={ink}>
                                +{event.runs.count}
                            </Txt>
                        </PlusOne>
                    )}
                </View>
            </View>
        );
    };
    return (
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center' }}>
            <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
                <View style={{ flex: 1, backgroundColor: event.away.color }} />
                <View style={{ flex: 1, backgroundColor: event.home.color }} />
            </View>
            {side('away')}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 10, borderRadius: 18, backgroundColor: 'rgba(11,12,16,0.82)' }}>
                {inning && (
                    <Txt size={12} weight="bold" color="#f1f2f6" tabular>
                        {inning.top ? '▲' : '▼'} {inning.n}
                    </Txt>
                )}
                <View style={{ flexDirection: 'row', gap: 3 }}>
                    {[1, 2, 3].map((n) => (
                        <View key={n} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n <= outs ? '#ff5a5f' : 'rgba(255,255,255,0.25)' }} />
                    ))}
                </View>
                {count && (
                    <Txt size={12} weight="bold" color="#34c778" tabular>
                        {count}
                    </Txt>
                )}
            </View>
            {side('home')}
        </View>
    );
};

// ---------------------------------------------------------------- piezas de texto

/** El título de la jugada: aparece con un pequeño salto cuando llega su momento */
export const StageTitle: React.FC<{ text: string; show: boolean; color: string; size?: number; animate: boolean }> = ({ text, show, color, size = 40, animate }) => {
    const value = useSharedValue(show && !animate ? 1 : 0);
    useEffect(() => {
        if (!show) return;
        if (!animate) {
            value.set(1);
            return;
        }
        value.set(withTiming(1, { duration: 320, easing: Easing.bezier(0.3, 1.4, 0.5, 1) }));
        return () => cancelAnimation(value);
    }, [show, animate, value]);
    const style = useAnimatedStyle(() => ({ opacity: Math.min(1, value.get() * 1.5), transform: [{ translateY: (1 - value.get()) * size * 0.4 }, { scale: 1 + (1 - value.get()) * 0.15 }] }));
    return (
        <Animated.Text numberOfLines={1} style={[{ fontFamily: fonts.condensed, fontSize: size, lineHeight: size * 0.98, color, textTransform: 'uppercase' }, style]}>
            {text}
        </Animated.Text>
    );
};

/** Ficha de cifra que cuenta (salida, ángulo, distancia) */
export const StatChip: React.FC<{ value: number; decimals?: number; unit?: string; label: string; palette: StagePalette }> = ({ value, decimals = 0, unit, label, palette }) => (
    <View style={{ flex: 1, flexBasis: 0, minWidth: 0, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: palette.tile }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
            <Txt condensed size={24} color={palette.ink} tabular>
                <CountUp value={value} format={(n) => n.toFixed(decimals)} />
            </Txt>
            {unit ? (
                <Txt size={12} weight="bold" color={palette.ink}>
                    {unit}
                </Txt>
            ) : null}
        </View>
        <Txt size={10} weight="extrabold" color={palette.muted} numberOfLines={1} style={{ marginTop: 2, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {label}
        </Txt>
    </View>
);

/** Valor animado entre momentos de la escena (para posiciones): devuelve el estilo de un punto que se mueve */
export type Clock = SharedValue<number>;

const styles = StyleSheet.create({
    root: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 45, elevation: 45, alignItems: 'center' }
});
