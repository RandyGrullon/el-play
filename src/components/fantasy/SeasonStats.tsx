// «Mi temporada» (igual que la web): los números de toda la temporada de un fanático (/api/v2/fantasy/fan/:id/stats):
// Puntos, Promedio, Mejor día, Días jugados y las rachas; los puntos por día en barras con su puesto en una línea (a
// la derecha, el 1 arriba); el capitán; los pronósticos; los peloteros que más usó y los logros. Lo usan la pestaña del
// Lite, la hoja de PRO y el perfil de cada fanático. Sin la ruta (404, 503 o error) solo salen los logros calculados en
// el teléfono (como antes) o nada, según `fallback`.
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    Activity,
    Award,
    CalendarCheck,
    CalendarRange,
    Coins,
    Crown,
    Flame,
    ListOrdered,
    Lock,
    Medal,
    Rocket,
    Shield,
    Star,
    Target,
    TrendingUp,
    Trophy,
    Users,
    Zap,
    type LucideIcon
} from 'lucide-react-native';
import type { LeagueId } from '../../types';
import { localeFor } from '../../lib/format';
import { accountEnabled, myLeagues } from '../../lib/account';
import { achievementDone, achievementsOf, fetchLeagueWeeks, statsEmpty, useFanStats, weekTitles, withWeekTitles, type AchievementState, type FanStats, type FanStatsDay } from '../../lib/fantasyStats';
import { useColors } from '../../theme/theme';
import { alpha, radius } from '../../theme/tokens';
import { Button, Card, PlayerPhoto, Row, Skeleton, Txt } from '../ui';
import { PlayerLink } from '../stats/common';
import { useFanProfile } from './fans';
import { formatCredits } from './shared';

/** «16 oct» de un día 'YYYY-MM-DD' (o de una fecha con hora) */
export const statsDate = (value: string, lang: string) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : 'America/Santo_Domingo' }).replace('.', '');
};

const ICONS: Record<string, LucideIcon> = {
    firstTeam: Users,
    days10: CalendarCheck,
    days30: CalendarRange,
    day50: Flame,
    day100: Zap,
    day150: Rocket,
    streak3: TrendingUp,
    streak7: Activity,
    streak14: Medal,
    perfectPicks: Target,
    captainMvp: Crown,
    season500: Trophy,
    season1000: Star,
    top10Day: ListOrdered,
    dayLeader: Award,
    bargain: Coins,
    weekChampion: Shield
};

/**
 * Las semanas que ganaste en tus ligas privadas (de /weeks): el servidor no ve las ligas (las protege la base), así que
 * «Campeón de la semana» lo marca el teléfono. Solo para la propia cuenta.
 */
const useOwnWeekTitles = (league: LeagueId, userId: string, enabled: boolean) =>
    useQuery({
        queryKey: ['fantasy-week-titles', league, userId],
        queryFn: async ({ signal }) => {
            const leagues = await myLeagues();
            const weeks = await Promise.all(leagues.map((item) => fetchLeagueWeeks(league, item.members, signal).catch(() => [])));
            return weekTitles(weeks, userId);
        },
        enabled: enabled && accountEnabled(),
        staleTime: 10 * 60000,
        retry: false
    });

interface SeasonStatsProps {
    userId: string;
    league: LeagueId;
    /** La propia cuenta («Mi temporada», «Los que más usaste») o la de otro («Su temporada», «Los que más usó») */
    own: boolean;
    /**
     * Sin la ruta nueva: 'achievements' muestra el aviso y los logros calculados con el perfil (la pestaña y la hoja);
     * 'badges' solo los logros (el perfil, que ya tiene sus números); 'none' no muestra nada.
     */
    fallback?: 'achievements' | 'badges' | 'none';
    /** «Armar mi equipo» del estado vacío (solo la propia cuenta) */
    onBuild?: () => void;
    /** Sin el título de la sección (la hoja ya lo tiene) */
    bare?: boolean;
}

