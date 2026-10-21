import React, { useMemo, useState } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { battedBalls, eventName, type BattedBall } from '../../../../lib/baseball';
import { useColors } from '../../../../theme/theme';
import { alpha, fonts, radius } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { ChipButton, ChipRow, DrawPath, FadeG, GrowBar, ProNote, ProSection, heatColor, lastName, linearScale, middle, useAxisText, useChartBox, useInView, useProColors } from '../../kit';
import { fenceDistances, teamShortName } from './logic';
import { fmtMph, halfInning } from './parts';

// Pestaña «Contacto»: velocidad de salida contra ángulo (con la franja barrel de Statcast como referencia), el mapa
// de batazos con el jardín a la escala del parque (si MLB da sus medidas) y los puntos de frío a caliente según la
// velocidad de salida, los 5 batazos más duros y el promedio por bateador. Se filtra por equipo y por bateador.

interface ContactTabProps {
    game: GameDetail;
    pro?: GamePro;
}

type Filter = 'all' | 'away' | 'home';

const EV_MIN = 60;
const EV_MAX = 112;
const evColor = (ev: number | null | undefined, faint: string) => (typeof ev === 'number' ? heatColor((Math.min(EV_MAX, Math.max(EV_MIN, ev)) - EV_MIN) / (EV_MAX - EV_MIN), 'heat') : faint);

// Gameday: home en (125.42, 198.27) y unos 2.5 pies por unidad
const HOME_X = 125.42;
const HOME_Y = 198.27;
const FT = 2.5;

/** Franja barrel de Statcast: desde 98 mph entre 26° y 30°, y se abre 1-3° por mph hasta 8°-50° a 116 mph */
const BARREL = [
    [26, 98],
    [30, 98],
    [50, 116],
    [50, 120],
    [8, 120],
    [8, 116]
];

/** ¿Cae en la franja barrel? (la misma definición de la franja dibujada; es referencia, MLB no la marca en LIDOM) */
export const inBarrel = (ev: number | null | undefined, la: number | null | undefined) => {
    if (typeof ev !== 'number' || typeof la !== 'number' || ev < 98) return false;
    const over = Math.min(18, ev - 98);
    return la >= 26 - over && la <= 30 + (over * 20) / 18;
};

const hitOf = (ball: BattedBall) => ball.pitch.hit;

/** Largo aproximado de una curva cuadrática (para dibujarla con strokeDashoffset) */
const quadLength = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) => {
    let length = 0;
    let [px, py] = [x0, y0];
    for (let step = 1; step <= 12; step++) {
        const s = step / 12;
        const x = (1 - s) ** 2 * x0 + 2 * (1 - s) * s * cx + s ** 2 * x1;
        const y = (1 - s) ** 2 * y0 + 2 * (1 - s) * s * cy + s ** 2 * y1;
        length += Math.hypot(x - px, y - py);
        [px, py] = [x, y];
    }
    return length;
};

