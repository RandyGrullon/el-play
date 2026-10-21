// Carrera por la clasificación (igual que la de la web): una línea por equipo (juegos sobre .500 por fecha) que se dibuja
// al entrar, la franja del corte, la columna con el logo de cada equipo (que viaja al final de su línea) y, aparte, la
// zona «por jugar». Tocar cerca de una línea la aísla; para el lector están los botones de equipo que van debajo.
import React, { useEffect, useState } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useColors } from '../../../theme/theme';
import { alpha, fonts } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { DrawPath, MOTION_EASE, MOTION_MS, fmtSigned, linePath, linearScale, luminance, middle, mix, polylineLength, useAxisText, useElementWidth, useInView, useMotion, type Point, type ViewNode } from '../kit';
import { raceDateTicks, raceTicks, spreadLabels, type RaceModel } from './logic';

export interface RaceTeam {
    id: number;
    abbrev: string;
    name: string;
    color: string;
    logo: string;
}

interface RaceChartProps {
    model: RaceModel;
    teams: Record<number, RaceTeam>;
    /** Texto completo para el lector de pantalla (con el dato de cada equipo) */
    label: string;
    /** Equipo aislado (las demás líneas al 25 %) */
    selected: number | null;
    favorite: number | null;
    onSelect: (teamId: number) => void;
    /** Rótulo de cada fecha del eje */
    dateLabel: (day: string) => string;
    startLabel: string;
    /** Zona de lo que falta por jugar: sus días (hoy primero) y el texto de arriba */
    pending?: { ticks: { label: string; strong?: boolean }[]; title: string; sub?: string } | null;
    cutLabel?: string;
    height?: number;
}

const PAD = { top: 12, bottom: 26, left: 34 };
const LABEL_GAP = 20;
const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * Tres franjas de izquierda a derecha, como el diseño: las líneas, la columna de logos y la zona «por jugar» (cuando
 * hay juegos pendientes). En el teléfono angosto las dos últimas se encogen para dejarle sitio a las líneas.
 */
const bands = (width: number, pending: boolean, dates: number) => {
    const narrow = width < 300;
    const labels = narrow ? 66 : 92;
    if (!pending) return { zoneLeft: width, zoneRight: width, plotRight: Math.max(PAD.left + 40, width - labels) };
    const zone = narrow ? 64 : dates <= 5 ? 86 : 74;
    const zoneRight = width - 4;
    const zoneLeft = zoneRight - zone;
    return { zoneLeft, zoneRight, plotRight: Math.max(PAD.left + 40, zoneLeft - labels) };
};

// Grupo de SVG que se apaga al 25 % (o vuelve) con un fundido de 200 ms
const DimG: React.FC<{ opacity: number; children: React.ReactNode }> = ({ opacity, children }) => {
    const motion = useMotion();
    const value = useSharedValue(opacity);
    useEffect(() => {
        value.set(motion.animate ? withTiming(opacity, { duration: MOTION_MS.tab }) : opacity);
        return () => cancelAnimation(value);
    }, [opacity, motion.animate, value]);
    const animatedProps = useAnimatedProps(() => ({ opacity: value.get() }));
    return <AnimatedG animatedProps={animatedProps}>{children}</AnimatedG>;
};

// Logo y sigla al final de una línea: llegan desde el inicio de la línea (900 ms) y se apagan con las demás
const EndLabel: React.FC<{ team: RaceTeam; x: number; y: number; from: { x: number; y: number }; seen: boolean; index: number; dim: boolean; strong: boolean; narrow: boolean }> = ({
    team,
    x,
    y,
    from,
    seen,
    index,
    dim,
    strong,
    narrow
}) => {
    const motion = useMotion();
    const travel = useSharedValue(motion.animate ? 0 : 1);
    const fade = useSharedValue(dim ? 0.35 : 1);
    useEffect(() => {
        if (!motion.animate) {
            travel.set(1);
            return;
        }
        if (!seen) return;
        travel.set(withDelay(motion.delay(index, 40), withTiming(1, { duration: MOTION_MS.line, easing: MOTION_EASE })));
        return () => cancelAnimation(travel);
    }, [seen, motion, index, travel]);
    useEffect(() => {
        fade.set(motion.animate ? withTiming(dim ? 0.35 : 1, { duration: MOTION_MS.tab }) : dim ? 0.35 : 1);
        return () => cancelAnimation(fade);
    }, [dim, motion.animate, fade]);
    const style = useAnimatedStyle(() => {
        const left = 1 - travel.get();
        return { opacity: fade.get() * (0.3 + 0.7 * travel.get()), transform: [{ translateX: from.x * left }, { translateY: from.y * left }] };
    });
    const size = narrow ? 17 : 19;
    return (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y - size / 2, height: size, flexDirection: 'row', alignItems: 'center', gap: 3 }, style]}>
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: team.color, alignItems: 'center', justifyContent: 'center' }}>
                <TeamLogo team={team} size={size - 7} />
            </View>
            <Txt size={11} weight={strong ? 'black' : 'extrabold'}>
                {team.abbrev}
            </Txt>
        </Animated.View>
    );
};

