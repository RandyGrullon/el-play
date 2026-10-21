import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type { TFunction } from 'i18next';
import type { AtBat, GameDetail } from '../../../../types';
import type { GamePro, WinProb } from '../../../../lib/pro/juego';
import { eventName, pitchTypeColor, pitchTypeName } from '../../../../lib/baseball';
import { fonts, radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { StrikeZone } from '../../../game/StrikeZone';
import { uniformColors } from '../../../game/BatterFigure';
import { DrawPath, fmtSigned, linePath, linearScale, middle, polylineLength, stepLength, stepPath, useChartBox, type Point } from '../../kit';
import { inningLabel, ordinal } from '../previa/logica';
import { bestStrikeout, bigInning, countBeforeLast, cumulativeRuns, halfInning, keySwings, leadStory, maxLeverage, pitchSpot, recordsFromLite, scoreBefore, type Side, type SwingPlay } from './logica';
import { contextText, headlineOf, joinNames, resultText } from './text';

// Diapositivas de la historia PRO del final. Cada una sale solo si su dato existe: la jugada que lo cambió todo
// (mayor |WPA| de MLB), el mejor pitcheo (el ponche que más ayudó), el batazo más duro (con su trayectoria desde
// home), la entrada grande y «así fue el juego» (marcador por entrada). Todo va sobre el color del ganador.

export interface StoryTheme {
    /** Color del ganador (fondo de la historia) */
    bg: string;
    /** Texto sobre el color del ganador */
    ink: string;
    /** Relleno suave de tiles y chips sobre ese color */
    soft: string;
    /** Color de lo destacado (oro si contrasta; si no, el texto) */
    accent: string;
    /** Tamaño del título y de la cifra grande según el ancho de la pantalla */
    title: number;
    big: number;
}

export interface StorySlide {
    id: string;
    pill: string;
    content: React.ReactNode;
}

const Pill: React.FC<{ children: string; theme: StoryTheme }> = ({ children, theme }) => (
    <View style={{ alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.soft }}>
        <Txt size={12} weight="extrabold" color={theme.ink}>
            {children}
        </Txt>
    </View>
);

const Tiles: React.FC<{ items: { value: string; label: string }[]; theme: StoryTheme }> = ({ items, theme }) => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
        {items.map((item) => (
            <View key={item.label} accessible accessibilityLabel={`${item.label}: ${item.value}`} style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: 2, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: theme.soft }}>
                <Txt condensed size={Math.min(22, theme.title * 0.74)} tabular numberOfLines={1} color={theme.ink} style={{ lineHeight: 24 }}>
                    {item.value}
                </Txt>
                <Txt size={10} weight="extrabold" color={theme.ink} numberOfLines={2} style={{ textTransform: 'uppercase', letterSpacing: 0.8, lineHeight: 12, opacity: 0.9 }}>
                    {item.label}
                </Txt>
            </View>
        ))}
    </View>
);

const Title: React.FC<{ children: string; theme: StoryTheme }> = ({ children, theme }) => (
    <Txt size={theme.title} weight="black" color={theme.ink} accessibilityRole="header" style={{ lineHeight: Math.round(theme.title * 1.06), letterSpacing: -0.5 }}>
        {children}
    </Txt>
);

const Lead: React.FC<{ children: string; theme: StoryTheme }> = ({ children, theme }) => (
    <Txt size={14} weight="semibold" color={theme.ink} style={{ lineHeight: 19 }}>
        {children}
    </Txt>
);

// ---------------------------------------------------------------- 1. La jugada que lo cambió todo

const TeamLine: React.FC<{ winProb: WinProb; swing: SwingPlay; theme: StoryTheme; label: string }> = ({ winProb, swing, theme, label }) => {
    const { setNode, onLayout, width, seen } = useChartBox(280);
    const plays = winProb.plays;
    const height = 64;
    const x = linearScale([0, Math.max(1, plays.length - 1)], [2, width - 2]);
    const y = linearScale([0, 100], [60, 4]);
    const value = (home: number) => (swing.side === 'home' ? home : 100 - home);
    const points: Point[] = plays.map((play, index) => [x(index), y(value(play.home))]);
    const at = plays.findIndex((play) => play.i === swing.play.i);
    const end = points[at];
    const start = points[at - 1] ?? [x(0), y(swing.before)];
    return (
        <View ref={setNode} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: '100%', height }}>
            <Svg width={width} height={height}>
                <Line x1={0} x2={width} y1={32} y2={32} stroke={theme.ink} strokeOpacity={0.45} strokeDasharray="3 4" />
                <DrawPath d={linePath(points)} length={polylineLength(points)} seen={seen} fill="none" stroke={theme.ink} strokeWidth={2} strokeLinejoin="round" />
                {end ? (
                    <>
                        <Line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke={theme.accent} strokeWidth={5} strokeLinecap="round" />
                        <Circle cx={end[0]} cy={end[1]} r={4} fill={theme.accent} stroke={theme.ink} strokeWidth={1.5} />
                    </>
                ) : null}
            </Svg>
        </View>
    );
};