export const SeasonStats: React.FC<SeasonStatsProps> = ({ userId, league, own, fallback = 'achievements', onBuild, bare = false }) => {
    const { t } = useTranslation();
    const query = useFanStats(userId, league);
    // El perfil de siempre: los logros sin la ruta nueva (la misma consulta del resumen y del perfil)
    const profile = useFanProfile(query.isError || (query.isSuccess && !query.data) ? userId : null, league);
    const stats = query.data ?? null;
    const titles = useOwnWeekTitles(league, userId, own && !!stats && !statsEmpty(stats));

    if (query.isPending && query.fetchStatus === 'fetching') {
        return (
            <View style={{ gap: 12 }}>
                <Skeleton height={20} width={140} round={10} />
                <Skeleton height={150} />
                <Skeleton height={200} />
            </View>
        );
    }

    if (!stats) {
        if (fallback === 'none') return null;
        const achievements = achievementsOf(null, profile.data);
        if (!achievements) return null;
        return (
            <View style={{ gap: 12 }}>
                {fallback === 'achievements' && (
                    <Card style={{ padding: 14 }}>
                        <Txt size={14} tone="muted">
                            {t('fantasyStats.fallback')}
                        </Txt>
                    </Card>
                )}
                <AchievementsGallery list={achievements.list} />
            </View>
        );
    }

    if (statsEmpty(stats)) {
        return (
            <Card style={{ gap: 12, alignItems: 'flex-start' }}>
                <Txt size={14} tone="muted">
                    {own ? t('fantasyStats.empty') : t('fantasyStats.emptyOther')}
                </Txt>
                {own && onBuild ? <Button label={t('fantasyStats.emptyCta')} onPress={onBuild} /> : null}
            </Card>
        );
    }

    const achievements = achievementsOf(stats, profile.data);
    return (
        <View style={{ gap: 16 }}>
            {!bare && (
                <Txt eyebrow accessibilityRole="header">
                    {own ? t('fantasyStats.title') : t('fantasyStats.titleOther')}
                </Txt>
            )}
            <Kpis stats={stats} />
            {stats.days.length > 0 && <SeasonChart days={stats.days} own={own} />}
            <CaptainCard stats={stats} />
            <PicksCard stats={stats} />
            <PlayersCard stats={stats} own={own} />
            {achievements ? <AchievementsGallery list={achievements.source === 'server' ? withWeekTitles(achievements.list, titles.data ?? []) : achievements.list} /> : null}
        </View>
    );
};

// ---------------------------------------------------------------- números

const Tile: React.FC<{ label: string; value: string; hint?: string; basis: string }> = ({ label, value, hint, basis }) => {
    const colors = useColors();
    return (
        <View accessible accessibilityLabel={[label, value, hint].filter(Boolean).join(', ')} style={{ flexBasis: basis as `${number}%`, flexGrow: 1, minWidth: 0, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 10, gap: 2 }}>
            <Txt size={11} weight="bold" tone="muted" numberOfLines={1}>
                {label}
            </Txt>
            <Txt size={22} weight="extrabold" tabular numberOfLines={1} adjustsFontSizeToFit style={{ lineHeight: 26 }}>
                {value}
            </Txt>
            {hint ? (
                <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                    {hint}
                </Txt>
            ) : null}
        </View>
    );
};

