// «Hoy mueven la carrera»: los juegos de la próxima fecha con el puesto de cada equipo y si se juega el corte.
// Cada píldora se parte en dos con el color de cada equipo (la marca de la app). Tocar un juego lo abre.
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { CalendarGame } from '../../../types/pro-liga';
import { formatTime } from '../../../lib/format';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { Enter, LiveDot, teamInk, useProColors } from '../kit';
import { shortVenue } from './logic';
import type { RaceTeam } from './RaceChart';

interface TodayGamesProps {
    games: CalendarGame[];
    teams: Record<number, RaceTeam>;
    /** Puesto de cada equipo en la fase */
    ranks: Record<number, number>;
    /** Cuántos pasan (el que va en ese puesto está «en el corte») */
    advance: number | null;
    timeZone: string;
}

// Mitad de la píldora de un juego con el color del equipo
const Half: React.FC<{ team: RaceTeam; side: 'away' | 'home'; narrow: boolean }> = ({ team, side, narrow }) => (
    <View
        style={{
            flex: 1,
            minWidth: 0,
            height: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: narrow ? 'center' : 'flex-start',
            gap: 5,
            paddingHorizontal: 6,
            backgroundColor: team.color,
            borderTopLeftRadius: side === 'away' ? 22 : 0,
            borderBottomLeftRadius: side === 'away' ? 22 : 0,
            borderTopRightRadius: side === 'home' ? 22 : 0,
            borderBottomRightRadius: side === 'home' ? 22 : 0
        }}
    >
        {!narrow && (
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
                <TeamLogo team={team} size={18} />
            </View>
        )}
        <Txt size={13} weight="black" color={teamInk(team.color)} numberOfLines={1}>
            {team.abbrev}
        </Txt>
    </View>
);

export const TodayGames: React.FC<TodayGamesProps> = ({ games, teams, ranks, advance, timeZone }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const narrow = useWindowDimensions().width < 360;
    return (
        <View style={{ gap: 6 }}>
            {games.map((game, index) => {
                const away = teams[game.away.id];
                const home = teams[game.home.id];
                if (!away || !home) return null;
                const awayRank = ranks[game.away.id];
                const homeRank = ranks[game.home.id];
                const atCut = advance !== null && (awayRank === advance || homeRank === advance);
                const time = game.startTimeTBD ? t('pro.posiciones.today.tbd') : formatTime(game.date, i18n.language, timeZone);
                const live = game.state === 'live';
                const vs = awayRank && homeRank ? t('pro.posiciones.today.vs', { a: awayRank, b: homeRank }) : '';
                return (
                    <Enter key={game.gamePk} index={index}>
                        <Pressable
                            onPress={() => router.push({ pathname: '/juego/[gamePk]', params: { gamePk: String(game.gamePk) } })}
                            accessibilityRole="button"
                            accessibilityHint={t('pro.posiciones.today.open')}
                            accessibilityLabel={t('pro.posiciones.today.aria', {
                                away: away.name,
                                home: home.name,
                                ranks: vs,
                                cut: atCut ? t('pro.posiciones.today.atCut') : '',
                                time: live ? t('pro.posiciones.today.live') : time,
                                venue: game.venue.replace(/^Estadio\s+/i, '')
                            })}
                            style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: narrow ? 8 : 12, borderRadius: 16, paddingVertical: 4, paddingRight: 4, backgroundColor: pressed ? alpha(colors.raised, 0.7) : 'transparent' })}
                        >
                            <View style={{ width: narrow ? 112 : 150, flexDirection: 'row', borderRadius: 22, overflow: 'hidden' }}>
                                <Half team={away} side="away" narrow={narrow} />
                                <Half team={home} side="home" narrow={narrow} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                {vs ? (
                                    <Txt size={narrow ? 12 : 13} weight="extrabold" tabular numberOfLines={1}>
                                        {vs}
                                    </Txt>
                                ) : null}
                                {atCut && (
                                    <Txt size={11} weight="bold" color={colors.accentInk} numberOfLines={1}>
                                        {t('pro.posiciones.today.atCut')}
                                    </Txt>
                                )}
                            </View>
                            <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: narrow ? 92 : 120 }}>
                                {live ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <LiveDot />
                                        <Txt size={14} weight="extrabold" color={pro.live}>
                                            {t('pro.posiciones.today.live')}
                                        </Txt>
                                    </View>
                                ) : (
                                    <Txt size={narrow ? 14 : 15} weight="extrabold" tabular numberOfLines={1}>
                                        {time}
                                    </Txt>
                                )}
                                {/* Como el diseño: «Quisqueya», «Cibao», «Tetelo Vargas» (el nombre completo va en la etiqueta) */}
                                <Txt size={11} tone="muted" numberOfLines={1}>
                                    {shortVenue(game.venue)}
                                </Txt>
                            </View>
                        </Pressable>
                    </Enter>
                );
            })}
        </View>
    );
};