const turningSlide = (game: GameDetail, pro: GamePro | undefined, winProb: WinProb, swing: SwingPlay, theme: StoryTheme, t: TFunction, lang: string): StorySlide => {
    const atBat = swing.atBat;
    const team = game[swing.side].abbrev;
    const last = atBat.pitches[atBat.pitches.length - 1];
    const hit = last?.hit;
    const result = resultText(game, pro, atBat, t);
    const top = maxLeverage(winProb);
    const tiles = [
        last?.mph ? { value: last.mph.toFixed(1), label: t('pro.final.story.pitchMph', { type: pitchTypeName(last, lang) }) } : null,
        { value: countBeforeLast(atBat), label: t('pro.final.story.count') },
        hit?.ev ? { value: hit.ev.toFixed(1), label: t('pro.final.story.exitMph') } : hit?.dist ? { value: `${hit.dist}`, label: t('pro.final.story.feet') } : null
    ].filter(Boolean) as { value: string; label: string }[];
    const gain = `${fmtSigned(swing.gain, 1)} %`;
    const change = `${swing.before.toFixed(1)} % → ${swing.after.toFixed(1)} %`;
    return {
        id: 'turning',
        pill: t('pro.final.story.turning'),
        content: (
            <>
                <Pill theme={theme}>{t('pro.final.story.turning')}</Pill>
                <Title theme={theme}>{headlineOf(atBat, t, lang)}</Title>
                <Lead theme={theme}>{[contextText(game, pro, atBat, t, lang), result].filter(Boolean).join(' · ')}</Lead>
                <View accessible accessibilityLabel={`${gain}. ${t('pro.final.story.probOf', { team })} ${change}`} style={{ gap: 4 }}>
                    <Txt condensed size={theme.big} tabular color={theme.accent} numberOfLines={1} style={{ lineHeight: Math.round(theme.big * 0.95) }}>
                        {gain}
                    </Txt>
                    <Txt size={13} weight="bold" color={theme.ink}>
                        {`${t('pro.final.story.probOf', { team })} `}
                        <Txt condensed size={17} tabular color={theme.ink}>
                            {change}
                        </Txt>
                    </Txt>
                </View>
                <View style={{ borderRadius: radius.tile, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, backgroundColor: theme.soft }}>
                    <View style={{ marginBottom: 4, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 8 }}>
                        <Txt size={10} weight="extrabold" color={theme.ink} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            {t('pro.final.story.allGame', { team })}
                        </Txt>
                        {swing.play.li !== null ? (
                            <Txt size={10} weight="extrabold" color={theme.accent}>
                                {t(swing.play.li >= top ? 'pro.final.story.pressureTop' : 'pro.final.story.pressure', { value: swing.play.li.toFixed(2) })}
                            </Txt>
                        ) : null}
                    </View>
                    <TeamLine winProb={winProb} swing={swing} theme={theme} label={t('pro.final.story.lineAria', { team, batter: atBat.batter.name })} />
                </View>
                {tiles.length > 0 ? <Tiles items={tiles} theme={theme} /> : null}
            </>
        )
    };
};

// ---------------------------------------------------------------- 2. Mejor pitcheo

