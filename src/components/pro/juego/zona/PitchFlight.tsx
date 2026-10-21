import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react-native';
import { pitchTypeName } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { fonts } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { ProButton, ProNote, ProSection, linePath, middle, useMotion, type Point } from '../../kit';
import { PLATE_FRONT, flightPath, tunnelSplit, type FlightPoint, type PitchItem } from '../vivo/logic';
import { fmtMph } from '../vivo/parts';
import { pitchColor } from './ZoneField';

// Vuelo del pitcheo desde atrás del receptor con la física real de MLB (salida, velocidad y aceleración), y el
// pitcheo anterior en fantasma para ver el túnel: hasta dónde se parecen y dónde se separan. Se repite 3 veces
// más lento que el tiempo real; con «menos movimiento» sale dibujado de una vez. La escena (grama, tierra, plato)
// es la misma en claro y en oscuro, como una foto.

interface PitchFlightProps {
    current: PitchItem | null;
    ghost: PitchItem | null;
    /** Número de cada pitcheo en el turno (o en el juego) para los rótulos */
    currentNumber: number;
    ghostNumber: number | null;
}

const W = 320;
const H = 260;
const CAMERA = 12; // pies detrás del frente del plato
const HORIZON = 14;
const GROUND = 236;
const PX = 42; // píxeles por pie en el plato
const SLOW = 3;
const STEPS = 40;
const SCENE = { sky: '#0e1a12', grass: '#13281b', mound: '#7a5a3a', dirt: '#8a6440', chalk: '#f3f4f6', ghost: '#e5e7eb', ink: '#0b0c10' };

const depth = (y: number) => CAMERA / (CAMERA + y);
const project = (x: number, y: number, z: number): Point => {
    const k = depth(y);
    const ground = HORIZON + (GROUND - HORIZON) * k;
    return [W / 2 + x * k * PX, ground - z * k * PX];
};
const projectPath = (path: FlightPoint[]) => path.map((point) => project(point.x, point.y, point.z));

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

