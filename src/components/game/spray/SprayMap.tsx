import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Polygon, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { Easing, cancelAnimation, useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Play, Square, X } from 'lucide-react-native';
import type { GameDetail } from '../../../types';
import { eventName, inningName, pitchTypeName } from '../../../lib/baseball';
import { parkFor } from '../../../lib/flight';
import { NO_FILTERS, ZONES, entryTiming, filterBalls, flightPath, heatColor, heatGrid, pathLength, replayStep, sprayBalls, sprayStats, zoneStats, type ResultFilter, type SprayBall, type SprayFilters, type SprayResult, type TeamFilter, type TrajFilter } from '../../../lib/spray';
import { useMotion } from '../../../lib/motion';
import { useColors, useTheme } from '../../../theme/theme';
import { alpha, fonts, radius } from '../../../theme/tokens';
import { Card, PlayerPhoto, Row, Segmented, Sheet, Txt } from '../../ui';
import { PlayerLink, playerTextLink } from '../../stats/common';
import { useInView } from '../../pro/kit/hooks';
import { SprayField, fairPoints, sprayViewOf, zoneLabelAt, zonePoints } from './SprayField';
import { SprayBallArt } from './SprayBalls';

// Mapa de batazos del juego: el parque de verdad a escala, tres vistas (Batazos, Zonas, Calor), filtros que se combinan,
// cada batazo con su vuelo desde home y su marca por resultado, la entrada animada (≤ 2,5 s), «Repetir», el detalle al
// tocar y las cifras de lo filtrado. La lógica está en src/lib/spray.ts.

/** Color de la marca de cada resultado (sobre la grama) y el de su texto (sobre la tarjeta) */
export const RESULT_COLORS: Record<SprayResult, string> = { single: '#38bdf8', double: '#facc15', triple: '#fb923c', hr: '#ff3b5c', out: '#ffffff', error: '#c084fc' };
const RESULT_INK_LIGHT: Record<SprayResult, string> = { single: '#0369a1', double: '#a16207', triple: '#c2410c', hr: '#e11d48', out: '#6b6f7b', error: '#7e22ce' };
const RESULT_INK_DARK: Record<SprayResult, string> = { single: '#38bdf8', double: '#facc15', triple: '#fb923c', hr: '#ff4d6a', out: '#9a9db0', error: '#c084fc' };
const RESULTS: SprayResult[] = ['single', 'double', 'triple', 'hr', 'out', 'error'];

type SprayMode = 'balls' | 'zones' | 'heat';
const HIDDEN = 1e12;
const SETTLED = -1;

interface Plan {
    started: boolean;
    known: number[];
    slots: Record<number, [number, number]>;
    replay: { from: number; step: number; keys: number[] } | null;
}

/** Radio de la marca (px): crece un poco con la velocidad de salida */
const markPx = (ball: SprayBall) => (ball.ev === null ? 4.4 : 3.8 + Math.min(1, Math.max(0, (ball.ev - 70) / 40)) * 2.6) + (ball.result === 'hr' ? 0.6 : 0);

/** «Nombre Apellido · Doble · Alta 2 · 98 mph · 320 pies» */
export const ballLabel = (ball: SprayBall, lang: string, feet: (ft: number) => string) =>
    [ball.atBat.batter.name, eventName(ball.atBat, lang), inningName({ n: ball.atBat.inning, isTop: ball.atBat.top }, lang), ball.ev !== null ? `${ball.ev} mph` : '', feet(ball.feet)].filter(Boolean).join(' · ');

