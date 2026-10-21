import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View, useWindowDimensions, type TextStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { lastName } from '../../lib/format';
import type { OutVariant, PlayEvent } from '../../lib/playEvents';
import { useIsPro } from '../../lib/pro';
import { useMotion } from '../../lib/motion';
import { legsOf, runnerPaths, type RunnerPath } from '../../lib/runners';
import { alpha, fonts, inkOn } from '../../theme/tokens';
import { PlayerPhoto, TeamLogo, Txt } from '../ui';
import { ProPlayAnimation } from '../pro/animaciones/ProPlayAnimation';
import { MissedCard } from '../pro/animaciones/MissedCard';
import { playHaptic } from '../pro/animaciones/haptics';
import { hasProScene } from '../pro/animaciones/scenes';
import { Confetti, type Burst } from './Confetti';
import { HomeRunFlight, homeRunFlightMs } from './HomeRunFlight';

// Animaciones de jugada en el juego en vivo (calcadas de la web): fin de entrada, ponche, hit, doble, triple, jonrón,
// outs, emergentes, la victoria al terminar y el campeonato cuando ese juego da el título; con el logo y los colores del
// equipo protagonista. Se cierran solas o al tocarlas y solo ocupan la parte de arriba. Con «reducir movimiento» en el
// teléfono solo aparecen y desaparecen.

// Las del modo PRO (base por bolas, error, robo…) no llegan al Lite; si alguna llegara, dura como un hit
const HOLD: Record<PlayEvent['kind'], number> = {
    inning: 2800,
    k: 2300,
    single: 2120,
    double: 2340,
    triple: 2560,
    hr: 3300,
    win: 3400,
    champion: 6000,
    pinchHitter: 2800,
    pinchRunner: 2800,
    out: 2300,
    walk: 2120,
    error: 2120,
    steal: 2120,
    wildPitch: 2120,
    pitchingChange: 2800,
    run: 2120,
    noHitter: 2800,
    missed: 2120
};
const STAGE_H = 430;
const EXIT = 380;

// Trayectoria de la bola en cada tipo de out (cuadro de 100×100, home abajo): puntos [x, y, tamaño] y dónde la atrapan
type Point = [number, number, number];
const OUT_PATHS: Record<OutVariant, { legs: Point[][]; outsAt: [number, number][]; runner?: [number, number][] }> = {
    ground: { legs: [[[50, 88, 1], [44, 76, 1], [40, 66, 1], [36, 58, 1]], [[36, 58, 1], [86, 52, 1]]], outsAt: [[86, 52]] },
    line: { legs: [[[50, 88, 1], [22, 42, 1]]], outsAt: [[22, 42]] },
    fly: { legs: [[[50, 88, 1], [50, 58, 2], [50, 28, 1.7], [50, 10, 1]]], outsAt: [[50, 10]] },
    pop: { legs: [[[50, 88, 1], [52, 72, 2.2], [56, 64, 1.7], [60, 62, 1]]], outsAt: [[60, 62]] },
    force: { legs: [[[50, 88, 1], [42, 70, 1], [36, 58, 1]], [[36, 58, 1], [50, 16, 1]]], outsAt: [[50, 16]] },
    dp: { legs: [[[50, 88, 1], [42, 70, 1], [36, 58, 1]], [[36, 58, 1], [50, 16, 1]], [[50, 16, 1], [86, 52, 1]]], outsAt: [[50, 16], [86, 52]] },
    tp: { legs: [[[50, 88, 1], [30, 66, 1], [14, 52, 1]], [[14, 52, 1], [50, 16, 1]], [[50, 16, 1], [86, 52, 1]]], outsAt: [[14, 52], [50, 16], [86, 52]] },
    sac: { legs: [[[50, 88, 1], [64, 56, 2], [74, 32, 1.6], [80, 20, 1]]], outsAt: [[80, 20]], runner: [[14, 52], [50, 88]] }
};
const LEG_MS = 340;
const BASES: [number, number][] = [
    [50, 88],
    [86, 52],
    [50, 16],
    [14, 52]
];
const DIAMOND = 92; // el cuadrito de 100×100 se pinta a 92 px
const k = DIAMOND / 100;

// El jonrón con el batazo marcado: el campo aparece, la bola sale a los 450 ms y la tarjeta espera a que caiga
const FLIGHT_DELAY = 450;
// …y la escena es más alta (sin tapar la barra de abajo)
const FLIGHT_STAGE_H = 570;

// Hits: los corredores salen a la vez (380 ms por base) cuando ya entró la tarjeta
const RUN_START = 620;
const RUN_LEG = 380;

/** Puntos del diamante (cuadro de 100) que recorre un corredor; anotar es volver a home */
const routeOf = (path: Pick<RunnerPath, 'from' | 'to'>) => Array.from({ length: path.to - path.from + 1 }, (_, step) => BASES[(path.from + step) % 4]);

// Curvas de la web
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const BOUNCE = Easing.bezier(0.3, 1.5, 0.5, 1);
const BOUNCE_BIG = Easing.bezier(0.3, 1.6, 0.5, 1);
const native = Platform.OS !== 'web';

// «Reducir movimiento» del sistema (se lee una vez y se sigue con el cambio)
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.()
    .then((value) => (reduceMotion = value))
    .catch(() => undefined);
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => (reduceMotion = value));

// r0…r3: cada corredor del hit (bases recorridas); g0…g3: el que anota se desvanece; field: el vuelo del jonrón
const NAMES = ['stage', 'card', 'logo', 'sub', 'kicker', 'runner', 'rays', 'trail', 'ball', 'zone', 'k', 'shake', 'label', 'wipe', 'scoreline', 'glow', 'trophy', 'panel', 'shutter', 'nextLogo', 'outP', 'inP', 'arrows', 'm0', 'm1', 'm2', 'd0', 'd1', 'd2', 'b1', 'b2', 'b3', 'r0', 'r1', 'r2', 'r3', 'g0', 'g1', 'g2', 'g3', 'field', 'rbiPop', 'plus', 'scorePop'] as const;
type Name = (typeof NAMES)[number];
// Empiezan «en reposo» (1): los saltos de «+N» y del marcador, que se reinician con cada carrera
const REST: Name[] = ['rbiPop', 'scorePop'];

