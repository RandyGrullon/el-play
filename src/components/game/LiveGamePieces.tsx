// Piezas del juego (las mismas de la web): la pizarra con C, H, E y los retos del ABS, «Así va el juego» (probabilidad
// de victoria jugada a jugada y carreras por entrada), el lanzador en el montículo con su cansancio, los detalles del
// juego, el aviso de datos detenidos, el juego sin hit y los corredores con nombre.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Clock, Flame, Info } from 'lucide-react-native';
import type { GameDetail } from '../../types';
import { eventName, inningName, stateName } from '../../lib/baseball';
import { formatTime, lastName } from '../../lib/format';
import { biggestSwings, winNow, winSeries, type WinPoint } from '../../lib/liveWinProbability';
import { fatigueOf, hoursMinutes, noHitterOf, staleMinutes, umpireRole, velocityTrend, windText, type Fatigue } from '../../lib/liveGame';
import { winProbability, type TeamForm } from '../../lib/winProbability';
import { recordOf, useTeamStats, type TeamRow } from '../../lib/teamStats';
import { useColors } from '../../theme/theme';
import { alpha, inkOn, radius } from '../../theme/tokens';
import { Card, PlayerPhoto, Row, Segmented, TeamLogo, Txt } from '../ui';
import { useNow } from '../feed/useNow';

// ---------------------------------------------------------------- pizarra

export const LineScore: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
    const live = game.state === 'live';
    const final = game.state === 'final';
    const current = live ? game.inning : null;
    const innings = Math.max(game.scheduledInnings || 9, game.linescore.length);
    const columns = Array.from({ length: innings }, (_, index) => index + 1);
    const byInning = new Map(game.linescore.map((row) => [row.n, row]));
    const sides = ['away', 'home'] as const;
    const CELL = 22;
    const focus = current?.n ?? (final ? innings : null);
    useEffect(() => {
        if (focus && focus > 7) scroller.current?.scrollTo({ x: Math.max(0, (focus - 7) * CELL), animated: false });
    }, [focus]);

    const cell = (side: 'away' | 'home', n: number) => {
        const value = byInning.get(n)?.[side];
        const now = !!current && current.n === n && (side === 'away') === current.isTop && current.state !== 'Middle' && current.state !== 'End';
        const skipped = final && side === 'home' && n === game.linescore.length && (value === null || value === undefined);
        const text = value ?? (skipped ? 'x' : now ? '0' : '');
        return (
            <View key={n} style={{ width: CELL, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: now ? alpha(colors.live, 0.1) : 'transparent', borderWidth: now ? 1 : 0, borderColor: alpha(colors.live, 0.4) }}>
                <Txt size={13} weight={value || now ? 'extrabold' : 'regular'} tone={now ? 'live' : value ? 'ink' : 'faint'} tabular>
                    {text}
                </Txt>
            </View>
        );
    };

    return (
        <Card padded={false} style={{ overflow: 'hidden' }}>
            <Txt eyebrow style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }} accessibilityRole="header">
                {t('lineScore.title')}
            </Txt>
            <View style={{ flexDirection: 'row', paddingBottom: 8 }}>
                <View style={{ paddingLeft: 10, paddingRight: 6 }}>
                    <View style={{ height: 26 }} />
                    {sides.map((side) => (
                        <Row key={side} gap={6} style={{ height: 36, opacity: final && !game[side].isWinner ? 0.6 : 1 }}>
                            <View style={{ width: 3, height: 24, borderRadius: 2, backgroundColor: game[side].color }} />
                            <TeamLogo team={game[side]} size={20} />
                            <Txt size={13} weight="extrabold">
                                {game[side].abbrev}
                            </Txt>
                        </Row>
                    ))}
                </View>
                <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                    <View>
                        <Row gap={0} style={{ height: 26 }}>
                            {columns.map((n) => (
                                <Txt key={n} size={11} weight="bold" tone={current?.n === n ? 'live' : 'muted'} center style={{ width: CELL }}>
                                    {n}
                                </Txt>
                            ))}
                        </Row>
                        {sides.map((side) => (
                            <Row key={side} gap={0} style={{ height: 36 }}>
                                {columns.map((n) => cell(side, n))}
                            </Row>
                        ))}
                    </View>
                </ScrollView>
                <View style={{ borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: 4, paddingRight: 8 }}>
                    <Row gap={0} style={{ height: 26 }}>
                        {(['runs', 'hits', 'errors'] as const).map((key) => (
                            <Txt key={key} size={11} weight="bold" tone={key === 'runs' ? 'ink' : 'muted'} center style={{ width: key === 'runs' ? 34 : 26 }}>
                                {t(`lineScore.${key}`)}
                            </Txt>
                        ))}
                    </Row>
                    {sides.map((side) => {
                        const team = game[side];
                        const leading = team.runs > game[side === 'away' ? 'home' : 'away'].runs;
                        return (
                            <Row key={side} gap={0} style={{ height: 36 }}>
                                <View style={{ width: 34, alignItems: 'center' }}>
                                    <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: leading ? colors.ink : colors.raised }}>
                                        <Txt size={17} weight="extrabold" color={leading ? colors.bg : colors.ink} tabular>
                                            {team.runs}
                                        </Txt>
                                    </View>
                                </View>
                                <Txt size={14} weight="semibold" tone="muted" center tabular style={{ width: 26 }}>
                                    {team.hits}
                                </Txt>
                                <Txt size={14} weight="semibold" tone="muted" center tabular style={{ width: 26 }}>
                                    {team.errors}
                                </Txt>
                            </Row>
                        );
                    })}
                </View>
            </View>
            {game.abs && (
                <Row gap={12} wrap style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 16, paddingVertical: 8 }}>
                    <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        {t('lineScore.abs')}
                    </Txt>
                    {sides.map((side) => {
                        const count = game.abs![side];
                        return (
                            <View key={side} accessible accessibilityLabel={t('lineScore.absAria', { team: game[side].abbrev, left: count.remaining ?? '—', won: count.won, lost: count.lost })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: game[side].color }} />
                                <Txt size={12} weight="semibold">
                                    {game[side].abbrev}
                                </Txt>
                                <View style={{ borderRadius: 6, backgroundColor: colors.raised, paddingHorizontal: 6 }}>
                                    <Txt size={12} weight="extrabold" tabular>
                                        {count.remaining !== null ? t('lineScore.absLeft', { count: count.remaining }) : `✓${count.won} ✗${count.lost}`}
                                    </Txt>
                                </View>
                            </View>
                        );
                    })}
                </Row>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------- probabilidad de victoria

