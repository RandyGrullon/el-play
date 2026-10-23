// Previa del juego (lo mismo de la web): la probabilidad de victoria antes de empezar, cómo llegan los dos equipos,
// entre ellos en la temporada, los que vienen calientes (7 días) y las alineaciones cuando se anuncian.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Flame, Sparkles, Swords, TrendingUp, Users } from 'lucide-react-native';
import type { GameDetail, StandingRow, Standings } from '../../types';
import { usePreview, useStandings } from '../../lib/queries';
import { formatShortDate, seasonLabel } from '../../lib/format';
import { percents, winProbability, type TeamForm } from '../../lib/winProbability';
import { recordOf, useTeamStats, type TeamRow } from '../../lib/teamStats';
import { useColors } from '../../theme/theme';
import { alpha, inkOn, radius } from '../../theme/tokens';
import { Card, PlayerPhoto, Row, Segmented, TeamLogo, Txt } from '../ui';

const Heading: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
    <Row gap={6} style={{ marginBottom: 10 }}>
        {icon}
        <Txt eyebrow accessibilityRole="header">
            {children}
        </Txt>
    </Row>
);

// ---------------------------------------------------------------- probabilidad antes del juego

const formOf = (team: TeamRow | undefined, fallback: GameDetail['home']): TeamForm => {
    if (team?.pitching) {
        const record = recordOf(team);
        return { w: record.w, l: record.l, scored: record.scored, allowed: record.allowed };
    }
    return { w: fallback.record?.wins ?? 0, l: fallback.record?.losses ?? 0, scored: null, allowed: null };
};

export const WinProbabilityCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const stats = useTeamStats(game.league);
    if (!stats.data) return null;
    const rows = stats.data.teams;
    const probability = winProbability(formOf(rows.find((row) => row.id === game.home.id), game.home), formOf(rows.find((row) => row.id === game.away.id), game.away), { homeEra: game.probables.home?.era, awayEra: game.probables.away?.era }, stats.data.isPreviousSeason ? 40 : 20);
    const pct = percents(probability);
    const favorite = Math.abs(pct.home - pct.away) <= 4 ? null : pct.home > pct.away ? game.home : game.away;
    return (
        <Card style={{ gap: 12 }}>
            <Row justify="space-between">
                <Txt eyebrow accessibilityRole="header">
                    {t('winProb.title')}
                </Txt>
                {favorite ? (
                    <Row gap={4} style={{ borderRadius: radius.pill, backgroundColor: favorite.color, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Sparkles size={12} color={inkOn(favorite.color)} />
                        <Txt size={11} weight="extrabold" color={inkOn(favorite.color)}>
                            {t('winProb.favorite', { team: favorite.abbrev })}
                        </Txt>
                    </Row>
                ) : (
                    <View style={{ borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Txt size={11} weight="extrabold" tone="muted">
                            {t('winProb.even')}
                        </Txt>
                    </View>
                )}
            </Row>
            <Row justify="space-between">
                {(['away', 'home'] as const).map((side) => (
                    <Row key={side} gap={8} style={{ flexDirection: side === 'home' ? 'row-reverse' : 'row' }}>
                        <TeamLogo team={game[side]} size={32} />
                        <Txt size={30} weight="extrabold" tabular>
                            {pct[side]}%
                        </Txt>
                    </Row>
                ))}
            </Row>
            <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' }} accessibilityLabel={`${game.away.abbrev} ${pct.away}% · ${game.home.abbrev} ${pct.home}%`}>
                <View style={{ flex: pct.away, backgroundColor: game.away.color }} />
                <View style={{ width: 2, backgroundColor: colors.surface }} />
                <View style={{ flex: pct.home, backgroundColor: game.home.color }} />
            </View>
        </Card>
    );
};

// ---------------------------------------------------------------- cómo llegan

const rowOf = (standings: Standings | undefined, teamId: number): StandingRow | null => {
    if (!standings) return null;
    const lists: StandingRow[][] =
        standings.type === 'lidom' ? [standings[standings.activePhase], standings.regular, standings.roundRobin, standings.final] : standings.type === 'wbc' ? Object.values(standings.pools) : [standings.teams];
    for (const list of lists) {
        const row = list?.find((item) => item.team.id === teamId);
        if (row) return row;
    }
    return null;
};

export const TeamFormCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const standings = useStandings(game.league);
    const away = rowOf(standings.data, game.away.id);
    const home = rowOf(standings.data, game.home.id);
    if (!away || !home) return null;
    const es = !i18n.language.startsWith('en');
    const streak = (code: string) => (code && code !== '-' ? (es ? code.replace(/^W/, 'G').replace(/^L/, 'P') : code) : '—');
    const record = (value: { wins: number; losses: number } | null | undefined) => (value ? `${value.wins}-${value.losses}` : '—');
    const diff = (row: StandingRow) => (row.runsScored != null && row.runsAllowed != null ? row.runsScored - row.runsAllowed : null);
    const signed = (n: number | null) => (n === null ? '—' : n > 0 ? `+${n}` : String(n));
    const lines = [
        { key: 'record', label: t('previewMore.record'), away: record(away), home: record(home) },
        { key: 'streak', label: t('previewMore.streak'), away: streak(away.streak), home: streak(home.streak) },
        { key: 'lastTen', label: t('previewMore.lastTen'), away: record(away.lastTen), home: record(home.lastTen) },
        { key: 'where', label: `${t('previewMore.awayRecord')} / ${t('previewMore.homeRecord')}`, away: record(away.away), home: record(home.home) },
        { key: 'diff', label: t('previewMore.diff'), away: signed(diff(away)), home: signed(diff(home)) }
    ].filter((line) => line.away !== '—' || line.home !== '—');
    return (
        <Card>
            <Heading icon={<TrendingUp size={14} color={colors.muted} />}>{t('previewMore.form')}</Heading>
            <Row style={{ paddingBottom: 6 }}>
                <View style={{ flex: 1 }} />
                {(['away', 'home'] as const).map((side) => (
                    <Row key={side} gap={6} justify="center" style={{ width: '28%' }}>
                        <TeamLogo team={game[side]} size={20} />
                        <Txt size={14} weight="extrabold">
                            {game[side].abbrev}
                        </Txt>
                    </Row>
                ))}
            </Row>
            {lines.map((line) => (
                <Row key={line.key} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 8 }}>
                    <Txt size={14} weight="semibold" tone="muted" style={{ flex: 1 }}>
                        {line.label}
                    </Txt>
                    <Txt size={14} weight="bold" tabular center style={{ width: '28%' }}>
                        {line.away}
                    </Txt>
                    <Txt size={14} weight="bold" tabular center style={{ width: '28%' }}>
                        {line.home}
                    </Txt>
                </Row>
            ))}
        </Card>
    );
};

