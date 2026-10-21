import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Extrapolation, cancelAnimation, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../types';
import { sameName, type PlayEvent } from '../../../lib/playEvents';
import { proPlayOf, type GamePro, type ProPlay, type WinProb } from '../../../lib/pro/juego';
import { pitchTypeName } from '../../../lib/baseball';
import { fonts } from '../../../theme/tokens';
import { PlayerPhoto, TeamLogo, Txt } from '../../ui';
import { contrastRatio, linePath, polylineLength, teamInk, useElementWidth, useMotion, useSvgId } from '../kit';
import { BASES_FT, FIELDERS_FT, fieldOf, flightAt, polarFeet, projector, viewportFor, wallAt, wallPoints, type FeetPoint } from './field';
import { CINE_SCALE, FIXED_MS, fieldScript, isFieldScene, type FieldScript, type RunnerTrack } from './scenes';
import { ScoreStrip, StageFrame, StageTitle, StatChip, scoreBefore, useAt, useCachedPro, useStage, useStagePalette, type Clock } from './stage';
import { playHaptic } from './haptics';

// Jugadas del modo PRO con datos reales: el batazo vuela a su punto (hit.x/y) la distancia medida y con la altura del
// ángulo de salida, se ilumina quien fildeó, los corredores van base a base según su recorrido, y el marcador rueda
// con «+1». También base por bolas, error, robo, WP/PB, cambio de lanzador, carrera y el aviso de sin hit.
// El marcador va arriba de la escena (nunca queda tapado). Tocar la escena la cierra en 150 ms. Con «Apagadas» no sale
// ninguna (lo filtra forMode); con «Reducir movimiento» se ve el estado final con un fundido. Todo por tiempo
// (Reanimated 4: un reloj de 0 al total de la escena y cada pieza interpola su momento).

const AnimatedPath = Animated.createAnimatedComponent(Path);

const ordinal = (n: number, lang: string) => (lang.startsWith('en') ? `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}` : `${n}.ª`);

/** Puntos de la cerca suavizados (Catmull-Rom a Bézier) */
const smoothPath = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return '';
    let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let index = 0; index < points.length - 1; index++) {
        const p0 = points[index - 1] ?? points[index];
        const p1 = points[index];
        const p2 = points[index + 1];
        const p3 = points[index + 2] ?? p2;
        const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
        const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
        d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
};

/** Hacia qué parte del terreno fue el batazo, por su ángulo (los cortos se quedan en el cuadro) */
const directionKey = (deg: number, dist: number) => (dist < 150 ? 'infield' : deg < -27 ? 'left' : deg < -9 ? 'leftCenter' : deg <= 9 ? 'center' : deg <= 27 ? 'rightCenter' : 'right');

/** Un recorrido por tiempo: en cada instante `times[i]` está en (xs[i], ys[i]) */
interface Track {
    times: number[];
    xs: number[];
    ys: number[];
}

/** interpolate necesita dos puntos como mínimo: uno solo se queda quieto */
const steady = (track: Track): Track => (track.times.length > 1 ? track : { times: [0, 1], xs: [track.xs[0] ?? 0, track.xs[0] ?? 0], ys: [track.ys[0] ?? 0, track.ys[0] ?? 0] });

/** Un punto que sigue su recorrido según el reloj de la escena; `fade` = de cuándo a cuándo se ve */
const Mover: React.FC<{ clock: Clock; track: Track; size: number; show?: [number, number] | null; hideAfter?: number | null; children: React.ReactNode }> = ({ clock, track, size, show = null, hideAfter = null, children }) => {
    const { times, xs, ys } = steady(track);
    const style = useAnimatedStyle(() => {
        const now = clock.get();
        let opacity = 1;
        if (show) opacity = now < show[0] ? 0 : 1;
        if (hideAfter !== null) opacity *= interpolate(now, [hideAfter, hideAfter + 300], [1, 0], Extrapolation.CLAMP);
        return {
            opacity,
            transform: [{ translateX: interpolate(now, times, xs, Extrapolation.CLAMP) - size / 2 }, { translateY: interpolate(now, times, ys, Extrapolation.CLAMP) - size / 2 }]
        };
    });
    return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>{children}</Animated.View>;
};

/** Se ve desde el instante `at` (con un fundido de 200 ms) */
const FromAt: React.FC<{ clock: Clock; at: number; style?: object; children: React.ReactNode }> = ({ clock, at, style, children }) => {
    const fade = useAnimatedStyle(() => ({ opacity: interpolate(clock.get(), [at, at + 200], [0, 1], Extrapolation.CLAMP) }));
    return <Animated.View style={[style, fade]}>{children}</Animated.View>;
};

// ---------------------------------------------------------------- escena en el campo

interface SceneProps {
    event: PlayEvent;
    scale: number;
    cine: boolean;
    reduce: boolean;
    inline: boolean;
    onDone: () => void;
}

const FIELD_H = 216;

