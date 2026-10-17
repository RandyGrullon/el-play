// Estadísticas de todos los peloteros (igual que StatsPage de la web): buscar sin tildes, bateadores o lanzadores,
// temporada actual o pasada, filtro por equipo, orden (también por puntos de fantasy), podio y lista con «Ver más».
// En PRO, la tabla completa con métricas avanzadas.
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react-native';
import { useLeague } from '../../state/league';
import { seasonLabel } from '../../lib/format';
import { useIsPro } from '../../lib/pro';
import { SORTS, normalize, seasonSummary, sortPlayers, usePlayers, type PlayerRow, type SortKey, type StatsTeam } from '../../lib/stats';
import { useColors } from '../../theme/theme';
import { fonts, inkOn, radius, shadow } from '../../theme/tokens';
import { Screen } from '../layout';
import { Card, ErrorState, OfflineState, Pill, PlayerPhoto, Row, Segmented, Skeleton, TeamLogo, Txt, useErrorText } from '../ui';
import { StatsTable } from '../pro/StatsTable';
import { ChipRow, MoreButton, Notice, SectionHeader, openPlayer, waitingForNetwork } from './common';

const PAGE = 40;

export const StatsSection: React.FC<{ tabs: React.ReactNode }> = ({ tabs }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const errorText = useErrorText();
    const { activeLeague } = useLeague();
    const [season, setSeason] = useState<number | undefined>(undefined);
    const [role, setRole] = useState<'B' | 'P'>('B');
    const [teamId, setTeamId] = useState<number | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('pts');
    const [search, setSearch] = useState('');
    const [limit, setLimit] = useState(PAGE);
    const query = usePlayers(activeLeague, season);
    const pro = useIsPro();
    const data = query.data;

    // Otra liga: temporada actual y todos los equipos. Otro filtro: primera página. Se ajusta en el render, sin efecto
    const [shownLeague, setShownLeague] = useState(activeLeague);
    if (shownLeague !== activeLeague) {
        setShownLeague(activeLeague);
        setSeason(undefined);
        setTeamId(null);
    }
    const filters = `${role}|${teamId}|${sortKey}|${search}|${season}`;
    const [shownFilters, setShownFilters] = useState(filters);
    if (shownFilters !== filters) {
        setShownFilters(filters);
        setLimit(PAGE);
    }

    const sort = SORTS[role].find((option) => option.key === sortKey) ?? SORTS[role][0];
    const teams = useMemo(() => Object.values(data?.teams ?? {}).sort((a, b) => a.abbrev.localeCompare(b.abbrev)), [data?.teams]);
    const teamGames = useMemo(() => Math.max(0, ...(data?.players ?? []).map((row) => row.hitting?.g ?? 0)), [data?.players]);
    const filtered = useMemo(() => {
        const needle = normalize(search.trim());
        return (data?.players ?? []).filter((row) => row.role === role && (teamId === null || row.teamId === teamId) && (!needle || normalize(row.name).includes(needle)));
    }, [data?.players, role, teamId, search]);
    const rows = useMemo(() => sortPlayers(filtered, sort, teamGames), [filtered, sort, teamGames]);

    const open = (row: PlayerRow) => openPlayer({ id: row.id, name: row.name, teamId: row.teamId }, data && data.season !== data.currentSeason ? data.season : undefined);

    const top = !search && rows.length >= 3 && rows[0].ranked ? rows.slice(0, 3).map((item) => item.row) : [];
    const rest = top.length ? rows.slice(3) : rows;
    const empty = (
        <Card style={{ paddingVertical: 32 }}>
            <Txt size={14} tone="muted" center>
                {search ? t('statsPage.noResults', { q: search.trim() }) : t('statsPage.empty')}
            </Txt>
        </Card>
    );

    return (
        <Screen onRefresh={() => query.refetch()}>
            {tabs}
            <SectionHeader
                subtitle={`${t(`leagues.${activeLeague}.name`)}${data ? ` · ${t('common.season', { season: seasonLabel(data.season, activeLeague) })}` : ''}`}
                title={t('statsPage.title')}
                pro={pro}
                lead={t('statsPage.lead')}
            />

            {data?.isPreviousSeason && <Notice text={t('statsPage.previousSeason')} />}

            {/* Buscar y filtrar */}
            <View style={{ gap: 12 }}>
                <Row gap={8} style={[{ height: 48, borderRadius: radius.tile, backgroundColor: colors.surface, paddingHorizontal: 16 }, shadow('card')]}>
                    <Search size={16} color={colors.muted} />
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder={t('statsPage.search')}
                        placeholderTextColor={colors.faint}
                        accessibilityLabel={t('statsPage.search')}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="words"
                        style={[{ flex: 1, minWidth: 0, height: 48, fontFamily: fonts.regular, fontSize: 15, color: colors.ink }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
                    />
                    {search ? (
                        <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel={t('statsPage.clear')} hitSlop={8} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                            <X size={14} color={colors.muted} />
                        </Pressable>
                    ) : null}
                </Row>
                <Row justify="space-between" gap={8} wrap>
                    <Segmented<'B' | 'P'>
                        value={role}
                        onChange={(value) => {
                            setRole(value);
                            setSortKey('pts');
                        }}
                        options={[
                            { value: 'B', label: t('statsPage.batters') },
                            { value: 'P', label: t('statsPage.pitchers') }
                        ]}
                    />
                    {data && (
                        <Segmented<string>
                            small
                            value={String(data.season)}
                            onChange={(value) => setSeason(Number(value) === data.currentSeason ? undefined : Number(value))}
                            options={data.seasons.slice(0, 2).map((year) => ({ value: String(year), label: seasonLabel(year, activeLeague) }))}
                        />
                    )}
                </Row>
            </View>

            {teams.length > 1 && (
                <ChipRow label={t('statsPage.filterTeam')}>
                    <Pill label={t('statsPage.allTeams')} active={teamId === null} onPress={() => setTeamId(null)} />
                    {teams.map((team) => (
                        <Pill key={team.id} label={team.abbrev} active={teamId === team.id} onPress={() => setTeamId(teamId === team.id ? null : team.id)} icon={<TeamLogo team={team} size={26} />} accessibilityLabel={team.name} />
                    ))}
                </ChipRow>
            )}

            {!pro && (
                <ChipRow label={t('statsPage.sortBy')}>
                    {SORTS[role].map((option) => {
                        const active = option.key === sort.key;
                        return (
                            <Pressable
                                key={option.key}
                                onPress={() => setSortKey(option.key)}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: active }}
                                style={{ height: 36, borderRadius: radius.pill, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: active ? colors.accent : colors.raised }}
                            >
                                <Txt size={13} weight="bold" color={active ? '#fff' : colors.muted}>
                                    {t(`statsPage.sort.${option.key}`)}
                                </Txt>
                            </Pressable>
                        );
                    })}
                </ChipRow>
            )}

            {waitingForNetwork(query) ? (
                <OfflineState />
            ) : query.isPending ? (
                <View style={{ gap: 12 }}>
                    <Row gap={8}>
                        {[0, 1, 2].map((index) => (
                            <View key={index} style={{ flex: 1 }}>
                                <Skeleton height={160} />
                            </View>
                        ))}
                    </Row>
                    <Skeleton height={320} />
                </View>
            ) : query.isError && !data ? (
                <ErrorState message={errorText(query.error)} onRetry={() => query.refetch()} />
            ) : data && pro ? (
                filtered.length ? <StatsTable rows={filtered} role={role} teams={data.teams} teamGames={teamGames} limit={limit} onOpen={open} onMore={() => setLimit((value) => value + PAGE)} /> : empty
            ) : data ? (
                <>
                    {top.length > 0 && <Podium rows={top} teams={data.teams} show={sort.show} unit={t(`statsPage.unit.${sort.key}`)} onOpen={open} />}
                    {rows.length === 0 ? (
                        empty
                    ) : (
                        <Card padded={false} style={{ overflow: 'hidden' }}>
                            {rest.slice(0, limit).map(({ row, ranked }, index) => (
                                <PlayerItem
                                    key={row.id}
                                    first={index === 0}
                                    row={row}
                                    rank={ranked ? index + 1 + top.length : null}
                                    team={row.teamId ? data.teams[row.teamId] : undefined}
                                    value={ranked ? sort.show(row) : '—'}
                                    unit={t(`statsPage.unit.${sort.key}`)}
                                    onOpen={() => open(row)}
                                />
                            ))}
                        </Card>
                    )}
                    {rest.length > limit && <MoreButton label={t('statsPage.showMore', { count: rest.length - limit })} onPress={() => setLimit((value) => value + PAGE)} />}
                    <Txt size={12} tone="muted">
                        {t('statsPage.count', { count: rows.length })} · {t('statsPage.qualifiedNote')}
                    </Txt>
                </>
            ) : null}
        </Screen>
    );
};

