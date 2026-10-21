import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react-native';
import type { LeagueId, ScheduleTeam } from '../../../types';
import { useSchedule } from '../../../lib/queries';
import { dayKey, formatTime, todayKey } from '../../../lib/format';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { teamInk, useProColors } from '../kit';

// «Hoy juega»: el juego de hoy del equipo del pelotero (el calendario que ya tiene la app). Si no juega hoy, no sale.
export const TodayGame: React.FC<{ league: LeagueId; teamId: number | null; onOpen: (gamePk: number) => void }> = ({ league, teamId, onOpen }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const { width } = useWindowDimensions();
    const schedule = useSchedule(league);
    if (!teamId || !schedule.data) return null;
    const timeZone = schedule.data.timeZone;
    const today = todayKey(timeZone);
    const game = schedule.data.games.find((item) => (item.away.id === teamId || item.home.id === teamId) && dayKey(item.date, timeZone) === today);
    if (!game) return null;
    const home = game.home.id === teamId;
    const mine = home ? game.home : game.away;
    const rival = home ? game.away : game.home;
    const status =
        game.state === 'live'
            ? t('pro.ficha.today.live', { away: game.away.abbrev, awayRuns: game.away.score ?? 0, home: game.home.abbrev, homeRuns: game.home.score ?? 0 })
            : game.state === 'final'
              ? t('pro.ficha.today.final', { away: game.away.abbrev, awayRuns: game.away.score ?? 0, home: game.home.abbrev, homeRuns: game.home.score ?? 0 })
              : game.startTimeTBD
                ? t('pro.ficha.today.tbd')
                : formatTime(game.date, i18n.language, timeZone);
    const where = home ? t('pro.ficha.today.vs') : t('pro.ficha.today.at');
    const wide = width >= 360;
    const half = (team: ScheduleTeam, logo: 'start' | 'end') => (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: logo === 'end' ? 'flex-end' : 'flex-start', gap: 6, backgroundColor: team.color, paddingLeft: logo === 'end' ? 16 : 8, paddingRight: logo === 'end' ? 8 : 16 }}>
            {logo === 'start' && <TeamLogo team={team} size={24} />}
            {wide && (
                <Txt size={14} weight="black" color={teamInk(team.color)}>
                    {team.abbrev}
                </Txt>
            )}
            {logo === 'end' && <TeamLogo team={team} size={24} />}
        </View>
    );
    return (
        <Pressable
            onPress={() => onOpen(game.gamePk)}
            accessibilityRole="link"
            accessibilityLabel={t('pro.ficha.today.aria', { team: mine.abbrev, rival: rival.abbrev, where, status, venue: game.venue })}
            style={({ pressed }) => [
                { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), paddingRight: 12, opacity: pressed ? 0.85 : 1 },
                shadow('card')
            ]}
        >
            <View style={{ width: wide ? 176 : 112, height: 64, flexDirection: 'row' }}>
                {half(mine, 'start')}
                {half(rival, 'end')}
                <View style={{ position: 'absolute', left: '50%', top: 18, marginLeft: -14, width: 28, height: 28, borderRadius: 14, backgroundColor: '#14151a', alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size={11} weight="extrabold" color="#fff">
                        {where}
                    </Txt>
                </View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    {game.state === 'final' ? t('pro.ficha.today.played') : t('pro.ficha.today.title')}
                </Txt>
                <Txt size={16} weight="extrabold" numberOfLines={1} color={game.state === 'live' ? pro.live : undefined}>
                    {status}
                </Txt>
                <Txt size={12} tone="muted" numberOfLines={1}>
                    {game.venue}
                </Txt>
            </View>
            <ChevronRight size={20} color={colors.muted} />
        </Pressable>
    );
};
