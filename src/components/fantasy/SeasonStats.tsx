// «Mi temporada» (igual que SeasonView de la web): los números de la temporada (puntos, promedio, mejor día, días y las
// rachas), la gráfica de puntos por día con el puesto encima (eje de la derecha, el 1 arriba), el capitán, los
// pronósticos, los peloteros que más usó y los logros (/api/v2/fantasy/fan/:id/stats). Es la pestaña del Lite, va en la
// hoja de PRO y en el perfil de cada fanático. Sin la ruta (404, 503 o error) se arma con el perfil (números y gráfica,
// con su aviso) y los logros con el cálculo de antes; en PRO (`fallback="badges"`), solo los logros.
import React, { useRef, useState, type ComponentRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Polyline, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Crown, LineChart, Target, Trophy, Users } from 'lucide-react-native';
import type { LeagueId } from '../../types';
import { localeFor } from '../../lib/format';
import { accountEnabled, myLeagues } from '../../lib/account';
import { useFantasyDay, type FantasyDay } from '../../lib/fantasy';
import { ACHIEVEMENT_ICONS, achievementList, fetchLeagueWeeks, seasonData, useFanStats, weekTitle, withWeekTitle, type AchievementView, type FanStats, type FanStatsDay } from '../../lib/fantasyStats';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { Card, ErrorState, OfflineState, PlayerPhoto, Row, Skeleton, Txt } from '../ui';
import { PlayerLink, playerTextLink, teamTextLink } from '../stats/common';
import { useFanProfile } from './fans';
import { useLocalText } from './texts';
import { formatCredits } from './shared';

/** «16 oct» de un día 'YYYY-MM-DD' (o de una fecha con hora) */
export const statsDate = (value: string, lang: string) => {
    const plain = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = plain ? new Date(`${value}T12:00:00Z`) : new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', timeZone: plain ? 'UTC' : 'America/Santo_Domingo' }).replace('.', '');
};

