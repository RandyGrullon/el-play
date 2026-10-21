import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { PlayerRow } from '../../../../lib/stats';
import type { ProPlayerRow } from '../../../../types/pro-liga';
import { seasonLabel } from '../../../../lib/format';
import { useProPlayers } from '../../../../lib/pro/liga';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { PlayerPhoto, Skeleton, Txt } from '../../../ui';
import { ProNote, ProSection, ProSegmented, TeamChip, useInView, withAlpha } from '../../kit';
import { bestHitter, bestPitcher, figureMinimums, outsToIp, type FigureMinimums } from './logica';
import { isOffline, proMissing, useLitePlayers } from './datos';
import { SeenEnter } from './shared';

// Figuras de cada equipo: mejor bateador por OPS y mejor lanzador por EFE de la temporada, con foto.
// Al empezar la temporada (menos de 10 juegos) se abre en la pasada completa y se dice por qué.
// Usa los peloteros PRO y, si esa ruta no existe en el servidor, los del Lite (mismos números de temporada).

type Choice = 'past' | 'current';
type Row = PlayerRow | ProPlayerRow;

const Figure: React.FC<{ row: Row | null; kind: 'hitter' | 'pitcher'; team: GameDetail['away']; index: number; seen: boolean }> = ({ row, kind, team, index, seen }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const cell = { flex: 1, flexBasis: 0, minWidth: 0 } as const;
    if (!row) {
        return (
            <View style={[cell, { minHeight: 150, alignItems: 'center', justifyContent: 'center', borderRadius: radius.tile, borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.2), padding: 12 }]}>
                <Txt size={12} tone="muted" center>
                    {t(kind === 'hitter' ? 'pro.previa.stars.noHitter' : 'pro.previa.stars.noPitcher')}
                </Txt>
            </View>
        );
    }
    const hitting = row.hitting;
    const pitching = row.pitching;
    const role = t(kind === 'hitter' ? 'pro.previa.stars.hitter' : 'pro.previa.stars.pitcher');
    const lines =
        kind === 'hitter' && hitting
            ? { value: hitting.ops, unit: 'OPS', first: `${hitting.avg}/${hitting.obp}/${hitting.slg}`, second: t('pro.previa.stars.hitterLine', { hr: hitting.hr, rbi: hitting.rbi, pa: hitting.pa }) }
            : pitching
              ? {
                    value: pitching.era,
                    unit: t('stats.era'),
                    first: `${t('pro.previa.stars.pitcherLine1', { ip: pitching.ip || outsToIp(pitching.outs), w: pitching.w, l: pitching.l })}${pitching.sv > 0 ? ` · ${pitching.sv} SV` : ''}`,
                    second: t('pro.previa.stars.pitcherLine2', { k: pitching.k, whip: pitching.whip })
                }
              : null;
    return (
        <SeenEnter seen={seen} index={index} style={cell}>
            <Pressable
                onPress={() => router.push(`/jugador/${row.id}`)}
                accessibilityRole="button"
                accessibilityLabel={[role, row.name, team.abbrev, lines ? `${lines.unit} ${lines.value}` : null, lines?.first, lines?.second].filter(Boolean).join(', ')}
                style={({ pressed }) => ({ flexGrow: 1, gap: 8, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12, opacity: pressed ? 0.85 : 1 })}
            >
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 6 }}>
                    <PlayerPhoto personId={row.id} name={row.name} size={56} background={withAlpha(team.color, 0.2)} team={team} />
                    <View style={{ minWidth: 0, gap: 2 }}>
                        <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                            {role}
                        </Txt>
                        <Txt size={11} tone="muted">
                            {kind === 'hitter' ? row.pos : 'P'}
                        </Txt>
                    </View>
                </View>
                <Txt size={14} weight="extrabold" style={{ lineHeight: 17, letterSpacing: -0.2 }}>
                    {row.name}
                </Txt>
                {lines ? (
                    <View style={{ marginTop: 'auto', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                            <Txt condensed size={34} tabular style={{ lineHeight: 36 }}>
                                {lines.value}
                            </Txt>
                            <Txt size={11} weight="extrabold" tone="muted" style={{ letterSpacing: 0.8 }}>
                                {lines.unit}
                            </Txt>
                        </View>
                        <View>
                            <Txt condensed size={13} tabular tone="muted" style={{ lineHeight: 17 }}>
                                {lines.first}
                            </Txt>
                            <Txt condensed size={13} tabular tone="muted" style={{ lineHeight: 17 }}>
                                {lines.second}
                            </Txt>
                        </View>
                    </View>
                ) : null}
            </Pressable>
        </SeenEnter>
    );
};