const FieldScene: React.FC<SceneProps & { play: ProPlay | undefined; pro: GamePro | undefined; winProb: WinProb | undefined }> = ({ event, play, pro, winProb, scale, cine, reduce, inline, onDone }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const palette = useStagePalette();
    const clipId = useSvgId('pa-fan');
    const venueField = pro?.game.venue.field;
    const { size, real } = useMemo(() => fieldOf(venueField), [venueField]);
    const script: FieldScript = useMemo(() => fieldScript(event, play, scale, size), [event, play, scale, size]);
    const { start, clock, close, style } = useStage({ total: script.total, reduce, inline, onDone });
    const titled = useAt(script.titleAt, start, reduce);
    const scored = useAt(script.scoreAt, start, reduce);
    const { width, onLayout } = useElementWidth(360);
    const motion = useMotion();

    useEffect(() => {
        if (titled) playHaptic(event.kind, motion.animate);
    }, [titled, event.kind, motion.animate]);

    const view = viewportFor(size, script.flight, width / FIELD_H);
    const proj = projector(view, width, FIELD_H);
    const px = (point: FeetPoint) => ({ x: proj.x(point.x), y: proj.y(point.y) });
    const lift = proj.scale * 0.55;

    const atBat = event.atBat;
    const batting = atBat ? (atBat.top ? event.away : event.home) : event.team;
    const fielding = batting.id === event.away.id ? event.home : event.away;
    const flight = script.flight;

    // El vuelo de la bola, por tiempo: 24 tramos con su altura
    const samples = flight
        ? Array.from({ length: 25 }, (_, index) => {
              const share = index / 24;
              const now = flightAt(flight, share);
              const ground = px(now);
              return { time: script.contactAt + share * script.flightMs, x: ground.x, y: ground.y, air: ground.y - now.height * lift, shade: 0.25 + 0.2 * (1 - Math.min(1, now.height / 120)) };
          })
        : [];
    const ballTrack: Track = { times: samples.map((s) => s.time), xs: samples.map((s) => s.x), ys: samples.map((s) => s.air) };
    const shadowTrack: Track = { times: samples.map((s) => s.time), xs: samples.map((s) => s.x), ys: samples.map((s) => s.y) };
    const trailPoints = samples.map((s) => [s.x, s.air] as [number, number]);
    const trailLength = Math.max(1, polylineLength(trailPoints));

    const runnerTrack = (track: RunnerTrack): Track => {
        const points = track.path.map(px);
        return { times: points.map((_, index) => track.start + index * track.legMs), xs: points.map((p) => p.x), ys: points.map((p) => p.y) };
    };
    const arriveAt = (track: RunnerTrack) => track.start + Math.max(0, track.path.length - 1) * track.legMs;

    // Quien fildeó va hacia la bola (como mucho 90 pies) mientras vuela
    const fielderTrack = (() => {
        if (!script.fielder) return null;
        const spot = FIELDERS_FT[script.fielder.pos];
        if (!spot) return null;
        const land = flight?.land;
        if (!land) return { times: [0, 1], xs: [px(spot).x, px(spot).x], ys: [px(spot).y, px(spot).y] };
        const dx = land.x - spot.x;
        const dy = land.y - spot.y;
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(dist, 90);
        const end = px({ x: spot.x + (dx / dist) * reach, y: spot.y + (dy / dist) * reach });
        const from = px(spot);
        return { times: [script.contactAt, script.contactAt + Math.max(1, script.flightMs)], xs: [from.x, end.x], ys: [from.y, end.y] };
    })();
    const litAt = script.contactAt + script.flightMs * 0.6;

    // WP/PB: la bola se le escapa al receptor hacia el backstop
    const escapeTrack = (() => {
        if (!script.escape) return null;
        const home = px(BASES_FT.home);
        const side = atBat?.batter.side === 'L' ? -1 : 1;
        const steps = Array.from({ length: 13 }, (_, index) => index / 12);
        return {
            times: steps.map((p) => script.escape!.at + p * script.escape!.ms),
            xs: steps.map((p) => home.x + side * 34 * (1 - (1 - p) * (1 - p))),
            ys: steps.map((p) => home.y + 6 + 18 * (1 - (1 - p) * (1 - p)) - Math.sin(p * Math.PI * 2) * 4 * (1 - p))
        };
    })();

    const trailEnd = script.contactAt + script.flightMs;
    const trailProps = useAnimatedProps(() => {
        const now = clock.get();
        const progress = interpolate(now, [script.contactAt, trailEnd], [0, 1], Extrapolation.CLAMP);
        const fade = now - trailEnd;
        const opacity = now < script.contactAt ? 0 : reduce ? 0.55 : fade > 500 ? Math.max(0, 0.75 - (fade - 500) / 600) : 0.75;
        return { strokeDashoffset: trailLength * (1 - progress), opacity };
    });
    const crossAt = script.crossAt;
    const sparkStyle = useAnimatedStyle(() => {
        if (crossAt === null || reduce) return { opacity: 0 };
        const now = clock.get();
        return { opacity: interpolate(now, [crossAt, crossAt + 280, crossAt + 700], [0, 1, 0], Extrapolation.CLAMP), transform: [{ scale: interpolate(now, [crossAt, crossAt + 280, crossAt + 700], [0.3, 1.1, 1.6], Extrapolation.CLAMP) }] };
    });

    // Textos
    const lastPitch = atBat?.pitches[atBat.pitches.length - 1];
    const title = (() => {
        switch (event.kind) {
            case 'hr':
                return t('anim.hr');
            case 'single':
            case 'double':
            case 'triple':
                return t(`anim.${event.kind}`);
            case 'out':
                return event.out?.variant === 'dp' ? t('anim.doublePlay') : event.out?.variant === 'tp' ? t('anim.triplePlay') : t('anim.outWord');
            case 'walk':
                return t(`pro.animaciones.title.walk_${event.walk ?? 'bb'}`);
            case 'error':
                return t('pro.animaciones.title.error');
            case 'steal':
                return t(event.steal?.caught ? 'pro.animaciones.title.caught' : 'pro.animaciones.title.steal');
            case 'wildPitch':
                return t(event.wild === 'pb' ? 'pro.animaciones.title.pb' : 'pro.animaciones.title.wp');
            default:
                return t('pro.animaciones.title.run', { count: event.runs?.count ?? 1 });
        }
    })();
    const playerName = (id: number | null | undefined) => (id ? (pro?.players?.[String(id)]?.name ?? null) : null);
    const scorers = script.runners
        .filter((track) => track.scored)
        .map((track) => playerName(track.id) ?? (track.batter ? atBat?.batter.name : null))
        .filter((name): name is string => !!name);
    const sub = (() => {
        if (event.kind === 'steal') return event.steal?.runner ?? '';
        if (event.kind === 'wildPitch' || (event.kind === 'run' && !atBat?.complete)) return scorers.length ? t('pro.animaciones.scores', { names: scorers.join(', ') }) : '';
        const parts: string[] = [];
        if (atBat?.batter.name) parts.push(atBat.batter.name);
        if (flight && ['hr', 'double', 'triple', 'single', 'out'].includes(event.kind)) parts.push(t(`pro.animaciones.direction.${directionKey(flight.deg, flight.dist)}`));
        if (event.kind === 'hr') {
            const nth = /\((\d+)\)/.exec(atBat?.desc ?? '')?.[1];
            if (nth) parts.push(t('pro.animaciones.seasonHr', { n: Number(nth), nth: ordinal(Number(nth), 'en') }));
        }
        if (event.kind === 'error' && script.fielder) parts.push(t('pro.animaciones.errorBy', { pos: script.fielder.pos, name: t(`pro.animaciones.position.${script.fielder.pos}`) }));
        if ((atBat?.rbi ?? 0) > 0 && event.kind !== 'hr') parts.push(t('anim.rbi', { count: atBat!.rbi }));
        else if (event.kind === 'hr' && atBat) parts.push(atBat.rbi >= 4 ? t('anim.grandSlam') : atBat.rbi <= 1 ? t('anim.solo') : t('anim.hrRuns', { count: atBat.rbi }));
        return parts.join(' · ');
    })();
    const pitchLine =
        cine && atBat && lastPitch
            ? [
                  `${atBat.top ? '▲' : '▼'} ${ordinal(atBat.inning, lang)}`,
                  t('pro.animaciones.against', { pitcher: atBat.pitcher.name }),
                  lastPitch.type || lastPitch.typeDesc ? `${pitchTypeName(lastPitch, lang).toLowerCase()}${lastPitch.mph ? ` ${lastPitch.mph.toFixed(1)} mph` : ''}` : null
              ]
                  .filter(Boolean)
                  .join(' · ')
            : null;
    const wp = cine && atBat ? winProb?.plays.find((item) => item.i === atBat.i) : undefined;
    const chips = !!flight && (flight.ev !== null || flight.la !== null || flight.measured !== null) && event.kind !== 'walk';
    const outsAfter = atBat?.outs ?? 0;
    const outsBefore = Math.max(0, outsAfter - (event.kind === 'out' ? (event.out?.variant === 'dp' ? 2 : event.out?.variant === 'tp' ? 3 : 1) : 0));
    const counted = lastPitch && lastPitch.b !== null && lastPitch.s !== null ? `${lastPitch.b}-${lastPitch.s}` : null;
    const count = atBat?.complete ? (titled ? '0-0' : counted) : null;
    const land = flight ? px(flight.land) : null;
    const wall = wallPoints(size).map(px);
    const home = px(BASES_FT.home);
    const fan = `M${home.x} ${home.y} L${wall[0].x} ${wall[0].y} ${smoothPath(wall).replace(/^M[^C]+/, '')} Z`;
    const fieldLabel = real === 'real' ? null : real === 'partial' ? t('pro.animaciones.fieldPartial') : t('pro.animaciones.fieldGeneric');
    const final = scoreBefore(event).after;
    const summary = [title, sub, flight?.measured ? t('anim.feet', { ft: flight.measured }) : null, `${event.away.abbrev} ${final.away}, ${event.home.abbrev} ${final.home}`].filter(Boolean).join('. ');
    const crossing = flight && crossAt !== null ? px(polarFeet(flight.deg, wallAt(size, flight.deg))) : null;
    const stageHeight = cine ? 492 : 440;

    return (
        <StageFrame height={stageHeight} style={style} inline={inline} summary={summary} onClose={() => close(true)}>
            <ScoreStrip event={event} scored={scored} outs={titled ? outsAfter : outsBefore} count={count} narrow={width < 350} />
            <View onLayout={onLayout} style={{ height: FIELD_H }}>
                <Svg width={width} height={FIELD_H}>
                    <Defs>
                        <ClipPath id={clipId}>
                            <Path d={fan} />
                        </ClipPath>
                    </Defs>
                    <Path d={fan} fill={palette.grass} />
                    <G clipPath={`url(#${clipId})`}>
                        <Circle cx={px(FIELDERS_FT[1]).x} cy={px(FIELDERS_FT[1]).y} r={95 * proj.scale} fill={palette.dirt} />
                    </G>
                    <Path d={smoothPath(wall)} fill="none" stroke={palette.wall} strokeWidth={3} strokeLinecap="round" />
                    <Path d={`M${wall[0].x} ${wall[0].y} L${home.x} ${home.y} L${wall[4].x} ${wall[4].y}`} fill="none" stroke={palette.chalk} strokeWidth={1.2} />
                    {(['1B', '2B', '3B'] as const).map((base) => {
                        const at = px(BASES_FT[base]);
                        return <Rect key={base} x={at.x - 3.5} y={at.y - 3.5} width={7} height={7} transform={`rotate(45 ${at.x} ${at.y})`} fill={palette.base} />;
                    })}
                    <Path d={`M${home.x - 4} ${home.y - 3} h8 v3 l-4 4 l-4 -4 z`} fill={palette.base} />
                    {Object.keys(FIELDERS_FT)
                        .map(Number)
                        .filter((pos) => pos !== script.fielder?.pos)
                        .map((pos) => {
                            const at = px(FIELDERS_FT[pos]);
                            return <Circle key={pos} cx={at.x} cy={at.y} r={4.5} fill={fielding.color} stroke={palette.bg} strokeWidth={1.2} opacity={0.85} />;
                        })}
                    {flight && <AnimatedPath d={linePath(trailPoints)} fill="none" stroke={palette.trail} strokeWidth={2.2} strokeLinecap="round" strokeDasharray={[trailLength, trailLength]} animatedProps={trailProps} />}
                    {land && flight?.measured && titled && (event.kind === 'hr' || flight.measured >= 250) && (
                        <SvgText
                            x={Math.min(width - 6, Math.max(6, land.x))}
                            y={Math.max(14, land.y - 10)}
                            textAnchor={land.x > width * 0.7 ? 'end' : land.x < width * 0.3 ? 'start' : 'middle'}
                            fontSize={12}
                            fontFamily={fonts.extrabold}
                            fill={palette.label}
                        >
                            {t('anim.feet', { ft: flight.measured })}
                        </SvgText>
                    )}
                </Svg>
                {fielderTrack && script.fielder && (
                    <Mover clock={clock} track={fielderTrack} size={24}>
                        <FromAt clock={clock} at={litAt} style={{ position: 'absolute', width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: script.fielder.error ? palette.down : palette.ink }}>
                            <View />
                        </FromAt>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: script.fielder.error ? palette.down : fielding.color, borderWidth: 1.6, borderColor: palette.bg }} />
                        {script.fielder.error && (
                            <FromAt clock={clock} at={litAt} style={{ position: 'absolute', top: -14 }}>
                                <Txt condensed size={13} color={palette.down}>
                                    E{script.fielder.pos}
                                </Txt>
                            </FromAt>
                        )}
                    </Mover>
                )}
                {script.runners.map((track, index) => (
                    <Mover key={index} clock={clock} track={runnerTrack(track)} size={14} hideAfter={track.scored ? arriveAt(track) : null}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: batting.color, borderWidth: 1.8, borderColor: palette.bg }} />
                        {track.out && (
                            <FromAt clock={clock} at={arriveAt(track)} style={StyleSheet.absoluteFill}>
                                <Svg width={14} height={14} viewBox="-7 -7 14 14">
                                    <Path d="M-5 -5 L5 5 M5 -5 L-5 5" stroke={palette.down} strokeWidth={2.6} strokeLinecap="round" />
                                </Svg>
                            </FromAt>
                        )}
                    </Mover>
                ))}
                {escapeTrack && (
                    <Mover clock={clock} track={escapeTrack} size={9}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.ball, borderWidth: 1, borderColor: palette.ballEdge }} />
                    </Mover>
                )}
                {flight && (
                    <>
                        <Mover clock={clock} track={shadowTrack} size={8} show={[script.contactAt, Infinity]}>
                            <View style={{ width: 8, height: 4, borderRadius: 4, backgroundColor: '#000', opacity: 0.3 }} />
                        </Mover>
                        <Mover clock={clock} track={ballTrack} size={9} show={[script.contactAt, Infinity]}>
                            <View style={{ width: 8.4, height: 8.4, borderRadius: 4.2, backgroundColor: palette.ball, borderWidth: 1, borderColor: palette.ballEdge }} />
                        </Mover>
                    </>
                )}
                {crossing && (
                    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: crossing.x - 12, top: crossing.y - 12, width: 24, height: 24 }, sparkStyle]}>
                        <Svg width={24} height={24} viewBox="-12 -12 24 24">
                            {Array.from({ length: 8 }, (_, index) => {
                                const angle = (index / 8) * Math.PI * 2;
                                return <Line key={index} x1={Math.cos(angle) * 4} y1={Math.sin(angle) * 4} x2={Math.cos(angle) * 11} y2={Math.sin(angle) * 11} stroke={palette.trail} strokeWidth={2} strokeLinecap="round" />;
                            })}
                        </Svg>
                    </Animated.View>
                )}
                {fieldLabel && (
                    <Txt size={10} weight="semibold" color={palette.muted} style={{ position: 'absolute', right: 8, top: 6, maxWidth: '45%', textAlign: 'right', lineHeight: 12 }}>
                        {fieldLabel}
                    </Txt>
                )}
            </View>
            <View style={{ flex: 1, justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderTopWidth: 3, borderTopColor: batting.color }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
                    {cine && atBat?.complete && <PlayerPhoto personId={atBat.batter.id} name={atBat.batter.name} size={46} background="rgba(255,255,255,0.92)" team={{ id: batting.id, logo: batting.logo, color: batting.color }} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={11} weight="extrabold" color={palette.muted} numberOfLines={1} style={{ letterSpacing: 1.5, textTransform: 'uppercase' }}>
                            {[batting.abbrev, atBat?.complete ? atBat.batter.name : null].filter(Boolean).join(' · ')}
                        </Txt>
                        <StageTitle text={title} show={titled} color={palette.ink} animate={!reduce} size={event.kind === 'wildPitch' || (event.kind === 'walk' && event.walk === 'ibb') || event.kind === 'steal' ? 30 : 40} />
                        {sub ? (
                            <Txt size={13} weight="semibold" color={palette.ink} numberOfLines={2} style={{ opacity: titled ? 0.92 : 0 }}>
                                {sub}
                            </Txt>
                        ) : null}
                        {pitchLine ? (
                            <Txt size={12} color={palette.muted} numberOfLines={1}>
                                {pitchLine}
                            </Txt>
                        ) : null}
                    </View>
                </View>
                {chips && titled && flight && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {flight.ev !== null && <StatChip value={flight.ev} decimals={1} label={t('pro.animaciones.chips.ev')} palette={palette} />}
                        {flight.la !== null && <StatChip value={flight.la} unit="°" label={t('pro.animaciones.chips.la')} palette={palette} />}
                        {flight.measured !== null && <StatChip value={flight.measured} unit={t('pro.animaciones.chips.ft')} label={t('pro.animaciones.chips.dist')} palette={palette} />}
                    </View>
                )}
                {wp && titled && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: palette.tile }}>
                            <Txt size={11} weight="bold" color={palette.ink}>
                                {t('pro.animaciones.winProb', {
                                    team: batting.abbrev,
                                    pct: (batting.id === event.home.id ? wp.home : 100 - wp.home).toFixed(1),
                                    delta: `${(batting.id === event.home.id ? wp.wpa : -wp.wpa) >= 0 ? '+' : '−'}${Math.abs(wp.wpa).toFixed(1)}`
                                })}
                            </Txt>
                        </View>
                        {wp.li !== null && wp.li >= 1.5 && (
                            <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: palette.tile }}>
                                <Txt size={11} weight="bold" color={palette.warn}>
                                    {t('pro.animaciones.leverage', { li: wp.li.toFixed(2) })}
                                </Txt>
                            </View>
                        )}
                    </View>
                )}
            </View>
        </StageFrame>
    );
};

