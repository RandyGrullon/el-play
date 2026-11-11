// «Escoge peloteros» del Fantasy PRO: la misma lista del Lite y la web (src/lib/fantasyPicker.ts: los mismos datos,
// filtros, orden y razones) con la vista PRO: arriba cuántos faltan y los créditos que quedan, buscar, filtros
// (Disponibles, Me alcanza, Titulares, por juego y por equipo), orden (Proyección, Valor, Precio, Pts/J, Últimos 5,
// % elegido) y una tabla con la métrica del orden, los últimos 5 en barritas y el botón. «Cambiar» saca a uno de tu
// equipo y mete al que escojas (la corona pasa al que entra).
import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { ArrowDownWideNarrow, Check, Crown, Lock, Plus, Search, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { addPlayer, canAdd, removePlayer, rulesOf, setCaptain, withUndo, type DayEntry, type FantasyDay, type FantasyPlayer, type PlayerStatus } from '../../../lib/fantasy';
import { DEFAULT_FILTERS, badgeOf, isFiltered, pickerGames, pickerOptions, pickerRows, roleFull, slotsLeft, sortValue, type PickExtras, type PickFilters, type PickRow, type PickSort } from '../../../lib/fantasyPicker';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { PlayerPhoto, TeamLogo, Txt } from '../../ui';
import { Field } from '../../account/Field';
import { formatCredits, lineText } from '../../fantasy/shared';
import { formatValue, useOwners } from '../../fantasy/Smart';
import { Last5Bars, PriceChip, StatusBadge, matchupText, needText, reasonText, seasonText } from '../../fantasy/PlayerBits';
import { shortTime } from '../../fantasy/PlayerPicker';
import { ChipButton, ChipRow, ModuleHeader, ProNote, ProSegmented, shortName, useProColors, useReorder } from '../kit';
import { Num, fmtPts } from './bits';
import type { ScoutSeason } from './data';
import type { FormItem } from './TeamGrid';

/** Filas que se ven de entrada (el resto con «Ver más») */
const PAGE = 12;

interface ScoutingProps {
    day: FantasyDay;
    entry: DayEntry;
    role: 'B' | 'P';
    onRole: (role: 'B' | 'P') => void;
    /** Pelotero que sale al escoger otro («Cambiar») */
    replacing: FantasyPlayer | null;
    onCancelReplace: () => void;
    scout: ScoutSeason;
    form: Record<string, FormItem[]> | undefined;
    /** Cómo llega cada bateador según las alineaciones publicadas o esperadas (si el día no lo dice) */
    lineupStatus: Map<number, PlayerStatus>;
    now: number;
    onInfo: (player: FantasyPlayer) => void;
}

export const Scouting: React.FC<ScoutingProps> = ({ day, entry, role, onRole, replacing, onCancelReplace, scout, form, lineupStatus, now, onInfo }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const reorder = useReorder();
    const narrow = useWindowDimensions().width < 360;
    // El rol lo maneja la pantalla («Cambiar» lo pone); el resto de los filtros, aquí
    const [rest, setRest] = useState<Omit<PickFilters, 'role'>>(() => ({ ...DEFAULT_FILTERS }));
    const filters: PickFilters = { ...rest, role };
    const set = (change: Partial<Omit<PickFilters, 'role'>>) => setRest((current) => ({ ...current, ...change }));
    const reset = (change: Partial<Omit<PickFilters, 'role'>> = {}) => setRest({ ...DEFAULT_FILTERS, ...change });
    const [limit, setLimit] = useState(PAGE);
    // Mientras se cambia a alguien, se escoge como si ya hubiera salido
    const base: DayEntry = replacing ? { ...entry, lineup: entry.lineup.filter((id) => id !== replacing.id), captain: entry.captain === replacing.id ? null : entry.captain } : entry;
    const owners = useOwners(day);
    const options = pickerOptions(day, owners.players.size > 0);
    const [chosenSort, setSort] = useState<PickSort>(options.defaultSort);
    const sort = options.sorts.includes(chosenSort) ? chosenSort : options.defaultSort;
    // Pts/J y la temporada: de la temporada en curso (como el Lite y la web); los últimos 5 del día o, si no vienen, la forma PRO
    const current = !scout.previous;
    const extras = useMemo<PickExtras>(
        () => ({
            ppg: (player) => {
                const row = current ? scout.rows.get(player.id) : undefined;
                return row && row.g > 0 ? row.ppg : null;
            },
            owned: (player) => owners.players.get(player.id)?.pct ?? null,
            last5: (player) =>
                form?.[player.id]
                    ?.slice(0, 5)
                    .map((item) => item.pts)
                    .reverse() ?? null,
            status: (player) => lineupStatus.get(player.id) ?? null
        }),
        [current, scout.rows, owners.players, form, lineupStatus]
    );
    const rows = useMemo(() => pickerRows(day, base, filters, sort, extras, now), [day, base, filters, sort, extras, now]);
    const shown = rows.slice(0, limit);
    const games = pickerGames(day);
    const rules = rulesOf(day);
    const left = slotsLeft(day, base).credits;
    const filtered = isFiltered(filters);
    const full = !replacing && roleFull(day, entry, role);
    const roleCount = (r: 'B' | 'P') => entry.lineup.map((id) => day.players.find((player) => player.id === id)).filter((player) => player?.role === r).length;
    const sortLabels: Record<PickSort, string> = {
        proj: t('fantasyHelp.picker.sortProj'),
        value: t('fantasyHelp.picker.sortValue'),
        price: t('fantasyHelp.picker.sortPrice'),
        ppg: t('fantasyHelp.picker.sortPpg'),
        last5: t('fantasyHelp.picker.sortLast5'),
        owned: t('fantasyHelp.picker.sortOwned')
    };

    const act = (player: FantasyPlayer) => {
        if (entry.lineup.includes(player.id)) {
            if (removePlayer(day, player)) Haptics.selectionAsync().catch(() => undefined);
            return;
        }
        if (replacing) {
            const wasCaptain = entry.captain === replacing.id;
            if (canAdd(day, base, player)) return;
            // Cambiar a uno por otro se deshace de una vez
            withUndo(day, 'add', () => {
                removePlayer(day, replacing);
                addPlayer(day, base, player);
                if (wasCaptain) setCaptain(day, base, player);
            });
            onCancelReplace();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            return;
        }
        if (addPlayer(day, entry, player)) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    };

    // Columnas: pelotero (lo que sobra), la métrica del orden, los últimos 5 y la acción
    const W = { metric: narrow ? 48 : 56, last5: 40, act: 44 };
    const metricText = (row: PickRow) => {
        // Con su juego empezado, lo que lleva hoy
        if (row.locked) return fmtPts(row.player.points);
        const value = sortValue(row, sort);
        if (value === null) return '—';
        return sort === 'value' ? formatValue(value, lang) : sort === 'owned' ? `${Math.round(value)}%` : fmtPts(value);
    };

    const rowOf = (row: PickRow) => {
        const { player, inTeam, locked, reason } = row;
        const captain = entry.captain === player.id;
        const blocked = !!reason;
        const lockedIn = inTeam && locked;
        const today = locked ? lineText(player, t) : null;
        const seasonLine = seasonText(player, current ? scout.rows.get(player.id) : undefined, t);
        const reasonLine = reasonText(reason, t, lang);
        const metrics = [
            player.proj !== undefined ? { key: 'proj', text: t('fantasyHelp.picker.proj', { pts: formatCredits(player.proj, lang) }) } : null,
            row.value !== null ? { key: 'value', text: t('fantasyHelp.picker.value', { v: formatValue(row.value, lang) }) } : null,
            row.ppg !== null ? { key: 'ppg', text: t('fantasyHelp.picker.ppg', { ppg: formatCredits(row.ppg, lang) }) } : null,
            row.owned !== null ? { key: 'owned', text: t('fantasyHelp.picker.owned', { pct: formatCredits(row.owned, lang) }) } : null
        ]
            .filter((item): item is { key: string; text: string } => !!item)
            .sort((a, b) => Number(b.key === sort) - Number(a.key === sort));
        const actionLabel = inTeam
            ? t('pro.fantasy.pick.removeLabel', { name: player.name })
            : blocked
              ? `${t('fantasy.add', { name: player.name })}: ${reasonLine}`
              : replacing
                ? t('pro.fantasy.pick.replaceLabel', { name: player.name, out: replacing.name })
                : t('fantasy.add', { name: player.name });
        return (
            <Animated.View key={player.id} layout={reorder} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'stretch', gap: 6, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), opacity: blocked && !inTeam ? 0.75 : 1 }}>
                <Pressable
                    onPress={() => onInfo(player)}
                    accessibilityRole="button"
                    accessibilityLabel={[t('statsPage.viewPlayer', { name: player.name }), reasonLine].filter(Boolean).join('. ')}
                    style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}
                >
                    <PlayerPhoto personId={player.id} name={player.name} size={36} team={day.teams[player.teamId] ? { id: player.teamId, logo: day.teams[player.teamId].logo, color: day.teams[player.teamId].color } : null} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {captain && <Crown size={13} color={colors.gold} accessibilityLabel={t('fantasy.captain')} />}
                            <Txt size={13} weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                {shortName(player.name)}
                            </Txt>
                        </View>
                        <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                            {matchupText(day, player, t, lang)}
                            {player.pos && player.role === 'B' ? ` · ${player.pos}` : ''}
                        </Txt>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                            <StatusBadge status={badgeOf(row)} />
                            {player.price !== undefined && <PriceChip price={player.price} delta={player.priceDelta} />}
                        </View>
                        {seasonLine && (
                            <Txt size={10} tone="muted" tabular numberOfLines={1}>
                                {seasonLine}
                            </Txt>
                        )}
                        {today ? (
                            <Txt size={10} weight="semibold" tone="muted" numberOfLines={1}>
                                {today}
                            </Txt>
                        ) : metrics.length ? (
                            <Txt size={10} tone="muted" tabular numberOfLines={1}>
                                {metrics.map((metric, index) => (
                                    <Txt key={metric.key} size={10} weight={metric.key === sort ? 'extrabold' : 'semibold'} color={metric.key === sort ? colors.accentInk : colors.muted}>
                                        {`${index ? ' · ' : ''}${metric.text}`}
                                    </Txt>
                                ))}
                            </Txt>
                        ) : null}
                        {blocked && (
                            <Txt size={11} weight="bold" color={reason?.kind === 'postponed' || reason?.kind === 'budget' ? pro.down : colors.faint} numberOfLines={2}>
                                {reasonLine}
                            </Txt>
                        )}
                    </View>
                </Pressable>
                <View style={{ width: W.metric, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 6, backgroundColor: !locked ? alpha(colors.accent, 0.08) : 'transparent' }}>
                    <Num size={20}>{metricText(row)}</Num>
                    <Txt size={9} weight="bold" tone="muted" numberOfLines={1}>
                        {locked ? t('pro.fantasy.pick.today') : sortLabels[sort]}
                    </Txt>
                </View>
                <View style={{ width: W.last5, alignItems: 'center', justifyContent: 'center' }}>
                    <Last5Bars values={row.last5} />
                </View>
                <View style={{ width: W.act, alignItems: 'flex-end', justifyContent: 'center' }}>
                    {lockedIn ? (
                        <View accessible accessibilityRole="image" accessibilityLabel={t('pro.fantasy.pick.lockedIn', { name: player.name })} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised }}>
                            <Lock size={16} color={colors.muted} />
                        </View>
                    ) : inTeam ? (
                        <Pressable
                            onPress={() => act(player)}
                            accessibilityRole="button"
                            accessibilityLabel={actionLabel}
                            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: captain ? alpha(colors.gold, 0.18) : alpha(pro.up, 0.14), opacity: pressed ? 0.8 : 1 })}
                        >
                            {captain ? <Crown size={20} color={colors.gold} /> : <Check size={20} color={pro.up} />}
                        </Pressable>
                    ) : (
                        <Pressable
                            onPress={() => act(player)}
                            disabled={blocked}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: blocked }}
                            accessibilityLabel={actionLabel}
                            style={({ pressed }) => ({
                                width: 44,
                                height: 44,
                                borderRadius: 22,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: blocked ? 'transparent' : colors.accent,
                                borderWidth: blocked ? 1 : 0,
                                borderStyle: 'dashed',
                                borderColor: alpha(colors.line, 0.3),
                                opacity: pressed ? 0.8 : 1
                            })}
                        >
                            {reason?.kind === 'started' ? <Lock size={16} color={colors.muted} /> : <Plus size={20} color={blocked ? colors.muted : '#fff'} />}
                        </Pressable>
                    )}
                </View>
            </Animated.View>
        );
    };

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.fantasy.pick.title')} aside={t('fantasyHelp.picker.count', { count: rows.length })} />
            {replacing && (
                <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.tile, backgroundColor: alpha(colors.accent, 0.12), paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Txt size={13} style={{ flex: 1, minWidth: 0, lineHeight: 18 }}>
                        <Txt size={13} weight="bold">
                            {t('pro.fantasy.pick.replacing', { name: replacing.name })}
                        </Txt>
                        {entry.captain === replacing.id ? ` ${t('pro.fantasy.pick.replacingCaptain')}` : ''}
                    </Txt>
                    <Pressable
                        onPress={onCancelReplace}
                        accessibilityRole="button"
                        accessibilityLabel={t('pro.fantasy.pick.cancelReplace')}
                        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised }}
                    >
                        <X size={16} color={colors.ink} />
                    </Pressable>
                </View>
            )}
            <ProSegmented<'B' | 'P'>
                value={role}
                onChange={onRole}
                label={t('fantasy.role')}
                track="surface"
                options={[
                    { value: 'B', label: t('pro.fantasy.pick.batters', { n: rules.roster.batters, have: roleCount('B') }) },
                    { value: 'P', label: t('pro.fantasy.pick.pitchers', { n: rules.roster.pitchers, have: roleCount('P') }) }
                ]}
            />
            {/* Siempre a la vista: cuántos faltan y cuántos créditos quedan */}
            <Txt size={14} weight="extrabold" tabular color={left !== null && left < -1e-9 ? pro.down : colors.ink} accessibilityLiveRegion="polite">
                {needText(day, base, t, lang)}
            </Txt>
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
            <ChipRow label={t('fantasyHelp.picker.filters')}>
                <ChipButton active={filters.available} onPress={() => set({ available: !filters.available })}>
                    {t('fantasyHelp.picker.available')}
                </ChipButton>
                {options.affordable && (
                    <ChipButton active={filters.affordable} onPress={() => set({ affordable: !filters.affordable })}>
                        {t('fantasyHelp.picker.affordable')}
                    </ChipButton>
                )}
                <ChipButton active={filters.starters} onPress={() => set({ starters: !filters.starters })}>
                    {t('fantasyHelp.picker.starters')}
                </ChipButton>
            </ChipRow>
            {games.length > 1 && (
                <ChipRow label={t('fantasyHelp.picker.byGame')}>
                    <ChipButton active={filters.gamePk === null} onPress={() => set({ gamePk: null })}>
                        {t('fantasyHelp.picker.allGames')}
                    </ChipButton>
                    {games.map((game) => (
                        <ChipButton key={game.gamePk} active={filters.gamePk === game.gamePk} onPress={() => set({ gamePk: game.gamePk, teamId: null })}>
                            {`${day.teams[game.away.id]?.abbrev ?? game.away.abbrev}-${day.teams[game.home.id]?.abbrev ?? game.home.abbrev}${game.startTimeTBD ? '' : ` ${shortTime(game.date, lang)}`}`}
                        </ChipButton>
                    ))}
                </ChipRow>
            )}
            <ChipRow label={t('fantasyHelp.picker.byTeam')}>
                <ChipButton active={filters.teamId === null} onPress={() => set({ teamId: null })}>
                    {t('fantasyHelp.picker.allTeams')}
                </ChipButton>
                {Object.values(day.teams).map((team) => (
                    <ChipButton key={team.id} active={filters.teamId === team.id} onPress={() => set({ teamId: team.id, gamePk: null })} icon={<TeamLogo team={team} size={24} />} style={{ paddingLeft: 6 }}>
                        {team.abbrev}
                    </ChipButton>
                ))}
            </ChipRow>
            <ChipRow label={t('fantasyHelp.picker.sort')}>
                {options.sorts.map((option) => (
                    <ChipButton key={option} active={sort === option} onPress={() => setSort(option)} icon={sort === option ? <ArrowDownWideNarrow size={16} color={colors.bg} /> : undefined}>
                        {sortLabels[option]}
                    </ChipButton>
                ))}
            </ChipRow>
            {filtered && (
                <Pressable onPress={() => reset()} accessibilityRole="button" hitSlop={10} style={{ alignSelf: 'flex-start' }}>
                    <Txt size={12} weight="bold" tone="accentInk">
                        {t('fantasyHelp.picker.clearFilters')}
                    </Txt>
                </Pressable>
            )}
            {full && filters.available ? (
                <ProNote tone="neutral">{`${role === 'P' ? t('fantasyHelp.reason.fullP', { count: rules.roster.pitchers }) : t('fantasyHelp.reason.fullB', { n: rules.roster.batters })}. ${t('fantasyHelp.picker.fullHint')}`}</ProNote>
            ) : null}

            <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 }, shadow('card')]}>
                <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ height: 30, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt size={10} weight="extrabold" tone="muted" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        {t('pro.fantasy.pick.colPlayer')}
                    </Txt>
                    <Txt size={10} weight="extrabold" color={colors.accentInk} numberOfLines={1} style={{ width: W.metric, textAlign: 'right', paddingRight: 6, textTransform: 'uppercase' }}>
                        {sortLabels[sort]}
                    </Txt>
                    <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} center style={{ width: W.last5, textTransform: 'uppercase' }}>
                        {t('pro.fantasy.pick.colLast5')}
                    </Txt>
                    <View style={{ width: W.act }} />
                </View>
                <View accessibilityLabel={t('pro.fantasy.pick.listLabel', { sort: sortLabels[sort] })}>
                    {shown.map(rowOf)}
                    {!shown.length && (
                        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1) }}>
                            <Txt size={14} tone="muted" center>
                                {filters.available ? t('fantasyHelp.picker.emptyAvailable') : t('fantasyHelp.picker.empty')}
                            </Txt>
                            {filtered && (
                                <Pressable onPress={() => reset({ available: false })} accessibilityRole="button" hitSlop={10}>
                                    <Txt size={14} weight="bold" tone="accentInk">
                                        {t('fantasyHelp.picker.clearFilters')}
                                    </Txt>
                                </Pressable>
                            )}
                        </View>
                    )}
                </View>
                {rows.length > shown.length && (
                    <Pressable
                        onPress={() => setLimit((value) => value + PAGE * 2)}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ marginTop: 4, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 })}
                    >
                        <Txt size={13} weight="bold">
                            {t('pro.fantasy.pick.more', { count: rows.length - shown.length })}
                        </Txt>
                    </Pressable>
                )}
            </View>
        </View>
    );
};
