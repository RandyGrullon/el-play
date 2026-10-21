// Tabla PRO del Fantasy: tu puesto y la distancia al líder, la distribución de los puntos del último día con tu barra,
// la tabla de la temporada con flechas desde ayer (general o de una liga privada) y la tabla del día. Las filas que
// cambian de puesto se deslizan a su lugar.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';
import type { LeagueId } from '../../../types';
import type { FantasyDay } from '../../../lib/fantasy';
import { useFantasyStats } from '../../../lib/pro/liga';
import type { SeasonRankingProRow } from '../../../types/pro-liga';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, alpha, radius, shadow } from '../../../theme/tokens';
import { ErrorState, OfflineState, Skeleton, Txt, useErrorText } from '../../ui';
import { FanAvatar, useFanLabel } from '../../fantasy/FanSearch';
import { useLocalText } from '../../fantasy/texts';
import { ChipButton, ChipRow, CountUp, MOTION_EASE, MOTION_MS, ModuleHeader, ProNote, StatTile, useChartBox, useMotion, useProColors, useReorder } from '../kit';
import { MoveMark, Num, fmtPts, ordinal } from './bits';
import { useDayRivals, useSeasonTable, type LeagueInfo } from './data';
import { binIndex, dayRanking, histogram, isGap, movementOf, shortDayName, tableWindow, topPercent } from './logic';

export type OpenFan = (userId: string, name?: string | null) => void;

// ---------------------------------------------------------------- filas de la tabla de la temporada

interface SeasonRowsProps {
    rows: (SeasonRankingProRow & { rank: number })[];
    me: string | undefined;
    /** leader: distancia al líder; above: lo que falta para alcanzar al de arriba */
    metric: 'leader' | 'above';
    firstDay: boolean;
    onOpen: OpenFan;
    label: string;
    avatars?: boolean;
    /** Columna de movimiento (solo con la tabla PRO, que trae el puesto anterior) */
    showMoves?: boolean;
}

