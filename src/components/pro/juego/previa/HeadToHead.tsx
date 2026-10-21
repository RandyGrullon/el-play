import React from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { FormGame, SplitType } from '../../../../types/pro-liga';
import { useColors } from '../../../../theme/theme';
import { radius } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { Chip, FormDots, Gauge, GrowBar, ProNote, ProSection, TeamChip, fmtSigned, teamInk, useChipInk, useInView } from '../../kit';
import { betterSide, fmtPct3, leagueRunsPerGame, ordinal, parseStreak, perGame, pythagorean, winPct, type WinLoss } from './logica';
import type { H2HRow } from './datos';
import { Eyebrow, MirrorLine, MirrorValue, useDivider, verdictOf } from './shared';

// Cara a cara en espejo con los colores de cada equipo: récord, posición, racha, últimos 10, casa y gira,
// diferencial, carreras por juego en barras desde el centro, récord pitagórico y los récords por situación de MLB
// (solo con las posiciones PRO; con las del Lite no salen).

const SPLITS: SplitType[] = ['left', 'right', 'day', 'night', 'winners'];

const record = (value: WinLoss | null | undefined) => (value ? `${value.wins}-${value.losses}` : '—');

interface HeadToHeadProps {
    game: GameDetail;
    rows: H2HRow[];
    seasonLabel: string;
    dayNight: 'day' | 'night' | null;
    /** Últimos juegos de cada equipo (del calendario), del más reciente al más viejo */
    form?: Record<string, FormGame[]>;
}

