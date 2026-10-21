// Fanáticos PRO (4.ª pestaña del Fantasy): buscar por nombre, otros fanáticos para mirar (el líder, el de tu liga, el de
// arriba y el de abajo) y la tabla de la temporada con flechas, distancia al de arriba y filtro por liga privada.
import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Eye, Search, Trophy, UserX, Users, X } from 'lucide-react-native';
import type { LeagueId } from '../../../types';
import type { SeasonRankingProRow } from '../../../types/pro-liga';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { ErrorState, OfflineState, Skeleton, Txt, useErrorText } from '../../ui';
import { Field } from '../../account/Field';
import { FanAvatar, FanRow, useFanLabel } from '../../fantasy/FanSearch';
import { MIN_SEARCH, cleanSearch, longEnough, useFanSearch } from '../../fantasy/fans';
import { useLocalText } from '../../fantasy/texts';
import { Enter, ModuleHeader, ProNote, useProColors } from '../kit';
import { Num, fmtPts, ordinal } from '../fantasy/bits';
import { useSeasonTable, type LeagueInfo } from '../fantasy/data';
import { shortDayName } from '../fantasy/logic';
import { ScopeChips, SeasonRows, type OpenFan } from '../fantasy/TablePro';

interface ProFansProps {
    league: LeagueId;
    userId: string;
    leagues: LeagueInfo[];
    onOpen: OpenFan;
    onOpenLeagues: () => void;
}

/** Tope de la tabla de la temporada que manda el servidor (los de más abajo salen «fuera del top») */
const SEASON_TOP = 200;

type Ranked = SeasonRankingProRow & { rank: number };

const withRank = (rows: SeasonRankingProRow[], local: boolean): Ranked[] => {
    const list = [...rows].sort((a, b) => b.points - a.points);
    let rank = 0;
    return list.map((row, index) => {
        if (index === 0 || row.points !== list[index - 1].points) rank = index + 1;
        return { ...row, rank: local ? rank : (row.rank ?? rank) };
    });
};

