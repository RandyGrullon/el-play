// Portada del Fantasy sin cuenta: los 3 pasos, la tarjeta para entrar, los que más suman hoy (o quién juega) y las reglas
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Crown, Sparkles, Trophy, Users } from 'lucide-react-native';
import { RULES, type FantasyDay } from '../../lib/fantasy';
import { formatTime } from '../../lib/format';
import { useColors } from '../../theme/theme';
import { radius, shadow } from '../../theme/tokens';
import { Card, Gradient, PlayerPhoto, Row, Skeleton, TeamLogo, Txt } from '../ui';
import { AccountCard } from '../account/AccountCard';
import { ScoringTable } from './ScoringTable';
import { RulesToggle, lineText, teamOf, useOpenPlayer } from './shared';

export const FantasyGate: React.FC<{ day?: FantasyDay; loading: boolean }> = ({ day, loading }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const openPlayer = useOpenPlayer();
    const [rules, setRules] = useState(false);
    const started = !!day?.games.some((game) => game.state !== 'preview');
    const top = day && started ? day.players.filter((p) => p.played).sort((a, b) => b.points - a.points).slice(0, 5) : [];
    const steps = [
        { Icon: Users, text: t('fantasy.gate.step1', { batters: RULES.batters, perTeam: RULES.perTeam }) },
        { Icon: Crown, text: t('fantasy.gate.step2', { x: RULES.captain }) },
        { Icon: Trophy, text: t('fantasy.gate.step3', { pts: RULES.pick }) }
    ];

    return (
        <>
            <View style={[{ borderRadius: radius.card }, shadow('float')]}>
                <Gradient style={{ borderRadius: radius.card, padding: 20, overflow: 'hidden' }}>
                    <View pointerEvents="none" style={{ position: 'absolute', right: -16, top: -16, opacity: 0.15 }}>
                        <Sparkles size={112} color="#fff" />
                    </View>
                    <Txt eyebrow color="rgba(255,255,255,0.85)">
                        {t('fantasy.gate.eyebrow')}
                    </Txt>
                    <Txt size={28} weight="extrabold" tone="white" accessibilityRole="header" style={{ marginTop: 4, lineHeight: 31, maxWidth: 320 }}>
                        {t('fantasy.gate.title')}
                    </Txt>
                    <Txt size={14} tone="white" style={{ marginTop: 8, opacity: 0.9, maxWidth: 420 }}>
                        {t('fantasy.gate.lead')}
                    </Txt>
                    <View style={{ marginTop: 16, gap: 10 }}>
                        {steps.map(({ Icon, text }) => (
                            <Row key={text} gap={12} align="flex-start">
                                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' }}>
                                    <Icon size={16} color="#fff" />
                                </View>
                                <Txt size={14} weight="semibold" tone="white" style={{ flex: 1, paddingTop: 6, lineHeight: 19 }}>
                                    {text}
                                </Txt>
                            </Row>
                        ))}
                    </View>
                </Gradient>
            </View>

            <AccountCard purpose="fantasy" />

            {loading ? (
                <Skeleton height={160} />
            ) : top.length > 0 ? (
                <View style={{ gap: 8 }}>
                    <Txt eyebrow accessibilityRole="header">
                        {t('fantasy.gate.topToday')}
                    </Txt>
                    <Card padded={false} style={{ overflow: 'hidden' }}>
                        {top.map((player, index) => {
                            const team = day?.teams[player.teamId];
                            const line = lineText(player, t);
                            return (
                                <Pressable
                                    key={player.id}
                                    onPress={() => openPlayer(player.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('statsPage.viewPlayer', { name: player.name })}
                                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, backgroundColor: pressed ? colors.raised : 'transparent' })}
                                >
                                    <Txt size={18} weight="extrabold" tone="muted" center style={{ width: 20 }}>
                                        {index + 1}
                                    </Txt>
                                    <PlayerPhoto personId={player.id} name={player.name} size={44} team={teamOf(day, player)} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Txt size={14} weight="extrabold" numberOfLines={1}>
                                            {player.name}
                                        </Txt>
                                        <Txt size={12} tone="muted" numberOfLines={1}>
                                            {team?.abbrev} · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')}
                                            {line ? ` · ${line}` : ''}
                                        </Txt>
                                    </View>
                                    <Txt size={20} weight="extrabold" tabular>
                                        {player.points}
                                    </Txt>
                                </Pressable>
                            );
                        })}
                    </Card>
                </View>
            ) : day && day.games.length > 0 ? (
                <View style={{ gap: 8 }}>
                    <Txt eyebrow accessibilityRole="header">
                        {t('fantasy.gate.playingToday')}
                    </Txt>
                    {day.games.map((game) => (
                        <Card key={game.gamePk} style={{ padding: 12 }}>
                            <Row gap={8}>
                                <TeamLogo team={game.away} size={30} />
                                <Txt size={14} weight="extrabold">
                                    {game.away.abbrev}
                                </Txt>
                                <Txt size={12} weight="semibold" tone="muted" center style={{ flex: 1 }}>
                                    {formatTime(game.date, i18n.language)}
                                </Txt>
                                <Txt size={14} weight="extrabold">
                                    {game.home.abbrev}
                                </Txt>
                                <TeamLogo team={game.home} size={30} />
                            </Row>
                        </Card>
                    ))}
                </View>
            ) : null}

            {day && (
                <>
                    <RulesToggle open={rules} onToggle={() => setRules((v) => !v)} />
                    {rules && <ScoringTable day={day} />}
                </>
            )}
        </>
    );
};
