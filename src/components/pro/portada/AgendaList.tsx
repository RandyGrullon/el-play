// Agenda de un día que viene: hora, los dos logos, «Toros en Estrellas» y el estadio. Cada fila abre la previa.
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ScheduleGame } from '../../../types';
import { formatTime } from '../../../lib/format';
import { isNotPlayed, stateName } from '../../../lib/baseball';
import { usePrefetchGame } from '../../../lib/queries';
import { teamDisplayName } from '../../../lib/teams';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { TeamLogo, Txt } from '../../ui';
import { useProColors } from '../kit';
import { teamShort } from './shared';

export const AgendaList: React.FC<{ games: ScheduleGame[]; timeZone: string }> = ({ games, timeZone }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const prefetch = usePrefetchGame();
    const lang = i18n.language;
    return (
        <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }, shadow('card')]}>
            {games.map((game, index) => {
                const notPlayed = isNotPlayed(game.detailedState);
                const time = notPlayed ? stateName(game.detailedState, lang) : game.startTimeTBD ? t('pro.portada.preview.tbd') : formatTime(game.date, lang, timeZone);
                return (
                    <Pressable
                        key={game.gamePk}
                        onPress={() => router.push(`/juego/${game.gamePk}`)}
                        onPressIn={() => {
                            prefetch(game.gamePk).catch(() => undefined);
                        }}
                        accessibilityRole="link"
                        accessibilityLabel={t('pro.portada.agenda.aria', { away: teamDisplayName(game.away, lang), home: teamDisplayName(game.home, lang), time, venue: game.venue })}
                        style={({ pressed }) => ({
                            minHeight: 60,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderTopWidth: index > 0 ? 1 : 0,
                            borderTopColor: alpha(colors.line, 0.1),
                            opacity: pressed ? 0.85 : 1
                        })}
                    >
                        <Txt size={13} weight="extrabold" color={notPlayed ? pro.live : colors.ink} style={{ width: 68 }}>
                            {time}
                        </Txt>
                        <View style={{ flexDirection: 'row', flexShrink: 0 }}>
                            <View style={{ borderRadius: 15, backgroundColor: colors.surface, padding: 1 }}>
                                <TeamLogo team={game.away} size={28} />
                            </View>
                            <View style={{ marginLeft: -6, borderRadius: 15, backgroundColor: colors.surface, padding: 1 }}>
                                <TeamLogo team={game.home} size={28} />
                            </View>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={14} weight="extrabold" numberOfLines={1}>
                                {`${teamShort(game.away, game.league, lang)} `}
                                <Txt size={14} weight="semibold" tone="muted">
                                    {t('pro.portada.agenda.at')}
                                </Txt>
                                {` ${teamShort(game.home, game.league, lang)}`}
                            </Txt>
                            <Txt size={12} weight="semibold" tone="muted" numberOfLines={1}>
                                {game.venue}
                            </Txt>
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
};
