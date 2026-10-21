import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLeague } from '../../../state/league';
import { localeFor, seasonLabel } from '../../../lib/format';
import { teamGamesOf, usePlayer, usePlayers, type PlayerRow } from '../../../lib/stats';
import { useProPlayer, useProPlayers, useProTeamStats } from '../../../lib/pro/liga';
import { isRouteMissing } from '../../../lib/pro/http';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { ErrorState, OfflineState, Skeleton, Txt, useErrorText, type LogoTeam } from '../../ui';
import { waitingForNetwork } from '../../stats/common';
import { ProButton, ProNote, ProSegmented } from '../kit';
import { contextOf, leagueFromPlayers, poolKindFor, poolOf, tooEarly } from '../estadisticas/logic';
import { FichaHeader } from './FichaHeader';
import { TodayGame } from './TodayGame';
import { SeasonTiles } from './SeasonTiles';
import { FichaPercentiles } from './FichaPercentiles';
import { Situations } from './Situations';
import { SprayZones } from './SprayZones';
import { Arsenal } from './Arsenal';
import { FantasyBlock } from './FantasyBlock';
import { GameLogPro } from './GameLogPro';
import { ByOpponentMonth } from './ByOpponentMonth';
import { CareerPro } from './CareerPro';
import { MoreFromMlb } from './MoreFromMlb';
import { ShareFichaCard, ShareFichaSheet } from './ShareFicha';

export interface PlayerProfileProProps {
    id: number;
    name: string;
    team?: LogoTeam | null;
    /** Temporada que se ve (undefined = la vigente, o la pasada si la vigente apenas empieza) */
    season?: number;
    onSeasonChange: (season: number) => void;
    onOpenGame: (gamePk: number) => void;
    action?: React.ReactNode;
    /** La pantalla pidió compartir (botón de arriba) */
    shareOpen?: boolean;
    onShareClose?: () => void;
}