export const PitchFlight: React.FC<PitchFlightProps> = ({ current, ghost, currentNumber, ghostNumber }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const motion = useMotion();
    const currentPro = current?.pro ?? null;
    const ghostPro = ghost?.pro ?? null;
    const path = useMemo(() => (currentPro ? flightPath(currentPro, STEPS) : null), [currentPro]);
    const ghostPath = useMemo(() => (ghostPro ? flightPath(ghostPro, STEPS) : null), [ghostPro]);
    // El vuelo se repite solo con otro pitcheo (no cada vez que llega una lectura nueva del mismo)
    const flightKey = current ? `${current.atBat.i}-${current.k}` : '';
    const hasPath = !!path;
    const [run, setRun] = useState(0);
    const progress = useSharedValue(1);
    const duration = path ? path[path.length - 1].t * 1000 * SLOW : 0;

    // Puntos en pantalla y tamaño de la bola en cada paso (más grande al acercarse)
    const screen = path ? projectPath(path) : [];
    const xs = screen.map((point) => point[0]);
    const ys = screen.map((point) => point[1]);
    const radii = (path ?? []).map((point) => 3 + 5 * depth(point.y));

    // Vuela al entrar, al llegar un pitcheo nuevo y al tocar «Repetir»
    useEffect(() => {
        if (!hasPath || !motion.animate) {
            progress.set(1);
            return;
        }
        progress.set(0);
        progress.set(withTiming(1, { duration, easing: Easing.linear }));
        return () => cancelAnimation(progress);
    }, [flightKey, hasPath, duration, motion.animate, run, progress]);

    const trailProps = useAnimatedProps(() => {
        const last = Math.max(1, Math.round(progress.get() * (xs.length - 1)));
        let d = '';
        for (let index = 0; index <= last && index < xs.length; index++) d += `${index ? 'L' : 'M'} ${xs[index]} ${ys[index]} `;
        return { d: d || 'M 0 0' };
    });
    const ballProps = useAnimatedProps(() => {
        const index = Math.min(xs.length - 1, Math.max(1, Math.round(progress.get() * (xs.length - 1))));
        return { cx: xs[index] ?? 0, cy: ys[index] ?? 0, r: radii[index] ?? 4 };
    });
    const doneProps = useAnimatedProps(() => ({ opacity: progress.get() >= 1 ? 1 : 0 }));

    if (!current) return null;
    const color = pitchColor(current.pitch, true, colors);
    const name = (item: PitchItem) => `${pitchTypeName(item.pitch, lang)} ${fmtMph(item.pitch.mph, lang) ?? ''}`.trim();

    if (!path) {
        return (
            <ProSection title={t('pro.zona.flight.title')}>
                <ProNote tone="pending">{`${t('pro.kit.game.noTracking')} ${t('pro.zona.flight.none')}`}</ProNote>
            </ProSection>
        );
    }

    const ghostScreen = ghostPath ? projectPath(ghostPath) : null;
    const end = screen[screen.length - 1];
    const split = ghostPath ? tunnelSplit(path, ghostPath) : null;
    const splitPoint = split !== null ? path.reduce((best, point, index) => (Math.abs(point.y - split) < Math.abs(path[best].y - split) ? index : best), 0) : null;
    const release = screen[0];
    const ext = current.pro?.ext;
    const plateTime = current.pro?.pt ?? path[path.length - 1].t;
    // Zona y plato en el frente del plato
    const top = current.pitch.top ?? 3.4;
    const bot = current.pitch.bot ?? 1.6;
    const [zx1, zy1] = project(-17 / 24, PLATE_FRONT, top);
    const [zx2, zy2] = project(17 / 24, PLATE_FRONT, bot);
    const plate = [project(-17 / 24, PLATE_FRONT, 0), project(17 / 24, PLATE_FRONT, 0), project(17 / 24, 0.7, 0), project(0, 0, 0), project(-17 / 24, 0.7, 0)];
    const mound = project(0, 59, 0);
    const label = t('pro.zona.flight.aria', {
        current: `${currentNumber} · ${name(current)}`,
        ghost: ghost ? `${ghostNumber} · ${name(ghost)}` : t('pro.zona.flight.noGhost'),
        split: split !== null ? t('pro.zona.flight.split', { feet: split }) : ''
    });
    const small = { fontFamily: fonts.bold, fontSize: 10 } as const;

    return (
        <ProSection title={t('pro.zona.flight.title')} bodyStyle={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={17} weight="black" style={{ lineHeight: 21 }}>
                        {t('pro.zona.flight.pitch', { n: currentNumber, name: name(current) })}
                    </Txt>
                    {ghost && ghostNumber !== null && (
                        <Txt size={12} tone="muted">
                            {t('pro.zona.flight.ghost', { n: ghostNumber, name: name(ghost) })}
                        </Txt>
                    )}
                </View>
                {motion.animate && <ProButton label={t('pro.zona.flight.replay')} icon={(ink) => <RotateCcw size={16} color={ink} />} onPress={() => setRun((value) => value + 1)} />}
            </View>
            <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: SCENE.grass, aspectRatio: W / H, width: '100%' }}>
                <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
                    <Rect x={0} y={0} width={W} height={HORIZON + 30} fill={SCENE.sky} />
                    <Ellipse cx={mound[0]} cy={mound[1] + 6} rx={46} ry={9} fill={SCENE.mound} opacity={0.85} />
                    <Rect x={mound[0] - 7} y={mound[1] + 2} width={14} height={2.5} fill={SCENE.chalk} />
                    <Path d={`M 0 ${GROUND - 4} Q ${W / 2} ${GROUND - 26} ${W} ${GROUND - 4} L ${W} ${H} L 0 ${H} Z`} fill={SCENE.dirt} opacity={0.75} />
                    <Path d={linePath(plate)} fill={SCENE.chalk} />
                    <Rect x={zx1} y={zy1} width={zx2 - zx1} height={zy2 - zy1} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />
                    {[1, 2].map((step) => (
                        <G key={step} stroke="rgba(255,255,255,0.25)" strokeWidth={0.8}>
                            <Line x1={zx1 + ((zx2 - zx1) * step) / 3} x2={zx1 + ((zx2 - zx1) * step) / 3} y1={zy1} y2={zy2} />
                            <Line x1={zx1} x2={zx2} y1={zy1 + ((zy2 - zy1) * step) / 3} y2={zy1 + ((zy2 - zy1) * step) / 3} />
                        </G>
                    ))}
                    {ghostScreen && (
                        <G opacity={0.75}>
                            <Path d={linePath(ghostScreen)} fill="none" stroke={SCENE.ghost} strokeWidth={2} strokeDasharray="4 4" />
                            <Circle cx={ghostScreen[ghostScreen.length - 1][0]} cy={ghostScreen[ghostScreen.length - 1][1]} r={6} fill="none" stroke={SCENE.ghost} strokeWidth={1.5} strokeDasharray="2 2" />
                            <SvgText x={ghostScreen[ghostScreen.length - 1][0] + 10} y={ghostScreen[ghostScreen.length - 1][1] + middle(11)} fill={SCENE.ghost} fontFamily={fonts.extrabold} fontSize={11}>
                                {`${ghostNumber} · ${ghost?.pitch.type ?? ''} ${fmtMph(ghost?.pitch.mph, lang) ?? ''}`}
                            </SvgText>
                        </G>
                    )}
                    <AnimatedPath fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" animatedProps={trailProps} />
                    <AnimatedCircle fill={color} stroke="#fff" strokeWidth={1.5} animatedProps={ballProps} />
                    <Circle cx={release[0]} cy={release[1]} r={3} fill="#fff" />
                    {typeof ext === 'number' && (
                        <SvgText x={release[0] - 8} y={release[1] + 4} textAnchor="end" fill={SCENE.chalk} {...small}>
                            {t('pro.zona.flight.ext', { feet: fmtMph(ext, lang) })}
                        </SvgText>
                    )}
                    <AnimatedG animatedProps={doneProps}>
                        {splitPoint !== null && (
                            <G>
                                <Circle cx={screen[splitPoint][0]} cy={screen[splitPoint][1]} r={7} fill="none" stroke="#fff" strokeWidth={1.2} strokeDasharray="2 2" />
                                <SvgText x={screen[splitPoint][0] + 11} y={screen[splitPoint][1] + middle(10)} fill="#fff" {...small}>
                                    {t('pro.zona.flight.split', { feet: split })}
                                </SvgText>
                            </G>
                        )}
                        {/* Contorno oscuro debajo para que el rótulo se lea sobre la grama y sobre la tierra */}
                        <SvgText x={end[0] + 12} y={end[1] + middle(12)} fill={SCENE.ink} stroke={SCENE.ink} strokeWidth={3} fontFamily={fonts.extrabold} fontSize={12}>
                            {`${currentNumber} · ${current.pitch.type ?? ''} ${fmtMph(current.pitch.mph, lang) ?? ''}`}
                        </SvgText>
                        <SvgText x={end[0] + 12} y={end[1] + middle(12)} fill={color} fontFamily={fonts.extrabold} fontSize={12}>
                            {`${currentNumber} · ${current.pitch.type ?? ''} ${fmtMph(current.pitch.mph, lang) ?? ''}`}
                        </SvgText>
                    </AnimatedG>
                </Svg>
            </View>
            <Txt size={12} tone="muted">
                {t('pro.zona.flight.caption', { time: fmtMph(plateTime, lang, 2), slow: SLOW })}
            </Txt>
            {ghost && split === null && ghostPath ? (
                <Txt size={12} tone="muted">
                    {t('pro.zona.flight.apart')}
                </Txt>
            ) : null}
        </ProSection>
    );
};
