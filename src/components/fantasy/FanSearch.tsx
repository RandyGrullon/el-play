// Pestaña «Fanáticos» (buscar por nombre; sin texto, los que más suman en la temporada), la fila de un fanático
// y la tabla de la temporada que usa «Tabla».
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, User, UserX, X } from 'lucide-react-native';
import type { LeagueId } from '../../types';
import { useSession } from '../../lib/account';
import { formatTime, seasonLabel } from '../../lib/format';
import { useColors } from '../../theme/theme';
import { alpha, fonts, radius, shadow } from '../../theme/tokens';
import { Card, ErrorState, Gradient, OfflineState, Skeleton, Txt, useErrorText } from '../ui';
import { Field } from '../account/Field';
import { MIN_SEARCH, cleanSearch, longEnough, useFanSearch, useSeasonRanking, withRanks, type SeasonRow } from './fans';
import { useLocalText } from './texts';

const round = (value: number) => Math.round(value * 10) / 10;
const initialOf = (name: string | null | undefined) => (name ? Array.from(name.trim())[0]?.toLocaleUpperCase() : '') || '';

/** Cómo se llama en la lista: «Tú» para la propia cuenta y «Fanático» si no se ha puesto nombre */
export const useFanLabel = () => {
    const { t } = useTranslation();
    const L = useLocalText();
    return (name: string | null | undefined, own: boolean) => (own ? t('fantasy.you') : name || L('fans.anonymous'));
};

/** La inicial en un círculo con el degradado de la marca */
export const FanAvatar: React.FC<{ name: string | null | undefined; size?: number }> = ({ name, size = 40 }) => {
    const initial = initialOf(name);
    return (
        <Gradient style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
            {initial ? (
                <Txt weight="extrabold" tone="white" style={{ fontSize: size * 0.44, lineHeight: size * 0.56 }}>
                    {initial}
                </Txt>
            ) : (
                <User size={size * 0.5} color="#fff" />
            )}
        </Gradient>
    );
};

// ---------------------------------------------------------------- fila de un fanático

interface FanRowProps {
    userId: string;
    name: string | null;
    own: boolean;
    onOpen: (userId: string) => void;
    rank?: number;
    points?: number;
    detail?: string;
    first?: boolean;
}

/** Fila que abre el perfil: puesto, inicial, nombre (o «Tú») y puntos */
export const FanRow: React.FC<FanRowProps> = ({ userId, name, own, onOpen, rank, points, detail, first }) => {
    const colors = useColors();
    const L = useLocalText();
    const label = useFanLabel()(name, own);
    return (
        <Pressable
            onPress={() => onOpen(userId)}
            accessibilityRole="button"
            accessibilityLabel={L('fans.viewProfile', { name: label })}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: first ? 0 : 1,
                borderTopColor: colors.line,
                backgroundColor: pressed ? colors.raised : own ? alpha(colors.accent, 0.1) : 'transparent'
            })}
        >
            {rank !== undefined && (
                <Txt size={18} weight="extrabold" tone="muted" tabular center style={{ width: 24 }}>
                    {rank}
                </Txt>
            )}
            <FanAvatar name={name} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <Txt weight="bold" numberOfLines={1}>
                    {label}
                </Txt>
                {detail ? (
                    <Txt size={12} tone="muted" numberOfLines={1}>
                        {detail}
                    </Txt>
                ) : null}
            </View>
            {points !== undefined && (
                <Txt size={20} weight="extrabold" tabular>
                    {round(points)}
                </Txt>
            )}
            <ChevronRight size={16} color={colors.faint} />
        </Pressable>
    );
};

const RowsSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
    const colors = useColors();
    return (
        <Card padded={false} style={{ overflow: 'hidden' }}>
            {Array.from({ length: rows }, (_, index) => (
                <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                    <Skeleton height={36} width={36} round={18} />
                    <Skeleton height={16} round={8} style={{ flex: 1, width: undefined }} />
                    <Skeleton height={20} width={40} round={10} />
                </View>
            ))}
        </Card>
    );
};