// ---------------------------------------------------------------- ponche

const StrikeoutScene: React.FC<SceneProps> = ({ event, scale, reduce, inline, onDone }) => {
    const { t, i18n } = useTranslation();
    const palette = useStagePalette();
    const motion = useMotion();
    const total = Math.round((FIXED_MS.k ?? 2100) * scale);
    const { start, close, style } = useStage({ total, reduce, inline, onDone });
    const stamped = useAt(Math.round(550 * scale), start, reduce);
    const stamp = useSharedValue(reduce ? 1 : 0);
    useEffect(() => {
        if (!stamped) return;
        playHaptic('k', motion.animate);
        if (reduce) {
            stamp.set(1);
            return;
        }
        stamp.set(withTiming(1, { duration: 420, easing: Easing.bezier(0.5, 0, 0.75, 0) }));
        return () => cancelAnimation(stamp);
    }, [stamped, reduce, stamp, motion.animate]);
    const kStyle = useAnimatedStyle(() => {
        const v = stamp.get();
        return {
            opacity: interpolate(v, [0, 0.7, 1], [0, 1, 1]),
            transform: [{ scale: interpolate(v, [0, 0.7, 1], [2.6, 0.94, 1]) }, { rotate: `${interpolate(v, [0, 0.7, 1], [-12, 2, 0])}deg` }]
        };
    });

    const atBat = event.atBat;
    const pitches = atBat?.pitches.filter((pitch) => pitch.x !== null && pitch.z !== null) ?? [];
    const last = atBat?.pitches[atBat.pitches.length - 1];
    const looking = last?.code === 'C';
    // Zona: 1.5 pies a cada lado del centro del plato y de 0.5 a 4.5 pies de alto
    const W = 132;
    const H = 168;
    const zx = (x: number) => W / 2 + (x / 1.5) * (W / 2);
    const zy = (z: number) => H - ((z - 0.5) / 4) * H;
    const top = atBat?.pitches.find((pitch) => pitch.top)?.top ?? 3.4;
    const bot = atBat?.pitches.find((pitch) => pitch.bot)?.bot ?? 1.6;
    const sub = t('anim.kSub', { pitcher: atBat?.pitcher.name ?? '', batter: (atBat?.batter.name ?? '').split(' ').slice(-1)[0], count: event.strikeouts ?? 1 });
    const pitchText = last && (last.type || last.typeDesc) ? `${pitchTypeName(last, i18n.language)}${last.mph ? ` · ${last.mph.toFixed(1)} mph` : ''}` : null;
    // La K en el color del equipo que poncha, si se lee sobre el fondo del tema (si no, la tinta)
    const kColor = contrastRatio(event.team.color, palette.bg) >= 2 ? event.team.color : palette.ink;
    const resultColor = (r: string) => (r === 'ball' ? '#34c778' : r === 'inplay' ? '#6098ff' : '#ff5a5f');
    const summary = `${looking ? t('anim.kLooking') : t('anim.k')}. ${sub}. ${pitchText ?? ''}`;

    return (
        <StageFrame height={440} style={style} inline={inline} summary={summary} onClose={() => close(true)}>
            <ScoreStrip event={event} scored outs={stamped ? (atBat?.outs ?? 0) : Math.max(0, (atBat?.outs ?? 1) - 1)} count={last && last.b !== null && last.s !== null ? `${last.b}-${last.s}` : null} />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 16 }}>
                <Svg width={W} height={H} style={{ overflow: 'visible' }}>
                    <Rect x={zx(-0.708)} y={zy(top)} width={zx(0.708) - zx(-0.708)} height={zy(bot) - zy(top)} fill={palette.tile} stroke={palette.chalk} strokeWidth={1.5} />
                    {[1, 2].map((n) => (
                        <G key={n}>
                            <Line x1={zx(-0.708 + (1.416 * n) / 3)} x2={zx(-0.708 + (1.416 * n) / 3)} y1={zy(top)} y2={zy(bot)} stroke={palette.chalk} strokeOpacity={0.5} />
                            <Line x1={zx(-0.708)} x2={zx(0.708)} y1={zy(top - ((top - bot) * n) / 3)} y2={zy(top - ((top - bot) * n) / 3)} stroke={palette.chalk} strokeOpacity={0.5} />
                        </G>
                    ))}
                    {pitches.map((pitch, index) => {
                        const isLast = index === pitches.length - 1;
                        return (
                            <G key={index} opacity={isLast || stamped ? 1 : 0.55}>
                                <Circle cx={zx(pitch.x!)} cy={zy(pitch.z!)} r={isLast ? 9 : 6.5} fill={resultColor(pitch.r)} stroke={isLast ? palette.bg : 'none'} strokeWidth={2} />
                                <SvgText x={zx(pitch.x!)} y={zy(pitch.z!) + 3.5} textAnchor="middle" fontSize={isLast ? 10 : 8} fontFamily={fonts.extrabold} fill="#ffffff">
                                    {index + 1}
                                </SvgText>
                            </G>
                        );
                    })}
                </Svg>
                <View style={{ alignItems: 'center', minWidth: 0, flexShrink: 1 }}>
                    <Animated.View style={kStyle}>
                        <Txt condensed size={120} color={kColor} style={[{ lineHeight: 104 }, looking && { transform: [{ scaleX: -1 }] }]}>
                            K
                        </Txt>
                    </Animated.View>
                    <Txt condensed size={24} color={palette.ink} numberOfLines={1} style={{ marginTop: 6, letterSpacing: 1.4 }}>
                        {looking ? t('anim.kLooking') : t('anim.k')}
                    </Txt>
                </View>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 16, alignItems: 'center' }}>
                <Txt size={13} weight="semibold" color={palette.ink} numberOfLines={1}>
                    {sub}
                </Txt>
                {pitchText ? (
                    <Txt size={12} color={palette.muted} numberOfLines={1}>
                        {pitchText}
                    </Txt>
                ) : null}
            </View>
        </StageFrame>
    );
};