const Kpis: React.FC<{ stats: FanStats }> = ({ stats }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    // Tres por fila; en 320 px, dos
    const basis = useWindowDimensions().width < 360 ? '45%' : '30%';
    const { totals, streak } = stats;
    return (
        <Card style={{ gap: 10 }}>
            <Txt eyebrow accessibilityRole="header">
                {t('fantasyStats.kpis')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Tile basis={basis} label={t('fantasyStats.kpi.points')} value={formatCredits(totals.total, lang)} />
                <Tile basis={basis} label={t('fantasyStats.kpi.avg')} value={formatCredits(totals.avg, lang)} hint={`${t('fantasyStats.kpi.perDay')} · ${t('fantasyStats.kpi.median', { n: formatCredits(totals.median, lang) })}`} />
                <Tile basis={basis} label={t('fantasyStats.kpi.best')} value={totals.best ? formatCredits(totals.best.total, lang) : '—'} hint={totals.best ? statsDate(totals.best.date, lang) : undefined} />
                <Tile basis={basis} label={t('fantasyStats.kpi.days')} value={String(totals.days)} />
                <Tile basis={basis} label={t('fantasyStats.kpi.streak')} value={t('fantasyStats.kpi.daysUnit', { count: streak.current })} />
                <Tile basis={basis} label={t('fantasyStats.kpi.longest')} value={t('fantasyStats.kpi.daysUnit', { count: streak.longest })} />
            </View>
        </Card>
    );
};

// ---------------------------------------------------------------- puntos por día

/** Barras de los puntos de cada día y, con «Ver mi puesto», la línea del puesto del día (eje de la derecha, el 1 arriba) */
const SeasonChart: React.FC<{ days: FanStatsDay[]; own: boolean }> = ({ days, own }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const [width, setWidth] = useState(0);
    const [showRank, setShowRank] = useState(false);
    const [selected, setSelected] = useState<number | null>(null);
    const hasRank = days.some((day) => day.rank !== null);
    const rankOn = showRank && hasRank;
    const H = 150;
    const top = 10;
    const bottom = 18;
    const right = rankOn ? 30 : 0;
    const plotW = Math.max(0, width - right);
    const plotH = H - top - bottom;
    const max = Math.max(1, ...days.map((day) => day.total));
    const min = Math.min(0, ...days.map((day) => day.total));
    const y = (value: number) => top + ((max - value) / (max - min)) * plotH;
    const step = days.length ? plotW / days.length : 0;
    const barW = Math.max(2, Math.min(28, step * 0.7));
    const maxRank = Math.max(2, ...days.map((day) => (day.rank !== null ? Math.max(day.rank, day.players || 0) : 0)));
    const yRank = (rank: number) => top + ((rank - 1) / (maxRank - 1)) * plotH;
    const rankPoints = days.map((day, index) => (day.rank !== null ? `${index * step + step / 2},${yRank(day.rank)}` : null)).filter((point): point is string => !!point);
    const best = days.reduce((top1, day) => (day.total > top1.total ? day : top1), days[0]);
    const pick = selected !== null ? days[selected] : null;
    const barText = (day: FanStatsDay) =>
        day.rank !== null
            ? t('fantasyStats.chart.barRank', { date: statsDate(day.date, lang), pts: formatCredits(day.total, lang), rank: day.rank, players: day.players })
            : t('fantasyStats.chart.bar', { date: statsDate(day.date, lang), pts: formatCredits(day.total, lang) });
    const ticks = days.length > 1 ? [0, days.length - 1] : [0];

    return (
        <Card style={{ gap: 10 }}>
            <Row justify="space-between" gap={8}>
                <Txt eyebrow accessibilityRole="header" style={{ flexShrink: 1 }}>
                    {t('fantasyStats.chart.title')}
                </Txt>
                {hasRank && (
                    <Pressable
                        onPress={() => setShowRank((value) => !value)}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: showRank }}
                        hitSlop={8}
                        style={{ height: 30, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 12, backgroundColor: showRank ? colors.ink : colors.raised }}
                    >
                        <Txt size={12} weight="bold" color={showRank ? colors.bg : colors.muted}>
                            {own ? t('fantasyStats.chart.showRank') : t('fantasyStats.chart.showRankOther')}
                        </Txt>
                    </Pressable>
                )}
            </Row>
            <Txt size={12} weight="semibold" tone="muted" accessibilityLiveRegion="polite" numberOfLines={1}>
                {pick ? barText(pick) : best ? t('fantasyStats.chart.label', { count: days.length, best: formatCredits(best.total, lang) }) : ''}
            </Txt>
            <View
                onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
                accessible
                accessibilityRole="image"
                accessibilityLabel={`${t('fantasyStats.chart.label', { count: days.length, best: formatCredits(best?.total ?? 0, lang) })}. ${days.map(barText).join('; ')}`}
                style={{ height: H }}
            >
                {width > 0 && (
                    <Pressable
                        onPress={(event) => {
                            const index = Math.floor(event.nativeEvent.locationX / (step || 1));
                            setSelected((current) => (index < 0 || index >= days.length || current === index ? null : index));
                        }}
                        style={{ width, height: H }}
                    >
                        <Svg width={width} height={H}>
                            <Line x1={0} x2={plotW} y1={y(0)} y2={y(0)} stroke={colors.line} strokeWidth={1} />
                            {days.map((day, index) => {
                                const x = index * step + (step - barW) / 2;
                                const y0 = y(Math.max(0, day.total));
                                const y1 = y(Math.min(0, day.total));
                                const on = selected === index;
                                return <Rect key={day.date} x={x} y={y0} width={barW} height={Math.max(1, y1 - y0)} rx={Math.min(3, barW / 2)} fill={day.total < 0 ? colors.live : on ? colors.ink : colors.accent} opacity={selected === null || on ? 1 : 0.45} />;
                            })}
                            {rankOn && rankPoints.length > 1 && <Polyline points={rankPoints.join(' ')} fill="none" stroke={colors.gold} strokeWidth={2} strokeLinejoin="round" />}
                            {rankOn &&
                                days.map((day, index) => (day.rank !== null ? <Circle key={`r-${day.date}`} cx={index * step + step / 2} cy={yRank(day.rank)} r={selected === index ? 4 : 2.5} fill={colors.gold} /> : null))}
                            {rankOn && (
                                <>
                                    <SvgText x={width - 2} y={top + 4} fontSize={10} fill={colors.muted} textAnchor="end">
                                        {t('fantasyStats.chart.rankAxis', { rank: 1 })}
                                    </SvgText>
                                    <SvgText x={width - 2} y={top + plotH} fontSize={10} fill={colors.muted} textAnchor="end">
                                        {t('fantasyStats.chart.rankAxis', { rank: maxRank })}
                                    </SvgText>
                                </>
                            )}
                            {ticks.map((index) => (
                                <SvgText key={`t-${index}`} x={index === 0 ? 0 : plotW} y={H - 4} fontSize={10} fill={colors.muted} textAnchor={index === 0 ? 'start' : 'end'}>
                                    {statsDate(days[index].date, lang)}
                                </SvgText>
                            ))}
                        </Svg>
                    </Pressable>
                )}
            </View>
            <Row gap={16} wrap>
                <Row gap={6}>
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.accent }} />
                    <Txt size={11} weight="semibold" tone="muted">
                        {t('fantasyStats.chart.legendPoints')}
                    </Txt>
                </Row>
                {rankOn && (
                    <Row gap={6}>
                        <View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: colors.gold }} />
                        <Txt size={11} weight="semibold" tone="muted">
                            {t('fantasyStats.chart.legendRank')}
                        </Txt>
                    </Row>
                )}
            </Row>
        </Card>
    );
};

