// Perfil PRO de un fanático (pantalla /fantasy/fan/<id>): su puesto y percentil, su temporada en tiles y en línea
// contra ti y la liga, su equipo de hoy (oculto hasta que empiece cada juego), «Comparar conmigo», sus peloteros y
// capitán más usados y sus días. Lo de otro nunca se ve antes de que empiece su juego: con la ruta PRO lo filtra el
// servidor; sin ella, el equipo de Supabase se puntúa con effectiveEntry y se esconde lo que no ha empezado.
import React, { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Crown, EyeOff, GitCompare, Lock, Share2, Trophy, X } from 'lucide-react-native';
import type { LeagueId } from '../../../types';
import { useSession } from '../../../lib/account';
import { RULES, effectiveEntry, entryKey, gameStarted, isLocked, useFantasyDay, useFantasyStore, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../../lib/fantasy';
import { formatLongDate, formatTime, localeFor, todayKey } from '../../../lib/format';
import { isPermanent } from '../../../lib/pro/http';
import { useFantasyStats } from '../../../lib/pro/liga';
import { useFanDetail, type FanDetail, type FanDetailDay, type FanLineupItem } from '../../../lib/pro/pantallas';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_DIAGONAL, alpha, radius, shadow } from '../../../theme/tokens';
import { EmptyState, ErrorState, IconButton, OfflineState, PlayerPhoto, Skeleton, TeamLogo, Txt, useErrorText } from '../../ui';
import { FanAvatar } from '../../fantasy/FanSearch';
import { isFanId, useFanEntry } from '../../fantasy/fans';
import { useOpenPlayer } from '../../fantasy/shared';
import { useLocalText } from '../../fantasy/texts';
import { shareLink } from '../../share/ShareSheet';
import { CountUp, Enter, GradientCard, GrowBar, LineChart, MOTION_EASE, ModuleHeader, ProNote, ProSegmented, StatTile, teamInk, useInView, useMotion, useProColors, type LineSeries } from '../kit';
import { Num, PartChip, PartChips, fmtPts, fmtSignedPts, ordinal } from '../fantasy/bits';
import { seriesOf, useFanProfilePro, useSeasonTable } from '../fantasy/data';
import { alignSeries, compareLineups, idealTeam, pointParts, rankIn, round1, shortDayName, surname, topPercent, type LineupItem } from '../fantasy/logic';
import { PlayerCard } from '../fantasy/TeamGrid';

