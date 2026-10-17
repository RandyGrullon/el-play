// Ficha del pelotero (igual que PlayerSheet de la web): quién es, cómo va en el fantasy, su temporada,
// métricas avanzadas en PRO, juego a juego y su carrera en la liga. La usa la pantalla /jugador/[id];
// `PlayerProfile` es solo el contenido, por si otra pantalla la quiere dentro de su propia hoja (con `action`).
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { useLeague } from '../../state/league';
import { localeFor, seasonLabel } from '../../lib/format';
import { gameLine, usePlayer, type CareerRow, type GameLogRow, type PlayerDetail, type PlayersData } from '../../lib/stats';
import { battingAdvanced, fmtDec, fmtPct, fmtRate, pitchingAdvanced } from '../../lib/advanced';
import { useIsPro } from '../../lib/pro';
import type { Leaders, Schedule, Standings, StandingRow } from '../../types';
import { useColors } from '../../theme/theme';
import { alpha, inkOn, radius, shadow } from '../../theme/tokens';
import { Card, ErrorState, Gradient, PlayerPhoto, ProBadge, Row, Segmented, Skeleton, TeamLogo, Txt, useErrorText, type LogoTeam } from '../ui';
import { CellText, FrozenTable, HeadText, type FrozenColumn } from './FrozenTable';
import { MoreButton } from './common';

export interface PlayerProfileProps {
    id: number;
    name: string;
    /** Para pintar la cabecera mientras llega la ficha */
    team?: LogoTeam | null;
    /** Temporada que se ve (undefined = la actual) */
    season?: number;
    onSeasonChange: (season: number) => void;
    onOpenGame: (gamePk: number) => void;
    /** Botón extra (p. ej. «Agregar a mi equipo» desde el fantasy) */
    action?: React.ReactNode;
}

