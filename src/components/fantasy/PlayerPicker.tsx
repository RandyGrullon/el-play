// Hoja para escoger peloteros (igual que el PlayerPicker de la web): arriba, siempre a la vista, cuántos faltan y
// cuántos créditos quedan; buscar, rol, filtros (Disponibles, Me alcanza, Titulares, por juego y por equipo) y orden
// (Proyección, Valor, Precio, Pts/J, Últimos 5, % elegido). Cada fila dice su rival, su estado, su temporada, sus
// últimos 5, su precio (con lo que subió o bajó) y, si no se puede agregar, por qué. Tocar la fila abre su ficha con
// «Agregar/Quitar».
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Lock, Plus, Search, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { addPlayer, isLocked, removePlayer, rulesOf, useEntry, useFantasyDay, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import { formatTime } from '../../lib/format';
import { badgeOf, defaultFilters, isFiltered, pickerGames, pickerOptions, pickerRows, reasonOf, roleFull, slotsLeft, type PickExtras, type PickFilters, type PickRow, type PickSort } from '../../lib/fantasyPicker';
import type { LeagueId } from '../../types';
import { usePlayers, type PlayerRow } from '../../lib/stats';
import { useColors } from '../../theme/theme';
import { radius, shadow } from '../../theme/tokens';
import { PlayerPhoto, Row, Segmented, Sheet, TeamLogo, Txt } from '../ui';
import { Field } from '../account/Field';
import { formatCredits, lineText, teamOf } from './shared';
import { formatValue, useOwners } from './Smart';
import { Last5Bars, PriceChip, StatusBadge, matchupText, needText, reasonText, seasonText } from './PlayerBits';

/** Lo que el selector recuerda al ir a la ficha de un pelotero y volver */
export interface PickerState {
    role: 'B' | 'P';
    teamId: number | null;
    search: string;
    /** Los filtros y el orden que tenía (al volver de la ficha) */
    filters?: PickFilters;
    sort?: PickSort;
}

/** La hora sin «p. m.» (para los chips de juego: «LIC-TOR 7:30»), como la web */
export const shortTime = (date: string, lang: string) => formatTime(date, lang).replace(/\s*[ap]\.?\s?m\.?$/i, '');

/** Pts/J y la línea de la temporada actual (si el día no los trae), igual que la web */
export const useSeasonRows = (league: LeagueId) => {
    const stats = usePlayers(league);
    return useMemo(() => {
        const data = stats.data;
        return data && !data.isPreviousSeason ? new Map<number, PlayerRow>(data.players.map((row) => [row.id, row])) : new Map<number, PlayerRow>();
    }, [stats.data]);
};

export const PlayerPicker: React.FC<{ day: FantasyDay; entry: DayEntry; initial: PickerState; onClose: () => void; onOpenPlayer: (id: number, state: PickerState) => void }> = ({
    day,
    entry,
    initial,
    onClose,
    onOpenPlayer
}) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const [filters, setFilters] = useState<PickFilters>(() => initial.filters ?? { ...defaultFilters(initial.role), teamId: initial.teamId, search: initial.search });
    const owners = useOwners(day);
    const seasonRows = useSeasonRows(day.league);
    const options = pickerOptions(day, owners.players.size > 0);
    const [chosenSort, setSort] = useState<PickSort>(initial.sort ?? options.defaultSort);
    const sort = options.sorts.includes(chosenSort) ? chosenSort : options.defaultSort;
    const extras = useMemo<PickExtras>(
        () => ({
            ppg: (player) => {
                const row = seasonRows.get(player.id);
                return row && row.g > 0 ? row.ppg : null;
            },
            owned: (player) => owners.players.get(player.id)?.pct ?? null
        }),
        [seasonRows, owners.players]
    );
    const rows = useMemo(() => pickerRows(day, entry, filters, sort, extras), [day, entry, filters, sort, extras]);
    const set = (change: Partial<PickFilters>) => setFilters((current) => ({ ...current, ...change }));
    const state = (): PickerState => ({ role: filters.role, teamId: filters.teamId, search: filters.search, filters, sort });
    const rules = rulesOf(day);
    const need = needText(day, entry, t, lang);
    const left = slotsLeft(day, entry).credits;
    const over = left !== null && left < -1e-9;
    const full = roleFull(day, entry, filters.role);
    const games = pickerGames(day);
    const filtered = isFiltered(filters);
    const sortLabels: Record<PickSort, string> = {
        proj: t('fantasyHelp.picker.sortProj'),
        value: t('fantasyHelp.picker.sortValue'),
        price: t('fantasyHelp.picker.sortPrice'),
        ppg: t('fantasyHelp.picker.sortPpg'),
        last5: t('fantasyHelp.picker.sortLast5'),
        owned: t('fantasyHelp.picker.sortOwned')
    };

    const chip = (active: boolean, label: string, onPress: () => void, icon?: React.ReactNode, key?: string) => (
        <Pressable
            key={key ?? label}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: icon ? 4 : 12, paddingRight: 12, borderRadius: radius.pill, backgroundColor: active ? colors.ink : colors.raised }}
        >
            {icon}
            <Txt size={12} weight="bold" tabular color={active ? colors.bg : colors.muted} numberOfLines={1}>
                {label}
            </Txt>
        </Pressable>
    );
    const chipRow = (label: string, children: React.ReactNode) => (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} accessibilityLabel={label}>
            {children}
        </ScrollView>
    );

    const header = (
        <View style={{ gap: 12, paddingBottom: 8 }}>
            <Segmented<'B' | 'P'>
                small
                value={filters.role}
                onChange={(role) => set({ role })}
                options={[
                    { value: 'B', label: t('fantasy.batters') },
                    { value: 'P', label: t('fantasy.pitchers') }
                ]}
            />
            <View style={[{ borderRadius: 16 }, shadow('card')]}>
                <View pointerEvents="none" style={{ position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 }}>
                    <Search size={16} color={colors.muted} />
                </View>
                <Field
                    value={filters.search}
                    onChangeText={(search) => set({ search })}
                    placeholder={t('fantasy.search')}
                    accessibilityLabel={t('fantasy.search')}
                    autoCorrect={false}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                    style={{ backgroundColor: colors.surface, paddingLeft: 38, fontSize: 14 }}
                />
            </View>
            {chipRow(
                t('fantasyHelp.picker.filters'),
                <>
                    {chip(filters.available, t('fantasyHelp.picker.available'), () => set({ available: !filters.available }))}
                    {options.affordable && chip(filters.affordable, t('fantasyHelp.picker.affordable'), () => set({ affordable: !filters.affordable }))}
                    {chip(filters.starters, t('fantasyHelp.picker.starters'), () => set({ starters: !filters.starters }))}
                </>
            )}
            {games.length > 1 &&
                chipRow(
                    t('fantasyHelp.picker.byGame'),
                    <>
                        {chip(filters.gamePk === null, t('fantasyHelp.picker.allGames'), () => set({ gamePk: null }))}
                        {games.map((game) =>
                            chip(filters.gamePk === game.gamePk, `${day.teams[game.away.id]?.abbrev ?? game.away.abbrev}-${day.teams[game.home.id]?.abbrev ?? game.home.abbrev}${game.startTimeTBD ? '' : ` ${shortTime(game.date, lang)}`}`, () => set({ gamePk: game.gamePk, teamId: null }), undefined, `game-${game.gamePk}`)
                        )}
                    </>
                )}
            {chipRow(
                t('fantasyHelp.picker.byTeam'),
                <>
                    {chip(filters.teamId === null, t('fantasyHelp.picker.allTeams'), () => set({ teamId: null }))}
                    {Object.values(day.teams).map((team) => chip(filters.teamId === team.id, team.abbrev, () => set({ teamId: team.id, gamePk: null }), <TeamLogo team={team} size={24} />, `team-${team.id}`))}
                </>
            )}
            {/* Margen vertical para que el área táctil de 44 px del Segmented no quede recortada por el ScrollView */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginVertical: -6, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6 }} accessibilityLabel={t('fantasyHelp.picker.sort')}>
                <Segmented<PickSort> small value={sort} onChange={setSort} options={options.sorts.map((value) => ({ value, label: sortLabels[value] }))} />
            </ScrollView>
            <Row justify="space-between" gap={12}>
                <Txt size={12} weight="semibold" tone="muted">
                    {t('fantasyHelp.picker.count', { count: rows.length })}
                </Txt>
                {filtered && (
                    <Pressable onPress={() => setFilters(defaultFilters(filters.role))} accessibilityRole="button" hitSlop={10}>
                        <Txt size={12} weight="bold" tone="accentInk">
                            {t('fantasyHelp.picker.clearFilters')}
                        </Txt>
                    </Pressable>
                )}
            </Row>
            {full && filters.available && (
                <View style={{ borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Txt size={12} weight="semibold">
                        {`${filters.role === 'P' ? t('fantasyHelp.reason.fullP', { count: rules.roster.pitchers }) : t('fantasyHelp.reason.fullB', { n: rules.roster.batters })}. ${t('fantasyHelp.picker.fullHint')}`}
                    </Txt>
                </View>
            )}
        </View>
    );

    return (
        <Sheet open onClose={onClose} title={filters.role === 'P' ? t('fantasy.choosePitcher') : t('fantasy.chooseBatters')} scroll={false}>
            {/* Siempre a la vista: cuántos faltan y cuántos créditos quedan */}
            <Txt size={14} weight="extrabold" tabular tone={over ? 'live' : 'ink'} accessibilityLiveRegion="polite" style={{ paddingBottom: 10 }}>
                {need}
            </Txt>
            <FlatList
                data={rows}
                keyExtractor={(row) => String(row.player.id)}
                renderItem={({ item, index }) => <PickerItem day={day} entry={entry} row={item} sort={sort} first={index === 0} season={seasonRows.get(item.player.id)} onInfo={(player) => onOpenPlayer(player.id, state())} />}
                extraData={entry}
                ListHeaderComponent={header}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 32 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                initialNumToRender={12}
                accessibilityLabel={filters.role === 'P' ? t('fantasy.pitchers') : t('fantasy.batters')}
                ListEmptyComponent={
                    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 32 }}>
                        <Txt size={14} tone="muted" center>
                            {filters.available ? t('fantasyHelp.picker.emptyAvailable') : t('fantasyHelp.picker.empty')}
                        </Txt>
                        {filtered && (
                            <Pressable onPress={() => setFilters({ ...defaultFilters(filters.role), available: false })} accessibilityRole="button" hitSlop={10}>
                                <Txt size={14} weight="bold" tone="accentInk">
                                    {t('fantasyHelp.picker.clearFilters')}
                                </Txt>
                            </Pressable>
                        )}
                    </View>
                }
            />
        </Sheet>
    );
};