// ---------------------------------------------------------------- capitán, pronósticos y peloteros

const Mini: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
    <View accessible accessibilityLabel={[label, value, hint].filter(Boolean).join(', ')} style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt size={11} weight="bold" tone="muted" numberOfLines={1}>
            {label}
        </Txt>
        <Txt size={20} weight="extrabold" tabular numberOfLines={1}>
            {value}
        </Txt>
        {hint ? (
            <Txt size={10} weight="semibold" tone="muted" numberOfLines={2}>
                {hint}
            </Txt>
        ) : null}
    </View>
);

const CaptainCard: React.FC<{ stats: FanStats }> = ({ stats }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const { captain } = stats;
    return (
        <Card style={{ gap: 12 }}>
            <Row gap={6}>
                <Crown size={14} color={colors.gold} />
                <Txt eyebrow accessibilityRole="header">
                    {t('fantasyStats.captain.title')}
                </Txt>
            </Row>
            {captain.days > 0 ? (
                <>
                    <Row gap={12} align="flex-start">
                        <Mini label={t('fantasyStats.captain.days')} value={String(captain.days)} />
                        <Mini label={t('fantasyStats.captain.avg')} value={formatCredits(captain.avg, lang)} />
                        <Mini label={t('fantasyStats.captain.bonus')} value={`+${formatCredits(captain.bonus, lang)}`} hint={t('fantasyStats.captain.bonusHint')} />
                    </Row>
                    {captain.best && (
                        <PlayerLink player={{ id: captain.best.id, name: captain.best.name }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, backgroundColor: alpha(colors.gold, 0.12), padding: 10 }}>
                            <PlayerPhoto personId={captain.best.id} name={captain.best.name} size={44} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt size={11} weight="bold" tone="muted">
                                    {t('fantasyStats.captain.best')}
                                </Txt>
                                <Txt size={14} weight="extrabold" numberOfLines={1}>
                                    {captain.best.name}
                                </Txt>
                                <Txt size={12} weight="semibold" tone="muted" numberOfLines={1}>
                                    {t('fantasyStats.captain.bestDetail', { pts: formatCredits(captain.best.points, lang), date: statsDate(captain.best.date, lang) })}
                                </Txt>
                            </View>
                        </PlayerLink>
                    )}
                </>
            ) : (
                <Txt size={14} tone="muted">
                    {t('fantasyStats.captain.none')}
                </Txt>
            )}
        </Card>
    );
};

