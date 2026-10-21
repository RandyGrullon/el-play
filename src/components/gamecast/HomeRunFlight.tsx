import React, { useEffect, useId, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Extrapolation, cancelAnimation, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { AtBat } from '../../types';
import { camera, flightMs, flightOf, groundAt, heightAt, parkFor, polar, wallAt, wallCrossing, type Flight } from '../../lib/flight';
import { legsOf, runnerPaths, type Bases } from '../../lib/runners';
import { alpha, fonts } from '../../theme/tokens';
import { Txt } from '../ui';

// El jonrón visto desde detrás de home, como en la transmisión (calcado de la web): el parque a escala (con sus medidas
// cuando MLB las da), la bola que sale hacia donde la sacó el bateador, sube según el ángulo de salida, pasa la cerca y
// cae en el punto que marcó MLB, con la estela, la sombra en el piso y la velocidad, el ángulo y la distancia contando.
// Al caer, los corredores y el bateador trotan las bases y cada uno que pisa home suma a «Remolca».
// Todo va por tiempo con un solo reloj de Reanimated (ms desde que aparece) y cada pieza interpola su momento; el campo
// es un SVG fijo y lo que se mueve son vistas encima (más liviano en el teléfono). Con «Reducir movimiento» el reloj
// arranca en el final: la bola ya caída, la estela completa y las cifras finales.

// Caja del dibujo (la de la web): el ancho real lo da quien lo usa y todo se escala
const W = 360;
const H = 250;
const STEP = 1.5;
// Después de caer la bola, los corredores y el bateador trotan las bases (420 ms por base) y cada uno que pisa home suma
const TROT_LEG = 420;
const TROT_PAUSE = 250;
const BASE_FT = [
    { x: 0, y: 0 },
    { x: 63.6, y: 63.6 },
    { x: 0, y: 127.3 },
    { x: -63.6, y: 63.6 }
];
// Muestras del vuelo por tiempo (la bola, su sombra y la cámara) y de la estela por recorrido
const SAMPLES = 60;
const TRAIL = 90;
// Tiempos de las piezas sueltas (ms): destello al salir, la cerca al pasarla, la marca al caer, sus anillos y el «+1»
const BURST_MS = 500;
const FLASH_MS = 650;
const LANDING_MS = 320;
const RING_MS = 900;
const RING_GAP = 260;
const PLUS_MS = 700;
// Radio más grande de la bola (cerca de la cámara): las vistas se dibujan a ese tamaño y se encogen con la distancia
const BALL_MAX = 8;

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
    atBat: AtBat | null;
    venue?: string;
    /** Color del equipo, tinta sobre ese color y acento (estela, cerca) */
    color: string;
    ink: string;
    accent: string;
    /** Cuándo sale el batazo (ms desde que aparece) */
    delay: number;
    reduce: boolean;
    /** Quién estaba en base (null si no se sabe) y cuántas carreras entraron */
    bases?: Bases | null;
    scored: number;
    /** Ancho en px (el alto sale de la proporción del dibujo) */
    width: number;
}

type Point = { x: number; y: number };

const pts = (list: Point[]) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
const line = (list: Point[]) => `M${list.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`;

/** Inversa de groundAt: en qué parte del tiempo (0-1) la bola lleva recorrida la parte `s` de la distancia */
const timeAtGround = (s: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, s)), 1 / 1.35);

/** Salida suave (el «ease-out» de la web) para las piezas sueltas */
const easeOut = (p: number) => {
    'worklet';
    const q = Math.max(0, Math.min(1, p));
    return 1 - (1 - q) * (1 - q) * (1 - q);
};

/** Un recorrido por tiempo: en cada instante `times[i]` está en (xs[i], ys[i]); interpolate necesita dos puntos */
interface Track {
    times: number[];
    xs: number[];
    ys: number[];
}
const steady = (track: Track): Track => (track.times.length > 1 ? track : { times: [0, 1], xs: [track.xs[0] ?? 0, track.xs[0] ?? 0], ys: [track.ys[0] ?? 0, track.ys[0] ?? 0] });

