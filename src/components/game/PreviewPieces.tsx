// Previa del juego (lo mismo de la web): la probabilidad de victoria antes de empezar, cómo llegan los dos equipos,
// entre ellos en la temporada, los que vienen calientes (7 días) y las alineaciones cuando se anuncian.
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Flame, Home, Sparkles, Swords, TrendingUp, Users } from 'lucide-react-native';
import type { GameDetail, StandingRow, Standings } from '../../types';
import { usePreview, useStandings } from '../../lib/queries';
import { formatShortDate, seasonLabel } from '../../lib/format';
import { percents, winProbability, type TeamForm } from '../../lib/winProbability';
import { recordOf, useTeamStats, type TeamRow } from '../../lib/teamStats';
import { useColors } from '../../theme/theme';
import { alpha, inkOn, radius, shadow } from '../../theme/tokens';
import { Card, PlayerPhoto, Row, Segmented, Skeleton, TeamLogo, Txt, useReduceMotion } from '../ui';
import { TeamLink, teamTextLink } from '../stats/common';

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

/** La barra partida en los colores de los dos: sale pareja (50-50) y se acomoda; con «Reducir movimiento», quieta */
const WinBar: React.FC<{ away: number; awayColor: string; homeColor: string }> = ({ away, awayColor, homeColor }) => {
    const colors = useColors();
    const reduce = useReduceMotion();
    const share = useSharedValue(reduce ? away : 50);
    useEffect(() => {
        share.set(reduce ? away : withDelay(120, withTiming(away, { duration: 700, easing: Easing.out(Easing.ease) })));
    }, [away, reduce, share]);
    const width = useAnimatedStyle(() => ({ width: `${share.get()}%` }));
    return (
        <View style={{ marginTop: 16, flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.raised }}>
            <Animated.View style={[{ height: '100%', backgroundColor: awayColor }, width]} />
            <View style={{ width: 3, backgroundColor: colors.surface }} />
            <View style={{ flex: 1, backgroundColor: homeColor }} />
        </View>
    );
};