const pitchSlide = (game: GameDetail, best: NonNullable<ReturnType<typeof bestStrikeout>>, theme: StoryTheme, t: TFunction, lang: string): StorySlide => {
    const atBat = best.atBat;
    const last = atBat.pitches[atBat.pitches.length - 1];
    const spot = last ? pitchSpot(last, atBat.batter.side) : null;
    const called = last?.code === 'C';
    const types = [...new Set(atBat.pitches.map((pitch) => pitch.type).filter(Boolean))] as string[];
    const pitcherSide: Side = atBat.top ? 'home' : 'away';
    const ks = game.box[pitcherSide].pitchers.find((line) => line.id === atBat.pitcher.id)?.k ?? null;
    const detail = [last?.spin ? `${last.spin} rpm` : null, t('pro.final.story.countAt', { value: countBeforeLast(atBat) })].filter(Boolean).join(' · ');
    const where = spot ? t(`pro.final.story.spot.${spot.inZone ? 'in' : 'out'}`, { height: t(`pro.final.story.height.${spot.height}`), side: t(`pro.final.story.side.${spot.side}`) }) : null;
    return {
        id: 'pitch',
        pill: t('pro.final.story.bestPitch'),
        content: (
            <>
                <Pill theme={theme}>{t('pro.final.story.bestPitch')}</Pill>
                <Title theme={theme}>{t('pro.final.story.pitchOf', { pitch: last ? pitchTypeName(last, lang) : t('pro.final.play.pitch'), pitcher: atBat.pitcher.name })}</Title>
                <Lead theme={theme}>{`${inningLabel(atBat.inning, atBat.top, lang)} · ${t(called ? 'pro.final.story.kCalled' : 'pro.final.story.kSwinging', { batter: atBat.batter.name })}`}</Lead>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.tile, padding: 12, backgroundColor: theme.soft }}>
                    <View style={{ width: 118, borderRadius: radius.tile, padding: 6, backgroundColor: 'rgba(255,255,255,0.92)' }}>
                        <StrikeZone pitches={atBat.pitches} batterSide={atBat.batter.side} uniform={uniformColors(game[atBat.top ? 'away' : 'home'], !atBat.top)} showLegend={false} maxWidth={106} light />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                        {last?.mph ? (
                            <Txt color={theme.ink}>
                                <Txt condensed size={44} tabular color={theme.ink}>
                                    {last.mph.toFixed(1)}
                                </Txt>
                                <Txt size={13} weight="bold" color={theme.ink}>
                                    {' mph'}
                                </Txt>
                            </Txt>
                        ) : null}
                        <Txt size={13} weight="semibold" color={theme.ink} style={{ lineHeight: 18 }}>
                            {where ? `${detail}\n${where}` : detail}
                        </Txt>
                        {types.length > 0 ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 4 }}>
                                {types.map((type) => (
                                    <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pitchTypeColor(type), borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }} />
                                        <Txt size={11} weight="bold" color={theme.ink}>
                                            {pitchTypeName({ type, typeDesc: null }, lang)}
                                        </Txt>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </View>
                </View>
                <Tiles
                    theme={theme}
                    items={[
                        { value: `${fmtSigned(best.gain, 1)} %`, label: t('pro.final.story.probGain') },
                        { value: String(atBat.pitches.length), label: t('pro.final.story.pitches') },
                        ...(ks !== null ? [{ value: `${ks} K`, label: t('pro.final.story.ksGame') }] : [])
                    ]}
                />
            </>
        )
    };
};

// ---------------------------------------------------------------- 3. Batazo más duro

const HOME_X = 125.42;
const HOME_Y = 198.27;
const POLE = 92;
const FIELD_NAMES: Record<number, string> = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF' };

/** Largo de una curva cuadrática (muestreada) para dibujarla con DrawPath */
const quadLength = (p0: Point, p1: Point, p2: Point) => {
    const at = (t: number): Point => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
    return polylineLength(Array.from({ length: 25 }, (_, k) => at(k / 24)));
};