const EvLaChart: React.FC<{ game: GameDetail; balls: BattedBall[]; selected: number | null; onSelect: (i: number) => void; label: string }> = ({ game, balls, selected, onSelect, label }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const axis = useAxisText();
    const { setNode, onLayout, width, seen } = useChartBox();
    const height = 230;
    const pad = { top: 10, right: 10, bottom: 34, left: 40 };
    const x = linearScale([-40, 70], [pad.left, width - pad.right]);
    const y = linearScale([50, 120], [height - pad.bottom, pad.top]);
    const tracked = balls.filter((ball) => typeof hitOf(ball)?.ev === 'number' && typeof hitOf(ball)?.la === 'number');
    const spot = (ball: BattedBall) => ({ cx: x(Math.max(-40, Math.min(70, hitOf(ball)!.la as number))), cy: y(Math.max(50, Math.min(120, hitOf(ball)!.ev as number))) });
    // Toque: el batazo más cercano a menos de 24 px (los batazos también se tocan en la lista de los más duros)
    const pick = (event: GestureResponderEvent) => {
        const { locationX, locationY } = event.nativeEvent;
        let best: { i: number; d: number } | null = null;
        for (const ball of tracked) {
            const { cx, cy } = spot(ball);
            const d = Math.hypot(cx - locationX, cy - locationY);
            if (d <= 24 && (!best || d < best.d)) best = { i: ball.atBat.i, d };
        }
        if (best) onSelect(best.i);
    };
    return (
        <View ref={setNode} onLayout={onLayout} style={{ width: '100%' }}>
            <Pressable onPress={pick} accessibilityRole="image" accessibilityLabel={label} style={{ width, height }}>
                <Svg width={width} height={height}>
                    <Path
                        d={`${BARREL.map(([la, ev], index) => `${index ? 'L' : 'M'} ${x(la)} ${y(Math.min(120, ev))}`).join(' ')} Z`}
                        fill={alpha(pro.warn, 0.16)}
                        stroke={alpha(pro.warn, 0.5)}
                        strokeDasharray="4 3"
                    />
                    <SvgText x={x(29)} y={y(112) + middle(10)} fill={pro.warn} fontFamily={fonts.extrabold} fontSize={10} textAnchor="middle">
                        {t('pro.vivo.contact.barrel')}
                    </SvgText>
                    {[-30, 0, 30, 60].map((tick) => (
                        <G key={`x${tick}`}>
                            <Line x1={x(tick)} x2={x(tick)} y1={pad.top} y2={height - pad.bottom} stroke={alpha(colors.line, 0.08)} />
                            <SvgText x={x(tick)} y={height - pad.bottom + 14} textAnchor="middle" {...axis}>
                                {`${tick}°`}
                            </SvgText>
                        </G>
                    ))}
                    {[60, 80, 100, 120].map((tick) => (
                        <G key={`y${tick}`}>
                            <Line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={alpha(colors.line, 0.08)} />
                            <SvgText x={pad.left - 6} y={y(tick) + middle(11)} textAnchor="end" {...axis}>
                                {String(tick)}
                            </SvgText>
                        </G>
                    ))}
                    <SvgText x={(pad.left + width - pad.right) / 2} y={height - 2} textAnchor="middle" fill={colors.muted} fontFamily={fonts.bold} fontSize={11}>
                        {t('pro.vivo.contact.la')}
                    </SvgText>
                    <SvgText x={11} y={(pad.top + height - pad.bottom) / 2} textAnchor="middle" fill={colors.muted} fontFamily={fonts.bold} fontSize={11} transform={`rotate(-90 11 ${(pad.top + height - pad.bottom) / 2})`}>
                        {t('pro.vivo.contact.ev')}
                    </SvgText>
                    {tracked.map((ball, index) => {
                        const { cx, cy } = spot(ball);
                        const active = selected === ball.atBat.i;
                        const color = game[ball.side].color;
                        const hollow = ball.kind === 'out';
                        return (
                            <FadeG key={ball.atBat.i} seen={seen} index={index} step={15} opacity={selected !== null && !active ? 0.35 : 1}>
                                {active && <Circle cx={cx} cy={cy} r={10} fill="none" stroke={colors.ink} strokeWidth={2} />}
                                <Circle cx={cx} cy={cy} r={ball.kind === 'hr' ? 6 : 5} fill={hollow ? colors.surface : color} stroke={color} strokeWidth={hollow ? 2 : 1.5} />
                            </FadeG>
                        );
                    })}
                </Svg>
            </Pressable>
        </View>
    );
};

