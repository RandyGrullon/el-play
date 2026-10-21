// Líderes del modo PRO (igual que la web): triple corona, selector de fase, tablero por grupos (Poder · Contacto ·
// Disciplina · Pitcheo · Fantasy) con tarjetas de 10 y las categorías avanzadas. Todo se calcula con las líneas de
// todos los peloteros (/api/v2/pro/players) y la regla de calificado de Estadísticas. Si la temporada nueva lleva muy
// pocos juegos, se ve la anterior completa y la pantalla lo dice (con un botón para ver la nueva igual).
// Sin /api/v2/pro/players (producción todavía) se muestra `fallback`: los líderes del Lite.
import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { LeagueId } from '../../../types';
import type { ProPhaseId, ProPlayerRow } from '../../../types/pro-liga';
import { useProPlayers, useProStandings, useProTeamStats } from '../../../lib/pro/liga';
import { isRouteMissing } from '../../../lib/pro/http';
import { seasonLabel } from '../../../lib/format';
import { useLeague } from '../../../state/league';
import { useColors } from '../../../theme/theme';
import { alpha } from '../../../theme/tokens';
import { Screen } from '../../layout';
import { ErrorState, OfflineState, Skeleton, Txt, useErrorText } from '../../ui';
import { openPlayer, waitingForNetwork } from '../../stats/common';
import { useShare } from '../../share/ShareSheet';
import type { PlayerPost } from '../../share/subjects';
import { Enter, ModuleHeader, ProButton, ProNote, ProSegmented, ScreenTitle, useReorder } from '../kit';
import {
    ADVANCED_CATEGORIES,
    LEADER_CATEGORIES,
    LEADER_GROUPS,
    ipFromOuts,
    isQualified,
    leadersSeason,
    qualifierMinimums,
    rankCategory,
    shortLabels,
    teamGamesOf,
    tripleCrown,
    type LeaderBoard,
    type LeaderCategoryId,
    type LeaderContext,
    type LeaderGroupId
} from './logic';
import { LeaderCard } from './LeaderCard';
import { TripleCrown } from './TripleCrown';
import { AdvancedTable } from './AdvancedTable';

const PHASES: Record<LeagueId, ProPhaseId[]> = {
    lidom: ['regular', 'roundRobin', 'final'],
    wbc: ['pool', 'quarterfinal', 'semifinal', 'final'],
    sdc: ['tournament']
};

const GROUPS: LeaderGroupId[] = ['power', 'contact', 'discipline', 'pitching', 'fantasy'];

type Averages = Parameters<typeof rankCategory>[3];
const boardOf = (rows: ProPlayerRow[], ids: LeaderCategoryId[], context: LeaderContext, averages: Averages) => ids.map((id) => rankCategory(rows, LEADER_CATEGORIES[id], context, averages));