/** El trazo del vuelo en el dibujo (y hacia abajo); el rodado lleva aritos donde pica, en orden para dibujarse al pasar */
const ballPath = (ball: SprayBall, u: number) => {
    const path = flightPath(ball.land, ball.traj, ball.la);
    const to = path.to;
    if (!path.bounces.length) return { d: `M0 0 Q${path.control.x.toFixed(1)} ${(-path.control.y).toFixed(1)} ${to.x.toFixed(1)} ${(-to.y).toFixed(1)}`, length: pathLength(path) };
    const ring = 2.6 * u;
    const r = ring.toFixed(2);
    let last = { x: 0, y: 0 };
    let d = 'M0 0';
    let length = 0;
    for (const b of [...path.bounces, to]) {
        d += ` L${b.x.toFixed(1)} ${(-b.y).toFixed(1)}`;
        length += Math.hypot(b.x - last.x, b.y - last.y);
        if (b !== to) {
            d += ` M${(b.x - ring).toFixed(1)} ${(-b.y).toFixed(1)} a${r} ${r} 0 1 0 ${(2 * ring).toFixed(2)} 0 a${r} ${r} 0 1 0 ${(-2 * ring).toFixed(2)} 0 M${b.x.toFixed(1)} ${(-b.y).toFixed(1)}`;
            length += 2 * Math.PI * ring;
        }
        last = b;
    }
    return { d, length };
};

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void; a11y?: string }> = ({ label, active, onPress, a11y }) => {
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            role="radio"
            aria-checked={active}
            accessibilityState={{ selected: active, checked: active }}
            accessibilityLabel={a11y ?? label}
            style={({ pressed }) => ({ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: active ? colors.ink : colors.raised, opacity: pressed ? 0.8 : 1 })}
        >
            <Txt size={13} weight="bold" color={active ? colors.bg : colors.muted}>
                {label}
            </Txt>
        </Pressable>
    );
};

const Divider: React.FC = () => {
    const colors = useColors();
    return <View style={{ width: 1, height: 20, alignSelf: 'center', backgroundColor: colors.line }} />;
};