// ---------------------------------------------------------------- cambio de lanzador

const ChangeScene: React.FC<SceneProps & { pro: GamePro | undefined; game: GameDetail | null | undefined }> = ({ event, pro, game, scale, reduce, inline, onDone }) => {
    const { t } = useTranslation();
    const total = Math.round((FIXED_MS.pitchingChange ?? 2500) * scale);
    const { close, style } = useStage({ total, reduce, inline, onDone });
    const card = useSharedValue(reduce ? 1 : 0);
    const entering = useSharedValue(reduce ? 1 : 0);
    useEffect(() => {
        if (reduce) return;
        card.set(withTiming(1, { duration: 450, easing: Easing.bezier(0.2, 0.9, 0.3, 1.15) }));
        entering.set(withDelay(Math.round(900 * scale), withTiming(1, { duration: 420, easing: Easing.bezier(0.3, 1.3, 0.5, 1) })));
        return () => {
            cancelAnimation(card);
            cancelAnimation(entering);
        };
    }, [reduce, scale, card, entering]);
    const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - card.get()) * 260 }] }));
    const inStyle = useAnimatedStyle(() => ({ opacity: entering.get(), transform: [{ translateX: (1 - entering.get()) * 40 }, { scale: 0.8 + 0.2 * entering.get() }] }));

    const team = event.team;
    const ink = teamInk(team.color);
    const side = team.id === event.away.id ? 'away' : 'home';
    // Si la narración no dio los ids, los da la acción PRO del turno (quién entra y a quién reemplaza)
    const action = event.atBat ? proPlayOf(pro, event.atBat.i)?.actions.find((item) => item.type === 'pitching_substitution') : undefined;
    const person = (who: { id: number | null; name: string } | null | undefined, id: number | null | undefined) =>
        who?.id ? who : id ? { id, name: pro?.players?.[String(id)]?.name ?? who?.name ?? '' } : (who ?? null);
    const outgoing = person(event.change?.out, action?.replaced);
    const incoming = person(event.change?.in, action?.player);
    // Línea del que sale (box del juego) y temporada del que entra (box PRO), si MLB las manda
    const line = game?.box?.[side]?.pitchers.find((pitcher) => (outgoing?.id ? pitcher.id === outgoing.id : !!outgoing && sameName(pitcher.name, outgoing.name)));
    const season = incoming?.id ? (pro?.box?.[side]?.pitchers.find((pitcher) => pitcher.id === incoming.id)?.season ?? pro?.box?.[side]?.bullpen.find((pitcher) => pitcher.id === incoming.id)?.season) : undefined;
    const outLine = line ? t('pro.animaciones.change.line', { ip: line.ip, h: line.h, r: line.r, bb: line.bb, k: line.k }) + (line.np ? ` · ${t('pro.animaciones.change.pitches', { count: line.np })}` : '') : null;
    const inLine = season && season.era ? t('pro.animaciones.change.season', { era: season.era, ip: season.ip ?? '0.0' }) : null;
    const personCard = (who: { id: number | null; name: string } | null, label: string, text: string | null, dim: boolean) =>
        who ? (
            <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 3, opacity: dim ? 0.7 : 1 }}>
                <PlayerPhoto personId={who.id} name={who.name} size={64} background="rgba(255,255,255,0.92)" team={{ id: team.id, logo: team.logo, color: team.color }} />
                <Txt size={10} weight="extrabold" color={ink} style={{ letterSpacing: 1.4, textTransform: 'uppercase', opacity: 0.8 }}>
                    {label}
                </Txt>
                <Txt size={14} weight="bold" color={ink} numberOfLines={1} center>
                    {who.name}
                </Txt>
                {text ? (
                    <Txt size={11} weight="semibold" color={ink} numberOfLines={2} center style={{ opacity: 0.85 }}>
                        {text}
                    </Txt>
                ) : null}
            </View>
        ) : (
            <View style={{ flex: 1 }} />
        );
    const summary = t('pro.animaciones.change.aria', { team: team.name, in: incoming?.name ?? '', out: outgoing?.name ?? '' });

    return (
        <StageFrame height={440} style={style} inline={inline} summary={summary} onClose={() => close(true)}>
            <ScoreStrip event={event} scored outs={event.atBat?.complete ? (event.atBat.outs ?? 0) : 0} count={null} />
            <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 16 }}>
                <Animated.View style={[{ borderRadius: 26, padding: 16, backgroundColor: team.color, overflow: 'hidden' }, cardStyle]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={11} weight="extrabold" color={ink} numberOfLines={1} style={{ letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85 }}>
                                {team.abbrev} · {t('pro.animaciones.change.kicker')}
                            </Txt>
                            <Txt condensed size={40} color={ink} style={{ lineHeight: 40 }}>
                                {t('pro.animaciones.change.title')}
                            </Txt>
                        </View>
                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                            <TeamLogo team={team} size={36} />
                        </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {personCard(outgoing, t('anim.out'), outLine, true)}
                        <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M4 9h14l-4-4M20 15H6l4 4" />
                        </Svg>
                        <Animated.View style={[{ flex: 1, minWidth: 0 }, inStyle]}>{personCard(incoming, t('anim.in'), inLine, false)}</Animated.View>
                    </View>
                </Animated.View>
            </View>
        </StageFrame>
    );
};