/** Tabla de la temporada con flechas de movimiento: los 3 primeros y los de alrededor tuyo (se deslizan al reordenarse) */
export const SeasonRows: React.FC<SeasonRowsProps> = ({ rows, me, metric, firstDay, onOpen, label, avatars = false, showMoves = true }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const fanLabel = useFanLabel();
    const L = useLocalText();
    const reorder = useReorder();
    const mine = rows.findIndex((row) => row.userId === me);
    const shown = tableWindow(rows, mine);
    const leader = rows[0]?.points ?? 0;
    const headStyle = { textTransform: 'uppercase', letterSpacing: 0.8 } as const;
    return (
        <View accessibilityLabel={label}>
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ height: 30, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}>
                <Txt size={10} weight="extrabold" tone="muted" style={[headStyle, { width: 28 }]}>
                    #
                </Txt>
                {showMoves && (
                    <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} style={[headStyle, { width: 34 }]}>
                        {t('pro.fantasy.table.move')}
                    </Txt>
                )}
                <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} style={[headStyle, { flex: 1 }]}>
                    {t('pro.fantasy.table.fan')}
                </Txt>
                <Txt size={10} weight="extrabold" tone="muted" style={[headStyle, { width: 58, textAlign: 'right' }]}>
                    {t('pro.fantasy.table.pts')}
                </Txt>
                <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} style={[headStyle, { width: 58, textAlign: 'right' }]}>
                    {metric === 'leader' ? t('pro.fantasy.table.toLeader') : t('pro.fantasy.table.diff')}
                </Txt>
            </View>
            {shown.map((row, index) => {
                if (isGap(row)) {
                    return (
                        <Animated.View key={`gap-${index}`} layout={reorder} style={{ paddingVertical: 6 }}>
                            <Txt size={11} weight="semibold" tone="muted" center>
                                {`··· ${t('pro.fantasy.table.more', { count: row.gap })}`}
                            </Txt>
                        </Animated.View>
                    );
                }
                const own = row.userId === me;
                const position = rows.indexOf(row);
                const above = position > 0 ? rows[position - 1] : null;
                const gapText =
                    metric === 'leader'
                        ? row.points >= leader
                            ? '–'
                            : fmtPts(row.points - leader)
                        : !above
                          ? t('pro.fantasy.table.leader')
                          : above.points === row.points
                            ? t('pro.fantasy.table.tied')
                            : t('pro.fantasy.table.toAbove', { pts: fmtPts(above.points - row.points) });
                const name = fanLabel(row.name, own);
                const move = movementOf(row.rank, row.prevRank);
                return (
                    <Animated.View key={row.userId} layout={reorder}>
                        <Pressable
                            onPress={() => onOpen(row.userId, row.name)}
                            accessibilityRole="button"
                            accessibilityLabel={`${own ? t('pro.fanaticos.fans.viewOwnProfile') : L('fans.viewProfile', { name })}, #${row.rank}, ${fmtPts(row.points)} ${t('pro.fantasy.pts')}, ${gapText}`}
                            style={({ pressed }) => ({
                                height: 44,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                borderRadius: radius.tile,
                                paddingHorizontal: 8,
                                backgroundColor: own ? alpha(colors.accent, 0.12) : row.rank === 1 ? alpha(pro.fantasy, 0.1) : pressed ? colors.raised : 'transparent',
                                borderLeftWidth: own ? 3 : 0,
                                borderLeftColor: '#6d28d9'
                            })}
                        >
                            <Num size={16} style={{ width: 28 - (own ? 3 : 0) }}>
                                {row.rank}
                            </Num>
                            {showMoves && (
                                <View style={{ width: 34, alignItems: 'flex-start' }}>
                                    <MoveMark move={move} firstDay={firstDay} />
                                </View>
                            )}
                            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                {avatars &&
                                    (own ? (
                                        <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
                                            <Txt size={9} weight="extrabold" tone="white">
                                                {t('fantasy.you')}
                                            </Txt>
                                        </View>
                                    ) : (
                                        <FanAvatar name={row.name} size={24} />
                                    ))}
                                <Txt size={13} weight={own ? 'extrabold' : 'semibold'} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                    {name}
                                </Txt>
                            </View>
                            <Num size={18} style={{ width: 58, textAlign: 'right' }}>
                                {fmtPts(row.points)}
                            </Num>
                            <Txt size={11} weight="bold" tone="muted" tabular numberOfLines={1} style={{ width: 58, textAlign: 'right' }}>
                                {gapText}
                            </Txt>
                        </Pressable>
                    </Animated.View>
                );
            })}
        </View>
    );
};

// ---------------------------------------------------------------- histograma del día

/** Columna que crece desde abajo (500 ms, escalonada) al verse; sin movimiento sale con su alto */
const Column: React.FC<{ height: number; index: number; seen: boolean; mine: boolean; width: number }> = ({ height, index, seen, mine, width }) => {
    const colors = useColors();
    const motion = useMotion();
    const grow = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            grow.set(1);
            return;
        }
        if (!seen) return;
        grow.set(withDelay(motion.delay(index), withTiming(1, { duration: MOTION_MS.bar, easing: MOTION_EASE })));
        return () => cancelAnimation(grow);
    }, [seen, motion, index, grow]);
    const style = useAnimatedStyle(() => ({ height: height * grow.get() }));
    return (
        <Animated.View style={[{ width, borderRadius: 6, overflow: 'hidden' }, style]}>
            {mine ? (
                <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ flex: 1 }} />
            ) : (
                <View style={{ flex: 1, borderRadius: 6, backgroundColor: alpha(colors.line, 0.1), borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.2) }} />
            )}
        </Animated.View>
    );
};

