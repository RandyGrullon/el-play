// «Escoge peloteros» del Fantasy PRO: la lista del día con números para decidir (Pts/J, últimos 5, OPS o EFE y % de
// fanáticos de los juegos ya cerrados), los que ya están jugando aparte y plegados, el chip «Titular» solo si llegó la
// alineación y, los días con créditos, el precio de cada uno y lo que te queda.
import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Line, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { ArrowDownWideNarrow, Check, ChevronDown, Crown, Filter, History, Lock, Plus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { formatTime, seasonLabel } from '../../../lib/format';
import { RULES, addPlayer, canAdd, creditsLeft, gameStarted, perTeamLimit, playerScore, removePlayer, setCaptain, type AddProblem, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../../lib/fantasy';
import type { FantasyDayStats } from '../../../types/pro-liga';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { PlayerPhoto, Txt } from '../../ui';
import { formatCredits, lineText } from '../../fantasy/shared';
import { ChipButton, ChipRow, ModuleHeader, ProNote, ProSegmented, shortName, useProColors, useReorder } from '../kit';
import { Num, fmtPts, type T } from './bits';
import type { ScoutSeason } from './data';
import { round1 } from './logic';
import type { FormItem } from './TeamGrid';

export type ScoutSort = 'ppg' | 'last5' | 'ops' | 'era' | 'fans';
export const MIN_GAMES = 10;
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
    stats: FantasyDayStats | undefined;
    /** Titulares confirmados (alineaciones publicadas) y los juegos que ya tienen alineación */
    starters: Set<number>;
    lineupGames: Set<number>;
    now: number;
    onInfo: (player: FantasyPlayer) => void;
}

const avgForm = (items: FormItem[] | undefined) => (items?.length ? round1(items.reduce((sum, item) => sum + item.pts, 0) / items.length) : null);

/** Minibarras de los últimos 5 juegos en puntos de fantasy (del más viejo al más nuevo); lo que falta, punteado */
export const FormBars: React.FC<{ items: FormItem[] | undefined; label: string }> = ({ items, label }) => {
    const colors = useColors();
    const pro = useProColors();
    const shown = (items ?? []).slice(0, 5).reverse();
    const max = Math.max(10, ...shown.map((item) => Math.abs(item.pts)));
    const W = 40;
    const H = 22;
    const base = H - 6;
    const bar = 6;
    const gap = 2.5;
    const empty = 5 - shown.length;
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={label}>
            <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                <Line x1={0} x2={W} y1={base} y2={base} stroke={alpha(colors.line, 0.2)} strokeWidth={1} />
                {Array.from({ length: empty }, (_, index) => (
                    <Rect key={`e${index}`} x={index * (bar + gap) + 0.5} y={base - 8} width={bar - 1} height={8} rx={1.5} fill="none" stroke={alpha(colors.line, 0.25)} strokeDasharray="2 2" />
                ))}
                {shown.map((item, index) => {
                    const h = Math.max(2, (Math.abs(item.pts) / max) * (base - 1));
                    const x = (empty + index) * (bar + gap);
                    return item.pts >= 0 ? <Rect key={item.gamePk} x={x} y={base - h} width={bar} height={h} rx={1.5} fill={pro.up} /> : <Rect key={item.gamePk} x={x} y={base} width={bar} height={Math.min(6, h)} rx={1.5} fill={pro.down} />;
                })}
            </Svg>
        </View>
    );
};

const problemText = (problem: AddProblem, role: 'B' | 'P', team: string | undefined, day: FantasyDay, entry: DayEntry, lang: string, t: T) =>
    problem === 'locked'
        ? t('fantasy.problem.locked')
        : problem === 'full'
          ? role === 'P'
              ? t('fantasy.problem.fullP')
              : t('fantasy.problem.fullB')
          : problem === 'team'
            ? t('pro.fantasy.pick.teamFull', { n: perTeamLimit(day), team })
            : problem === 'budget'
              ? t('fantasy.problem.budget', { left: formatCredits(Math.max(0, creditsLeft(day, entry) ?? 0), lang) })
              : '';