/** «vie, 16 oct» */
const shortDay = (value: string, lang: string) => {
    const text = new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString(localeFor(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * «Campeón de la semana» (solo la propia cuenta: las ligas privadas no se ven desde afuera): el domingo de la primera
 * semana que ganó en una de sus ligas, de /weeks
 */
const useWeekTitle = (league: LeagueId, userId: string, enabled: boolean) =>
    useQuery({
        queryKey: ['fantasy-week-title', league, userId],
        queryFn: async ({ signal }) => {
            const titles: string[] = [];
            for (const item of await myLeagues()) {
                const weeks = await fetchLeagueWeeks(league, item.members, signal).catch(() => []);
                const title = weekTitle(weeks, userId);
                if (title) titles.push(title);
            }
            return titles.sort()[0] ?? null;
        },
        enabled: enabled && accountEnabled(),
        staleTime: 10 * 60000,
        retry: false
    });

export type KpiKey = 'points' | 'avg' | 'best' | 'days' | 'streak' | 'longest';
const ALL_KPIS: KpiKey[] = ['points', 'avg', 'best', 'days', 'streak', 'longest'];
/** En el perfil la cabecera ya dice los puntos, los días y el mejor día: la temporada muestra el resto */
export const PROFILE_KPIS: KpiKey[] = ['avg', 'streak', 'longest'];

interface SeasonStatsProps {
    userId: string;
    league: LeagueId;
    /** La propia cuenta («Mi temporada», «Los que más usaste») o la de otro («Su temporada», «Los que más usó») */
    own: boolean;
    /** Qué números se muestran arriba */
    kpis?: KpiKey[];
    /** Sin la ruta nueva: 'profile' arma la temporada con el perfil (como la web); 'badges' solo los logros (PRO ya tiene sus números) */
    fallback?: 'profile' | 'badges';
    /** «Armar mi equipo» de la temporada vacía (solo la propia cuenta) */
    onBuild?: () => void;
    /** Con el título «Mi temporada» / «Su temporada» encima (en el perfil) */
    titled?: boolean;
}

export const SeasonStats: React.FC<SeasonStatsProps> = ({ userId, league, own, kpis = ALL_KPIS, fallback = 'profile', onBuild, titled = false }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const query = useFanStats(userId, league);
    // El perfil de siempre (la misma consulta del resumen y del perfil): respaldo si el servidor no tiene la temporada
    const profileQuery = useFanProfile(query.data ? null : userId, league);
    const profile = profileQuery.data;
    // Los equipos (siglas y logos) salen del día de hoy, que ya está en la caché
    const teams = useFantasyDay(league).data?.teams;
    const title = useWeekTitle(league, userId, own && query.isSuccess && !!query.data);
    const stats = query.data ?? null;
    const data = seasonData(stats, query.isError || query.isPending ? profile : null);
    const achievements = withWeekTitle(achievementList(stats, query.isError ? profile : null), title.data);
    const heading = titled ? (
        <Txt eyebrow accessibilityRole="header">
            {own ? t('fantasyStats.title') : t('fantasyStats.titleOther')}
        </Txt>
    ) : null;

    if (fallback === 'badges' && !stats) {
        if (!query.isError || !achievements.length) return null;
        return (
            <View style={{ gap: 12 }}>
                {heading}
                <AchievementsGallery items={achievements} />
            </View>
        );
    }

    if (!data) {
        if (query.isPending && query.fetchStatus === 'paused') return <OfflineState />;
        if (query.isPending) {
            return (
                <View style={{ gap: 12 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} height={72} round={16} style={{ flexBasis: '45%', flexGrow: 1, width: undefined }} />
                        ))}
                    </View>
                    <Skeleton height={200} />
                </View>
            );
        }
        if (!userId) return null;
        return <ErrorState message={t('fantasyStats.error')} onRetry={() => query.refetch()} />;
    }

    const season = data.stats;
    const empty = season.totals.days === 0 && season.days.length === 0;
    return (
        <View style={{ gap: 16 }}>
            {heading}
            {empty ? (
                <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
                    <Trophy size={32} color={colors.gold} />
                    <Txt size={14} weight="semibold" center>
                        {own ? t('fantasyStats.empty') : t('fantasyStats.emptyOther')}
                    </Txt>
                    {own && onBuild ? <BuildButton onPress={onBuild} /> : null}
                </Card>
            ) : (
                <>
                    <Kpis stats={season} keys={kpis} />
                    {season.days.length > 0 && <PointsChart days={season.days} own={own} best={season.totals.best?.date ?? null} />}
                    {data.full && <CaptainCard stats={season} teams={teams} />}
                    {data.full && <PicksCard stats={season} />}
                    {data.full && season.players.length > 0 && <MostUsed stats={season} own={own} teams={teams} />}
                    {!data.full && query.isError && (
                        <Txt size={12} tone="muted" style={{ paddingHorizontal: 4 }}>
                            {t('fantasyStats.fallback')}
                        </Txt>
                    )}
                </>
            )}
            {achievements.length > 0 && <AchievementsGallery items={achievements} />}
        </View>
    );
};

const BuildButton: React.FC<{ onPress: () => void }> = ({ onPress }) => {
    const { t } = useTranslation();
    const colors = useColors();
    return (
        <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ height: 44, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 20, backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 })}>
            <Txt size={14} weight="extrabold" color="#fff">
                {t('fantasyStats.emptyCta')}
            </Txt>
        </Pressable>
    );
};

// ---------------------------------------------------------------- números

