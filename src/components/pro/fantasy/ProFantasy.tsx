// Fantasy en modo PRO: el mismo juego (las mismas reglas, créditos, antitrampa y el mismo guardado) con más datos para
// decidir y seguirlo. La pantalla (src/app/(tabs)/fantasy.tsx) maneja el día, la pestaña, el guardado y los perfiles;
// aquí se pinta todo, con su propio scroll para poder bajar a «Escoge peloteros» al tocar «Cambiar».
import React, { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, RefreshControl, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart3, ChevronRight, Share2, Users } from 'lucide-react-native';
import type { LeagueId } from '../../../types';
import { useSession } from '../../../lib/account';
import { entryKey, gameStarted, history, pickPoints, playerScore, teamPoints, useFantasyDay, useFantasyStore, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../../lib/fantasy';
import { formatLongDate } from '../../../lib/format';
import { useFantasyForm, useFantasyStats, useProStandings } from '../../../lib/pro/liga';
import { startersOf, useFantasyLineups } from '../../../lib/pro/pantallas';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { ErrorState, OfflineState, Skeleton, Txt, useErrorText } from '../../ui';
import { AccountCard } from '../../account/AccountCard';
import { useFanProfile } from '../../fantasy/fans';
import { shift, useOpenPlayer } from '../../fantasy/shared';
import { useLocalText } from '../../fantasy/texts';
import { ProNote, ProSegmented, ScreenTitle, useNow } from '../kit';
import { ProFans } from '../fanaticos/ProFans';
import { fmtPts } from './bits';
import { useLeaguesPro, useSaveStatus, useScoutSeason, useSeasonTable } from './data';
import { DaySummary, type PrevInfo, type RankInfo } from './DaySummary';
import { IdealDay } from './IdealDay';
import { LeaguesSheet } from './LeaguesSheet';
import { LiveNow } from './LiveNow';
import { Picks } from './Picks';
import { ReplayYesterday } from './ReplayYesterday';
import { Scouting } from './Scouting';
import { SeasonSheet } from './SeasonSheet';
import { SHARE_SITE, ShareFantasy, type ShareCardData } from './ShareFantasy';
import { TablePro, type OpenFan } from './TablePro';
import { TeamGrid } from './TeamGrid';
import { projectionOf, shortDayName, standingRows, teamFormOf } from './logic';

export type FantasyTab = 'team' | 'picks' | 'table' | 'fans';

export interface ProFantasyProps {
    league: LeagueId;
    query: UseQueryResult<FantasyDay, Error>;
    /** Día elegido (undefined = hoy) */
    date: string | undefined;
    onDate: (date: string | undefined) => void;
    today: string | null;
    tab: FantasyTab;
    onTab: (tab: FantasyTab) => void;
    entry: DayEntry;
    onOpenFan: OpenFan;
}

const entryTotals = (day: FantasyDay | undefined, entry: DayEntry | undefined) => {
    if (!day || !entry || (!entry.lineup.length && !Object.keys(entry.picks).length)) return null;
    const team = entry.result?.team ?? teamPoints(day, entry);
    const picks = entry.result?.picks ?? pickPoints(day, entry);
    return { team, picks, total: Math.round((team + picks) * 10) / 10 };
};

/** «Sábado 17 de octubre» (sin la coma del formato largo) */
const longDay = (date: string, lang: string) => {
    const text = formatLongDate(date, lang).replace(/^([^\s,]+),(?= \d)/, '$1');
    return text.charAt(0).toUpperCase() + text.slice(1);
};

export const ProFantasy: React.FC<ProFantasyProps> = ({ league, query, date, onDate, today, tab, onTab, entry, onOpenFan }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const errorText = useErrorText();
    const L = useLocalText();
    const session = useSession();
    const userId = session?.user.id ?? '';
    const store = useFantasyStore();
    const openPlayer = useOpenPlayer();
    const now = useNow(30000);
    const day = query.data;
    const isToday = !date || date === today;

    // Los tres días de arriba (ayer, hoy, mañana) y el anterior al día elegido
    const prevKey = today ? shift(today, -1) : undefined;
    const nextKey = today ? shift(today, 1) : undefined;
    const yesterdayQuery = useFantasyDay(league, prevKey);
    const todayQuery = useFantasyDay(league, undefined);
    const tomorrowQuery = useFantasyDay(league, nextKey);
    const beforeQuery = useFantasyDay(league, day ? shift(day.date, -1) : prevKey);
    const before = beforeQuery.data && day && beforeQuery.data.date === shift(day.date, -1) ? beforeQuery.data : undefined;
    const beforeEntry = before ? store[entryKey(league, before.date)] : undefined;

    // Datos PRO (si una ruta no existe todavía, su bloque no sale o sale lo del Lite)
    const scout = useScoutSeason(league);
    const stats = useFantasyStats(league, day?.date, !!day);
    const form = useFantasyForm(league, day?.date, !!day);
    const lineups = useFantasyLineups(league, day?.date, !!day);
    const standings = useProStandings(league);
    const season = useSeasonTable(league);
    const mineRow = season.data?.ranking.find((row) => row.userId === userId);
    const alone = useSeasonTable(league, userId ? [userId] : undefined, season.pro && !!season.data && !mineRow && season.data.ranking.length >= 200);
    const myRow = mineRow ?? alone.data?.ranking.find((row) => row.userId === userId);
    const leaguesQuery = useLeaguesPro(userId);
    const leagues = useMemo(() => leaguesQuery.data ?? [], [leaguesQuery.data]);
    const profile = useFanProfile(userId || null, league);
    const past = useMemo(() => history(store, league), [store, league]);
    const seasonTotals = profile.data?.season ?? { points: Math.round(past.reduce((sum, item) => sum + item.points, 0) * 10) / 10, days: past.length };
    const saveStatus = useSaveStatus(league, day?.date, entry, userId, today);

    const projection = useMemo(() => (day ? projectionOf(day, entry, (id) => scout.rows.get(id)?.ppg ?? null) : { byId: {}, total: 0, known: 0, count: 0 }), [day, entry, scout.rows]);
    const forms = useMemo(() => teamFormOf(standingRows(standings.data)), [standings.data]);
    const starters = useMemo(() => startersOf(lineups.data), [lineups.data]);
    const lineupGames = useMemo(() => new Set((lineups.data?.games ?? []).filter((game) => game.away || game.home).map((game) => game.gamePk)), [lineups.data]);

    const [role, setRole] = useState<'B' | 'P'>('B');
    const [replacing, setReplacing] = useState<FantasyPlayer | null>(null);
    const [sheet, setSheet] = useState<'season' | 'leagues' | 'share' | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Bajar a «Escoge peloteros»: la posición del panel en la página más la de la lista dentro del panel
    const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
    const panelY = useRef(0);
    const pickY = useRef(0);
    const goPick = () => requestAnimationFrame(() => scroller.current?.scrollTo({ y: Math.max(0, panelY.current + pickY.current - 12), animated: true }));
    const pick = (next: 'B' | 'P') => {
        setRole(next);
        setReplacing(null);
        goPick();
    };
    const change = (player: FantasyPlayer) => {
        setRole(player.role);
        setReplacing(player);
        goPick();
    };
    const onInfo = (player: FantasyPlayer) => openPlayer(player.id);

    const dayName = (key: string) => (key === today ? t('games.today') : key < (today ?? '') ? t('games.yesterday') : t('games.tomorrow'));
    const pills = (
        [
            { key: prevKey, data: yesterdayQuery.data },
            { key: today ?? undefined, data: todayQuery.data },
            { key: nextKey, data: tomorrowQuery.data }
        ] as { key: string | undefined; data: FantasyDay | undefined }[]
    ).filter((item): item is { key: string; data: FantasyDay | undefined } => !!item.key);
    const pillSub = (key: string, data: FantasyDay | undefined) => {
        const name = shortDayName(key, lang);
        const totals = entryTotals(data, store[entryKey(league, key)]);
        if (totals && data?.games.some((game) => game.state !== 'preview')) return t('pro.fantasy.days.pts', { day: name, pts: fmtPts(totals.total) });
        if (data) return t('pro.fantasy.days.games', { day: name, count: data.games.length });
        return name;
    };

    const rank: RankInfo | null = myRow?.rank ? { rank: myRow.rank, total: season.data?.total ?? 0, toLeader: Math.max(0, (season.data?.ranking[0]?.points ?? myRow.points) - myRow.points) } : null;
    const prevTotals = entryTotals(before, beforeEntry);
    const prev: PrevInfo | null =
        before && prevTotals && before.games.some((game) => game.state !== 'preview')
            ? { label: `${before.date === prevKey ? `${t('games.yesterday')} · ` : ''}${shortDayName(before.date, lang)}`, ...prevTotals }
            : null;

    // Compartir: las 6 fotos del día elegido con sus puntos
    const lineupPlayers = day ? entry.lineup.map((id) => day.players.find((player) => player.id === id)).filter((player): player is FantasyPlayer => !!player) : [];
    const shareData: ShareCardData | null =
        day && lineupPlayers.length
            ? {
                  title: 'El Play Fantasy',
                  subtitle: t('pro.fantasy.share.subtitle', { day: longDay(day.date, lang) }),
                  league: t(`leagues.${league}.name`),
                  slots: lineupPlayers.map((player) => {
                      const game = day.games.find((item) => item.gamePk === player.gamePk);
                      return { id: player.id, name: player.name, teamId: player.teamId, points: game && gameStarted(game, now) ? fmtPts(playerScore(entry, player)) : null, captain: entry.captain === player.id };
                  }),
                  total: fmtPts(teamPoints(day, entry) + pickPoints(day, entry)),
                  unit: t('pro.fantasy.pts'),
                  split: t('pro.fantasy.summary.split', { team: fmtPts(teamPoints(day, entry)), picks: fmtPts(pickPoints(day, entry)) }),
                  rank: rank ? t('pro.fantasy.share.rank', { rank: rank.rank, total: rank.total }) : null,
                  site: SHARE_SITE
              }
            : null;

    const finished = !!day && day.games.length > 0 && day.games.every((game) => game.state === 'final');
    const prevFinished = !!before && before.games.length > 0 && before.games.every((game) => game.state === 'final') && !!beforeEntry?.lineup.length;
    const myLeague = leagues[0];
    const offline = !day && query.fetchStatus === 'paused';
    const eyebrow = day ? longDay(day.date, lang) : t(`leagues.${league}.name`);
    const iconButton = { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface } as const;

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <ScrollView
                ref={scroller}
                style={{ flex: 1, backgroundColor: colors.bg }}
                contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120, paddingHorizontal: 16, gap: 16 }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        tintColor={colors.accent}
                        colors={[colors.accent]}
                        onRefresh={async () => {
                            setRefreshing(true);
                            await query.refetch().catch(() => undefined);
                            setRefreshing(false);
                        }}
                    />
                }
            >
                <ScreenTitle
                    eyebrow={eyebrow}
                    title={t('fantasy.title')}
                    actions={
                        <>
                            <Pressable onPress={() => setSheet('season')} accessibilityRole="button" accessibilityLabel={t('pro.fantasy.season.open')} style={({ pressed }) => [iconButton, shadow('card'), { opacity: pressed ? 0.8 : 1 }]}>
                                <BarChart3 size={20} color={colors.ink} />
                            </Pressable>
                            {shareData && (
                                <Pressable onPress={() => setSheet('share')} accessibilityRole="button" accessibilityLabel={t('pro.fantasy.share.open')} style={({ pressed }) => [iconButton, shadow('card'), { opacity: pressed ? 0.8 : 1 }]}>
                                    <Share2 size={20} color={colors.ink} />
                                </Pressable>
                            )}
                        </>
                    }
                />

                {pills.length > 0 && (
                    <View accessibilityRole="tablist" accessibilityLabel={t('games.selectDate')} style={{ flexDirection: 'row', gap: 8 }}>
                        {pills.map(({ key, data }) => {
                            const active = (date ?? today) === key;
                            return (
                                <Pressable
                                    key={key}
                                    onPress={() => onDate(key === today ? undefined : key)}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={`${dayName(key)}, ${pillSub(key, data)}`}
                                    style={({ pressed }) => [
                                        { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.tile, paddingHorizontal: 4, backgroundColor: active ? colors.ink : colors.surface, opacity: pressed ? 0.85 : 1 },
                                        !active && shadow('card')
                                    ]}
                                >
                                    <Txt size={14} weight="extrabold" color={active ? colors.bg : colors.ink} numberOfLines={1}>
                                        {dayName(key)}
                                    </Txt>
                                    <Txt size={11} color={active ? alpha(colors.bg, 0.8) : colors.muted} numberOfLines={1}>
                                        {pillSub(key, data)}
                                    </Txt>
                                </Pressable>
                            );
                        })}
                    </View>
                )}

                <ProSegmented<FantasyTab>
                    value={tab}
                    onChange={onTab}
                    label={t('fantasy.sections')}
                    track="surface"
                    options={[
                        { value: 'team', label: t('fantasy.myTeam') },
                        { value: 'picks', label: t('fantasy.picks') },
                        { value: 'table', label: t('fantasy.table') },
                        { value: 'fans', label: L('fans.tab') }
                    ]}
                />

                <View
                    style={{ gap: 24 }}
                    onLayout={(event: LayoutChangeEvent) => {
                        panelY.current = event.nativeEvent.layout.y;
                    }}
                >
                    {tab === 'fans' ? (
                        <ProFans league={league} userId={userId} leagues={leagues} onOpen={onOpenFan} onOpenLeagues={() => setSheet('leagues')} />
                    ) : offline ? (
                        <OfflineState />
                    ) : query.isPending ? (
                        <View style={{ gap: 12 }}>
                            <Skeleton height={300} />
                            {[0, 1].map((row) => (
                                <View key={row} style={{ flexDirection: 'row', gap: 10 }}>
                                    <Skeleton height={200} round={radius.tile} style={{ flex: 1, width: undefined }} />
                                    <Skeleton height={200} round={radius.tile} style={{ flex: 1, width: undefined }} />
                                </View>
                            ))}
                        </View>
                    ) : query.isError && !day ? (
                        <ErrorState message={errorText(query.error)} onRetry={() => query.refetch()} />
                    ) : !day ? null : !day.games.length && tab !== 'table' ? (
                        <ProNote tone="neutral" title={t('fantasy.noGames')}>
                            {t('fantasy.noGamesHint')}
                        </ProNote>
                    ) : tab === 'team' ? (
                        <>
                            <DaySummary
                                day={day}
                                entry={entry}
                                dayName={isToday ? t('games.today').toLowerCase() : shortDayName(day.date, lang)}
                                team={teamPoints(day, entry)}
                                picks={pickPoints(day, entry)}
                                projection={projection}
                                rank={rank}
                                rankPending={season.isPending}
                                prev={prev}
                                season={seasonTotals}
                                saveStatus={saveStatus}
                                onOpenSeason={() => setSheet('season')}
                            />
                            <TeamGrid day={day} entry={entry} prevDay={before} projection={projection} scout={scout.rows} form={form.data?.players} now={now} onPick={pick} onChange={change} onInfo={onInfo} />
                            {isToday && !day.games.some((game) => game.state === 'live') && prevFinished && before && beforeEntry ? <ReplayYesterday day={before} entry={beforeEntry} /> : null}
                            <LiveNow league={league} day={day} entry={entry} userId={userId} />
                            {finished ? (
                                <IdealDay day={day} entry={entry} title={t('pro.fantasy.ideal.eyebrowDay')} dateName={shortDayName(day.date, lang)} onInfo={onInfo} />
                            ) : (
                                <View
                                    onLayout={(event: LayoutChangeEvent) => {
                                        pickY.current = event.nativeEvent.layout.y;
                                    }}
                                >
                                    <Scouting
                                        day={day}
                                        entry={entry}
                                        role={role}
                                        onRole={(next) => {
                                            setRole(next);
                                            if (replacing && replacing.role !== next) setReplacing(null);
                                        }}
                                        replacing={replacing}
                                        onCancelReplace={() => setReplacing(null)}
                                        scout={scout}
                                        form={form.data?.players}
                                        stats={stats.data}
                                        starters={starters}
                                        lineupGames={lineupGames}
                                        now={now}
                                        onInfo={onInfo}
                                    />
                                </View>
                            )}
                            <Pressable
                                onPress={() => setSheet('leagues')}
                                accessibilityRole="button"
                                style={({ pressed }) => [{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, opacity: pressed ? 0.85 : 1 }, shadow('card')]}
                            >
                                <View style={{ width: 40, height: 40, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.accent, 0.16) }}>
                                    <Users size={20} color={colors.accentInk} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                    <Txt size={14} weight="extrabold">
                                        {t('pro.fantasy.leagues.title')}
                                    </Txt>
                                    <Txt size={11} tone="muted" numberOfLines={1}>
                                        {myLeague ? t('pro.fantasy.leagues.row', { name: myLeague.name, count: myLeague.members.length }) : leaguesQuery.isPending ? '' : t('pro.fantasy.leagues.rowNone')}
                                    </Txt>
                                </View>
                                <ChevronRight size={20} color={colors.muted} />
                            </Pressable>
                            {!finished && prevFinished && before && beforeEntry ? (
                                <IdealDay day={before} entry={beforeEntry} title={t('pro.fantasy.ideal.eyebrowYesterday')} dateName={shortDayName(before.date, lang)} onInfo={onInfo} />
                            ) : null}
                        </>
                    ) : tab === 'picks' ? (
                        <Picks day={day} entry={entry} prevDay={before} prevEntry={beforeEntry} prevName={before ? shortDayName(before.date, lang) : undefined} forms={forms} stats={stats.data} now={now} />
                    ) : (
                        <>
                            {session && !session.name ? (
                                <View style={{ gap: 8 }}>
                                    <Txt size={14} weight="semibold">
                                        {t('pro.fantasy.leagues.nameTitle')}
                                    </Txt>
                                    <AccountCard />
                                </View>
                            ) : null}
                            <TablePro league={league} day={day} userId={userId} leagues={leagues} onOpen={onOpenFan} onOpenLeagues={() => setSheet('leagues')} />
                        </>
                    )}
                </View>
            </ScrollView>

            {userId ? <SeasonSheet open={sheet === 'season'} league={league} userId={userId} today={today} projection={isToday && projection.known ? projection.total : null} onClose={() => setSheet(null)} /> : null}
            {userId ? (
                <LeaguesSheet open={sheet === 'leagues'} league={league} userId={userId} day={day} leagues={leagues} loading={leaguesQuery.isPending} error={leaguesQuery.error} onRetry={() => leaguesQuery.refetch()} onClose={() => setSheet(null)} />
            ) : null}
            <ShareFantasy
                open={sheet === 'share' && !!shareData}
                data={shareData}
                teams={day?.teams ?? {}}
                fileName={`el-play-fantasy-${day?.date ?? 'hoy'}`}
                text={shareData ? t('pro.fantasy.share.text', { total: shareData.total }) : ''}
                onClose={() => setSheet(null)}
            />
        </View>
    );
};