const StatTile: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => {
    const colors = useColors();
    return (
        <View style={{ flexGrow: 1, flexBasis: '30%', minWidth: 92, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 10, paddingVertical: 8 }} accessible accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`}>
            <Txt size={11} weight="bold" tone="muted" numberOfLines={1}>
                {label}
            </Txt>
            <Txt condensed size={22} tabular numberOfLines={1}>
                {value}
            </Txt>
            {sub ? (
                <Txt size={11} tone="muted" numberOfLines={1}>
                    {sub}
                </Txt>
            ) : null}
        </View>
    );
};

/** Barra apilada (Rodado/Línea/Elevado/Globito o Halado/Centro/Contrario) con sus porcentajes */
const MixBar: React.FC<{ parts: { label: string; share: number; color: string }[] }> = ({ parts }) => (
    <View style={{ gap: 4 }} accessible accessibilityLabel={parts.map((part) => `${part.label} ${Math.round(part.share * 100)}%`).join(', ')}>
        <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
            {parts.map((part) => (part.share > 0 ? <View key={part.label} style={{ flex: part.share, backgroundColor: part.color }} /> : null))}
        </View>
        <Row gap={10} wrap style={{ rowGap: 2 }}>
            {parts.map((part) => (
                <Row key={part.label} gap={4}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: part.color }} />
                    <Txt size={12} tone="muted">
                        {`${part.label} ${Math.round(part.share * 100)}%`}
                    </Txt>
                </Row>
            ))}
        </Row>
    </View>
);

export const SprayChart: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const { isDark } = useTheme();
    const motion = useMotion();
    const animate = motion.animate;
    const park = useMemo(() => parkFor(game.venue), [game.venue]);
    const view = useMemo(() => sprayViewOf(park), [park]);
    const all = useMemo(() => sprayBalls(game.atBats, park), [game.atBats, park]);
    const [mode, setMode] = useState<SprayMode>('balls');
    const [filters, setFilters] = useState<SprayFilters>(NO_FILTERS);
    const [selected, setSelected] = useState<number | null>(null);
    const [width, setWidth] = useState(0);
    const [picking, setPicking] = useState(false);
    const balls = useMemo(() => filterBalls(all, filters), [all, filters]);
    const stats = useMemo(() => sprayStats(balls), [balls]);
    const zones = useMemo(() => zoneStats(balls), [balls]);
    const { setNode, onLayout: look, seen } = useInView();
    const { width: screen } = useWindowDimensions();

    // Un solo reloj (ms) para todo lo que vuela; foco: la bola tocada (−1 ninguna) y cuándo volvió a salir
    const clock = useSharedValue(0);
    const focus = useSharedValue(-1);
    const focusStart = useSharedValue(0);
    const end = useRef(0);
    const [plan, setPlan] = useState<Plan>({ started: false, known: [], slots: {}, replay: null });
    const [tick, setTick] = useState(-1);

    const runTo = (target: number) => {
        const now = clock.get();
        end.current = Math.max(end.current, target);
        clock.set(withTiming(end.current, { duration: Math.max(0, end.current - now), easing: Easing.linear }));
    };

    const allKeys = all.map((ball) => ball.key).join(',');
    const visibleKeys = balls.map((ball) => ball.key).join(',');
    // Entrada (la primera vez que se ve) y cada batazo nuevo del juego en vivo
    useEffect(() => {
        if (!animate) return;
        const keys = allKeys ? allKeys.split(',').map(Number) : [];
        if (!plan.started) {
            if (!seen) return;
            const visible = visibleKeys ? visibleKeys.split(',').map(Number) : [];
            const { dur, step } = entryTiming(visible.length);
            const now = clock.get();
            const slots: Record<number, [number, number]> = {};
            visible.forEach((key, index) => {
                slots[key] = [now + index * step, dur];
            });
            setPlan({ started: true, known: keys, slots, replay: null });
            runTo(now + dur + step * Math.max(0, visible.length - 1));
            return;
        }
        const fresh = keys.filter((key) => !plan.known.includes(key));
        if (!fresh.length) return;
        const now = clock.get();
        const { dur } = entryTiming(1);
        const slots = { ...plan.slots };
        fresh.forEach((key) => {
            slots[key] = [now, dur];
        });
        setPlan({ ...plan, known: keys, slots });
        runTo(now + dur);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [animate, seen, allKeys]);

    // «Repetir»: qué bola va (para el letrero)
    const replay = plan.replay;
    useAnimatedReaction(
        () => (replay ? Math.floor((clock.get() - replay.from) / replay.step) : -1),
        (next, previous) => {
            if (next !== previous) scheduleOnRN(setTick, next);
        },
        [replay]
    );
    useEffect(() => {
        if (replay && tick >= replay.keys.length) setPlan((current) => ({ ...current, replay: null }));
    }, [tick, replay]);

    if (!all.length) return null;

    const startOf = (key: number): [number, number] => {
        if (!animate) return [SETTLED, 1];
        const slot = plan.slots[key];
        if (slot) return slot;
        return [plan.started ? SETTLED : HIDDEN, 1];
    };

    const select = (key: number | null) => {
        setSelected(key);
        focus.set(key ?? -1);
        if (key === null) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        if (animate) {
            const now = clock.get();
            focusStart.set(now);
            runTo(now + 650);
        }
    };

    const toggleReplay = () => {
        select(null);
        if (replay) {
            cancelAnimation(clock);
            setPlan({ ...plan, slots: {}, replay: null });
            setTick(-1);
            return;
        }
        setMode('balls');
        const keys = balls.map((ball) => ball.key);
        const step = replayStep(keys.length);
        const now = clock.get();
        const slots: Record<number, [number, number]> = {};
        keys.forEach((key, index) => {
            slots[key] = [now + index * step, Math.min(step, 700)];
        });
        setPlan({ ...plan, started: true, slots, replay: { from: now, step, keys } });
        runTo(now + keys.length * step + 50);
    };

    const setFilter = (patch: Partial<SprayFilters>) => {
        setFilters({ ...filters, ...patch });
        select(null);
    };

    const boxWidth = width || Math.min(screen - 32, 520);
    const u = view.w / boxWidth;
    const ink = isDark ? RESULT_INK_DARK : RESULT_INK_LIGHT;
    const feet = (ft: number) => t('spray.feet', { ft });
    const current = balls.find((ball) => ball.key === selected) ?? null;
    const index = current ? balls.indexOf(current) : -1;
    const ticker = replay && tick >= 0 && tick < replay.keys.length ? (all.find((ball) => ball.key === replay.keys[tick]) ?? null) : null;
    const pct = (value: number) => `${Math.round(value * 100)}%`;
    const gid = `spray-${game.gamePk ?? 0}`;
    const heat = mode === 'heat' ? heatGrid(balls.map((ball) => ball.land), { minX: view.x, maxX: view.x + view.w, minY: -(view.y + view.h), maxY: -view.y }) : [];
    const maxZone = Math.max(1, ...ZONES.map((zone) => zones[zone].count));
    const fair = fairPoints(park)
        .map((p) => `${p.x.toFixed(1)},${(-p.y).toFixed(1)}`)
        .join(' ');

    const teamOptions: { value: TeamFilter; label: string; a11y: string }[] = [
        { value: 'all', label: t('spray.both'), a11y: `${t('spray.filters.team')}: ${t('spray.both')}` },
        { value: 'away', label: game.away.abbrev, a11y: `${t('spray.filters.team')}: ${game.away.name}` },
        { value: 'home', label: game.home.abbrev, a11y: `${t('spray.filters.team')}: ${game.home.name}` }
    ];
    const resultOptions: { value: ResultFilter; label: string }[] = [
        { value: 'all', label: t('spray.filters.all') },
        { value: 'hits', label: t('spray.filters.hits') },
        { value: 'hr', label: t('spray.filters.hr') },
        { value: 'outs', label: t('spray.filters.outs') }
    ];
    const trajOptions: { value: TrajFilter; label: string }[] = [
        { value: 'all', label: t('spray.filters.all') },
        { value: 'ground', label: t('spray.kind.ground') },
        { value: 'line', label: t('spray.kind.line') },
        { value: 'fly', label: t('spray.kind.fly') },
        { value: 'popup', label: t('spray.kind.popup') }
    ];
    const batters = (() => {
        const map = new Map<number, { id: number; name: string; side: 'away' | 'home'; count: number }>();
        for (const ball of all) {
            if (filters.team !== 'all' && ball.side !== filters.team) continue;
            const row = map.get(ball.atBat.batter.id) ?? { id: ball.atBat.batter.id, name: ball.atBat.batter.name, side: ball.side, count: 0 };
            row.count += 1;
            map.set(row.id, row);
        }
        return [...map.values()].sort((a, b) => (a.side === b.side ? b.count - a.count || a.name.localeCompare(b.name) : a.side === 'away' ? -1 : 1));
    })();
    const batterName = filters.batter !== null ? (all.find((ball) => ball.atBat.batter.id === filters.batter)?.atBat.batter.name ?? '') : '';
    const pressSpot = (ball: SprayBall) => ({ left: `${((ball.land.x - view.x) / view.w) * 100}%` as const, top: `${((-ball.land.y - view.y) / view.h) * 100}%` as const });

    return (
        <Card padded={false} style={{ overflow: 'hidden' }}>
            <Row justify="space-between" wrap gap={8} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, rowGap: 8 }}>
                <Txt eyebrow accessibilityRole="header">
                    {t('spray.title')}
                </Txt>
                <Segmented<SprayMode>
                    small
                    value={mode}
                    onChange={(value) => {
                        setMode(value);
                        select(null);
                    }}
                    options={[
                        { value: 'balls', label: t('spray.views.balls') },
                        { value: 'zones', label: t('spray.views.zones') },
                        { value: 'heat', label: t('spray.views.heat') }
                    ]}
                />
            </Row>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 6 }} accessibilityLabel={t('spray.filters.label')}>
                <View role="radiogroup" accessibilityLabel={t('spray.filters.team')} style={{ flexDirection: 'row', gap: 6 }}>
                    {teamOptions.map((option) => (
                        <Chip key={option.value} label={option.label} a11y={option.a11y} active={filters.team === option.value} onPress={() => setFilter({ team: option.value, batter: option.value === 'all' || all.some((ball) => ball.side === option.value && ball.atBat.batter.id === filters.batter) ? filters.batter : null })} />
                    ))}
                </View>
                <Divider />
                <View role="radiogroup" accessibilityLabel={t('spray.filters.result')} style={{ flexDirection: 'row', gap: 6 }}>
                    {resultOptions.map((option) => (
                        <Chip key={option.value} label={option.label} a11y={`${t('spray.filters.result')}: ${option.label}`} active={filters.result === option.value} onPress={() => setFilter({ result: option.value })} />
                    ))}
                </View>
                <Divider />
                <View role="radiogroup" accessibilityLabel={t('spray.filters.type')} style={{ flexDirection: 'row', gap: 6 }}>
                    {trajOptions.map((option) => (
                        <Chip key={option.value} label={option.label} a11y={`${t('spray.filters.type')}: ${option.label}`} active={filters.traj === option.value} onPress={() => setFilter({ traj: option.value })} />
                    ))}
                </View>
                <Divider />
                <Pressable
                    onPress={() => setPicking(true)}
                    accessibilityRole="button"
                    accessibilityLabel={filters.batter !== null ? `${t('spray.batter')}: ${batterName}` : t('spray.pickBatter')}
                    style={({ pressed }) => ({ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: filters.batter !== null ? colors.ink : colors.raised, opacity: pressed ? 0.8 : 1 })}
                >
                    <Txt size={13} weight="bold" color={filters.batter !== null ? colors.bg : colors.muted} numberOfLines={1}>
                        {filters.batter !== null ? batterName : `${t('spray.batter')} ▾`}
                    </Txt>
                </Pressable>
                {filters.batter !== null && (
                    <Pressable onPress={() => setFilter({ batter: null })} accessibilityRole="button" accessibilityLabel={t('spray.clearBatter')} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised }}>
                        <X size={14} color={colors.ink} />
                    </Pressable>
                )}
            </ScrollView>
            <Sheet open={picking} onClose={() => setPicking(false)} title={t('spray.pickBatter')}>
                {batters.map((row) => (
                    <Pressable
                        key={row.id}
                        onPress={() => {
                            setPicking(false);
                            setFilter({ batter: row.id });
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: filters.batter === row.id }}
                        accessibilityLabel={`${row.name}, ${game[row.side].abbrev}, ${t('spray.ballsCount', { count: row.count })}`}
                        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: radius.tile, backgroundColor: filters.batter === row.id ? alpha(colors.accent, 0.15) : 'transparent', opacity: pressed ? 0.8 : 1 })}
                    >
                        <PlayerPhoto personId={row.id} name={row.name} size={44} team={game[row.side]} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={15} weight="bold" numberOfLines={1}>
                                {row.name}
                            </Txt>
                            <Txt size={13} tone="muted">
                                {game[row.side].abbrev}
                            </Txt>
                        </View>
                        <Txt size={13} weight="semibold" tone="muted">
                            {t('spray.ballsCount', { count: row.count })}
                        </Txt>
                    </Pressable>
                ))}
            </Sheet>

            <View style={{ paddingHorizontal: 12, alignItems: 'center' }}>
                <View
                    ref={setNode}
                    onLayout={(event) => {
                        setWidth(Math.round(event.nativeEvent.layout.width));
                        look();
                    }}
                    style={{ width: '100%', maxWidth: 520, aspectRatio: view.w / view.h, borderRadius: radius.tile, overflow: 'hidden' }}
                    accessibilityLabel={mode === 'heat' ? t('spray.heatAria', { count: balls.length }) : mode === 'zones' ? t('spray.zonesAria', { count: balls.length }) : t('spray.aria', { count: balls.length })}
                >
                    <Svg width="100%" height="100%" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}>
                        <Defs>
                            <RadialGradient id={`${gid}-glow`}>
                                <Stop offset="0" stopColor={RESULT_COLORS.hr} stopOpacity={0.6} />
                                <Stop offset="1" stopColor={RESULT_COLORS.hr} stopOpacity={0} />
                            </RadialGradient>
                            {[0, 1, 2, 3, 4, 5].map((step) => (
                                <RadialGradient key={step} id={`${gid}-heat-${step}`}>
                                    <Stop offset="0" stopColor={heatColor(step / 5)} stopOpacity={0.8} />
                                    <Stop offset="1" stopColor={heatColor(step / 5)} stopOpacity={0} />
                                </RadialGradient>
                            ))}
                            <ClipPath id={`${gid}-clip`}>
                                <Polygon points={fair} />
                            </ClipPath>
                        </Defs>
                        <SprayField park={park} view={view} dark={isDark} u={u} />

                        {mode === 'zones' &&
                            ZONES.map((zone) => {
                                const stat = zones[zone];
                                const at = zoneLabelAt(park, zone);
                                return (
                                    <G key={zone}>
                                        <Polygon
                                            points={zonePoints(park, zone)
                                                .map((p) => `${p.x.toFixed(1)},${(-p.y).toFixed(1)}`)
                                                .join(' ')}
                                            fill={colors.accent}
                                            fillOpacity={0.08 + (stat.count / maxZone) * 0.55}
                                            stroke="#ffffff"
                                            strokeOpacity={0.6}
                                            strokeWidth={u}
                                        />
                                        <SvgText x={at.x} y={-at.y} fontSize={11 * u} fontFamily={fonts.extrabold} fill="#ffffff" textAnchor="middle">
                                            {t('spray.zoneLabel', { count: stat.count, pct: Math.round(stat.share * 100), hits: stat.hits })}
                                        </SvgText>
                                    </G>
                                );
                            })}

                        {mode === 'heat' && (
                            <G clipPath={`url(#${gid}-clip)`}>
                                {heat.map((cell) => (
                                    <Circle key={`${cell.x},${cell.y}`} cx={cell.x} cy={-cell.y} r={34} fill={`url(#${gid}-heat-${Math.round(cell.v * 5)})`} opacity={0.25 + cell.v * 0.6} />
                                ))}
                            </G>
                        )}

                        {mode === 'balls' &&
                            balls.map((ball) => {
                                const { d, length } = ballPath(ball, u);
                                const [start, dur] = startOf(ball.key);
                                return (
                                    <SprayBallArt
                                        key={ball.key}
                                        k={ball.key}
                                        d={d}
                                        length={length}
                                        cx={ball.land.x}
                                        cy={-ball.land.y}
                                        r={markPx(ball) * u}
                                        color={RESULT_COLORS[ball.result]}
                                        hollow={ball.result === 'out'}
                                        glow={ball.result === 'hr'}
                                        glowFill={`url(#${gid}-glow)`}
                                        start={start}
                                        dur={dur}
                                        u={u}
                                        clock={clock}
                                        focus={focus}
                                        focusStart={focusStart}
                                    />
                                );
                            })}
                    </Svg>
                    {mode === 'balls' &&
                        balls.map((ball) => (
                            <Pressable
                                key={`hit-${ball.key}`}
                                accessibilityRole="button"
                                accessibilityState={{ selected: ball.key === selected }}
                                accessibilityLabel={ballLabel(ball, lang, feet)}
                                onPress={() => select(ball.key === selected ? null : ball.key)}
                                style={{ position: 'absolute', ...pressSpot(ball), width: 26, height: 26, marginLeft: -13, marginTop: -13, borderRadius: 13 }}
                            />
                        ))}
                </View>
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, gap: 12 }}>
                {mode === 'balls' && (
                    <Row gap={10}>
                        <Pressable
                            onPress={toggleReplay}
                            accessibilityRole="button"
                            accessibilityLabel={replay ? t('spray.stop') : t('spray.replay')}
                            disabled={!balls.length}
                            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: replay ? colors.ink : colors.raised, opacity: !balls.length ? 0.5 : pressed ? 0.8 : 1 })}
                        >
                            {replay ? <Square size={14} color={colors.bg} fill={colors.bg} /> : <Play size={14} color={colors.ink} fill={colors.ink} />}
                            <Txt size={13} weight="bold" color={replay ? colors.bg : colors.ink}>
                                {replay ? t('spray.stop') : t('spray.replay')}
                            </Txt>
                        </Pressable>
                        {ticker ? (
                            <Txt size={13} weight="semibold" numberOfLines={1} style={{ flex: 1 }} accessibilityLiveRegion="polite">
                                {`${inningName({ n: ticker.atBat.inning, isTop: ticker.atBat.top }, lang)} · ${ticker.atBat.batter.name} · `}
                                <Txt size={13} weight="extrabold" color={ink[ticker.result]}>
                                    {eventName(ticker.atBat, lang)}
                                </Txt>
                                <Txt size={12} tone="muted">{`  ${tick + 1}/${replay?.keys.length ?? 0}`}</Txt>
                            </Txt>
                        ) : null}
                    </Row>
                )}

                {!balls.length ? (
                    <Txt size={14} tone="muted" center>
                        {t('spray.empty')}
                    </Txt>
                ) : current && mode === 'balls' ? (
                    <View accessibilityLiveRegion="polite" style={{ borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12, gap: 8 }}>
                        <Row gap={10} align="center">
                            <PlayerLink player={{ ...current.atBat.batter, teamId: game[current.side].id }}>
                                <PlayerPhoto personId={current.atBat.batter.id} name={current.atBat.batter.name} size={44} team={game[current.side]} />
                            </PlayerLink>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt size={15} weight="extrabold" numberOfLines={1}>
                                    <Text {...playerTextLink({ ...current.atBat.batter, teamId: game[current.side].id })}>{current.atBat.batter.name}</Text>
                                </Txt>
                                <Txt size={14} weight="extrabold" color={ink[current.result]}>
                                    {eventName(current.atBat, lang)}
                                </Txt>
                            </View>
                            <Pressable onPress={() => select(balls[(index - 1 + balls.length) % balls.length].key)} accessibilityRole="button" accessibilityLabel={t('spray.prev')} hitSlop={6} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
                                <ChevronLeft size={18} color={colors.ink} />
                            </Pressable>
                            <Pressable onPress={() => select(balls[(index + 1) % balls.length].key)} accessibilityRole="button" accessibilityLabel={t('spray.next')} hitSlop={6} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
                                <ChevronRight size={18} color={colors.ink} />
                            </Pressable>
                            <Pressable onPress={() => select(null)} accessibilityRole="button" accessibilityLabel={t('spray.closeDetail')} hitSlop={6} style={{ width: 28, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                                <X size={16} color={colors.muted} />
                            </Pressable>
                        </Row>
                        <Txt size={13} tone="muted">
                            {`${inningName({ n: current.atBat.inning, isTop: current.atBat.top }, lang)} · ${t('spray.vs')} `}
                            <Text {...playerTextLink({ ...current.atBat.pitcher, teamId: game[current.side === 'away' ? 'home' : 'away'].id })}>{current.atBat.pitcher.name}</Text>
                            {current.pitch.mph ? ` · ${t('spray.pitch', { type: pitchTypeName(current.pitch, lang), mph: current.pitch.mph })}` : current.pitch.type ? ` · ${pitchTypeName(current.pitch, lang)}` : ''}
                        </Txt>
                        <Row gap={6} wrap style={{ rowGap: 6 }}>
                            {[
                                current.ev !== null ? t('zone.exitVelo', { mph: current.ev }) : null,
                                current.la !== null ? t('spray.launch', { deg: current.la }) : null,
                                `${current.measured ? '' : '≈'}${feet(current.feet)}`,
                                current.traj ? t(`spray.kind.${current.traj}`) : null,
                                current.hard ? t(`spray.hard.${current.hard}`, { defaultValue: current.hard }) : null
                            ]
                                .filter((value): value is string => !!value)
                                .map((value) => (
                                    <View key={value} style={{ borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 4 }}>
                                        <Txt size={12} weight="semibold">
                                            {value}
                                        </Txt>
                                    </View>
                                ))}
                            {current.ev !== null && current.ev >= 95 ? (
                                <View style={{ borderRadius: radius.pill, backgroundColor: alpha(RESULT_COLORS.hr, 0.16), paddingHorizontal: 10, paddingVertical: 4 }}>
                                    <Txt size={12} weight="extrabold" color={ink.hr}>
                                        {t('spray.hardBadge')}
                                    </Txt>
                                </View>
                            ) : null}
                        </Row>
                    </View>
                ) : mode === 'heat' ? (
                    <Row gap={8} justify="center">
                        <Txt size={11} tone="muted">
                            {t('spray.less')}
                        </Txt>
                        {[0, 1, 2, 3, 4, 5].map((step) => (
                            <View key={step} style={{ width: 18, height: 8, borderRadius: 4, backgroundColor: heatColor(step / 5) }} />
                        ))}
                        <Txt size={11} tone="muted">
                            {t('spray.more')}
                        </Txt>
                    </Row>
                ) : (
                    <Row gap={10} wrap justify="center" style={{ rowGap: 4 }}>
                        {RESULTS.map((result) => (
                            <Row key={result} gap={4}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: result === 'out' ? 'transparent' : RESULT_COLORS[result], borderWidth: result === 'out' ? 2 : 1, borderColor: result === 'out' ? colors.muted : 'rgba(0,0,0,0.3)' }} />
                                <Txt size={12} tone="muted">
                                    {t(`spray.result.${result}`)}
                                </Txt>
                            </Row>
                        ))}
                        {mode === 'balls' && (
                            <Txt size={11} tone="faint">
                                {t('spray.tapBall')}
                            </Txt>
                        )}
                    </Row>
                )}

                {balls.length > 0 && (
                    <View style={{ gap: 10 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            <StatTile label={t('spray.inPlay')} value={String(stats.balls)} />
                            <StatTile label={t('spray.hitsShort')} value={String(stats.hits)} />
                            <StatTile label={t('spray.hrShort')} value={String(stats.hr)} />
                            {stats.hardHit !== null && <StatTile label={t('spray.hardPct')} value={pct(stats.hardHit)} sub="≥ 95 mph" />}
                            {stats.avgEv !== null && <StatTile label={t('spray.avgEv')} value={stats.avgEv.toFixed(1)} sub="mph" />}
                            {stats.avgLa !== null && <StatTile label={t('spray.avgLa')} value={`${Math.round(stats.avgLa)}°`} />}
                            {stats.longest && <StatTile label={t('spray.longest')} value={feet(stats.longest.feet)} sub={stats.longest.atBat.batter.name} />}
                        </View>
                        {stats.traj && (
                            <MixBar
                                parts={[
                                    { label: t('spray.kind.ground'), share: stats.traj.ground, color: '#c48d5a' },
                                    { label: t('spray.kind.line'), share: stats.traj.line, color: '#38bdf8' },
                                    { label: t('spray.kind.fly'), share: stats.traj.fly, color: '#4aab69' },
                                    { label: t('spray.kind.popup'), share: stats.traj.popup, color: '#c084fc' }
                                ]}
                            />
                        )}
                        {stats.dir && (
                            <MixBar
                                parts={[
                                    { label: t('spray.dir.pull'), share: stats.dir.pull, color: '#ff3b5c' },
                                    { label: t('spray.dir.center'), share: stats.dir.center, color: '#9aa3b2' },
                                    { label: t('spray.dir.oppo'), share: stats.dir.oppo, color: '#3b82f6' }
                                ]}
                            />
                        )}
                        {stats.tracked === 0 && (
                            <Txt size={12} tone="muted">
                                {t('spray.noEv')}
                            </Txt>
                        )}
                    </View>
                )}
            </View>
        </Card>
    );
};
