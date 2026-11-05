import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarClock, GitCompare, Radio, Share2, Star } from 'lucide-react-native';
import { useLeague } from '../../state/league';
import { usePreferences } from '../../state/preferences';
import { useStandings } from '../../lib/queries';
import { usePlayers } from '../../lib/stats';
import { recordOf, useTeamStats } from '../../lib/teamStats';
import { nextGame, standingOf, summarize, teamResults, useTeamGames, type Split } from '../../lib/team';
import { pythagorean } from '../../lib/advanced';
import { seasonLabel } from '../../lib/format';
import { teamDisplayName } from '../../lib/teams';
import { useColors } from '../../theme/theme';
import { inkOn, radius, shadow } from '../../theme/tokens';
import { ErrorState, OfflineState, Skeleton, Txt, useErrorText } from '../../components/ui';
import { ActionDial } from '../../components/ActionDial';
import { GameFeedCard } from '../../components/feed/GameFeedCard';
import { TeamCompareSheet } from '../../components/compare/CompareSheet';
import { useNow } from '../../components/feed/useNow';
import { FormCard, Results, Roster, SplitsGrid, StatBlock, TeamHero, TeamLeaders, TeamMoves, Trajectory, Upcoming, VersusList, ordinal, type TeamLook } from '../../components/team/TeamSections';
import { shareLink, waitingForNetwork } from '../../components/stats/common';

// Página de un equipo (pantalla completa encima de la que se está viendo; la web es pages/TeamPage.tsx): su récord y
// puesto, el juego de hoy (o el próximo), la forma, en casa y de visita, contra cada rival, bateo y pitcheo con su
// puesto en la liga, sus líderes, la plantilla, los resultados, el calendario y sus movimientos. El botón flotante:
// comparar con otro equipo, compartir, hacerlo «mi equipo» y su próximo juego. Parámetro: id del equipo.

/** «8-4»: de sus juegos ({ w, l }) o de las posiciones ({ wins, losses }) */
const splitText = (split: Split | { wins: number; losses: number } | null | undefined) => (!split ? '—' : 'w' in split ? `${split.w}-${split.l}` : `${split.wins}-${split.losses}`);

/** Vuelve a donde se estaba (o a Posiciones si se entró por un enlace) */
const goBack = () => (router.canGoBack() ? router.back() : router.replace('/posiciones'));