// ---------------------------------------------------------------- entre ellos

export const HeadToHeadCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const preview = usePreview(game.league, game.away.id, game.home.id);
    const h2h = preview.data?.headToHead;
    if (!h2h) return null;
    const teamOf = (id: number) => (id === game.away.id ? game.away : game.home);
    return (
        <Card>
            <Heading icon={<Swords size={14} color={colors.muted} />}>{t('previewMore.h2h', { season: preview.data ? seasonLabel(preview.data.season, game.league) : '' })}</Heading>
            {h2h.games.length === 0 ? (
                <Txt size={14} tone="muted">
                    {t('previewMore.h2hNone')}
                </Txt>
            ) : (
                <>
                    <Row gap={16} justify="center">
                        <Row gap={8}>
                            <TeamLogo team={game.away} size={32} />
                            <Txt size={34} weight="extrabold" tabular>
                                {h2h.wins[game.away.id] ?? 0}
                            </Txt>
                        </Row>
                        <Txt size={20} weight="bold" tone="faint">
                            –
                        </Txt>
                        <Row gap={8}>
                            <Txt size={34} weight="extrabold" tabular>
                                {h2h.wins[game.home.id] ?? 0}
                            </Txt>
                            <TeamLogo team={game.home} size={32} />
                        </Row>
                    </Row>
                    <Txt size={12} weight="semibold" tone="muted" center style={{ marginTop: 4 }}>
                        {t('previewMore.h2hRuns', { away: game.away.abbrev, awayRuns: h2h.runs[game.away.id] ?? 0, home: game.home.abbrev, homeRuns: h2h.runs[game.home.id] ?? 0 })}
                    </Txt>
                    <View style={{ marginTop: 10 }}>
                        {h2h.games.slice(0, 5).map((meeting) => {
                            const away = teamOf(meeting.away.id);
                            const home = teamOf(meeting.home.id);
                            return (
                                <Pressable key={meeting.gamePk} onPress={() => router.push(`/juego/${meeting.gamePk}`)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 8 }}>
                                    <Txt size={12} weight="semibold" tone="muted" style={{ width: 84 }}>
                                        {meeting.date ? formatShortDate(meeting.date, i18n.language) : ''}
                                    </Txt>
                                    <Txt size={14} tabular style={{ flex: 1 }}>
                                        <Txt size={14} weight={meeting.winnerId === away.id ? 'extrabold' : 'regular'} tone={meeting.winnerId === away.id ? 'ink' : 'muted'}>
                                            {away.abbrev} {meeting.away.runs}
                                        </Txt>
                                        <Txt size={14} tone="faint">
                                            {'  ·  '}
                                        </Txt>
                                        <Txt size={14} weight={meeting.winnerId === home.id ? 'extrabold' : 'regular'} tone={meeting.winnerId === home.id ? 'ink' : 'muted'}>
                                            {home.abbrev} {meeting.home.runs}
                                        </Txt>
                                    </Txt>
                                    {meeting.winnerId && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: teamOf(meeting.winnerId).color }} />}
                                </Pressable>
                            );
                        })}
                    </View>
                </>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------- los que vienen calientes

