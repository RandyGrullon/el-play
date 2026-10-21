// Piezas pequeñas del Fantasy PRO (las de bits.tsx de la web): mini diamante, chips del desglose de puntos, candado que
// se cierra, chip flotante «+10 HR Lester», confeti de un acierto, banda que late y flecha de movimiento. Todo respeta
// «Animaciones» y «Reducir movimiento»: sin movimiento cada pieza sale quieta y nada depende de la animación.
import React, { useEffect, useRef, useState } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Lock, LockOpen } from 'lucide-react-native';
import type { Runners } from '../../../types';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { MOTION_EASE, useMotion, useProColors } from '../kit';
import { round1, type PointPart } from './logic';

export type T = (key: string, options?: Record<string, unknown>) => string;

const MINUS = '−';

/** Puntos con un decimal como mucho y el menos tipográfico: 34.5, −1.5, 26 */
export const fmtPts = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const rounded = round1(value);
    return rounded < 0 ? `${MINUS}${Math.abs(rounded)}` : String(rounded);
};

/** Con signo: +10, −2.5, 0 */
export const fmtSignedPts = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const rounded = round1(value);
    return rounded > 0 ? `+${rounded}` : rounded < 0 ? `${MINUS}${Math.abs(rounded)}` : '0';
};

/** «14.º» en español, «14th» en inglés */
export const ordinal = (n: number, lang: string) => {
    if (!lang.startsWith('en')) return `${n}.º`;
    const mod100 = n % 100;
    const mod10 = n % 10;
    const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
};

// ---------------------------------------------------------------- cifra

/** Número en Barlow Condensed tabular (hereda dentro de otro texto) */
export const Num: React.FC<{ children: React.ReactNode; size: number; color?: string; tone?: 'ink' | 'muted'; style?: StyleProp<TextStyle>; numberOfLines?: number }> = ({ children, size, color, tone = 'ink', style, numberOfLines }) => (
    <Txt condensed size={size} tone={tone} color={color} tabular numberOfLines={numberOfLines} style={[{ lineHeight: Math.round(size * 1.08) }, style]}>
        {children}
    </Txt>
);

// ---------------------------------------------------------------- mini diamante

/** Bases y outs del juego en 20 px: corredores llenos, outs como puntos. Una imagen con su texto para el lector */
export const MiniDiamond: React.FC<{ runners: Runners; outs: number; label: string; color: string }> = ({ runners, outs, label, color }) => (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Svg width={20} height={15} viewBox="0 0 20 15">
            {(
                [
                    [10, 4, runners.second],
                    [16, 10, runners.first],
                    [4, 10, runners.third]
                ] as const
            ).map(([x, y, on]) => (
                <Rect key={`${x}-${y}`} x={x - 2.6} y={y - 2.6} width={5.2} height={5.2} rotation={45} originX={x} originY={y} fill={on ? color : 'none'} stroke={color} strokeWidth={1.3} />
            ))}
        </Svg>
        <View style={{ flexDirection: 'row', gap: 2 }}>
            {[0, 1, 2].map((index) => (
                <View key={index} style={{ width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderColor: color, backgroundColor: index < outs ? color : 'transparent' }} />
            ))}
        </View>
    </View>
);

export const diamondLabel = (runners: Runners, outs: number, t: T) => {
    const bases = [runners.first && t('pro.fantasy.bases.first'), runners.second && t('pro.fantasy.bases.second'), runners.third && t('pro.fantasy.bases.third')].filter(Boolean) as string[];
    const on = bases.length ? t('pro.fantasy.bases.on', { bases: bases.join(', ') }) : t('pro.fantasy.bases.empty');
    return `${on}, ${t('pro.fantasy.bases.outs', { count: outs })}`;
};

// ---------------------------------------------------------------- desglose de puntos

/** Un chip suelto del desglose (el «= 26» del final, «26 ×1.5»): tono neutro, verde, rojo o dorado */
export const PartChip: React.FC<{ text: string; tone?: 'neutral' | 'up' | 'down' | 'gold'; size?: 'sm' | 'md'; surface?: string; strike?: boolean }> = ({ text, tone = 'neutral', size = 'sm', surface, strike = false }) => {
    const colors = useColors();
    const pro = useProColors();
    const ink = tone === 'up' ? pro.up : tone === 'down' ? pro.down : tone === 'gold' ? colors.gold : colors.ink;
    const bg = tone === 'neutral' ? surface ?? colors.bg : alpha(ink, tone === 'gold' ? 0.16 : 0.14);
    return (
        <View style={{ height: size === 'sm' ? 22 : 24, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: bg }}>
            <Txt size={size === 'sm' ? 11 : 12} weight="bold" color={ink} tabular numberOfLines={1} style={strike ? { textDecorationLine: 'line-through' } : undefined}>
                {text}
            </Txt>
        </View>
    );
};

/**
 * Chips de dónde salen los puntos. `calc`: «1B ×2 = 6», «HR 10», «K −1» (Mi equipo); `plus`: «2 C +4», «HR +10»
 * (días de un fanático). Lo que resta va en rojo suave. Para el lector es un solo texto con todo el desglose.
 */