const SprayField: React.FC<{ balls: BattedBall[]; selected: number | null; fence: number[] | null; label: string }> = ({ balls, selected, fence, label }) => {
    const colors = useColors();
    const { setNode, onLayout, seen } = useInView();
    // Cerca por ángulo: línea izquierda (−45°) a línea derecha (+45°), en unidades de Gameday
    const fencePts = (fence ?? [330, 375, 400, 375, 330]).map((feet, index) => {
        const angle = ((-45 + index * 22.5) * Math.PI) / 180;
        return [Math.sin(angle) * (feet / FT), -Math.cos(angle) * (feet / FT)];
    });
    const fencePath = `M 0 0 L ${fencePts.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(' L ')} Z`;
    const smooth = `M 0 0 L ${fencePts[0][0].toFixed(1)} ${fencePts[0][1].toFixed(1)} ${fencePts
        .slice(1)
        .map(([px, py], index) => {
            const [qx, qy] = fencePts[index];
            return `Q ${((qx + px) / 2).toFixed(1)} ${(Math.min(qy, py) - 6).toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`;
        })
        .join(' ')} Z`;
    const maxR = Math.max(...fencePts.map(([px, py]) => Math.hypot(px, py))) + 12;
    const view = { x: -maxR * 0.78, y: -maxR - 4, w: maxR * 1.56, h: maxR + 14 };
    const grass = '#3f9b63';
    const dirt = '#c08a52';
    return (
        <View ref={setNode} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: '100%', maxWidth: 420, alignSelf: 'center', aspectRatio: view.w / view.h }}>
            <Svg width="100%" height="100%" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}>
                <Path d={fence ? smooth : fencePath} fill={grass} fillOpacity={0.18} stroke={grass} strokeOpacity={0.6} strokeWidth={1.2} />
                <Path d="M0 0 L-38 -38 Q0 -84 38 -38 Z" fill={dirt} fillOpacity={0.28} />
                <Path d="M0 -5 L-21 -26 L0 -47 L21 -26 Z" fill={grass} fillOpacity={0.26} />
                <G stroke={alpha(colors.line, 0.4)} strokeWidth={0.8}>
                    <Line x1={0} y1={0} x2={fencePts[0][0]} y2={fencePts[0][1]} />
                    <Line x1={0} y1={0} x2={fencePts[4][0]} y2={fencePts[4][1]} />
                </G>
                {fence &&
                    fencePts.map(([px, py], index) =>
                        index % 2 === 0 ? (
                            <SvgText key={index} x={px * 0.9} y={py * 0.9 - 3} textAnchor="middle" fill={colors.muted} fontFamily={fonts.bold} fontSize={7}>
                                {String(fence[index])}
                            </SvgText>
                        ) : null
                    )}
                {balls.map((ball, index) => {
                    const bx = ball.x - HOME_X;
                    const by = ball.y - HOME_Y;
                    const active = selected === ball.atBat.i;
                    const color = evColor(hitOf(ball)?.ev, colors.faint);
                    // Arco desde home: la curva sube más con el ángulo de salida
                    const lift = Math.max(4, Math.min(40, (hitOf(ball)?.la ?? 10) * 0.6));
                    const qx = bx / 2;
                    const qy = by / 2 - lift;
                    return (
                        <G key={ball.atBat.i} opacity={selected !== null && !active ? 0.3 : 1}>
                            <DrawPath d={`M 0 0 Q ${qx} ${qy} ${bx} ${by}`} length={quadLength(0, 0, qx, qy, bx, by)} seen={seen} index={index} fill="none" stroke={color} strokeWidth={active ? 1.6 : 0.8} strokeOpacity={0.7} />
                            <Circle cx={bx} cy={by} r={ball.kind === 'hr' ? 4.4 : 3.4} fill={color} stroke={colors.surface} strokeWidth={0.9} />
                            {active && <Circle cx={bx} cy={by} r={7} fill="none" stroke={colors.ink} strokeWidth={1.2} />}
                        </G>
                    );
                })}
            </Svg>
        </View>
    );
};

