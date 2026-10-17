// «Pronósticos»: escoger quién gana cada juego antes de que empiece (+10 por acierto)
import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { RULES, gameStarted, pickResult, setPick, type DayEntry, type FantasyDay } from '../../lib/fantasy';
import { formatTime } from '../../lib/format';
import { useColors } from '../../theme/theme';
import { inkOn } from '../../theme/tokens';
import { Card, Row, TeamLogo, Txt } from '../ui';

export const PicksTab: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    return (
        <View style={{ gap: 10 }} accessibilityLabel={t('fantasy.picks')}>
            <Txt size={14} tone="muted">
                {t('fantasy.picksHint', { pts: RULES.pick })}
            </Txt>
            {day.games.map((game) => {
                const pick = entry.picks[game.gamePk];
                const result = pickResult(game, entry);
                // Se cierra al empezar el juego o al llegar su hora (lo que pase primero)
                const locked = gameStarted(game);
                return (
                    <Card key={game.gamePk} style={{ padding: 12, gap: 8 }}>
                        <Row justify="space-between">
                            <Txt size={12} weight="semibold" tone="muted">
                                {game.state === 'preview' ? formatTime(game.date, i18n.language) : game.state === 'final' ? t('fantasy.final') : t('fantasy.liveNow')}
                            </Txt>
                            {result === 'win' && (
                                <Txt size={12} weight="extrabold" color={colors.ball}>
                                    +{RULES.pick}
                                </Txt>
                            )}
                            {result === 'loss' && (
                                <Txt size={12} weight="extrabold" color={colors.live}>
                                    0
                                </Txt>
                            )}
                            {locked && !pick && (
                                <Txt size={12} weight="semibold" tone="muted">
                                    {t('fantasy.noPick')}
                                </Txt>
                            )}
                        </Row>
                        <Row gap={8}>
                            {[game.away, game.home].map((side) => {
                                const chosen = pick === side.id;
                                const ink = chosen ? inkOn(side.color) : colors.ink;
                                return (
                                    <Pressable
                                        key={side.id}
                                        disabled={locked}
                                        onPress={() => {
                                            if (setPick(day, game, side.id)) Haptics.selectionAsync().catch(() => undefined);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={side.name}
                                        accessibilityState={{ selected: chosen, disabled: locked }}
                                        style={({ pressed }) => ({
                                            flex: 1,
                                            minWidth: 0,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: 10,
                                            borderRadius: 16,
                                            backgroundColor: chosen ? side.color : colors.raised,
                                            opacity: locked && !chosen ? 0.6 : pressed ? 0.85 : 1
                                        })}
                                    >
                                        <TeamLogo team={side} size={32} />
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Txt size={14} weight="extrabold" color={ink} numberOfLines={1}>
                                                {side.abbrev}
                                            </Txt>
                                            {game.state !== 'preview' && (
                                                <Txt size={12} weight="bold" color={ink} tabular style={{ opacity: 0.8 }}>
                                                    {side.score ?? 0}
                                                </Txt>
                                            )}
                                        </View>
                                        {locked && chosen && <Lock size={14} color={ink} style={{ opacity: 0.8 }} />}
                                    </Pressable>
                                );
                            })}
                        </Row>
                    </Card>
                );
            })}
        </View>
    );
};