const Kpis: React.FC<{ stats: FanStats; keys: KpiKey[] }> = ({ stats, keys }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    // Dos por fila; desde 480 px, tres
    const basis = useWindowDimensions().width >= 480 ? '30%' : '45%';
    const n = (value: number) => formatCredits(Math.abs(value) >= 1000 ? Math.round(value) : value, lang);
    const items: Record<KpiKey, { value: string; hint?: string }> = {
        points: { value: n(stats.totals.total) },
        avg: { value: n(stats.totals.avg), hint: stats.totals.median ? t('fantasyStats.kpi.median', { n: formatCredits(stats.totals.median, lang) }) : t('fantasyStats.kpi.perDay') },
        best: { value: stats.totals.best ? n(stats.totals.best.total) : '—', hint: stats.totals.best ? shortDay(stats.totals.best.date, lang) : undefined },
        days: { value: String(stats.totals.days) },
        streak: { value: String(stats.streak.current), hint: t('fantasyStats.kpi.daysUnit', { count: stats.streak.current }) },
        longest: { value: String(stats.streak.longest), hint: t('fantasyStats.kpi.daysUnit', { count: stats.streak.longest }) }
    };
    return (
        <View accessibilityLabel={t('fantasyStats.kpis')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {keys.map((key) => {
                const item = items[key];
                const label = t(`fantasyStats.kpi.${key}`);
                return (
                    <View key={key} accessible accessibilityLabel={[label, item.value, item.hint].filter(Boolean).join(', ')} style={[{ flexBasis: basis, flexGrow: 1, minWidth: 0, borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10 }, shadow('card')]}>
                        <Txt size={11} weight="bold" tone="muted" numberOfLines={1}>
                            {label}
                        </Txt>
                        <Txt size={26} weight="extrabold" tabular numberOfLines={1} adjustsFontSizeToFit style={{ lineHeight: 30 }}>
                            {item.value}
                        </Txt>
                        {item.hint ? (
                            <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                                {item.hint.charAt(0).toUpperCase() + item.hint.slice(1)}
                            </Txt>
                        ) : null}
                    </View>
                );
            })}
        </View>
    );
};

// ---------------------------------------------------------------- gráfica

/** Barras con los puntos de cada día (el mejor en dorado) y, si se pide, la línea del puesto en el eje de la derecha (el 1 arriba) */
export const PointsChart: React.FC<{ days: FanStatsDay[]; own: boolean; best: string | null }> = ({ days, own, best }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const [showRank, setShowRank] = useState(false);
    const [selected, setSelected] = useState<number | null>(null);
    const [width, setWidth] = useState(0);
    const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
    const ranked = days.filter((day) => day.rank !== null);
    const hasRank = ranked.length > 1;
    const max = Math.max(1, ...days.map((day) => day.total));
    // El eje del puesto va del 1 al peor puesto que tuvo (así la línea usa todo el alto)
    const worstRank = Math.max(2, ...ranked.map((day) => day.rank ?? 1));
    const top = Math.round(max);
    const H = 160;
    // Cada día al menos 9 px; si no caben, la gráfica se desliza y se ve lo más nuevo (a la derecha)
    const inner = Math.max(width, days.length * 9);
    const step = days.length ? inner / days.length : 0;
    const barW = Math.max(2, step - 3);
    const y = (value: number) => H - (Math.max(0, value) / max) * H;
    const rankY = (rank: number) => ((rank - 1) / (worstRank - 1)) * H;
    const points = ranked.map((day) => `${days.indexOf(day) * step + step / 2},${rankY(day.rank!)}`).join(' ');
    const bestDay = days.find((day) => day.date === best) ?? days.reduce((high, day) => (day.total > high.total ? day : high), days[0]);
    const summary = t('fantasyStats.chart.label', { count: days.length, best: formatCredits(bestDay.total, lang) });
    const barText = (day: FanStatsDay) =>
        day.rank !== null && day.players
            ? t('fantasyStats.chart.barRank', { date: shortDay(day.date, lang), pts: formatCredits(day.total, lang), rank: day.rank, players: day.players })
            : t('fantasyStats.chart.bar', { date: shortDay(day.date, lang), pts: formatCredits(day.total, lang) });
    const pick = selected !== null ? days[selected] : null;
    const axis = { width: 32, height: H, justifyContent: 'space-between' } as const;

    return (
        <Card style={{ gap: 12 }}>
            <Row justify="space-between" gap={12}>
                <Row gap={6} style={{ flexShrink: 1 }}>
                    <LineChart size={14} color={colors.muted} />
                    <Txt eyebrow accessibilityRole="header">
                        {t('fantasyStats.chart.title')}
                    </Txt>
                </Row>
                {hasRank && (
                    <Pressable
                        onPress={() => setShowRank((value) => !value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: showRank }}
                        hitSlop={6}
                        style={{ height: 32, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 12, backgroundColor: showRank ? colors.ink : colors.raised }}
                    >
                        <Txt size={12} weight="bold" color={showRank ? colors.bg : colors.muted}>
                            {own ? t('fantasyStats.chart.showRank') : t('fantasyStats.chart.showRankOther')}
                        </Txt>
                    </Pressable>
                )}
            </Row>
            {/* El día que se toca (como el título de cada barra en la web) */}
            <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} accessibilityLiveRegion="polite">
                {pick ? barText(pick) : summary}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={axis} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    {[top, Math.round(top / 2), 0].map((value, index) => (
                        <Txt key={index} size={10} weight="semibold" tone="muted" tabular style={{ textAlign: 'right' }}>
                            {formatCredits(value, lang)}
                        </Txt>
                    ))}
                </View>
                <View style={{ flex: 1, minWidth: 0 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
                    {width > 0 && (
                        <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
                            <View style={{ width: inner }}>
                                <Pressable
                                    accessible
                                    accessibilityRole="image"
                                    accessibilityLabel={`${summary}. ${days.map(barText).join('; ')}`}
                                    onPress={(event) => {
                                        // Con el teclado (en la web) no hay punto tocado: se quita la marca
                                        const index = Math.floor(Number(event.nativeEvent.locationX) / (step || 1));
                                        setSelected((current) => (!Number.isFinite(index) || index < 0 || index >= days.length || current === index ? null : index));
                                    }}
                                >
                                    <Svg width={inner} height={H}>
                                        {[0, H / 2, H].map((lineY) => (
                                            <Line key={lineY} x1={0} x2={inner} y1={lineY} y2={lineY} stroke={colors.line} strokeWidth={1} />
                                        ))}
                                        {days.map((day, index) => {
                                            const barY = y(day.total);
                                            const height = Math.max(1.5, H - barY);
                                            const fill = day.total < 0 ? colors.live : day.date === bestDay.date ? colors.gold : colors.accent;
                                            return <Rect key={day.date} x={index * step + 1.5} y={H - height} width={barW} height={height} rx={Math.min(2, barW / 2)} fill={fill} opacity={selected === null || selected === index ? 1 : 0.45} />;
                                        })}
                                        {showRank && hasRank && <Polyline points={points} fill="none" stroke={colors.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                                    </Svg>
                                </Pressable>
                                <Row justify="space-between" style={{ marginTop: 4 }}>
                                    <Txt size={10} weight="semibold" tone="muted">
                                        {statsDate(days[0].date, lang)}
                                    </Txt>
                                    {days.length > 1 && (
                                        <Txt size={10} weight="semibold" tone="muted">
                                            {statsDate(days[days.length - 1].date, lang)}
                                        </Txt>
                                    )}
                                </Row>
                            </View>
                        </ScrollView>
                    )}
                </View>
                {showRank && hasRank && (
                    <View style={axis} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                        <Txt size={10} weight="semibold" tone="muted" tabular>
                            {t('fantasyStats.chart.rankAxis', { rank: 1 })}
                        </Txt>
                        <Txt size={10} weight="semibold" tone="muted" tabular>
                            {t('fantasyStats.chart.rankAxis', { rank: worstRank })}
                        </Txt>
                    </View>
                )}
            </View>
            <Row gap={16} wrap>
                <Row gap={6}>
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.accent }} />
                    <Txt size={11} weight="semibold" tone="muted">
                        {t('fantasyStats.chart.legendPoints')}
                    </Txt>
                </Row>
                {showRank && hasRank && (
                    <Row gap={6}>
                        <View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: colors.ink }} />
                        <Txt size={11} weight="semibold" tone="muted">
                            {t('fantasyStats.chart.legendRank')}
                        </Txt>
                    </Row>
                )}
            </Row>
        </Card>
    );
};