// ---------------------------------------------------------------- piezas

/** Los tres primeros del orden elegido, en el color de su equipo */
const Podium: React.FC<{ rows: PlayerRow[]; teams: Record<string, StatsTeam>; show: (row: PlayerRow) => string; unit: string; onOpen: (row: PlayerRow) => void }> = ({ rows, teams, show, unit, onOpen }) => {
    const { t } = useTranslation();
    return (
        <View accessibilityLabel={t('statsPage.top')} style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
            {rows.map((row, index) => {
                const team = row.teamId ? teams[row.teamId] : undefined;
                const color = team?.color || '#2563eb';
                const ink = inkOn(color);
                const last = row.name.split(' ').slice(-1)[0];
                return (
                    <Pressable
                        key={row.id}
                        onPress={() => onOpen(row)}
                        accessibilityRole="button"
                        accessibilityLabel={t('statsPage.viewPlayer', { name: row.name })}
                        style={({ pressed }) => [{ flex: 1, alignItems: 'center', borderRadius: 24, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 12, backgroundColor: color, opacity: pressed ? 0.9 : 1 }, shadow(index === 0 ? 'float' : 'card')]}
                    >
                        <Txt size={12} weight="extrabold" color={ink} style={{ alignSelf: 'flex-start', paddingLeft: 4, opacity: 0.85 }}>
                            {index + 1}
                        </Txt>
                        <PlayerPhoto personId={row.id} name={row.name} size={index === 0 ? 72 : 60} background="rgba(255,255,255,0.25)" team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                        <Txt size={14} weight="extrabold" color={ink} numberOfLines={1} center style={{ marginTop: 8, alignSelf: 'stretch' }}>
                            {last}
                        </Txt>
                        <Txt size={26} weight="extrabold" color={ink} tabular numberOfLines={1} adjustsFontSizeToFit style={{ lineHeight: 28 }}>
                            {show(row)}
                        </Txt>
                        <Txt size={11} weight="bold" color={ink} style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.8 }}>
                            {unit}
                        </Txt>
                    </Pressable>
                );
            })}
        </View>
    );
};