const Histogram: React.FC<{ scores: number[]; mine: number | null; dayName: string; youLabel: string }> = ({ scores, mine, dayName, youLabel }) => {
    const { t } = useTranslation();
    const { setNode, onLayout, width, seen } = useChartBox(300);
    const bins = histogram(scores, 20);
    if (!bins.length) return null;
    const index = mine === null ? -1 : binIndex(bins, mine);
    const H = 70;
    const max = Math.max(...bins.map((bin) => bin.count), 1);
    const gap = 6;
    const barWidth = Math.max(8, (width - gap * (bins.length - 1)) / bins.length);
    const label = t('pro.fantasy.table.histLabel', { count: scores.length, day: dayName, bins: bins.map((bin) => `${bin.from}–${bin.to}: ${bin.count}`).join(', ') });
    return (
        <View style={{ gap: 6 }}>
            <View ref={setNode} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={label} style={{ paddingTop: 20 }}>
                <View style={{ height: H, flexDirection: 'row', alignItems: 'flex-end', gap }}>
                    {bins.map((bin, i) => {
                        const h = Math.max(3, (bin.count / max) * H);
                        return (
                            <View key={bin.from} style={{ width: barWidth, alignItems: 'center', justifyContent: 'flex-end', height: H }}>
                                {i === index && youLabel ? (
                                    <Txt size={11} weight="extrabold" numberOfLines={1} style={{ position: 'absolute', bottom: h + 4, width: 80, textAlign: 'center' }}>
                                        {youLabel}
                                    </Txt>
                                ) : null}
                                <Column height={h} index={i} seen={seen} mine={i === index} width={barWidth} />
                            </View>
                        );
                    })}
                </View>
                <View style={{ height: 16, marginTop: 2 }}>
                    {bins.map((bin, i) =>
                        i % 2 === 0 ? (
                            <Txt key={`t${bin.from}`} size={10} weight="semibold" tone="muted" tabular style={{ position: 'absolute', left: i * (barWidth + gap) }}>
                                {bin.from}
                            </Txt>
                        ) : null
                    )}
                </View>
            </View>
            <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                {t('pro.fantasy.table.histText', { count: scores.length, day: dayName })}
                {index >= 0 ? ` ${t('pro.fantasy.table.histMine', { from: bins[index].from, to: bins[index].to })}` : ''}
            </Txt>
        </View>
    );
};

// ---------------------------------------------------------------- pestaña Tabla

/** Chips «General | Liga de la oficina | +» para filtrar la tabla por liga privada */
export const ScopeChips: React.FC<{ scope: string; onScope: (scope: string) => void; leagues: LeagueInfo[]; onOpenLeagues: () => void; bleed?: boolean }> = ({ scope, onScope, leagues, onOpenLeagues, bleed = true }) => {
    const { t } = useTranslation();
    const colors = useColors();
    return (
        <ChipRow label={t('pro.fantasy.table.scope')} bleed={bleed}>
            <ChipButton active={scope === 'all'} onPress={() => onScope('all')}>
                {t('pro.fantasy.table.general')}
            </ChipButton>
            {leagues.map((item) => (
                <ChipButton key={item.id} active={scope === item.id} onPress={() => onScope(item.id)}>
                    {item.name}
                </ChipButton>
            ))}
            <Pressable
                onPress={onOpenLeagues}
                accessibilityRole="button"
                accessibilityLabel={t('pro.fantasy.leagues.open')}
                style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.3), opacity: pressed ? 0.7 : 1 })}
            >
                <Plus size={20} color={colors.muted} />
            </Pressable>
        </ChipRow>
    );
};

interface TableProProps {
    league: LeagueId;
    day: FantasyDay;
    userId: string;
    leagues: LeagueInfo[];
    onOpen: OpenFan;
    onOpenLeagues: () => void;
}