/** «16 oct» (las fechas del juego a juego vienen como día, sin hora) */
const shortDay = (day: string, lang: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');

/** Color y logo del equipo ya en caché (estadísticas, posiciones, líderes o calendario), para la cabecera al instante */
export const findCachedTeam = (client: QueryClient, teamId: number | null | undefined): LogoTeam | null => {
    if (!teamId) return null;
    for (const [, data] of client.getQueriesData<PlayersData>({ queryKey: ['players'] })) {
        const team = data?.teams[teamId];
        if (team) return team;
    }
    for (const [, data] of client.getQueriesData<Standings>({ queryKey: ['standings'] })) {
        if (!data) continue;
        const rows: StandingRow[] = data.type === 'lidom' ? [...data.regular, ...data.roundRobin, ...data.final] : data.type === 'sdc' ? data.teams : Object.values(data.pools).flat();
        const row = rows.find((item) => item.team.id === teamId);
        if (row) return row.team;
    }
    for (const [, data] of client.getQueriesData<Leaders>({ queryKey: ['leaders'] })) {
        const leader = data?.categories.flatMap((category) => category.leaders).find((item) => item.teamId === teamId);
        if (leader) return { id: teamId, abbrev: leader.teamAbbrev, logo: leader.logo, color: leader.color };
    }
    for (const [, data] of client.getQueriesData<Schedule>({ queryKey: ['schedule'] })) {
        const game = data?.games.find((item) => item.away.id === teamId || item.home.id === teamId);
        if (game) return game.away.id === teamId ? game.away : game.home;
    }
    return { id: teamId };
};

export const useCachedTeam = (teamId: number | null | undefined) => {
    const client = useQueryClient();
    const [team] = useState(() => findCachedTeam(client, teamId));
    return team;
};

export const PlayerProfile: React.FC<PlayerProfileProps> = ({ id, name, team, season, onSeasonChange, onOpenGame, action }) => {
    const { t } = useTranslation();
    const errorText = useErrorText();
    const { activeLeague } = useLeague();
    const query = usePlayer(id, activeLeague, season);
    const player = query.data;
    const color = player?.team?.color || team?.color || '#2563eb';
    const ink = inkOn(color);
    const headerTeam = player?.team ? { id: player.team.id, logo: player.team.logo, color: player.team.color } : team;

    return (
        <View style={{ gap: 16 }}>
            {/* Cabecera en el color del equipo */}
            <View style={{ borderRadius: 28, padding: 16, overflow: 'hidden', backgroundColor: color }}>
                <Row gap={16}>
                    <PlayerPhoto personId={id} name={player?.name || name} size={96} background="rgba(255,255,255,0.25)" team={headerTeam} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt size={13} weight="bold" color={ink} style={{ opacity: 0.85 }}>
                            {[player?.number ? `#${player.number}` : null, player?.pos, player?.team?.abbrev ?? team?.abbrev].filter(Boolean).join(' · ') || ' '}
                        </Txt>
                        <Txt size={26} weight="extrabold" color={ink} style={{ lineHeight: 28, letterSpacing: -0.3 }}>
                            {player?.name || name || ' '}
                        </Txt>
                        <Txt size={14} weight="semibold" color={ink} numberOfLines={1} style={{ marginTop: 2, opacity: 0.85 }}>
                            {player?.team?.name || ' '}
                        </Txt>
                    </View>
                </Row>
                {player && <Bio player={player} ink={ink} />}
            </View>

            {action}

            {query.isPending ? (
                <View style={{ gap: 12 }}>
                    <Skeleton height={128} />
                    <Skeleton height={160} />
                </View>
            ) : query.isError && !player ? (
                <ErrorState message={errorText(query.error)} onRetry={() => query.refetch()} />
            ) : player ? (
                <>
                    {player.currentSeason > 0 && (
                        <Segmented<string>
                            small
                            value={String(player.season)}
                            onChange={(value) => onSeasonChange(Number(value))}
                            options={[player.currentSeason, player.currentSeason - 1, player.currentSeason - 2].map((year) => ({ value: String(year), label: seasonLabel(year, activeLeague) }))}
                        />
                    )}
                    <FantasyCard player={player} />
                    {player.g > 0 ? (
                        <>
                            <SeasonGrid player={player} />
                            <AdvancedGrid player={player} />
                        </>
                    ) : (
                        player.season > player.currentSeason - 2 && <MoreButton label={t('statsPage.seePrevious', { season: seasonLabel(player.season - 1, activeLeague) })} onPress={() => onSeasonChange(player.season - 1)} />
                    )}
                    <GameLog player={player} onOpenGame={onOpenGame} />
                    <Career player={player} />
                </>
            ) : null}
        </View>
    );
};

// ---------------------------------------------------------------- piezas

const Bio: React.FC<{ player: PlayerDetail; ink: string }> = ({ player, ink }) => {
    const { t } = useTranslation();
    const side = (code: string | null) => (code ? t(`statsPage.side.${code}`, { defaultValue: code }) : null);
    const chips = [
        player.bats && player.throws ? t('statsPage.batsThrows', { bats: side(player.bats), throws: side(player.throws) }) : null,
        player.age ? t('statsPage.age', { age: player.age }) : null,
        player.birthPlace ? t('statsPage.born', { place: player.birthPlace }) : null,
        player.height && player.weight ? `${player.height} · ${player.weight} lb` : null
    ].filter(Boolean) as string[];
    if (!chips.length) return null;
    return (
        <Row gap={6} wrap style={{ marginTop: 12 }}>
            {chips.map((chip) => (
                <View key={chip} style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Txt size={12} weight="semibold" color={ink}>
                        {chip}
                    </Txt>
                </View>
            ))}
        </Row>
    );
};

const FantasyCard: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const { activeLeague } = useLeague();
    const recent = player.log.slice(0, 10).reverse();
    const max = Math.max(1, ...recent.map((game) => Math.abs(game.pts)));
    return (
        <Gradient style={[{ borderRadius: radius.card, padding: 16, overflow: 'hidden' }, shadow('float')]}>
            <View pointerEvents="none" style={{ position: 'absolute', right: -12, top: -12, opacity: 0.15 }}>
                <Sparkles size={80} color="#fff" />
            </View>
            <Txt size={11} weight="extrabold" tone="white" style={{ textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.85 }}>
                {t('statsPage.fantasyTitle', { season: seasonLabel(player.season, activeLeague) })}
            </Txt>
            <Row align="flex-end" gap={12} style={{ marginTop: 4 }}>
                <Txt size={48} weight="extrabold" tone="white" tabular style={{ lineHeight: 50 }}>
                    {player.pts}
                </Txt>
                <Txt size={14} weight="semibold" tone="white" style={{ paddingBottom: 6, opacity: 0.9, flexShrink: 1 }}>
                    {player.g ? t('statsPage.perGame', { ppg: player.ppg, count: player.g }) : t('statsPage.noGames')}
                </Txt>
            </Row>
            {recent.length > 1 && (
                <View style={{ marginTop: 16 }}>
                    <Txt size={11} weight="bold" tone="white" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1.3, opacity: 0.8 }}>
                        {t('statsPage.lastGames')}
                    </Txt>
                    <View accessibilityRole="image" accessibilityLabel={recent.map((game) => `${game.date}: ${game.pts}`).join(', ')} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 64 }}>
                        {recent.map((game) => (
                            <View key={game.gamePk} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                <Txt size={10} weight="bold" tone="white" tabular style={{ opacity: 0.9 }}>
                                    {game.pts}
                                </Txt>
                                <View style={{ width: '100%', height: Math.max(6, (Math.abs(game.pts) / max) * 40), borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: game.pts < 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)' }} />
                            </View>
                        ))}
                    </View>
                </View>
            )}
        </Gradient>
    );
};

