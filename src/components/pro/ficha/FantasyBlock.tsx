import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react-native';
import type { PlayerDetail, PlayerRow } from '../../../lib/stats';
import { useColors } from '../../../theme/theme';
import { alpha, fonts, radius, shadow } from '../../../theme/tokens';
import { Txt } from '../../ui';
import { Chip, CountUp, DrawPath, MOTION_EASE, MOTION_MS, ModuleHeader, StatTile, linePath, middle, niceTicks, polylineLength, useAxisText, useChartBox, useInView, useMotion, useProColors, type Point } from '../kit';
import { chronological, movingAverage } from '../estadisticas/logic';
import { monthName, shortDate } from './format';

interface FantasyBlockProps {
    player: PlayerDetail;
    /** Todos los peloteros de la liga esa temporada (para el puesto en puntos) */
    all: PlayerRow[];
    seasonText: string;
    league: string;
}

const fmt = (value: number) => String(Math.round(value * 10) / 10);

// Fantasy de la temporada en su color propio (no el degradado PRO): puntos, puesto en la liga, puntos por juego,
// el mejor juego y una barra por juego con la línea del promedio móvil de 5.
export const FantasyBlock: React.FC<FantasyBlockProps> = ({ player, all, seasonText, league }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const { setNode, onLayout, seen } = useInView();
    const games = useMemo(() => chronological(player.log), [player.log]);
    if (!player.g || !games.length) return null;
    const rank = all.length ? 1 + all.filter((row) => row.pts > player.pts).length : null;
    const best = games.reduce((top, game) => (game.pts > top.pts ? game : top), games[0]);
    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.ficha.fantasy.title', { season: seasonText })} />
            <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(pro.fantasy, 0.35), padding: 16 }, shadow('card')]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <View ref={setNode} onLayout={onLayout} style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                            <Txt style={{ fontFamily: fonts.condensed, fontSize: 52, lineHeight: 54, color: pro.fantasy, fontVariant: ['tabular-nums'] }}>
                                <CountUp value={player.pts} format={fmt} seen={seen} />
                            </Txt>
                            <Txt size={15} weight="bold" color={pro.fantasy}>
                                {t('pro.ficha.fantasy.pts')}
                            </Txt>
                        </View>
                        {rank !== null && rank <= 10 && (
                            <Chip tone="fantasy" icon={<Sparkles size={14} color={pro.fantasy} />} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                                {t('pro.ficha.fantasy.rank', { rank, league })}
                            </Chip>
                        )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <StatTile value={fmt(player.ppg)} label={t('pro.ficha.fantasy.ppg')} size="sm" align="center" style={{ minWidth: 64 }} />
                        <StatTile value={fmt(best.pts)} label={t('pro.ficha.fantasy.best')} size="sm" align="center" style={{ minWidth: 64 }} />
                    </View>
                </View>
                {games.length > 1 && <FantasyBars games={games} lang={i18n.language} best={best} />}
            </View>
        </View>
    );
};

interface BarGame {
    gamePk: number;
    date: string;
    pts: number;
    opponent: { abbrev: string } | null;
    isHome: boolean;
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** Barra de un juego: crece desde la línea del cero (hacia arriba o, si es negativo, hacia abajo) */
const Bar: React.FC<{ x: number; width: number; top: number; height: number; zero: number; negative: boolean; color: string; opacity: number; index: number; seen: boolean }> = ({ x, width, top, height, zero, negative, color, opacity, index, seen }) => {
    const motion = useMotion();
    const grow = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            grow.set(1);
            return;
        }
        if (!seen) return;
        grow.set(withDelay(motion.delay(index, 12), withTiming(1, { duration: MOTION_MS.bar, easing: MOTION_EASE })));
        return () => cancelAnimation(grow);
    }, [seen, motion, index, grow]);
    const animatedProps = useAnimatedProps(() => {
        const h = height * grow.get();
        return { height: h, y: negative ? zero : zero - h };
    });
    // `top` ya es zero − height para las positivas: se usa solo como valor inicial sin animar
    return <AnimatedRect x={x} y={negative ? zero : top} width={width} height={height} rx={Math.min(2, width / 2)} fill={color} fillOpacity={opacity} animatedProps={animatedProps} />;
};