const formOf = (team: TeamRow | undefined, fallback: GameDetail['home']): TeamForm => {
    if (team?.pitching) {
        const record = recordOf(team);
        return { w: record.w, l: record.l, scored: record.scored, allowed: record.allowed };
    }
    return { w: fallback.record?.wins ?? 0, l: fallback.record?.losses ?? 0, scored: null, allowed: null };
};

/** Probabilidad del local antes del juego; null mientras cargan los números de los equipos */
export const usePregameWin = (game: GameDetail) => {
    const stats = useTeamStats(game.league);
    if (!stats.data) return null;
    const rows = stats.data.teams;
    return winProbability(formOf(rows.find((row) => row.id === game.home.id), game.home), formOf(rows.find((row) => row.id === game.away.id), game.away), { homeEra: game.probables.home?.era, awayEra: game.probables.away?.era }, stats.data.isPreviousSeason ? 40 : 20).home;
};

const W = 320;
const H = 132;
const PAD = { top: 10, bottom: 18, left: 4, right: 4 };
const plotH = H - PAD.top - PAD.bottom;

const WinChart: React.FC<{ game: GameDetail; points: WinPoint[]; swings: WinPoint[] }> = ({ game, points, swings }) => {
    const colors = useColors();
    const x = (index: number) => PAD.left + (points.length > 1 ? (index / (points.length - 1)) * (W - PAD.left - PAD.right) : 0);
    const y = (home: number) => PAD.top + (1 - home) * plotH;
    const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.home).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0.5)} L${x(0)},${y(0.5)} Z`;
    const ticks = points.map((point, index) => ({ point, index })).filter(({ point, index }) => index === 0 || (point.top && points[index - 1].inning !== point.inning));
    return (
        <Svg width="100%" height={undefined} viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
            <Defs>
                <ClipPath id="win-up">
                    <Rect x={0} y={0} width={W} height={y(0.5)} />
                </ClipPath>
                <ClipPath id="win-down">
                    <Rect x={0} y={y(0.5)} width={W} height={H} />
                </ClipPath>
            </Defs>
            <Path d={area} fill={game.home.color} opacity={0.22} clipPath="url(#win-up)" />
            <Path d={area} fill={game.away.color} opacity={0.22} clipPath="url(#win-down)" />
            <Line x1={PAD.left} x2={W - PAD.right} y1={y(0.5)} y2={y(0.5)} stroke={colors.faint} strokeDasharray="3 3" strokeWidth={1} />
            <Path d={line} fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            {ticks.map(({ point, index }) => (
                <SvgText key={index} x={x(index)} y={H - 4} fontSize={9} fontWeight="700" fill={colors.faint} textAnchor={index === 0 ? 'start' : 'middle'}>
                    {point.inning}
                </SvgText>
            ))}
            {swings.map((point) => {
                const index = points.indexOf(point);
                return <Circle key={index} cx={x(index)} cy={y(point.home)} r={4} fill={(point.delta > 0 ? game.home : game.away).color} stroke={colors.surface} strokeWidth={1.5} />;
            })}
            <Circle cx={x(points.length - 1)} cy={y(points[points.length - 1].home)} r={3.5} fill={colors.ink} />
        </Svg>
    );
};

const RunsChart: React.FC<{ game: GameDetail }> = ({ game }) => {
    const colors = useColors();
    const innings = game.linescore.filter((row) => row.away !== null || row.home !== null);
    const series = (side: 'away' | 'home') => {
        let total = 0;
        return [0, ...innings.map((row) => (total += row[side] ?? 0))];
    };
    const away = series('away');
    const home = series('home');
    const top = Math.max(4, ...away, ...home);
    const x = (index: number) => PAD.left + 10 + (index / Math.max(1, innings.length)) * (W - PAD.left - PAD.right - 20);
    const y = (runs: number) => PAD.top + (1 - runs / top) * plotH;
    const path = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    return (
        <Svg width="100%" height={undefined} viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
            {[0, Math.round(top / 2), top].map((level) => (
                <G key={level}>
                    <Line x1={PAD.left + 10} x2={W - PAD.right - 10} y1={y(level)} y2={y(level)} stroke={colors.line} strokeWidth={1} />
                    <SvgText x={PAD.left} y={y(level) + 3} fontSize={9} fontWeight="700" fill={colors.faint}>
                        {level}
                    </SvgText>
                </G>
            ))}
            {innings.map((row, index) => (
                <SvgText key={row.n} x={x(index + 1)} y={H - 4} fontSize={9} fontWeight="700" fill={colors.faint} textAnchor="middle">
                    {row.n}
                </SvgText>
            ))}
            {(
                [
                    ['away', away],
                    ['home', home]
                ] as const
            ).map(([side, values]) => (
                <G key={side}>
                    <Path d={path(values)} fill="none" stroke={game[side].color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
                    {values.map((value, index) => (index ? <Circle key={index} cx={x(index)} cy={y(value)} r={2.6} fill={game[side].color} /> : null))}
                </G>
            ))}
        </Svg>
    );
};

export const GameFlow: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [view, setView] = useState<'win' | 'runs'>('win');
    const prior = usePregameWin(game);
    const points = useMemo(() => {
        const list = winSeries(game, prior);
        const now = winNow(game, prior);
        if (game.state === 'live' && now !== null && list.length) list.push({ atBat: null, inning: game.inning?.n ?? 1, top: !!game.inning?.isTop, home: now, delta: now - list[list.length - 1].home });
        return list;
    }, [game, prior]);
    const swings = useMemo(() => biggestSwings(points), [points]);
    if (points.length < 2) return null;
    const homePct = Math.round(points[points.length - 1].home * 100);
    const leader = homePct >= 50 ? game.home : game.away;
    const leaderPct = homePct >= 50 ? homePct : 100 - homePct;
    const final = game.state === 'final';

    return (
        <Card style={{ gap: 12 }}>
            <Row justify="space-between">
                <Txt eyebrow accessibilityRole="header">
                    {t('flow.title')}
                </Txt>
                <Segmented
                    small
                    value={view}
                    onChange={setView}
                    options={[
                        { value: 'win', label: t('flow.win') },
                        { value: 'runs', label: t('flow.runs') }
                    ]}
                />
            </Row>
            {view === 'win' ? (
                <>
                    <View accessible accessibilityLabel={t('flow.now', { team: leader.abbrev, pct: leaderPct })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TeamLogo team={leader} size={24} />
                        <Txt size={28} weight="extrabold" tabular style={{ lineHeight: 30 }}>
                            {final ? t('flow.won') : `${leaderPct}%`}
                        </Txt>
                        <Txt size={14} weight="semibold" tone="muted">
                            {final ? leader.abbrev : t('flow.toWin', { team: leader.abbrev })}
                        </Txt>
                    </View>
                    <Row justify="space-between">
                        <Txt size={10} weight="extrabold" tone="faint">
                            {game.home.abbrev} ↑
                        </Txt>
                        <Txt size={10} weight="extrabold" tone="faint">
                            {game.away.abbrev} ↓
                        </Txt>
                    </Row>
                    <WinChart game={game} points={points} swings={swings} />
                    {swings.length > 0 && (
                        <View style={{ gap: 6 }}>
                            <Txt eyebrow>{t('flow.swings')}</Txt>
                            {swings.map((point) => {
                                const atBat = point.atBat!;
                                const team = point.delta > 0 ? game.home : game.away;
                                return (
                                    <Row key={atBat.i} gap={10} style={{ borderRadius: 12, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 8 }}>
                                        <View style={{ width: 48, borderRadius: 6, paddingVertical: 2, alignItems: 'center', backgroundColor: alpha(team.color, 0.15) }}>
                                            <Txt size={12} weight="extrabold" tabular>
                                                +{Math.round(Math.abs(point.delta) * 100)}%
                                            </Txt>
                                        </View>
                                        <Txt size={14} numberOfLines={1} style={{ flex: 1 }}>
                                            <Txt size={14} weight="bold">
                                                {eventName(atBat, i18n.language)}
                                            </Txt>{' '}
                                            · {lastName(atBat.batter.name)}
                                        </Txt>
                                        <Txt size={12} weight="semibold" tone="muted">
                                            {inningName({ n: atBat.inning, isTop: atBat.top }, i18n.language, true)}
                                        </Txt>
                                    </Row>
                                );
                            })}
                        </View>
                    )}
                    <Txt size={11} tone="faint">
                        {t('flow.note')}
                    </Txt>
                </>
            ) : (
                <>
                    <Row gap={16}>
                        {(['away', 'home'] as const).map((side) => (
                            <Row key={side} gap={6}>
                                <View style={{ width: 16, height: 8, borderRadius: 4, backgroundColor: game[side].color }} />
                                <Txt size={12} weight="bold">
                                    {game[side].abbrev} {game[side].runs}
                                </Txt>
                            </Row>
                        ))}
                    </Row>
                    <RunsChart game={game} />
                </>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------- lanzador en el montículo

const FATIGUE_TONE: Record<Fatigue, 'ball' | 'inplay' | 'gold' | 'live'> = { fresh: 'ball', normal: 'inplay', tired: 'gold', limit: 'live' };

export const PitcherCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pitcher = game.matchup?.pitcher;
    if (!pitcher?.id || !game.inning) return null;
    const side = game.inning.isTop ? 'home' : 'away';
    const team = game[side];
    const lines = game.box[side].pitchers;
    const line = lines.find((item) => item.id === pitcher.id);
    const starter = lines[0]?.id === pitcher.id;
    const pitches = line?.np ?? pitcher.pitches ?? 0;
    const fatigue = fatigueOf(pitches, starter);
    const trend = velocityTrend(game, pitcher.id);
    const stats: [string, string | number][] = line
        ? [
              ['ip', line.ip],
              ['h', line.h],
              ['r', line.r],
              ['bb', line.bb],
              ['k', line.k],
              ['pitches', line.np !== null ? `${line.np}${line.st !== null ? `-${line.st}` : ''}` : '—']
          ]
        : [];
    return (
        <Card style={{ gap: 12 }}>
            <Row gap={12}>
                <PlayerPhoto personId={pitcher.id} name={pitcher.name} size={56} background={alpha(team.color, 0.2)} team={team} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt eyebrow accessibilityRole="header">
                        {t('pitcherNow.title')} · {team.abbrev}
                    </Txt>
                    <Txt size={18} weight="extrabold" numberOfLines={1}>
                        {pitcher.name}
                    </Txt>
                    <Txt size={12} tone="muted" numberOfLines={1}>
                        {[t(starter ? 'pitcherNow.starter' : 'pitcherNow.reliever'), pitcher.era ? t('game.seasonEra', { era: pitcher.era }) : null].filter(Boolean).join(' · ')}
                    </Txt>
                </View>
            </Row>
            {stats.length > 0 && (
                <Row gap={4}>
                    {stats.map(([key, value]) => (
                        <View key={key} style={{ flex: 1, alignItems: 'center', borderRadius: 8, backgroundColor: colors.raised, paddingVertical: 6 }}>
                            <Txt size={10} weight="semibold" tone="faint">
                                {t(`stats.${key}`)}
                            </Txt>
                            <Txt size={15} weight="bold" tabular>
                                {value}
                            </Txt>
                        </View>
                    ))}
                </Row>
            )}
            <View style={{ gap: 6 }}>
                <Row justify="space-between">
                    <Row gap={6}>
                        <Flame size={14} color={colors.muted} />
                        <Txt size={12} weight="bold">
                            {t('pitcherNow.fatigue')}: {t(`pitcherNow.level.${fatigue.level}`)}
                        </Txt>
                    </Row>
                    <Txt size={12} weight="bold" tone="muted" tabular>
                        {t('pitcherNow.pitches', { count: pitches })}
                    </Txt>
                </Row>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.raised, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fatigue.share * 100) }}>
                    <View style={{ width: `${Math.max(4, fatigue.share * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: colors[FATIGUE_TONE[fatigue.level]] }} />
                </View>
                {trend && (
                    <Txt size={12} tone="muted">
                        {t('pitcherNow.velocity', { first: trend.first.toFixed(1), last: trend.last.toFixed(1) })}{' '}
                        <Txt size={12} weight="bold" tone={trend.change <= -1.5 ? 'live' : 'ink'}>
                            ({trend.change > 0 ? '+' : ''}
                            {trend.change.toFixed(1)})
                        </Txt>
                    </Txt>
                )}
            </View>
        </Card>
    );
};

