// Hoja para escoger peloteros: bateadores o lanzadores, buscar, filtrar por equipo, precio en créditos, proyección y valor
// (ordenar por proyección, valor, precio o puntos) y (en PRO) el promedio de la temporada
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Lock, Plus, Search, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { addPlayer, canAdd, creditsLeft, perTeamLimit, removePlayer, type AddProblem, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import { useIsPro } from '../../lib/pro';
import { usePlayers } from '../../lib/stats';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { PlayerPhoto, ProBadge, Row, Segmented, Sheet, TeamLogo, Txt } from '../ui';
import { Field } from '../account/Field';
import { formatCredits, gameStatus, lineText, teamOf } from './shared';
import { valueOf } from '../../lib/fantasyBest';
import { formatValue, useOwners } from './Smart';

type Sort = 'proj' | 'value' | 'price' | 'points';

/** Lo que el selector recuerda al ir a la ficha de un pelotero y volver */
export interface PickerState {
    role: 'B' | 'P';
    teamId: number | null;
    search: string;
}

const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const PlayerPicker: React.FC<{ day: FantasyDay; entry: DayEntry; initial: PickerState; onClose: () => void; onOpenPlayer: (id: number, state: PickerState) => void }> = ({
    day,
    entry,
    initial,
    onClose,
    onOpenPlayer
}) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [role, setRole] = useState<'B' | 'P'>(initial.role);
    const [teamId, setTeamId] = useState<number | null>(initial.teamId);
    const [search, setSearch] = useState(initial.search);
    const started = day.games.some((game) => game.state !== 'preview');
    const hasProj = day.players.some((p) => p.proj !== undefined);
    const owners = useOwners(day);
    const [sort, setSort] = useState<Sort>(started ? 'points' : hasProj ? 'proj' : 'points');
    // PRO: puntos de fantasy por juego en la temporada, para escoger con datos
    const pro = useIsPro();
    const season = usePlayers(day.league);
    const averages = useMemo(() => (pro ? new Map((season.data?.players ?? []).map((row) => [row.id, row])) : null), [pro, season.data]);

    const list = useMemo(() => {
        const metric = (p: FantasyPlayer) => (sort === 'proj' ? p.proj ?? -1 : sort === 'value' ? valueOf(p) ?? -1 : sort === 'price' ? p.price ?? 0 : p.points);
        return day.players
                .filter((p) => p.role === role && (teamId === null || p.teamId === teamId) && (!search || normalized(p.name).includes(normalized(search))))
                .sort(
                    (a, b) =>
                        (hasProj ? metric(b) - metric(a) : started ? b.points - a.points : 0) ||
                        (averages ? (averages.get(b.id)?.ppg ?? 0) - (averages.get(a.id)?.ppg ?? 0) : 0) ||
                        Number(b.starter) - Number(a.starter) ||
                        a.name.localeCompare(b.name)
                );
    }, [day.players, role, teamId, search, started, averages, sort, hasProj]);

    const left = creditsLeft(day, entry);
    const problemText = (problem: AddProblem) =>
        problem === 'locked'
            ? t('fantasy.problem.locked')
            : problem === 'full'
              ? role === 'P'
                  ? t('fantasy.problem.fullP')
                  : t('fantasy.problem.fullB')
              : problem === 'team'
                ? t('fantasy.problem.team', { n: perTeamLimit(day) })
                : problem === 'budget'
                  ? t('fantasy.problem.budget', { left: formatCredits(Math.max(0, left ?? 0), i18n.language) })
                  : problem === 'already'
                    ? t('fantasy.problem.already')
                    : '';

    const chip = (active: boolean) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, borderRadius: radius.pill, backgroundColor: active ? colors.ink : colors.raised }) as const;

    const renderPlayer = ({ item: player, index }: { item: FantasyPlayer; index: number }) => {
        const problem = canAdd(day, entry, player);
        const inTeam = entry.lineup.includes(player.id);
        const team = day.teams[player.teamId];
        const line = lineText(player, t);
        const average = averages?.get(player.id);
        const price = day.credits && player.price !== undefined ? formatCredits(player.price, i18n.language) : null;
        return (
            <Row gap={12} style={{ paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                <Pressable
                    onPress={() => onOpenPlayer(player.id, { role, teamId, search })}
                    accessibilityRole="button"
                    accessibilityLabel={t('statsPage.viewPlayer', { name: player.name })}
                    style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}
                >
                    <PlayerPhoto personId={player.id} name={player.name} size={44} team={teamOf(day, player)} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Row gap={6}>
                            <Txt size={14} weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                {player.name}
                            </Txt>
                            {player.starter && (
                                <View style={{ borderRadius: radius.pill, backgroundColor: alpha(colors.accent, 0.1), paddingHorizontal: 6, paddingVertical: 1 }}>
                                    <Txt size={10} weight="bold" tone="accentInk">
                                        {t('fantasy.starter')}
                                    </Txt>
                                </View>
                            )}
                        </Row>
                        <Txt size={12} tone="muted" numberOfLines={1}>
                            {team?.abbrev} · {player.pos || '—'} · {gameStatus(day, player.gamePk, i18n.language, t)}
                            {line ? ` · ${line}` : ''}
                        </Txt>
                        {average && (
                            <Txt size={11} weight="bold" tone="accentInk">
                                {t('pro.fantasyAvg', { ppg: average.ppg, g: average.g })}
                            </Txt>
                        )}
                        {player.proj !== undefined && (
                            <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                                {t('fantasy.smart.proj', { pts: formatCredits(player.proj, i18n.language) })}
                                {valueOf(player) !== null ? ` · ${t('fantasy.smart.value', { v: formatValue(valueOf(player)!, i18n.language) })}` : ''}
                                {player.rest ? ` · ${t('fantasy.smart.restShort')}` : player.startedAgo !== undefined ? ` · ${t('fantasy.smart.startedAgo', { count: player.startedAgo })}` : ''}
                                {owners.players.get(player.id) ? ` · ${t('fantasy.smart.owned', { pct: formatCredits(owners.players.get(player.id)!.pct, i18n.language) })}` : ''}
                            </Txt>
                        )}
                        {problem && problem !== 'already' && (
                            <Txt size={11} weight="semibold" tone="faint">
                                {problemText(problem)}
                            </Txt>
                        )}
                    </View>
                </Pressable>
                {(started || price !== null) && (
                    // Puntos y precio en una sola columna (puntos arriba, como en Mi equipo): uno al lado del otro le
                    // quitaban al nombre casi 50 px y a 320 px todos los nombres salían cortados
                    <View style={{ flexShrink: 0, alignItems: 'flex-end', gap: 2 }}>
                        {started && (
                            <Txt size={18} weight="extrabold" tabular style={{ minWidth: 36, textAlign: 'right' }}>
                                {formatCredits(player.points, i18n.language)}
                            </Txt>
                        )}
                        {price !== null && (
                            <View style={{ borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 8, paddingVertical: 4 }}>
                                <Txt size={12} weight="extrabold" tabular accessibilityLabel={t('fantasy.credits.priceLong', { price })}>
                                    {t('fantasy.credits.price', { price })}
                                </Txt>
                            </View>
                        )}
                    </View>
                )}
                <Pressable
                    disabled={!inTeam && !!problem}
                    onPress={() => {
                        const done = inTeam ? removePlayer(day, player) : addPlayer(day, entry, player);
                        if (done) Haptics.selectionAsync().catch(() => undefined);
                    }}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={inTeam ? t('fantasy.remove', { name: player.name }) : t('fantasy.add', { name: player.name })}
                    accessibilityState={{ selected: inTeam, disabled: !inTeam && !!problem }}
                    style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: inTeam ? colors.accent : colors.raised, opacity: !inTeam && problem ? 0.3 : 1 }}
                >
                    {inTeam ? <X size={16} color="#fff" /> : problem === 'locked' ? <Lock size={16} color={colors.ink} /> : <Plus size={16} color={colors.ink} />}
                </Pressable>
            </Row>
        );
    };

    return (
        <Sheet open onClose={onClose} title={role === 'P' ? t('fantasy.choosePitcher') : t('fantasy.chooseBatters')} scroll={false}>
            <View style={{ gap: 12, paddingBottom: 4 }}>
                {pro && (
                    <Row gap={8}>
                        <ProBadge />
                        <Txt size={12} weight="semibold" tone="muted" style={{ flex: 1 }}>
                            {t('pro.fantasyHint')}
                        </Txt>
                    </Row>
                )}
                {day.credits && left !== null && (
                    <Txt size={14} weight="bold" tabular tone={left < -1e-9 ? 'live' : 'ink'}>
                        {t('fantasy.credits.pickerLeft', { left: formatCredits(left, i18n.language), budget: formatCredits(day.credits.budget, i18n.language) })}
                    </Txt>
                )}
                <Segmented<'B' | 'P'>
                    small
                    value={role}
                    onChange={setRole}
                    options={[
                        { value: 'B', label: t('fantasy.batters') },
                        { value: 'P', label: t('fantasy.pitchers') }
                    ]}
                />
                {hasProj && (
                    <View accessibilityLabel={t('fantasy.smart.sort')}>
                        <Segmented<Sort>
                            small
                            value={sort}
                            onChange={setSort}
                            options={[
                                { value: 'proj', label: t('fantasy.smart.sortProj') },
                                { value: 'value', label: t('fantasy.smart.sortValue') },
                                { value: 'price', label: t('fantasy.smart.sortPrice') },
                                ...(started ? [{ value: 'points' as Sort, label: t('fantasy.smart.sortPoints') }] : [])
                            ]}
                        />
                    </View>
                )}
                <View style={[{ borderRadius: 16 }, shadow('card')]}>
                    <View pointerEvents="none" style={{ position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 }}>
                        <Search size={16} color={colors.muted} />
                    </View>
                    <Field
                        value={search}
                        onChangeText={setSearch}
                        placeholder={t('fantasy.search')}
                        accessibilityLabel={t('fantasy.search')}
                        autoCorrect={false}
                        returnKeyType="search"
                        clearButtonMode="while-editing"
                        style={{ backgroundColor: colors.surface, paddingLeft: 38, fontSize: 14 }}
                    />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} accessibilityLabel={t('fantasy.filterTeam')}>
                    <Pressable onPress={() => setTeamId(null)} accessibilityRole="button" accessibilityState={{ selected: teamId === null }} style={[chip(teamId === null), { paddingHorizontal: 12 }]}>
                        <Txt size={12} weight="bold" color={teamId === null ? colors.bg : colors.muted}>
                            {t('fantasy.allTeams')}
                        </Txt>
                    </Pressable>
                    {Object.values(day.teams).map((team) => (
                        <Pressable key={team.id} onPress={() => setTeamId(team.id)} accessibilityRole="button" accessibilityState={{ selected: teamId === team.id }} style={[chip(teamId === team.id), { paddingLeft: 4, paddingRight: 12 }]}>
                            <TeamLogo team={team} size={22} />
                            <Txt size={12} weight="bold" color={teamId === team.id ? colors.bg : colors.muted}>
                                {team.abbrev}
                            </Txt>
                        </Pressable>
                    ))}
                </ScrollView>
            </View>
            <FlatList
                data={list}
                keyExtractor={(player) => String(player.id)}
                renderItem={renderPlayer}
                extraData={entry}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 32 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                initialNumToRender={14}
                ListEmptyComponent={
                    <Txt size={14} tone="muted" center style={{ paddingVertical: 32 }}>
                        {t('fantasy.noPlayers')}
                    </Txt>
                }
            />
        </Sheet>
    );
};