// ---------------------------------------------------------------- capitán y pronósticos

const MiniStat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
    <View accessible accessibilityLabel={[label, value, hint].filter(Boolean).join(', ')} style={{ flex: 1, minWidth: 0 }}>
        <Txt size={11} weight="bold" tone="muted" numberOfLines={1}>
            {label}
        </Txt>
        <Txt size={24} weight="extrabold" tabular numberOfLines={1} adjustsFontSizeToFit style={{ lineHeight: 28 }}>
            {value}
        </Txt>
        {hint ? (
            <Txt size={10} weight="semibold" tone="muted" numberOfLines={1}>
                {hint}
            </Txt>
        ) : null}
    </View>
);

const CaptainCard: React.FC<{ stats: FanStats; teams?: FantasyDay['teams'] }> = ({ stats, teams }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const { captain } = stats;
    const best = captain.best;
    const teamId = best ? (stats.players.find((player) => player.id === best.id)?.teamId ?? null) : null;
    const team = teamId !== null ? teams?.[teamId] : undefined;
    return (
        <Card style={{ gap: 12 }}>
            <Row gap={6}>
                <Crown size={14} color={colors.gold} />
                <Txt eyebrow accessibilityRole="header">
                    {t('fantasyStats.captain.title')}
                </Txt>
            </Row>
            {captain.days === 0 ? (
                <Txt size={14} tone="muted">
                    {t('fantasyStats.captain.none')}
                </Txt>
            ) : (
                <Row gap={8} align="flex-start">
                    <MiniStat label={t('fantasyStats.captain.days')} value={String(captain.days)} />
                    <MiniStat label={t('fantasyStats.captain.avg')} value={formatCredits(captain.avg, lang)} />
                    <MiniStat label={t('fantasyStats.captain.bonus')} value={`+${formatCredits(captain.bonus, lang)}`} hint={t('fantasyStats.captain.bonusHint')} />
                </Row>
            )}
            {best && (
                <Row gap={12} style={{ borderRadius: 16, backgroundColor: alpha(colors.gold, 0.1), padding: 10 }}>
                    <PlayerLink player={{ id: best.id, name: best.name, teamId }}>
                        <PlayerPhoto personId={best.id} name={best.name} size={44} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                    </PlayerLink>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={11} weight="bold" tone="muted">
                            {t('fantasyStats.captain.best')}
                        </Txt>
                        <Txt size={14} weight="extrabold" numberOfLines={1} {...playerTextLink({ id: best.id, name: best.name, teamId })}>
                            {best.name}
                        </Txt>
                        <Txt size={12} tone="muted" numberOfLines={1}>
                            {t('fantasyStats.captain.bestDetail', { pts: formatCredits(best.points, lang), date: best.date ? shortDay(best.date, lang) : '' })}
                        </Txt>
                    </View>
                </Row>
            )}
        </Card>
    );
};