export const RaceChart: React.FC<RaceChartProps> = ({ model, teams, label, selected, favorite, onSelect, dateLabel, startLabel, pending = null, cutLabel, height = 200 }) => {
    const colors = useColors();
    const axis = useAxisText();
    const { width, onLayout: measure } = useElementWidth(340);
    const { setNode, onLayout: look, seen } = useInView();
    const [node, setBox] = useState<ViewNode | null>(null);
    const last = model.dates.length;
    const { zoneLeft, zoneRight, plotRight } = bands(width, !!pending, last);
    const x = linearScale([0, last], [PAD.left, plotRight]);
    const y = linearScale(model.domain, [height - PAD.bottom, PAD.top]);
    const yTicks = raceTicks(model.domain);
    const xTicks = raceDateTicks(last);
    const narrow = width < 300;

    const ends = model.lines.map((line) => y(line.values[last]));
    // Los rótulos van en su propia columna, entre las líneas y la zona «por jugar», a todo lo alto
    const labelY = spreadLabels(ends, LABEL_GAP, PAD.top + 8, height - PAD.bottom - 8);

    const cutPath = model.cut
        ? `${linePath(model.cut.map((value, index) => [x(index), y(value + 0.5)] as Point))} ${linePath(model.cut.map((value, index) => [x(index), y(value - 0.5)] as Point).reverse()).replace(/^M/, 'L')} Z`
        : null;

    // Tocar la gráfica: la línea más cercana en la fecha más cercana (a menos de 24 px)
    const pick = (event: GestureResponderEvent) => {
        const { pageX, pageY } = event.nativeEvent;
        node?.measure((_x, _y, _w, _h, left, top) => {
            const px = pageX - left;
            const py = pageY - top;
            if (px > zoneLeft) return;
            const index = Math.min(last, Math.max(0, Math.round(x.invert(Math.min(px, plotRight)))));
            let bestId: number | null = null;
            let bestDistance = 24;
            model.lines.forEach((line, lineIndex) => {
                const atPoint = Math.abs(y(line.values[index]) - py);
                const atLabel = px > plotRight ? Math.abs(labelY[lineIndex] - py) : Infinity;
                const distance = Math.min(atPoint, atLabel);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestId = line.teamId;
                }
            });
            if (bestId !== null) onSelect(bestId);
        });
    };

    // El favorito y el aislado van encima de las demás líneas
    const weight = (id: number) => (id === selected ? 2 : id === favorite ? 1 : 0);
    const drawOrder = model.lines.map((line, index) => ({ line, index })).sort((a, b) => weight(a.line.teamId) - weight(b.line.teamId));
    const small = { fontFamily: fonts.extrabold, fontSize: 10 } as const;

    return (
        <Pressable
            ref={(view) => {
                setNode(view);
                setBox(view);
            }}
            onLayout={(event) => {
                measure(event);
                look();
            }}
            onPress={pick}
            accessible
            accessibilityRole="image"
            accessibilityLabel={label}
            style={{ width: '100%', height }}
        >
            <Svg width={width} height={height}>
                {pending && (
                    <G>
                        <Rect x={zoneLeft} y={PAD.top - 6} width={zoneRight - zoneLeft} height={height - PAD.bottom - PAD.top + 14} rx={8} fill={alpha(colors.line, 0.05)} />
                        <Line x1={zoneLeft} x2={zoneLeft} y1={PAD.top - 2} y2={height - PAD.bottom + 4} stroke={colors.accentInk} strokeWidth={1.25} strokeDasharray="2 4" opacity={0.6} />
                        <SvgText x={zoneLeft + 7} y={PAD.top + 9} {...small} fill={colors.muted} letterSpacing={0.6}>
                            {pending.title.toUpperCase()}
                        </SvgText>
                        {pending.sub ? (
                            <SvgText x={zoneLeft + 7} y={PAD.top + 22} {...small} fill={colors.accentInk}>
                                {pending.sub}
                            </SvgText>
                        ) : null}
                    </G>
                )}
                {yTicks.map((tick) => (
                    <G key={tick}>
                        <Line x1={PAD.left} x2={pending ? zoneRight : plotRight} y1={y(tick)} y2={y(tick)} stroke={alpha(colors.line, tick === 0 ? 0.3 : 0.08)} strokeDasharray={tick === 0 ? '4 4' : undefined} />
                        <SvgText x={PAD.left - 6} y={y(tick)} dy={middle(11)} textAnchor="end" {...axis}>
                            {tick === 0 ? '.500' : fmtSigned(tick)}
                        </SvgText>
                    </G>
                ))}
                {cutPath && model.cut && (
                    <G>
                        <Path d={cutPath} fill={alpha(colors.accent, 0.14)} />
                        {cutLabel ? (
                            <SvgText x={x(last) - 4} y={Math.min(height - PAD.bottom - 4, y(model.cut[last] - 0.5) + 13)} textAnchor="end" {...small} fill={colors.accentInk}>
                                {cutLabel.toUpperCase()}
                            </SvgText>
                        ) : null}
                    </G>
                )}
                {xTicks.map((tick) => (
                    <SvgText key={tick} x={x(tick)} y={height - 7} textAnchor={tick === 0 ? 'start' : 'middle'} {...axis}>
                        {tick === 0 ? startLabel : dateLabel(model.dates[tick - 1])}
                    </SvgText>
                ))}
                {/* Hoy en el borde de la zona y el día siguiente al final, como el diseño */}
                {pending?.ticks.slice(0, 2).map((tick, index) => (
                    <SvgText key={tick.label} x={index === 0 ? zoneLeft : zoneRight} y={height - 7} textAnchor={index === 0 ? 'middle' : 'end'} fontFamily={tick.strong ? fonts.extrabold : fonts.bold} fontSize={10} fill={tick.strong ? colors.accentInk : colors.muted}>
                        {tick.label}
                    </SvgText>
                ))}
                {drawOrder.map(({ line, index }) => {
                    const team = teams[line.teamId];
                    const color = team?.color ?? colors.muted;
                    const points = line.values.map((value, point) => [x(point), y(value)] as Point);
                    const d = linePath(points);
                    const length = polylineLength(points);
                    const thick = line.teamId === favorite ? 4.5 : 2.5;
                    const dim = selected !== null && selected !== line.teamId;
                    // Los colores claros (AGU) llevan un borde más oscuro para verse sobre fondo claro
                    const edge = luminance(color) > 0.45 ? mix(color, '#000000', 0.35) : null;
                    const end = points[points.length - 1];
                    return (
                        <DimG key={line.teamId} opacity={dim ? 0.25 : 1}>
                            {edge && <DrawPath d={d} length={length} seen={seen} index={index} fill="none" stroke={edge} strokeWidth={thick + 1.5} strokeLinecap="round" strokeLinejoin="round" />}
                            <DrawPath d={d} length={length} seen={seen} index={index} fill="none" stroke={color} strokeWidth={thick} strokeLinecap="round" strokeLinejoin="round" />
                            {seen && <Circle cx={end[0]} cy={end[1]} r={thick / 2 + 2} fill={color} stroke={colors.surface} strokeWidth={1.5} />}
                        </DimG>
                    );
                })}
                {/* Rayita del final de la línea a su rótulo cuando se tuvo que mover */}
                {model.lines.map((line, index) => {
                    const team = teams[line.teamId];
                    if (!team || Math.abs(labelY[index] - ends[index]) <= 3) return null;
                    const dim = selected !== null && selected !== line.teamId;
                    return <Line key={`l${line.teamId}`} x1={x(last) + 4} y1={ends[index]} x2={x(last) + 11} y2={labelY[index]} stroke={team.color} strokeWidth={1.25} opacity={dim ? 0.3 : 0.8} />;
                })}
            </Svg>
            {model.lines.map((line, index) => {
                const team = teams[line.teamId];
                if (!team) return null;
                const lx = x(last) + 12;
                const ly = labelY[index];
                return (
                    <EndLabel
                        key={`e${line.teamId}`}
                        team={team}
                        x={lx}
                        y={ly}
                        from={{ x: x(0) - lx, y: y(0) - ly }}
                        seen={seen}
                        index={index}
                        dim={selected !== null && selected !== line.teamId}
                        strong={line.teamId === favorite || line.teamId === selected}
                        narrow={narrow}
                    />
                );
            })}
        </Pressable>
    );
};