const FantasyBars: React.FC<{ games: BarGame[]; lang: string; best: BarGame }> = ({ games, lang, best }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const axis = useAxisText();
    const { setNode, onLayout, width, seen } = useChartBox(300);
    const height = 150;
    const pad = { left: 26, right: 4, top: 18, bottom: 22 };
    const values = games.map((game) => game.pts);
    const average = movingAverage(values, 5);
    const low = Math.min(0, ...values);
    const high = Math.max(1, ...values);
    const ticks = niceTicks(low, high, 3).filter((tick) => tick >= low && tick <= high);
    const plotW = Math.max(10, width - pad.left - pad.right);
    const plotH = height - pad.top - pad.bottom;
    const band = plotW / games.length;
    const x = (index: number) => pad.left + band * index + band / 2;
    const y = (value: number) => pad.top + (1 - (value - low) / (high - low || 1)) * plotH;
    const zero = y(0);
    const barW = Math.max(1.5, Math.min(10, band * 0.66));
    const months: { index: number; label: string }[] = [];
    games.forEach((game, index) => {
        const month = Number(game.date.slice(5, 7));
        if (!months.length || Number(games[months[months.length - 1].index].date.slice(5, 7)) !== month) months.push({ index, label: monthName(month, lang) });
    });
    const bestIndex = games.indexOf(best);
    const peakLabel = t('pro.ficha.fantasy.peak', { pts: fmt(best.pts), date: shortDate(best.date, lang), where: best.isHome ? t('pro.ficha.today.vs') : t('pro.ficha.today.at'), rival: best.opponent?.abbrev ?? '' });
    const peakX = Math.min(Math.max(x(bestIndex), pad.left + 60), width - 60);
    const line: Point[] = average.map((value, index) => [x(index), y(value)]);
    const label = t('pro.ficha.fantasy.chartAria', { count: games.length, avg: fmt(values.reduce((sum, value) => sum + value, 0) / values.length), peak: peakLabel, negative: values.filter((value) => value < 0).length });
    return (
        <View style={{ marginTop: 16 }}>
            <View ref={setNode} onLayout={onLayout}>
                <View accessible accessibilityRole="image" accessibilityLabel={label}>
                    <Svg width={width} height={height}>
                        {ticks.map((tick) => (
                            <G key={tick}>
                                <Line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke={alpha(colors.line, 0.08)} />
                                <SvgText x={pad.left - 6} y={y(tick)} dy={middle(11)} textAnchor="end" {...axis}>
                                    {String(tick)}
                                </SvgText>
                            </G>
                        ))}
                        {games.map((game, index) => {
                            const negative = game.pts < 0;
                            const h = Math.max(1.5, Math.abs(y(game.pts) - zero));
                            return (
                                <Bar
                                    key={game.gamePk}
                                    x={x(index) - barW / 2}
                                    width={barW}
                                    top={zero - h}
                                    height={h}
                                    zero={zero}
                                    negative={negative}
                                    color={negative ? pro.down : pro.fantasy}
                                    opacity={index === bestIndex ? 1 : 0.78}
                                    index={index}
                                    seen={seen}
                                />
                            );
                        })}
                        <Line x1={pad.left} x2={width - pad.right} y1={zero} y2={zero} stroke={alpha(colors.line, 0.3)} />
                        <DrawPath d={linePath(line)} length={polylineLength(line)} seen={seen} fill="none" stroke={colors.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                        <SvgText x={peakX} y={Math.max(11, y(best.pts) - 6)} textAnchor="middle" fontFamily={fonts.extrabold} fontSize={11} fill={pro.fantasy}>
                            {peakLabel}
                        </SvgText>
                        {months.map((month) => (
                            <SvgText key={month.index} x={x(month.index)} y={height - 4} {...axis}>
                                {month.label}
                            </SvgText>
                        ))}
                    </Svg>
                </View>
            </View>
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: pro.fantasy }} />
                    <Txt size={11} weight="semibold" tone="muted">
                        {t('pro.ficha.fantasy.perGame')}
                    </Txt>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 12, height: 2, borderRadius: 1, backgroundColor: colors.ink }} />
                    <Txt size={11} weight="semibold" tone="muted">
                        {t('pro.ficha.fantasy.avg5')}
                    </Txt>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: pro.down }} />
                    <Txt size={11} weight="semibold" tone="muted">
                        {t('pro.ficha.fantasy.negative')}
                    </Txt>
                </View>
            </View>
        </View>
    );
};