// ---------------------------------------------------------------- detalles, datos detenidos, sin hit y corredores

export const GameDetails: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const now = useNow();
    const info = game.info;
    const rows: { label: string; value: string }[] = [];
    if (game.venue) rows.push({ label: t('details.venue'), value: game.venue });
    const wind = windText(info?.wind, i18n.language);
    if (wind) rows.push({ label: t('details.wind'), value: wind });
    if (info?.firstPitch) rows.push({ label: t('details.firstPitch'), value: formatTime(info.firstPitch, i18n.language) });
    if (info?.durationMin) rows.push({ label: t('details.duration'), value: hoursMinutes(info.durationMin) });
    else if (game.state === 'live' && info?.firstPitch) {
        const elapsed = (now - Date.parse(info.firstPitch)) / 60000;
        if (elapsed > 0 && elapsed < 600) rows.push({ label: t('details.elapsed'), value: hoursMinutes(elapsed) });
    }
    if (/delay|suspend/i.test(game.detailedState)) rows.push({ label: t('details.status'), value: `${stateName(game.detailedState, i18n.language)}${game.reason ? ` · ${game.reason}` : ''}` });
    else if (info?.delayMin) rows.push({ label: t('details.delay'), value: t('details.minutes', { count: info.delayMin }) });
    if (info?.attendance) rows.push({ label: t('details.attendance'), value: info.attendance.toLocaleString(i18n.language.startsWith('en') ? 'en-US' : 'es-DO') });
    const umpires = info?.umpires ?? [];
    if (!rows.length && !umpires.length) return null;
    return (
        <Card style={{ gap: 12 }}>
            <Row gap={6}>
                <Info size={14} color={colors.muted} />
                <Txt eyebrow accessibilityRole="header">
                    {t('details.title')}
                </Txt>
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
                {rows.map((row) => (
                    <View key={row.label} style={{ width: '50%', paddingRight: 8 }}>
                        <Txt size={11} weight="semibold" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {row.label}
                        </Txt>
                        <Txt size={14} weight="semibold">
                            {row.value}
                        </Txt>
                    </View>
                ))}
            </View>
            {umpires.length > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 4 }}>
                    <Txt size={11} weight="semibold" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('details.umpires')}
                    </Txt>
                    {umpires.map((umpire) => (
                        <Txt key={`${umpire.type}-${umpire.name}`} size={14}>
                            <Txt size={14} tone="muted">
                                {umpireRole(umpire.type, i18n.language)}:
                            </Txt>{' '}
                            <Txt size={14} weight="semibold">
                                {umpire.name}
                            </Txt>
                        </Txt>
                    ))}
                </View>
            )}
        </Card>
    );
};