const PickerItem: React.FC<{ day: FantasyDay; entry: DayEntry; row: PickRow; sort: PickSort; first: boolean; season?: PlayerRow; onInfo: (player: FantasyPlayer) => void }> = ({ day, entry, row, sort, first, season, onInfo }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const { player, inTeam, locked, reason } = row;
    const blocked = !!reason;
    // Ya en el equipo y su juego empezó: no se puede quitar (como en la ficha)
    const lockedIn = inTeam && locked;
    const today = locked ? lineText(player, t) : null;
    const seasonLine = seasonText(player, season, t);
    // La métrica del orden va primero (en negrita): así se ve por qué está arriba
    const metrics = [
        player.proj !== undefined ? { key: 'proj', text: t('fantasyHelp.picker.proj', { pts: formatCredits(player.proj, lang) }) } : null,
        row.value !== null ? { key: 'value', text: t('fantasyHelp.picker.value', { v: formatValue(row.value, lang) }) } : null,
        row.ppg !== null ? { key: 'ppg', text: t('fantasyHelp.picker.ppg', { ppg: formatCredits(row.ppg, lang) }) } : null,
        sort === 'last5' && row.last5Avg !== null ? { key: 'last5', text: t('fantasyHelp.picker.last5', { list: formatCredits(row.last5Avg, lang) }) } : null,
        row.owned !== null ? { key: 'owned', text: t('fantasyHelp.picker.owned', { pct: formatCredits(row.owned, lang) }) } : null
    ]
        .filter((item): item is { key: string; text: string } => !!item)
        .sort((a, b) => Number(b.key === sort) - Number(a.key === sort));
    const reasonLine = reasonText(reason, t, lang);
    const action = () => {
        const done = inTeam ? removePlayer(day, player) : addPlayer(day, entry, player);
        if (done) Haptics.selectionAsync().catch(() => undefined);
    };
    return (
        <Row gap={10} style={{ paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line, opacity: blocked && !inTeam ? 0.75 : 1 }}>
            <Pressable
                onPress={() => onInfo(player)}
                accessibilityRole="button"
                accessibilityLabel={[t('statsPage.viewPlayer', { name: player.name }), reasonLine].filter(Boolean).join('. ')}
                style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}
            >
                <PlayerPhoto personId={player.id} name={player.name} size={44} team={teamOf(day, player)} />
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Row gap={6}>
                        <Txt size={14} weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {player.name}
                        </Txt>
                        <StatusBadge status={badgeOf(row)} />
                    </Row>
                    <Txt size={12} tone="muted" numberOfLines={1}>
                        <Txt size={12} weight="semibold" tone="muted">
                            {matchupText(day, player, t, lang)}
                        </Txt>
                        {player.pos && player.role === 'B' ? ` · ${player.pos}` : ''}
                    </Txt>
                    {seasonLine && (
                        <Txt size={11} tone="muted" tabular numberOfLines={1}>
                            {seasonLine}
                        </Txt>
                    )}
                    {today ? (
                        <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                            {today}
                        </Txt>
                    ) : metrics.length > 0 ? (
                        <Txt size={11} tone="muted" tabular numberOfLines={1}>
                            {metrics.map((metric, index) => (
                                <Txt key={metric.key} size={11} weight={metric.key === sort ? 'extrabold' : 'semibold'} tone={metric.key === sort ? 'accentInk' : 'muted'}>
                                    {`${index ? ' · ' : ''}${metric.text}`}
                                </Txt>
                            ))}
                        </Txt>
                    ) : null}
                    {blocked && (
                        <Txt size={11} weight="bold" tone={reason?.kind === 'postponed' || reason?.kind === 'budget' ? 'live' : 'faint'}>
                            {reasonLine}
                        </Txt>
                    )}
                </View>
            </Pressable>
            <View style={{ flexShrink: 0, alignItems: 'flex-end', gap: 4 }}>
                {row.last5.length > 0 && <Last5Bars values={row.last5} />}
                {player.price !== undefined && <PriceChip price={player.price} delta={player.priceDelta} />}
                {locked && (
                    <Txt size={18} weight="extrabold" tabular style={{ lineHeight: 20 }}>
                        {formatCredits(player.points, lang)}
                    </Txt>
                )}
            </View>
            <Pressable
                disabled={inTeam ? lockedIn : blocked}
                onPress={action}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={inTeam ? t('fantasy.remove', { name: player.name }) : t('fantasy.add', { name: player.name })}
                accessibilityHint={blocked ? reasonLine : undefined}
                accessibilityState={{ selected: inTeam, disabled: inTeam ? lockedIn : blocked }}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: inTeam ? colors.accent : colors.raised, opacity: inTeam ? (lockedIn ? 0.6 : 1) : blocked ? 0.3 : 1 }}
            >
                {lockedIn || (!inTeam && reason?.kind === 'started') ? <Lock size={16} color={inTeam ? '#fff' : colors.ink} /> : inTeam ? <X size={16} color="#fff" /> : <Plus size={16} color={colors.ink} />}
            </Pressable>
        </Row>
    );
};

