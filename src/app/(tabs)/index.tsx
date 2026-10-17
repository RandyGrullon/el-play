import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarX2 } from 'lucide-react-native';
import type { LeagueId, ScheduleGame } from '../../types';
import { useSchedule } from '../../lib/queries';
import { dayKey, dayRange, formatLongDate, todayKey } from '../../lib/format';
import { useIsPro } from '../../lib/pro';
import { useLeague } from '../../state/league';
import { usePreferences } from '../../state/preferences';
import { useColors } from '../../theme/theme';
import { radius, shadow } from '../../theme/tokens';
import { Screen } from '../../components/layout';
import { Card, ErrorState, OfflineState, ProBadge, Row, Txt, useErrorText } from '../../components/ui';
import { GameFeedCard, GameFeedCardSkeleton } from '../../components/feed/GameFeedCard';
import { TeamStories } from '../../components/feed/TeamStories';
import { DayChips, capitalize, waitingForNetwork } from '../../components/feed/DayChips';
import { LeagueSheet } from '../../components/feed/LeagueSheet';
import { LogoMark } from '../../components/feed/LogoMark';
import { useShare } from '../../components/share/ShareSheet';
import { resultFromSchedule } from '../../components/share/subjects';

const ORDER = { live: 0, preview: 1, final: 2 } as const;

// Portada «Juegos»: igual que GamesPage de la web
export default function GamesScreen() {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const errorText = useErrorText();
    const pro = useIsPro();
    const { activeLeague, leagueConfig } = useLeague();
    const { favoriteTeamId } = usePreferences();
    const schedule = useSchedule(activeLeague);
    const { share, sheet } = useShare();
    const timeZone = schedule.data?.timeZone || leagueConfig.timeZone;
    const today = todayKey(timeZone);
    // Día y equipo elegidos; al cambiar de liga se vuelve a hoy y a todos los equipos
    const [picked, setPicked] = useState<{ league: LeagueId; day: string | null; team: number | null }>({ league: activeLeague, day: null, team: null });
    const current = picked.league === activeLeague ? picked : { league: activeLeague, day: null, team: null };
    const selected = current.day;
    const team = current.team;
    const setSelected = (day: string) => setPicked({ ...current, day });
    const setTeam = (next: number | null) => setPicked({ ...current, team: next });
    const [leagueOpen, setLeagueOpen] = useState(false);

    const byDay = useMemo(() => {
        const map: Record<string, ScheduleGame[]> = {};
        for (const game of schedule.data?.games ?? []) {
            let key = dayKey(game.date, timeZone);
            // Un juego de anoche que sigue en vivo después de medianoche se muestra en "Hoy"
            if (game.state === 'live' && key < today) key = today;
            (map[key] ||= []).push(game);
        }
        return map;
    }, [schedule.data, timeZone, today]);

    // Al empezar la temporada no se muestran los días vacíos de antes del primer juego (hoy siempre)
    const days = useMemo(() => {
        if (!schedule.data) return [];
        const first = Object.keys(byDay).sort()[0];
        return dayRange(schedule.data.startDate, schedule.data.endDate).filter((key) => key === today || !first || key >= first);
    }, [schedule.data, byDay, today]);

    const counts = useMemo(() => Object.fromEntries(Object.entries(byDay).map(([key, games]) => [key, { total: games.length, live: games.filter((g) => g.state === 'live').length }])), [byDay]);

    const day = selected ?? today;
    const dayGames = useMemo(() => byDay[day] ?? [], [byDay, day]);
    const games = useMemo(() => {
        const list = dayGames.filter((game) => team === null || game.away.id === team || game.home.id === team);
        const favorite = (game: ScheduleGame) => (favoriteTeamId !== null && (game.away.id === favoriteTeamId || game.home.id === favoriteTeamId) ? 0 : 1);
        return [...list].sort((a, b) => ORDER[a.state] - ORDER[b.state] || favorite(a) - favorite(b) || a.date.localeCompare(b.date));
    }, [dayGames, team, favoriteTeamId]);

    const nextDay = useMemo(() => days.find((key) => key > day && byDay[key]?.length), [days, day, byDay]);
    const leagueName = t(`leagues.${activeLeague}.name`);

    const shareGame = (game: ScheduleGame) =>
        share({
            data: resultFromSchedule(game, leagueName, t, i18n.language),
            fileName: `el-play-${game.away.abbrev}-${game.home.abbrev}`.toLowerCase(),
            text: `${game.away.name} ${game.away.score ?? ''} - ${game.home.score ?? ''} ${game.home.name} · El Play`,
            path: `/juego/${game.gamePk}`
        });

    let content: React.ReactNode;
    if (waitingForNetwork(schedule)) content = <OfflineState />;
    else if (schedule.isPending) content = [0, 1, 2].map((index) => <GameFeedCardSkeleton key={index} />);
    else if (schedule.isError && !schedule.data) content = <ErrorState message={errorText(schedule.error)} onRetry={() => schedule.refetch()} />;
    else if (games.length > 0) content = games.map((game) => <GameFeedCard key={game.gamePk} game={game} onShare={shareGame} />);
    else
        content = (
            <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 32 }}>
                <CalendarX2 size={32} color={colors.faint} />
                <Txt weight="extrabold" center>
                    {team !== null ? t('games.noneForTeam') : t('games.none')}
                </Txt>
                {nextDay ? (
                    <Pressable onPress={() => setSelected(nextDay)} accessibilityRole="button" style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Txt weight="semibold" tone="accentInk" center style={{ flexShrink: 1 }}>
                            {t('games.nextDay', { date: formatLongDate(nextDay, i18n.language) })}
                        </Txt>
                        <ArrowRight size={16} color={colors.accentInk} />
                    </Pressable>
                ) : (
                    <Txt size={14} tone="muted" center>
                        {t('games.noneInRange')}
                    </Txt>
                )}
            </Card>
        );

    return (
        <>
            <Screen padded={false} onRefresh={() => schedule.refetch()}>
                <Row align="flex-start" justify="space-between" gap={12} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Row gap={8}>
                            <Txt size={14} weight="semibold" tone="muted">
                                {capitalize(formatLongDate(day, i18n.language))}
                            </Txt>
                            {pro && <ProBadge />}
                        </Row>
                        <Txt size={32} weight="black" numberOfLines={1} accessibilityRole="header" style={{ marginTop: 2, lineHeight: 36, letterSpacing: -0.5 }}>
                            {day === today ? t('games.todayIn', { league: leagueName }) : leagueName}
                        </Txt>
                    </View>
                    <Pressable
                        onPress={() => setLeagueOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('leagues.choose')}
                        style={({ pressed }) => [{ width: 48, height: 48, borderRadius: radius.tile, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 }, shadow('card')]}
                    >
                        <LogoMark size={30} />
                    </Pressable>
                </Row>

                {schedule.data && <TeamStories allGames={schedule.data.games} dayGames={dayGames} selected={team} onSelect={setTeam} />}
                {days.length > 0 && <DayChips days={days} selected={day} today={today} counts={counts} onSelect={setSelected} />}

                <View style={{ paddingHorizontal: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}>{content}</View>
            </Screen>
            <LeagueSheet open={leagueOpen} onClose={() => setLeagueOpen(false)} />
            {sheet}
        </>
    );
}