export const StaleNotice: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const now = useNow();
    const minutes = staleMinutes(game, now);
    if (minutes === null) return null;
    return (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10, borderRadius: radius.tile, backgroundColor: alpha(colors.gold, 0.15), paddingHorizontal: 14, paddingVertical: 12 }}>
            <Clock size={16} color={colors.gold} style={{ marginTop: 2 }} />
            <Txt size={14} style={{ flex: 1 }}>
                <Txt size={14} weight="bold">
                    {t('stale.title', { count: minutes })}
                </Txt>{' '}
                <Txt size={14} tone="muted">
                    {t('stale.body')}
                </Txt>
            </Txt>
        </View>
    );
};

export const NoHitterBanner: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const list = noHitterOf(game);
    if (!list.length) return null;
    return (
        <>
            {list.map((item) => {
                const ink = inkOn(item.pitching.color);
                return (
                    <View key={item.pitching.id} accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, backgroundColor: item.pitching.color, paddingHorizontal: 16, paddingVertical: 12 }}>
                        <Txt size={24}>{item.perfect ? '💎' : '🔥'}</Txt>
                        <View style={{ flex: 1 }}>
                            <Txt size={16} weight="extrabold" color={ink}>
                                {t(item.final ? (item.perfect ? 'noHitter.perfectDone' : 'noHitter.done') : item.perfect ? 'noHitter.perfect' : 'noHitter.live', { team: item.pitching.abbrev })}
                            </Txt>
                            <Txt size={14} color={ink}>
                                {t('noHitter.detail', { team: item.batting.abbrev, count: item.innings })}
                            </Txt>
                        </View>
                    </View>
                );
            })}
        </>
    );
};

export const RunnerChips: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const runners = (['first', 'second', 'third'] as const).flatMap((base) => (game.runners[base] ? [{ base, person: game.runners[base]! }] : []));
    if (!runners.length || game.inning?.state === 'Middle' || game.inning?.state === 'End') return null;
    return (
        <View accessibilityLabel={t('runners.title')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, paddingTop: 10 }}>
            {runners.map(({ base, person }) => (
                <Row key={base} gap={4} style={{ borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Txt size={12} weight="extrabold" tone="muted">
                        {t(`runners.${base}`)}
                    </Txt>
                    <Txt size={12} weight="semibold">
                        {lastName(person.name)}
                    </Txt>
                </Row>
            ))}
        </View>
    );
};
