import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, Share2, Star } from 'lucide-react-native';
import type { ScheduleGame, ScheduleTeam } from '../../types';
import { finalLabel, inningName, isNotPlayed, stateName } from '../../lib/baseball';
import { formatCountdown, formatTime } from '../../lib/format';
import { usePrefetchGame } from '../../lib/queries';
import { teamDisplayName } from '../../lib/teams';
import { usePreferences } from '../../state/preferences';
import { useColors } from '../../theme/theme';
import { alpha, inkOn, radius, shadow } from '../../theme/tokens';
import { Card, Row, Skeleton, TeamLogo, Txt } from '../ui';
import { Bases, OutsDots } from '../game/Bases';
import { PulseDot } from './PulseDot';
import { useAlertToggle } from './alerts';
import { useNow } from './useNow';

const LivePill: React.FC<{ label: string }> = ({ label }) => {
    const colors = useColors();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.live, paddingHorizontal: 12, paddingVertical: 4 }}>
            <PulseDot color="#fff" />
            <Txt size={12} weight="bold" tone="white">
                {label}
            </Txt>
        </View>
    );
};

// Juego en vivo: dos mitades con el color de cada equipo y el marcador en grande
const LiveCard: React.FC<{ game: ScheduleGame }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const live = game.live!;
    const between = live.inningState === 'Middle' || live.inningState === 'End';
    const half = (team: ScheduleTeam, align: 'start' | 'end') => {
        const ink = inkOn(team.color);
        return (
            <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', alignItems: align === 'end' ? 'flex-end' : 'flex-start', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: team.color }}>
                <Txt size={15} weight="bold" color={ink} numberOfLines={1} style={{ maxWidth: '100%' }}>
                    {teamDisplayName(team, i18n.language)}
                </Txt>
                <Txt size={54} weight="extrabold" color={ink} tabular style={{ lineHeight: 56 }}>
                    {team.score ?? 0}
                </Txt>
            </View>
        );
    };
    return (
        <>
            <View style={{ flexDirection: 'row' }}>
                {half(game.away, 'start')}
                {half(game.home, 'end')}
            </View>
            <Row gap={12} style={{ backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 }}>
                <LivePill label={live.inning ? inningName({ n: live.inning, isTop: live.isTop, state: live.inningState }, i18n.language, true) : stateName(game.detailedState, i18n.language)} />
                {!between && live.inning ? (
                    <>
                        <Bases runners={live.runners} size={26} color={(live.isTop ? game.away : game.home).color} />
                        <OutsDots outs={live.outs} />
                        <Txt size={14} weight="semibold" tone="muted" tabular>
                            {live.balls}-{live.strikes}
                        </Txt>
                        {live.batter && (
                            <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
                                {t('card.batting', { name: live.batter.name })}
                            </Txt>
                        )}
                    </>
                ) : (
                    <Txt size={14} weight="semibold" tone="muted">
                        {t('game.betweenInnings')}
                    </Txt>
                )}
            </Row>
        </>
    );
};

const TeamRow: React.FC<{ team: ScheduleTeam; dim: boolean; showScore: boolean }> = ({ team, dim, showScore }) => {
    const { i18n } = useTranslation();
    const colors = useColors();
    const { favoriteTeamId } = usePreferences();
    return (
        <Row gap={12}>
            <TeamLogo team={team} size={30} />
            <Row gap={6} style={{ flex: 1, minWidth: 0 }}>
                <Txt size={16} weight="bold" tone={dim ? 'muted' : 'ink'} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {teamDisplayName(team, i18n.language)}
                </Txt>
                {favoriteTeamId === team.id && <Star size={14} color={colors.gold} fill={colors.gold} />}
            </Row>
            {showScore && (
                <Txt size={24} weight="extrabold" tone={dim ? 'muted' : 'ink'} tabular>
                    {team.score ?? 0}
                </Txt>
            )}
        </Row>
    );
};