/** Punto de la curva del jonrón (Q de 30,400 a 330,70 pasando por 150,-60) con el avance suave de la web */
const homerPoint = (t: number) => {
    const p = t * t * (3 - 2 * t);
    const a = (1 - p) * (1 - p);
    const b = 2 * (1 - p) * p;
    const c = p * p;
    return [a * 30 + b * 150 + c * 330, a * 400 + b * -60 + c * 70];
};

/** Rayas diagonales del fondo de las tarjetas (repeating-linear-gradient de la web) */
const Stripes: React.FC<{ color: string; id: string }> = ({ color, id }) => (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
            <Pattern id={`st${id}`} patternUnits="userSpaceOnUse" width={34} height={34} patternTransform="rotate(30)">
                <Rect x={22} y={0} width={12} height={34} fill={color} />
            </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#st${id})`} opacity={0.18} />
    </Svg>
);

/** Logo en círculo blanco con sombra (pa-logo) */
const Badge: React.FC<{ team: PlayEvent['team']; size: number; pad: number; ring?: boolean }> = ({ team, size, pad, ring }) => (
    <View
        style={[
            { width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
            ring && { borderWidth: 6, borderColor: 'rgba(255,255,255,0.35)' },
            Platform.select({ web: { boxShadow: '0 6px 16px rgba(0,0,0,0.25)' }, default: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 } }) as object
        ]}
    >
        <TeamLogo team={team} size={size - pad * 2 - (ring ? 12 : 0)} />
    </View>
);

/**
 * La animación de jugada del juego en vivo. En el modo PRO las jugadas con datos reales (batazo, corredores, base por
 * bolas, robo, error, relevo, sin hit…) y «Te lo perdiste» las pinta el PRO (components/pro/animaciones); el resto
 * (fin de entrada, emergentes, victoria y campeonato) sigue con la del Lite. El Lite no cambia.
 */
export const PlayAnimation: React.FC<{ event: PlayEvent; onDone: () => void }> = ({ event, onDone }) => {
    const pro = useIsPro();
    return pro ? <ProPlay event={event} onDone={onDone} /> : <LitePlayAnimation event={event} onDone={onDone} />;
};