const HitPath: React.FC<{ x: number; y: number; la: number | null; theme: StoryTheme; label: string; tag: string }> = ({ x, y, la, theme, label, tag }) => {
    const { setNode, onLayout, width, seen } = useChartBox(260);
    const size = Math.min(270, width);
    const height = (size * 198) / 224;
    const dx = x - HOME_X;
    const dy = y - HOME_Y;
    // Rodado: recto por el suelo; elevado o línea: arco más alto mientras mayor el ángulo
    const lift = la !== null && la > 8 ? Math.min(70, la * 1.6) : 0;
    const control: Point = [dx / 2, dy / 2 - lift];
    const path = lift ? `M0 0 Q${control[0]} ${control[1]} ${dx} ${dy}` : `M0 0 L${dx} ${dy}`;
    const length = lift ? quadLength([0, 0], control, [dx, dy]) : Math.hypot(dx, dy);
    return (
        <View ref={setNode} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: '100%', alignItems: 'center' }}>
            <Svg width={size} height={height} viewBox="-112 -182 224 198">
                <Path d={`M0 0 L${-POLE} ${-POLE} Q0 -228 ${POLE} ${-POLE} Z`} fill={theme.ink} fillOpacity={0.08} stroke={theme.ink} strokeOpacity={0.55} strokeWidth={1.2} />
                <Path d="M0 0 L-38 -38 Q0 -84 38 -38 Z" fill={theme.ink} fillOpacity={0.06} stroke={theme.ink} strokeOpacity={0.4} strokeWidth={1} />
                <Path d="M0 -5 L-21 -26 L0 -47 L21 -26 Z" fill="none" stroke={theme.ink} strokeOpacity={0.55} strokeDasharray="2 3" />
                <Path d={path} fill="none" stroke={theme.accent} strokeOpacity={0.35} strokeWidth={9} strokeLinecap="round" />
                <DrawPath d={path} length={length} seen={seen} fill="none" stroke={theme.accent} strokeWidth={3.5} strokeLinecap="round" />
                <Circle cx={dx} cy={dy} r={6} fill={theme.accent} stroke={theme.ink} strokeWidth={2} />
                <SvgText x={dx + (dx > 0 ? -10 : 10)} y={dy - 12} dy={middle(11)} textAnchor={dx > 0 ? 'end' : 'start'} fontSize={11} fontFamily={fonts.extrabold} fill={theme.ink}>
                    {tag}
                </SvgText>
                <Circle cx={0} cy={0} r={3} fill={theme.ink} />
            </Svg>
        </View>
    );
};

const hardestSlide = (game: GameDetail, pro: GamePro | undefined, theme: StoryTheme, t: TFunction, lang: string): StorySlide | null => {
    const record = (pro?.records ?? recordsFromLite(game)).hardest;
    if (!record) return null;
    const atBat = game.atBats.find((item) => item.i === record.i);
    const hit = atBat?.pitches.find((pitch) => pitch.hit)?.hit;
    if (!atBat || !hit) return null;
    const play = pro?.plays.find((item) => item.i === atBat.i);
    const trajectory = hit.traj ? t(`pro.final.story.traj.${hit.traj}`, { defaultValue: '' }) : '';
    const where = play?.loc ? t(`pro.final.story.to.${FIELD_NAMES[play.loc]}`, { defaultValue: '' }) : '';
    const result = resultText(game, pro, atBat, t);
    const tag = [trajectory, `${record.ev.toFixed(1)} mph`].filter(Boolean).join(' · ');
    const position = hit.x !== null && hit.x !== undefined && hit.y !== null && hit.y !== undefined ? { x: hit.x, y: hit.y } : null;
    return {
        id: 'hardest',
        pill: t('pro.final.story.hardest'),
        content: (
            <>
                <Pill theme={theme}>{t('pro.final.story.hardest')}</Pill>
                <Title theme={theme}>{t('pro.final.story.hardestTitle', { ev: record.ev.toFixed(1), batter: atBat.batter.name })}</Title>
                <Lead theme={theme}>{[inningLabel(atBat.inning, atBat.top, lang), [trajectory, where].filter(Boolean).join(' ') || eventName(atBat, lang), result].filter(Boolean).join(' · ')}</Lead>
                {position ? (
                    <View style={{ borderRadius: radius.tile, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.soft }}>
                        <HitPath
                            x={position.x}
                            y={position.y}
                            la={record.la}
                            theme={theme}
                            tag={tag}
                            label={t('pro.final.story.hitAria', { batter: atBat.batter.name, event: eventName(atBat, lang), ev: record.ev.toFixed(1), la: record.la ?? '—' })}
                        />
                    </View>
                ) : null}
                <Tiles
                    theme={theme}
                    items={[
                        ...(record.la !== null ? [{ value: `${fmtSigned(record.la)}°`, label: t('pro.final.story.angle') }] : []),
                        ...(record.dist !== null ? [{ value: `${record.dist}`, label: t('pro.final.story.feet') }] : []),
                        { value: eventName(atBat, lang), label: t('pro.final.story.result') }
                    ]}
                />
            </>
        )
    };
};

