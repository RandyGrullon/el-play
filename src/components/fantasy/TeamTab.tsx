// «Mi equipo»: 5 bateadores + 1 lanzador; corona para el capitán, X para quitar y candado cuando empieza su juego
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Crown, Lock, Plus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { RULES, isLocked, playerScore, removePlayer, setCaptain, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import { useColors } from '../../theme/theme';
import { shadow } from '../../theme/tokens';
import { PlayerPhoto, Row, Txt } from '../ui';
import { RulesToggle, gameStatus, lineText, teamOf, useOpenPlayer } from './shared';
import { ScoringTable } from './ScoringTable';

export const TeamTab: React.FC<{ day: FantasyDay; entry: DayEntry; onPick: (role: 'B' | 'P') => void }> = ({ day, entry, onPick }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [rules, setRules] = useState(false);
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
                {t('fantasy.rulesShort', { batters: RULES.batters, perTeam: RULES.perTeam })}
            </Txt>
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
                        <PlayerSlot key={slot.id} day={day} entry={entry} player={slot} />
                    )
                )}
            </View>

            <RulesToggle open={rules} onToggle={() => setRules((v) => !v)} />
            {rules && <ScoringTable day={day} />}
        </View>
    );
};

const PlayerSlot: React.FC<{ day: FantasyDay; entry: DayEntry; player: FantasyPlayer }> = ({ day, entry, player }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const openPlayer = useOpenPlayer();
    const team = day.teams[player.teamId];
    const locked = isLocked(day, player);
    const captain = entry.captain === player.id;
    const line = lineText(player, t);
    const small = { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' } as const;
    return (
        <View style={[{ height: 84, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 22, backgroundColor: colors.surface }, shadow('card')]}>
            <Pressable
                onPress={() => openPlayer(player.id)}
                accessibilityRole="button"
                accessibilityLabel={t('statsPage.viewPlayer', { name: player.name })}
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
                    <Txt size={12} weight="semibold" tone="muted" numberOfLines={1}>
                        {team?.abbrev} · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')} · {gameStatus(day, player.gamePk, i18n.language, t)}
                    </Txt>
                    {line && (
                        <Txt size={12} tone="muted" numberOfLines={1}>
                            {line}
                        </Txt>
                    )}
                </View>
            </Pressable>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Txt size={24} weight="extrabold" tabular style={{ lineHeight: 26 }}>
                    {playerScore(entry, player)}
                </Txt>
                {locked ? (
                    <Lock size={14} color={colors.faint} accessibilityLabel={t('fantasy.locked')} />
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
    );
};