export const PartChips: React.FC<{ parts: PointPart[]; variant?: 'calc' | 'plus'; size?: 'sm' | 'md'; surface?: string; extra?: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ parts, variant = 'calc', size = 'sm', surface, extra, style }) => {
    const { t } = useTranslation();
    if (!parts.length && !extra) return null;
    const texts = parts.map((part) => {
        const abbr = t(`pro.fantasy.parts.${part.key}`);
        return variant === 'calc' ? (part.count > 1 ? `${abbr} ×${part.count} = ${fmtPts(part.pts)}` : `${abbr} ${fmtPts(part.pts)}`) : `${part.count > 1 ? `${part.count} ` : ''}${abbr} ${fmtSignedPts(part.pts)}`;
    });
    return (
        <View accessible accessibilityLabel={`${t('pro.fantasy.parts.label')}: ${texts.join(', ')}`} style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, style]}>
            {parts.map((part, index) => (
                <PartChip key={part.key} text={texts[index]} tone={part.pts < 0 ? 'down' : 'neutral'} size={size} surface={surface} />
            ))}
            {extra}
        </View>
    );
};

// ---------------------------------------------------------------- candado

/** Candado abierto hasta la hora del juego; al cerrarse con la pantalla abierta gira y se cierra (600 ms) */
export const LockMark: React.FC<{ locked: boolean; label: string; color: string }> = ({ locked, label, color }) => {
    const motion = useMotion();
    const turn = useSharedValue(0);
    const before = useRef(locked);
    useEffect(() => {
        const closing = !before.current && locked;
        before.current = locked;
        if (!closing || !motion.animate) return;
        turn.set(withSequence(withTiming(-35, { duration: 0 }), withTiming(10, { duration: 360, easing: MOTION_EASE }), withTiming(0, { duration: 240, easing: MOTION_EASE })));
        return () => cancelAnimation(turn);
    }, [locked, motion.animate, turn]);
    const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }, { scale: 1 - Math.abs(turn.get()) / 175 }] }));
    const Icon = locked ? Lock : LockOpen;
    return (
        <Animated.View accessible accessibilityRole="image" accessibilityLabel={label} style={[{ flexShrink: 0 }, spin]}>
            <Icon size={14} color={color} />
        </Animated.View>
    );
};

// ---------------------------------------------------------------- banda que late («AL BATE»)

/** Marco de 2 px que late sobre la banda del que está al bate (solo si se anima; el texto ya lo dice) */
export const PulseFrame: React.FC<{ color: string }> = ({ color }) => {
    const motion = useMotion();
    const beat = useSharedValue(motion.animate ? 0.25 : 0);
    useEffect(() => {
        if (!motion.animate) {
            beat.set(0);
            return;
        }
        beat.set(withRepeat(withSequence(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.quad) })), -1));
        return () => cancelAnimation(beat);
    }, [motion.animate, beat]);
    const style = useAnimatedStyle(() => ({ opacity: beat.get() }));
    if (!motion.animate) return null;
    return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: color }, style]} />;
};

// ---------------------------------------------------------------- chip flotante

/**
 * «+10 HR Lester» cuando a un pelotero le suben (o bajan) los puntos entre lecturas: sube y se desvanece en 2,6 s.
 * Sin movimiento se queda quieto 3 s y se va. Lo anuncia el padre para el lector; este chip es decorativo.
 */
export const FloatChip: React.FC<{ value: number; text: string; style?: StyleProp<ViewStyle> }> = ({ value, text, style }) => {
    const motion = useMotion();
    const [shown, setShown] = useState(true);
    const rise = useSharedValue(0);
    useEffect(() => {
        if (motion.animate) {
            rise.set(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }));
        }
        const timer = setTimeout(() => setShown(false), motion.animate ? 2600 : 3000);
        return () => {
            clearTimeout(timer);
            cancelAnimation(rise);
        };
    }, [motion.animate, rise]);
    const moving = useAnimatedStyle(() => {
        const p = rise.get();
        if (!motion.animate) return { opacity: 1 };
        const opacity = p < 0.15 ? p / 0.15 : p > 0.75 ? Math.max(0, 1 - (p - 0.75) / 0.25) : 1;
        const y = p < 0.15 ? 10 * (1 - p / 0.15) : p < 0.75 ? -14 * ((p - 0.15) / 0.6) : -14 - 10 * ((p - 0.75) / 0.25);
        return { opacity, transform: [{ translateY: y }] };
    });
    if (!shown) return null;
    // Verde o rojo fuerte con texto oscuro (el mismo par en claro y oscuro: contraste de sobra)
    const bg = value >= 0 ? 'rgb(52,199,120)' : 'rgb(255,90,95)';
    return (
        <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[{ position: 'absolute', zIndex: 2, height: 24, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 10, backgroundColor: bg }, shadow('float'), style, moving]}>
            <Txt size={11} weight="extrabold" color="#0b0c10" numberOfLines={1}>
                {text}
            </Txt>
        </Animated.View>
    );
};

