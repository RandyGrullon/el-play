import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, Share2, Star } from 'lucide-react-native';
import type { ScheduleGame, ScheduleTeam } from '../../types';
import { delayOf, finalLabel, inningName, isOnHold, isSuspended, stateName } from '../../lib/baseball';
import { formatCountdown, formatTime } from '../../lib/format';
import { usePrefetchGame } from '../../lib/queries';
import { teamDisplayName } from '../../lib/teams';
import { decisionParts } from '../../lib/links';
import { usePreferences } from '../../state/preferences';
import { useColors } from '../../theme/theme';
import { alpha, inkOn, radius, shadow } from '../../theme/tokens';
import { Card, Row, Skeleton, TeamLogo, Txt } from '../ui';
import { Bases, OutsDots } from '../game/Bases';
import { DelayPill } from '../game/Delay';
import { BasesButton, useFieldLauncher, type OpenField } from '../game/field/launcher';
import { TeamLink, playerTextLink } from '../stats/common';
import { PulseDot } from './PulseDot';
import { alertsAvailable, useAlertToggle } from './alerts';
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

// Juego en vivo: dos mitades con el color de cada equipo y el marcador en grande. Las bases abren el terreno.
const LiveCard: React.FC<{ game: ScheduleGame; openField: OpenField }> = ({ game, openField }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const live = game.live!;
    const between = live.inningState === 'Middle' || live.inningState === 'End';
    // Detenido (lluvia…): la pastilla azul con la entrada en que se paró, en vez de la roja
    const delay = delayOf(game.detailedState);
    const inning = live.inning ? inningName({ n: live.inning, isTop: live.isTop, state: live.inningState }, i18n.language, true) : null;
    const half = (team: ScheduleTeam, align: 'start' | 'end') => {
        const ink = inkOn(team.color);
        return (
            <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', alignItems: align === 'end' ? 'flex-end' : 'flex-start', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: team.color }}>
                <TeamLink id={team.id} name={teamDisplayName(team, i18n.language)} style={{ maxWidth: '100%' }}>
                    <Txt size={15} weight="bold" color={ink} numberOfLines={1}>
                        {teamDisplayName(team, i18n.language)}
                    </Txt>
                </TeamLink>
                <Txt size={54} weight="extrabold" color={ink} tabular style={{ lineHeight: 56 }}>
                    {team.score ?? 0}
                </Txt>
                {team.record && (
                    <Txt size={12} weight="semibold" color={ink} tabular style={{ opacity: 0.75 }}>
                        {team.record.wins}-{team.record.losses}
                    </Txt>
                )}
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
                {delay ? (
                    <DelayPill delay={delay} suffix={inning} />
                ) : (
                    <LivePill label={inning ?? stateName(game.detailedState, i18n.language)} />
                )}
                {!between && live.inning ? (
                    <>
                        <BasesButton onOpen={openField} gamePk={game.gamePk}>
                            <Bases runners={live.runners} size={26} color={(live.isTop ? game.away : game.home).color} />
                        </BasesButton>
                        <OutsDots outs={live.outs} />
                        <Txt size={14} weight="semibold" tone="muted" tabular>
                            {live.balls}-{live.strikes}
                        </Txt>
                        {/* Detenido: nadie está bateando */}
                        {!delay && live.batter && (
                            <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }} {...playerTextLink(live.batter)}>
                                {t('card.batting', { name: live.batter.name })}
                            </Txt>
                        )}
                    </>
                ) : delay ? null : (
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
            <Row gap={6} style={{ flex: 1, minWidth: 0 }}>
                {/* Logo y nombre van a la página del equipo; el resto de la tarjeta abre el juego */}
                <TeamLink id={team.id} name={teamDisplayName(team, i18n.language)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, minWidth: 0 }}>
                    <TeamLogo team={team} size={30} />
                    <Txt size={16} weight="bold" tone={dim ? 'muted' : 'ink'} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {teamDisplayName(team, i18n.language)}
                    </Txt>
                </TeamLink>
                {favoriteTeamId === team.id && <Star size={14} color={colors.gold} fill={colors.gold} />}
                {team.record && (
                    <Txt size={12} weight="semibold" tone="muted" tabular style={{ flexShrink: 0 }}>
                        {team.record.wins}-{team.record.losses}
                    </Txt>
                )}
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
    // Pospuesto, cancelado o suspendido todavía sin fecha nueva («Suspendido»)
    const notPlayed = isOnHold(game, now);
    const final = game.state === 'final';
    const subscribed = subscribedGames.includes(game.gamePk);
    const startsIn = new Date(game.date).getTime() - now;
    const open = () => router.push(`/juego/${game.gamePk}`);
    const warm = () => {
        prefetch(game.gamePk).catch(() => undefined);
    };
    const label = `${teamDisplayName(game.away, i18n.language)} ${game.away.score ?? ''} · ${teamDisplayName(game.home, i18n.language)} ${game.home.score ?? ''}`;
    // El terreno va fuera del Pressable de la tarjeta: en la web los toques del Modal subirían hasta él y abrirían el juego
    const field = useFieldLauncher(game.gamePk);
    // Inicio demorado (sigue «programado»): se dice al lado de la hora
    const delay = game.state === 'preview' && !notPlayed ? delayOf(game.detailedState) : null;

    if (game.state === 'live' && game.live) {
        return (
            <>
                <Pressable onPress={open} onPressIn={warm} onHoverIn={warm} accessibilityRole="link" accessibilityLabel={label} style={({ pressed }) => [{ borderRadius: radius.card, overflow: 'hidden', opacity: pressed ? 0.92 : 1 }, shadow('float')]}>
                    <LiveCard game={game} openField={field.open} />
                </Pressable>
                {field.element}
            </>
        );
    }

    const pill = (text: React.ReactNode, background: string) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: background, paddingHorizontal: 12, paddingVertical: 4 }}>{text}</View>;
    // Cada pitcher de la línea de abajo abre su ficha (Text anidado: la línea se ve igual)
    const decisions = final ? decisionParts(game.decisions) : [];
    const winnerTeam = game.away.isWinner ? game.away : game.home;
    const loserTeam = winnerTeam === game.away ? game.home : game.away;
    const probable = (team: ScheduleTeam) => (team.probable ? <Text {...playerTextLink({ ...team.probable, teamId: team.id })}>{team.probable.name}</Text> : t('preview.tbd'));
    const footer = decisions.length ? (
        decisions.map(({ key, person }, index) => (
            <React.Fragment key={key}>
                {index ? ' · ' : ''}
                <Text {...playerTextLink({ ...person, teamId: (key === 'loss' ? loserTeam : winnerTeam).id })}>{t(`card.${key}`, { name: person.name })}</Text>
            </React.Fragment>
        ))
    ) : game.state === 'preview' && (game.away.probable || game.home.probable) ? (
        <>
            {probable(game.away)} vs {probable(game.home)} · {game.venue}
        </>
    ) : null;

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
                    {delay ? <DelayPill delay={delay} /> : null}
                    {/* Suspendido con fecha nueva: sale programado en esa fecha, pero se dice */}
                    {game.state === 'preview' && !notPlayed && isSuspended(game.detailedState)
                        ? pill(
                              <Txt size={12} weight="bold" color={colors.accentInk}>
                                  {t('card.rescheduled')}
                              </Txt>,
                              alpha(colors.accent, 0.1)
                          )
                        : null}
                    {/* Doble cartelera: qué juego del día es (si no cabe, se recorta antes que los botones) */}
                    {game.doubleheader?.game ? (
                        <View style={{ flexShrink: 1, borderRadius: radius.pill, backgroundColor: alpha(colors.accent, 0.1), paddingHorizontal: 12, paddingVertical: 4 }}>
                            <Txt size={12} weight="bold" color={colors.accentInk} numberOfLines={1}>
                                {t('card.doubleheader', { n: game.doubleheader.game })}
                            </Txt>
                        </View>
                    ) : null}
                    {game.description && game.gameType !== 'R' ? (
                        <Txt size={12} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {game.description}
                        </Txt>
                    ) : null}
                    <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 4 }}>
                        {/* MLB da los pospuestos y cancelados como «final»: sin Compartir (saldría «0 - 0») */}
                        {final && !notPlayed && onShare && (
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
                        {game.state === 'preview' && !notPlayed && alertsAvailable() && (
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
