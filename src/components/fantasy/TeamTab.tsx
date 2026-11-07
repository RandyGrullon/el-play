// «Mi equipo»: 5 bateadores + 1 lanzador; créditos del día, corona para el capitán, X para quitar y candado cuando empieza su juego.
// Con las ayudas de la web: aviso del próximo cierre, proyección, equipo sugerido, equipo ideal y % elegido al cerrar.
// Cada tarjeta dice a qué hora se cierra (después, sus puntos), cómo llega a su juego y los avisos «Pospuesto: cámbialo»,
// «No jugó» y «No cuenta: …» (los puntos son los del equipo que cuenta, los mismos de la tabla), y arriba se ve si el
// equipo ya se guardó. Tocar los puntos de un pelotero abre de dónde salen (el desglose, como en la web).
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Crown, Lock, Plus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { RULES, budgetOf, isLocked, playerPostponed, playerScore, removePlayer, rulesOf, setCaptain, type DayEntry, type FantasyDay, type FantasyPlayer, type NotCounted } from '../../lib/fantasy';
import type { CountedEntry } from '../../lib/fantasyCounted';
import { statusOf } from '../../lib/fantasyPicker';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { PlayerPhoto, Row, Txt } from '../ui';
import { teamTextLink } from '../stats/common';
import { RulesToggle, formatCredits, gameStatus, lineText, teamOf, useOpenPlayer } from './shared';
import { ScoringTable } from './ScoringTable';
import { CreditsMeter } from './CreditsMeter';
import { IdealCard, LockNotice, SmartActions, useOwners } from './Smart';
import type { FantasyOwners } from './fans';
import { pointParts } from '../pro/fantasy/logic';
import type { SaveStatus } from '../pro/fantasy/data';
import { CardWarning, SaveLine, StatusBadge, lockText } from './PlayerBits';
import { HelpButton } from './Help';

export const TeamTab: React.FC<{ day: FantasyDay; entry: DayEntry; counted: CountedEntry; saveStatus: SaveStatus; onPick: (role: 'B' | 'P') => void }> = ({ day, entry, counted, saveStatus, onPick }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [rules, setRules] = useState(false);
    const owners = useOwners(day);
    const dayRules = rulesOf(day);
    const lang = i18n.language;
    const chosen = entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    const batters = chosen.filter((p) => p.role === 'B');
    const pitchers = chosen.filter((p) => p.role === 'P');
    const slots: (FantasyPlayer | 'B' | 'P')[] = [
        ...batters,
        ...Array.from({ length: Math.max(0, RULES.batters - batters.length) }, () => 'B' as const),
        ...pitchers,
        ...Array.from({ length: Math.max(0, RULES.pitchers - pitchers.length) }, () => 'P' as const)
    ];
    const chip = (text: string, extra?: React.ReactNode) => (
        <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 26, borderRadius: radius.pill, paddingLeft: 10, paddingRight: extra ? 2 : 10, backgroundColor: colors.raised }}>
            <Txt size={12} weight="bold">
                {text}
            </Txt>
            {extra}
        </View>
    );

    return (
        <View style={{ gap: 12 }} accessibilityLabel={t('fantasy.myTeam')}>
            <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    {chip(t('fantasyHelp.rules.roster', { batters: dayRules.roster.batters, count: dayRules.roster.pitchers }))}
                    {chip(t('fantasyHelp.rules.perTeam', { n: dayRules.perTeam }))}
                    {chip(t('fantasyHelp.rules.captain', { x: formatCredits(dayRules.captain, lang) }), <HelpButton topic="captain" date={day.date} />)}
                </View>
                <Row justify="space-between" gap={12}>
                    <Txt size={12} tone="muted" style={{ flex: 1 }}>
                        {t('fantasyHelp.rules.lock')}
                    </Txt>
                    <SaveLine status={saveStatus} />
                </Row>
            </View>
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
                        <PlayerSlot key={slot.id} day={day} entry={entry} counted={counted.entry} notCounted={counted.notCounted.get(slot.id)} player={slot} owned={owners.players.get(slot.id)} />
                    )
                )}
            </View>

            <IdealCard day={day} entry={counted.entry} />

            <RulesToggle open={rules} onToggle={() => setRules((v) => !v)} />
            {rules && <ScoringTable day={day} />}
        </View>
    );
};

