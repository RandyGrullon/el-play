import React, { useMemo, useState } from 'react';
import { Platform, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, X } from 'lucide-react-native';
import { useLeague } from '../../../state/league';
import { seasonLabel } from '../../../lib/format';
import { normalize, teamGamesOf, minPlateAppearances, usePlayers, type PlayerRow, type PlayersData } from '../../../lib/stats';
import { useProPlayers, useProTeamStats } from '../../../lib/pro/liga';
import { isRouteMissing } from '../../../lib/pro/http';
import { useColors } from '../../../theme/theme';
import { alpha, fonts, radius, shadow } from '../../../theme/tokens';
import type { ProPhaseId, ProPlayersData } from '../../../types/pro-liga';
import { ErrorState, OfflineState, Skeleton, TeamLogo, Txt, useErrorText } from '../../ui';
import { openPlayer, waitingForNetwork } from '../../stats/common';
import { StatsTable, type StatsTableSort } from '../StatsTable';
import { ChipButton, ChipRow, GlossaryButton, ModuleHeader, ProButton, ProNote, ProSegmented, ScreenTitle } from '../kit';
import {
    LEAGUE_PHASES,
    STATS_VIEWS,
    columnOf,
    columnStandings,
    contextOf,
    leagueFromPlayers,
    minOutsPro,
    minRelieverGames,
    poolOf,
    shortNames,
    sortPool,
    tooEarly,
    type Role,
    type Standing
} from './logic';
import { LeadCard } from './LeadCard';
import { LeagueTiles, PercentileLegend, PhaseSelect, useGlossary } from './parts';
import { ProfileScatter } from './ProfileScatter';
import { CompareCard } from './CompareCard';
import { TeamsPreview } from './TeamsPanel';
import { FieldingPanel } from './FieldingPanel';
import { ProStatsTabs } from './ProStatsTabs';
import { ProScroll } from './scroll';

const TOP = 10;