/** Tarjeta de un juego en la portada; abre el juego y precarga su detalle al tocarla */
export const GameFeedCard: React.FC<{ game: ScheduleGame; onShare?: (game: ScheduleGame) => void }> = ({ game, onShare }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const prefetch = usePrefetchGame();
    const { subscribedGames } = usePreferences();
    const toggleAlert = useAlertToggle();
    const now = useNow();
    const notPlayed = isNotPlayed(game.detailedState);
    const final = game.state === 'final';
    const subscribed = subscribedGames.includes(game.gamePk);
    const startsIn = new Date(game.date).getTime() - now;
    const open = () => router.push(`/juego/${game.gamePk}`);
    const warm = () => {
        prefetch(game.gamePk).catch(() => undefined);
    };
    const label = `${teamDisplayName(game.away, i18n.language)} ${game.away.score ?? ''} · ${teamDisplayName(game.home, i18n.language)} ${game.home.score ?? ''}`;

    if (game.state === 'live' && game.live) {
        return (
            <Pressable onPress={open} onPressIn={warm} onHoverIn={warm} accessibilityRole="link" accessibilityLabel={label} style={({ pressed }) => [{ borderRadius: radius.card, overflow: 'hidden', opacity: pressed ? 0.92 : 1 }, shadow('float')]}>
                <LiveCard game={game} />
            </Pressable>
        );
    }

    const pill = (text: React.ReactNode, background: string) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: background, paddingHorizontal: 12, paddingVertical: 4 }}>{text}</View>;
    const footer =
        final && game.decisions?.winner
            ? [t('card.win', { name: game.decisions.winner.name }), game.decisions.save ? t('card.save', { name: game.decisions.save.name }) : game.decisions.loser ? t('card.loss', { name: game.decisions.loser.name }) : ''].filter(Boolean).join(' · ')
            : game.state === 'preview' && (game.away.probable || game.home.probable)
              ? `${game.away.probable?.name ?? t('preview.tbd')} vs ${game.home.probable?.name ?? t('preview.tbd')} · ${game.venue}`
              : null;

    return (
        <Pressable onPress={open} onPressIn={warm} onHoverIn={warm} accessibilityRole="link" accessibilityLabel={label} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
            <Card>
                <Row gap={8} style={{ marginBottom: 12, minHeight: 36 }}>
                    {notPlayed
                        ? pill(
                              <Txt size={12} weight="bold" color={colors.live}>
                                  {stateName(game.detailedState, i18n.language)}
                              </Txt>,
                              alpha(colors.live, 0.1)
                          )
                        : final
                          ? pill(
                                <Txt size={12} weight="bold" tone="muted">
                                    {finalLabel(game.inningsPlayed ?? 0, game.scheduledInnings, i18n.language)}
                                </Txt>,
                                colors.raised
                            )
                          : pill(
                                <Txt size={12} weight="bold">
                                    {formatTime(game.date, i18n.language)}
                                    {startsIn > 0 && startsIn < 6 * 3600000 ? (
                                        <Txt size={12} weight="semibold" tone="muted">
                                            {' '}
                                            · {formatCountdown(startsIn, i18n.language)}
                                        </Txt>
                                    ) : null}
                                </Txt>,
                                colors.raised
                            )}
                    {game.description && game.gameType !== 'R' ? (
                        <Txt size={12} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {game.description}
                        </Txt>
                    ) : null}
                    <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 4 }}>
                        {final && onShare && (
                            <Pressable
                                onPress={() => onShare(game)}
                                accessibilityRole="button"
                                accessibilityLabel={t('share.shareResult')}
                                hitSlop={4}
                                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Share2 size={16} color={colors.ink} />
                            </Pressable>
                        )}
                        {game.state === 'preview' && !notPlayed && (
                            <Pressable
                                onPress={() => toggleAlert(game)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: subscribed }}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 18, paddingHorizontal: 12, backgroundColor: subscribed ? colors.raised : colors.ink }}
                            >
                                {subscribed ? <BellRing size={16} color={colors.ink} /> : <Bell size={16} color={colors.bg} />}
                                <Txt size={12} weight="bold" color={subscribed ? colors.ink : colors.bg}>
                                    {subscribed ? t('card.notifying') : t('preview.notifyShort')}
                                </Txt>
                            </Pressable>
                        )}
                    </View>
                </Row>
                <View style={{ gap: 10 }}>
                    <TeamRow team={game.away} dim={final && !game.away.isWinner} showScore={game.state !== 'preview' && !notPlayed} />
                    <TeamRow team={game.home} dim={final && !game.home.isWinner} showScore={game.state !== 'preview' && !notPlayed} />
                </View>
                {footer ? (
                    <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                        {footer}
                    </Txt>
                ) : null}
            </Card>
        </Pressable>
    );
};

export const GameFeedCardSkeleton: React.FC = () => (
    <Card style={{ gap: 12 }}>
        <Skeleton height={24} width={96} round={999} />
        {[0, 1].map((index) => (
            <Row key={index} gap={12}>
                <Skeleton height={30} width={30} round={15} />
                <Skeleton height={20} width="auto" style={{ flex: 1 }} round={6} />
                <Skeleton height={28} width={28} round={6} />
            </Row>
        ))}
    </Card>
);