export const ProFans: React.FC<ProFansProps> = ({ league, userId, leagues, onOpen, onOpenLeagues }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const errorText = useErrorText();
    const L = useLocalText();
    const fanLabel = useFanLabel();
    const [text, setText] = useState('');
    const [q, setQ] = useState('');
    const [scope, setScope] = useState('all');
    // Se busca cuando se deja de escribir 300 ms
    useEffect(() => {
        const timer = setTimeout(() => setQ(text), 300);
        return () => clearTimeout(timer);
    }, [text]);

    const search = useFanSearch(q);
    const general = useSeasonTable(league);
    const members = scope === 'all' ? undefined : leagues.find((item) => item.id === scope)?.members.map((member) => member.userId);
    const scoped = useSeasonTable(league, members, !!members);
    const table = members ? scoped : general;
    const allRows = useMemo(() => withRank(general.data?.ranking ?? [], false), [general.data]);
    const rows = useMemo(() => (members ? withRank(scoped.data?.ranking ?? [], true) : allRows), [members, scoped.data, allRows]);
    const byId = useMemo(() => new Map(allRows.map((row) => [row.userId, row])), [allRows]);
    const total = general.data?.total ?? allRows.length;
    const searching = longEnough(q) && longEnough(text);
    const settling = longEnough(text) && cleanSearch(text) !== cleanSearch(q);
    const results = useMemo(() => search.data ?? [], [search.data]);
    const firstDay = (general.data?.daily.length ?? 0) <= 1;
    const lastDate = general.data?.lastDate;
    const searchOffline = search.fetchStatus === 'paused' && !search.data;
    const tableOffline = table.fetchStatus === 'paused' && !table.data;

    // El lector oye cuántos encontró al terminar de buscar
    const found = searching && !settling && search.isSuccess ? results.length : null;
    useEffect(() => {
        if (found !== null) AccessibilityInfo.announceForAccessibility(t('pro.fanaticos.fans.resultsCount', { count: found }));
    }, [found, t]);

    // Otros fanáticos para mirar: el líder, quien encabeza tu liga, el de arriba y el de abajo de ti
    const suggestions = useMemo(() => {
        const out: { row: Ranked; tag: string; Icon: typeof Trophy }[] = [];
        const add = (row: Ranked | undefined, tag: string, Icon: typeof Trophy) => {
            if (row && row.userId !== userId && !out.some((item) => item.row.userId === row.userId)) out.push({ row, tag, Icon });
        };
        add(allRows[0], t('pro.fanaticos.others.leader'), Trophy);
        const myLeague = leagues[0];
        if (myLeague) {
            const ids = new Set(myLeague.members.map((member) => member.userId));
            add(
                allRows.find((row) => ids.has(row.userId)),
                t('pro.fanaticos.others.leagueLeader'),
                Users
            );
        }
        const mine = allRows.findIndex((row) => row.userId === userId);
        if (mine > 0) add(allRows[mine - 1], t('pro.fanaticos.others.above'), Eye);
        if (mine >= 0) add(allRows[mine + 1], t('pro.fanaticos.others.below'), Eye);
        return out;
    }, [allRows, leagues, userId, t]);

    const detailOf = (id: string) => {
        const row = byId.get(id);
        if (row) return L('fans.rankDetail', { rank: row.rank, count: row.days });
        return allRows.length >= SEASON_TOP ? t('pro.fanaticos.fans.outsideTop', { n: SEASON_TOP }) : L('fans.noSeason');
    };
    const myRank = byId.get(userId)?.rank;

    return (
        <View style={{ gap: 20 }}>
            <View style={{ gap: 6 }}>
                <View style={[{ borderRadius: radius.tile }, shadow('card')]}>
                    <View pointerEvents="none" style={{ position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 }}>
                        <Search size={20} color={colors.muted} />
                    </View>
                    <Field
                        value={text}
                        onChangeText={setText}
                        placeholder={total > 1 ? t('pro.fanaticos.searchCount', { count: total }) : L('fans.search')}
                        accessibilityLabel={L('fans.search')}
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        maxLength={40}
                        height={52}
                        style={{ backgroundColor: colors.surface, paddingLeft: 46, paddingRight: 48 }}
                    />
                    {text ? (
                        <Pressable
                            onPress={() => setText('')}
                            accessibilityRole="button"
                            accessibilityLabel={L('fans.clear')}
                            style={{ position: 'absolute', right: 4, top: 4, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
                        >
                            <X size={16} color={colors.muted} />
                        </Pressable>
                    ) : null}
                </View>
                {text.trim() && !longEnough(text) ? (
                    <Txt size={12} weight="semibold" tone="muted" style={{ paddingHorizontal: 4 }}>
                        {L('fans.minChars', { n: MIN_SEARCH })}
                    </Txt>
                ) : null}
            </View>

            {(searching || settling) && (
                <View style={{ gap: 8 }}>
                    <ModuleHeader title={L('fans.results')} />
                    {searchOffline ? (
                        <OfflineState />
                    ) : settling || search.isPending ? (
                        <Skeleton height={150} />
                    ) : search.isError ? (
                        <ErrorState message={errorText(search.error)} onRetry={() => search.refetch()} />
                    ) : results.length ? (
                        <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }, shadow('card')]}>
                            {results.map((fan, index) => (
                                <FanRow key={fan.id} first={index === 0} userId={fan.id} name={fan.name} own={fan.id === userId} onOpen={(id) => onOpen(id, fan.name)} detail={detailOf(fan.id)} />
                            ))}
                        </View>
                    ) : (
                        <View style={[{ alignItems: 'center', gap: 8, borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 24, paddingVertical: 32 }, shadow('card')]}>
                            <UserX size={28} color={colors.faint} />
                            <Txt weight="semibold" center>
                                {L('fans.noResults', { q: cleanSearch(q) })}
                            </Txt>
                            <Txt size={14} tone="muted" center>
                                {L('fans.noResultsHint')}
                            </Txt>
                        </View>
                    )}
                </View>
            )}

            {suggestions.length > 0 && (
                <View style={{ gap: 10 }}>
                    <ModuleHeader title={t('pro.fanaticos.others.title')} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                        {suggestions.map(({ row, tag, Icon }, index) => {
                            const lead = index === 0;
                            return (
                                <Enter key={row.userId} index={index} style={{ width: 176 }}>
                                    <Pressable
                                        onPress={() => onOpen(row.userId, row.name)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${L('fans.viewProfile', { name: fanLabel(row.name, false) })}, ${tag}, ${fmtPts(row.points)} ${t('pro.fantasy.pts')}, #${row.rank}`}
                                        style={({ pressed }) => [
                                            { flex: 1, gap: 8, borderRadius: radius.tile, padding: 12, opacity: pressed ? 0.85 : 1 },
                                            lead ? { backgroundColor: alpha(pro.fantasy, 0.12), borderWidth: 1.5, borderColor: alpha(pro.fantasy, 0.6) } : [{ backgroundColor: colors.surface }, shadow('card')]
                                        ]}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <FanAvatar name={row.name} size={32} />
                                            <Txt size={13} weight="extrabold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                                {fanLabel(row.name, false)}
                                            </Txt>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <Icon size={14} color={colors.muted} />
                                            <Txt size={11} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                                {tag}
                                            </Txt>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                                            <Num size={26}>{fmtPts(row.points)}</Num>
                                            <Txt size={11} weight="semibold" tone="muted">
                                                {`${t('pro.fantasy.pts')} · ${ordinal(row.rank, lang)}`}
                                            </Txt>
                                        </View>
                                    </Pressable>
                                </Enter>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <Txt size={22} weight="black" accessibilityRole="header" style={{ flexShrink: 1, letterSpacing: -0.5 }}>
                        {t('pro.fantasy.table.title')}
                    </Txt>
                    {lastDate ? (
                        <Txt size={11} weight="semibold" tone="muted" style={{ flexShrink: 0 }}>
                            {t('pro.fantasy.table.dayN', { n: general.data?.daily.length ?? 0, day: shortDayName(lastDate, lang) })}
                        </Txt>
                    ) : null}
                </View>
                <View style={[{ gap: 12, borderRadius: radius.card, backgroundColor: colors.surface, padding: 12 }, shadow('card')]}>
                    <ScopeChips scope={scope} onScope={setScope} leagues={leagues} onOpenLeagues={onOpenLeagues} bleed={false} />
                    {tableOffline ? (
                        <OfflineState />
                    ) : table.isPending ? (
                        <Skeleton height={260} round={radius.tile} />
                    ) : table.isError && !table.data ? (
                        <ErrorState message={errorText(table.error)} onRetry={() => table.refetch()} />
                    ) : !rows.length ? (
                        <ProNote tone="neutral">{members ? t('pro.fanaticos.fans.emptyLeague') : t('pro.fanaticos.fans.emptySeason')}</ProNote>
                    ) : (
                        <SeasonRows rows={rows} me={userId} metric="above" firstDay={firstDay} onOpen={onOpen} label={t('pro.fantasy.table.title')} avatars showMoves={table.pro} />
                    )}
                    {rows.length > 0 && (
                        <View style={{ gap: 4, paddingHorizontal: 4 }}>
                            <Txt size={11} tone="muted" style={{ lineHeight: 16 }}>
                                {members
                                    ? t('pro.fanaticos.table.leagueNote', { count: rows.length, rank: ordinal(rows.find((row) => row.userId === userId)?.rank ?? 0, lang) })
                                    : t('pro.fanaticos.table.note', { count: total, rank: myRank ? ordinal(myRank, lang) : '—' })}
                            </Txt>
                            {table.pro ? (
                                <Txt size={11} tone="muted" style={{ lineHeight: 16 }}>
                                    <Txt size={11} weight="bold">{`${t('pro.fantasy.table.move')} `}</Txt>
                                    {firstDay ? t('pro.fantasy.table.moveFirst') : t('pro.fantasy.table.moveHint')}
                                </Txt>
                            ) : null}
                            <Txt size={11} tone="muted" style={{ lineHeight: 16 }}>
                                <Txt size={11} weight="bold">{`${t('pro.fantasy.table.diff')} `}</Txt>
                                {t('pro.fanaticos.table.diffNote')}
                            </Txt>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};