/** El parque, fijo: césped, tierra del cuadro, bases, líneas de foul, cerca con su alto, gradas y medidas */
const Park: React.FC<{ field: ReturnType<typeof parkArt>; width: number; height: number; ink: string; gradient: string }> = React.memo(({ field, width, height, ink, gradient }) => {
    const home = field.home;
    return (
        <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
            <Defs>
                <LinearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={ink} stopOpacity={0.2} />
                    <Stop offset="1" stopColor={ink} stopOpacity={0.07} />
                </LinearGradient>
            </Defs>
            <Polygon points={field.stands} fill={ink} fillOpacity={0.1} />
            <Polygon points={field.fair} fill={`url(#${gradient})`} />
            {field.stripes.map((stripe, index) => (
                <Polygon key={index} points={stripe} fill={ink} fillOpacity={0.05} />
            ))}
            <Polygon points={field.dirt} fill={ink} fillOpacity={0.14} />
            <Polygon points={field.grassInner} fill={ink} fillOpacity={0.08} />
            {field.lines.map((end, index) => (
                <Line key={index} x1={home.x} y1={home.y} x2={end.x} y2={end.y} stroke={ink} strokeOpacity={0.55} strokeWidth={1.1} />
            ))}
            <Polygon points={field.wall} fill={ink} fillOpacity={0.3} />
            <Path d={field.wallTop} fill="none" stroke={ink} strokeOpacity={0.85} strokeWidth={1.4} />
            {field.poles.map(([bottom, top], index) => (
                <Line key={index} x1={bottom.x} y1={bottom.y} x2={top.x} y2={top.y} stroke={ink} strokeOpacity={0.9} strokeWidth={1.6} strokeLinecap="round" />
            ))}
            {field.marks.map((mark) => (
                <SvgText key={`${mark.d}-${mark.x}`} x={mark.x} y={mark.y} textAnchor="middle" fontSize={9} fontFamily={fonts.extrabold} fill={ink} fillOpacity={0.8}>
                    {mark.d}
                </SvgText>
            ))}
            <Circle cx={field.mound.x} cy={field.mound.y} r={2.6} fill={ink} fillOpacity={0.3} />
            {field.bases.map((base, index) => (
                <Rect key={index} x={base.x - 2.2} y={base.y - 1.2} width={4.4} height={2.4} fill={ink} fillOpacity={0.9} />
            ))}
            <Path d={`M${home.x - 3} ${home.y - 1} L${home.x + 3} ${home.y - 1} L${home.x + 3} ${home.y + 1} L${home.x} ${home.y + 2.4} L${home.x - 3} ${home.y + 1} Z`} fill={ink} />
        </Svg>
    );
});
Park.displayName = 'Park';