type TileData = [label: string, value: React.ReactNode, strong?: boolean];

const Tile: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => {
    const colors = useColors();
    return (
        <View style={{ flex: 1, borderRadius: radius.tile, paddingHorizontal: 4, paddingVertical: 10, alignItems: 'center', backgroundColor: strong ? alpha(colors.accent, 0.1) : colors.raised }}>
            <Txt size={20} weight="extrabold" tabular numberOfLines={1} adjustsFontSizeToFit color={strong ? colors.accentInk : undefined} style={{ lineHeight: 22 }}>
                {value}
            </Txt>
            <Txt size={11} weight="bold" tone="muted" numberOfLines={1} style={{ marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label}
            </Txt>
        </View>
    );
};

/** Cuadrícula de 4 columnas */
const TileGrid: React.FC<{ tiles: TileData[] }> = ({ tiles }) => {
    const lines: TileData[][] = [];
    for (let index = 0; index < tiles.length; index += 4) lines.push(tiles.slice(index, index + 4));
    return (
        <View style={{ gap: 8 }}>
            {lines.map((line, index) => (
                <Row key={index} gap={8} align="stretch">
                    {line.map(([label, value, strong]) => (
                        <Tile key={label} label={label} value={value} strong={strong} />
                    ))}
                    {Array.from({ length: 4 - line.length }, (_, fill) => (
                        <View key={`fill-${fill}`} style={{ flex: 1 }} />
                    ))}
                </Row>
            ))}
        </View>
    );
};

const SeasonGrid: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const l = (key: string) => t(`statsPage.labels.${key}`);
    const h = player.hitting;
    const p = player.pitching;
    const tiles: TileData[] =
        player.role === 'P'
            ? p
                ? [
                      [l('era'), p.era, true],
                      [l('whip'), p.whip, true],
                      [l('ip'), p.ip],
                      [l('k'), p.k],
                      [l('wl'), `${p.w}-${p.l}`],
                      [l('sv'), p.sv],
                      [l('g'), p.g],
                      [l('gs'), p.gs],
                      [l('h'), p.h],
                      [l('bb'), p.bb],
                      [l('er'), p.er],
                      [l('hr'), p.hr]
                  ]
                : []
            : h
              ? [
                    [l('avg'), h.avg, true],
                    [l('ops'), h.ops, true],
                    [l('hr'), h.hr],
                    [l('rbi'), h.rbi],
                    [l('h'), h.h],
                    [l('r'), h.r],
                    [l('sb'), h.sb],
                    [l('bb'), h.bb],
                    [l('k'), h.k],
                    [l('d'), h.d],
                    [l('obp'), h.obp],
                    [l('g'), h.g]
                ]
              : [];
    return (
        <View style={{ gap: 8 }} accessibilityLabel={t('statsPage.seasonStats')}>
            <Txt eyebrow>{t('statsPage.seasonStats')}</Txt>
            {tiles.length ? (
                <TileGrid tiles={tiles} />
            ) : (
                <Card style={{ paddingVertical: 20 }}>
                    <Txt size={14} tone="muted" center>
                        {t('statsPage.noGames')}
                    </Txt>
                </Card>
            )}
        </View>
    );
};

