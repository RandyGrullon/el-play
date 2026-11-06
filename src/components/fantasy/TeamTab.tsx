// «Mi equipo»: 5 bateadores + 1 lanzador; créditos del día, corona para el capitán, X para quitar y candado cuando empieza su juego.
// Con las ayudas de la web: aviso del próximo cierre, proyección, equipo sugerido, equipo ideal y % elegido al cerrar.
// Tocar los puntos de un pelotero abre de dónde salen (el desglose, como en la web).
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Crown, Lock, Plus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { RULES, isLocked, perTeamLimit, playerScore, removePlayer, setCaptain, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import { useColors } from '../../theme/theme';
import { radius, shadow } from '../../theme/tokens';
import { PlayerPhoto, Row, Txt } from '../ui';
import { teamTextLink } from '../stats/common';
import { RulesToggle, formatCredits, gameStatus, lineText, teamOf, useOpenPlayer } from './shared';
import { ScoringTable } from './ScoringTable';
import { CreditsMeter } from './CreditsMeter';
import { IdealCard, LockNotice, SmartActions, useOwners } from './Smart';
import type { FantasyOwners } from './fans';
import { pointParts } from '../pro/fantasy/logic';

export const TeamTab: React.FC<{ day: FantasyDay; entry: DayEntry; onPick: (role: 'B' | 'P') => void }> = ({ day, entry, onPick }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [rules, setRules] = useState(false);
    const owners = useOwners(day);
    const chosen = entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    const batters = chosen.filter((p) => p.role === 'B');
    const pitchers = chosen.filter((p) => p.role === 'P');
    const slots: (FantasyPlayer | 'B' | 'P')[] = [
        ...batters,
        ...Array.from({ length: Math.max(0, RULES.batters - batters.length) }, () => 'B' as const),
        ...pitchers,
        ...Array.from({ length: Math.max(0, RULES.pitchers - pitchers.length) }, () => 'P' as const)
    ];

    return (
        <View style={{ gap: 12 }} accessibilityLabel={t('fantasy.myTeam')}>
            <Txt size={14} tone="muted">
                {t(day.credits ? 'fantasy.rulesShortCredits' : 'fantasy.rulesShort', { batters: RULES.batters, perTeam: perTeamLimit(day) })}
            </Txt>
            <LockNotice day={day} entry={entry} />
            <CreditsMeter day={day} entry={entry} />
            <SmartActions day={day} entry={entry} />
            <View style={{ gap: 10 }}>
                {slots.map((slot, index) =>
                    typeof slot === 'string' ? (
                        <Pressable
                            key={`empty-${index}`}
                            onPress={() => onPick(slot)}
                            accessibilityRole="button"
                            style={({ pressed }) => ({ height: 84, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line, opacity: pressed ? 0.7 : 1 })}
                        >
                            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised }}>
                                <Plus size={20} color={colors.muted} />
                            </View>
                            <Txt weight="bold" tone="muted">
                                {slot === 'P' ? t('fantasy.addPitcher') : t('fantasy.addBatter')}
                            </Txt>
                        </Pressable>
                    ) : (
                        <PlayerSlot key={slot.id} day={day} entry={entry} player={slot} owned={owners.players.get(slot.id)} />
                    )
                )}
            </View>

            <IdealCard day={day} entry={entry} />

            <RulesToggle open={rules} onToggle={() => setRules((v) => !v)} />
            {rules && <ScoringTable day={day} />}
        </View>
    );
};