// Estadísticas del modo PRO: buscar, filtrar por rol, equipo, temporada y fase; vistas de columnas pintadas por
// percentil; perfil en dispersión; cara a cara de dos peloteros y la vista previa de Equipos. Si el servidor todavía
// no tiene las rutas del PRO, sale lo mismo con la lista de siempre (/api/v2/players): sin fases ni defensa, y la liga
// calculada con las líneas de todos los peloteros.
export const StatsPro: React.FC = () => {
    const { t } = useTranslation();
    const colors = useColors();
    const errorText = useErrorText();
    const { width } = useWindowDimensions();
    const { activeLeague } = useLeague();
    const phases = LEAGUE_PHASES[activeLeague];
    const [role, setRole] = useState<Role>('B');
    const [viewKey, setViewKey] = useState<Record<Role, string>>({ B: 'clasico', P: 'clasico' });
    const [sort, setSort] = useState<StatsTableSort | null>(null);
    const [teamId, setTeamId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [focused, setFocused] = useState(false);
    const [seasonChoice, setSeasonChoice] = useState<number | undefined>(undefined);
    const [phase, setPhase] = useState<ProPhaseId>(phases[0]);
    const [expanded, setExpanded] = useState(false);

    // Otra liga: temporada vigente, todos los equipos y la primera fase. Otro filtro: solo los 10 primeros (en el render)
    const [shownLeague, setShownLeague] = useState(activeLeague);
    if (shownLeague !== activeLeague) {
        setShownLeague(activeLeague);
        setSeasonChoice(undefined);
        setTeamId(null);
        setPhase(LEAGUE_PHASES[activeLeague][0]);
    }
    const filters = `${role}|${teamId}|${phase}|${seasonChoice}|${viewKey[role]}`;
    const [shownFilters, setShownFilters] = useState(filters);
    if (shownFilters !== filters) {
        setShownFilters(filters);
        setExpanded(false);
    }

    // La primera fase de la temporada vigente decide si hay muestra: con menos de 5 juegos se ve la pasada completa
    const primaryPhase = phases[0];
    const proCurrent = useProPlayers(activeLeague);
    const missing = isRouteMissing(proCurrent.error);
    const liteCurrent = usePlayers(activeLeague, undefined, missing);
    const current = missing ? liteCurrent : proCurrent;
    const currentData: PlayersData | ProPlayersData | undefined = current.data;
    const currentGames = currentData ? teamGamesOf(currentData.players) : 0;
    const autoPrevious =
        seasonChoice === undefined && !!currentData && !currentData.isPreviousSeason && currentData.season === currentData.currentSeason && tooEarly(currentGames) && currentData.seasons.includes(currentData.currentSeason - 1);
    const season = seasonChoice ?? (autoPrevious ? currentData!.currentSeason - 1 : undefined);
    const phaseParam = missing || phase === primaryPhase ? undefined : phase;
    // Solo hace falta otra lectura si se ve otra temporada o fase (si no, es la misma de arriba)
    const other = season !== undefined || phaseParam !== undefined;
    const proOther = useProPlayers(activeLeague, season, phaseParam, other && !missing);
    const liteOther = usePlayers(activeLeague, season, other && missing);
    const active = other ? (missing ? liteOther : proOther) : current;
    const data: PlayersData | ProPlayersData | undefined = active.data;
    const teamStats = useProTeamStats(activeLeague, phaseParam, data?.season, !!data && !missing);
    // La liga: la del servidor; si no la tiene, sumando las líneas de todos los peloteros (nunca la constante fija)
    const fromPlayers = useMemo(() => (data ? leagueFromPlayers(data.players) : null), [data]);
    const waitingLeague = !teamStats.data && teamStats.isPending && teamStats.fetchStatus !== 'idle';
    const ctx = teamStats.data ? contextOf(teamStats.data) : waitingLeague ? null : (fromPlayers?.ctx ?? null);
    const averages = teamStats.data?.averages ?? (waitingLeague ? null : (fromPlayers?.averages ?? null));
    const leagueFromList = !teamStats.data && !waitingLeague && !!fromPlayers;

    const views = STATS_VIEWS[role];
    const view = views.find((item) => item.key === viewKey[role]) ?? views[0];
    const teamGames = useMemo(() => (data ? teamGamesOf(data.players) : 0), [data]);
    const fullPool = useMemo<PlayerRow[]>(() => (data ? poolOf<PlayerRow>(data.players, view.pool, teamGames) : []), [data, view.pool, teamGames]);
    const pool = useMemo(() => (teamId === null ? fullPool : fullPool.filter((row) => row.teamId === teamId)), [fullPool, teamId]);
    const names = useMemo(() => shortNames(data?.players ?? []), [data?.players]);

    // Percentiles de cada columna de la vista contra todo el grupo (no solo el equipo elegido)
    const standings = useMemo(() => {
        const out: Record<string, Map<number, Standing>> = {};
        for (const key of view.cols) out[key] = columnStandings(fullPool, columnOf(role, key), ctx);
        return out;
    }, [fullPool, view.cols, role, ctx]);

    const sortKey = sort && view.cols.includes(sort.key) ? sort.key : view.sort;
    const sortColumn = columnOf(role, sortKey);
    const sortAsc = sort && sort.key === sortKey ? sort.asc : !!sortColumn.asc;
    const sorted = useMemo(() => sortPool(pool, sortColumn, sortAsc, ctx, columnOf(role, view.sort)), [pool, sortColumn, sortAsc, ctx, role, view.sort]);
    const sortStandings = standings[sortKey] ?? columnStandings(fullPool, sortColumn, ctx);

    const needle = normalize(search.trim());
    const match = needle.length >= 2 ? (sorted.find((row) => normalize(row.name).includes(needle)) ?? null) : null;
    // Calificado, pero de otro equipo que el del filtro: se dice dónde está (no que no califica)
    const elsewhere = needle.length >= 2 && !match && teamId !== null ? (fullPool.find((row) => normalize(row.name).includes(needle)) ?? null) : null;
    const elsewhereTeam = elsewhere?.teamId && data ? data.teams[elsewhere.teamId] : undefined;
    // Si no está entre los calificados, se ofrece su ficha igual (cualquier pelotero de la liga)
    const others = needle.length >= 2 && !match && !elsewhere ? (data?.players ?? []).filter((row) => row.role === role && normalize(row.name).includes(needle)).slice(0, 4) : [];

    const open = (row: { id: number; name: string; teamId: number | null }) => openPlayer(row, data && data.season !== data.currentSeason ? data.season : undefined);
    const toggleSort = (key: string) => {
        const column = columnOf(role, key);
        setSort((now) => (now && now.key === key ? { key, asc: !now.asc } : key === sortKey ? { key, asc: !sortAsc } : { key, asc: !!column.asc }));
    };
    const changeRole = (next: Role) => {
        setRole(next);
        setSort(null);
    };

    const glossary = useGlossary(role);
    const seasonText = data ? seasonLabel(data.season, activeLeague) : '';
    const eyebrow = [t(`leagues.${activeLeague}.name`), data ? t('pro.estadisticas.seasonEyebrow', { season: seasonText }) : null, t(`pro.estadisticas.phases.${missing ? primaryPhase : phase}`)].filter(Boolean).join(' · ');
    const teams = useMemo(() => Object.values(data?.teams ?? {}).sort((a, b) => a.abbrev.localeCompare(b.abbrev)), [data?.teams]);
    const viewLabel = t(`pro.estadisticas.views.${view.key}`);
    const poolNoun = view.pool;
    const rule =
        view.pool === 'batters'
            ? t('pro.estadisticas.rule.batters', { pa: minPlateAppearances(teamGames), games: teamGames })
            : view.pool === 'relievers'
              ? t('pro.estadisticas.rule.relievers', { games: minRelieverGames(teamGames) })
              : t('pro.estadisticas.rule.pitchers', { ip: Math.round(minOutsPro(teamGames) / 3), games: teamGames });
    const lead = match ?? sorted[0];
    const wide = width >= 360;

    return (
        <ProScroll onRefresh={() => Promise.all([active.refetch(), teamStats.refetch()])}>
            <ProStatsTabs active="estadisticas" />
            <ScreenTitle
                eyebrow={eyebrow}
                title={t('statsPage.title')}
                subtitle={t('pro.estadisticas.intro')}
                actions={<GlossaryButton title={t('pro.estadisticas.glossaryTitle')} entries={glossary} intro={t('pro.estadisticas.glossaryIntro')} />}
            />

            {/* Buscar y filtrar */}
            <View style={{ gap: 12 }}>
                <View
                    style={[
                        { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.tile, backgroundColor: colors.surface, paddingLeft: 16, borderWidth: 1.5, borderColor: focused ? colors.accent : alpha(colors.line, 0.06) },
                        shadow('card')
                    ]}
                >
                    <Search size={18} color={colors.muted} />
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        placeholder={t('statsPage.search')}
                        placeholderTextColor={colors.faint}
                        accessibilityLabel={t('pro.estadisticas.search.label')}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="words"
                        style={[{ flex: 1, minWidth: 0, height: 48, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
                    />
                    {needle.length >= 2 && (
                        <View accessibilityLiveRegion="polite" style={{ borderRadius: radius.pill, backgroundColor: alpha(colors.accent, 0.15), paddingHorizontal: 8, paddingVertical: 2, flexShrink: 0 }}>
                            <Txt size={11} weight="bold" color={colors.accentInk}>
                                {match ? t('pro.estadisticas.search.found') : elsewhere ? t('pro.estadisticas.search.elsewhereBadge', { team: elsewhereTeam?.abbrev ?? '' }) : t('pro.estadisticas.search.none')}
                            </Txt>
                        </View>
                    )}
                    {search ? (
                        <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel={t('statsPage.clear')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 2 }}>
                            <X size={18} color={colors.muted} />
                        </Pressable>
                    ) : (
                        <View style={{ width: 8 }} />
                    )}
                </View>
                <View style={{ flexDirection: wide ? 'row' : 'column', gap: 8 }}>
                    <ProSegmented<Role>
                        style={wide ? { flex: 1.3, flexBasis: 0 } : undefined}
                        label={t('statsPage.role', { defaultValue: t('statsPage.batters') })}
                        value={role}
                        onChange={changeRole}
                        track="surface"
                        options={[
                            { value: 'B', label: t('statsPage.batters') },
                            { value: 'P', label: t('statsPage.pitchers') }
                        ]}
                    />
                    {currentData && (
                        <ProSegmented<string>
                            style={wide ? { flex: 1, flexBasis: 0 } : undefined}
                            label={t('statsPage.seasonPicker', { defaultValue: seasonText })}
                            value={String(data?.season ?? currentData.season)}
                            onChange={(value) => setSeasonChoice(Number(value))}
                            track="surface"
                            options={currentData.seasons.slice(0, 2).map((year) => ({ value: String(year), label: seasonLabel(year, activeLeague) }))}
                        />
                    )}
                </View>
            </View>

            {((phases.length > 1 && !missing) || teams.length > 1) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {phases.length > 1 && !missing && <PhaseSelect value={phase} phases={phases} onChange={setPhase} />}
                    {teams.length > 1 && (
                        <ChipRow label={t('statsPage.filterTeam')} bleed={false} style={{ flex: 1, marginRight: -16 }}>
                            <ChipButton active={teamId === null} onPress={() => setTeamId(null)}>
                                {t('statsPage.allTeams')}
                            </ChipButton>
                            {teams.map((team) => (
                                <ChipButton key={team.id} active={teamId === team.id} onPress={() => setTeamId(teamId === team.id ? null : team.id)} icon={<TeamLogo team={team} size={24} />} accessibilityLabel={team.name} style={{ paddingLeft: 8 }}>
                                    {team.abbrev}
                                </ChipButton>
                            ))}
                            <View style={{ width: 8 }} />
                        </ChipRow>
                    )}
                </View>
            )}

            {autoPrevious && currentData && data && (
                <ProNote>{t('pro.estadisticas.notes.autoPrevious', { count: currentGames, current: seasonLabel(currentData.currentSeason, activeLeague), previous: seasonText, games: teamGames })}</ProNote>
            )}
            {!autoPrevious && data?.isPreviousSeason && <ProNote>{t('statsPage.previousSeason')}</ProNote>}
            {!autoPrevious && data && !data.isPreviousSeason && data.season === data.currentSeason && tooEarly(teamGames) && teamGames > 0 && <ProNote tone="warn">{t('pro.estadisticas.notes.tinySample', { count: teamGames })}</ProNote>}

            {!data && waitingForNetwork(active) ? (
                <OfflineState />
            ) : !data && (active.isPending || (proCurrent.isPending && !missing)) ? (
                <View style={{ gap: 12 }} accessibilityLabel={t('pro.estadisticas.loading')}>
                    <Skeleton height={190} />
                    <Skeleton height={420} />
                </View>
            ) : !data ? (
                <ErrorState message={errorText(active.error)} onRetry={() => active.refetch()} />
            ) : (
                <>
                    {lead && (
                        <LeadCard
                            role={role}
                            view={view}
                            row={lead}
                            rank={sorted.indexOf(lead) + 1}
                            isSearch={!!match}
                            teamAbbrev={teamId !== null ? (data.teams[teamId]?.abbrev ?? null) : null}
                            team={lead.teamId ? data.teams[lead.teamId] : undefined}
                            sortKey={sortKey}
                            sortStanding={sortStandings.get(lead.id)}
                            standings={standings}
                            ctx={ctx}
                            onOpen={open}
                        />
                    )}

                    <View style={{ gap: 12 }}>
                        <ModuleHeader title={t(`pro.estadisticas.table.title_${poolNoun}`, { count: fullPool.length })} />
                        <Txt size={12} tone="muted">
                            {rule}
                        </Txt>
                        <ProSegmented
                            value={view.key}
                            onChange={(value) => {
                                setViewKey((now) => ({ ...now, [role]: value }));
                                setSort(null);
                            }}
                            options={views.map((item) => ({ value: item.key, label: t(`pro.estadisticas.views.${item.key}`) }))}
                            label={t('pro.estadisticas.viewsLabel')}
                            variant="gradient"
                            fill={false}
                        />
                        <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), overflow: 'hidden' }, shadow('card')]}>
                            {sorted.length ? (
                                <StatsTable
                                    key={`${role}|${teamId}|${data.season}|${phase}`}
                                    role={role}
                                    view={view}
                                    rows={sorted}
                                    standings={standings}
                                    ctx={ctx}
                                    teams={data.teams}
                                    names={names}
                                    sort={{ key: sortKey, asc: sortAsc }}
                                    onSort={toggleSort}
                                    match={match}
                                    limit={expanded ? null : TOP}
                                    onOpen={open}
                                    label={t('pro.estadisticas.table.caption', { role: t(role === 'B' ? 'statsPage.batters' : 'statsPage.pitchers'), view: viewLabel, column: t(`pro.estadisticas.cols.${sortKey}.long`) })}
                                />
                            ) : (
                                <Txt size={14} tone="muted" center style={{ paddingHorizontal: 16, paddingVertical: 32 }}>
                                    {t(`pro.estadisticas.table.empty_${poolNoun}`)}
                                </Txt>
                            )}
                            {elsewhere ? (
                                <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08), padding: 12 }}>
                                    <Txt size={13} tone="muted">
                                        {t('pro.estadisticas.search.elsewhere', { name: elsewhere.name, team: elsewhereTeam?.abbrev ?? '', filter: teamId !== null ? (data.teams[teamId]?.abbrev ?? '') : '' })}
                                    </Txt>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                        <ProButton label={t('pro.estadisticas.search.clearTeam')} onPress={() => setTeamId(null)} />
                                        <ProButton label={t('pro.estadisticas.search.openOther', { name: elsewhere.name })} iconEnd icon={(c) => <ChevronRight size={16} color={c} />} onPress={() => open(elsewhere)} />
                                    </View>
                                </View>
                            ) : needle.length >= 2 && !match ? (
                                <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08), padding: 12 }}>
                                    <Txt size={13} tone="muted">
                                        {t(`pro.estadisticas.search.notInPool_${poolNoun}`, { q: search.trim() })}
                                    </Txt>
                                    {others.length > 0 && (
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                            {others.map((row) => (
                                                <ProButton key={row.id} label={t('pro.estadisticas.search.openOther', { name: row.name })} iconEnd icon={(c) => <ChevronRight size={16} color={c} />} onPress={() => open(row)} />
                                            ))}
                                        </View>
                                    )}
                                </View>
                            ) : null}
                            <View style={{ gap: 12, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08), padding: 12 }}>
                                <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                                    {t(`pro.estadisticas.viewNotes.${role}_${view.key}`, { fip: ctx?.fipConstant !== null && ctx?.fipConstant !== undefined ? ctx.fipConstant.toFixed(2) : '—', season: seasonText })}
                                </Txt>
                                <PercentileLegend />
                                <Txt size={11} tone="muted">
                                    {t('pro.estadisticas.table.neutral')}
                                </Txt>
                                {!ctx && !waitingLeague && (
                                    <Txt size={11} tone="muted">
                                        {t('pro.estadisticas.notes.noLeague')}
                                    </Txt>
                                )}
                                {sorted.length > TOP && (
                                    <ProButton
                                        block
                                        label={expanded ? t('pro.estadisticas.table.less') : t(`pro.estadisticas.table.all_${poolNoun}`, { count: sorted.length })}
                                        iconEnd
                                        icon={(c) => <ChevronRight size={16} color={c} style={{ transform: [{ rotate: expanded ? '-90deg' : '0deg' }] }} />}
                                        onPress={() => setExpanded((now) => !now)}
                                    />
                                )}
                            </View>
                        </View>
                    </View>

                    <LeagueTiles role={role} season={seasonText} averages={averages} fromPlayers={leagueFromList ? data.players.length : null} />

                    {view.pool !== 'relievers' && fullPool.length >= 3 && (
                        <ProfileScatter role={role} pool={fullPool} teams={data.teams} names={names} teamId={teamId} match={match} season={seasonText} averages={averages} onOpen={open} />
                    )}

                    {fullPool.length >= 2 && (
                        <CompareCard
                            key={role}
                            role={role}
                            pool={view.pool === 'relievers' ? poolOf<PlayerRow>(data.players, 'pitchers', teamGames) : fullPool}
                            teams={data.teams}
                            names={names}
                            match={match}
                            ctx={ctx}
                            season={seasonText}
                            league={t(`leagues.${activeLeague}.name`)}
                        />
                    )}

                    {!missing && <TeamsPreview season={data.season} phase={phase} />}

                    {/* Extra (no está en el diseño): la defensa por posición que MLB da de LIDOM, en su propio módulo */}
                    {role === 'B' && !missing && <FieldingPanel league={activeLeague} season={data.season} phase={phase} teamId={teamId} search={needle} names={names} teamGames={teamGames} onOpen={open} />}
                </>
            )}
        </ProScroll>
    );
};