// Probabilidad de victoria antes del juego (lib/winProbability.ts): los dos equipos frente a frente con su porcentaje,
// la barra partida en sus colores (sale de 50-50 y se acomoda), el favorito y por qué (récord, carreras, EFE y AVG).
export const WinProbabilityCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { width } = useWindowDimensions();
    const roomy = width >= 360;
    const stats = useTeamStats(game.league);
    const rows = stats.data?.teams ?? [];
    const homeRow = rows.find((row) => row.id === game.home.id);
    const awayRow = rows.find((row) => row.id === game.away.id);
    const previous = !!stats.data?.isPreviousSeason;
    // Con los números de la temporada pasada (antes del primer juego) pesa todavía menos
    const probability = winProbability(formOf(homeRow, game.home), formOf(awayRow, game.away), { homeEra: game.probables.home?.era, awayEra: game.probables.away?.era }, previous ? 40 : 20);
    const pct = percents(probability);
    // Con 52-48 o menos no hay favorito: «Parejo»
    const favorite = Math.abs(pct.home - pct.away) <= 4 ? null : pct.home > pct.away ? game.home : game.away;

    if (stats.isPending && !stats.data) return <Skeleton height={244} />;

    const sides = [
        { side: 'away' as const, team: game.away, value: pct.away },
        { side: 'home' as const, team: game.home, value: pct.home }
    ];
    const recordText = (row: TeamRow | undefined, team: GameDetail['home']) => {
        if (row?.pitching) return `${row.pitching.w}-${row.pitching.l}`;
        return team.record ? `${team.record.wins}-${team.record.losses}` : '—';
    };
    const diffOf = (row: TeamRow | undefined) => (row ? recordOf(row).diff : null);
    const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
    const num = (text: string | undefined) => (text && Number.isFinite(parseFloat(text)) ? parseFloat(text) : null);
    // Comparación rápida: el mejor de cada fila en negrita
    const lines: { key: string; label: string; away: string; home: string; better: 'away' | 'home' | null }[] = [];
    const better = (a: number | null, h: number | null, lowerIsBetter = false) => (a === null || h === null || a === h ? null : (lowerIsBetter ? a < h : a > h) ? 'away' : 'home');
    const winPctOf = (row: TeamRow | undefined, team: GameDetail['home']) => {
        const w = row?.pitching ? row.pitching.w : team.record?.wins ?? 0;
        const l = row?.pitching ? row.pitching.l : team.record?.losses ?? 0;
        return w + l ? w / (w + l) : null;
    };
    lines.push({ key: 'record', label: t('winProb.record'), away: recordText(awayRow, game.away), home: recordText(homeRow, game.home), better: better(winPctOf(awayRow, game.away), winPctOf(homeRow, game.home)) });
    const awayDiff = diffOf(awayRow);
    const homeDiff = diffOf(homeRow);
    if (awayDiff !== null && homeDiff !== null) lines.push({ key: 'diff', label: t('winProb.diff'), away: signed(awayDiff), home: signed(homeDiff), better: better(awayDiff, homeDiff) });
    if (awayRow?.pitching && homeRow?.pitching) lines.push({ key: 'era', label: t('winProb.era'), away: awayRow.pitching.era, home: homeRow.pitching.era, better: better(num(awayRow.pitching.era), num(homeRow.pitching.era), true) });
    if (awayRow?.hitting && homeRow?.hitting) lines.push({ key: 'avg', label: t('winProb.avg'), away: awayRow.hitting.avg, home: homeRow.hitting.avg, better: better(num(awayRow.hitting.avg), num(homeRow.hitting.avg)) });
    const ring = roomy ? 56 : 48;

    return (
        <Card>
            <Row justify="space-between" gap={8}>
                <Txt eyebrow accessibilityRole="header" style={{ flexShrink: 1 }}>
                    {t('winProb.title')}
                </Txt>
                {favorite ? (
                    <TeamLink id={favorite.id} name={favorite.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, borderRadius: radius.pill, backgroundColor: favorite.color, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Sparkles size={12} color={inkOn(favorite.color)} />
                        <Txt size={11} weight="extrabold" color={inkOn(favorite.color)}>
                            {t('winProb.favorite', { team: favorite.abbrev })}
                        </Txt>
                    </TeamLink>
                ) : (
                    <View style={{ borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Txt size={11} weight="extrabold" tone="muted">
                            {t('winProb.even')}
                        </Txt>
                    </View>
                )}
            </Row>

            <View
                style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                accessible
                accessibilityRole="image"
                accessibilityLabel={t('winProb.aria', { away: game.away.name, a: pct.away, home: game.home.name, h: pct.home })}
            >
                {sides.map(({ side, team, value }, index) => (
                    <React.Fragment key={side}>
                        {/* El «vs» del medio se ve desde 360 de ancho */}
                        {index === 1 && (
                            <Txt size={12} weight="extrabold" tone="faint" style={{ width: roomy ? undefined : 4, textTransform: 'uppercase' }}>
                                {roomy ? 'vs' : ''}
                            </Txt>
                        )}
                        <View style={{ flex: 1, minWidth: 0, flexDirection: side === 'home' ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}>
                            <TeamLink id={team.id} name={team.name} style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: 3, borderColor: team.color, backgroundColor: alpha(team.color, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                                <TeamLogo team={team} size={36} />
                                {side === 'home' && (
                                    <View
                                        style={[{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, shadow('card')]}
                                        accessibilityLabel={t('winProb.home')}
                                    >
                                        <Home size={12} color={colors.muted} />
                                    </View>
                                )}
                            </TeamLink>
                            <View style={{ minWidth: 0, flexShrink: 1, alignItems: side === 'home' ? 'flex-end' : 'flex-start' }}>
                                <Txt size={roomy ? 34 : 28} weight="extrabold" tabular style={{ lineHeight: roomy ? 36 : 30 }}>
                                    {value}
                                    <Txt size={18} weight="extrabold">
                                        %
                                    </Txt>
                                </Txt>
                                <Txt size={12} weight="bold" tone="muted" numberOfLines={1} {...teamTextLink(team.id)}>
                                    {team.abbrev}
                                </Txt>
                            </View>
                        </View>
                    </React.Fragment>
                ))}
            </View>

            <WinBar away={pct.away} awayColor={game.away.color} homeColor={game.home.color} />

            {lines.length > 0 && (
                <View style={{ marginTop: 16, borderRadius: radius.tile, backgroundColor: alpha(colors.raised, 0.6) }}>
                    {lines.map((line, index) => (
                        <View key={line.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                            <Txt size={14} tabular weight={line.better === 'away' ? 'extrabold' : 'regular'} tone={line.better === 'away' ? 'ink' : 'muted'} style={{ flex: 1 }}>
                                {line.away}
                            </Txt>
                            <Txt size={11} weight="semibold" tone="muted" center style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {line.label}
                            </Txt>
                            <Txt size={14} tabular weight={line.better === 'home' ? 'extrabold' : 'regular'} tone={line.better === 'home' ? 'ink' : 'muted'} style={{ flex: 1, textAlign: 'right' }}>
                                {line.home}
                            </Txt>
                        </View>
                    ))}
                </View>
            )}

            <Txt size={11} tone="faint" style={{ marginTop: 12, lineHeight: 15 }}>
                {t(probability.starters ? 'winProb.noteStarters' : 'winProb.note')}
                {previous ? ` ${t('winProb.previous')}` : probability.early ? ` ${t('winProb.early')}` : ''}
            </Txt>
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
                    <TeamLink key={side} id={game[side].id} name={game[side].name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', width: '28%' }}>
                        <TeamLogo team={game[side]} size={20} />
                        <Txt size={14} weight="extrabold">
                            {game[side].abbrev}
                        </Txt>
                    </TeamLink>
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
                            <TeamLink id={game.away.id} name={game.away.name}>
                                <TeamLogo team={game.away} size={32} />
                            </TeamLink>
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
                            <TeamLink id={game.home.id} name={game.home.name}>
                                <TeamLogo team={game.home} size={32} />
                            </TeamLink>
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
                                            <Text {...teamTextLink(away.id)}>{away.abbrev}</Text> {meeting.away.runs}
                                        </Txt>
                                        <Txt size={14} tone="faint">
                                            {'  ·  '}
                                        </Txt>
                                        <Txt size={14} weight={meeting.winnerId === home.id ? 'extrabold' : 'regular'} tone={meeting.winnerId === home.id ? 'ink' : 'muted'}>
                                            <Text {...teamTextLink(home.id)}>{home.abbrev}</Text> {meeting.home.runs}
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
                    <TeamLink id={team.id} name={team.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
                        <TeamLogo team={team} size={18} />
                        <Txt size={12} weight="extrabold">
                            {team.abbrev}
                        </Txt>
                    </TeamLink>
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
                <Txt size={14} tone="muted" {...teamTextLink(game[side].id)}>
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