// ---------------------------------------------------------------- 4. La entrada grande

const GOOD = ['single', 'double', 'triple', 'home_run', 'walk', 'intent_walk', 'hit_by_pitch'];

const bigInningSlide = (game: GameDetail, pro: GamePro | undefined, theme: StoryTheme, t: TFunction, lang: string): StorySlide | null => {
    const big = bigInning(pro?.linescore, game.linescore);
    if (!big || big.runs < 2) return null;
    const turns = halfInning(game.atBats, big.inning, big.side);
    if (!turns.length) return null;
    const other: Side = big.side === 'away' ? 'home' : 'away';
    const before = scoreBefore(game.atBats, turns[0].i);
    const after = turns[turns.length - 1];
    const pitchers = [...new Set(turns.map((atBat) => atBat.pitcher.name))];
    const team = game[big.side].abbrev;
    const score = (atBat: Pick<AtBat, 'away' | 'home'>) => `${atBat[big.side] ?? 0}-${atBat[other] ?? 0}`;
    return {
        id: 'inning',
        pill: t('pro.final.story.bigInning'),
        content: (
            <>
                <Pill theme={theme}>{t('pro.final.story.bigInning')}</Pill>
                <Title theme={theme}>
                    {big.hits !== null
                        ? t('pro.final.story.bigTitle', { runs: big.runs, hits: big.hits, inning: ordinal(big.inning, lang, 'f') })
                        : t('pro.final.story.bigTitleRuns', { runs: big.runs, inning: ordinal(big.inning, lang, 'f') })}
                </Title>
                <Lead theme={theme}>{`${t('pro.final.story.against', { names: joinNames(pitchers, t) })} · ${t('pro.final.story.fromTo', { team, from: score(before), to: score(after) })}`}</Lead>
                <View style={{ gap: 2, borderRadius: radius.tile, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.soft }}>
                    {turns.slice(0, 11).map((atBat, index) => {
                        const good = GOOD.includes(atBat.event ?? '') || atBat.rbi > 0;
                        const event = `${eventName(atBat, lang)}${atBat.rbi > 0 ? ` · ${t('pro.final.story.rbi', { count: atBat.rbi })}` : ''}`;
                        return (
                            <View key={atBat.i} accessible accessibilityLabel={`${index + 1}. ${atBat.batter.name}: ${event}, ${score(atBat)}`} style={{ minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Txt condensed size={14} tabular color={theme.ink} style={{ width: 18, opacity: 0.9 }}>
                                    {index + 1}
                                </Txt>
                                <Txt size={13} weight="semibold" color={theme.ink} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                    {atBat.batter.name}
                                </Txt>
                                <View style={{ borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: good ? theme.ink : theme.soft, maxWidth: '45%' }}>
                                    <Txt size={11} weight="extrabold" color={good ? theme.bg : theme.ink} numberOfLines={1}>
                                        {event}
                                    </Txt>
                                </View>
                                <Txt condensed size={15} tabular color={theme.ink} style={{ width: 40, textAlign: 'right' }}>
                                    {score(atBat)}
                                </Txt>
                            </View>
                        );
                    })}
                </View>
            </>
        )
    };
};

// ---------------------------------------------------------------- 5. Así fue el juego

const ScoreSteps: React.FC<{ game: GameDetail; theme: StoryTheme; winner: Side; label: string }> = ({ game, theme, winner, label }) => {
    const { setNode, onLayout, width, seen } = useChartBox(280);
    const height = 188;
    const innings = Math.max(game.scheduledInnings || 9, game.linescore.length);
    const away = cumulativeRuns(game.linescore, 'away');
    const home = cumulativeRuns(game.linescore, 'home');
    const top = Math.max(1, ...away, ...home);
    const right = width - 26;
    const x = linearScale([0, innings], [0, right]);
    const y = linearScale([0, top], [158, 12]);
    const ticks = [0, Math.round(top / 2), top].filter((value, index, list) => list.indexOf(value) === index);
    const loser: Side = winner === 'away' ? 'home' : 'away';
    const values = { away, home };
    return (
        <View ref={setNode} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: '100%', height }}>
            <Svg width={width} height={height}>
                {ticks.map((tick) => (
                    <React.Fragment key={tick}>
                        <Line x1={0} x2={right} y1={y(tick)} y2={y(tick)} stroke={theme.ink} strokeOpacity={0.18} />
                        <SvgText x={width} y={y(tick)} dy={middle(11)} textAnchor="end" fontSize={11} fontFamily={fonts.bold} fill={theme.ink}>
                            {String(tick)}
                        </SvgText>
                    </React.Fragment>
                ))}
                <DrawPath d={stepPath(values[loser], x, y)} length={stepLength(values[loser], x, y)} seen={seen} fill="none" stroke={theme.ink} strokeOpacity={0.55} strokeWidth={3} strokeLinejoin="round" />
                <DrawPath d={stepPath(values[winner], x, y)} length={stepLength(values[winner], x, y)} seen={seen} index={1} fill="none" stroke={theme.ink} strokeWidth={3.5} strokeLinejoin="round" />
                {Array.from({ length: innings }, (_, index) => (
                    <SvgText key={index} x={x(index + 0.5)} y={180} dy={middle(11)} textAnchor="middle" fontSize={11} fontFamily={fonts.bold} fill={theme.ink}>
                        {String(index + 1)}
                    </SvgText>
                ))}
            </Svg>
        </View>
    );
};