/** Geometría fija del parque en la caja de 360 × 250 */
const parkArt = (park: ReturnType<typeof parkFor>, project: ReturnType<typeof camera>) => {
    const angles: number[] = [];
    for (let a = -45; a <= 45.001; a += STEP) angles.push(a);
    const wallBottom = angles.map((a) => {
        const p = polar(a, wallAt(park, a));
        return project(p.x, p.y, 0);
    });
    const wallTop = angles.map((a) => {
        const p = polar(a, wallAt(park, a));
        return project(p.x, p.y, park.wall);
    });
    const standsTop = angles.map((a) => {
        const p = polar(a, wallAt(park, a) + 70);
        return project(p.x, p.y, 38);
    });
    const home = project(0, 0, 0);
    // Grama cortada en franjas, como en los parques (una cuña sí y otra no)
    const stripes: string[] = [];
    for (let a = -45; a < 45; a += 15) {
        const wedge = [home];
        for (let b = a; b <= a + 7.5 + 0.001; b += STEP) {
            const p = polar(b, wallAt(park, b));
            wedge.push(project(p.x, p.y, 0));
        }
        stripes.push(pts(wedge));
    }
    // Tierra del cuadro: arco de 95 pies desde el montículo, de línea a línea
    const dirt = [home, project(90.2, 90.2)];
    for (let phi = 18.2; phi <= 161.8; phi += 6) dirt.push(project(95 * Math.cos((phi * Math.PI) / 180), 60.5 + 95 * Math.sin((phi * Math.PI) / 180)));
    dirt.push(project(-90.2, 90.2));
    const bases = [project(63.6, 63.6), project(0, 127.3), project(-63.6, 63.6)];
    const grassInner = [project(0, 6), project(58, 63.6), project(0, 121), project(-58, 63.6)];
    const poleL = polar(-45, park.left);
    const poleR = polar(45, park.right);
    const marks = park.known
        ? [
              { a: -45, d: park.left },
              { a: 0, d: park.center },
              { a: 45, d: park.right }
          ].map(({ a, d }) => {
              const p = polar(a, d);
              return { ...project(p.x, p.y, park.wall + 9), d };
          })
        : [];
    return {
        stripes,
        fair: pts([home, ...wallBottom]),
        wall: pts([...wallBottom, ...[...wallTop].reverse()]),
        wallTop: line(wallTop),
        stands: pts([...wallTop, ...[...standsTop].reverse()]),
        dirt: pts(dirt),
        grassInner: pts(grassInner),
        bases,
        home,
        mound: project(0, 60.5),
        lines: [project(poleL.x, poleL.y), project(poleR.x, poleR.y)],
        poles: [
            [project(poleL.x, poleL.y, 0), project(poleL.x, poleL.y, 45)],
            [project(poleR.x, poleR.y, 0), project(poleR.x, poleR.y, 45)]
        ] as [Point, Point][],
        marks
    };
};

/** Todo lo que se mueve, precalculado: muestras por tiempo (ms desde que aparece) en la caja de 360 × 250 */
const flightScript = (flight: Flight, park: ReturnType<typeof parkFor>, project: ReturnType<typeof camera>, delay: number, trot: ReturnType<typeof runnerPaths>) => {
    const ms = flightMs(flight);
    const homeDepth = project(0, 0, 0).depth;
    const radius = (depth: number) => Math.max(2.4, Math.min(BALL_MAX, (7 * homeDepth) / depth));
    const at = (s: number) => {
        const ground = { x: flight.land.x * s, y: flight.land.y * s };
        const z = heightAt(flight, s);
        return { air: project(ground.x, ground.y, z), floor: project(ground.x, ground.y, 0), z };
    };

    // La estela entera (por recorrido) y cuánto mide hasta cada punto, para irla mostrando con el trazo
    const trailPoints: Point[] = [];
    const trailLength: number[] = [];
    for (let j = 0; j <= TRAIL; j++) {
        const point = at(j / TRAIL).air;
        const previous = trailPoints[j - 1];
        trailLength.push(previous ? trailLength[j - 1] + Math.hypot(point.x - previous.x, point.y - previous.y) : 0);
        trailPoints.push(point);
    }
    const lengthAt = (s: number) => {
        const position = Math.max(0, Math.min(1, s)) * TRAIL;
        const index = Math.min(TRAIL - 1, Math.floor(position));
        return trailLength[index] + (trailLength[index + 1] - trailLength[index]) * (position - index);
    };

    // La bola, su sombra en el piso y la cámara (se acerca un poco hacia donde va a caer) en cada instante
    const land = project(flight.land.x, flight.land.y, 0);
    const times: number[] = [];
    const ball = { x: [] as number[], y: [] as number[], r: [] as number[] };
    const shadow = { x: [] as number[], y: [] as number[], r: [] as number[], opacity: [] as number[] };
    const zoom: number[] = [];
    const visible: number[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
        const time = i / SAMPLES;
        const s = groundAt(time);
        const { air, floor, z } = at(s);
        times.push(delay + time * ms);
        ball.x.push(air.x);
        ball.y.push(air.y);
        ball.r.push(radius(air.depth));
        shadow.x.push(floor.x);
        shadow.y.push(floor.y);
        shadow.r.push(radius(floor.depth));
        shadow.opacity.push(0.42 - 0.3 * Math.min(1, z / Math.max(1, flight.apex)));
        zoom.push(1 + 0.07 * s);
        visible.push(lengthAt(s));
    }

    // La cerca en la dirección del batazo, que se ilumina cuando la bola la pasa
    const crossing = wallCrossing(flight, park);
    const span: Point[] = [];
    for (let a = flight.deg - 7; a <= flight.deg + 7; a += 1) {
        const p = polar(a, wallAt(park, a));
        span.push(project(p.x, p.y, park.wall));
    }

    // El trote: todos salen a la vez un respiro después de caer la bola, base a base
    const landAt = delay + ms;
    const trotStart = landAt + TROT_PAUSE;
    const runners = trot.map((path) => {
        const legs = legsOf(path);
        const points = Array.from({ length: legs + 1 }, (_, k) => {
            const base = BASE_FT[(path.from + k) % 4];
            return project(base.x, base.y, 0);
        });
        return { batter: path.batter, scores: path.to === 4, arrive: trotStart + legs * TROT_LEG, track: { times: points.map((_, k) => trotStart + k * TROT_LEG), xs: points.map((p) => p.x), ys: points.map((p) => p.y) } };
    });
    const scoreTimes = runners
        .filter((runner) => runner.scores)
        .map((runner) => runner.arrive)
        .sort((a, b) => a - b);
    const trotEnd = runners.reduce((end, runner) => Math.max(end, runner.arrive), trotStart);
    const crossAt = crossing !== null ? delay + timeAtGround(crossing) * ms : null;
    const end = Math.max(landAt + RING_GAP + 2 * RING_MS, trotEnd + PLUS_MS, crossAt !== null ? crossAt + FLASH_MS : 0) + 50;

    return { ms, landAt, end, times, ball, shadow, zoom, visible, trail: line(trailPoints), trailTotal: trailLength[TRAIL], land, wallSpan: line(span), crossAt, runners, scoreTimes, home: project(0, 0, 0) };
};