const PlayerSlot: React.FC<{ day: FantasyDay; entry: DayEntry; counted: DayEntry; notCounted?: NotCounted; player: FantasyPlayer; owned?: FantasyOwners['players'][number] }> = ({ day, entry, counted, notCounted, player, owned }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const openPlayer = useOpenPlayer();
    const lang = i18n.language;
    const team = day.teams[player.teamId];
    const locked = isLocked(day, player);
    const postponed = playerPostponed(day, player);
    const status = statusOf(day, player);
    const captain = entry.captain === player.id;
    const line = lineText(player, t);
    const closes = lockText(day, player, t, lang);
    // Precio del día (solo días con créditos): al final de la línea de la hora, como en la web. Si no cabe, lo que se
    // recorta es el precio (la hora no se encoge por él y solo se corta si ella sola no cabe), así la hora de cierre
    // se sigue viendo. El lector lo dice completo en la etiqueta del botón
    const price = budgetOf(day) !== null && player.price !== undefined ? formatCredits(player.price, lang) : null;
    const small = { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' } as const;
    // De dónde salen sus puntos (solo si ya jugó)
    const [breakdown, setBreakdown] = useState(false);
    const parts = player.played ? pointParts(player, day.scoring) : [];
    // Sus puntos en el equipo que cuenta (con la corona que cuenta); si no cuenta, sus puntos tachados
    const counts = counted.lineup.includes(player.id);
    const score = formatCredits(counts ? playerScore(counted, player, rulesOf(day).captain) : player.points, lang);
    const warning = postponed
        ? { text: t('fantasyHelp.card.postponed'), tone: 'down' as const }
        : notCounted
          ? { text: t(notCounted === 'late' ? 'fantasyHelp.card.notCountingLate' : 'fantasyHelp.card.notCountingOver'), tone: 'down' as const }
          : status === 'dnp'
            ? { text: t('fantasyHelp.card.dnp'), tone: 'muted' as const }
            : null;
    const scoreText = (
        <Txt
            size={24}
            weight="extrabold"
            tabular
            color={counts ? undefined : colors.faint}
            style={[{ lineHeight: 26 }, !counts ? { textDecorationLine: 'line-through' } : parts.length > 0 && { textDecorationLine: 'underline', textDecorationStyle: 'dotted' }]}
        >
            {score}
        </Txt>
    );
    return (
        <View>
            {/* Encima del desglose, que sale por debajo */}
            <View
                style={[
                    { zIndex: 1, minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 2, borderColor: captain ? alpha(colors.gold, 0.6) : 'transparent' },
                    shadow('card')
                ]}
            >
                <Pressable
                    onPress={() => openPlayer(player.id)}
                    accessibilityRole="button"
                    accessibilityLabel={
                        price === null ? t('statsPage.viewPlayer', { name: player.name }) : `${t('statsPage.viewPlayer', { name: player.name })}, ${t('fantasy.credits.priceLong', { price })}`
                    }
                    style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}
                >
                    <PlayerPhoto personId={player.id} name={player.name} size={56} team={teamOf(day, player)} />
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Row gap={6}>
                            {captain && <Crown size={16} color={colors.gold} accessibilityLabel={t('fantasy.captain')} />}
                            <Txt weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                {player.name}
                            </Txt>
                        </Row>
                        <Row gap={0}>
                            <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flexShrink: 0, maxWidth: '100%' }}>
                                <Text {...teamTextLink(team?.id)}>{team?.abbrev}</Text> · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')} · {closes ?? gameStatus(day, player.gamePk, lang, t)}
                            </Txt>
                            {price !== null && (
                                // Espacio duro al empezar: en un texto de una línea aparte el espacio normal se pierde (en la web)
                                <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }}>
                                    {` · ${t('fantasy.credits.price', { price })}`}
                                </Txt>
                            )}
                        </Row>
                        {line && (
                            <Txt size={12} tone="muted" numberOfLines={1}>
                                {line}
                            </Txt>
                        )}
                        {!locked && !postponed && player.proj !== undefined && (
                            <Txt size={12} weight="bold" tone="accentInk" numberOfLines={1}>
                                {t('fantasy.smart.proj', { pts: formatCredits(player.proj, lang) })}
                                {/* El lanzador: si abrió el último juego o hace cuántos días (como en la web) */}
                                {player.rest ? ` · ${t('fantasy.smart.restShort')}` : player.startedAgo !== undefined ? ` · ${t('fantasy.smart.startedAgo', { count: player.startedAgo })}` : ''}
                            </Txt>
                        )}
                        {(warning || (status && status !== 'started' && status !== 'dnp' && status !== 'postponed')) && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                                {status && status !== 'started' && status !== 'dnp' && status !== 'postponed' ? <StatusBadge status={status} /> : null}
                                {warning ? <CardWarning text={warning.text} tone={warning.tone} /> : null}
                            </View>
                        )}
                    </View>
                </Pressable>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {locked ? (
                        parts.length ? (
                            <Pressable onPress={() => setBreakdown((value) => !value)} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: breakdown }} accessibilityLabel={`${score}. ${t('fantasyMore.breakdownOf', { name: player.name })}`}>
                                {scoreText}
                            </Pressable>
                        ) : (
                            scoreText
                        )
                    ) : null}
                    {locked ? (
                        <Row gap={4}>
                            {owned && (
                                <Txt size={11} weight="semibold" tone="faint" tabular accessibilityLabel={t('fantasy.smart.owned', { pct: formatCredits(owned.pct, lang) })}>
                                    {`${formatCredits(owned.pct, lang)} %`}
                                </Txt>
                            )}
                            <Lock size={14} color={colors.faint} accessibilityLabel={t('fantasy.locked')} />
                        </Row>
                    ) : (
                        <Row gap={4}>
                            {!postponed && (
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
                            )}
                            <Pressable
                                onPress={() => removePlayer(day, player)}
                                hitSlop={4}
                                accessibilityRole="button"
                                accessibilityLabel={t('fantasy.remove', { name: player.name })}
                                style={[small, { backgroundColor: postponed ? alpha(colors.live, 0.15) : colors.raised }]}
                            >
                                <X size={14} color={postponed ? colors.live : colors.muted} />
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