export const HeadToHead: React.FC<HeadToHeadProps> = ({ game, rows, seasonLabel, dayNight, form }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const divider = useDivider();
    const { setNode, onLayout, seen } = useInView();
    const upInk = useChipInk('up');
    const downInk = useChipInk('down');
    const away = rows.find((row) => row.team.id === game.away.id);
    const home = rows.find((row) => row.team.id === game.home.id);
    const A = game.away;
    const H = game.home;

    if (!away || !home) {
        return (
            <ProSection title={t('pro.previa.h2h.title')} aside={seasonLabel} headerOutside>
                <ProNote tone="neutral">{t('pro.previa.h2h.missing')}</ProNote>
            </ProSection>
        );
    }

    const verdict = (better: ReturnType<typeof betterSide>) => verdictOf(better, A.abbrev, H.abbrev, t('pro.previa.h2h.even'), (team) => t('pro.previa.h2h.ahead', { team }));
    const gamesOf = (row: H2HRow) => row.wins + row.losses;
    const pctAway = winPct(away);
    const pctHome = winPct(home);
    const recordBest = betterSide(pctAway, pctHome);
    const rankBest = betterSide(away.rank, home.rank, true);
    const diffOf = (row: H2HRow) => row.pro?.runDiff ?? row.runDiff ?? (typeof row.runsScored === 'number' && typeof row.runsAllowed === 'number' ? row.runsScored - row.runsAllowed : null);
    const diffAway = diffOf(away);
    const diffHome = diffOf(home);
    const diffBest = betterSide(diffAway, diffHome);
    const streakAway = parseStreak(away.streak);
    const streakHome = parseStreak(home.streak);
    const scoredAway = perGame(away.runsScored, gamesOf(away));
    const scoredHome = perGame(home.runsScored, gamesOf(home));
    const allowedAway = perGame(away.runsAllowed, gamesOf(away));
    const allowedHome = perGame(home.runsAllowed, gamesOf(home));
    const leagueAvg = leagueRunsPerGame(rows);
    const scale = Math.max(1, scoredAway ?? 0, scoredHome ?? 0, allowedAway ?? 0, allowedHome ?? 0, leagueAvg ?? 0) * 1.1;
    const pythAway = pythagorean(away.runsScored, away.runsAllowed);
    const pythHome = pythagorean(home.runsScored, home.runsAllowed);
    const minGames = Math.min(gamesOf(away), gamesOf(home));
    const homeAway = (row: H2HRow) => ({ home: row.home ?? row.pro?.splits.home ?? null, away: row.away ?? row.pro?.splits.away ?? null });
    const splits = SPLITS.filter((key) => away.pro?.splits[key] || home.pro?.splits[key]);
    const streakText = (streak: ReturnType<typeof parseStreak>) => (streak ? `${t(`pro.previa.h2h.streak${streak.type}`)}${streak.count}` : '—');

    // Últimos 10: en puntos si el calendario los tiene todos; si no (calendario corto del Lite), el récord de MLB
    const lastTen = (team: GameDetail['away'], row: H2HRow) => {
        const list = (form?.[team.id] ?? []).slice(0, 10);
        const expected = row.lastTen ? row.lastTen.wins + row.lastTen.losses : list.length;
        return { results: list.map((item) => (item.isWin ? 'W' : 'L') as 'W' | 'L'), complete: !!form && list.length >= Math.min(10, expected), record: row.lastTen };
    };
    const tenAway = lastTen(A, away);
    const tenHome = lastTen(H, home);

    const streakChip = (streak: ReturnType<typeof parseStreak>) =>
        streak ? (
            <Chip tone={streak.type === 'W' ? 'up' : 'down'}>
                <Txt condensed size={16} color={streak.type === 'W' ? upInk : downInk} style={{ lineHeight: 18 }}>
                    {streakText(streak)}
                </Txt>
            </Chip>
        ) : (
            <Txt tone="muted">—</Txt>
        );

    const runsRow = (label: string, sub: string | null, left: number | null, right: number | null, lowerIsBetter: boolean, index: number) => {
        const best = betterSide(left, right, lowerIsBetter);
        const value = (number: number | null, side: 'left' | 'right') => (
            <Txt condensed size={18} tabular color={best === side ? colors.ink : colors.muted} style={{ width: 36, textAlign: side === 'left' ? 'left' : 'right' }}>
                {number === null ? '—' : number.toFixed(1)}
            </Txt>
        );
        return (
            <View style={{ gap: 8 }}>
                <Eyebrow center>
                    {label}
                    {sub ? <Txt size={11} weight="semibold" tone="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>{` · ${sub}`}</Txt> : null}
                </Eyebrow>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {value(left, 'left')}
                    <View style={{ flex: 1, height: 20, justifyContent: 'center' }}>
                        <View style={{ flexDirection: 'row', height: 14 }}>
                            <GrowBar value={left === null ? 0 : left / scale} color={A.color} origin="right" index={index} seen={seen} track={false} height={14} style={{ flex: 1, borderTopRightRadius: 2, borderBottomRightRadius: 2 }} />
                            <GrowBar value={right === null ? 0 : right / scale} color={H.color} origin="left" index={index} seen={seen} track={false} height={14} style={{ flex: 1, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }} />
                        </View>
                        <Svg width="100%" height={20} style={{ position: 'absolute', left: 0, top: 0 }}>
                            {leagueAvg !== null && (
                                <>
                                    <Line x1={`${50 - (leagueAvg / scale) * 50}%`} x2={`${50 - (leagueAvg / scale) * 50}%`} y1={0} y2={20} stroke={colors.muted} strokeDasharray="3 3" />
                                    <Line x1={`${50 + (leagueAvg / scale) * 50}%`} x2={`${50 + (leagueAvg / scale) * 50}%`} y1={0} y2={20} stroke={colors.muted} strokeDasharray="3 3" />
                                </>
                            )}
                            <Line x1="50%" x2="50%" y1={0} y2={20} stroke={colors.ink} strokeWidth={2} />
                        </Svg>
                    </View>
                    {value(right, 'right')}
                </View>
            </View>
        );
    };

    const pyth = (team: GameDetail['away'], value: number | null, row: H2HRow) => (
        <View style={{ flexGrow: 1, flexBasis: 128, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Gauge value={value ?? 0} max={1} size={64} thickness={7} color={team.color} label={t('pro.previa.h2h.pythagAria', { team: team.abbrev, value: fmtPct3(value) })}>
                <Txt condensed size={16} tabular>
                    {fmtPct3(value)}
                </Txt>
            </Gauge>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={13} weight="extrabold">
                    {team.abbrev}
                </Txt>
                <Txt size={11} tone="muted">
                    {t('pro.previa.h2h.real', { pct: fmtPct3(winPct(row)) })}
                </Txt>
                {row.pro?.expected ? (
                    <Txt size={11} tone="muted">
                        {t('pro.previa.h2h.expected', { record: record(row.pro.expected) })}
                    </Txt>
                ) : null}
            </View>
        </View>
    );

    const todayPill = (team: GameDetail['away'], text: string) => (
        <View style={{ borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: team.color }}>
            <Txt size={10} weight="extrabold" color={teamInk(team.color)} numberOfLines={1}>
                {text}
            </Txt>
        </View>
    );

    const tenSide = (team: GameDetail['away'], ten: typeof tenAway) =>
        ten.complete && ten.results.length ? (
            <FormDots results={ten.results} label={t('pro.previa.h2h.last10Aria', { team: team.abbrev, wins: ten.results.filter((r) => r === 'W').length, losses: ten.results.filter((r) => r === 'L').length, count: ten.results.length })} />
        ) : (
            <Txt condensed size={18} tabular>
                {record(ten.record)}
            </Txt>
        );
    const tenText = (team: GameDetail['away'], ten: typeof tenAway) => {
        const wins = ten.complete ? ten.results.filter((r) => r === 'W').length : ten.record?.wins ?? 0;
        const losses = ten.complete ? ten.results.length - wins : ten.record?.losses ?? 0;
        return `${team.abbrev} ${wins}-${losses}`;
    };

    return (
        <ProSection title={t('pro.previa.h2h.title')} aside={seasonLabel} headerOutside>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TeamChip team={A} logo="start" />
                <Txt size={11} weight="extrabold" tone="muted" style={{ letterSpacing: 1.4 }}>
                    VS
                </Txt>
                <TeamChip team={H} logo="end" />
            </View>

            <View style={{ marginTop: 12 }}>
                <MirrorLine
                    label={t('pro.previa.h2h.record')}
                    verdict={verdict(recordBest)}
                    leftText={`${A.abbrev} ${record(away)}, ${fmtPct3(pctAway)}`}
                    rightText={`${H.abbrev} ${record(home)}, ${fmtPct3(pctHome)}`}
                    left={
                        <>
                            <MirrorValue better={recordBest} side="left" color={A.color}>
                                {record(away)}
                            </MirrorValue>
                            <Txt size={11} weight="semibold" tone="muted">
                                {fmtPct3(pctAway)}
                            </Txt>
                        </>
                    }
                    right={
                        <>
                            <Txt size={11} weight="semibold" tone="muted">
                                {fmtPct3(pctHome)}
                            </Txt>
                            <MirrorValue better={recordBest} side="right" color={H.color}>
                                {record(home)}
                            </MirrorValue>
                        </>
                    }
                />
                <MirrorLine
                    label={t('pro.previa.h2h.rank')}
                    verdict={verdict(rankBest)}
                    leftText={`${A.abbrev} ${ordinal(away.rank, i18n.language)} ${t('pro.previa.h2h.of', { total: rows.length })}`}
                    rightText={`${H.abbrev} ${ordinal(home.rank, i18n.language)} ${t('pro.previa.h2h.of', { total: rows.length })}`}
                    left={
                        <>
                            <MirrorValue better={rankBest} side="left" color={A.color}>
                                {ordinal(away.rank, i18n.language)}
                            </MirrorValue>
                            <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                                {t('pro.previa.h2h.of', { total: rows.length })}
                            </Txt>
                        </>
                    }
                    right={
                        <>
                            <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                                {t('pro.previa.h2h.of', { total: rows.length })}
                            </Txt>
                            <MirrorValue better={rankBest} side="right" color={H.color}>
                                {ordinal(home.rank, i18n.language)}
                            </MirrorValue>
                        </>
                    }
                />
                <MirrorLine label={t('pro.previa.h2h.streak')} leftText={`${A.abbrev} ${streakText(streakAway)}`} rightText={`${H.abbrev} ${streakText(streakHome)}`} left={streakChip(streakAway)} right={streakChip(streakHome)} />
                {tenAway.complete || tenHome.complete || away.lastTen || home.lastTen ? (
                    <MirrorLine label={t('pro.previa.h2h.last10')} leftText={tenText(A, tenAway)} rightText={tenText(H, tenHome)} left={tenSide(A, tenAway)} right={tenSide(H, tenHome)} />
                ) : null}
                <MirrorLine
                    style={{ minHeight: 60 }}
                    label={t('pro.previa.h2h.homeAway')}
                    leftText={`${A.abbrev} ${t('pro.previa.h2h.homeAwayAria', { home: record(homeAway(away).home), away: record(homeAway(away).away) })}, ${t('pro.previa.h2h.todayAway')}`}
                    rightText={`${H.abbrev} ${t('pro.previa.h2h.homeAwayAria', { home: record(homeAway(home).home), away: record(homeAway(home).away) })}, ${t('pro.previa.h2h.todayHome')}`}
                    left={
                        <View style={{ alignItems: 'flex-start', gap: 4 }}>
                            <Txt condensed size={20} tabular numberOfLines={1}>
                                <Txt condensed size={20} tone="muted">
                                    {record(homeAway(away).home)}
                                </Txt>
                                <Txt condensed size={20} tone="faint">
                                    {' · '}
                                </Txt>
                                {record(homeAway(away).away)}
                            </Txt>
                            {todayPill(A, t('pro.previa.h2h.todayAway'))}
                        </View>
                    }
                    right={
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <Txt condensed size={20} tabular numberOfLines={1}>
                                {record(homeAway(home).home)}
                                <Txt condensed size={20} tone="faint">
                                    {' · '}
                                </Txt>
                                <Txt condensed size={20} tone="muted">
                                    {record(homeAway(home).away)}
                                </Txt>
                            </Txt>
                            {todayPill(H, t('pro.previa.h2h.todayHome'))}
                        </View>
                    }
                />
                <MirrorLine
                    label={t('pro.previa.h2h.diff')}
                    verdict={verdict(diffBest)}
                    leftText={`${A.abbrev} ${diffAway === null ? '—' : fmtSigned(diffAway)}`}
                    rightText={`${H.abbrev} ${diffHome === null ? '—' : fmtSigned(diffHome)}`}
                    left={
                        <MirrorValue better={diffBest} side="left" color={A.color}>
                            {diffAway === null ? '—' : fmtSigned(diffAway)}
                        </MirrorValue>
                    }
                    right={
                        <MirrorValue better={diffBest} side="right" color={H.color}>
                            {diffHome === null ? '—' : fmtSigned(diffHome)}
                        </MirrorValue>
                    }
                />
            </View>

            {scoredAway !== null || scoredHome !== null ? (
                <View
                    ref={setNode}
                    onLayout={onLayout}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={t('pro.previa.h2h.runsAria', {
                        away: A.abbrev,
                        home: H.abbrev,
                        scoredAway: scoredAway?.toFixed(1) ?? '—',
                        scoredHome: scoredHome?.toFixed(1) ?? '—',
                        allowedAway: allowedAway?.toFixed(1) ?? '—',
                        allowedHome: allowedHome?.toFixed(1) ?? '—',
                        league: leagueAvg?.toFixed(1) ?? '—'
                    })}
                    style={[{ marginTop: 12, paddingTop: 14, gap: 14 }, divider]}
                >
                    {runsRow(t('pro.previa.h2h.scored'), null, scoredAway, scoredHome, false, 1)}
                    {runsRow(t('pro.previa.h2h.allowed'), t('pro.previa.h2h.lowerBetter'), allowedAway, allowedHome, true, 2)}
                    {leagueAvg !== null && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <Svg width={12} height={2}>
                                <Line x1={0} x2={12} y1={1} y2={1} stroke={colors.muted} strokeDasharray="3 2" />
                            </Svg>
                            <Txt size={11} tone="muted">
                                {t('pro.previa.h2h.leagueAvg', { value: leagueAvg.toFixed(1) })}
                            </Txt>
                        </View>
                    )}
                </View>
            ) : null}

            {pythAway !== null || pythHome !== null ? (
                <View style={[{ marginTop: 16, paddingTop: 14 }, divider]}>
                    <Eyebrow>{t('pro.previa.h2h.pythag')}</Eyebrow>
                    <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                        {pyth(A, pythAway, away)}
                        {pyth(H, pythHome, home)}
                    </View>
                    <Txt size={12} tone="muted" style={{ marginTop: 10, lineHeight: 16 }}>
                        {t('pro.previa.h2h.pythagNote')}
                        {minGames < 10 ? ` ${t('pro.previa.h2h.pythagNoise', { count: minGames })}` : ''}
                    </Txt>
                </View>
            ) : null}

            {splits.length > 0 && (
                <View style={[{ marginTop: 16, paddingTop: 14 }, divider]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 6 }}>
                        <Txt size={12} weight="extrabold" style={{ flex: 1 }}>
                            {A.abbrev}
                        </Txt>
                        <Eyebrow center style={{ flex: 2 }}>
                            {t('pro.previa.h2h.situations')}
                        </Eyebrow>
                        <Txt size={12} weight="extrabold" style={{ flex: 1, textAlign: 'right' }}>
                            {H.abbrev}
                        </Txt>
                    </View>
                    {splits.map((key) => {
                        const left = away.pro?.splits[key] ?? null;
                        const right = home.pro?.splits[key] ?? null;
                        const best = betterSide(winPct(left), winPct(right));
                        const today = (key === 'day' || key === 'night') && dayNight === key;
                        const name = t(`pro.previa.h2h.split.${key}`);
                        return (
                            <View
                                key={key}
                                accessible
                                accessibilityLabel={[name, `${A.abbrev} ${record(left)}`, `${H.abbrev} ${record(right)}`, today ? t('pro.previa.h2h.today') : null].filter(Boolean).join(', ')}
                                style={[{ minHeight: 40, flexDirection: 'row', alignItems: 'center' }, divider]}
                            >
                                <Txt condensed size={16} tabular color={best === 'left' ? colors.ink : colors.muted} style={{ flex: 1 }}>
                                    {record(left)}
                                </Txt>
                                <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <Txt size={12} weight="semibold" tone="muted" center style={{ flexShrink: 1 }}>
                                        {name}
                                    </Txt>
                                    {today ? <Chip tone="accent" style={{ height: 20, paddingHorizontal: 6 }}>{t('pro.previa.h2h.today')}</Chip> : null}
                                </View>
                                <Txt condensed size={16} tabular color={best === 'right' ? colors.ink : colors.muted} style={{ flex: 1, textAlign: 'right' }}>
                                    {record(right)}
                                </Txt>
                            </View>
                        );
                    })}
                    <Txt size={11} tone="muted" style={{ marginTop: 8, lineHeight: 15 }}>
                        {t('pro.previa.h2h.splitsNote')}
                    </Txt>
                </View>
            )}
        </ProSection>
    );
};