export const ProLeaders: React.FC<{ tabs: React.ReactNode; fallback: React.ReactNode }> = ({ tabs, fallback }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const errorText = useErrorText();
    const reorder = useReorder();
    const { activeLeague } = useLeague();
    const { share, sheet } = useShare();
    const twoColumns = useWindowDimensions().width >= 360;
    const standings = useProStandings(activeLeague);
    // Lo que escogió el usuario; al cambiar de liga vuelve a empezar (se ajusta en el render, sin efecto)
    const [picked, setPicked] = useState<{ league: LeagueId; preferCurrent: boolean; phase: ProPhaseId | null }>({ league: activeLeague, preferCurrent: false, phase: null });
    const current = picked.league === activeLeague ? picked : { league: activeLeague, preferCurrent: false, phase: null };
    const [group, setGroup] = useState<LeaderGroupId>('power');

    const choice = leadersSeason(standings.data, current.preferCurrent);
    const ready = !!choice || standings.isError;
    // La temporada vigente va sin `season` para compartir la caché con Estadísticas
    const seasonParam = choice && choice.season !== choice.current ? choice.season : undefined;
    const phases = PHASES[activeLeague];
    const firstPhase = phases[0];
    const lidomInfo = standings.data?.type === 'lidom' ? standings.data : null;
    const defaultPhase: ProPhaseId = lidomInfo && !seasonParam ? lidomInfo.activePhase : firstPhase;
    const phase = current.phase && phases.includes(current.phase) ? current.phase : defaultPhase;

    const players = useProPlayers(activeLeague, seasonParam, phase, ready);
    const regular = useProPlayers(activeLeague, seasonParam, firstPhase, ready);
    const phaseStats = useProTeamStats(activeLeague, phase, seasonParam, ready);
    const regularStats = useProTeamStats(activeLeague, firstPhase, seasonParam, ready);

    // Fases con juegos: en la temporada vigente de LIDOM lo dicen las posiciones; una pasada ya se jugó entera
    const played = (id: ProPhaseId) => {
        if (!lidomInfo || seasonParam || !lidomInfo.pro.phases) return true;
        const info = lidomInfo.pro.phases[id as 'regular' | 'roundRobin' | 'final'];
        return info ? info.played > 0 : true;
    };

    const shown = players.data;
    const teams = useMemo(() => shown?.teams ?? regular.data?.teams ?? {}, [shown, regular.data]);
    const season = shown?.season ?? regular.data?.season ?? choice?.season;
    const seasonText = season ? seasonLabel(season, activeLeague) : '';
    const leagueName = t(`leagues.${activeLeague}.name`);

    const phaseContext: LeaderContext = useMemo(() => ({ teamGames: teamGamesOf(shown?.players ?? []), fip: phaseStats.data?.constants.fip ?? null }), [shown, phaseStats.data]);
    const regularContext: LeaderContext = useMemo(() => ({ teamGames: teamGamesOf(regular.data?.players ?? []), fip: regularStats.data?.constants.fip ?? null }), [regular.data, regularStats.data]);

    const boards = useMemo(() => (shown ? boardOf(shown.players, LEADER_GROUPS[group], phaseContext, phaseStats.data?.averages) : []), [shown, group, phaseContext, phaseStats.data]);
    const crown = useMemo(() => {
        if (!regular.data) return null;
        const rows = regular.data.players;
        const hitting = boardOf(rows, ['avg', 'hr', 'rbi'], regularContext, regularStats.data?.averages) as [LeaderBoard, LeaderBoard, LeaderBoard];
        const pitching = boardOf(rows, ['w', 'k', 'era'], regularContext, regularStats.data?.averages) as [LeaderBoard, LeaderBoard, LeaderBoard];
        const qualified = rows.filter((row) => !!row.hitting && row.hitting.pa > 0 && isQualified(row, 'B', regularContext.teamGames));
        return { hitting, pitching, qualified };
    }, [regular.data, regularContext, regularStats.data]);
    const advanced = useMemo(() => (regular.data ? boardOf(regular.data.players, ADVANCED_CATEGORIES, regularContext, regularStats.data?.averages) : []), [regular.data, regularContext, regularStats.data]);

    // Rótulos cortos sin confusiones entre los que se ven: las tarjetas del grupo, la triple corona y las avanzadas
    const labels = useMemo(() => {
        const people: ProPlayerRow[] = boards.flatMap((board) => board.leaders.map((item) => item.row));
        if (crown) {
            for (const board of [...crown.hitting, ...crown.pitching]) people.push(...board.leaders.filter((item) => item.rank === 1).map((item) => item.row));
            people.push(...tripleCrown(crown.hitting).inAll);
        }
        for (const board of advanced) people.push(...board.leaders.slice(0, 2).map((item) => item.row));
        return shortLabels(people);
    }, [boards, crown, advanced]);
    const label = (row: ProPlayerRow) => labels.get(row.id) ?? row.name;

    // Producción todavía sin la ruta: los líderes del Lite
    if (!shown && isRouteMissing(players.error)) return <>{fallback}</>;

    // La final del Clásico no es una «serie»
    const phaseName = (id: ProPhaseId) => (id === 'final' && activeLeague !== 'lidom' ? t('pro.lideres.phases.championship') : t(`pro.lideres.phases.${id}`));
    const shortPhase = (id: ProPhaseId) => t(`pro.lideres.phasesShort.${id}`);
    const minimums = qualifierMinimums(regularContext.teamGames);
    const open = (row: ProPlayerRow) => openPlayer({ id: row.id, name: row.name, teamId: row.teamId }, seasonParam);

    const shareBoard = (board: LeaderBoard) => {
        const first = board.leaders[0];
        if (!first) return;
        const team = first.row.teamId !== null ? teams[first.row.teamId] : undefined;
        const title = t(`pro.lideres.categories.${board.category.id}.title`);
        const data: PlayerPost = {
            kind: 'player',
            personId: first.row.id,
            name: first.row.name,
            teamId: first.row.teamId,
            teamName: team?.name ?? '',
            teamAbbrev: team?.abbrev ?? '',
            logo: team?.logo ?? null,
            color: team?.color ?? '#2563eb',
            value: first.display,
            label: `${title} · ${phaseName(phase)}`,
            context: t('share.rankIn', { rank: first.rank, league: leagueName, season: seasonText }),
            league: leagueName
        };
        share({ data, fileName: `el-play-${title}-${first.row.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), text: `${first.row.name} · ${title} ${first.display} · El Play` });
    };

    const loading = !ready || players.isPending;
    const failed = players.isError && !shown;
    const boardTitle = t('pro.lideres.board.title', { phase: phaseName(phase), group: t(`pro.lideres.groups.${group}`) });
    // A 320 px el encabezado va con la fase corta («Regular») para que quepa el grupo
    const boardHeader = twoColumns ? boardTitle : t('pro.lideres.board.title', { phase: shortPhase(phase), group: t(`pro.lideres.groups.${group}`) });
    const setPhase = (next: ProPhaseId) => setPicked({ ...current, phase: next });

    return (
        <Screen
            onRefresh={async () => {
                await Promise.all([standings.refetch(), players.refetch(), regular.refetch(), phaseStats.refetch(), regularStats.refetch()]);
            }}
        >
            {tabs}
            <ScreenTitle eyebrow={`${leagueName}${seasonText ? ` · ${t('common.season', { season: seasonText })}` : ''}`} title={t('leaders.title')} />

            {choice?.thin && choice.games !== null && (
                <ProNote>
                    <View style={{ gap: 2 }}>
                        <Txt size={13} style={{ lineHeight: 18 }}>
                            <Txt size={13} weight="bold">
                                {`${t(choice.fallback ? 'pro.lideres.fallback.title' : 'pro.lideres.current.title', { current: seasonLabel(choice.current, activeLeague), count: choice.games })} `}
                            </Txt>
                            <Txt size={13} color={colors.accentInk}>
                                {choice.fallback
                                    ? // Sin las líneas (cargando o con error) no se sabe cuántos juegos tuvo: la frase va sin el número
                                      regularContext.teamGames > 0
                                        ? t('pro.lideres.fallback.body', { season: seasonLabel(choice.season, activeLeague), games: regularContext.teamGames })
                                        : t('pro.lideres.fallback.bodyNoGames', { season: seasonLabel(choice.season, activeLeague) })
                                    : t('pro.lideres.current.body')}
                            </Txt>
                        </Txt>
                        <ProButton
                            variant="ghost"
                            label={choice.fallback ? t('pro.lideres.fallback.show', { current: seasonLabel(choice.current, activeLeague) }) : t('pro.lideres.current.back', { season: seasonLabel(choice.current - 1, activeLeague) })}
                            onPress={() => setPicked({ league: activeLeague, preferCurrent: !current.preferCurrent, phase: null })}
                            style={{ alignSelf: 'flex-start', marginLeft: -12, marginBottom: -8 }}
                        />
                    </View>
                </ProNote>
            )}
            {!choice?.thin && shown?.isPreviousSeason && <ProNote>{t('leaders.previousSeason')}</ProNote>}

            {waitingForNetwork(players) ? (
                <OfflineState />
            ) : loading ? (
                <View style={{ gap: 12 }}>
                    <Skeleton height={380} />
                    <Skeleton height={44} round={22} />
                    <View style={{ flexDirection: twoColumns ? 'row' : 'column', gap: 12 }}>
                        <Skeleton height={480} round={20} style={{ flex: 1 }} />
                        {twoColumns && <Skeleton height={480} round={20} style={{ flex: 1 }} />}
                    </View>
                </View>
            ) : failed ? (
                <ErrorState message={errorText(players.error)} onRetry={() => players.refetch()} />
            ) : (
                <>
                    {crown && (
                        <TripleCrown
                            hitting={crown.hitting}
                            pitching={crown.pitching}
                            qualified={crown.qualified}
                            context={regularContext}
                            teams={regular.data?.teams ?? teams}
                            aside={`${shortPhase(firstPhase)} ${seasonText}`}
                            onOpen={open}
                            label={label}
                        />
                    )}

                    {/* Las pestañas de fase controlan el tablero (la corona y las avanzadas son siempre de la regular) */}
                    {phases.length > 1 && (
                        <ProSegmented
                            value={phase}
                            onChange={setPhase}
                            label={t('pro.lideres.phasesLabel')}
                            track="surface"
                            options={phases.map((id) => ({ value: id, label: phaseName(id), disabled: !played(id), accessibilityLabel: played(id) ? undefined : t('pro.lideres.phaseEmpty', { phase: phaseName(id) }) }))}
                        />
                    )}
                    {/* Los cinco grupos caben a 390 px como en el diseño; más angosto, la franja se desliza */}
                    <ProSegmented
                        value={group}
                        onChange={setGroup}
                        label={t('pro.lideres.groupsLabel')}
                        track="surface"
                        fill={false}
                        options={GROUPS.map((id) => ({
                            value: id,
                            // Menos aire a los lados (el segmentado del kit deja 16 px) para que los cinco quepan a 390 px
                            label: (
                                <Txt size={13} weight="bold" color={id === group ? colors.bg : alpha(colors.ink, 0.7)} style={{ marginHorizontal: -8 }}>
                                    {t(`pro.lideres.groups.${id}`)}
                                </Txt>
                            ),
                            accessibilityLabel: t(`pro.lideres.groups.${id}`)
                        }))}
                    />

                    <View accessibilityLabel={boardTitle} style={{ gap: 12 }}>
                        <ModuleHeader title={boardHeader} aside={t('pro.lideres.board.top')} />
                        {shown && shown.players.length === 0 ? (
                            <ProNote tone="neutral">{t('pro.lideres.board.phaseEmpty')}</ProNote>
                        ) : (
                            // Al cambiar de fase el tablero entra de nuevo con un fundido; al cambiar de grupo cada puesto de
                            // la rejilla se queda y, si cambia la altura de los de arriba, se desliza a su lugar (FLIP)
                            <Enter key={`${phase}-${seasonParam ?? 'actual'}`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 }}>
                                {boards.map((board, index) => (
                                    <Animated.View key={index} layout={reorder} style={twoColumns ? { width: '47.5%', flexGrow: 1, flexBasis: 0, minWidth: '45%' } : { width: '100%' }}>
                                        <Enter key={board.category.id} index={index} step={40}>
                                            <LeaderCard board={board} teams={teams} onOpen={open} onShare={shareBoard} label={label} />
                                        </Enter>
                                    </Animated.View>
                                ))}
                            </Enter>
                        )}
                    </View>

                    <AdvancedTable
                        boards={advanced}
                        teams={regular.data?.teams ?? teams}
                        aside={t('pro.lideres.advanced.aside', { phase: t(`pro.lideres.phasesOf.${firstPhase}`) })}
                        caption={t('pro.lideres.advanced.caption', { phase: phaseName(firstPhase), season: seasonText })}
                        fip={regularContext.fip}
                        onOpen={open}
                        label={label}
                    />

                    <ProNote tone="neutral">
                        {`${t('pro.lideres.qualified', { pa: minimums.pa, ip: ipFromOuts(minimums.outs).replace(/\.0$/, '') })}${regularContext.fip !== null ? ` ${t('pro.lideres.fipNote', { league: leagueName, season: seasonText, c: regularContext.fip.toFixed(2) })}` : ''}`}
                    </ProNote>
                    <Txt size={12} tone="muted">
                        {t('pro.lideres.source', { league: leagueName, season: seasonText })}
                    </Txt>
                </>
            )}
            {sheet}
        </Screen>
    );
};