/** Modo PRO: métricas avanzadas de la temporada */
const AdvancedGrid: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const pro = useIsPro();
    if (!pro) return null;
    const l = (key: string) => t(`pro.short.${key}`);
    let tiles: TileData[] = [];
    if (player.role === 'P' && player.pitching) {
        const a = pitchingAdvanced(player.pitching);
        tiles = [
            [l('fip'), fmtDec(a.fip)],
            [l('k9'), fmtDec(a.k9)],
            [l('bb9'), fmtDec(a.bb9)],
            [l('kBb'), fmtDec(a.kBb)],
            [l('h9'), fmtDec(a.h9)],
            [l('hr9'), fmtDec(a.hr9)],
            [l('kPct'), fmtPct(a.kPct)],
            [l('ppi'), fmtDec(a.pitchesPerInning, 1)]
        ];
    } else if (player.hitting) {
        const a = battingAdvanced(player.hitting);
        tiles = [
            [l('iso'), fmtRate(a.iso)],
            [l('babip'), fmtRate(a.babip)],
            [l('kPct'), fmtPct(a.kPct)],
            [l('bbPct'), fmtPct(a.bbPct)],
            [l('bbK'), fmtDec(a.bbK)],
            [l('abHr'), fmtDec(a.abHr, 1)],
            [l('xbh'), String(a.xbh)],
            [l('slg'), player.hitting.slg]
        ];
    }
    if (!tiles.length) return null;
    return (
        <View style={{ gap: 8 }} accessibilityLabel={t('pro.advanced')}>
            <Row gap={8}>
                <Txt eyebrow>{t('pro.advanced')}</Txt>
                <ProBadge />
            </Row>
            <TileGrid tiles={tiles} />
        </View>
    );
};

const GameRow: React.FC<{ game: GameLogRow; role: 'B' | 'P'; first: boolean; onOpen: () => void }> = ({ game, role, first, onOpen }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const day = shortDay(game.date, i18n.language);
    const badge = game.pts > 0 ? { bg: alpha(colors.ball, 0.15), ink: colors.ball } : game.pts < 0 ? { bg: alpha(colors.live, 0.1), ink: colors.live } : { bg: colors.raised, ink: colors.muted };
    return (
        <Pressable
            onPress={onOpen}
            accessibilityRole="link"
            accessibilityLabel={t('statsPage.openGame', { date: day })}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: pressed ? colors.raised : undefined }, !first && { borderTopWidth: 1, borderTopColor: colors.line }]}
        >
            <Txt size={12} weight="bold" tone="muted" style={{ width: 44 }}>
                {day}
            </Txt>
            <Row gap={6} style={{ width: 72 }}>
                <Txt size={11} weight="bold" tone="muted">
                    {game.isHome ? t('statsPage.vs') : t('statsPage.at')}
                </Txt>
                {game.opponent && <TeamLogo team={game.opponent} size={22} />}
                <Txt size={12} weight="extrabold">
                    {game.opponent?.abbrev}
                </Txt>
            </Row>
            <Txt size={14} weight="semibold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                {gameLine(game, role, t)}
            </Txt>
            <View style={{ borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: badge.bg }}>
                <Txt size={12} weight="extrabold" tabular color={badge.ink}>
                    {game.pts > 0 ? `+${game.pts}` : game.pts}
                </Txt>
            </View>
            <ChevronRight size={16} color={colors.faint} />
        </Pressable>
    );
};