/** % de aciertos (de los números: así no importa si el servidor lo manda de 0 a 1 o de 0 a 100) */
export const picksPct = (picks: FanStats['picks']) => (picks.made > 0 ? Math.round((picks.hits / picks.made) * 1000) / 10 : null);

const PicksCard: React.FC<{ stats: FanStats }> = ({ stats }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pct = picksPct(stats.picks);
    return (
        <Card style={{ gap: 12 }}>
            <Row gap={6}>
                <Target size={14} color={colors.muted} />
                <Txt eyebrow accessibilityRole="header">
                    {t('fantasyStats.picks.title')}
                </Txt>
            </Row>
            {pct === null ? (
                <Txt size={14} tone="muted">
                    {t('fantasyStats.picks.none')}
                </Txt>
            ) : (
                <>
                    <Row gap={8} align="flex-start">
                        <MiniStat label={t('fantasyStats.picks.hits')} value={String(stats.picks.hits)} />
                        <MiniStat label={t('fantasyStats.picks.made')} value={String(stats.picks.made)} />
                        <MiniStat label={t('fantasyStats.picks.pct')} value={`${formatCredits(pct, lang)} %`} />
                    </Row>
                    <View
                        accessible
                        accessibilityRole="progressbar"
                        accessibilityLabel={t('fantasyStats.picks.summary', { hits: stats.picks.hits, made: stats.picks.made, pct: formatCredits(pct, lang) })}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(pct)}
                        style={{ height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.raised }}
                    >
                        <View style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: radius.pill, backgroundColor: colors.ball }} />
                    </View>
                </>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------- peloteros

const MostUsed: React.FC<{ stats: FanStats; own: boolean; teams?: FantasyDay['teams'] }> = ({ stats, own, teams }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const L = useLocalText();
    const title = own ? t('fantasyStats.players.title') : t('fantasyStats.players.titleOther');
    return (
        <View style={{ gap: 8 }}>
            <Row gap={6}>
                <Users size={14} color={colors.muted} />
                <Txt eyebrow accessibilityRole="header">
                    {title}
                </Txt>
            </Row>
            <Card padded={false} style={{ overflow: 'hidden' }}>
                {stats.players.slice(0, 12).map((player, index) => {
                    const team = player.teamId !== null ? teams?.[player.teamId] : undefined;
                    return (
                        <Row key={player.id} gap={12} style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                            <PlayerLink player={{ id: player.id, name: player.name, teamId: player.teamId }}>
                                <PlayerPhoto personId={player.id} name={player.name} size={40} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                            </PlayerLink>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt size={14} weight="extrabold" numberOfLines={1} {...playerTextLink({ id: player.id, name: player.name, teamId: player.teamId })}>
                                    {player.name}
                                </Txt>
                                <Txt size={12} tone="muted" numberOfLines={1}>
                                    {team ? (
                                        <>
                                            <Text {...teamTextLink(team.id)}>{team.abbrev}</Text>
                                            {' · '}
                                        </>
                                    ) : null}
                                    {`${player.role === 'P' ? t('fantasy.pitcher') : t('fantasy.batter')} · ${t('fantasyStats.players.days', { count: player.days })}`}
                                </Txt>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Txt size={18} weight="extrabold" tabular style={{ lineHeight: 20 }}>
                                    {formatCredits(player.points, lang)}
                                </Txt>
                                <Txt size={10} weight="semibold" tone="muted">
                                    {L('fans.pts')}
                                </Txt>
                            </View>
                        </Row>
                    );
                })}
            </Card>
        </View>
    );
};

// ---------------------------------------------------------------- logros

const achievementLine = (item: AchievementView, t: TFunction, lang: string) =>
    item.done
        ? item.date
            ? t('fantasyStats.badges.unlocked', { date: statsDate(item.date, lang) })
            : t('fantasyStats.badges.unlockedNoDate')
        : item.progress
          ? t('fantasyStats.badges.progress', { value: formatCredits(item.progress.value, lang), goal: formatCredits(item.progress.goal, lang) })
          : t('fantasyStats.badges.locked');

/** Todos los logros: los que tiene en dorado (con su fecha) y los que faltan apagados, con su barra de lo que lleva */
export const AchievementsGallery: React.FC<{ items: AchievementView[] }> = ({ items }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const width = useWindowDimensions().width;
    const basis = width >= 400 ? '30%' : '45%';
    const done = items.filter((item) => item.done).length;
    return (
        <View style={{ gap: 8 }}>
            <Row gap={6}>
                <Trophy size={14} color={colors.muted} />
                <Txt eyebrow accessibilityRole="header">
                    {`${t('fantasyStats.badges.title')} · ${t('fantasyStats.badges.count', { done, total: items.length })}`}
                </Txt>
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {items.map((item) => {
                    const title = t(`fantasyStats.achievements.${item.id}.title`);
                    const desc = t(`fantasyStats.achievements.${item.id}.desc`);
                    const line = achievementLine(item, t, lang);
                    const share = item.progress ? Math.max(0, Math.min(1, item.progress.value / item.progress.goal)) : 0;
                    return (
                        <View
                            key={item.id}
                            accessible
                            accessibilityLabel={`${title}. ${desc}. ${line}`}
                            style={{ flexBasis: basis, flexGrow: 1, minWidth: 0, gap: 4, borderRadius: 16, padding: 10, backgroundColor: item.done ? alpha(colors.gold, 0.15) : colors.raised }}
                        >
                            <Txt size={24} style={{ opacity: item.done ? 1 : 0.4 }}>
                                {ACHIEVEMENT_ICONS[item.id]}
                            </Txt>
                            <Txt size={12} weight="extrabold" numberOfLines={2}>
                                {title}
                            </Txt>
                            <Txt size={10} tone="muted" numberOfLines={3}>
                                {desc}
                            </Txt>
                            {!item.done && item.progress ? (
                                <View style={{ height: 4, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: alpha(colors.muted, 0.2) }}>
                                    <View style={{ height: '100%', width: `${share * 100}%`, backgroundColor: colors.accent }} />
                                </View>
                            ) : null}
                            <Txt size={10} weight="bold" tone={item.done ? 'ink' : 'muted'} tabular numberOfLines={1}>
                                {line}
                            </Txt>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};