export const Scouting: React.FC<ScoutingProps> = ({ day, entry, role, onRole, replacing, onCancelReplace, scout, form, stats, starters, lineupGames, now, onInfo }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const reorder = useReorder();
    const narrow = useWindowDimensions().width < 360;
    const [sort, setSort] = useState<ScoutSort>('ppg');
    const [minGames, setMinGames] = useState(true);
    const [showLocked, setShowLocked] = useState(false);
    const [limit, setLimit] = useState(PAGE);
    const effectiveSort: ScoutSort = role === 'P' && sort === 'ops' ? 'era' : role === 'B' && sort === 'era' ? 'ops' : sort;
    // Mientras se cambia a alguien, se escoge como si ya hubiera salido
    const base: DayEntry = replacing ? { ...entry, lineup: entry.lineup.filter((id) => id !== replacing.id), captain: entry.captain === replacing.id ? null : entry.captain } : entry;
    const seasonName = scout.season ? seasonLabel(scout.season, day.league) : '';
    const hasNumbers = scout.rows.size > 0;
    const gameLocked = (player: FantasyPlayer) => {
        const game = day.games.find((item) => item.gamePk === player.gamePk);
        return !!game && gameStarted(game, now);
    };

    const all = useMemo(() => day.players.filter((player) => player.role === role), [day.players, role]);
    const open = all.filter((player) => !gameLocked(player));
    const locked = all.filter((player) => gameLocked(player));
    const enough = (player: FantasyPlayer) => !minGames || !hasNumbers || entry.lineup.includes(player.id) || (scout.rows.get(player.id)?.g ?? 0) >= MIN_GAMES;
    const value = (player: FantasyPlayer): number | null => {
        const row = scout.rows.get(player.id);
        if (effectiveSort === 'ppg') return row ? row.ppg : null;
        if (effectiveSort === 'last5') return avgForm(form?.[player.id]);
        if (effectiveSort === 'ops') return row?.hitting ? Number(row.hitting.ops) : null;
        if (effectiveSort === 'era') return row?.pitching && Number(row.pitching.ip) > 0 ? -Number(row.pitching.era) : null;
        return stats?.players[player.id]?.pct ?? null;
    };
    const candidates = open
        .filter(enough)
        .map((player) => ({ player, key: value(player) }))
        .sort((a, b) => (a.key === null ? (b.key === null ? 0 : 1) : b.key === null ? -1 : b.key - a.key) || Number(entry.lineup.includes(b.player.id)) - Number(entry.lineup.includes(a.player.id)) || a.player.name.localeCompare(b.player.name))
        .map((item) => item.player);
    const shown = candidates.slice(0, limit);
    const firstStart = day.games
        .filter((game) => !gameStarted(game, now))
        .map((game) => game.date)
        .sort()[0];
    const sorts: { value: ScoutSort; label: string; aria: string }[] = [
        { value: 'ppg', label: t('pro.fantasy.pick.sortPpg'), aria: t('pro.fantasy.pick.sortPpgLong') },
        { value: 'last5', label: t('pro.fantasy.pick.sortLast5'), aria: t('pro.fantasy.pick.sortLast5Long') },
        role === 'B' ? { value: 'ops', label: 'OPS', aria: t('pro.fantasy.pick.sortOpsLong') } : { value: 'era', label: t('pro.fantasy.pick.sortEra'), aria: t('pro.fantasy.pick.sortEraLong') },
        { value: 'fans', label: t('pro.fantasy.pick.sortFans'), aria: t('pro.fantasy.pick.sortFansLong') }
    ];
    const roleCount = (r: 'B' | 'P') => entry.lineup.map((id) => day.players.find((player) => player.id === id)).filter((player) => player?.role === r).length;
    const postedGames = day.games.filter((game) => lineupGames.has(game.gamePk)).length;
    const left = creditsLeft(day, base);

    const act = (player: FantasyPlayer) => {
        if (entry.lineup.includes(player.id)) {
            if (removePlayer(day, player)) Haptics.selectionAsync().catch(() => undefined);
            return;
        }
        if (replacing) {
            const wasCaptain = entry.captain === replacing.id;
            if (canAdd(day, base, player)) return;
            removePlayer(day, replacing);
            addPlayer(day, base, player);
            if (wasCaptain) setCaptain(day, base, player);
            onCancelReplace();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            return;
        }
        if (addPlayer(day, entry, player)) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    };

    // Columnas: pelotero (lo que sobra), Pts/J, últimos 5, % fan (desde 360 px) y la acción
    const W = { ppg: narrow ? 44 : 48, last5: 44, fans: 38, act: 44 };
    const cellBg = (key: ScoutSort, isLocked: boolean) => (effectiveSort === key && !isLocked ? alpha(colors.accent, 0.1) : 'transparent');

    const rowOf = (player: FantasyPlayer, isLocked: boolean) => {
        const team = day.teams[player.teamId];
        const row = scout.rows.get(player.id);
        const inTeam = entry.lineup.includes(player.id);
        const captain = entry.captain === player.id;
        const problem = inTeam ? null : canAdd(day, base, player, now);
        const pct = stats?.players[player.id]?.pct;
        const game = day.games.find((item) => item.gamePk === player.gamePk);
        const hasLineup = !!game && lineupGames.has(game.gamePk);
        const price = day.credits && player.price !== undefined ? formatCredits(player.price, lang) : null;
        const status: { text: string; color: string; chip?: boolean } | null = captain
            ? { text: t('pro.fantasy.pick.yourCaptain'), color: colors.gold }
            : inTeam
              ? { text: t('pro.fantasy.pick.inTeam'), color: pro.up }
              : problem === 'team' || problem === 'budget'
                ? { text: problemText(problem, role, team?.abbrev, day, base, lang, t), color: colors.muted }
                : player.role === 'B' && hasLineup
                  ? starters.has(player.id)
                      ? { text: t('pro.fantasy.pick.starter'), color: pro.up, chip: true }
                      : { text: t('pro.fantasy.pick.notInLineup'), color: colors.muted }
                  : player.role === 'B' && !isLocked
                    ? { text: t('pro.fantasy.pick.lineupPending'), color: colors.muted }
                    : null;
        const sub = row ? (role === 'P' ? (row.pitching ? `${t('pro.fantasy.pick.eraShort')} ${row.pitching.era}` : '') : row.hitting ? `OPS ${row.hitting.ops}` : '') : '';
        const formItems = form?.[player.id];
        const formLabel = formItems?.length ? t('pro.fantasy.pick.formLabel', { list: formItems.slice(0, 5).map((item) => fmtPts(item.pts)).join(', ') }) : t('pro.fantasy.pick.formNone');
        const extra = isLocked ? lineText(player, t) : null;
        const actionLabel = problem
            ? `${t('fantasy.add', { name: player.name })}: ${problemText(problem, role, team?.abbrev, day, base, lang, t)}`
            : replacing
              ? t('pro.fantasy.pick.replaceLabel', { name: player.name, out: replacing.name })
              : t('fantasy.add', { name: player.name });
        return (
            <Animated.View key={player.id} layout={isLocked ? undefined : reorder} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'stretch', gap: 6, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1) }}>
                <Pressable
                    onPress={() => onInfo(player)}
                    accessibilityRole="button"
                    accessibilityLabel={[t('statsPage.viewPlayer', { name: player.name }), price !== null ? t('fantasy.credits.priceLong', { price }) : '', status?.text ?? ''].filter(Boolean).join(', ')}
                    style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}
                >
                    <PlayerPhoto personId={player.id} name={player.name} size={36} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Txt size={13} weight="bold" numberOfLines={1}>
                            {shortName(player.name)}
                        </Txt>
                        <Txt size={11} tone="muted" numberOfLines={1}>
                            {player.role === 'P' ? t('pro.fantasy.card.posP') : player.pos || '—'} · {team?.abbrev}
                            {price !== null ? ` · ${t('fantasy.credits.price', { price })}` : ''}
                            {extra ? ` · ${extra}` : ''}
                        </Txt>
                        {status &&
                            (status.chip ? (
                                <View style={{ alignSelf: 'flex-start', height: 18, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 6, backgroundColor: alpha(status.color, 0.14) }}>
                                    <Txt size={10} weight="bold" color={status.color} numberOfLines={1}>
                                        {status.text}
                                    </Txt>
                                </View>
                            ) : (
                                <Txt size={11} weight="semibold" color={status.color} numberOfLines={1}>
                                    {status.text}
                                </Txt>
                            ))}
                    </View>
                </Pressable>
                <View style={{ width: W.ppg, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 6, backgroundColor: cellBg('ppg', isLocked) }}>
                    {isLocked ? (
                        <>
                            <Num size={20}>{fmtPts(inTeam ? playerScore(entry, player) : player.points)}</Num>
                            <Txt size={9} weight="bold" tone="muted" numberOfLines={1}>
                                {t('pro.fantasy.pick.today')}
                            </Txt>
                        </>
                    ) : (
                        <>
                            <Num size={20}>{row ? fmtPts(row.ppg) : '—'}</Num>
                            {sub ? (
                                <Txt size={9} weight="bold" tone="muted" numberOfLines={1}>
                                    {sub}
                                </Txt>
                            ) : null}
                        </>
                    )}
                </View>
                <View style={{ width: W.last5, alignItems: 'center', justifyContent: 'center', backgroundColor: cellBg('last5', isLocked) }}>
                    <FormBars items={formItems} label={formLabel} />
                </View>
                {!narrow && (
                    <View style={{ width: W.fans, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 2, backgroundColor: cellBg('fans', isLocked) }}>
                        {pct !== undefined ? (
                            <Txt size={11} weight="bold" tabular>
                                {`${Math.round(pct)}%`}
                            </Txt>
                        ) : (
                            <Txt size={11} weight="bold" tone="muted" accessibilityLabel={t('pro.fantasy.pick.fansHidden')}>
                                —
                            </Txt>
                        )}
                    </View>
                )}
                <View style={{ width: W.act, alignItems: 'flex-end', justifyContent: 'center' }}>
                    {isLocked ? (
                        <View accessible accessibilityRole="image" accessibilityLabel={inTeam ? t('pro.fantasy.pick.lockedIn', { name: player.name }) : t('fantasy.problem.locked')} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised }}>
                            <Lock size={16} color={colors.muted} />
                        </View>
                    ) : inTeam ? (
                        <Pressable
                            onPress={() => act(player)}
                            accessibilityRole="button"
                            accessibilityLabel={t('pro.fantasy.pick.removeLabel', { name: player.name })}
                            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: captain ? alpha(colors.gold, 0.18) : alpha(pro.up, 0.14), opacity: pressed ? 0.8 : 1 })}
                        >
                            {captain ? <Crown size={20} color={colors.gold} /> : <Check size={20} color={pro.up} />}
                        </Pressable>
                    ) : (
                        <Pressable
                            onPress={() => act(player)}
                            disabled={!!problem}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !!problem }}
                            accessibilityLabel={actionLabel}
                            style={({ pressed }) => ({
                                width: 44,
                                height: 44,
                                borderRadius: 22,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: problem ? 'transparent' : colors.accent,
                                borderWidth: problem ? 1 : 0,
                                borderStyle: 'dashed',
                                borderColor: alpha(colors.line, 0.3),
                                opacity: pressed ? 0.8 : 1
                            })}
                        >
                            <Plus size={20} color={problem ? colors.muted : '#fff'} />
                        </Pressable>
                    )}
                </View>
            </Animated.View>
        );
    };

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.fantasy.pick.title')} aside={t('pro.fantasy.pick.aside', { count: day.players.length, games: day.games.length })} />
            {scout.previous && scout.season ? (
                <ProNote tone="warn" icon={<History size={18} color={pro.warn} />}>
                    {t('pro.fantasy.pick.previousSeason', { season: seasonName, current: scout.currentSeason ? seasonLabel(scout.currentSeason, day.league) : '', count: scout.teamGames, min: 5 })}
                </ProNote>
            ) : null}
            {!replacing && roleCount(role) >= (role === 'P' ? RULES.pitchers : RULES.batters) ? <ProNote tone="neutral">{t(role === 'P' ? 'pro.fantasy.pick.fullP' : 'pro.fantasy.pick.fullB', { n: RULES.batters })}</ProNote> : null}
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
                    { value: 'B', label: t('pro.fantasy.pick.batters', { n: RULES.batters, have: roleCount('B') }) },
                    { value: 'P', label: t('pro.fantasy.pick.pitchers', { n: RULES.pitchers, have: roleCount('P') }) }
                ]}
            />
            {day.credits && left !== null ? (
                <Txt size={13} weight="bold" tabular color={left < -1e-9 ? pro.down : colors.ink}>
                    {t('fantasy.credits.pickerLeft', { left: formatCredits(left, lang), budget: formatCredits(day.credits.budget, lang) })}
                </Txt>
            ) : null}
            <ChipRow label={t('pro.fantasy.pick.sortBy')}>
                {sorts.map((option, index) => (
                    <ChipButton
                        key={option.value}
                        active={effectiveSort === option.value}
                        onPress={() => setSort(option.value)}
                        accessibilityLabel={option.aria}
                        icon={index === 0 && effectiveSort === option.value ? <ArrowDownWideNarrow size={16} color={colors.bg} /> : undefined}
                    >
                        {option.label}
                    </ChipButton>
                ))}
            </ChipRow>
            {hasNumbers && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable
                        onPress={() => setMinGames((current) => !current)}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: minGames }}
                        style={[
                            { height: 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 12 },
                            minGames ? [{ backgroundColor: colors.surface }, shadow('card')] : { borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.25) }
                        ]}
                    >
                        <Filter size={14} color={minGames ? colors.ink : colors.muted} />
                        <Txt size={11} weight="bold" color={minGames ? colors.ink : colors.muted}>
                            {t('pro.fantasy.pick.minGames', { n: MIN_GAMES })}
                        </Txt>
                    </Pressable>
                    <Txt size={11} tone="muted" style={{ flex: 1, minWidth: 0, lineHeight: 15 }}>
                        {minGames ? t(role === 'P' ? 'pro.fantasy.pick.minGamesTextP' : 'pro.fantasy.pick.minGamesTextB', { count: candidates.length, n: MIN_GAMES, season: seasonName }) : t('pro.fantasy.pick.allText', { count: open.length })}
                    </Txt>
                </View>
            )}

            <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 }, shadow('card')]}>
                <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ height: 30, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt size={10} weight="extrabold" tone="muted" style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        {t('pro.fantasy.pick.colPlayer')}
                    </Txt>
                    <Txt size={10} weight="extrabold" color={effectiveSort === 'ppg' ? colors.accentInk : colors.muted} numberOfLines={1} style={{ width: W.ppg, textAlign: 'right', paddingRight: 6, textTransform: 'uppercase' }}>
                        {t('pro.fantasy.pick.colPpg')}
                    </Txt>
                    <Txt size={10} weight="extrabold" color={effectiveSort === 'last5' ? colors.accentInk : colors.muted} numberOfLines={1} center style={{ width: W.last5, textTransform: 'uppercase' }}>
                        {t('pro.fantasy.pick.colLast5')}
                    </Txt>
                    {!narrow && (
                        <Txt size={10} weight="extrabold" color={effectiveSort === 'fans' ? colors.accentInk : colors.muted} numberOfLines={1} style={{ width: W.fans, textAlign: 'right', textTransform: 'uppercase' }}>
                            {t('pro.fantasy.pick.colFans')}
                        </Txt>
                    )}
                    <View style={{ width: W.act }} />
                </View>
                <View accessibilityLabel={t('pro.fantasy.pick.listLabel', { sort: sorts.find((option) => option.value === effectiveSort)?.aria ?? '' })}>
                    {shown.map((player) => rowOf(player, false))}
                    {!shown.length && (
                        <Txt size={14} tone="muted" center style={{ paddingVertical: 24, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1) }}>
                            {open.length ? t('pro.fantasy.pick.noneWithMin', { n: MIN_GAMES }) : t('pro.fantasy.pick.noneOpen')}
                        </Txt>
                    )}
                </View>
                {candidates.length > shown.length && (
                    <Pressable
                        onPress={() => setLimit((current) => current + PAGE * 2)}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ marginTop: 4, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 })}
                    >
                        <Txt size={13} weight="bold">
                            {t('pro.fantasy.pick.more', { count: candidates.length - shown.length })}
                        </Txt>
                    </Pressable>
                )}
                <Pressable
                    onPress={() => setShowLocked((current) => !current)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showLocked }}
                    style={{ marginTop: 4, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), paddingHorizontal: 4 }}
                >
                    <View style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: 6 }}>
                        <Txt size={13} weight="bold">
                            {t('pro.fantasy.pick.playing', { count: locked.length })}
                        </Txt>
                        <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                            {locked.length ? t('pro.fantasy.pick.playingHint') : firstStart ? t('pro.fantasy.pick.playingEmpty', { time: formatTime(firstStart, lang) }) : t('pro.fantasy.pick.playingHint')}
                        </Txt>
                    </View>
                    <View style={{ transform: [{ rotate: showLocked ? '180deg' : '0deg' }] }}>
                        <ChevronDown size={20} color={colors.muted} />
                    </View>
                </Pressable>
                {showLocked && <View accessibilityLabel={t('pro.fantasy.pick.playing', { count: locked.length })}>{[...locked].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).map((player) => rowOf(player, true))}</View>}
            </View>
            {role === 'B' && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <View style={{ height: 22, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: alpha(pro.up, 0.14) }}>
                        <Txt size={10} weight="bold" color={pro.up}>
                            {t('pro.fantasy.pick.starter')}
                        </Txt>
                    </View>
                    <Txt size={11} tone="muted" style={{ flexShrink: 1, lineHeight: 16 }}>
                        {postedGames ? t('pro.fantasy.pick.lineupsSome', { count: postedGames, total: day.games.length }) : t('pro.fantasy.pick.lineupsNone')}
                    </Txt>
                </View>
            )}
            {!scout.isPending && !hasNumbers ? <ProNote tone="neutral">{t('pro.fantasy.pick.noNumbers')}</ProNote> : null}
        </View>
    );
};