const Grid: React.FC<{ game: GameDetail; players: Row[]; minimums: FigureMinimums }> = ({ game, players, minimums }) => {
    const { setNode, onLayout, seen } = useInView();
    const row = { flexDirection: 'row', alignItems: 'stretch', gap: 8 } as const;
    return (
        <View ref={setNode} onLayout={onLayout} style={{ gap: 8 }}>
            <View style={[row, { justifyContent: 'space-between' }]}>
                <TeamChip team={game.away} logo="start" />
                <TeamChip team={game.home} logo="end" />
            </View>
            <View style={row}>
                <Figure row={bestHitter(players, game.away.id, minimums)} kind="hitter" team={game.away} index={0} seen={seen} />
                <Figure row={bestHitter(players, game.home.id, minimums)} kind="hitter" team={game.home} index={1} seen={seen} />
            </View>
            <View style={row}>
                <Figure row={bestPitcher(players, game.away.id, minimums)} kind="pitcher" team={game.away} index={2} seen={seen} />
                <Figure row={bestPitcher(players, game.home.id, minimums)} kind="pitcher" team={game.home} index={3} seen={seen} />
            </View>
        </View>
    );
};

interface TeamStarsProps {
    game: GameDetail;
    season: number;
    /** Juegos que lleva cada equipo esta temporada (el mayor de los dos) */
    teamGames: number;
    /** Juegos de una temporada regular completa (50 en LIDOM) */
    fullSeason: number;
}

export const TeamStars: React.FC<TeamStarsProps> = ({ game, season, teamGames, fullSeason }) => {
    const { t } = useTranslation();
    const canGoBack = game.league === 'lidom';
    const [choice, setChoice] = useState<Choice>(canGoBack && teamGames < 10 ? 'past' : 'current');
    const chosen = choice === 'past' ? season - 1 : season;
    const pro = useProPlayers(game.league, chosen);
    const missing = proMissing(pro, !!pro.data);
    const lite = useLitePlayers(game.league, chosen, missing);
    const query = missing ? lite : pro;
    const players: Row[] | undefined = pro.data?.players ?? lite.data?.players;
    const minimums = choice === 'past' ? figureMinimums(fullSeason) : figureMinimums(teamGames);
    const label = (value: number) => seasonLabel(value, game.league);
    const ip = Math.round(minimums.outs / 3);
    const loading = !players && (query.isLoading || (missing && lite.isPending));

    return (
        <ProSection title={t('pro.previa.stars.title')} headerOutside>
            {canGoBack && (
                <ProSegmented
                    value={choice}
                    onChange={setChoice}
                    label={t('pro.previa.stars.seasonPick')}
                    options={[
                        { value: 'past', label: t('pro.previa.stars.past', { season: label(season - 1) }) },
                        { value: 'current', label: t('pro.previa.stars.current', { season: label(season), count: teamGames }) }
                    ]}
                />
            )}
            <Txt size={12} tone="muted" style={{ marginHorizontal: 2, marginTop: 10, marginBottom: 12, lineHeight: 16 }}>
                {choice === 'past'
                    ? t('pro.previa.stars.pastNote', { season: label(season), count: teamGames, pa: minimums.pa, ip })
                    : t('pro.previa.stars.currentNote', { count: teamGames, pa: minimums.pa, ip }) + (teamGames < 10 ? ` ${t('pro.previa.stars.small')}` : '')}
            </Txt>
            {players ? (
                <Grid game={game} players={players} minimums={minimums} />
            ) : loading ? (
                <View accessible accessibilityLabel={t('pro.previa.loading', { name: t('pro.previa.stars.title') })} accessibilityState={{ busy: true }} style={{ gap: 8 }}>
                    {[0, 1].map((line) => (
                        <View key={line} style={{ flexDirection: 'row', gap: 8 }}>
                            <Skeleton height={170} round={radius.tile} style={{ flex: 1, flexBasis: 0 }} />
                            <Skeleton height={170} round={radius.tile} style={{ flex: 1, flexBasis: 0 }} />
                        </View>
                    ))}
                </View>
            ) : (
                <ProNote tone={isOffline(query.error) ? 'neutral' : 'warn'} title={isOffline(query.error) ? t('pro.previa.offline.title') : t('pro.previa.error.title')}>
                    {isOffline(query.error) ? t('pro.previa.offline.body') : t('pro.previa.error.body')}
                </ProNote>
            )}
        </ProSection>
    );
};