const PlayerSlot: React.FC<{ day: FantasyDay; entry: DayEntry; player: FantasyPlayer; owned?: FantasyOwners['players'][number] }> = ({ day, entry, player, owned }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const openPlayer = useOpenPlayer();
    const team = day.teams[player.teamId];
    const locked = isLocked(day, player);
    const captain = entry.captain === player.id;
    const line = lineText(player, t);
    // Precio del día (solo días con créditos): al final de la línea de la hora, como en la web. Si no cabe, lo que se
    // recorta es el precio (la hora no se encoge por él y solo se corta si ella sola no cabe), así la hora de cierre
    // se sigue viendo. El lector lo dice completo en la etiqueta del botón
    const price = day.credits && player.price !== undefined ? formatCredits(player.price, i18n.language) : null;
    const small = { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' } as const;
    // De dónde salen sus puntos (solo si ya jugó)
    const [breakdown, setBreakdown] = useState(false);
    const parts = player.played ? pointParts(player, day.scoring) : [];
    const score = formatCredits(playerScore(entry, player), i18n.language);
    const scoreText = (
        <Txt size={24} weight="extrabold" tabular style={[{ lineHeight: 26 }, parts.length > 0 && { textDecorationLine: 'underline', textDecorationStyle: 'dotted' }]}>
            {score}
        </Txt>
    );
    return (
        <View>
            {/* Encima del desglose, que sale por debajo */}
            <View style={[{ zIndex: 1, height: 84, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 22, backgroundColor: colors.surface }, shadow('card')]}>
                <Pressable
                    onPress={() => openPlayer(player.id)}
                    accessibilityRole="button"
                    accessibilityLabel={
                        price === null ? t('statsPage.viewPlayer', { name: player.name }) : `${t('statsPage.viewPlayer', { name: player.name })}, ${t('fantasy.credits.priceLong', { price })}`
                    }
                    style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}
                >
                    <PlayerPhoto personId={player.id} name={player.name} size={56} team={teamOf(day, player)} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Row gap={6}>
                            {captain && <Crown size={16} color={colors.gold} accessibilityLabel={t('fantasy.captain')} />}
                            <Txt weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                {player.name}
                            </Txt>
                        </Row>
                        <Row gap={0}>
                            <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flexShrink: 0, maxWidth: '100%' }}>
                                <Text {...teamTextLink(team?.id)}>{team?.abbrev}</Text> · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')} · {gameStatus(day, player.gamePk, i18n.language, t)}
                            </Txt>
                            {price !== null && (
                                // Espacio duro al empezar: en un texto de una línea aparte el espacio normal se pierde (en la web)
                                <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }}>
                                    {`\u00a0· ${t('fantasy.credits.price', { price })}`}
                                </Txt>
                            )}
                        </Row>
                        {line && (
                            <Txt size={12} tone="muted" numberOfLines={1}>
                                {line}
                            </Txt>
                        )}
                        {!locked && player.proj !== undefined && (
                            <Txt size={12} weight="bold" tone="accentInk" numberOfLines={1}>
                                {t('fantasy.smart.proj', { pts: formatCredits(player.proj, i18n.language) })}
                                {/* El lanzador: si abrió el último juego o hace cuántos días (como en la web) */}
                                {player.rest ? ` · ${t('fantasy.smart.restShort')}` : player.startedAgo !== undefined ? ` · ${t('fantasy.smart.startedAgo', { count: player.startedAgo })}` : ''}
                            </Txt>
                        )}
                    </View>
                </Pressable>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {parts.length ? (
                        <Pressable onPress={() => setBreakdown((value) => !value)} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: breakdown }} accessibilityLabel={`${score}. ${t('fantasyMore.breakdownOf', { name: player.name })}`}>
                            {scoreText}
                        </Pressable>
                    ) : (
                        scoreText
                    )}
                    {locked ? (
                        <Row gap={4}>
                            {owned && (
                                <Txt size={11} weight="semibold" tone="faint" tabular accessibilityLabel={t('fantasy.smart.owned', { pct: formatCredits(owned.pct, i18n.language) })}>
                                    {`${formatCredits(owned.pct, i18n.language)} %`}
                                </Txt>
                            )}
                            <Lock size={14} color={colors.faint} accessibilityLabel={t('fantasy.locked')} />
                        </Row>
                    ) : (
                        <Row gap={4}>
                            <Pressable
                                onPress={() => {
                                    if (setCaptain(day, entry, player)) Haptics.selectionAsync().catch(() => undefined);
                                }}
                                hitSlop={4}
                                accessibilityRole="button"
                                accessibilityLabel={t('fantasy.makeCaptain')}
                                accessibilityState={{ selected: captain }}
                                style={[small, { backgroundColor: captain ? colors.gold : colors.raised }]}
                            >
                                <Crown size={14} color={captain ? '#fff' : colors.muted} />
                            </Pressable>
                            <Pressable onPress={() => removePlayer(day, player)} hitSlop={4} accessibilityRole="button" accessibilityLabel={t('fantasy.remove', { name: player.name })} style={[small, { backgroundColor: colors.raised }]}>
                                <X size={14} color={colors.muted} />
                            </Pressable>
                        </Row>
                    )}
                </View>
            </View>
            {breakdown && parts.length > 0 && (
                // Debajo de la tarjeta, como una pestaña que sale de ella
                <View accessibilityLabel={t('fantasyMore.breakdownOf', { name: player.name })} style={{ marginHorizontal: 12, marginTop: -8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomLeftRadius: radius.tile, borderBottomRightRadius: radius.tile, backgroundColor: colors.raised, gap: 2 }}>
                    {parts.map((part) => (
                        <Row key={part.key} justify="space-between" gap={12}>
                            <Txt size={14} tone="muted" style={{ flexShrink: 1 }}>
                                {`${part.count} × ${t(`fantasy.scoring.${player.role === 'P' ? 'pitcher' : 'batter'}.${part.key}`)} (${part.per > 0 ? `+${part.per}` : part.per})`}
                            </Txt>
                            <Txt size={14} weight="bold" tabular color={part.pts < 0 ? colors.live : undefined}>
                                {part.pts > 0 ? `+${part.pts}` : part.pts}
                            </Txt>
                        </Row>
                    ))}
                    {captain && (
                        <Row justify="space-between" gap={12} style={{ marginTop: 2, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.line }}>
                            <Txt size={14} weight="semibold">
                                {t('fantasyMore.captainBonus', { x: RULES.captain })}
                            </Txt>
                            <Txt size={14} weight="bold" tabular>
                                {score}
                            </Txt>
                        </Row>
                    )}
                </View>
            )}
        </View>
    );
};