const summarySlide = (game: GameDetail, theme: StoryTheme, t: TFunction, lang: string): StorySlide => {
    const winner: Side = game.home.isWinner ? 'home' : 'away';
    const loser: Side = winner === 'away' ? 'home' : 'away';
    const story = leadStory(game.atBats, winner, game.scheduledInnings || 9);
    const team = game[winner].abbrev;
    const title = story ? t(`pro.final.story.lead.${story.kind}`, { team, inning: ordinal(story.inning, lang, 'f') }) : t('pro.final.story.won', { team });
    const loserInnings = game.linescore.filter((inning) => (inning[loser] ?? 0) > 0).map((inning) => ordinal(inning.n, lang, 'f'));
    const sub = `${t('pro.final.story.runsHits', { runs: game[winner].runs, hits: game[winner].hits })}; ${
        loserInnings.length ? t('pro.final.story.loserScored', { team: game[loser].abbrev, innings: joinNames(loserInnings, t) }) : t('pro.final.story.shutout', { team: game[loser].abbrev })
    }`;
    const away = cumulativeRuns(game.linescore, 'away');
    const home = cumulativeRuns(game.linescore, 'home');
    const key = (side: Side, strong: boolean) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: theme.ink, opacity: strong ? 1 : 0.55 }} />
            <Txt size={12} weight="bold" color={theme.ink}>{`${game[side].abbrev} ${game[side].runs}`}</Txt>
        </View>
    );
    return {
        id: 'summary',
        pill: t('pro.final.story.summary'),
        content: (
            <>
                <Pill theme={theme}>{t('pro.final.story.summary')}</Pill>
                <Title theme={theme}>{title}</Title>
                <Lead theme={theme}>{sub}</Lead>
                <View style={{ borderRadius: radius.tile, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6, backgroundColor: theme.soft }}>
                    <ScoreSteps game={game} theme={theme} winner={winner} label={t('pro.final.story.stepsAria', { away: game.away.abbrev, awayList: away.join(', '), home: game.home.abbrev, homeList: home.join(', ') })} />
                    <View style={{ marginTop: 2, flexDirection: 'row', gap: 14 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                        {key(winner, true)}
                        {key(loser, false)}
                    </View>
                </View>
            </>
        )
    };
};

/** Las diapositivas que hay datos para armar, en orden */
export const buildSlides = (game: GameDetail, pro: GamePro | undefined, winProb: WinProb | undefined, theme: StoryTheme, t: TFunction, lang: string): StorySlide[] => {
    const slides: (StorySlide | null)[] = [];
    const swing = keySwings(winProb, game.atBats)[0];
    if (winProb && swing) slides.push(turningSlide(game, pro, winProb, swing, theme, t, lang));
    const best = bestStrikeout(winProb, game.atBats);
    if (best) slides.push(pitchSlide(game, best, theme, t, lang));
    slides.push(hardestSlide(game, pro, theme, t, lang));
    slides.push(bigInningSlide(game, pro, theme, t, lang));
    if (game.linescore.length) slides.push(summarySlide(game, theme, t, lang));
    return slides.filter((slide): slide is StorySlide => slide !== null);
};