// Ficha del pelotero en modo PRO: cabecera con su forma reciente, percentiles contra la liga, situaciones en pares,
// abanico y zonas (o repertorio), fantasy por juego, juego a juego completo y su carrera, con lo demás que MLB manda
// de LIDOM (por rival y por mes, avanzadas y movimientos). Si MLB (o el servidor) no manda un bloque, no sale: sin
// /api/v2/pro/* se pinta lo que da la ficha de siempre y la liga se calcula con las líneas de todos los peloteros.
export const PlayerProfilePro: React.FC<PlayerProfileProProps> = ({ id, name, team, season, onSeasonChange, onOpenGame, action, shareOpen = false, onShareClose }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const errorText = useErrorText();
    const { activeLeague } = useLeague();
    // Si la persona elige otra temporada en la ficha, ya no hace falta explicar por qué se ve la pasada
    const [picked, setPicked] = useState(false);
    const [sharing, setSharing] = useState(false);
    const pick = (next: number) => {
        setPicked(true);
        onSeasonChange(next);
    };

    // La temporada vigente con menos de 5 juegos por equipo no dice nada: se muestra la pasada completa (con nota)
    const current = usePlayer(id, activeLeague);
    const proCurrentPool = useProPlayers(activeLeague);
    const poolMissing = isRouteMissing(proCurrentPool.error);
    const liteCurrentPool = usePlayers(activeLeague, undefined, poolMissing);
    const currentPool = poolMissing ? liteCurrentPool : proCurrentPool;
    const currentGames = currentPool.data ? teamGamesOf(currentPool.data.players) : null;
    // Sin red o con la lista caída no se espera por ella: se decide con lo que hay
    const deciding = season === undefined && (current.isPending || (currentPool.isPending && !waitingForNetwork(currentPool) && !currentPool.isError));
    const earlyCurrent = !!currentPool.data && !currentPool.data.isPreviousSeason && currentGames !== null && tooEarly(currentGames);
    const now = current.data;
    const autoPrevious = season === undefined && earlyCurrent && !!now && now.season === now.currentSeason && now.career.some((row) => row.season === now.currentSeason - 1);
    const viewSeason = season ?? (autoPrevious ? now!.currentSeason - 1 : undefined);

    const detail = usePlayer(deciding ? null : id, activeLeague, viewSeason);
    const proQuery = useProPlayer(deciding ? null : id, activeLeague, viewSeason);
    const player = detail.data;
    const pro = proQuery.data;
    const proMissing = isRouteMissing(proQuery.error);
    // El grupo de la liga de esa temporada (para percentiles, promedios y puestos) y los promedios de la liga
    const poolSeason = player && currentPool.data && player.season === currentPool.data.season ? undefined : player?.season;
    const proPool = useProPlayers(activeLeague, poolSeason, undefined, !!player && !poolMissing);
    const litePool = usePlayers(activeLeague, poolSeason, !!player && poolMissing);
    const poolQuery = poolMissing ? litePool : proPool;
    const teamStats = useProTeamStats(activeLeague, undefined, player?.season, !!player && !poolMissing);
    const allPlayers = useMemo<PlayerRow[]>(() => poolQuery.data?.players ?? [], [poolQuery.data]);
    const fromPlayers = useMemo(() => (allPlayers.length ? leagueFromPlayers(allPlayers) : null), [allPlayers]);
    const waitingLeague = !teamStats.data && teamStats.isPending && teamStats.fetchStatus !== 'idle';
    const ctx = teamStats.data ? contextOf(teamStats.data) : waitingLeague ? null : (fromPlayers?.ctx ?? null);
    const averages = teamStats.data?.averages ?? (waitingLeague ? null : (fromPlayers?.averages ?? null));
    const teamGames = useMemo(() => teamGamesOf(allPlayers), [allPlayers]);
    const pool = useMemo(() => (player ? poolOf(allPlayers, poolKindFor(player.role), teamGames) : []), [allPlayers, player, teamGames]);
    const seasonText = player ? seasonLabel(player.season, activeLeague) : '';
    const leagueName = t(`leagues.${activeLeague}.name`);
    const color = player?.team?.color || pro?.team?.color || team?.color || colors.accent;

    const seasons = player && player.currentSeason > 0 ? [player.currentSeason, player.currentSeason - 1, player.currentSeason - 2] : [];
    const currentG = now?.season === now?.currentSeason ? (now?.g ?? 0) : 0;
    // Se ve la pasada porque la vigente apenas empieza (la eligió la ficha o la pantalla que la abrió)
    const showNote = !picked && earlyCurrent && !!player && !!now && player.season === now.currentSeason - 1;
    let autoNote: string | null = null;
    if (showNote && now && player) {
        const currentText = seasonLabel(now.currentSeason, activeLeague);
        if (!now.g || !now.log.length) autoNote = t('pro.ficha.auto.noGames', { current: currentText, previous: seasonText });
        else {
            const last = now.log[0];
            const line = player.role === 'P' && last.pitching ? t('pro.ficha.auto.linePitch', { ip: last.pitching.ip, er: last.pitching.er, k: last.pitching.k }) : last.hitting ? `${last.hitting.h}-${last.hitting.ab}` : '';
            const day = new Date(`${last.date}T12:00:00Z`).toLocaleDateString(localeFor(i18n.language), { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
            const pts = `${last.pts > 0 ? '+' : last.pts < 0 ? '−' : ''}${Math.abs(last.pts)}`;
            autoNote =
                now.g === 1
                    ? t('pro.ficha.auto.one', { current: currentText, previous: seasonText, line, rival: last.opponent?.abbrev ?? '', date: day, pts })
                    : t('pro.ficha.auto.many', { current: currentText, previous: seasonText, count: now.g, pts: now.pts });
        }
    }

    const loading = deciding || detail.isPending;
    const card = { borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16 };

    return (
        <View style={{ gap: 16 }}>
            <FichaHeader id={id} name={player?.name || name} team={team} player={player} pro={pro} color={color} league={activeLeague} seasonText={seasonText} />

            {action}

            {now?.team && <TodayGame league={activeLeague} teamId={now.team.id} onOpen={onOpenGame} />}

            {seasons.length > 0 && (
                <ProSegmented
                    value={String(player!.season)}
                    onChange={(value) => pick(Number(value))}
                    label={t('pro.ficha.seasonPicker')}
                    track="surface"
                    options={seasons.map((year) => ({
                        value: String(year),
                        label: year === player!.currentSeason && currentG > 0 && showNote ? t('pro.ficha.seasonWithGames', { season: seasonLabel(year, activeLeague), count: currentG }) : seasonLabel(year, activeLeague)
                    }))}
                />
            )}

            {autoNote && <ProNote>{autoNote}</ProNote>}

            {!player && (waitingForNetwork(detail) || (deciding && waitingForNetwork(current))) ? (
                <OfflineState />
            ) : loading ? (
                <View style={{ gap: 12 }} accessibilityLabel={t('pro.ficha.loading')}>
                    <Skeleton height={112} />
                    <Skeleton height={288} />
                    <Skeleton height={224} />
                </View>
            ) : detail.isError && !player ? (
                <ErrorState message={errorText(detail.error)} onRetry={() => detail.refetch()} />
            ) : player ? (
                <>
                    {player.g > 0 ? (
                        <SeasonTiles player={player} pool={pool} all={allPlayers} league={leagueName} />
                    ) : (
                        <View style={[card, { gap: 8 }, shadow('card')]}>
                            <Txt size={14} tone="muted" center>
                                {t('statsPage.noGames')}
                            </Txt>
                            {player.season > player.currentSeason - 2 && <ProButton block label={t('statsPage.seePrevious', { season: seasonLabel(player.season - 1, activeLeague) })} onPress={() => pick(player.season - 1)} />}
                        </View>
                    )}
                    {player.g > 0 && (
                        <FichaPercentiles
                            player={player}
                            pool={pool}
                            ctx={ctx}
                            averages={averages}
                            seasonText={seasonText}
                            league={leagueName}
                            loading={poolQuery.isPending && poolQuery.fetchStatus !== 'idle'}
                            fromPlayers={!teamStats.data && !waitingLeague && !!fromPlayers}
                        />
                    )}
                    {proQuery.isPending && proQuery.fetchStatus !== 'idle' && <Skeleton height={192} />}
                    {proQuery.isError && !pro && !proMissing && (
                        <ProNote tone="warn">
                            <Txt size={13} style={{ lineHeight: 18 }}>
                                {t('pro.ficha.proError')}
                            </Txt>
                            <ProButton variant="ghost" label={t('pro.ficha.retry')} onPress={() => proQuery.refetch()} style={{ marginTop: 4, marginLeft: -20 }} />
                        </ProNote>
                    )}
                    {pro && <Situations player={player} pro={pro} />}
                    {pro && player.role === 'B' && <SprayZones player={player} pro={pro} />}
                    {pro && player.role === 'P' && <Arsenal pro={pro} />}
                    {pro && player.role === 'P' && <SprayZones player={player} pro={pro} />}
                    <FantasyBlock player={player} all={allPlayers} seasonText={seasonText} league={leagueName} />
                    <GameLogPro player={player} pro={pro} onOpenGame={onOpenGame} />
                    <ByOpponentMonth player={player} pro={pro} />
                    <CareerPro player={player} pro={pro} />
                    {pro && <MoreFromMlb player={player} pro={pro} />}
                    <ShareFichaCard player={player} color={color} onShare={() => setSharing(true)} />
                    <ShareFichaSheet
                        open={sharing || shareOpen}
                        onClose={() => {
                            setSharing(false);
                            onShareClose?.();
                        }}
                        player={player}
                        pro={pro}
                        pool={pool}
                        ctx={ctx}
                        averages={averages}
                        seasonText={seasonText}
                        color={color}
                        league={leagueName}
                    />
                </>
            ) : null}
        </View>
    );
};