// ---------------------------------------------------------------- buscador

export const FanSearch: React.FC<{ league: LeagueId; onOpen: (userId: string) => void }> = ({ league, onOpen }) => {
    const colors = useColors();
    const errorText = useErrorText();
    const L = useLocalText();
    const session = useSession();
    const [text, setText] = useState('');
    const [q, setQ] = useState('');
    // Se busca cuando se deja de escribir 300 ms
    useEffect(() => {
        const timer = setTimeout(() => setQ(text), 300);
        return () => clearTimeout(timer);
    }, [text]);

    const search = useFanSearch(q);
    const season = useSeasonRanking(league);
    const ranked = useMemo(() => withRanks(season.data?.ranking ?? []), [season.data]);
    const byId = useMemo(() => new Map(ranked.map((row) => [row.userId, row])), [ranked]);
    // Con menos de 2 letras vuelven las sugerencias enseguida (sin esperar la pausa)
    const searching = longEnough(q) && longEnough(text);
    const settling = longEnough(text) && cleanSearch(text) !== cleanSearch(q);
    const results = search.data ?? [];
    const offline = search.fetchStatus === 'paused' && !search.data;

    const detailOf = (userId: string) => {
        const row = byId.get(userId);
        return row ? L('fans.rankDetail', { rank: row.rank, count: row.days }) : L('fans.noSeason');
    };

    return (
        <View style={{ gap: 12 }} accessibilityLabel={L('fans.tab')}>
            <View style={{ gap: 6 }}>
                <View style={[{ borderRadius: 16 }, shadow('card')]}>
                    <View pointerEvents="none" style={{ position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 }}>
                        <Search size={16} color={colors.muted} />
                    </View>
                    <Field
                        value={text}
                        onChangeText={setText}
                        placeholder={L('fans.search')}
                        accessibilityLabel={L('fans.search')}
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        maxLength={40}
                        height={48}
                        style={{ backgroundColor: colors.surface, paddingLeft: 40, paddingRight: 44 }}
                    />
                    {text ? (
                        <Pressable
                            onPress={() => setText('')}
                            accessibilityRole="button"
                            accessibilityLabel={L('fans.clear')}
                            hitSlop={8}
                            style={{ position: 'absolute', right: 10, top: 10, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised }}
                        >
                            <X size={14} color={colors.muted} />
                        </Pressable>
                    ) : null}
                </View>
                {text.trim() && !longEnough(text) ? (
                    <Txt size={12} weight="semibold" tone="muted" style={{ paddingHorizontal: 4 }}>
                        {L('fans.minChars', { n: MIN_SEARCH })}
                    </Txt>
                ) : null}
            </View>

            {searching || settling ? (
                <View style={{ gap: 8 }}>
                    <Txt eyebrow accessibilityRole="header">
                        {L('fans.results')}
                    </Txt>
                    {offline ? (
                        <OfflineState />
                    ) : settling || search.isPending ? (
                        <RowsSkeleton rows={3} />
                    ) : search.isError ? (
                        <ErrorState message={errorText(search.error)} onRetry={() => search.refetch()} />
                    ) : results.length ? (
                        <Card padded={false} style={{ overflow: 'hidden' }}>
                            {results.map((fan, index) => (
                                <FanRow key={fan.id} first={index === 0} userId={fan.id} name={fan.name} own={fan.id === session?.user.id} onOpen={onOpen} detail={detailOf(fan.id)} />
                            ))}
                        </Card>
                    ) : (
                        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 32 }}>
                            <UserX size={28} color={colors.faint} />
                            <Txt weight="semibold" center>
                                {L('fans.noResults', { q: cleanSearch(q) })}
                            </Txt>
                            <Txt size={14} tone="muted" center>
                                {L('fans.noResultsHint')}
                            </Txt>
                        </Card>
                    )}
                </View>
            ) : (
                <View style={{ gap: 8 }}>
                    <Txt eyebrow accessibilityRole="header">
                        {L('fans.topSeason')}
                    </Txt>
                    <SeasonList query={season} rows={ranked.slice(0, 10)} ownId={session?.user.id} onOpen={onOpen} />
                </View>
            )}
        </View>
    );
};