export interface ScoreChange {
    delta: number;
    key: number;
    /** Qué partes subieron («HR», «1B · CI») */
    what: string;
}

/** Qué partes subieron entre dos lecturas («HR», «1B · CI») */
const changedParts = (before: PointPart[], after: PointPart[], t: T) =>
    after
        .filter((part) => part.count > (before.find((item) => item.key === part.key)?.count ?? 0))
        .map((part) => t(`pro.fantasy.parts.${part.key}`))
        .join(' · ');

/**
 * Lo que cambiaron los puntos de un pelotero entre lecturas (no al montar): { delta, key, what } para pintar un
 * FloatChip nuevo cada vez. `reset` (la fecha) vuelve a empezar sin chip. Es estado derivado: se calcula en el render.
 */
export const useScoreChange = (score: number, parts: PointPart[], reset: unknown, t: T): ScoreChange | null => {
    const [track, setTrack] = useState<{ score: number; parts: PointPart[]; reset: unknown; change: ScoreChange | null; seq: number }>({ score, parts, reset, change: null, seq: 0 });
    if (track.score !== score || track.parts !== parts || track.reset !== reset) {
        if (track.reset !== reset) setTrack({ score, parts, reset, change: null, seq: track.seq });
        else if (track.score !== score) {
            const seq = track.seq + 1;
            setTrack({ score, parts, reset, seq, change: { delta: round1(score - track.score), key: seq, what: changedParts(track.parts, parts, t) } });
        } else setTrack({ ...track, parts });
    }
    return track.change;
};

// ---------------------------------------------------------------- confeti de un acierto

const PIECES = [
    [-15, -8, 5, 5, 0],
    [12, -13, 4, 7, 37],
    [17, 3, 5, 4, 12],
    [-11, 12, 4, 6, -25],
    [3, -17, 4, 4, 0],
    [-18, 2, 6, 3, 60],
    [9, 14, 5, 5, 20],
    [16, -6, 3, 6, -40]
] as const;

const Piece: React.FC<{ index: number; color: string; progress: SharedValue<number> }> = ({ index, color, progress }) => {
    const [x, y, w, h, rotate] = PIECES[index];
    const style = useAnimatedStyle(() => {
        const p = progress.get();
        const k = Math.min(1, p / 0.7);
        return {
            opacity: p <= 0 ? 0 : p < 0.7 ? k : Math.max(0, 1 - (p - 0.7) / 0.3),
            transform: [{ translateX: -x * (1 - k) }, { translateY: -y * (1 - k) }, { rotate: `${rotate * k}deg` }, { scale: 0.2 + 0.8 * k }]
        };
    });
    const light = index % 2 === 1;
    return (
        <Animated.View
            style={[
                { position: 'absolute', left: '50%', top: '50%', marginLeft: x, marginTop: y, width: w, height: h, borderRadius: 2, backgroundColor: light ? '#ffffff' : color },
                light && { borderWidth: 1, borderColor: color },
                style
            ]}
        />
    );
};

/** Ráfaga corta con los colores del equipo alrededor de la marca de acierto (decorativa, 900 ms, una vez al verse) */
export const Confetti: React.FC<{ color: string; seen: boolean }> = ({ color, seen }) => {
    const motion = useMotion();
    const progress = useSharedValue(0);
    const played = useRef(false);
    useEffect(() => {
        if (!seen || played.current || !motion.animate) return;
        played.current = true;
        progress.set(withDelay(300, withTiming(1, { duration: 900 })));
    }, [seen, motion.animate, progress]);
    if (!motion.animate) return null;
    return (
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {PIECES.map((_, index) => (
                <Piece key={index} index={index} color={color} progress={progress} />
            ))}
        </View>
    );
};

// ---------------------------------------------------------------- movimiento en la tabla

/** ▲2 verde, ▼1 rojo o «–» (sin movimiento o primer día); el lector oye «subió 2» */
export const MoveMark: React.FC<{ move: number | null; firstDay?: boolean }> = ({ move, firstDay = false }) => {
    const { t } = useTranslation();
    const pro = useProColors();
    if (move === null || move === 0) {
        return (
            <View accessible accessibilityLabel={firstDay || move === null ? t('pro.fantasy.move.first') : t('pro.fantasy.move.same')} style={{ height: 20, minWidth: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Txt size={12} weight="bold" tone="muted">
                    –
                </Txt>
            </View>
        );
    }
    const up = move > 0;
    const color = up ? pro.up : pro.down;
    return (
        <View accessible accessibilityLabel={t(up ? 'pro.fantasy.move.up' : 'pro.fantasy.move.down', { count: Math.abs(move) })} style={{ height: 20, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Svg width={8} height={8} viewBox="0 0 10 10">
                <Path d={up ? 'M5 1 L9.5 8.5 H0.5 Z' : 'M5 9 L9.5 1.5 H0.5 Z'} fill={color} />
            </Svg>
            <Txt size={12} weight="extrabold" color={color} tabular>
                {Math.abs(move)}
            </Txt>
        </View>
    );
};