// ---------------------------------------------------------------- sin hit

const NoHitScene: React.FC<SceneProps & { pro: GamePro | undefined }> = ({ event, pro, scale, reduce, inline, onDone }) => {
    const { t, i18n } = useTranslation();
    const motion = useMotion();
    const total = Math.round((FIXED_MS.noHitter ?? 2200) * scale);
    const { close, style } = useStage({ total, reduce, inline, onDone });
    const banner = useSharedValue(reduce ? 1 : 0);
    const shine = useSharedValue(0);
    useEffect(() => {
        playHaptic('noHitter', motion.animate);
        if (reduce) return;
        banner.set(withTiming(1, { duration: 300, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
        shine.set(withDelay(350, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) })));
        return () => {
            cancelAnimation(banner);
            cancelAnimation(shine);
        };
    }, [reduce, banner, shine, motion.animate]);
    const bannerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - banner.get()) * -160 }] }));
    const shineStyle = useAnimatedStyle(() => ({ opacity: shine.get() > 0 && shine.get() < 1 ? 1 : 0, left: `${-40 + shine.get() * 160}%` }));
    const innings = event.noHit?.innings ?? event.inning?.n ?? 0;
    const side = event.team.id === event.away.id ? 'away' : 'home';
    const pitchers = (pro?.box?.[side]?.pitchers ?? []).filter((pitcher) => (pitcher.outs ?? 0) > 0);
    const names = pitchers.map((pitcher) => pro?.players?.[String(pitcher.id)]?.short ?? pro?.players?.[String(pitcher.id)]?.name).filter(Boolean) as string[];
    const heading = t('pro.animaciones.noHit.title', { n: ordinal(innings, i18n.language) });
    const text = t('pro.animaciones.noHit.text', { team: event.team.name, rival: event.rival.name });
    const ink = '#2a1d00';

    return (
        <StageFrame height={300} style={style} inline={inline} summary={`${heading}. ${text}`} onClose={() => close(true)}>
            <ScoreStrip event={event} scored outs={3} count={null} />
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 12, overflow: 'hidden' }}>
                <Animated.View style={[{ borderRadius: 26, paddingHorizontal: 20, paddingVertical: 16, overflow: 'hidden', backgroundColor: '#f2c14e' }, bannerStyle]}>
                    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                        <Rect x={0} y={0} width="100%" height="100%" fill="#fff3c4" opacity={0.35} />
                    </Svg>
                    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, width: '33%', backgroundColor: 'rgba(255,255,255,0.45)' }, shineStyle]} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                            <TeamLogo team={event.team} size={36} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt condensed size={36} color={ink} numberOfLines={1} style={{ lineHeight: 36, textTransform: 'uppercase' }}>
                                {heading}
                            </Txt>
                            <Txt size={13} weight="semibold" color={ink}>
                                {text}
                            </Txt>
                            {names.length > 0 && (
                                <Txt size={12} weight="bold" color={ink} numberOfLines={1} style={{ opacity: 0.8 }}>
                                    {names.join(' · ')}
                                </Txt>
                            )}
                        </View>
                    </View>
                </Animated.View>
            </View>
        </StageFrame>
    );
};