/** «Viernes 16 de octubre» (sin la coma del formato largo) */
const longDay = (date: string, lang: string) => {
    const text = formatLongDate(date, lang).replace(/^([^\s,]+),(?= \d)/, '$1');
    return text.charAt(0).toUpperCase() + text.slice(1);
};
/** «Viernes 16» */
const weekdayDay = (date: string, lang: string) => {
    const noon = new Date(`${date}T12:00:00Z`);
    const name = noon.toLocaleDateString(localeFor(lang), { weekday: 'long', timeZone: 'UTC' });
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${noon.getUTCDate()}`;
};
const monthYear = (iso: string, lang: string) => new Date(iso).toLocaleDateString(localeFor(lang), { month: 'short', year: 'numeric' });
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** «67%» al contar */
const pctText = (value: number) => `${Math.round(value)}%`;

const asItem = (item: FanLineupItem): LineupItem => ({ id: item.id, name: item.name, teamId: item.teamId, points: item.points, score: item.score, captain: item.captain });

/** Tarjeta PRO de un bloque del perfil */
const Block: React.FC<{ children: React.ReactNode; gap?: number }> = ({ children, gap = 12 }) => {
    const colors = useColors();
    return <View style={[{ gap, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 }, shadow('card')]}>{children}</View>;
};

interface ProFanProfileProps {
    userId: string;
    league: LeagueId;
    onBack: () => void;
}

export const ProFanProfile: React.FC<ProFanProfileProps> = ({ userId, league, onBack }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const errorText = useErrorText();
    const L = useLocalText();
    const session = useSession();
    const me = session?.user.id ?? null;
    const own = me === userId;
    const valid = isFanId(userId);
    const fan = useFanProfilePro(valid ? userId : null, league);
    const detail = useFanDetail(valid ? userId : null, league);
    const myFan = useFanProfilePro(me, league, !own && !!me);
    const myDetail = useFanDetail(me, league, !own && !!me);
    const season = useSeasonTable(league);
    const todayQuery = useFantasyDay(league);
    const today = todayQuery.data?.date ?? todayKey();
    const profile = fan.data;
    // Sin la ruta del detalle (producción todavía) los bloques que lo necesitan no salen
    const detailMissing = !detail.data && isPermanent(detail.error);

    const rows = useMemo(() => [...(season.data?.ranking ?? [])].sort((a, b) => b.points - a.points), [season.data]);
    const inTop = rows.find((row) => row.userId === userId);
    const alone = useSeasonTable(league, [userId], season.pro && !!season.data && !inTop && rows.length >= 200);
    const place = inTop ?? alone.data?.ranking.find((row) => row.userId === userId);
    const total = season.data?.total ?? rows.length;
    const index = rows.findIndex((row) => row.userId === userId);
    const name = (own ? session?.name : null) || profile?.name || place?.name || null;
    const title = own ? name || t('fantasy.you') : name || L('fans.anonymous');
    const mineRow = me ? rows.find((row) => row.userId === me) : undefined;
    const lastFinal = detail.data?.days.find((day) => day.final && day.started && day.date < today) ?? detail.data?.days.find((day) => day.final && day.started);
    const canCompare = !own && !!me && !!detail.data;

    // «Comparar conmigo» baja hasta su bloque
    const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
    const compareY = useRef(0);
    const goCompare = () => scroller.current?.scrollTo({ y: Math.max(0, compareY.current - 12), animated: true });
    const share = () => shareLink(t('pro.fanaticos.header.shareText', { name: title }), `/fantasy?fan=${userId}`, lang);

    return (
        <ScrollView ref={scroller} style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120, paddingHorizontal: 16, gap: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconButton label={t('pro.fanaticos.header.back')} onPress={onBack} style={{ width: 44, height: 44 }}>
                    <ChevronLeft size={22} color={colors.ink} />
                </IconButton>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={14} weight="semibold" tone="muted" numberOfLines={1}>
                        {L('fans.tab')}
                    </Txt>
                    <Txt size={20} weight="extrabold" numberOfLines={1}>
                        {title}
                    </Txt>
                </View>
            </View>

            {!valid ? (
                <EmptyState title={t('pro.fanaticos.notFound')} />
            ) : (
                <>
                    <Header
                        title={title}
                        name={name}
                        own={own}
                        rank={place?.rank ?? null}
                        total={total}
                        above={index > 0 ? rows[index - 1].points : null}
                        second={index === 0 && rows[1] ? rows[1].points : null}
                        points={place?.points ?? profile?.season.points ?? null}
                        createdAt={profile?.pro?.createdAt ?? null}
                        topCaptain={profile?.pro?.topCaptain?.name ?? null}
                        loading={fan.isPending && !name}
                        onCompare={canCompare ? goCompare : undefined}
                        onShare={share}
                    />

                    {fan.fetchStatus === 'paused' && !profile ? (
                        <OfflineState />
                    ) : fan.isPending ? (
                        <View style={{ gap: 12 }}>
                            <Skeleton height={260} />
                            <Skeleton height={220} />
                        </View>
                    ) : fan.isError && !profile ? (
                        (fan.error as { status?: number } | null)?.status === 404 ? (
                            <EmptyState title={t('pro.fanaticos.notFound')} />
                        ) : (
                            <ErrorState message={errorText(fan.error)} onRetry={() => fan.refetch()} />
                        )
                    ) : profile ? (
                        <>
                            <SeasonBlock
                                league={league}
                                profile={profile}
                                detail={detail.data}
                                own={own}
                                myPoints={!own ? (mineRow?.points ?? myFan.data?.season.points ?? null) : null}
                                daily={season.data?.daily ?? []}
                                lastFinal={lastFinal}
                                today={today}
                                todayDay={todayQuery.data}
                            />
                            <SeasonChart name={title} own={own} series={seriesOf(profile)} mine={!own && myFan.data ? seriesOf(myFan.data) : null} daily={season.data?.daily ?? []} today={today} todayDay={todayQuery.data} />
                            <TodayTeam league={league} userId={userId} own={own} detail={detail.data} detailPending={detail.isPending} detailMissing={detailMissing} todayDay={todayQuery.data} today={today} />
                            {canCompare && (
                                <View
                                    onLayout={(event: LayoutChangeEvent) => {
                                        compareY.current = event.nativeEvent.layout.y;
                                    }}
                                >
                                    <CompareBlock name={title} theirs={detail.data} mine={myDetail.data} pending={myDetail.isPending} missing={!myDetail.data && isPermanent(myDetail.error)} myName={session?.name ?? null} />
                                </View>
                            )}
                            {!detailMissing && <UsageBlock detail={detail.data} pending={detail.isPending} seasonPoints={profile.season.points} days={profile.season.days} />}
                            <DaysBlock league={league} detail={detail.data} pending={detail.isPending && !detailMissing} error={detailMissing ? null : detail.error} onRetry={() => detail.refetch()} today={today} todayDay={todayQuery.data} fallback={detailMissing ? profile.days : null} />
                        </>
                    ) : null}
                </>
            )}
        </ScrollView>
    );
};

// ---------------------------------------------------------------- cabecera

/** Anillo del degradado alrededor del avatar: gira una vez al abrir el perfil (900 ms) */
const Ring: React.FC<{ size: number }> = ({ size }) => {
    const motion = useMotion();
    const turn = useSharedValue(0);
    useEffect(() => {
        if (!motion.animate) return;
        turn.set(withTiming(360, { duration: 900, easing: MOTION_EASE }));
        return () => cancelAnimation(turn);
    }, [motion.animate, turn]);
    const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
    const r = size / 2 - 3;
    return (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, spin]}>
            <Svg width={size} height={size}>
                <Defs>
                    <SvgGradient id="fan-ring" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={PRO_GRADIENT[0]} />
                        <Stop offset="0.5" stopColor={PRO_GRADIENT[1]} />
                        <Stop offset="1" stopColor={PRO_GRADIENT[2]} />
                    </SvgGradient>
                </Defs>
                <Circle cx={size / 2} cy={size / 2} r={r} stroke="url(#fan-ring)" strokeWidth={6} fill="none" />
            </Svg>
        </Animated.View>
    );
};

interface HeaderProps {
    title: string;
    name: string | null;
    own: boolean;
    rank: number | null;
    total: number;
    above: number | null;
    second: number | null;
    points: number | null;
    createdAt: string | null;
    topCaptain: string | null;
    loading: boolean;
    onCompare?: () => void;
    onShare: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, name, own, rank, total, above, second, points, createdAt, topCaptain, loading, onCompare, onShare }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const narrow = useWindowDimensions().width < 360;
    const avatar = narrow ? 64 : 76;
    const ring = avatar + 16;
    const top = topPercent(rank, total);
    const gap =
        rank === 1 && second !== null && points !== null
            ? { value: round1(points - second), label: t('pro.fanaticos.header.overSecond') }
            : above !== null && points !== null
              ? { value: round1(points - above), label: t('pro.fanaticos.header.toAbove') }
              : null;
    return (
        <GradientCard style={shadow('float')} innerStyle={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
                    <Ring size={ring} />
                    <View style={{ borderRadius: avatar, backgroundColor: colors.surface, padding: 3 }}>
                        <FanAvatar name={own ? name || title : name} size={avatar - 6} />
                    </View>
                    {rank !== null && (
                        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[{ position: 'absolute', bottom: -6, alignSelf: 'center', borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 1 }, shadow('card')]}>
                            <Num size={14}>{ordinal(rank, lang)}</Num>
                        </View>
                    )}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    {loading ? (
                        <Skeleton height={28} width={144} round={14} />
                    ) : (
                        <Txt size={narrow ? 21 : 24} weight="black" accessibilityRole="header" style={{ lineHeight: narrow ? 24 : 27, letterSpacing: -0.5 }}>
                            {title}
                        </Txt>
                    )}
                    {createdAt && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <CalendarDays size={14} color={colors.muted} />
                            <Txt size={12} tone="muted" style={{ flexShrink: 1 }}>
                                {t('pro.fanaticos.header.since', { date: monthYear(createdAt, lang) })}
                            </Txt>
                        </View>
                    )}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {rank === 1 && (
                            <View style={{ height: 24, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 8 }}>
                                <Trophy size={14} color={colors.ink} />
                                <Txt size={11} weight="bold">
                                    {t('pro.fanaticos.header.leader')}
                                </Txt>
                            </View>
                        )}
                        {topCaptain && (
                            <View style={{ minHeight: 24, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, backgroundColor: alpha(colors.gold, 0.16), paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Crown size={14} color={colors.gold} />
                                <Txt size={11} weight="bold" color={colors.gold} style={{ flexShrink: 1 }}>
                                    {t('pro.fanaticos.header.captain', { name: surname(topCaptain) })}
                                </Txt>
                            </View>
                        )}
                    </View>
                </View>
            </View>
            {rank !== null && (
                <View style={{ flexDirection: 'row', borderRadius: radius.tile, backgroundColor: colors.raised, paddingVertical: 10 }}>
                    <View accessible accessibilityLabel={`${t('pro.fanaticos.header.rank')}: ${ordinal(rank, lang)} ${t('pro.fanaticos.header.ofFans', { count: total })}`} style={{ flex: 1, minWidth: 0, paddingHorizontal: 10 }}>
                        <Num size={26}>{ordinal(rank, lang)}</Num>
                        <Txt size={11} tone="muted" style={{ lineHeight: 14 }}>
                            {t('pro.fanaticos.header.ofFans', { count: total })}
                        </Txt>
                    </View>
                    <View
                        accessible
                        accessibilityLabel={`${t('pro.fanaticos.header.percentile')}: ${t('pro.fanaticos.header.top')} ${top !== null ? `${top}%` : '—'}`}
                        style={{ flex: 1, minWidth: 0, paddingHorizontal: 10, borderLeftWidth: 1, borderRightWidth: 1, borderColor: alpha(colors.line, 0.1) }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                            <Txt size={12} weight="extrabold" color={pro.up}>
                                {t('pro.fanaticos.header.top')}
                            </Txt>
                            <Num size={26} color={pro.up}>
                                {top !== null ? `${top}%` : '—'}
                            </Num>
                        </View>
                        <Txt size={11} tone="muted" style={{ lineHeight: 14 }}>
                            {t('pro.fanaticos.header.percentile')}
                        </Txt>
                    </View>
                    <View accessible accessibilityLabel={gap ? `${fmtSignedPts(gap.value)} ${gap.label}` : t('pro.fanaticos.header.alone')} style={{ flex: 1, minWidth: 0, paddingHorizontal: 10 }}>
                        <Num size={26}>{gap ? fmtSignedPts(gap.value) : '—'}</Num>
                        <Txt size={11} tone="muted" style={{ lineHeight: 14 }}>
                            {gap?.label ?? t('pro.fanaticos.header.alone')}
                        </Txt>
                    </View>
                </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
                {onCompare && (
                    <Pressable
                        onPress={onCompare}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ flex: 1, minWidth: 0, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, backgroundColor: colors.ink, paddingHorizontal: 16, opacity: pressed ? 0.85 : 1 })}
                    >
                        <GitCompare size={16} color={colors.bg} />
                        <Txt size={14} weight="extrabold" color={colors.bg} numberOfLines={1} style={{ flexShrink: 1 }}>
                            {t('pro.fanaticos.compare.button')}
                        </Txt>
                    </Pressable>
                )}
                <Pressable
                    onPress={onShare}
                    accessibilityRole="button"
                    accessibilityLabel={t('pro.fanaticos.header.share')}
                    style={({ pressed }) => [
                        { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 },
                        onCompare ? { width: 48 } : { flex: 1, paddingHorizontal: 16 }
                    ]}
                >
                    <Share2 size={16} color={colors.ink} />
                    {!onCompare && (
                        <Txt size={14} weight="bold">
                            {t('pro.fanaticos.header.share')}
                        </Txt>
                    )}
                </Pressable>
            </View>
        </GradientCard>
    );
};

// ---------------------------------------------------------------- su temporada en tiles

type Profile = NonNullable<ReturnType<typeof useFanProfilePro>['data']>;

interface SeasonBlockProps {
    league: LeagueId;
    profile: Profile;
    detail?: FanDetail;
    own: boolean;
    myPoints: number | null;
    daily: { date: string; average: number }[];
    lastFinal?: FanDetailDay;
    today: string;
    todayDay?: FantasyDay;
}

const SeasonBlock: React.FC<SeasonBlockProps> = ({ league, profile, detail, own, myPoints, daily, lastFinal, today, todayDay }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const L = useLocalText();
    const narrow = useWindowDimensions().width < 360;
    const proData = profile.pro;
    const days = profile.season.days;
    const points = profile.season.points;
    const dates = new Set(seriesOf(profile).map((item) => item.date));
    const avgSum = daily.filter((item) => dates.has(item.date)).reduce((sum, item) => sum + item.average, 0);
    const lastDay = useFantasyDay(league, lastFinal?.date);
    const stats = useFantasyStats(league, lastFinal?.date, !!lastFinal);
    const ideal = useMemo(() => (lastDay.data && lastFinal && lastDay.data.date === lastFinal.date ? idealTeam(lastDay.data) : null), [lastDay.data, lastFinal]);
    const best = lastFinal?.lineup.length ? [...lastFinal.lineup].sort((a, b) => b.points - a.points)[0] : null;
    const dayRank = lastFinal && stats.data?.scores.length ? rankIn(stats.data.scores, lastFinal.total) : null;
    const pendingToday = !!todayDay && todayDay.date === today && todayDay.games.some((game) => game.state !== 'final');
    const teams = detail?.teams ?? {};
    const lastName = lastFinal ? shortDayName(lastFinal.date, lang) : '';
    const delta = (value: number) => (
        <Num size={20} color={value >= 0 ? pro.up : pro.down}>
            {fmtSignedPts(value)}
        </Num>
    );

    return (
        <Block>
            <ModuleHeader title={own ? t('pro.fanaticos.season.titleOwn') : t('pro.fanaticos.season.title')} aside={L('fans.days', { count: days })} />
            <LinearGradient colors={[alpha(PRO_GRADIENT[0], 0.16), alpha(PRO_GRADIENT[2], 0.14)]} {...PRO_GRADIENT_DIAGONAL} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, borderRadius: radius.tile, padding: 14 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }} accessible accessibilityLabel={`${t('pro.fanaticos.season.points')}: ${fmtPts(points)} ${t('pro.fantasy.pts')}`}>
                    <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                        {t('pro.fanaticos.season.points')}
                    </Txt>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                        <Num size={narrow ? 46 : 56}>
                            <CountUp value={points} format={(value) => fmtPts(value)} />
                        </Num>
                        <Txt size={14} weight="bold" tone="muted">
                            {t('pro.fantasy.pts')}
                        </Txt>
                    </View>
                    {pendingToday && (
                        <Txt size={12} tone="muted">
                            {t('pro.fanaticos.season.todayPending')}
                        </Txt>
                    )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    {myPoints !== null && (
                        <View accessible accessibilityLabel={`${t('pro.fanaticos.season.vsYou')}: ${fmtSignedPts(points - myPoints)}`} style={{ alignItems: 'flex-end' }}>
                            <Txt size={10} weight="bold" tone="muted">
                                {t('pro.fanaticos.season.vsYou')}
                            </Txt>
                            {delta(points - myPoints)}
                        </View>
                    )}
                    {daily.length > 0 && (
                        <View accessible accessibilityLabel={`${t('pro.fanaticos.season.vsLeague')}: ${fmtSignedPts(points - avgSum)}`} style={{ alignItems: 'flex-end' }}>
                            <Txt size={10} weight="bold" tone="muted">
                                {t('pro.fanaticos.season.vsLeague')}
                            </Txt>
                            {delta(points - avgSum)}
                        </View>
                    )}
                </View>
            </LinearGradient>
            {proData || lastFinal ? (
                <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {proData ? (
                            <StatTile
                                {...(proData.picks.pct !== null ? { countTo: proData.picks.pct, format: pctText } : { value: '—' })}
                                label={t('pro.fantasy.season.picks')}
                                sub={
                                    <View style={{ gap: 4 }}>
                                        <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                                            {proData.picks.made ? t('pro.fantasy.season.picksSub', { won: proData.picks.won, count: proData.picks.made }) : t('pro.fantasy.season.picksNone')}
                                        </Txt>
                                        {lastFinal && lastFinal.pickList.length > 0 && (
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                                {lastFinal.pickList.map((item) => (
                                                    <PartChip
                                                        key={item.gamePk}
                                                        text={teams[item.teamId]?.abbrev ?? String(item.teamId)}
                                                        tone={item.result === 'win' ? 'up' : item.result === 'loss' ? 'down' : 'neutral'}
                                                        strike={item.result === 'loss'}
                                                        surface={colors.bg}
                                                    />
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                }
                                style={{ flex: 1, flexBasis: 0 }}
                            />
                        ) : null}
                        {proData ? (
                            <StatTile
                                {...(proData.captain.pct !== null ? { countTo: proData.captain.pct, format: pctText } : { value: '—' })}
                                tone={proData.captain.pct !== null && proData.captain.pct < 50 ? 'down' : 'default'}
                                label={t('pro.fanaticos.season.captain')}
                                sub={
                                    proData.captain.days
                                        ? t('pro.fanaticos.season.captainSub', { best: proData.captain.best, count: proData.captain.days, name: best ? surname(best.name) : '—', pts: best ? fmtPts(best.points) : '' })
                                        : t('pro.fantasy.season.captainNone')
                                }
                                style={{ flex: 1, flexBasis: 0 }}
                            />
                        ) : null}
                    </View>
                    {lastFinal ? (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <StatTile
                                {...(ideal && ideal.total > 0 ? { countTo: (lastFinal.team / ideal.total) * 100, format: pctText } : { value: '—' })}
                                label={t('pro.fanaticos.season.ideal')}
                                sub={ideal ? t('pro.fanaticos.season.idealSub', { team: fmtPts(lastFinal.team), ideal: fmtPts(ideal.total), day: lastName }) : t('pro.fanaticos.season.idealNone')}
                                style={{ flex: 1, flexBasis: 0 }}
                            />
                            <StatTile
                                value={dayRank !== null ? ordinal(dayRank, lang) : '—'}
                                label={t('pro.fanaticos.season.dayRank')}
                                sub={dayRank !== null ? t('pro.fanaticos.season.dayRankSub', { day: weekdayDay(lastFinal.date, lang), count: stats.data?.scores.length ?? 0 }) : t('pro.fanaticos.season.dayRankNone')}
                                style={{ flex: 1, flexBasis: 0 }}
                            />
                        </View>
                    ) : null}
                </View>
            ) : null}
            {days <= 1 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <Txt size={11} weight="extrabold" style={{ width: 96, textTransform: 'uppercase', letterSpacing: 0.8, lineHeight: 14 }}>
                        {t('pro.fanaticos.season.avgBest')}
                    </Txt>
                    <Txt size={12} tone="muted" style={{ flex: 1, lineHeight: 17 }}>
                        {t('pro.fanaticos.season.avgBestOne')}
                    </Txt>
                </View>
            ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <StatTile
                        {...(proData?.average !== null && proData?.average !== undefined ? { countTo: proData.average, format: (value: number) => fmtPts(value) } : { countTo: days ? points / days : 0, format: (value: number) => fmtPts(value) })}
                        unit={t('pro.fantasy.pts')}
                        label={t('pro.fanaticos.season.average')}
                        style={{ flex: 1, flexBasis: 0 }}
                    />
                    <StatTile
                        countTo={profile.season.best?.points ?? 0}
                        format={(value) => fmtPts(value)}
                        unit={t('pro.fantasy.pts')}
                        label={t('pro.fantasy.season.bestDay')}
                        sub={profile.season.best ? shortDayName(profile.season.best.date, lang) : undefined}
                        style={{ flex: 1, flexBasis: 0 }}
                    />
                </View>
            )}
        </Block>
    );
};

// ---------------------------------------------------------------- la temporada día a día

interface SeasonChartProps {
    name: string;
    own: boolean;
    series: { date: string; total: number }[];
    mine: { date: string; total: number }[] | null;
    daily: { date: string; average: number }[];
    today: string;
    todayDay?: FantasyDay;
}

const SeasonChart: React.FC<SeasonChartProps> = ({ name, own, series, mine, daily, today, todayDay }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const [mode, setMode] = useState<'cumulative' | 'daily'>('cumulative');
    const [hidden, setHidden] = useState<string[]>([]);
    const sources: Record<string, { date: string; total: number }[]> = { fan: series };
    if (daily.length) sources.league = daily.map((item) => ({ date: item.date, total: item.average }));
    if (mine) sources.me = mine;
    const aligned = alignSeries(sources, mode);
    const cumulative = mode === 'cumulative';
    // Con «Acumulado» todas salen de 0 en «Inicio»
    const offset = cumulative ? 1 : 0;
    const pendingToday = !!todayDay && todayDay.date === today && !aligned.dates.includes(today) && todayDay.games.length > 0;
    const lastX = aligned.dates.length - 1 + offset;
    const todayX = pendingToday ? lastX + 1 : null;
    const first = todayDay?.games
        .filter((game) => game.state === 'preview')
        .map((game) => game.date)
        .sort()[0];
    const meta = [
        { id: 'fan', name: own ? t('pro.fantasy.season.you') : name, color: pro.fantasy, width: 3, dashed: false },
        ...(mine ? [{ id: 'me', name: t('pro.fantasy.season.you'), color: colors.accent, width: 2, dashed: false }] : []),
        ...(daily.length ? [{ id: 'league', name: t('pro.fanaticos.chart.league'), color: colors.muted, width: 2, dashed: true }] : [])
    ];
    const lines: LineSeries[] = meta
        .filter((item) => !hidden.includes(item.id))
        .map((item) => ({
            id: item.id,
            name: item.name,
            color: item.color,
            width: item.width,
            dashed: item.dashed,
            endDot: !item.dashed,
            endLabel: !item.dashed && aligned.values[item.id] ? (() => {
                const value = [...aligned.values[item.id]].reverse().find((y) => y !== null);
                return value !== undefined && value !== null ? fmtPts(value) : undefined;
            })() : undefined,
            points: [...(cumulative ? [{ x: 0, y: 0 }] : []), ...aligned.dates.map((_, i) => ({ x: i + offset, y: aligned.values[item.id][i] }))]
        }));
    const ticks = [
        ...(cumulative ? [{ value: 0, label: t('pro.fanaticos.chart.start') }] : []),
        ...aligned.dates.map((date, i) => ({ value: i + offset, label: date === today ? t('games.today') : capital(shortDayName(date, lang)) })),
        ...(todayX !== null ? [{ value: todayX, label: t('games.today'), strong: true }] : [])
    ].filter((_, i, list) => list.length <= 6 || i === 0 || i === list.length - 1 || i % Math.ceil(list.length / 5) === 0);
    const summary = lines.map((line) => `${line.name}: ${line.points.filter((point) => point.y !== null).map((point) => fmtPts(point.y)).join(', ')}`).join('. ');
    const toggle = (id: string) =>
        setHidden((current) => {
            if (current.includes(id)) return current.filter((item) => item !== id);
            // Siempre queda por lo menos una línea
            return meta.length - current.length > 1 ? [...current, id] : current;
        });

    if (!aligned.dates.length) return null;
    return (
        <Block>
            <ModuleHeader title={t('pro.fanaticos.chart.title')} />
            <ProSegmented<'cumulative' | 'daily'>
                value={mode}
                onChange={setMode}
                label={t('pro.fanaticos.chart.mode')}
                options={[
                    { value: 'cumulative', label: t('pro.fanaticos.chart.cumulative') },
                    { value: 'daily', label: t('pro.fanaticos.chart.daily') }
                ]}
            />
            <View accessibilityLabel={t('pro.fanaticos.chart.legend')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {meta.map((item) => {
                    const off = hidden.includes(item.id);
                    return (
                        <Pressable
                            key={item.id}
                            onPress={() => toggle(item.id)}
                            accessibilityRole="switch"
                            accessibilityState={{ checked: !off }}
                            accessibilityLabel={item.name}
                            style={[
                                { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 12 },
                                off ? { borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.25) } : { backgroundColor: colors.raised }
                            ]}
                        >
                            {item.dashed ? <View style={{ width: 16, borderTopWidth: 2, borderStyle: 'dashed', borderColor: item.color }} /> : <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: item.color }} />}
                            <Txt size={12} weight="bold" color={off ? colors.muted : colors.ink} numberOfLines={1} style={{ maxWidth: 120 }}>
                                {item.name}
                            </Txt>
                        </Pressable>
                    );
                })}
            </View>
            <LineChart
                series={lines}
                label={t('pro.fanaticos.chart.label', { list: summary })}
                height={190}
                xDomain={[0, Math.max(1, todayX !== null ? todayX + 0.5 : lastX)]}
                xTicks={ticks}
                formatY={(value) => fmtPts(value)}
                xBand={todayX !== null ? { from: todayX - 0.45, to: todayX + 0.45, label: t('pro.fanaticos.chart.pending') } : undefined}
            />
            <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                {t('pro.fanaticos.chart.note', { count: aligned.dates.length })}
                {todayX !== null && first ? ` ${t('pro.fanaticos.chart.today', { time: formatTime(first, lang) })}` : ''}
            </Txt>
        </Block>
    );
};

// ---------------------------------------------------------------- su equipo de hoy

interface TodayTeamProps {
    league: LeagueId;
    userId: string;
    own: boolean;
    detail?: FanDetail;
    detailPending: boolean;
    /** Sin la ruta del detalle: el equipo sale de Supabase (con effectiveEntry) y se esconde lo que no ha empezado */
    detailMissing: boolean;
    todayDay?: FantasyDay;
    today: string;
}

const TodayTeam: React.FC<TodayTeamProps> = ({ league, userId, own, detail, detailPending, detailMissing, todayDay, today }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const L = useLocalText();
    const store = useFantasyStore();
    const openPlayer = useOpenPlayer();
    const isToday = !!todayDay && todayDay.date === today;
    const remote = useFanEntry(userId, league, today, isToday && !own && detailMissing);
    if (!todayDay || !isToday) return null;
    const day = detail?.days.find((item) => item.date === today);
    const ownEntry: DayEntry | undefined = own ? store[entryKey(league, today)] : undefined;
    // Sin el detalle del servidor: lo de Supabase como contaba al empezar cada juego, solo lo que ya empezó
    const fallback = !own && detailMissing && remote.data ? effectiveEntry(todayDay, remote.data) : null;
    const fallbackPlayers = fallback ? fallback.lineup.map((id) => todayDay.players.find((player) => player.id === id)).filter((player): player is FantasyPlayer => !!player) : [];
    const visibleIds = own ? (ownEntry?.lineup ?? []) : fallback ? fallbackPlayers.filter((player) => isLocked(todayDay, player)).map((player) => player.id) : (day?.lineup.map((item) => item.id) ?? []);
    const players = visibleIds.map((id) => todayDay.players.find((player) => player.id === id)).filter((player): player is FantasyPlayer => !!player);
    const fallbackCaptain = fallback && fallback.captain !== null && players.some((player) => player.id === fallback.captain) ? fallback.captain : null;
    const captain = own ? (ownEntry?.captain ?? null) : fallback ? fallbackCaptain : (day?.lineup.find((item) => item.captain)?.id ?? null);
    const entry: DayEntry = { lineup: players.map((player) => player.id), captain, picks: {}, savedAt: 0 };
    const hidden = own ? 0 : fallback ? fallbackPlayers.length - players.length : (day?.hidden ?? 0);
    const captainHidden = fallback ? fallback.captain !== null && fallbackCaptain === null : !!day?.captainHidden;
    const picksHidden = fallback ? Object.keys(fallback.picks).filter((pk) => todayDay.games.some((game) => String(game.gamePk) === pk && !gameStarted(game))).length : (day?.picksHidden ?? 0);
    const count = players.length + hidden;
    const first = todayDay.games
        .filter((game) => game.state === 'preview')
        .map((game) => game.date)
        .sort()[0];
    // Cupos escondidos: lo que falta de 5 bateadores y 1 lanzador (solo si el equipo está completo)
    const shownB = players.filter((player) => player.role === 'B').length;
    const hiddenRoles: ('B' | 'P' | null)[] =
        count === RULES.batters + RULES.pitchers ? [...Array<'B'>(Math.max(0, RULES.batters - shownB)).fill('B'), ...Array<'P'>(Math.max(0, hidden - (RULES.batters - shownB))).fill('P')] : Array<null>(hidden).fill(null);
    const pending = own ? false : detailMissing ? remote.isPending : detailPending;
    const pairs = Array.from({ length: Math.ceil(players.length / 2) }, (_, row) => players.slice(row * 2, row * 2 + 2));

    return (
        <Block>
            <ModuleHeader title={own ? L('fans.yourTeamToday') : L('fans.teamToday')} aside={capital(shortDayName(today, lang))} />
            {pending ? (
                <Skeleton height={160} round={radius.tile} />
            ) : !count ? (
                <Txt size={14} tone="muted">
                    {own ? L('fans.noTeamTodayOwn') : L('fans.noTeamToday')}
                </Txt>
            ) : (
                <>
                    {hidden > 0 && (
                        <View style={{ gap: 12, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 14 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                                <View style={{ width: 44, height: 44, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
                                    <EyeOff size={20} color={colors.muted} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                                    <Txt size={15} weight="extrabold" style={{ lineHeight: 19 }}>
                                        {t('pro.fanaticos.today.hiddenTitle')}
                                    </Txt>
                                    <Txt size={13} tone="muted" style={{ lineHeight: 18 }}>
                                        {t('pro.fanaticos.today.hiddenText')}
                                    </Txt>
                                </View>
                            </View>
                            <View accessible accessibilityLabel={t('pro.fanaticos.today.slots', { count: hidden })} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {hiddenRoles.map((role, slot) => (
                                    <View key={slot} style={{ alignItems: 'center', gap: 4 }}>
                                        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: alpha(colors.line, 0.15), backgroundColor: alpha(colors.line, 0.05) }}>
                                            <Lock size={16} color={colors.muted} />
                                        </View>
                                        {role ? (
                                            <Txt size={10} weight="extrabold" tone="muted">
                                                {role === 'P' ? t('pro.fanaticos.today.pit') : t('pro.fanaticos.today.bat')}
                                            </Txt>
                                        ) : null}
                                    </View>
                                ))}
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <Txt size={12} weight="bold">
                                    {t('pro.fanaticos.today.visible', { shown: players.length, count })}
                                </Txt>
                                {first ? (
                                    <Txt size={12} tone="muted">
                                        {t('pro.fanaticos.today.first', { time: formatTime(first, lang) })}
                                    </Txt>
                                ) : null}
                            </View>
                            {(captainHidden || picksHidden > 0) && (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    {captainHidden && (
                                        <View style={{ height: 24, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: alpha(colors.gold, 0.16), paddingHorizontal: 8 }}>
                                            <Crown size={14} color={colors.gold} />
                                            <Txt size={11} weight="bold" color={colors.gold}>
                                                {t('pro.fanaticos.today.captainHidden')}
                                            </Txt>
                                        </View>
                                    )}
                                    {picksHidden > 0 && (
                                        <View style={{ height: 24, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 8 }}>
                                            <Trophy size={14} color={colors.muted} />
                                            <Txt size={11} weight="bold" tone="muted">
                                                {t('pro.fanaticos.today.picksHidden')}
                                            </Txt>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    )}
                    {pairs.map((pair, row) => (
                        <View key={row} style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
                            {pair.map((player, column) => (
                                <Enter key={player.id} index={row * 2 + column} style={{ flex: 1, flexBasis: 0 }}>
                                    <PlayerCard day={todayDay} entry={entry} player={player} projected={null} now={Date.now()} onChange={() => undefined} onInfo={(item) => openPlayer(item.id)} readOnly={!own} />
                                </Enter>
                            ))}
                            {pair.length === 1 && <View style={{ flex: 1, flexBasis: 0 }} />}
                        </View>
                    ))}
                    {hidden > 0 && (
                        <View style={{ gap: 8 }}>
                            <Txt size={13} tone="muted">
                                {t('pro.fanaticos.today.games')}
                            </Txt>
                            {todayDay.games.map((game, gameIndex) => (
                                <View key={game.gamePk} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: gameIndex ? 1 : 0, borderTopColor: alpha(colors.line, 0.1) }}>
                                    <View style={{ height: 32, width: 84, flexDirection: 'row', overflow: 'hidden', borderRadius: 8 }}>
                                        {[game.away, game.home].map((side) => (
                                            <View key={side.id} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: side.color }}>
                                                <Txt size={11} weight="extrabold" color={teamInk(side.color)}>
                                                    {side.abbrev}
                                                </Txt>
                                            </View>
                                        ))}
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Txt size={14} weight="bold" numberOfLines={1}>
                                            {t('pro.fanaticos.today.match', { away: game.away.abbrev, home: game.home.abbrev })}
                                        </Txt>
                                        <Txt size={12} tone="muted" numberOfLines={1}>
                                            {game.venue}
                                        </Txt>
                                    </View>
                                    <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                                        <Txt size={14} weight="bold">
                                            {formatTime(game.date, lang)}
                                        </Txt>
                                        <Txt size={11} weight="semibold" tone="muted">
                                            {game.state === 'preview' ? t('pro.fanaticos.today.toStart') : game.state === 'live' ? t('fantasy.liveNow') : t('fantasy.final')}
                                        </Txt>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </>
            )}
        </Block>
    );
};

// ---------------------------------------------------------------- comparar conmigo

const DiffChip: React.FC<{ diff: number }> = ({ diff }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    if (diff === 0) {
        return (
            <View accessible accessibilityLabel={t('pro.fanaticos.compare.tie')} style={{ height: 32, minWidth: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 8 }}>
                <Txt size={14} weight="extrabold" tone="muted">
                    =
                </Txt>
            </View>
        );
    }
    const left = diff > 0;
    const color = left ? pro.fantasy : colors.accentInk;
    return (
        <View
            accessible
            accessibilityLabel={left ? t('pro.fanaticos.compare.theyWin', { pts: fmtPts(Math.abs(diff)) }) : t('pro.fanaticos.compare.youWin', { pts: fmtPts(Math.abs(diff)) })}
            style={{ height: 32, minWidth: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: left ? alpha(pro.fantasy, 0.16) : alpha(colors.accent, 0.16) }}
        >
            {left ? <ChevronLeft size={14} color={color} /> : null}
            <Num size={16} color={color}>
                {fmtPts(Math.abs(diff))}
            </Num>
            {!left ? <ChevronRight size={14} color={color} /> : null}
        </View>
    );
};

const Side: React.FC<{ item: LineupItem | null; team?: { id: number; logo: string; color: string }; align: 'left' | 'right' }> = ({ item, team, align }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    if (!item) return <View style={{ flex: 1, flexBasis: 0 }} />;
    const right = align === 'right';
    return (
        <View
            accessible
            accessibilityLabel={`${item.name}${item.captain ? `, ${t('fantasy.captain')}` : ''}: ${fmtPts(item.score)} ${t('pro.fantasy.pts')}`}
            style={{ flex: 1, flexBasis: 0, minWidth: 0, flexDirection: right ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}
        >
            <View>
                <PlayerPhoto personId={item.id} name={item.name} size={40} team={team ?? null} />
                {item.captain && (
                    <View style={[{ position: 'absolute', top: -6 }, right ? { right: -4 } : { left: -4 }]}>
                        <Crown size={14} color={colors.gold} />
                    </View>
                )}
            </View>
            <View style={{ flex: 1, minWidth: 0, alignItems: right ? 'flex-end' : 'flex-start' }}>
                <Txt size={13} weight="bold" numberOfLines={1}>
                    {surname(item.name)}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Num size={18} color={item.score < 0 ? pro.down : undefined}>
                        {fmtPts(item.score)}
                    </Num>
                    {item.captain && (
                        <Txt size={10} weight="extrabold" color={colors.gold}>
                            ×{RULES.captain}
                        </Txt>
                    )}
                </View>
            </View>
        </View>
    );
};

interface CompareBlockProps {
    name: string;
    myName: string | null;
    theirs?: FanDetail;
    mine?: FanDetail;
    pending: boolean;
    /** Tu detalle no está (sin la ruta): no se puede comparar */
    missing: boolean;
}

const CompareBlock: React.FC<CompareBlockProps> = ({ name, myName, theirs, mine, pending, missing }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const { setNode, onLayout, seen } = useInView();
    const mineDays = new Map((mine?.days ?? []).filter((day) => day.started).map((day) => [day.date, day]));
    const theirDay = (theirs?.days ?? []).find((day) => day.started && mineDays.has(day.date));
    const myDay = theirDay ? mineDays.get(theirDay.date) : undefined;
    const teams = { ...(mine?.teams ?? {}), ...(theirs?.teams ?? {}) };
    const header = <ModuleHeader title={t('pro.fanaticos.compare.title')} aside={theirDay ? capital(shortDayName(theirDay.date, lang)) : undefined} />;
    if (missing) return null;
    if (pending) {
        return (
            <Block>
                {header}
                <Skeleton height={200} round={radius.tile} />
            </Block>
        );
    }
    if (!theirDay || !myDay) {
        return (
            <Block>
                {header}
                <ProNote tone="pending">{t('pro.fanaticos.compare.none')}</ProNote>
            </Block>
        );
    }
    const { common, pairs } = compareLineups(theirDay.lineup.map(asItem), myDay.lineup.map(asItem));
    const diff = round1(theirDay.total - myDay.total);
    const share = theirDay.total + myDay.total > 0 ? Math.max(0.04, Math.min(0.96, Math.max(0, theirDay.total) / (Math.max(0, theirDay.total) + Math.max(0, myDay.total) || 1))) : 0.5;
    const picksTheirs = { pts: theirDay.picks, won: theirDay.pickList.filter((item) => item.result === 'win').length, made: theirDay.pickList.filter((item) => item.result !== 'pending').length };
    const picksMine = { pts: myDay.picks, won: myDay.pickList.filter((item) => item.result === 'win').length, made: myDay.pickList.filter((item) => item.result !== 'pending').length };
    // Dónde se sacaron la diferencia: las tres filas que más pesan a favor del que va arriba
    const reasons = [...common, ...pairs]
        .filter((row) => (diff >= 0 ? row.diff > 0 : row.diff < 0))
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
        .slice(0, 3)
        .map((row) => {
            const pts = fmtSignedPts(Math.abs(row.diff));
            if (row.kind === 'common') return t('pro.fanaticos.compare.reasonCaptain', { name: surname((diff >= 0 ? row.left : row.right).name), pts });
            const winner = diff >= 0 ? row.left : row.right;
            const loser = diff >= 0 ? row.right : row.left;
            return loser
                ? t(diff >= 0 ? 'pro.fanaticos.compare.reasonPairTheirs' : 'pro.fanaticos.compare.reasonPairMine', { name: surname(winner!.name), other: surname(loser.name), pts })
                : t('pro.fanaticos.compare.reasonAlone', { name: surname(winner!.name), pts });
        });
    const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} ${t('pro.fantasy.and')} ${items[items.length - 1]}` : (items[0] ?? ''));
    const picksText =
        picksTheirs.pts === picksMine.pts ? t('pro.fanaticos.compare.picksTie') : t(picksTheirs.pts > picksMine.pts ? 'pro.fanaticos.compare.picksTheirs' : 'pro.fanaticos.compare.picksMine', { pts: fmtPts(Math.abs(picksTheirs.pts - picksMine.pts)) });
    let order = 0;
    const label = (text: string) => (
        <Txt size={10} weight="extrabold" tone="muted" center style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            {text}
        </Txt>
    );

    return (
        <Block>
            {header}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }} accessible accessibilityLabel={`${name}: ${fmtPts(theirDay.total)} ${t('pro.fantasy.pts')}`}>
                    <FanAvatar name={name} size={32} />
                    <Txt size={12} weight="bold" numberOfLines={1}>
                        {name}
                    </Txt>
                    <Num size={34}>{fmtPts(theirDay.total)}</Num>
                </View>
                <View style={{ alignItems: 'center', paddingBottom: 6 }} accessible accessibilityLabel={`${fmtSignedPts(Math.abs(diff))} ${diff === 0 ? t('pro.fanaticos.compare.tie') : diff > 0 ? t('pro.fanaticos.compare.theirFavor') : t('pro.fanaticos.compare.yourFavor')}`}>
                    <Num size={24} color={diff >= 0 ? pro.fantasy : colors.accentInk}>
                        {fmtSignedPts(Math.abs(diff))}
                    </Num>
                    <Txt size={11} tone="muted">
                        {diff === 0 ? t('pro.fanaticos.compare.tie') : diff > 0 ? t('pro.fanaticos.compare.theirFavor') : t('pro.fanaticos.compare.yourFavor')}
                    </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-end' }} accessible accessibilityLabel={`${myName || t('fantasy.you')}: ${fmtPts(myDay.total)} ${t('pro.fantasy.pts')}`}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
                        <Txt size={11} weight="extrabold" tone="white">
                            {t('fantasy.you')}
                        </Txt>
                    </View>
                    <Txt size={12} weight="bold" numberOfLines={1}>
                        {myName || t('fantasy.you')}
                    </Txt>
                    <Num size={34}>{fmtPts(myDay.total)}</Num>
                </View>
            </View>
            <View ref={setNode} onLayout={onLayout} style={{ height: 10, flexDirection: 'row', gap: 3 }}>
                <View style={{ width: `${share * 100}%`, overflow: 'hidden', borderRadius: 5 }}>
                    <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_DIAGONAL} style={{ flex: 1 }} />
                </View>
                <View style={{ flex: 1 }}>
                    <GrowBar value={1} color={colors.accent} origin="right" track={false} height={10} seen={seen} />
                </View>
            </View>
            <View style={{ flexDirection: 'row' }}>
                <Txt size={10} weight="extrabold" tone="muted" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {t('pro.fanaticos.compare.theirs')}
                </Txt>
                <Txt size={10} weight="extrabold" tone="muted" center style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                    {t('pro.fanaticos.compare.diff')}
                </Txt>
                <Txt size={10} weight="extrabold" tone="muted" style={{ flex: 1, textAlign: 'right', textTransform: 'uppercase', letterSpacing: 1 }}>
                    {t('pro.fanaticos.compare.yours')}
                </Txt>
            </View>
            {common.length > 0 && label(t('pro.fanaticos.compare.common', { count: common.length }))}
            {common.map((item) => (
                <Enter key={`c${item.left?.id}`} index={order++} step={60} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), paddingVertical: 8 }}>
                    <Side item={item.left} team={item.left ? teams[item.left.teamId] : undefined} align="left" />
                    <DiffChip diff={item.diff} />
                    <Side item={item.right} team={item.right ? teams[item.right.teamId] : undefined} align="right" />
                </Enter>
            ))}
            {pairs.length > 0 && label(t('pro.fanaticos.compare.pairs'))}
            {pairs.map((item, pairIndex) => (
                <Enter key={`p${pairIndex}`} index={order++} step={60} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), paddingVertical: 8 }}>
                    <Side item={item.left} team={item.left ? teams[item.left.teamId] : undefined} align="left" />
                    <DiffChip diff={item.diff} />
                    <Side item={item.right} team={item.right ? teams[item.right.teamId] : undefined} align="right" />
                </Enter>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), paddingVertical: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityLabel={`${t('fantasy.picks')}: ${fmtSignedPts(picksTheirs.pts)}, ${t('pro.fanaticos.compare.picksOf', { won: picksTheirs.won, count: picksTheirs.made })}`}>
                    <Txt size={13} weight="bold">
                        {t('fantasy.picks')}
                    </Txt>
                    <Txt size={12} tone="muted">
                        <Txt condensed size={16}>
                            {fmtSignedPts(picksTheirs.pts)}
                        </Txt>
                        {` ${t('pro.fanaticos.compare.picksOf', { won: picksTheirs.won, count: picksTheirs.made })}`}
                    </Txt>
                </View>
                <DiffChip diff={round1(picksTheirs.pts - picksMine.pts)} />
                <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }} accessible accessibilityLabel={`${t('fantasy.picks')}: ${fmtSignedPts(picksMine.pts)}, ${t('pro.fanaticos.compare.picksOf', { won: picksMine.won, count: picksMine.made })}`}>
                    <Txt size={13} weight="bold">
                        {t('fantasy.picks')}
                    </Txt>
                    <Txt size={12} tone="muted">
                        <Txt condensed size={16}>
                            {fmtSignedPts(picksMine.pts)}
                        </Txt>
                        {` ${t('pro.fanaticos.compare.picksOf', { won: picksMine.won, count: picksMine.made })}`}
                    </Txt>
                </View>
            </View>
            {diff !== 0 && reasons.length > 0 && (
                <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <Txt size={13} style={{ lineHeight: 18 }}>
                        <Txt size={13} weight="bold">
                            {t(diff > 0 ? 'pro.fanaticos.compare.summaryTheirs' : 'pro.fanaticos.compare.summaryMine', { pts: fmtPts(Math.abs(diff)), count: reasons.length })}
                        </Txt>
                        {` ${list(reasons)}. ${picksText}`}
                    </Txt>
                </View>
            )}
            {(theirDay.hidden > 0 || myDay.hidden > 0) && (
                <Txt size={11} tone="muted">
                    {t('pro.fanaticos.compare.partial')}
                </Txt>
            )}
        </Block>
    );
};