const PlayerItem: React.FC<{ row: PlayerRow; rank: number | null; team?: StatsTeam; value: string; unit: string; first: boolean; onOpen: () => void }> = ({ row, rank, team, value, unit, first, onOpen }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const summary = seasonSummary(row, t);
    return (
        <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={t('statsPage.viewPlayer', { name: row.name })}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: pressed ? colors.raised : undefined }, !first && { borderTopWidth: 1, borderTopColor: colors.line }]}
        >
            <Txt size={16} weight="extrabold" tone="muted" center style={{ width: 24 }}>
                {rank ?? '·'}
            </Txt>
            <PlayerPhoto personId={row.id} name={row.name} size={44} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
            <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={15} weight="extrabold" numberOfLines={1}>
                    {row.name}
                </Txt>
                <Txt size={12} tone="muted" numberOfLines={1}>
                    {[team?.abbrev, row.pos, row.number ? `#${row.number}` : null].filter(Boolean).join(' · ')}
                    {' · '}
                    {summary ?? t('statsPage.noGamesShort')}
                </Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Txt size={20} weight="extrabold" tabular style={{ lineHeight: 22 }}>
                    {value}
                </Txt>
                <Txt size={10} weight="bold" tone="muted" style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {unit}
                </Txt>
            </View>
        </Pressable>
    );
};