// ---------------------------------------------------------------- entrada

export interface ProPlayAnimationProps {
    event: PlayEvent;
    onDone: () => void;
    /** El detalle del juego (box del Lite: la línea del lanzador que sale) */
    game?: GameDetail | null;
    /** Dentro de una página (vista de animaciones): no tapa la pantalla ni se va al terminar */
    inline?: boolean;
}

/** Escena PRO de una jugada. La elige según el tipo; las que no tienen escena propia (fin de entrada, emergente,
 * victoria, campeonato) las pinta el Lite. Los extras PRO del juego salen de la caché (sin pedir nada aquí). */
export const ProPlayAnimation: React.FC<ProPlayAnimationProps> = ({ event, onDone, game, inline = false }) => {
    const motion = useMotion();
    const reduce = !motion.animate;
    const cine = motion.mode === 'cine' && motion.animate;
    const scale = cine ? CINE_SCALE : 1;
    const { pro, winProb } = useCachedPro(event.gamePk);
    const play = event.atBat ? proPlayOf(pro, event.atBat.i) : undefined;
    const common = { event, scale, cine, reduce, inline, onDone };
    if (isFieldScene(event.kind)) return <FieldScene {...common} play={play} pro={pro} winProb={winProb} />;
    if (event.kind === 'k') return <StrikeoutScene {...common} />;
    if (event.kind === 'pitchingChange') return <ChangeScene {...common} pro={pro} game={game} />;
    if (event.kind === 'noHitter') return <NoHitScene {...common} pro={pro} />;
    return null;
};