type Script = ReturnType<typeof flightScript>;

export const HomeRunFlight: React.FC<Props> = ({ atBat, venue, color, ink, accent, delay, reduce, bases = null, scored, width }) => {
    const { t } = useTranslation();
    const gradient = `hrf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
    const flight = useMemo(() => flightOf(atBat), [atBat]);
    const park = useMemo(() => parkFor(venue), [venue]);
    const project = useMemo(() => camera(park, W, H), [park]);
    // Los que anotan: los que estaban en base y el bateador (en el jonrón entran todos)
    const trot = useMemo(() => runnerPaths('hr', bases, Math.max(1, scored)), [bases, scored]);
    const field = useMemo(() => parkArt(park, project), [park, project]);
    const script = useMemo(() => (flight ? flightScript(flight, park, project, delay, trot) : null), [flight, park, project, delay, trot]);

    if (!flight || !script) return null;
    const height = (width * H) / W;
    const label = t('anim.flightLabel', { ft: Math.round(flight.dist), dir: t(flight.deg < -15 ? 'anim.toLeft' : flight.deg > 15 ? 'anim.toRight' : 'anim.toCenter') });

    return (
        <View style={{ width }}>
            <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width, height }}>
                <Scene script={script} field={field} flight={flight} width={width} height={height} color={color} ink={ink} accent={accent} reduce={reduce} gradient={gradient} />
            </View>
            <Chips flight={flight} script={script} delay={delay} reduce={reduce} ink={ink} />
        </View>
    );
};

/** Cuánto dura el vuelo (para que la tarjeta espere a que caiga); null si no hay batazo marcado */
export const homeRunFlightMs = (atBat: AtBat | null) => {
    const flight = flightOf(atBat);
    return flight ? flightMs(flight) : null;
};

// ---------------------------------------------------------------- la escena

interface SceneProps {
    script: Script;
    field: ReturnType<typeof parkArt>;
    flight: Flight;
    width: number;
    height: number;
    color: string;
    ink: string;
    accent: string;
    reduce: boolean;
    gradient: string;
}

const Scene: React.FC<SceneProps> = ({ script, field, flight, width, height, color, ink, accent, reduce, gradient }) => {
    const { t } = useTranslation();
    const f = width / W;
    const { times, ball, shadow, zoom, visible, trailTotal, land, landAt, crossAt, scoreTimes, end, home } = script;
    // El reloj de la escena: de 0 al final en ms (sin movimiento, ya en el final)
    const clock = useSharedValue(reduce ? end + 1 : 0);
    useEffect(() => {
        if (reduce) return;
        clock.set(withTiming(end, { duration: end, easing: Easing.linear }));
        return () => cancelAnimation(clock);
    }, [clock, end, reduce]);

    // Cámara: escala hacia el punto donde cae (con el origen en el centro de la vista)
    const zoomStyle = useAnimatedStyle(() => {
        const k = interpolate(clock.get(), times, zoom, Extrapolation.CLAMP);
        return { transform: [{ translateX: (land.x * f - width / 2) * (1 - k) }, { translateY: (land.y * f - height / 2) * (1 - k) }, { scale: k }] };
    });
    const ballStyle = useAnimatedStyle(() => {
        const now = clock.get();
        const r = interpolate(now, times, ball.r, Extrapolation.CLAMP);
        return {
            transform: [
                { translateX: interpolate(now, times, ball.x, Extrapolation.CLAMP) * f - BALL_MAX * f },
                { translateY: interpolate(now, times, ball.y, Extrapolation.CLAMP) * f - BALL_MAX * f },
                { scale: r / BALL_MAX }
            ]
        };
    });
    const shadowStyle = useAnimatedStyle(() => {
        const now = clock.get();
        const r = interpolate(now, times, shadow.r, Extrapolation.CLAMP);
        return {
            opacity: interpolate(now, times, shadow.opacity, Extrapolation.CLAMP),
            transform: [
                { translateX: interpolate(now, times, shadow.x, Extrapolation.CLAMP) * f - BALL_MAX * 1.2 * f },
                { translateY: interpolate(now, times, shadow.y, Extrapolation.CLAMP) * f - BALL_MAX * 0.45 * f },
                { scale: r / BALL_MAX }
            ]
        };
    });
    const trailProps = useAnimatedProps(() => ({ strokeDashoffset: trailTotal - interpolate(clock.get(), times, visible, Extrapolation.CLAMP) }));
    const glowProps = useAnimatedProps(() => ({ strokeDashoffset: trailTotal - interpolate(clock.get(), times, visible, Extrapolation.CLAMP) }));
    // Destello en home al hacer contacto
    const burstStyle = useAnimatedStyle(() => {
        const p = easeOut((clock.get() - times[0]) / BURST_MS);
        const after = Math.max(0, (p - 0.01) / 0.99);
        return { opacity: clock.get() < times[0] || p >= 1 ? 0 : p < 0.01 ? p * 90 : 0.9 * (1 - after), transform: [{ scale: 0.2 + 1.6 * after }] };
    });
    // La cerca se ilumina cuando la bola la pasa
    const flashStyle = useAnimatedStyle(() => {
        if (crossAt === null) return { opacity: 0 };
        const p = easeOut((clock.get() - crossAt) / FLASH_MS);
        return { opacity: clock.get() < crossAt ? 0 : interpolate(p, [0, 0.25, 1], [0, 1, 0], Extrapolation.CLAMP) };
    });
    // Al caer: el punto, la medida y los anillos
    const landingStyle = useAnimatedStyle(() => {
        const p = easeOut((clock.get() - landAt) / LANDING_MS);
        return { opacity: clock.get() < landAt ? 0 : p, transform: [{ translateY: 6 * f * (1 - p) }] };
    });
    // La medida va encima de la estela (debajo, la curva que baja la tapaba)
    const tagStyle = useAnimatedStyle(() => {
        const p = easeOut((clock.get() - landAt) / LANDING_MS);
        return { opacity: clock.get() < landAt ? 0 : p, transform: [{ translateY: 6 * f * (1 - p) }] };
    });
    // «+1» en home cada vez que alguien anota
    const plusStyle = useAnimatedStyle(() => {
        const now = clock.get();
        let last = -1;
        for (let index = 0; index < scoreTimes.length; index++) if (scoreTimes[index] <= now) last = scoreTimes[index];
        const local = now - last;
        if (last < 0 || local > PLUS_MS) return { opacity: 0 };
        const p = easeOut(local / PLUS_MS);
        return { opacity: interpolate(p, [0, 0.3, 1], [0, 1, 0]), transform: [{ translateY: interpolate(p, [0, 0.3, 1], [4, -8, -20]) * f }] };
    });

    const ballSize = BALL_MAX * 2 * f;
    const pill = { x: land.x, y: land.y - 30 };
    return (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, zoomStyle]}>
            <Park field={field} width={width} height={height} ink={ink} gradient={gradient} />
            <Animated.View style={[StyleSheet.absoluteFill, flashStyle]}>
                <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`}>
                    <Path d={script.wallSpan} fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" />
                </Svg>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, landingStyle]}>
                {[accent, ink].map((stroke, index) => (
                    <Ring key={index} clock={clock} at={landAt + index * RING_GAP} x={land.x * f} y={land.y * f} size={18 * f} stroke={stroke} strokeWidth={index ? 1.5 : 2} />
                ))}
                <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
                    <Circle cx={land.x} cy={land.y} r={2.6} fill={accent} />
                    <Line x1={land.x} y1={land.y} x2={land.x} y2={land.y - 22} stroke={ink} strokeWidth={1.2} />
                </Svg>
            </Animated.View>
            <Animated.View style={[styles.dot, { width: BALL_MAX * 2.4 * f, height: BALL_MAX * 0.9 * f, borderRadius: BALL_MAX * f, backgroundColor: '#000' }, shadowStyle]} />
            <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
                {/* La estela: un halo del acento (en la web, con desenfoque) y el trazo blanco encima */}
                <AnimatedPath d={script.trail} fill="none" stroke={accent} strokeOpacity={0.45} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[trailTotal, trailTotal]} animatedProps={glowProps} />
                <AnimatedPath d={script.trail} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[trailTotal, trailTotal]} animatedProps={trailProps} />
            </Svg>
            <Animated.View style={[styles.dot, { left: home.x * f - 14 * f, top: home.y * f - 14 * f, width: 28 * f, height: 28 * f, borderRadius: 14 * f, borderWidth: 2 * f, borderColor: '#fff' }, burstStyle]} />
            <Animated.View style={[styles.dot, { width: ballSize, height: ballSize, borderRadius: ballSize / 2, backgroundColor: '#fff', borderWidth: 1.6 * f, borderColor: accent }, ballStyle]} />
            {/* Corredores en base y el bateador en home; trotan cuando cae la bola */}
            {script.runners.map((runner, index) => (
                <RunnerDot key={index} clock={clock} track={runner.track} arrive={runner.scores ? runner.arrive : null} size={(runner.batter ? 8 : 7.2) * f} f={f} color={color} />
            ))}
            <Animated.View style={[styles.dot, { left: home.x * f - 20 * f, top: (home.y - 12 - 11) * f, width: 40 * f, alignItems: 'center' }, plusStyle]}>
                <Txt size={13 * f} weight="black" color={ink} style={{ lineHeight: 15 * f }}>
                    +1
                </Txt>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, tagStyle]}>
                <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
                    <Rect x={pill.x - 27} y={pill.y - 9} width={54} height={17} rx={8.5} fill={ink} />
                    <SvgText x={pill.x} y={pill.y + 3.6} textAnchor="middle" fontSize={10.5} fontFamily={fonts.black} fill={color}>
                        {t('anim.feet', { ft: Math.round(flight.dist) })}
                    </SvgText>
                </Svg>
            </Animated.View>
        </Animated.View>
    );
};