const ProPlay: React.FC<{ event: PlayEvent; onDone: () => void }> = ({ event, onDone }) => {
    const motion = useMotion();
    const lite = event.kind !== 'missed' && !hasProScene(event);
    // Las del Lite en PRO también vibran (victoria y campeonato); las PRO vibran en su momento
    useEffect(() => {
        if (lite) playHaptic(event.kind, motion.animate);
        // Una vez por jugada
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (event.kind === 'missed') return event.missed ? <MissedCard summary={event.missed} away={event.away} home={event.home} onClose={onDone} /> : <Skip onDone={onDone} />;
    if (!lite) return <ProPlayAnimation event={event} onDone={onDone} />;
    return <LitePlayAnimation event={event} onDone={onDone} />;
};

/** Sin nada que mostrar: pasa la cola */
const Skip: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    useEffect(() => {
        onDone();
        // Una vez
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
};

/** La animación del Lite (en PRO también la de fin de entrada, emergentes, victoria y campeonato) */
export const LitePlayAnimation: React.FC<{ event: PlayEvent; onDone: () => void }> = ({ event, onDone }) => {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const window = useWindowDimensions();
    const W = Math.min(window.width, 480);
    // Jonrón: cuánto vuela la bola (null si MLB no marcó dónde cayó: entonces va la curva de siempre)
    const flight = event.kind === 'hr' ? homeRunFlightMs(event.atBat) : null;
    const landAt = flight !== null ? FLIGHT_DELAY + flight : 0;
    const H = (flight !== null ? Math.min(FLIGHT_STAGE_H, Math.max(STAGE_H, window.height - 120)) : STAGE_H) + insets.top;
    const [reduce] = useState(() => reduceMotion);
    const [v] = useState(() => Object.fromEntries(NAMES.map((name) => [name, new Animated.Value((name === 'stage' && !reduce) || REST.includes(name) ? 1 : 0)])) as Record<Name, Animated.Value>);
    const [letterValues] = useState(() => Array.from({ length: 18 }, () => new Animated.Value(0)));
    const doneRef = useRef(onDone);
    useEffect(() => {
        doneRef.current = onDone;
    });
    const closeRef = useRef<() => void>(() => undefined);
    const id = useId().replace(/[^a-zA-Z0-9]/g, '');

    const { kind, team, rival, atBat } = event;
    const on = inkOn(team.color);
    const second = team.color2 || on;
    const outPath = kind === 'out' && event.out ? OUT_PATHS[event.out.variant] : null;
    const outTotal = outPath ? outPath.legs.length * LEG_MS + (event.out?.variant === 'fly' || event.out?.variant === 'sac' ? 260 : 0) : 0;
    // Hits: quién corre y cuántas entran (del marcador; si no se sabe, las impulsadas)
    const rbi = atBat?.rbi ?? 0;
    const scored = event.runs ? event.runs.count : rbi;
    const hitPaths = kind === 'single' || kind === 'double' || kind === 'triple' ? runnerPaths(kind, event.bases ?? null, scored) : [];
    const runLegs = Math.max(0, ...hitPaths.map(legsOf));
    // Marcador del equipo al bate antes y después de la jugada: sube con cada corredor que pisa home
    const runsSide = team.id === event.away.id ? 'away' : 'home';
    const score = event.runs ? { before: event.runs[runsSide] - event.runs.count, after: event.runs[runsSide] } : null;
    const [runsIn, setRunsIn] = useState(() => (reduce ? hitPaths.filter((path) => path.to === 4).length : 0));

    useLayoutEffect(() => {
        const running: Animated.CompositeAnimation[] = [];
        const timers: ReturnType<typeof setTimeout>[] = [];
        let closed = false;
        // Cada paso: valor, hasta dónde, cuánto dura y cuándo empieza (en reducido todo queda en su sitio de una vez)
        const go = (value: Animated.Value, toValue: number, duration: number, delay = 0, easing: (x: number) => number = EASE) => {
            if (reduce) {
                value.setValue(toValue);
                return;
            }
            const animation = Animated.timing(value, { toValue, duration, delay, easing, useNativeDriver: native });
            running.push(animation);
            animation.start();
        };
        const letters = (count: number, duration: number, start: number, step: number, easing?: (x: number) => number) => letterValues.slice(0, count).forEach((value, index) => go(value, 1, duration, start + index * step, easing));
        const word = (text: string) => [...text].length;

        if (reduce) {
            v.stage.setValue(0);
            running.push(Animated.timing(v.stage, { toValue: 1, duration: 200, useNativeDriver: native }));
            running[0].start();
        }

        if (kind === 'single' || kind === 'double' || kind === 'triple') {
            go(v.card, 1, 480);
            go(v.logo, 1, 520, 220);
            letters(word(t(`anim.${kind}`)), 300, 300, 60);
            go(v.sub, 1, 300, 650);
            // Todos corren a la vez: el bateador a su base, los que anotan cruzan home (+1 y sube el marcador) y el resto
            // avanza. Sin movimiento cada uno queda ya en su base (los que anotaron no se ven) y la cuenta, completa.
            let runs = 0;
            const score = () => {
                runs += 1;
                setRunsIn(runs);
                v.rbiPop.setValue(0);
                go(v.rbiPop, 1, 360, 0, BOUNCE_BIG);
                v.plus.setValue(0);
                go(v.plus, 1, 700, 0, Easing.out(Easing.quad));
                v.scorePop.setValue(0);
                go(v.scorePop, 1, 320, 0, BOUNCE_BIG);
            };
            hitPaths.forEach((path, index) => {
                const legs = legsOf(path);
                const arrive = RUN_START + RUN_LEG * legs;
                if (legs > 0) go(v[`r${index}` as Name], legs, RUN_LEG * legs, RUN_START, Easing.linear);
                if (path.to === 4) {
                    go(v[`g${index}` as Name], 1, 200, arrive);
                    if (!reduce) timers.push(setTimeout(score, arrive));
                } else go(v[`b${path.to}` as Name], 1, 120, arrive);
            });
        } else if (kind === 'hr' && flight !== null) {
            // El batazo de verdad: primero el vuelo sobre el parque y, al caer, el logo, «¡JONRÓN!» y el confeti
            go(v.rays, 1, landAt + 2600, 0, Easing.out(Easing.quad));
            go(v.field, 1, 380, 60);
            go(v.kicker, 1, 300, 120);
            go(v.logo, 1, 650, landAt + 80);
            letters(word(t('anim.hr')), 360, landAt + 300, 55, BOUNCE_BIG);
            go(v.sub, 1, 300, landAt + 800);
        } else if (kind === 'hr') {
            go(v.rays, 1, 3600, 0, Easing.out(Easing.quad));
            go(v.trail, 1, 900, 100, Easing.in(Easing.quad));
            timers.push(setTimeout(() => go(v.trail, 0, 300), 1150));
            go(v.ball, 1, 900, 100, Easing.linear);
            go(v.logo, 1, 700, 850);
            letters(word(t('anim.hr')), 360, 1150, 55, BOUNCE_BIG);
            go(v.kicker, 1, 300, 1000);
            go(v.sub, 1, 300, 1700);
        } else if (kind === 'k') {
            go(v.zone, 1, 700, 380);
            go(v.k, 1, 420, 150, Easing.bezier(0.5, 0, 0.75, 0));
            go(v.shake, 1, 280, 440, Easing.linear);
            go(v.logo, 1, 420, 600);
            go(v.label, 1, 420, 700);
            go(v.sub, 1, 300, 950);
        } else if (kind === 'out' && outPath && event.out) {
            go(v.card, 1, 420);
            go(v.logo, 1, 460, 180);
            go(v.ball, 1, outTotal, 320, Easing.linear);
            outPath.outsAt.forEach((_, index) => {
                const at = 320 + Math.round(((index + outPath.legs.length - outPath.outsAt.length + 1) / outPath.legs.length) * outTotal);
                go(v[`m${index}` as Name], 1, 300, at);
            });
            if (outPath.runner) go(v.runner, 1, 420, 320 + outTotal);
            const outWord = event.out.variant === 'dp' ? t('anim.doublePlay') : event.out.variant === 'tp' ? t('anim.triplePlay') : t('anim.outWord');
            letters(word(outWord.replace(' ', '')), 260, 320 + outTotal, 50, BOUNCE);
            for (let index = 0; index < Math.min(3, event.out.outs); index++) go(v[`d${index}` as Name], 1, 320, 380 + outTotal + index * 80);
            go(v.sub, 1, 260, 420 + outTotal);
        } else if (kind === 'pinchHitter' || kind === 'pinchRunner') {
            go(v.card, 1, 460);
            letters(word(t('anim.sub')), 280, 260, 50);
            go(v.outP, 1, 500, 800);
            go(v.arrows, 1, 600, 700, Easing.bezier(0.6, 0, 0.2, 1));
            go(v.inP, 1, 560, 950);
        } else if (kind === 'win') {
            go(v.wipe, 1, 520, 0, Easing.bezier(0.7, 0, 0.2, 1));
            go(v.logo, 1, 600, 380);
            letters(word(t('anim.win')), 340, 620, 50, BOUNCE);
            go(v.scoreline, 1, 380, 1100);
            go(v.sub, 1, 300, 1350);
        } else if (kind === 'champion') {
            go(v.glow, 1, 1600, 200);
            go(v.trophy, 1, 900, 300, Easing.bezier(0.2, 0.9, 0.3, 1.2));
            go(v.logo, 1, 600, 1050);
            letters(word(t('anim.champions')), 380, 1300, 60, BOUNCE_BIG);
            go(v.kicker, 1, 500, 1900);
            go(v.sub, 1, 400, 2200);
        } else {
            go(v.shutter, 1, 380);
            go(v.panel, 1, 360, 360);
            go(v.nextLogo, 1, 560, 900);
        }

        // Salida (sola al terminar o al tocar)
        const close = () => {
            if (closed) return;
            closed = true;
            const exit = (value: Animated.Value, toValue: number, duration = EXIT, delay = 0) => {
                const animation = Animated.timing(value, { toValue, duration, delay, easing: EASE, useNativeDriver: native });
                running.push(animation);
                animation.start();
            };
            if (reduce) exit(v.stage, 0);
            else if (kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'out' || kind === 'pinchHitter' || kind === 'pinchRunner') exit(v.card, 2);
            else if (kind === 'inning') {
                exit(v.panel, 2, 200);
                exit(v.shutter, 2, EXIT, 120);
            } else exit(v.stage, 0);
            timers.push(setTimeout(() => doneRef.current(), EXIT + 160));
        };
        closeRef.current = close;
        const hold = outPath
            ? HOLD.out + (outPath.legs.length - 1) * LEG_MS
            : flight !== null
              ? landAt + 2900
              : hitPaths.length
                ? Math.max(HOLD[kind], RUN_START + runLegs * RUN_LEG + 1300)
                : HOLD[kind];
        // Con menos movimiento el jonrón sale ya caído: un poco más de tiempo para leer la distancia
        timers.push(setTimeout(close, reduce ? Math.min(hold, flight !== null ? 3200 : 1600) : hold));

        return () => {
            closed = true;
            timers.forEach(clearTimeout);
            running.forEach((animation) => animation.stop());
        };
        // Una animación por jugada
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------------------------------------------------------------- piezas comunes
    const pop = (value: Animated.Value, scales: number[], at: number[], rotate?: string[]) => ({
        opacity: value.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1] }),
        transform: [{ scale: value.interpolate({ inputRange: at, outputRange: scales }) }, ...(rotate ? [{ rotate: value.interpolate({ inputRange: at, outputRange: rotate }) }] : [])]
    });
    const fade = (value: Animated.Value, max = 1) => ({ opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0, max] }) });

    const kicker: TextStyle = { fontFamily: fonts.extrabold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: on, opacity: 0.85 };
    const subStyle: TextStyle = { fontFamily: fonts.semibold, fontSize: 13, color: on };
    const big = (size: number, color = on): TextStyle => ({ fontFamily: fonts.condensed, fontSize: size, lineHeight: size * 0.95, color, includeFontPadding: false });

    /** Letras de la palabra grande, cada una con su entrada */
    const letters = (text: string, size: number, offset = 0, color = on) => (
        <View style={{ flexDirection: 'row' }}>
            {[...text].map((char, index) => {
                const value = letterValues[Math.min(offset + index, letterValues.length - 1)];
                let transform: object[];
                if (kind === 'hr') transform = [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [-size * 1.2, 0] }) }, { scale: value.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) }];
                else if (kind === 'out') transform = [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [2, 1] }) }];
                else if (kind === 'win') transform = [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [size * 0.8, 0] }) }, { rotate: value.interpolate({ inputRange: [0, 1], outputRange: ['6deg', '0deg'] }) }];
                else if (kind === 'champion') transform = [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.9, 0] }) }, { scale: value.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) }];
                else transform = [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [size * 0.6, 0] }) }];
                return (
                    <Animated.Text
                        key={index}
                        style={[
                            big(size, color),
                            kind === 'champion' && Platform.select({ web: { textShadow: '0 4px 12px rgba(0,0,0,0.5)' } as object, default: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 4 } } }),
                            { opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform: transform as never }
                        ]}
                    >
                        {char === ' ' ? ' ' : char}
                    </Animated.Text>
                );
            })}
        </View>
    );

    const cardShadow = Platform.select({ web: { boxShadow: '0 18px 40px rgba(0,0,0,0.35)' }, default: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 40, shadowOffset: { width: 0, height: 18 }, elevation: 12 } }) as object;
    const scoreline = (size: number, color: string) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Badge team={event.away} size={46} pad={6} />
            <Txt style={big(size, color)}>
                {event.away.runs} – {event.home.runs}
            </Txt>
            <Badge team={event.home} size={46} pad={6} />
        </View>
    );

    // ---------------------------------------------------------------- cada jugada
    let body: React.ReactNode;
    if (kind === 'single' || kind === 'double' || kind === 'triple') {
        const drivesIn = rbi > 0 ? t('anim.drivesIn', { count: rbi }) : undefined;
        body = (
            <Animated.View
                style={[
                    styles.card,
                    { top: insets.top + 70, height: 168, backgroundColor: team.color },
                    cardShadow,
                    {
                        opacity: v.card.interpolate({ inputRange: [0, 0.75, 1, 2], outputRange: [0, 1, 1, 0] }),
                        transform: [
                            { translateX: v.card.interpolate({ inputRange: [0, 0.75, 1, 2], outputRange: [W * 1.15, -W * 0.03, 0, -W * 1.15] }) },
                            { skewX: v.card.interpolate({ inputRange: [0, 0.75, 1, 2], outputRange: ['-8deg', '2deg', '0deg', '8deg'] }) }
                        ]
                    }
                ]}
            >
                <Stripes color={on} id={id} />
                <Animated.View style={pop(v.logo, [0, 1.18, 1], [0, 0.7, 1], ['-30deg', '6deg', '0deg'])}>
                    <Badge team={team} size={74} pad={9} />
                </Animated.View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt style={kicker} numberOfLines={1}>
                        {team.abbrev} · {atBat?.batter.name}
                    </Txt>
                    {letters(t(`anim.${kind}`), 74)}
                    <Animated.View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 }, fade(v.sub, 0.9)]}>
                        <Txt style={[subStyle, { flexShrink: 1 }]} numberOfLines={1}>
                            {drivesIn ?? t('anim.vs', { pitcher: atBat?.pitcher.name ?? '' })}
                        </Txt>
                        {/* El marcador del equipo, que sube con cada carrera que entra */}
                        {score && score.after > score.before && (
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: alpha(on, 0.16) }}>
                                <Txt style={[subStyle, { fontFamily: fonts.extrabold }]}>{team.abbrev}</Txt>
                                <Animated.Text style={[big(16), { lineHeight: 18, transform: [{ scale: v.scorePop.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) }] }]}>
                                    {Math.min(score.after, score.before + runsIn)}
                                </Animated.Text>
                            </View>
                        )}
                    </Animated.View>
                </View>
                <View style={{ width: DIAMOND, height: DIAMOND }} accessible={!!drivesIn} accessibilityRole={drivesIn ? 'image' : undefined} accessibilityLabel={drivesIn}>
                    <Svg width={DIAMOND} height={DIAMOND} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
                        <Path d="M50 88 L86 52 L50 16 L14 52 Z" fill="none" stroke={on} strokeOpacity={0.45} strokeWidth={3} />
                    </Svg>
                    {BASES.slice(1).map(([x, y], index) => (
                        <Animated.View
                            key={index}
                            style={{
                                position: 'absolute',
                                left: (x - 8) * k,
                                top: (y - 8) * k,
                                width: 16 * k,
                                height: 16 * k,
                                backgroundColor: on,
                                transform: [{ rotate: '45deg' }],
                                opacity: v[(['b1', 'b2', 'b3'] as const)[index]].interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] })
                            }}
                        />
                    ))}
                    {/* Carreras que entran: el total en el centro del diamante y un «+1» que salta en home */}
                    {scored > 0 && (
                        <Animated.View
                            pointerEvents="none"
                            style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                top: 52 * k - 13,
                                alignItems: 'center',
                                opacity: v.rbiPop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
                                transform: [{ scale: v.rbiPop.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }]
                            }}
                        >
                            <Txt style={[big(26), { lineHeight: 26 }]}>+{runsIn}</Txt>
                        </Animated.View>
                    )}
                    <Animated.View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: 74 * k - 9,
                            alignItems: 'center',
                            opacity: v.plus.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
                            transform: [{ translateY: v.plus.interpolate({ inputRange: [0, 0.3, 1], outputRange: [4, -6, -16] }) }]
                        }}
                    >
                        <Txt size={15} weight="black" color={on} style={{ lineHeight: 18 }}>
                            +1
                        </Txt>
                    </Animated.View>
                    {hitPaths.map((path, index) => {
                        const route = routeOf(path);
                        const [x0, y0] = route[0];
                        const size = path.batter ? 14 : 12;
                        const value = v[`r${index}` as Name];
                        const steps = route.map((_, step) => step);
                        return (
                            <Animated.View
                                key={index}
                                style={{
                                    position: 'absolute',
                                    left: x0 * k - size / 2,
                                    top: y0 * k - size / 2,
                                    width: size,
                                    height: size,
                                    borderRadius: size / 2,
                                    backgroundColor: '#fff',
                                    borderWidth: 2,
                                    borderColor: second,
                                    opacity: path.to === 4 ? v[`g${index}` as Name].interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 1,
                                    transform:
                                        route.length > 1
                                            ? [
                                                  { translateX: value.interpolate({ inputRange: steps, outputRange: route.map(([x]) => (x - x0) * k) }) },
                                                  { translateY: value.interpolate({ inputRange: steps, outputRange: route.map(([, y]) => (y - y0) * k) }) }
                                              ]
                                            : []
                                }}
                            />
                        );
                    })}
                </View>
            </Animated.View>
        );
    } else if (kind === 'hr') {
        const dist = atBat?.pitches.find((pitch) => pitch.hit?.dist)?.hit?.dist ?? null;
        const homeRuns = Math.max(1, rbi);
        const what = homeRuns >= 4 ? t('anim.grandSlam') : homeRuns <= 1 ? t('anim.solo') : t('anim.hrRuns', { count: homeRuns });
        // La curva de la bola en el cuadro de 340×430 de la web, recortado para llenar la pantalla
        const scale = Math.max(W / 340, H / 430);
        const offsetX = (W - 340 * scale) / 2;
        const offsetY = (H - 430 * scale) / 2;
        const samples = Array.from({ length: 21 }, (_, index) => index / 20);
        const points = samples.map(homerPoint);
        // Con el batazo marcado: el parque arriba y la tarjeta más compacta. El campo (360 × 250) cabe a lo ancho y, en
        // pantallas bajas, en el alto que dejan el logo, «¡JONRÓN!», las cifras y el texto (~255 px)
        const flightWidth = Math.round(Math.min(W - 24, 400, Math.max(200, ((H - insets.top - 255) * 360) / 250)));
        body = (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: team.color, alignItems: 'center', justifyContent: 'center', gap: flight !== null ? 4 : 6, paddingTop: insets.top, paddingHorizontal: flight !== null ? 12 : 0, overflow: 'hidden' }]}>
                <Animated.View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: W / 2 - 450,
                        top: H * 0.46 - 450,
                        width: 900,
                        height: 900,
                        opacity: 0.16,
                        transform: [{ rotate: v.rays.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '40deg'] }) }, { scale: v.rays.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]
                    }}
                >
                    <Svg width={900} height={900} viewBox="-450 -450 900 900">
                        {Array.from({ length: 20 }, (_, index) => {
                            const a = (index * 18 * Math.PI) / 180;
                            const b = ((index * 18 + 9) * Math.PI) / 180;
                            return <Path key={index} d={`M0 0 L${450 * Math.sin(a)} ${-450 * Math.cos(a)} L${450 * Math.sin(b)} ${-450 * Math.cos(b)} Z`} fill={on} />;
                        })}
                    </Svg>
                </Animated.View>
                {flight === null && (
                    <>
                        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fade(v.trail, 0.6)]}>
                            <Svg width={W} height={H} viewBox="0 0 340 430" preserveAspectRatio="xMidYMid slice">
                                <Path d="M30 400 Q 150 -60 330 70" fill="none" stroke={on} strokeWidth={4} strokeLinecap="round" strokeDasharray="6 10" />
                            </Svg>
                        </Animated.View>
                        <Animated.View
                            pointerEvents="none"
                            style={{
                                position: 'absolute',
                                left: -11 * scale,
                                top: -11 * scale,
                                width: 22 * scale,
                                height: 22 * scale,
                                borderRadius: 11 * scale,
                                backgroundColor: '#fff',
                                borderWidth: 2,
                                borderColor: second,
                                transform: [
                                    { translateX: v.ball.interpolate({ inputRange: samples, outputRange: points.map(([x]) => offsetX + x * scale) }) },
                                    { translateY: v.ball.interpolate({ inputRange: samples, outputRange: points.map(([, y]) => offsetY + y * scale) }) }
                                ]
                            }}
                        />
                    </>
                )}
                <Animated.Text style={[kicker, fade(v.kicker, 0.85)]} numberOfLines={1}>
                    {team.abbrev} · {atBat?.batter.name}
                </Animated.Text>
                {flight !== null && (
                    <Animated.View
                        style={{
                            opacity: v.field,
                            transform: [{ translateY: v.field.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: v.field.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }]
                        }}
                    >
                        <HomeRunFlight atBat={atBat} venue={event.venue} color={team.color} ink={on} accent={second} delay={FLIGHT_DELAY} reduce={reduce} bases={event.bases ?? null} scored={scored} width={flightWidth} />
                    </Animated.View>
                )}
                <Animated.View style={{ opacity: v.logo.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }), transform: [{ scale: v.logo.interpolate({ inputRange: [0, 0.6, 0.8, 1], outputRange: [0, 1.25, 0.95, 1] }) }] }}>
                    {flight !== null ? <Badge team={team} size={84} pad={10} ring /> : <Badge team={team} size={132} pad={14} ring />}
                </Animated.View>
                {letters(t('anim.hr'), flight !== null ? 62 : 78)}
                <Animated.Text style={[subStyle, fade(v.sub, 0.9)]}>{dist && dist > 200 ? `${what} · ${t('anim.feet', { ft: dist })}` : what}</Animated.Text>
                {!reduce && <Confetti width={W} height={H} colors={[team.color, second, '#ffffff']} bursts={[{ at: flight !== null ? landAt + 250 : 1150, count: 70 }]} />}
            </View>
        );
    } else if (kind === 'k') {
        const lastPitch = atBat?.pitches[atBat.pitches.length - 1];
        const looking = lastPitch?.code === 'C';
        body = (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0e13', overflow: 'hidden' }]}>
                <Animated.View
                    style={[
                        StyleSheet.absoluteFill,
                        { alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: insets.top },
                        {
                            transform: [
                                { translateX: v.shake.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -6, 5, -3, 0] }) },
                                { translateY: v.shake.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 3, -3, 2, 0] }) }
                            ]
                        }
                    ]}
                >
                    {/* Zona de strike de fondo en el color del equipo */}
                    <Animated.View
                        style={{
                            position: 'absolute',
                            left: W / 2 - 85,
                            top: insets.top + (H - insets.top) / 2 - 126,
                            width: 170,
                            height: 220,
                            borderWidth: 4,
                            borderColor: team.color,
                            borderRadius: 6,
                            opacity: v.zone.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.9, 0.35] }),
                            transform: [{ scale: v.zone.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.3, 1, 1] }) }]
                        }}
                    >
                        {[1, 2].map((step) => (
                            <React.Fragment key={step}>
                                <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${(step * 100) / 3}%`, width: 2, backgroundColor: team.color }} />
                                <View style={{ position: 'absolute', left: 0, right: 0, top: `${(step * 100) / 3}%`, height: 2, backgroundColor: team.color }} />
                            </React.Fragment>
                        ))}
                    </Animated.View>
                    {/* Ponche cantado: la K al revés, como en la libreta de anotación */}
                    <View style={looking ? { transform: [{ scaleX: -1 }] } : undefined}>
                        <Animated.Text
                            style={[
                                big(210, team.color),
                                { lineHeight: 190 },
                                Platform.select({ web: { textShadow: '0 0 40px rgba(0,0,0,0.6)' } as object, default: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 40 } }),
                                {
                                    opacity: v.k.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1, 1] }),
                                    transform: [{ scale: v.k.interpolate({ inputRange: [0, 0.7, 1], outputRange: [3.2, 0.92, 1] }) }, { rotate: v.k.interpolate({ inputRange: [0, 0.7, 1], outputRange: ['-14deg', '2deg', '0deg'] }) }]
                                }
                            ]}
                        >
                            K
                        </Animated.Text>
                    </View>
                    <Animated.Text style={[big(34, '#fff'), { letterSpacing: 2.7, opacity: v.label, transform: [{ scaleX: v.label.interpolate({ inputRange: [0, 1], outputRange: [1.35, 1] }) }] }]}>
                        {looking ? t('anim.kLooking') : t('anim.k')}
                    </Animated.Text>
                    <Animated.Text style={[subStyle, { color: '#fff', paddingHorizontal: 24, textAlign: 'center' }, fade(v.sub, 0.85)]}>
                        {t('anim.kSub', { pitcher: atBat?.pitcher.name ?? '', batter: lastName(atBat?.batter.name ?? ''), count: event.strikeouts ?? 1 })}
                    </Animated.Text>
                </Animated.View>
                <Animated.View style={{ position: 'absolute', top: insets.top + 22, left: 22, transform: [{ translateX: v.logo.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) }] }}>
                    <Badge team={team} size={64} pad={8} />
                </Animated.View>
            </View>
        );
    } else if (kind === 'out' && event.out && outPath) {
        const { variant, outs } = event.out;
        const outWord = variant === 'dp' ? t('anim.doublePlay') : variant === 'tp' ? t('anim.triplePlay') : t('anim.outWord');
        const twoLines = variant === 'dp' || variant === 'tp';
        const frames = outPath.legs.flatMap((leg, legIndex) => leg.slice(legIndex ? 1 : 0));
        const input = frames.map((_, index) => index / (frames.length - 1));
        // Cada renglón de la palabra sigue la numeración de letras del anterior (para la entrada escalonada)
        const lines = outWord.split(' ').map((line, index, all) => ({ line, offset: all.slice(0, index).join('').length }));
        body = (
            <Animated.View
                style={[
                    styles.card,
                    { top: insets.top + 70, height: 168, backgroundColor: team.color },
                    cardShadow,
                    {
                        opacity: v.card.interpolate({ inputRange: [0, 0.75, 1, 2], outputRange: [0, 1, 1, 0] }),
                        transform: [
                            { translateX: v.card.interpolate({ inputRange: [0, 0.75, 1, 2], outputRange: [-W * 1.15, W * 0.03, 0, W * 1.15] }) },
                            { skewX: v.card.interpolate({ inputRange: [0, 0.75, 1, 2], outputRange: ['8deg', '-2deg', '0deg', '-8deg'] }) }
                        ]
                    }
                ]}
            >
                <Stripes color={on} id={id} />
                <Animated.View style={pop(v.logo, [0, 1.15, 1], [0, 0.7, 1])}>
                    <Badge team={team} size={64} pad={8} />
                </Animated.View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt style={kicker} numberOfLines={1}>
                        {team.abbrev} · {t(`anim.outType.${variant}`)}
                    </Txt>
                    {/* «DOBLE PLAY» y «TRIPLE PLAY» en dos renglones para no tapar el cuadro */}
                    {lines.map(({ line, offset }, index) => (
                        <React.Fragment key={index}>{letters(line, twoLines ? 40 : 74, offset)}</React.Fragment>
                    ))}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Animated.Text style={[subStyle, { flexShrink: 1 }, fade(v.sub, 0.9)]} numberOfLines={1}>
                            {atBat?.batter.name}
                        </Animated.Text>
                        <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={t('anim.outsCount', { count: outs })}>
                            {[1, 2, 3].map((n) => (
                                <Animated.View
                                    key={n}
                                    style={[
                                        { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: on, backgroundColor: n <= outs ? on : 'transparent', opacity: n <= outs ? 1 : 0.7 },
                                        n <= outs && { transform: [{ scale: v[`d${n - 1}` as Name].interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.3, 1.3, 1] }) }] }
                                    ]}
                                />
                            ))}
                        </View>
                    </View>
                </View>
                <View style={{ width: DIAMOND, height: DIAMOND }}>
                    <Svg width={DIAMOND} height={DIAMOND} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
                        <Path d="M50 88 L86 52 L50 16 L14 52 Z" fill="none" stroke={on} strokeOpacity={0.45} strokeWidth={3} />
                        {[
                            [86, 52],
                            [50, 16],
                            [14, 52]
                        ].map(([x, y]) => (
                            <Rect key={`${x}${y}`} x={x - 7} y={y - 7} width={14} height={14} transform={`rotate(45 ${x} ${y})`} fill={on} fillOpacity={0.3} />
                        ))}
                    </Svg>
                    {outPath.runner && (
                        <Animated.View
                            style={{
                                position: 'absolute',
                                left: outPath.runner[0][0] * k - 6,
                                top: outPath.runner[0][1] * k - 6,
                                width: 12,
                                height: 12,
                                borderRadius: 6,
                                backgroundColor: on,
                                transform: [
                                    { translateX: v.runner.interpolate({ inputRange: [0, 1], outputRange: [0, (outPath.runner[1][0] - outPath.runner[0][0]) * k] }) },
                                    { translateY: v.runner.interpolate({ inputRange: [0, 1], outputRange: [0, (outPath.runner[1][1] - outPath.runner[0][1]) * k] }) }
                                ]
                            }}
                        />
                    )}
                    {outPath.outsAt.map(([x, y], index) => (
                        <Animated.View key={index} style={[{ position: 'absolute', left: x * k - 12, top: y * k - 12, width: 24, height: 24 }, pop(v[`m${index}` as Name], [0, 1.3, 1], [0, 0.6, 1])]}>
                            <Svg width={24} height={24} viewBox="-13 -13 26 26">
                                <Circle r={13} fill="#fff" />
                                <Path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke={team.color} strokeWidth={4.5} strokeLinecap="round" />
                            </Svg>
                        </Animated.View>
                    ))}
                    <Animated.View
                        style={{
                            position: 'absolute',
                            left: 50 * k - 5,
                            top: 88 * k - 5,
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: '#fff',
                            borderWidth: 1.5,
                            borderColor: second,
                            transform: [
                                { translateX: v.ball.interpolate({ inputRange: input, outputRange: frames.map(([x]) => (x - 50) * k) }) },
                                { translateY: v.ball.interpolate({ inputRange: input, outputRange: frames.map(([, y]) => (y - 88) * k) }) },
                                { scale: v.ball.interpolate({ inputRange: input, outputRange: frames.map(([, , size]) => size) }) }
                            ]
                        }}
                    />
                </View>
            </Animated.View>
        );
    } else if (kind === 'pinchHitter' || kind === 'pinchRunner') {
        const person = (who: { id: number | null; name: string } | null, label: string, style: object) =>
            who && (
                <Animated.View style={[{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }, style]}>
                    <PlayerPhoto personId={who.id} name={who.name} size={64} background="rgba(255,255,255,0.9)" team={team} />
                    <Txt size={10} weight="extrabold" color={on} style={{ letterSpacing: 1.4, textTransform: 'uppercase', opacity: 0.8 }}>
                        {label}
                    </Txt>
                    <Txt size={14} weight="bold" color={on} numberOfLines={1} center style={{ maxWidth: 120 }}>
                        {who.name}
                    </Txt>
                </Animated.View>
            );
        body = (
            <Animated.View
                style={[
                    styles.card,
                    { top: insets.top + 64, flexDirection: 'column', alignItems: 'stretch', gap: 12, paddingTop: 16, paddingBottom: 18, paddingHorizontal: 16, backgroundColor: team.color },
                    cardShadow,
                    {
                        opacity: v.card.interpolate({ inputRange: [0, 0.75, 1, 2], outputRange: [0, 1, 1, 0] }),
                        transform: [{ translateY: v.card.interpolate({ inputRange: [0, 0.75, 1, 2], outputRange: [-300, 10, 0, -300] }) }]
                    }
                ]}
            >
                <Stripes color={on} id={id} />
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt style={kicker} numberOfLines={1}>
                            {team.abbrev} · {t(kind === 'pinchHitter' ? 'anim.pinchHitter' : 'anim.pinchRunner')}
                        </Txt>
                        {letters(t('anim.sub'), 54)}
                    </View>
                    <Badge team={team} size={48} pad={6} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {person(event.sub?.out ?? null, t('anim.out'), {
                        opacity: v.outP.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }),
                        transform: [{ translateX: v.outP.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }, { scale: v.outP.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }]
                    })}
                    <Animated.View style={{ transform: [{ rotate: v.arrows.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
                        <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={on} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M4 9h14l-4-4M20 15H6l4 4" />
                        </Svg>
                    </Animated.View>
                    {person(event.sub?.in ?? null, t('anim.in'), {
                        opacity: v.inP.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1, 1] }),
                        transform: [{ translateX: v.inP.interpolate({ inputRange: [0, 0.7, 1], outputRange: [70, -4, 0] }) }, { scale: v.inP.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 1.08, 1] }) }]
                    })}
                </View>
            </Animated.View>
        );
    } else if (kind === 'win') {
        // La cortina entra desde la izquierda y su contenido se queda quieto (como el clip-path de la web)
        body = (
            <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden', transform: [{ translateX: v.wipe.interpolate({ inputRange: [0, 1], outputRange: [-W, 0] }) }] }]}>
                <Animated.View
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: team.color, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: insets.top, transform: [{ translateX: v.wipe.interpolate({ inputRange: [0, 1], outputRange: [W, 0] }) }] }
                    ]}
                >
                    <Stripes color={on} id={id} />
                    <Txt style={kicker}>{t('anim.final')}</Txt>
                    <Animated.View style={pop(v.logo, [0, 1.2, 1], [0, 0.7, 1], ['-20deg', '4deg', '0deg'])}>
                        <Badge team={team} size={104} pad={12} />
                    </Animated.View>
                    {letters(t('anim.win'), 76)}
                    <Animated.View style={{ opacity: v.scoreline, transform: [{ translateY: v.scoreline.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>{scoreline(40, on)}</Animated.View>
                    <Animated.Text style={[subStyle, fade(v.sub, 0.9)]}>
                        {event.seriesRecord ? t('anim.seriesLead', { team: team.name, wins: event.seriesRecord.wins, losses: event.seriesRecord.losses }) : team.name}
                    </Animated.Text>
                </Animated.View>
                {!reduce && <Confetti width={W} height={H} colors={[team.color, second, '#ffffff']} bursts={[{ at: 700, count: 50 }]} />}
            </Animated.View>
        );
    } else if (kind === 'champion') {
        const colorsList = [team.color, second, '#f2c14e', '#ffe08a', '#ffffff'];
        const bursts: Burst[] = [
            { at: 1250, count: 60, rain: true },
            { at: 2700, count: 50, rain: true },
            { at: 4100, count: 50, rain: true }
        ];
        body = (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0b0c10', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: insets.top, overflow: 'hidden' }]}>
                <Animated.View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: W / 2 - 260,
                        top: H * 0.4 - 260,
                        width: 520,
                        height: 520,
                        opacity: v.glow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.9, 0.7] }),
                        transform: [{ scale: v.glow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.1, 1] }) }]
                    }}
                >
                    <Svg width={520} height={520}>
                        <Defs>
                            <RadialGradient id={`gl${id}`} cx="50%" cy="50%" r="50%">
                                <Stop offset="0" stopColor={team.color} stopOpacity={1} />
                                <Stop offset="0.62" stopColor={team.color} stopOpacity={0} />
                            </RadialGradient>
                        </Defs>
                        <Circle cx={260} cy={260} r={260} fill={`url(#gl${id})`} />
                    </Svg>
                </Animated.View>
                <Animated.View
                    style={{
                        width: 150,
                        height: 150,
                        opacity: v.trophy.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0, 1, 1] }),
                        transform: [{ translateY: v.trophy.interpolate({ inputRange: [0, 0.75, 1], outputRange: [90, -6, 0] }) }, { scale: v.trophy.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.6, 1.04, 1] }) }]
                    }}
                >
                    <Svg width={150} height={150} viewBox="0 0 120 120">
                        <Defs>
                            <LinearGradient id={`gd${id}`} x1="0" y1="0" x2="1" y2="1">
                                <Stop offset="0" stopColor="#ffe08a" />
                                <Stop offset="0.5" stopColor="#f2c14e" />
                                <Stop offset="1" stopColor="#c8901f" />
                            </LinearGradient>
                        </Defs>
                        <G>
                            <Path d="M32 14 L32 20 Q12 20 14 38 Q16 52 34 54" fill="none" stroke={`url(#gd${id})`} strokeWidth={6} strokeLinecap="round" />
                            <Path d="M88 14 L88 20 Q108 20 106 38 Q104 52 86 54" fill="none" stroke={`url(#gd${id})`} strokeWidth={6} strokeLinecap="round" />
                            <Path d="M28 10 H92 V38 Q92 70 60 74 Q28 70 28 38 Z" fill={`url(#gd${id})`} />
                            <Rect x={53} y={73} width={14} height={16} fill={`url(#gd${id})`} />
                            <Rect x={38} y={88} width={44} height={9} rx={3} fill={`url(#gd${id})`} />
                            <Rect x={30} y={97} width={60} height={13} rx={4} fill="#c8901f" />
                        </G>
                    </Svg>
                    <Animated.View style={[{ position: 'absolute', left: 75 - 31, top: 14 }, pop(v.logo, [0, 1.3, 1], [0, 0.6, 1])]}>
                        <Badge team={team} size={62} pad={7} />
                    </Animated.View>
                </Animated.View>
                {letters(t('anim.champions'), 68, 0, '#f2c14e')}
                <Animated.Text style={[kicker, { color: '#fff' }, fade(v.kicker, 0.9)]}>{t(`anim.championOf.${event.league ?? 'lidom'}`)}</Animated.Text>
                <Animated.Text style={[subStyle, { color: '#fff' }, fade(v.sub, 0.9)]}>
                    {event.seriesRecord ? t('anim.seriesWon', { team: team.name, wins: event.seriesRecord.wins, losses: event.seriesRecord.losses }) : team.name}
                </Animated.Text>
                {!reduce && <Confetti width={W} height={H} colors={colorsList} bursts={bursts} />}
            </View>
        );
    } else {
        const half = event.inning?.isTop ? 'top' : 'bottom';
        body = (
            <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
                <Animated.View
                    style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: W / 2, backgroundColor: rival.color, transform: [{ translateX: v.shutter.interpolate({ inputRange: [0, 1, 2], outputRange: [-W / 2, 0, -W / 2] }) }] }}
                />
                <Animated.View
                    style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: W / 2, backgroundColor: team.color, transform: [{ translateX: v.shutter.interpolate({ inputRange: [0, 1, 2], outputRange: [W / 2, 0, W / 2] }) }] }}
                />
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingTop: insets.top }]}>
                    <Animated.View
                        style={{
                            backgroundColor: 'rgba(0,0,0,0.55)',
                            borderRadius: 26,
                            paddingVertical: 18,
                            paddingHorizontal: 22,
                            alignItems: 'center',
                            gap: 10,
                            opacity: v.panel.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
                            transform: [{ scale: v.panel.interpolate({ inputRange: [0, 1, 2], outputRange: [0.8, 1, 1] }) }]
                        }}
                    >
                        <Txt style={[kicker, { color: '#fff' }]}>{t(`anim.inningEnd_${half}`, { n: event.inning?.n ?? '' })}</Txt>
                        {scoreline(48, '#fff')}
                        <Txt style={[kicker, { color: '#fff' }]}>{t('anim.nowBatting')}</Txt>
                        <Animated.View
                            style={{
                                opacity: v.nextLogo.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1, 1] }),
                                transform: [{ translateY: v.nextLogo.interpolate({ inputRange: [0, 0.7, 1], outputRange: [30, -8, 0] }) }, { scale: v.nextLogo.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.4, 1.1, 1] }) }]
                            }}
                        >
                            <Badge team={team} size={96} pad={11} />
                        </Animated.View>
                        <Txt size={18} weight="extrabold" tone="white">
                            {team.name}
                        </Txt>
                    </Animated.View>
                </View>
            </View>
        );
    }

    return (
        <View pointerEvents="box-none" style={styles.root} accessibilityLiveRegion="polite">
            <Animated.View style={{ width: W, height: H, opacity: v.stage }}>
                <Pressable onPress={() => closeRef.current()} accessibilityLabel={t('anim.close')} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
                    {body}
                </Pressable>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 45, elevation: 45, alignItems: 'center' },
    card: { position: 'absolute', left: 10, right: 10, borderRadius: 26, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }
});