export const HotPlayersCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const preview = usePreview(game.league, game.away.id, game.home.id);
    const hot = preview.data?.hot;
    const sides = (['away', 'home'] as const).map((side) => ({ side, team: game[side], players: hot?.teams[game[side].id] ?? [] })).filter((item) => item.players.length);
    if (!hot || !sides.length) return null;
    return (
        <Card style={{ gap: 12 }}>
            <Heading icon={<Flame size={14} color={colors.muted} />}>{t('previewMore.hot')}</Heading>
            {sides.map(({ side, team, players }) => (
                <View key={side} style={{ gap: 8 }}>
                    <Row gap={6}>
                        <TeamLogo team={team} size={18} />
                        <Txt size={12} weight="extrabold">
                            {team.abbrev}
                        </Txt>
                    </Row>
                    {players.map((player) => (
                        <Pressable key={player.id} onPress={() => router.push(`/jugador/${player.id}`)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <PlayerPhoto personId={player.id} name={player.name} size={40} background={alpha(team.color, 0.13)} team={team} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt weight="bold" numberOfLines={1}>
                                    {player.name}
                                </Txt>
                                <Txt size={12} tone="muted">
                                    {[t('previewMore.hits', { h: player.h, ab: player.ab }), player.hr ? t('previewMore.hr', { count: player.hr }) : null, player.rbi ? t('previewMore.rbi', { count: player.rbi }) : null].filter(Boolean).join(' · ')}
                                </Txt>
                            </View>
                            <View style={{ alignItems: 'flex-end', borderRadius: 8, backgroundColor: colors.raised, paddingHorizontal: 8, paddingVertical: 4 }}>
                                <Txt size={10} weight="bold" tone="faint">
                                    OPS
                                </Txt>
                                <Txt size={16} weight="extrabold" tabular>
                                    {player.ops}
                                </Txt>
                            </View>
                        </Pressable>
                    ))}
                </View>
            ))}
            <Txt size={11} tone="faint">
                {t('previewMore.hotNote')}
            </Txt>
        </Card>
    );
};

// ---------------------------------------------------------------- alineaciones

export const LineupsCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [side, setSide] = useState<'away' | 'home'>('away');
    const lineups = game.lineups;
    const list = lineups?.[side] ?? [];
    return (
        <Card>
            <Row justify="space-between" style={{ marginBottom: 10 }}>
                <Row gap={6}>
                    <Users size={14} color={colors.muted} />
                    <Txt eyebrow accessibilityRole="header">
                        {t('previewMore.lineups')}
                    </Txt>
                </Row>
                {lineups && <Segmented small value={side} onChange={setSide} options={(['away', 'home'] as const).map((key) => ({ value: key, label: game[key].abbrev }))} />}
            </Row>
            {!lineups ? (
                <Txt size={14} tone="muted">
                    {t('previewMore.lineupsLater')}
                </Txt>
            ) : list.length === 0 ? (
                <Txt size={14} tone="muted">
                    {t('previewMore.lineupPending', { team: game[side].abbrev })}
                </Txt>
            ) : (
                list.map((player, index) => (
                    <Pressable key={player.id} onPress={() => router.push(`/jugador/${player.id}`)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, paddingVertical: 8 }}>
                        <Txt size={12} weight="extrabold" tone="muted" center style={{ width: 16 }}>
                            {index + 1}
                        </Txt>
                        <Txt size={14} weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                            {player.name}
                            {player.bats ? (
                                <Txt size={12} tone="faint">
                                    {'  '}
                                    {t(`previewMore.bats.${player.bats}`, { defaultValue: player.bats })}
                                </Txt>
                            ) : null}
                        </Txt>
                        <Txt size={12} weight="bold" tone="muted" style={{ width: 28 }}>
                            {player.pos}
                        </Txt>
                        <Txt size={14} tone="muted" tabular style={{ width: 44, textAlign: 'right' }}>
                            {player.avg ?? '—'}
                        </Txt>
                    </Pressable>
                ))
            )}
        </Card>
    );
};