/** Anillo que se abre dos veces donde cayó la bola */
const Ring: React.FC<{ clock: SharedValue<number>; at: number; x: number; y: number; size: number; stroke: string; strokeWidth: number }> = ({ clock, at, x, y, size, stroke, strokeWidth }) => {
    const style = useAnimatedStyle(() => {
        const local = clock.get() - at;
        if (local >= 2 * RING_MS) return { opacity: 0 };
        if (local < 0) return { opacity: 0.9, transform: [{ scale: 0.2 }] };
        const p = easeOut((local % RING_MS) / RING_MS);
        return { opacity: 0.9 * (1 - p), transform: [{ scale: 0.2 + 1.4 * p }] };
    });
    return <Animated.View style={[styles.dot, { left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, borderWidth: strokeWidth * (size / 18), borderColor: stroke }, style]} />;
};

/** Un corredor (o el bateador) que trota base a base; el que pisa home desaparece */
const RunnerDot: React.FC<{ clock: SharedValue<number>; track: Track; arrive: number | null; size: number; f: number; color: string }> = ({ clock, track, arrive, size, f, color }) => {
    const { times, xs, ys } = steady(track);
    const style = useAnimatedStyle(() => {
        const now = clock.get();
        return {
            opacity: arrive !== null && now >= arrive ? 0 : 1,
            transform: [{ translateX: interpolate(now, times, xs, Extrapolation.CLAMP) * f - size / 2 }, { translateY: interpolate(now, times, ys, Extrapolation.CLAMP) * f - size / 2 }]
        };
    });
    return <Animated.View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: 1.4 * f, borderColor: '#fff' }, style]} />;
};

