// En vivo: el marcador de cada juego donde tienes peloteros (se relee cada 20 s con el día) y tu puesto en la tabla
// del día con el de arriba, con flechas cuando cambia entre lecturas (las filas se deslizan a su lugar).
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { LeagueId } from '../../../types';
import { inningName } from '../../../lib/baseball';
import type { DayEntry, FantasyDay, FantasyGame } from '../../../lib/fantasy';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { useFanLabel } from '../../fantasy/FanSearch';
import { LiveDot, ModuleHeader, Odometer, teamInk, useReorder } from '../kit';
import { MoveMark, Num, fmtPts, ordinal } from './bits';
import { useDayRivals } from './data';
import { dayRanking } from './logic';

/** Puestos ganados o perdidos de cada fanático desde la lectura anterior (no al montar). Estado derivado del render */
export const useRankMoves = (rows: { userId: string; rank: number }[]) => {
    const sig = rows.map((row) => `${row.userId}:${row.rank}`).join(',');
    const [track, setTrack] = useState<{ sig: string; ranks: Map<string, number>; moves: Map<string, number> }>(() => ({ sig, ranks: new Map(rows.map((row) => [row.userId, row.rank])), moves: new Map() }));
    if (track.sig !== sig) {
        const moves = new Map<string, number>();
        for (const row of rows) {
            const before = track.ranks.get(row.userId);
            if (before !== undefined && before !== row.rank) moves.set(row.userId, before - row.rank);
        }
        setTrack({ sig, ranks: new Map(rows.map((row) => [row.userId, row.rank])), moves: track.ranks.size ? moves : new Map() });
    }
    return track.moves;
};

/** Marcador de dos colores con el odómetro (el de En vivo y el de la repetición) */
export const ScoreStrip: React.FC<{ game: FantasyGame; away: number; home: number; status: string; label: string }> = ({ game, away, home, status, label }) => (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ gap: 6 }}>
        <View style={{ height: 48, flexDirection: 'row', overflow: 'hidden', borderRadius: radius.tile }}>
            {(['away', 'home'] as const).map((side) => {
                const team = game[side];
                const ink = teamInk(team.color);
                return (
                    <View key={side} style={{ flex: 1, flexDirection: side === 'home' ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: team.color }}>
                        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
                            <TeamLogo team={team} size={22} />
                        </View>
                        <Txt size={14} weight="extrabold" color={ink}>
                            {team.abbrev}
                        </Txt>
                        <View style={{ flex: 1, alignItems: side === 'home' ? 'flex-start' : 'flex-end' }}>
                            <Odometer value={side === 'away' ? away : home} size={28} color={ink} />
                        </View>
                    </View>
                );
            })}
        </View>
        <Txt size={11} weight="bold" tone="muted" center>
            {status}
        </Txt>
    </View>
);

interface LiveNowProps {
    league: LeagueId;
    day: FantasyDay;
    entry: DayEntry;
    userId: string;
}

export const LiveNow: React.FC<LiveNowProps> = ({ league, day, entry, userId }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const fanLabel = useFanLabel();
    const reorder = useReorder();
    const mine = new Set(entry.lineup.map((id) => day.players.find((player) => player.id === id)?.gamePk).filter(Boolean));
    const live = day.games.filter((game) => game.state === 'live' && mine.has(game.gamePk));
    const started = day.games.some((game) => game.state !== 'preview');
    const rivals = useDayRivals(league, day.date, undefined, live.length > 0, started && entry.lineup.length > 0);
    const rows = useMemo(() => (rivals.data ? dayRanking(day, rivals.data) : []), [day, rivals.data]);
    const moves = useRankMoves(rows);
    const index = rows.findIndex((row) => row.userId === userId);
    const shown = index < 0 ? [] : index === 0 ? rows.slice(0, 2) : rows.slice(index - 1, index + 1);

    if (!live.length && !(started && shown.length)) return null;
    const inningOf = (game: FantasyGame) => inningName(game.live ? { n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState } : null, lang);

    return (
        <View style={[{ gap: 12, borderRadius: radius.card, backgroundColor: colors.surface, padding: 14 }, shadow('card')]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {live.length > 0 && <LiveDot tone="live" pulse />}
                <ModuleHeader title={live.length ? t('pro.fantasy.live.title') : t('pro.fantasy.live.titleDay')} aside={live.length ? t('pro.fantasy.live.every') : undefined} style={{ flex: 1 }} />
            </View>
            {live.map((game) => (
                <ScoreStrip
                    key={game.gamePk}
                    game={game}
                    away={game.away.score ?? 0}
                    home={game.home.score ?? 0}
                    label={t('pro.fantasy.live.scoreLabel', { away: game.away.name, awayRuns: game.away.score ?? 0, home: game.home.name, homeRuns: game.home.score ?? 0, inning: inningOf(game) })}
                    status={t('pro.fantasy.live.status', { away: game.away.abbrev, home: game.home.abbrev, inning: inningOf(game), count: game.live?.outs ?? 0 })}
                />
            ))}
            {shown.length > 0 && (
                <View style={{ gap: 6 }}>
                    <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
                        {t('pro.fantasy.live.dayRank')}
                    </Txt>
                    <View style={{ gap: 4 }}>
                        {shown.map((row) => {
                            const own = row.userId === userId;
                            return (
                                <Animated.View
                                    key={row.userId}
                                    layout={reorder}
                                    accessible
                                    accessibilityLabel={`${ordinal(row.rank, lang)}, ${fanLabel(row.name, own)}, ${fmtPts(row.points)} ${t('pro.fantasy.pts')}`}
                                    style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.tile, paddingHorizontal: 10, backgroundColor: own ? alpha(colors.accent, 0.12) : colors.raised, borderLeftWidth: own ? 3 : 0, borderLeftColor: '#6d28d9' }}
                                >
                                    <Txt size={12} weight="bold" tabular style={{ width: 40 }}>
                                        {ordinal(row.rank, lang)}
                                    </Txt>
                                    <MoveMark move={moves.get(row.userId) ?? 0} />
                                    <Txt size={13} weight={own ? 'extrabold' : 'semibold'} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                        {fanLabel(row.name, own)}
                                    </Txt>
                                    <Num size={16} style={{ width: 60, textAlign: 'right' }}>
                                        {fmtPts(row.points)}
                                    </Num>
                                </Animated.View>
                            );
                        })}
                    </View>
                </View>
            )}
        </View>
    );
};