export default function EquipoScreen() {
    const params = useLocalSearchParams<{ id: string }>();
    const teamId = Number(params.id) || null;
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const errorText = useErrorText();
    const { activeLeague } = useLeague();
    const { favoriteTeamId, toggleFavoriteTeam } = usePreferences();
    const teamStats = useTeamStats(activeLeague);
    const standings = useStandings(activeLeague);
    const gamesQuery = useTeamGames(activeLeague, teamId);
    const players = usePlayers(activeLeague);
    const [comparing, setComparing] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    // La hora de ahora (cada minuto): cuál es el próximo juego y cuáles faltan
    const now = useNow(60000);

    const games = useMemo(() => gamesQuery.data?.games ?? [], [gamesQuery.data]);
    const results = useMemo(() => (teamId ? teamResults(games, teamId) : []), [games, teamId]);
    const summary = useMemo(() => summarize(results), [results]);
    const rows = teamStats.data?.teams ?? [];
    const row = rows.find((item) => item.id === teamId) ?? null;
    const standing = teamId ? standingOf(standings.data, teamId) : null;
    // Quién es: de las estadísticas, de las posiciones o de sus juegos (lo que llegue primero)
    const fromGames = games.map((game) => (game.home.id === teamId ? game.home : game.away.id === teamId ? game.away : null)).find(Boolean) ?? null;
    const team: TeamLook | null = row ?? standing?.row.team ?? fromGames;
    const upcoming = nextGame(games, now);

    // Sin equipo todavía: la flecha para volver y lo que toque (cargando, sin internet o el error)
    if (!team) {
        const offline = waitingForNetwork(teamStats) && waitingForNetwork(gamesQuery);
        const pending = !!teamId && (teamStats.isPending || gamesQuery.isPending || standings.isPending);
        return (
            <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12, paddingHorizontal: 16, gap: 12 }}>
                <Pressable
                    onPress={goBack}
                    accessibilityRole="button"
                    accessibilityLabel={t('team.back')}
                    style={[{ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, shadow('card')]}
                >
                    <ArrowLeft size={20} color={colors.ink} />
                </Pressable>
                {offline ? (
                    <OfflineState />
                ) : pending ? (
                    <View style={{ gap: 12 }}>
                        <Skeleton height={224} round={28} />
                        <Skeleton height={128} />
                        <Skeleton height={256} />
                    </View>
                ) : (
                    <ErrorState message={teamId ? errorText(gamesQuery.error ?? teamStats.error ?? { code: 'not_found' }) : t('errors.not_found')} onRetry={teamId ? () => gamesQuery.refetch() : undefined} />
                )}
            </View>
        );
    }

    const name = teamDisplayName(team, i18n.language);
    const color = team.color || '#2563eb';
    const ink = inkOn(color);
    const favorite = favoriteTeamId === team.id;
    const record = row ? recordOf(row) : null;
    const w = standing?.row.wins ?? record?.w ?? summary.w;
    const l = standing?.row.losses ?? record?.l ?? summary.l;
    const scored = standing?.row.runsScored ?? record?.scored ?? summary.rs;
    const allowed = standing?.row.runsAllowed ?? record?.allowed ?? summary.ra;
    const diff = scored !== null && allowed !== null ? scored - allowed : null;
    const expected = scored !== null && allowed !== null ? pythagorean(scored, allowed, w + l) : null;
    const season = gamesQuery.data?.season ?? teamStats.data?.season;
    const rankLine = standing
        ? [
              t('team.rank', { rank: ordinal(standing.row.rank, i18n.language), total: standing.total }),
              standing.phase ? t(`standings.${standing.phase}`) : null,
              standing.row.gamesBack && standing.row.gamesBack !== '-' ? t('team.gamesBack', { gb: standing.row.gamesBack }) : null
          ]
              .filter(Boolean)
              .join(' · ')
        : null;
    // Sin sus juegos (todavía no llegan o la ruta falló) la racha y los últimos 10 salen de las posiciones («W3»)
    const standingStreak = /^([WL])(\d+)$/.exec(standing?.row.streak ?? '');
    const streak = summary.streak ?? (standingStreak ? { won: standingStreak[1] === 'W', n: Number(standingStreak[2]) } : null);
    const lastTen = summary.last10.length
        ? { w: summary.last10.filter((result) => result.won).length, l: summary.last10.filter((result) => !result.won).length }
        : standing?.row.lastTen
          ? { w: standing.row.lastTen.wins, l: standing.row.lastTen.losses }
          : null;
    const chips = [
        streak ? t(streak.won ? 'team.streakWon' : 'team.streakLost', { count: streak.n }) : null,
        lastTen ? t('team.lastTen', lastTen) : null,
        diff !== null ? t('team.diff', { diff: diff > 0 ? `+${diff}` : diff }) : null
    ].filter((chip): chip is string => !!chip);

    const refresh = async () => {
        setRefreshing(true);
        await Promise.all([gamesQuery.refetch(), teamStats.refetch(), standings.refetch(), players.refetch()]).catch(() => undefined);
        setRefreshing(false);
    };

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: insets.bottom + 112, gap: 20 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={color} colors={[color]} progressViewOffset={insets.top} />}
            >
                <TeamHero
                    team={team}
                    ink={ink}
                    topInset={insets.top}
                    seasonText={season ? t('common.season', { season: seasonLabel(season, activeLeague) }) : null}
                    record={{ w, l, pct: standing?.row.pct ?? null }}
                    rankLine={rankLine}
                    chips={chips}
                    favorite={favorite}
                    onBack={goBack}
                />

                <View style={{ paddingHorizontal: 16, gap: 20, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
                    {/* El juego de hoy o el próximo */}
                    {upcoming && (
                        <View style={{ gap: 8 }}>
                            <Txt eyebrow accessibilityRole="header">
                                {upcoming.state === 'live' ? t('team.playingNow') : t('team.nextGame')}
                            </Txt>
                            <GameFeedCard game={upcoming} />
                        </View>
                    )}

                    {gamesQuery.isPending ? (
                        <View style={{ gap: 12 }}>
                            <Skeleton height={112} />
                            <Skeleton height={160} />
                        </View>
                    ) : (
                        <>
                            {results.length > 0 && <FormCard summary={summary} />}
                            <Trajectory league={activeLeague} teamId={team.id} color={color} />
                            <SplitsGrid
                                items={[
                                    [t('team.home'), standing?.row.home ? splitText(standing.row.home) : splitText(summary.home)],
                                    [t('team.away'), standing?.row.away ? splitText(standing.row.away) : splitText(summary.away)],
                                    [t('team.oneRun'), standing?.row.oneRun ? splitText(standing.row.oneRun) : splitText(summary.oneRun)],
                                    [t('team.extra'), splitText(standing?.row.extraInning)],
                                    [t('team.runs'), scored !== null && allowed !== null ? `${scored}-${allowed}` : '—'],
                                    [t('team.expected'), expected ? `${expected.wins}-${expected.losses}` : '—']
                                ]}
                            />
                            {results.length > 0 && <VersusList results={results} />}
                        </>
                    )}

                    {row && rows.length > 0 && (
                        <>
                            <StatBlock group="bat" team={row} teams={rows} />
                            <StatBlock group="pitch" team={row} teams={rows} />
                        </>
                    )}

                    {players.data && <TeamLeaders team={team} players={players.data} />}
                    {players.data && <Roster team={team} players={players.data} />}
                    {results.length > 0 && <Results results={results} />}
                    <Upcoming games={games} teamId={team.id} skip={upcoming?.gamePk ?? null} now={now} />
                    <TeamMoves league={activeLeague} teamId={team.id} />
                </View>
            </ScrollView>

            <ActionDial
                label={t('dial.teamMenu', { team: name })}
                color={color}
                actions={[
                    { key: 'compare', label: t('dial.compare'), icon: GitCompare, disabled: !row || rows.length < 2, onSelect: () => setComparing(true) },
                    { key: 'share', label: t('dial.share'), icon: Share2, onSelect: () => shareLink(`/equipo/${team.id}`, name, t('team.shareText', { team: name })) },
                    { key: 'favorite', label: favorite ? t('dial.isMyTeam') : t('dial.myTeam'), icon: Star, active: favorite, onSelect: () => toggleFavoriteTeam(team.id) },
                    {
                        key: 'next',
                        label: upcoming?.state === 'live' ? t('dial.live') : t('dial.nextGame'),
                        icon: upcoming?.state === 'live' ? Radio : CalendarClock,
                        disabled: !upcoming,
                        onSelect: () => upcoming && router.push({ pathname: '/juego/[gamePk]', params: { gamePk: upcoming.gamePk } })
                    }
                ]}
            />

            {row && <TeamCompareSheet open={comparing} team={row} teams={rows} standings={standings.data} results={gamesQuery.isSuccess ? results : null} games={games} onClose={() => setComparing(false)} />}
        </View>
    );
}