// ---------------------------------------------------------------- las cifras

const decimalFormats = new Map<string, Intl.NumberFormat>();

/** Cifra con un decimal en el idioma de la app (106,8 / 106.8); sin Intl para ese idioma, el redondeo a mano */
const decimal = (value: number, lang: string) => {
    const rounded = Math.round(value * 10) / 10;
    try {
        let format = decimalFormats.get(lang);
        if (!format) {
            format = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
            decimalFormats.set(lang, format);
        }
        return format.format(rounded);
    } catch {
        return String(rounded);
    }
};

/**
 * Velocidad de salida, ángulo, distancia y «Remolca» contando con el vuelo y el trote. Va con su propio reloj de JS (el
 * mismo arranque que el de la escena) y solo se pinta de nuevo esta fila, no el campo.
 */
const Chips: React.FC<{ flight: Flight; script: Script; delay: number; reduce: boolean; ink: string }> = ({ flight, script, delay, reduce, ink }) => {
    const { t, i18n } = useTranslation();
    const [elapsed, setElapsed] = useState(reduce ? script.end + 1 : 0);
    useEffect(() => {
        if (reduce) return;
        const began = Date.now();
        let frame = 0;
        const tick = () => {
            const now = Date.now() - began;
            setElapsed(now);
            if (now <= script.end) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [reduce, script.end]);

    const time = Math.max(0, Math.min(1, (elapsed - delay) / script.ms));
    const landed = time >= 1;
    const rise = Math.min(1, time * 3);
    const runs = script.scoreTimes.filter((at) => at <= elapsed).length;
    const chips = [
        flight.ev !== null ? { label: t('anim.exitVelo'), value: `${decimal(flight.ev * rise, i18n.language)} mph` } : null,
        flight.la !== null ? { label: t('anim.launchAngle'), value: `${Math.round(flight.la * rise)}°` } : null,
        { label: t('anim.distance'), value: t('anim.feet', { ft: Math.round(landed ? flight.dist : flight.dist * groundAt(time)) }) },
        { label: t('anim.drivesInChip'), value: String(runs) }
    ].filter((chip): chip is { label: string; value: string } => chip !== null);

    return (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.chips}>
            {chips.map((chip) => (
                <View key={chip.label} style={[styles.chip, { backgroundColor: alpha(ink, 0.14) }]}>
                    <Txt size={9} weight="extrabold" color={ink} numberOfLines={1} style={styles.chipLabel}>
                        {chip.label}
                    </Txt>
                    <Txt size={12} weight="extrabold" color={ink} tabular numberOfLines={1}>
                        {chip.value}
                    </Txt>
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    dot: { position: 'absolute', left: 0, top: 0 },
    chips: { marginTop: 4, flexDirection: 'row', justifyContent: 'center', gap: 8 },
    chip: { minWidth: 64, flexShrink: 1, alignItems: 'center', gap: 1, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 14 },
    chipLabel: { letterSpacing: 0.7, textTransform: 'uppercase', opacity: 0.75 }
});