const GameLog: React.FC<{ player: PlayerDetail; onOpenGame: (gamePk: number) => void }> = ({ player, onOpenGame }) => {
    const { t } = useTranslation();
    const [all, setAll] = useState(false);
    if (!player.log.length) return null;
    const games = all ? player.log : player.log.slice(0, 8);
    return (
        <View style={{ gap: 8 }} accessibilityLabel={t('statsPage.gameLog')}>
            <Txt eyebrow>{t('statsPage.gameLog')}</Txt>
            <Card padded={false} style={{ overflow: 'hidden' }}>
                {games.map((game, index) => (
                    <GameRow key={game.gamePk} game={game} role={player.role} first={index === 0} onOpen={() => onOpenGame(game.gamePk)} />
                ))}
            </Card>
            {player.log.length > games.length && <MoreButton raised label={t('statsPage.showMore', { count: player.log.length - games.length })} onPress={() => setAll(true)} />}
        </View>
    );
};

const Career: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { activeLeague } = useLeague();
    if (!player.career.length) return null;
    const l = (key: string) => t(`statsPage.labels.${key}`);
    const pitcher = player.role === 'P';
    const title = t('statsPage.career', { league: t(`leagues.${activeLeague}.name`) });
    const current = (row: CareerRow) => row.season === player.season;
    // PTS crece con el valor más largo (111.5 no cabe en 48 px)
    const ptsWidth = Math.max(48, 20 + 8 * Math.max(...player.career.map((row) => String(row.pts).length)));
    const stat =(key: string, width: number, value: (row: CareerRow) => React.ReactNode): FrozenColumn<CareerRow> => ({
        key,
        width,
        header: <HeadText>{l(key)}</HeadText>,
        cell: (row) => <CellText bold={current(row)}>{value(row) ?? '—'}</CellText>
    });
    const columns: FrozenColumn<CareerRow>[] = [
        {
            key: 'team',
            width: 72,
            align: 'left',
            header: <HeadText>{l('team')}</HeadText>,
            cell: (row) => (
                <Row gap={6}>
                    {row.team && <TeamLogo team={row.team} size={18} />}
                    <CellText bold={current(row)}>{row.team?.abbrev ?? '—'}</CellText>
                </Row>
            )
        },
        { key: 'pts', width: ptsWidth, header: <HeadText>{l('pts')}</HeadText>, cell: (row) => <CellText strong color={colors.accentInk}>{row.pts}</CellText> },
        ...(pitcher
            ? [
                  stat('g', 40, (row) => row.pitching?.g),
                  stat('wl', 52, (row) => `${row.pitching?.w ?? 0}-${row.pitching?.l ?? 0}`),
                  stat('era', 56, (row) => row.pitching?.era),
                  stat('ip', 52, (row) => row.pitching?.ip),
                  stat('k', 44, (row) => row.pitching?.k)
              ]
            : [
                  stat('g', 40, (row) => row.hitting?.g),
                  stat('avg', 56, (row) => row.hitting?.avg),
                  stat('hr', 44, (row) => row.hitting?.hr),
                  stat('rbi', 44, (row) => row.hitting?.rbi),
                  stat('ops', 60, (row) => row.hitting?.ops)
              ])
    ];
    return (
        <View style={{ gap: 8 }} accessibilityLabel={title}>
            <Txt eyebrow>{title}</Txt>
            <FrozenTable
                rows={player.career}
                rowKey={(row) => `${row.season}-${row.team?.id}`}
                rowHeight={40}
                first={{ width: 84, header: <HeadText>{l('season')}</HeadText>, cell: (row) => <Txt size={14} weight={current(row) ? 'bold' : 'semibold'} tabular>{seasonLabel(row.season, activeLeague)}</Txt> }}
                columns={columns}
                rowStyle={(row) => (current(row) ? { backgroundColor: alpha(colors.accent, 0.05) } : undefined)}
            />
        </View>
    );
};