export const TablePro: React.FC<TableProProps> = ({ league, day, userId, leagues, onOpen, onOpenLeagues }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const errorText = useErrorText();
    const fanLabel = useFanLabel();
    const L = useLocalText();
    const reorder = useReorder();
    const [scope, setScope] = useState<string>('all');
    const members = scope === 'all' ? undefined : leagues.find((item) => item.id === scope)?.members.map((member) => member.userId);
    const season = useSeasonTable(league, members);
    const general = useSeasonTable(league);
    const data = season.data;
    const rows = useMemo(() => {
        const list = [...(data?.ranking ?? [])].sort((a, b) => b.points - a.points);
        // En una liga privada los puestos se cuentan dentro de ella
        let rank = 0;
        return list.map((row, index) => {
            if (index === 0 || row.points !== list[index - 1].points) rank = index + 1;
            return { ...row, rank: members ? rank : (row.rank ?? rank) };
        });
    }, [data, members]);
    const mine = rows.find((row) => row.userId === userId);
    const total = members ? rows.length : (data?.total ?? rows.length);
    const lastDate = general.data?.lastDate ?? null;
    const stats = useFantasyStats(league, lastDate ?? undefined, !!lastDate);
    const firstDay = (general.data?.daily.length ?? 0) <= 1;
    const leader = rows[0]?.points ?? 0;
    const dayName = lastDate ? shortDayName(lastDate, lang) : '';
    const move = mine ? movementOf(mine.rank, mine.prevRank) : null;
    const top = mine ? topPercent(mine.rank, total) : null;

    // Tabla del día (todos los equipos, puntuados con lo que contaba al empezar cada juego)
    const live = day.games.some((game) => game.state === 'live');
    const rivals = useDayRivals(league, day.date, members, live);
    const dayRows = useMemo(() => (rivals.data ? dayRanking(day, rivals.data) : []), [day, rivals.data]);
    const dayMine = dayRows.findIndex((row) => row.userId === userId);
    const dayShown = tableWindow(dayRows, dayMine);
    const dayStarted = day.games.some((game) => game.state !== 'preview');
    const seasonOffline = season.fetchStatus === 'paused' && !season.data;

    return (
        <View style={{ gap: 16 }}>
            <ScopeChips scope={scope} onScope={setScope} leagues={leagues} onOpenLeagues={onOpenLeagues} />

            <View style={{ gap: 12 }}>
                <ModuleHeader title={t('pro.fantasy.table.title')} aside={lastDate ? t('pro.fantasy.table.dayN', { n: general.data?.daily.length ?? 0, day: dayName }) : undefined} />
                {seasonOffline ? (
                    <OfflineState />
                ) : season.isPending ? (
                    <Skeleton height={300} />
                ) : season.isError && !data ? (
                    <ErrorState message={errorText(season.error)} onRetry={() => season.refetch()} />
                ) : !rows.length ? (
                    <ProNote tone="neutral">{members ? t('pro.fanaticos.fans.emptyLeague') : t('pro.fanaticos.fans.emptySeason')}</ProNote>
                ) : (
                    <View style={[{ gap: 12, borderRadius: radius.card, backgroundColor: colors.surface, padding: 14 }, shadow('card')]}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <StatTile
                                size="lg"
                                value={mine ? ordinal(mine.rank, lang) : '—'}
                                unit={mine ? t('pro.fantasy.summary.ofFans', { count: total }) : undefined}
                                label={t('pro.fantasy.table.yourRank')}
                                sub={
                                    mine && !season.pro ? (
                                        top !== null ? (
                                            t('pro.fantasy.summary.top', { pct: top })
                                        ) : undefined
                                    ) : mine ? (
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                                            <MoveMark move={move} firstDay={firstDay} />
                                            <Txt size={11} tone="muted" style={{ flexShrink: 1 }}>
                                                {move === null || move === 0 ? (firstDay ? t('pro.fantasy.table.firstDay') : t('pro.fantasy.move.same')) : t(move > 0 ? 'pro.fantasy.move.up' : 'pro.fantasy.move.down', { count: Math.abs(move) })}
                                                {top !== null ? ` · ${t('pro.fantasy.summary.top', { pct: top })}` : ''}
                                            </Txt>
                                        </View>
                                    ) : (
                                        t('pro.fantasy.summary.noRank')
                                    )
                                }
                                style={{ flex: 1, flexBasis: 0 }}
                            />
                            <StatTile
                                size="lg"
                                value={mine ? mine.points >= leader ? t('pro.fantasy.table.leaderShort') : <CountUp value={leader - mine.points} format={(value) => fmtPts(value)} /> : '—'}
                                unit={mine && mine.points < leader ? t('pro.fantasy.pts') : undefined}
                                label={t('pro.fantasy.table.toLeaderLong')}
                                sub={rows[0] ? t('pro.fantasy.table.leaderIs', { name: fanLabel(rows[0].name, rows[0].userId === userId), pts: fmtPts(leader) }) : undefined}
                                accessibilityLabel={mine ? (mine.points >= leader ? `${t('pro.fantasy.table.toLeaderLong')}: ${t('pro.fantasy.table.leaderShort')}` : `${t('pro.fantasy.table.toLeaderLong')}: ${fmtPts(leader - mine.points)} ${t('pro.fantasy.pts')}`) : undefined}
                                style={{ flex: 1, flexBasis: 0 }}
                            />
                        </View>
                        {!members && stats.data && stats.data.scores.length > 1 && (
                            <Histogram scores={stats.data.scores} mine={mine?.lastDay ?? null} dayName={dayName} youLabel={mine?.lastDay !== null && mine?.lastDay !== undefined ? t('pro.fantasy.table.you', { pts: fmtPts(mine.lastDay) }) : ''} />
                        )}
                        <SeasonRows rows={rows} me={userId} metric="leader" firstDay={firstDay} onOpen={onOpen} label={t('pro.fantasy.table.title')} showMoves={season.pro} />
                        {season.pro ? (
                            <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                                <Txt size={11} weight="bold">{`${t('pro.fantasy.table.moveLong')}: `}</Txt>
                                {firstDay ? t('pro.fantasy.table.moveFirst') : t('pro.fantasy.table.moveHint')}
                            </Txt>
                        ) : null}
                    </View>
                )}
            </View>

            <View style={{ gap: 12 }}>
                <ModuleHeader title={t('pro.fantasy.table.dayTitle', { day: shortDayName(day.date, lang) })} aside={dayRows.length ? t('pro.fantasy.table.teams', { count: dayRows.length }) : undefined} />
                {rivals.isPending ? (
                    <Skeleton height={160} />
                ) : rivals.isError ? (
                    <ErrorState message={errorText(rivals.error)} onRetry={() => rivals.refetch()} />
                ) : !dayRows.length ? (
                    <ProNote tone="neutral">{t('fantasy.emptyTable')}</ProNote>
                ) : (
                    <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, padding: 4 }, shadow('card')]} accessibilityLabel={t('pro.fantasy.table.dayTitle', { day: shortDayName(day.date, lang) })}>
                        {dayShown.map((row, index) =>
                            isGap(row) ? (
                                <Animated.View key={`gap-${index}`} layout={reorder} style={{ paddingVertical: 4 }}>
                                    <Txt size={11} weight="semibold" tone="muted" center>
                                        {`··· ${t('pro.fantasy.table.more', { count: row.gap })}`}
                                    </Txt>
                                </Animated.View>
                            ) : (
                                <Animated.View key={row.userId} layout={reorder}>
                                    <Pressable
                                        onPress={() => onOpen(row.userId, row.name)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${row.userId === userId ? t('pro.fanaticos.fans.viewOwnProfile') : L('fans.viewProfile', { name: fanLabel(row.name, false) })}, #${row.rank}, ${fmtPts(row.points)} ${t('pro.fantasy.pts')}`}
                                        style={({ pressed }) => ({
                                            height: 44,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 8,
                                            borderRadius: radius.tile,
                                            paddingHorizontal: 8,
                                            backgroundColor: row.userId === userId ? alpha(colors.accent, 0.12) : pressed ? colors.raised : 'transparent',
                                            borderLeftWidth: row.userId === userId ? 3 : 0,
                                            borderLeftColor: '#6d28d9'
                                        })}
                                    >
                                        <Num size={16} style={{ width: 32 }}>
                                            {row.rank}
                                        </Num>
                                        <Txt size={13} weight={row.userId === userId ? 'extrabold' : 'semibold'} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                            {fanLabel(row.name, row.userId === userId)}
                                        </Txt>
                                        <Num size={18}>{fmtPts(row.points)}</Num>
                                        <Txt size={11} weight="bold" tone="muted" tabular style={{ width: 56, textAlign: 'right' }}>
                                            {dayRows[0] && row.points < dayRows[0].points ? fmtPts(row.points - dayRows[0].points) : '–'}
                                        </Txt>
                                    </Pressable>
                                </Animated.View>
                            )
                        )}
                    </View>
                )}
                {!dayStarted && dayRows.length > 0 && (
                    <Txt size={11} tone="muted">
                        {t('pro.fantasy.table.dayNotStarted')}
                    </Txt>
                )}
            </View>
        </View>
    );
};