export const ContactTab: React.FC<ContactTabProps> = ({ game, pro }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const [filter, setFilter] = useState<Filter>('all');
    const [batter, setBatter] = useState<number | 'all'>('all');
    const [selected, setSelected] = useState<number | null>(null);
    const all = useMemo(() => battedBalls(game.atBats), [game.atBats]);
    const batters = useMemo(() => {
        const map = new Map<number, string>();
        for (const ball of all) if (filter === 'all' || ball.side === filter) map.set(ball.atBat.batter.id, ball.atBat.batter.name);
        return [...map.entries()].sort((a, b) => lastName(a[1]).localeCompare(lastName(b[1])));
    }, [all, filter]);
    const balls = all.filter((ball) => (filter === 'all' || ball.side === filter) && (batter === 'all' || ball.atBat.batter.id === batter));
    const withEv = balls.filter((ball) => typeof hitOf(ball)?.ev === 'number');
    const hardest = [...withEv].sort((a, b) => (hitOf(b)!.ev as number) - (hitOf(a)!.ev as number)).slice(0, 5);
    const current = balls.find((ball) => ball.atBat.i === selected) ?? null;
    const fence = fenceDistances(pro?.game.venue.field ?? null);
    const tracked = withEv.length > 0;
    const barrels = balls.filter((ball) => inBarrel(hitOf(ball)?.ev, hitOf(ball)?.la)).length;
    const untracked = balls.length - withEv.length;
    // Promedio y máxima por bateador (solo batazos con velocidad)
    const byBatter = (() => {
        const map = new Map<number, { name: string; side: 'away' | 'home'; evs: number[] }>();
        for (const ball of withEv) {
            const row = map.get(ball.atBat.batter.id) ?? { name: ball.atBat.batter.name, side: ball.side, evs: [] };
            row.evs.push(hitOf(ball)!.ev as number);
            map.set(ball.atBat.batter.id, row);
        }
        return [...map.entries()]
            .map(([id, row]) => ({ id, ...row, avg: row.evs.reduce((sum, ev) => sum + ev, 0) / row.evs.length, max: Math.max(...row.evs) }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 8);
    })();

    if (!all.length) return <ProNote tone="neutral">{t('pro.vivo.contact.none')}</ProNote>;

    const pickTeam = (value: Filter) => {
        setFilter(value);
        setBatter('all');
        setSelected(null);
    };
    const pickBatter = (value: number | 'all') => {
        setBatter(value);
        setSelected(null);
    };
    const toggle = (i: number) => setSelected(selected === i ? null : i);
    const detail = (ball: BattedBall) =>
        [
            fmtMph(hitOf(ball)?.ev, lang) ? `${fmtMph(hitOf(ball)?.ev, lang)} mph` : null,
            typeof hitOf(ball)?.la === 'number' ? `${hitOf(ball)!.la}°` : null,
            hitOf(ball)?.dist && hitOf(ball)!.dist! > 30 ? t('pro.zona.feet', { value: hitOf(ball)!.dist }) : null
        ]
            .filter(Boolean)
            .join(' · ');
    const count = (side: Filter) => all.filter((ball) => side === 'all' || ball.side === side).length;
    const evMin = byBatter.length ? Math.min(80, ...byBatter.map((row) => Math.floor(row.avg))) : 80;
    const evMax = byBatter.length ? Math.max(...byBatter.map((row) => row.max)) : 110;

    return (
        <View style={{ gap: 16 }}>
            <View style={{ gap: 8 }}>
                <ChipRow label={t('pro.vivo.contact.teams')}>
                    {(['all', 'away', 'home'] as const).map((value) => (
                        <ChipButton
                            key={value}
                            active={filter === value}
                            onPress={() => pickTeam(value)}
                            icon={value === 'all' ? undefined : <TeamLogo team={game[value]} size={18} />}
                            accessibilityLabel={`${value === 'all' ? t('pro.vivo.contact.both') : game[value].name}: ${count(value)}`}
                        >
                            <Txt size={13} weight="bold" color={filter === value ? colors.bg : colors.ink}>
                                {value === 'all' ? t('pro.vivo.contact.both') : teamShortName(game[value])}
                                <Txt size={13} weight="semibold" color={filter === value ? alpha(colors.bg, 0.7) : colors.muted}>
                                    {` ${count(value)}`}
                                </Txt>
                            </Txt>
                        </ChipButton>
                    ))}
                </ChipRow>
                <ChipRow label={t('pro.vivo.contact.batter')}>
                    <ChipButton active={batter === 'all'} onPress={() => pickBatter('all')}>
                        {t('pro.vivo.contact.allBatters')}
                    </ChipButton>
                    {batters.map(([id, name]) => (
                        <ChipButton key={id} active={batter === id} onPress={() => pickBatter(id)} accessibilityLabel={name}>
                            {lastName(name)}
                        </ChipButton>
                    ))}
                </ChipRow>
            </View>

            {current && (
                <View accessibilityLiveRegion="polite" style={{ borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12 }}>
                    <Txt size={14} weight="extrabold">
                        {current.atBat.batter.name} · <Txt size={14} weight="extrabold" color={colors.accentInk}>{eventName(current.atBat, lang)}</Txt>
                    </Txt>
                    <Txt size={14} tone="muted">
                        {[halfInning(current.atBat.inning, current.atBat.top, lang), detail(current)].filter(Boolean).join(' · ')}
                    </Txt>
                </View>
            )}

            <ProSection title={t('pro.vivo.contact.evla')} aside={tracked ? t('pro.vivo.contact.balls', { count: withEv.length }) : undefined} bodyStyle={{ gap: 8 }}>
                {tracked ? (
                    <>
                        <EvLaChart game={game} balls={balls} selected={selected} onSelect={toggle} label={t('pro.vivo.contact.evlaAria', { count: withEv.length })} />
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} />
                                <Txt size={11} weight="semibold" tone="muted">
                                    {t('pro.vivo.contact.legendHit')}
                                </Txt>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.ink }} />
                                <Txt size={11} weight="semibold" tone="muted">
                                    {t('pro.vivo.contact.legendOut')}
                                </Txt>
                            </View>
                            <Txt size={11} weight="semibold" tone="muted">
                                {t('pro.vivo.contact.teamColors', { away: teamShortName(game.away), home: teamShortName(game.home) })}
                            </Txt>
                            <Txt size={11} weight="semibold" tone="muted">
                                {t('pro.vivo.contact.inBarrel', { count: barrels })}
                            </Txt>
                        </View>
                        <Txt size={12} tone="muted">
                            {t('pro.vivo.contact.barrelNote')}
                        </Txt>
                    </>
                ) : (
                    <ProNote tone="pending">{`${t('pro.kit.game.noTracking')} ${t('pro.vivo.contact.noEv')}`}</ProNote>
                )}
            </ProSection>

            <ProSection title={t('pro.vivo.contact.spray')} bodyStyle={{ gap: 8 }}>
                <SprayField balls={balls} selected={selected} fence={fence} label={t('pro.vivo.contact.sprayAria', { count: balls.length })} />
                <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Txt size={11} weight="semibold" tone="muted" tabular>
                        {EV_MIN}
                    </Txt>
                    <LinearGradient colors={[evColor(EV_MIN, colors.faint), evColor((EV_MIN + EV_MAX) / 2, colors.faint), evColor(EV_MAX, colors.faint)]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1, height: 6, borderRadius: 3 }} />
                    <Txt size={11} weight="semibold" tone="muted" tabular>
                        {EV_MAX}+ mph
                    </Txt>
                </View>
                <Txt size={12} tone="muted">
                    {fence ? t('pro.vivo.contact.park', { venue: game.venue }) : t('pro.vivo.contact.genericPark')}
                </Txt>
            </ProSection>

            {hardest.length > 0 && (
                <ProSection title={t('pro.vivo.contact.hardest')} bodyStyle={{ padding: 8 }}>
                    {hardest.map((ball, index) => {
                        const active = selected === ball.atBat.i;
                        const hit = hitOf(ball)!;
                        const barrel = inBarrel(hit.ev, hit.la);
                        return (
                            <Pressable
                                key={ball.atBat.i}
                                onPress={() => toggle(ball.atBat.i)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`${index + 1}. ${ball.atBat.batter.name}, ${eventName(ball.atBat, lang)}, ${halfInning(ball.atBat.inning, ball.atBat.top, lang)}, ${detail(ball)}`}
                                style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.tile, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: active ? alpha(colors.accent, 0.15) : 'transparent' }}
                            >
                                <Txt condensed size={18} tone="muted" style={{ width: 16, textAlign: 'center' }}>
                                    {index + 1}
                                </Txt>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: game[ball.side].color }} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Txt size={14} weight="extrabold" numberOfLines={1}>
                                        {lastName(ball.atBat.batter.name)}{' '}
                                        <Txt size={11} weight="extrabold" tone="muted">
                                            {game[ball.side].abbrev}
                                        </Txt>
                                    </Txt>
                                    <Txt size={12} tone="muted" numberOfLines={1}>
                                        {halfInning(ball.atBat.inning, ball.atBat.top, lang)} · {eventName(ball.atBat, lang)}
                                        {barrel ? ` · ${t('pro.vivo.contact.barrel')}` : ''}
                                    </Txt>
                                </View>
                                <Txt size={12} tone="muted" tabular numberOfLines={1} style={{ maxWidth: 92, textAlign: 'right' }}>
                                    {[typeof hit.la === 'number' ? `${hit.la}°` : null, hit.dist && hit.dist > 30 ? t('pro.zona.feet', { value: hit.dist }) : null].filter(Boolean).join(' · ')}
                                </Txt>
                                <Txt condensed size={20} tabular color={evColor(hit.ev, colors.faint)} style={{ minWidth: 44, textAlign: 'right' }}>
                                    {fmtMph(hit.ev, lang)}
                                </Txt>
                            </Pressable>
                        );
                    })}
                </ProSection>
            )}

            {byBatter.length > 1 && (
                <ProSection title={t('pro.vivo.contact.byBatter')} aside={t('pro.vivo.contact.byBatterAside')} bodyStyle={{ gap: 10 }}>
                    {byBatter.map((row, index) => {
                        const span = Math.max(1, evMax - evMin);
                        const share = Math.max(0.02, (row.avg - evMin) / span);
                        const mark = Math.min(1, (row.max - evMin) / span);
                        return (
                            <View key={row.id} accessible accessibilityLabel={t('pro.vivo.contact.byBatterAria', { name: row.name, avg: fmtMph(row.avg, lang), max: fmtMph(row.max, lang), count: row.evs.length })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Txt size={13} weight="extrabold" numberOfLines={1} style={{ width: 96 }}>
                                    {lastName(row.name)}{' '}
                                    <Txt size={11} weight="semibold" tone="muted">
                                        {row.evs.length}
                                    </Txt>
                                </Txt>
                                <View style={{ flex: 1, height: 10 }}>
                                    <GrowBar value={share} color={game[row.side].color} index={index} height={10} />
                                    <View style={{ position: 'absolute', left: `${mark * 100}%`, top: -3, width: 2, height: 16, marginLeft: -1, backgroundColor: colors.ink }} />
                                </View>
                                <Txt condensed size={17} tabular style={{ width: 40, textAlign: 'right' }}>
                                    {fmtMph(row.avg, lang)}
                                </Txt>
                            </View>
                        );
                    })}
                    <Txt size={12} tone="muted">
                        {t('pro.vivo.contact.byBatterNote')}
                    </Txt>
                </ProSection>
            )}

            {untracked > 0 && tracked && <ProNote tone="pending">{t('pro.vivo.contact.untracked', { count: untracked })}</ProNote>}
        </View>
    );
};