// ---------------------------------------------------------------- tabla de la temporada

type SeasonQuery = ReturnType<typeof useSeasonRanking>;

const SeasonList: React.FC<{ query: SeasonQuery; rows: (SeasonRow & { rank: number })[]; ownId?: string; onOpen: (userId: string) => void; empty?: string }> = ({ query, rows, ownId, onOpen, empty }) => {
    const errorText = useErrorText();
    const L = useLocalText();
    if (query.fetchStatus === 'paused' && !query.data) return <OfflineState />;
    if (query.isPending) return <RowsSkeleton />;
    if (query.isError && !query.data) return <ErrorState message={errorText(query.error)} onRetry={() => query.refetch()} />;
    if (!rows.length)
        return (
            <Card>
                <Txt size={14} tone="muted" center style={{ paddingVertical: 8 }}>
                    {empty ?? L('fans.emptySeason')}
                </Txt>
            </Card>
        );
    return (
        <Card padded={false} style={{ overflow: 'hidden' }}>
            {rows.map((row, index) => (
                <FanRow key={row.userId} first={index === 0} userId={row.userId} name={row.name} own={row.userId === ownId} onOpen={onOpen} rank={row.rank} points={row.points} detail={L('fans.days', { count: row.days })} />
            ))}
        </Card>
    );
};

const PAGE = 50;

/** Tabla de la temporada (de todos o de los miembros de una liga privada) */
export const SeasonTable: React.FC<{ league: LeagueId; members?: string[]; onOpen: (userId: string) => void }> = ({ league, members, onOpen }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const L = useLocalText();
    const session = useSession();
    const query = useSeasonRanking(league);
    // El límite vale para la lista de miembros con que se abrió; al cambiar de liga vuelve a la primera página
    const membersKey = members?.join(',') ?? 'all';
    const [page, setPage] = useState({ key: membersKey, limit: PAGE });
    const limit = page.key === membersKey ? page.limit : PAGE;
    const ranked = useMemo(() => {
        const rows = query.data?.ranking ?? [];
        return withRanks(members ? rows.filter((row) => members.includes(row.userId)) : rows);
    }, [query.data, members]);
    const mine = ranked.findIndex((row) => row.userId === session?.user.id);
    const data = query.data;

    return (
        <View style={{ gap: 8 }}>
            {mine >= limit && (
                <View style={{ borderRadius: 16, backgroundColor: alpha(colors.accent, 0.1), paddingHorizontal: 16, paddingVertical: 10 }}>
                    <Txt size={14} weight="semibold" tone="accentInk">
                        {L('fans.yourRank', { rank: ranked[mine].rank, pts: round(ranked[mine].points) })}
                    </Txt>
                </View>
            )}
            <SeasonList query={query} rows={ranked.slice(0, limit)} ownId={session?.user.id} onOpen={onOpen} empty={members ? L('fans.emptyLeague') : undefined} />
            {ranked.length > limit && (
                <Pressable
                    onPress={() => setPage({ key: membersKey, limit: limit + PAGE })}
                    accessibilityRole="button"
                    style={({ pressed }) => [{ height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }, shadow('card')]}
                >
                    <Txt size={14} weight="bold">
                        {L('fans.seeMore')}
                    </Txt>
                </Pressable>
            )}
            {data && (
                <Txt size={12} tone="muted" style={{ paddingHorizontal: 4, fontFamily: fonts.regular }}>
                    {t('common.season', { season: seasonLabel(data.season, league) })} · {L('fans.updated', { time: formatTime(data.updatedAt, i18n.language) })}
                    {data.partial ? ` · ${L('fans.partial')}` : ''}
                </Txt>
            )}
        </View>
    );
};