// ---------------------------------------------------------------- peloteros más usados y capitán

const UsageBlock: React.FC<{ detail?: FanDetail; pending: boolean; seasonPoints: number; days: number }> = ({ detail, pending, seasonPoints, days }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const openPlayer = useOpenPlayer();
    const narrow = useWindowDimensions().width < 360;
    const { setNode, onLayout, seen } = useInView();
    if (pending) return <Skeleton height={260} />;
    if (!detail || !detail.players.length) return null;
    const teams = detail.teams;
    const totalDays = detail.days.filter((day) => day.started).length;
    const parts = [
        ...detail.byTeam.filter((item) => item.points > 0).map((item) => ({ id: `t${item.teamId}`, teamId: item.teamId as number | null, points: item.points })),
        ...(detail.picks.points > 0 ? [{ id: 'picks', teamId: null as number | null, points: detail.picks.points }] : [])
    ];
    const sum = parts.reduce((acc, item) => acc + item.points, 0) || 1;
    const captain = detail.captains[0];
    const captainPlayer = captain ? detail.players.find((player) => player.id === captain.id) : undefined;
    // El último día con este capitán: su línea y el mejor de ese día
    const captainDay = captain ? detail.days.find((day) => day.final && day.lineup.some((item) => item.id === captain.id && item.captain)) : undefined;
    const captainItem = captainDay?.lineup.find((item) => item.id === captain?.id);
    const bestThatDay = captainDay ? [...captainDay.lineup].sort((a, b) => b.points - a.points)[0] : undefined;
    const lost = captainItem && bestThatDay && bestThatDay.id !== captainItem.id ? round1((bestThatDay.points - captainItem.points) * (RULES.captain - 1)) : 0;
    const top = detail.players.slice(0, 6);
    const summary = parts.map((item) => `${item.teamId ? (teams[item.teamId]?.abbrev ?? '') : t('fantasy.picks')} ${fmtPts(item.points)}`).join(', ');
    const perRow = narrow ? 2 : 3;
    const tileRows = Array.from({ length: Math.ceil(top.length / perRow) }, (_, row) => top.slice(row * perRow, row * perRow + perRow));

    return (
        <Block>
            <ModuleHeader title={t('pro.fanaticos.usage.title')} />
            <View ref={setNode} onLayout={onLayout} style={{ gap: 8 }}>
                <Txt size={13} weight="bold">
                    {t('pro.fanaticos.usage.where', { pts: fmtPts(seasonPoints) })}
                </Txt>
                <View accessible accessibilityRole="image" accessibilityLabel={t('pro.fanaticos.usage.barLabel', { list: summary })} style={{ height: 12, flexDirection: 'row', gap: 3, borderRadius: 6, overflow: 'hidden' }}>
                    {parts.map((item, partIndex) => (
                        <View key={item.id} style={{ width: `${(item.points / sum) * 100}%`, minWidth: 4 }}>
                            <GrowBar value={1} index={partIndex} seen={seen} track={false} height={12} color={item.teamId ? (teams[item.teamId]?.color ?? colors.muted) : alpha(colors.muted, 0.45)} />
                        </View>
                    ))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                    {parts.map((item) => (
                        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {item.teamId && teams[item.teamId] ? <TeamLogo team={teams[item.teamId]} size={16} /> : <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: alpha(colors.muted, 0.45) }} />}
                            <Txt size={12} weight="semibold">
                                {item.teamId ? teams[item.teamId]?.abbrev : t('fantasy.picks')}
                            </Txt>
                            <Txt size={12} weight="semibold" tone="muted" tabular>
                                {fmtPts(item.points)}
                            </Txt>
                        </View>
                    ))}
                </View>
            </View>
            {captain && captainPlayer && (
                <View style={{ gap: 10, borderRadius: radius.tile, backgroundColor: alpha(colors.gold, 0.08), borderWidth: 1.5, borderColor: alpha(colors.gold, 0.55), padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Crown size={16} color={colors.gold} />
                        <Txt size={11} weight="extrabold" color={colors.gold} style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                            {t('pro.fanaticos.usage.captain')}
                        </Txt>
                    </View>
                    <Pressable onPress={() => openPlayer(captain.id)} accessibilityRole="button" accessibilityLabel={t('statsPage.viewPlayer', { name: captain.name })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <PlayerPhoto personId={captain.id} name={captain.name} size={52} team={teams[captain.teamId] ?? null} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={17} weight="black" numberOfLines={1} style={{ letterSpacing: -0.3 }}>
                                {captain.name}
                            </Txt>
                            <Txt size={12} tone="muted">
                                {t('pro.fanaticos.usage.captainSub', { team: teams[captain.teamId]?.abbrev ?? '', pos: captain.pos, days: captain.days, count: totalDays })}
                            </Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                            <Num size={28} color={colors.gold}>
                                {fmtSignedPts(captain.bonus)}
                            </Num>
                            <Txt size={11} weight="bold" tone="muted">
                                {t('pro.fanaticos.usage.crown')}
                            </Txt>
                        </View>
                    </Pressable>
                    {captainItem && (
                        <Txt size={13} tone="muted" style={{ lineHeight: 18 }}>
                            {`${fmtPts(captainItem.points)} × ${RULES.captain} = ${fmtPts(captainItem.score)}. `}
                            {lost > 0 && bestThatDay
                                ? t('pro.fanaticos.usage.better', { day: shortDayName(captainDay!.date, lang), name: surname(bestThatDay.name), pts: fmtPts(bestThatDay.points), lost: fmtPts(lost) })
                                : t('pro.fanaticos.usage.wasBest')}
                        </Txt>
                    )}
                </View>
            )}
            <View style={{ gap: 8 }}>
                {tileRows.map((row, rowIndex) => (
                    <View key={rowIndex} style={{ flexDirection: 'row', gap: 8 }}>
                        {row.map((player, column) => {
                            const playerIndex = rowIndex * perRow + column;
                            const team = teams[player.teamId];
                            const share = seasonPoints > 0 ? Math.max(0, player.points / seasonPoints) : 0;
                            return (
                                <Enter key={player.id} index={playerIndex} style={{ flex: 1, flexBasis: 0, minWidth: 0 }}>
                                    <Pressable
                                        onPress={() => openPlayer(player.id)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${player.name}: ${fmtPts(player.points)} ${t('pro.fantasy.pts')}, ${t('pro.fanaticos.usage.daysOf', { days: player.days, count: totalDays })}, ${Math.round(share * 100)}%`}
                                        style={({ pressed }) => ({ gap: 6, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 10, opacity: pressed ? 0.85 : 1 })}
                                    >
                                        <View style={{ alignSelf: 'flex-start' }}>
                                            <PlayerPhoto personId={player.id} name={player.name} size={36} team={team ?? null} />
                                            {player.captainDays > 0 && (
                                                <View style={{ position: 'absolute', left: -4, top: -6 }}>
                                                    <Crown size={14} color={colors.gold} />
                                                </View>
                                            )}
                                        </View>
                                        <Num size={26}>{fmtPts(player.points)}</Num>
                                        <Txt size={12} weight="bold" numberOfLines={1}>
                                            {surname(player.name)}
                                        </Txt>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 4 }}>
                                            <Txt size={10} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                                                {t('pro.fanaticos.usage.daysOf', { days: player.days, count: totalDays })}
                                            </Txt>
                                            <Txt size={10} tone="muted" tabular>
                                                {`${Math.round(share * 100)}%`}
                                            </Txt>
                                        </View>
                                        <GrowBar value={share} color={team?.color} index={playerIndex} height={4} />
                                    </Pressable>
                                </Enter>
                            );
                        })}
                        {Array.from({ length: perRow - row.length }, (_, filler) => (
                            <View key={`f${filler}`} style={{ flex: 1, flexBasis: 0 }} />
                        ))}
                    </View>
                ))}
            </View>
            {days <= 1 && (
                <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                    {t('pro.fanaticos.usage.firstDay', { pts: fmtPts(seasonPoints) })}
                </Txt>
            )}
        </Block>
    );
};

// ---------------------------------------------------------------- sus días

interface DaysBlockProps {
    league: LeagueId;
    detail?: FanDetail;
    pending: boolean;
    error: unknown;
    onRetry: () => void;
    today: string;
    todayDay?: FantasyDay;
    /** Sin el detalle del servidor: los días del perfil (total, equipo y pronósticos), sin el desglose */
    fallback: { date: string; final: boolean; live: boolean; team: number; picks: number; total: number }[] | null;
}

const DaysBlock: React.FC<DaysBlockProps> = ({ league, detail, pending, error, onRetry, today, todayDay, fallback }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const errorText = useErrorText();
    const L = useLocalText();
    if (pending) return <Skeleton height={220} />;
    if (error && !detail && !fallback) return <ErrorState message={errorText(error)} onRetry={onRetry} />;
    const first = todayDay?.games
        .filter((game) => game.state === 'preview')
        .map((game) => game.date)
        .sort()[0];
    const scoring = todayDay?.scoring;
    if (!detail) {
        if (!fallback) return null;
        const past = fallback.filter((day) => day.date !== today && (day.final || day.live));
        return (
            <Block>
                <ModuleHeader title={t('pro.fanaticos.days.title')} />
                {past.length ? (
                    past.map((day, dayIndex) => (
                        <View key={day.date} accessible style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: dayIndex ? 1 : 0, borderTopColor: alpha(colors.line, 0.1), paddingVertical: 10 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt size={15} weight="extrabold">
                                    {longDay(day.date, lang)}
                                </Txt>
                                <Txt size={12} tone="muted">
                                    {t('pro.fantasy.summary.split', { team: fmtPts(day.team), picks: fmtPts(day.picks) })}
                                </Txt>
                            </View>
                            <Num size={24}>{fmtPts(day.total)}</Num>
                            <Txt size={12} tone="muted">
                                {t('pro.fantasy.pts')}
                            </Txt>
                        </View>
                    ))
                ) : (
                    <Txt size={14} tone="muted">
                        {L('fans.noPastDays')}
                    </Txt>
                )}
            </Block>
        );
    }
    const todayItem = detail.days.find((day) => day.date === today);
    const past = detail.days.filter((day) => day.date !== today && day.started);
    return (
        <Block>
            <ModuleHeader title={t('pro.fanaticos.days.title')} />
            {todayItem && !todayItem.final && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.25), paddingHorizontal: 14, paddingVertical: 12 }}>
                    <Clock size={20} color={colors.muted} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={14} weight="extrabold">
                            {t('pro.fanaticos.days.today', { day: shortDayName(today, lang) })}
                        </Txt>
                        <Txt size={12} tone="muted">
                            {todayItem.started ? t('pro.fanaticos.days.todayLive', { pts: fmtPts(todayItem.total) }) : first ? t('pro.fanaticos.days.todayLater', { time: formatTime(first, lang) }) : t('pro.fanaticos.days.todayWait')}
                        </Txt>
                    </View>
                    <Num size={20} tone="muted">
                        {todayItem.started ? fmtPts(todayItem.total) : '—'}
                    </Num>
                </View>
            )}
            {past.length ? (
                <View style={{ gap: 10 }}>
                    {past.map((day, dayIndex) => (
                        <DayCard key={day.date} league={league} day={day} teams={detail.teams} scoring={scoring} initial={dayIndex === 0} />
                    ))}
                </View>
            ) : (
                <Txt size={14} tone="muted">
                    {L('fans.noPastDays')}
                </Txt>
            )}
            <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                {t('pro.fanaticos.days.legend', { pts: RULES.pick })}
            </Txt>
        </Block>
    );
};

const DayCard: React.FC<{ league: LeagueId; day: FanDetailDay; teams: FanDetail['teams']; scoring?: FantasyDay['scoring']; initial: boolean }> = ({ league, day, teams, scoring, initial }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const [open, setOpen] = useState(initial);
    const stats = useFantasyStats(league, day.date, open && day.started);
    const rank = stats.data?.scores.length ? rankIn(stats.data.scores, day.total) : null;
    const ordered = [...day.lineup].sort((a, b) => b.score - a.score || a.id - b.id);
    return (
        <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised }}>
            <Pressable onPress={() => setOpen((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt size={15} weight="extrabold">
                        {longDay(day.date, lang)}
                    </Txt>
                    <Txt size={12} tone="muted">
                        {rank !== null ? `${t('pro.fanaticos.days.rank', { rank: ordinal(rank, lang) })} · ` : ''}
                        {t('pro.fanaticos.days.count', { players: day.lineup.length + day.hidden, picks: day.pickList.length + day.picksHidden })}
                    </Txt>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
                    <Num size={28}>{fmtPts(day.total)}</Num>
                    <Txt size={12} tone="muted">
                        {t('pro.fantasy.pts')}
                    </Txt>
                </View>
                <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                    <ChevronDown size={16} color={colors.muted} />
                </View>
            </Pressable>
            {open && (
                <View style={{ gap: 12, paddingHorizontal: 14, paddingBottom: 14 }}>
                    {day.pickList.length > 0 && (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                            {day.pickList.map((pick) => {
                                const game = day.games.find((item) => item.gamePk === pick.gamePk);
                                if (!game) return null;
                                const away = teams[game.away.id];
                                const home = teams[game.home.id];
                                const pickedHome = pick.teamId === game.home.id;
                                const score = `${game.away.score ?? 0}-${game.home.score ?? 0}`;
                                const result = pick.result === 'win' ? t('pro.fanaticos.days.hit') : pick.result === 'loss' ? t('pro.fanaticos.days.miss') : t('pro.fanaticos.days.pending');
                                return (
                                    <View
                                        key={pick.gamePk}
                                        accessible
                                        accessibilityLabel={t('pro.fanaticos.days.pickLabel', { away: away?.abbrev, home: home?.abbrev, score, team: teams[pick.teamId]?.abbrev, result })}
                                        style={{ flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 4, borderRadius: 12, backgroundColor: colors.surface, padding: 6 }}
                                    >
                                        <View style={{ height: 24, width: '100%', flexDirection: 'row', overflow: 'hidden', borderRadius: 12 }}>
                                            {[away, home].map((team, side) => {
                                                const picked = (side === 1) === pickedHome;
                                                const color = team?.color ?? '#64748b';
                                                const ink = teamInk(color);
                                                return (
                                                    <View key={side} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: color, opacity: picked ? 1 : 0.6 }}>
                                                        {picked && (pick.result === 'win' ? <Check size={12} color={ink} /> : pick.result === 'loss' ? <X size={12} color={ink} /> : null)}
                                                        <Txt size={10} weight="extrabold" color={ink} numberOfLines={1}>
                                                            {team?.abbrev}
                                                        </Txt>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                                            <Num size={16}>{score}</Num>
                                            <Txt size={11} weight="extrabold" color={pick.result === 'win' ? pro.up : pick.result === 'loss' ? pro.down : colors.muted}>
                                                {pick.result === 'win' ? `+${RULES.pick}` : pick.result === 'loss' ? '0' : '…'}
                                            </Txt>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                    <View>
                        {ordered.map((item, itemIndex) => {
                            const team = teams[item.teamId];
                            const parts = scoring ? pointParts({ role: item.role, line: item.line }, scoring) : [];
                            const line = item.line ? (item.role === 'P' ? `${item.line.ip} IP` : `${item.line.h}-${item.line.ab}`) : '';
                            return (
                                <View key={item.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: itemIndex ? 1 : 0, borderTopColor: alpha(colors.line, 0.1) }}>
                                    <PlayerPhoto personId={item.id} name={item.name} size={36} team={team ?? null} />
                                    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Txt size={13} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                                {surname(item.name)}
                                            </Txt>
                                            {item.captain && <Crown size={14} color={colors.gold} accessibilityLabel={t('fantasy.captain')} />}
                                            <Txt size={12} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                                                {team?.abbrev}
                                                {line ? ` · ${line}` : ''}
                                            </Txt>
                                        </View>
                                        <PartChips parts={parts} variant="plus" surface={colors.surface} extra={item.captain ? <PartChip text={`${fmtPts(item.points)} ×${RULES.captain}`} tone="gold" /> : undefined} />
                                    </View>
                                    <Num size={20} color={item.score < 0 ? pro.down : item.captain ? colors.gold : undefined} style={{ flexShrink: 0 }}>
                                        {fmtPts(item.score)}
                                    </Num>
                                </View>
                            );
                        })}
                    </View>
                    {day.hidden > 0 && (
                        <Txt size={11} tone="muted">
                            {t('pro.fanaticos.days.hidden', { count: day.hidden })}
                        </Txt>
                    )}
                </View>
            )}
        </View>
    );
};