/**
 * Botón de la ficha abierta desde el selector (PickerAction de la web): agregar o quitar sin volver a la lista. Lee el
 * mismo día del Fantasy que tenía la pantalla (`date`: el escogido, o sin él «hoy»); al hacerlo, `onDone` vuelve.
 */
export const PickerAction: React.FC<{ league: LeagueId; date?: string; playerId: number; onDone: () => void }> = ({ league, date, playerId, onDone }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const day = useFantasyDay(league, date).data;
    const entry = useEntry(league, day?.date);
    const player = day?.players.find((item) => item.id === playerId);
    if (!day || !player) return null;
    const inTeam = entry.lineup.includes(player.id);
    const reason = inTeam ? null : reasonOf(day, entry, player);
    const blocked = inTeam ? isLocked(day, player) : !!reason || entry.lineup.includes(player.id);
    const ink = inTeam ? colors.ink : '#fff';
    const label = inTeam ? t('fantasy.remove', { name: player.name }) : blocked ? reasonText(reason, t, i18n.language) : t('fantasy.add', { name: player.name });
    return (
        <Pressable
            disabled={blocked}
            onPress={() => {
                if (inTeam ? removePlayer(day, player) : addPlayer(day, entry, player)) {
                    Haptics.selectionAsync().catch(() => undefined);
                    onDone();
                }
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked }}
            style={({ pressed }) => ({ height: 48, borderRadius: radius.tile, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: inTeam ? colors.raised : colors.accent, opacity: blocked ? 0.5 : pressed ? 0.85 : 1 })}
        >
            {inTeam ? <X size={16} color={ink} /> : blocked ? <Lock size={16} color={ink} /> : <Plus size={16} color={ink} />}
            <Txt size={14} weight="extrabold" color={ink} numberOfLines={1} style={{ flexShrink: 1 }}>
                {label}
            </Txt>
        </Pressable>
    );
};

