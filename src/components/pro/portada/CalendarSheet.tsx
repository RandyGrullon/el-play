// Calendario completo de la temporada (de MLB) en una hoja: cada día con sus juegos, el resultado de los terminados
// y la hora de los que faltan. Si hay un equipo filtrado en la portada, solo sus juegos. Abre en el día de hoy.
// Si el servidor todavía no tiene el calendario PRO, sale la semana del calendario del Lite con su nota honesta.
import React, { useMemo, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { LeagueId, ScheduleGame } from '../../../types';
import type { CalendarGame } from '../../../types/pro-liga';
import type { StatsTeam } from '../../../lib/stats';
import { formatLongDate, formatTime, seasonLabel } from '../../../lib/format';
import { useProCalendar } from '../../../lib/pro/liga';
import { isPermanent } from '../../../lib/pro/http';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { ErrorState, Sheet, Skeleton, TeamLogo, Txt, useErrorText } from '../../ui';
import { ProNote, useProColors } from '../kit';
import { toCalendarGame } from './logic';
import { upperFirst } from './shared';

// Una línea del juego: logo, nombre y carreras (si ya se jugó o se está jugando)
const TeamLine: React.FC<{ team?: StatsTeam; side: CalendarGame['away']; showScore: boolean; dim: boolean }> = ({ team, side, showScore, dim }) =>
    team ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TeamLogo team={team} size={20} />
            <Txt size={13} weight="bold" tone={dim ? 'muted' : 'ink'} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                {team.name}
            </Txt>
            {showScore && (
                <Txt condensed size={16} tabular>
                    {String(side.score ?? 0)}
                </Txt>
            )}
        </View>
    ) : null;

interface CalendarSheetProps {
    open: boolean;
    onClose: () => void;
    league: LeagueId;
    team: number | null;
    today: string;
    timeZone: string;
    /** Juegos del calendario del Lite (respaldo mientras el servidor no tenga el de la temporada) */
    fallback: ScheduleGame[];
}

export const CalendarSheet: React.FC<CalendarSheetProps> = ({ open, onClose, league, team, today, timeZone, fallback }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const errorText = useErrorText();
    const lang = i18n.language;
    const calendar = useProCalendar(league, undefined, open);
    const missing = !calendar.data && isPermanent(calendar.error);
    const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);

    // Equipos y juegos: los del calendario PRO o, si no hay, los de la semana del Lite
    const source = useMemo(() => {
        if (calendar.data) return { teams: calendar.data.teams as Record<string, StatsTeam>, games: calendar.data.games };
        const teams: Record<string, StatsTeam> = {};
        for (const game of fallback) for (const side of [game.away, game.home]) teams[side.id] = { id: side.id, abbrev: side.abbrev, name: side.name, color: side.color, logo: side.logo };
        return { teams, games: [...fallback].sort((a, b) => a.date.localeCompare(b.date)).map((game) => toCalendarGame(game, timeZone)) };
    }, [calendar.data, fallback, timeZone]);

    const days = useMemo(() => {
        const map = new Map<string, CalendarGame[]>();
        for (const game of source.games) {
            if (team !== null && game.away.id !== team && game.home.id !== team) continue;
            const day = game.day || new Date(game.date).toLocaleDateString('en-CA', { timeZone });
            map.set(day, [...(map.get(day) ?? []), game]);
        }
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [source, team, timeZone]);
    const anchor = days.find(([day]) => day >= today)?.[0] ?? days[days.length - 1]?.[0];

    const teams = source.teams;
    const title = calendar.data ? t('pro.portada.calendar.title', { season: seasonLabel(calendar.data.season, league) }) : t('pro.portada.calendar.titleShort');
    const filtered = team !== null ? teams[team]?.abbrev : null;
    const pending = calendar.isPending && calendar.fetchStatus !== 'idle' && !missing;

    let body: React.ReactNode;
    if (pending) body = [0, 1, 2, 3, 4].map((index) => <Skeleton key={index} height={56} round={radius.tile} />);
    else if (calendar.isError && !calendar.data && !missing) body = <ErrorState message={errorText(calendar.error)} onRetry={() => calendar.refetch()} />;
    else if (!days.length)
        body = (
            <Txt size={14} tone="muted" center style={{ paddingVertical: 24 }}>
                {t('pro.portada.calendar.empty')}
            </Txt>
        );
    else
        body = days.map(([day, games]) => (
            <View
                key={day}
                onLayout={
                    day === anchor
                        ? (event) => {
                              // Abre en hoy (o en el próximo día con juegos)
                              scroller.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 8), animated: false });
                          }
                        : undefined
                }
                style={{ gap: 6 }}
            >
                <Txt eyebrow accessibilityRole="header" color={day === today ? colors.accentInk : undefined}>
                    {`${day === today ? `${t('games.today')} · ` : ''}${upperFirst(formatLongDate(day, lang))}`}
                </Txt>
                <View style={[{ borderRadius: radius.tile, backgroundColor: colors.surface, overflow: 'hidden' }, shadow('card')]}>
                    {games.map((game, index) => {
                        const away = teams[game.away.id];
                        const home = teams[game.home.id];
                        const done = game.state === 'final';
                        const off = game.state === 'postponed' || game.state === 'cancelled';
                        const status = off
                            ? t(`pro.portada.calendar.${game.state}`)
                            : game.state === 'live'
                              ? t('pro.portada.calendar.live')
                              : done
                                ? t('pro.portada.calendar.final')
                                : game.startTimeTBD
                                  ? t('pro.portada.preview.tbd')
                                  : formatTime(game.date, lang, timeZone);
                        const score = done || game.state === 'live' ? `${away?.abbrev ?? ''} ${game.away.score ?? 0}, ${home?.abbrev ?? ''} ${game.home.score ?? 0}` : null;
                        return (
                            <Pressable
                                key={game.gamePk}
                                onPress={() => {
                                    onClose();
                                    router.push(`/juego/${game.gamePk}`);
                                }}
                                accessibilityRole="link"
                                accessibilityLabel={[t('pro.portada.agenda.aria', { away: away?.name ?? '', home: home?.name ?? '', time: status, venue: game.venue }), score].filter(Boolean).join(' · ')}
                                style={({ pressed }) => ({
                                    minHeight: 52,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 12,
                                    paddingHorizontal: 14,
                                    paddingVertical: 8,
                                    borderTopWidth: index ? 1 : 0,
                                    borderTopColor: alpha(colors.line, 0.1),
                                    opacity: pressed ? 0.85 : 1
                                })}
                            >
                                <Txt size={12} weight="extrabold" color={game.state === 'live' || off ? pro.live : done ? colors.muted : colors.ink} style={{ width: 68 }}>
                                    {status}
                                </Txt>
                                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                                    <TeamLine team={away} side={game.away} showScore={done || game.state === 'live'} dim={done && !game.away.isWinner} />
                                    <TeamLine team={home} side={game.home} showScore={done || game.state === 'live'} dim={done && !game.home.isWinner} />
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        ));

    return (
        // Sin el ScrollView de la hoja: el propio deja abrir en el día de hoy
        <Sheet open={open} onClose={onClose} title={title} scroll={false}>
            <ScrollView ref={scroller} style={{ margin: -16 }} contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
                {filtered ? (
                    <Txt size={12} weight="semibold" tone="muted">
                        {t('pro.portada.calendar.filtered', { team: filtered })}
                    </Txt>
                ) : null}
                {missing && fallback.length > 0 ? <ProNote tone="pending">{t('pro.portada.calendar.partial')}</ProNote> : null}
                {body}
            </ScrollView>
        </Sheet>
    );
};