const PicksCard: React.FC<{ stats: FanStats }> = ({ stats }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const { picks } = stats;
    const pct = picks.pct ?? (picks.made ? (picks.hits / picks.made) * 100 : null);
    return (
        <Card style={{ gap: 12 }}>
            <Txt eyebrow accessibilityRole="header">
                {t('fantasyStats.picks.title')}
            </Txt>
            {picks.made > 0 ? (
                <>
                    <Row gap={12} align="flex-start">
                        <Mini label={t('fantasyStats.picks.hits')} value={String(picks.hits)} />
                        <Mini label={t('fantasyStats.picks.made')} value={String(picks.made)} />
                        <Mini label={t('fantasyStats.picks.pct')} value={pct !== null ? `${formatCredits(Math.round(pct), i18n.language)} %` : '—'} />
                    </Row>
                    <View style={{ height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.raised }}>
                        <View style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct ?? 0))}%`, borderRadius: radius.pill, backgroundColor: colors.ball }} />
                    </View>
                    <Txt size={12} weight="semibold" tone="muted">
                        {t('fantasyStats.picks.summary', { hits: picks.hits, made: picks.made, pct: pct !== null ? formatCredits(Math.round(pct), i18n.language) : '—' })}
                    </Txt>
                </>
            ) : (
                <Txt size={14} tone="muted">
                    {t('fantasyStats.picks.none')}
                </Txt>
            )}
        </Card>
    );
};

const PlayersCard: React.FC<{ stats: FanStats; own: boolean }> = ({ stats, own }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const players = stats.players.slice(0, 12);
    return (
        <Card style={{ gap: 4 }}>
            <Txt eyebrow accessibilityRole="header" style={{ marginBottom: 4 }}>
                {own ? t('fantasyStats.players.title') : t('fantasyStats.players.titleOther')}
            </Txt>
            {players.length ? (
                players.map((player, index) => (
                    <PlayerLink key={player.id} player={{ id: player.id, name: player.name, teamId: player.teamId }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                        <Txt size={12} weight="bold" tone="faint" tabular style={{ width: 18 }}>
                            {index + 1}
                        </Txt>
                        <PlayerPhoto personId={player.id} name={player.name} size={36} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={14} weight="extrabold" numberOfLines={1}>
                                {player.name}
                            </Txt>
                            <Txt size={12} tone="muted" numberOfLines={1}>
                                {`${player.role === 'P' ? t('fantasy.pitcher') : t('fantasy.batter')} · ${t('fantasyStats.players.days', { count: player.days })}`}
                            </Txt>
                        </View>
                        <Txt size={16} weight="extrabold" tabular>
                            {t('fantasyStats.players.pts', { pts: formatCredits(player.points, i18n.language) })}
                        </Txt>
                    </PlayerLink>
                ))
            ) : (
                <Txt size={14} tone="muted">
                    {t('fantasyStats.players.none')}
                </Txt>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------- logros

const achievementLine = (item: AchievementState, t: TFunction, lang: string) => {
    if (achievementDone(item)) return item.unlockedAt ? t('fantasyStats.badges.unlocked', { date: statsDate(item.unlockedAt, lang) }) : t('fantasyStats.badges.unlockedNoDate');
    return item.progress ? t('fantasyStats.badges.progress', { value: formatCredits(item.progress.value, lang), goal: formatCredits(item.progress.goal, lang) }) : t('fantasyStats.badges.locked');
};

/** Todos los logros: los que tiene en dorado (con su fecha) y los que faltan apagados, con su barra de lo que lleva */
export const AchievementsGallery: React.FC<{ list: AchievementState[] }> = ({ list }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const two = useWindowDimensions().width < 360;
    const done = list.filter(achievementDone).length;
    if (!list.length) return null;
    return (
        <View style={{ gap: 8 }}>
            <Txt eyebrow accessibilityRole="header">
                {`${t('fantasyStats.badges.title')} · ${t('fantasyStats.badges.count', { done, total: list.length })}`}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {list.map((item) => {
                    const unlocked = achievementDone(item);
                    const Icon = ICONS[item.id] ?? Trophy;
                    const title = t(`fantasyStats.achievements.${item.id}.title`);
                    const desc = t(`fantasyStats.achievements.${item.id}.desc`);
                    const line = achievementLine(item, t, lang);
                    const share = item.progress ? Math.max(0, Math.min(1, item.progress.value / item.progress.goal)) : 0;
                    return (
                        <View
                            key={item.id}
                            accessible
                            accessibilityLabel={`${title}. ${desc}. ${line}`}
                            style={{ flexBasis: two ? '45%' : '30%', flexGrow: 1, minWidth: 0, gap: 4, borderRadius: radius.tile, padding: 10, backgroundColor: unlocked ? alpha(colors.gold, 0.15) : colors.raised }}
                        >
                            <Row justify="space-between">
                                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: unlocked ? colors.gold : alpha(colors.muted, 0.15) }}>
                                    <Icon size={16} color={unlocked ? '#fff' : colors.muted} />
                                </View>
                                {!unlocked && <Lock size={12} color={colors.faint} />}
                            </Row>
                            <Txt size={12} weight="extrabold" numberOfLines={2} style={{ opacity: unlocked ? 1 : 0.8 }}>
                                {title}
                            </Txt>
                            <Txt size={10} tone="muted" numberOfLines={3}>
                                {desc}
                            </Txt>
                            {!unlocked && item.progress ? (
                                <View style={{ height: 4, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: alpha(colors.muted, 0.2) }}>
                                    <View style={{ height: '100%', width: `${share * 100}%`, backgroundColor: colors.accent }} />
                                </View>
                            ) : null}
                            <Txt size={10} weight="bold" tone={unlocked ? 'ink' : 'muted'} tabular numberOfLines={1}>
                                {line}
                            </Txt>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};
