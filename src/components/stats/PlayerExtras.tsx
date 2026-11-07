// Más de la ficha del pelotero en Lite (igual que PlayerExtras de la web): percentiles en la liga, por situación,
// postemporada y sus últimos juegos pitcheo a pitcheo (batazos, zonas y repertorio). Los percentiles usan la misma
// cuenta de la ficha PRO; aquí con el estilo de siempre.
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { LeagueId, Pitch } from '../../types';
import { teamGamesOf, usePlayerPitches, usePlayers, type HittingLine, type PitchingLine, type PlayerDetail, type RecentPitch } from '../../lib/stats';
import { recentBatted, zoneGrid } from '../../lib/playerPitches';
import { arsenal, type BattedKind } from '../../lib/baseball';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { Card, Segmented, Skeleton, Txt } from '../ui';
import { RESULT_COLORS } from '../game/spray/SprayMap';
import { SprayField, sprayViewOf } from '../game/spray/SprayField';
import { gamedayToFeet, parkFor } from '../../lib/flight';
import { resultOf } from '../../lib/spray';
import { useTheme } from '../../theme/theme';

// Parque genérico: sus batazos son de varios estadios
const PARK = parkFor(null);
const VIEW = sprayViewOf(PARK);
import { CellText, FrozenTable, HeadText, type FrozenColumn } from './FrozenTable';
import { leagueFromPlayers, poolKindFor, poolOf } from '../pro/estadisticas/logic';
import { percentileRowsOf } from '../pro/ficha/model';

/** Color del percentil: azul (frío) a rojo (caliente), como en las fichas de Statcast */
const heat = (rank: number) => (rank >= 80 ? '#d8263a' : rank >= 60 ? '#ec7d6b' : rank >= 40 ? '#9aa3b2' : rank >= 20 ? '#6c9be0' : '#2f5fc9');

/** Con menos peloteros que esto el percentil no dice nada */
const MIN_POOL = 8;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <View style={{ gap: 8 }} accessibilityLabel={title}>
        <Txt eyebrow accessibilityRole="header">
            {title}
        </Txt>
        {children}
    </View>
);

// ---------------------------------------------------------------- percentiles

export const Percentiles: React.FC<{ player: PlayerDetail; league: LeagueId }> = ({ player, league }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const players = usePlayers(league, player.season);
    const data = useMemo(() => {
        // Mientras llega otra temporada se ve la anterior (placeholderData): esa no sirve aquí
        const all = players.data?.season === player.season ? players.data.players : [];
        if (!all.length) return null;
        const pool = poolOf(all, poolKindFor(player.role), teamGamesOf(all));
        const leagueLine = leagueFromPlayers(all);
        return { size: pool.length, ...percentileRowsOf(player, pool, leagueLine?.ctx ?? null, leagueLine?.averages ?? null) };
    }, [players.data, player]);
    if (!data || data.size < MIN_POOL || !data.rows.length) return null;

    return (
        <Section title={t('playerMore.percentiles')}>
            <Card style={{ gap: 10 }}>
                {!data.inPool && (
                    <Txt size={12} tone="muted">
                        {t('playerMore.notQualified')}
                    </Txt>
                )}
                {data.rows.map((item) => {
                    const rank = item.standing.pct;
                    const label = t(`playerMore.metrics.${item.key}`);
                    return (
                        <View key={item.key} accessible accessibilityLabel={`${t('playerMore.rankAria', { metric: label, rank })}, ${item.value}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Txt size={12} weight="bold" tone="muted" numberOfLines={1} style={{ width: 52 }}>
                                {label}
                            </Txt>
                            <View style={{ flex: 1, minWidth: 0, height: 26, justifyContent: 'center' }}>
                                <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.raised, overflow: 'hidden' }}>
                                    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(3, rank)}%`, borderRadius: 5, backgroundColor: heat(rank) }} />
                                </View>
                                {/* El punto con el percentil: no se sale del riel en 0 ni en 100 */}
                                <View
                                    style={{
                                        position: 'absolute',
                                        left: `${Math.min(97, Math.max(3, rank))}%`,
                                        width: 26,
                                        height: 26,
                                        marginLeft: -13,
                                        borderRadius: 13,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: heat(rank),
                                        borderWidth: 2,
                                        borderColor: colors.surface
                                    }}
                                >
                                    <Txt size={10} weight="extrabold" tone="white" tabular>
                                        {rank}
                                    </Txt>
                                </View>
                            </View>
                            <Txt size={14} weight="bold" tabular numberOfLines={1} style={{ width: 58, textAlign: 'right' }}>
                                {item.value}
                            </Txt>
                        </View>
                    );
                })}
                <Txt size={11} tone="faint" style={{ paddingTop: 2 }}>
                    {t('playerMore.percentilesNote', { count: data.size })}
                </Txt>
            </Card>
        </Section>
    );
};

// ---------------------------------------------------------------- por situación y postemporada

type Split = NonNullable<PlayerDetail['splits']>[number];

const HIT_COLS: { key: string; width: number; value: (h: HittingLine) => React.ReactNode }[] = [
    { key: 'pa', width: 40, value: (h) => h.pa },
    { key: 'avg', width: 52, value: (h) => h.avg },
    { key: 'obp', width: 52, value: (h) => h.obp },
    { key: 'slg', width: 52, value: (h) => h.slg },
    { key: 'ops', width: 56, value: (h) => h.ops },
    { key: 'hr', width: 40, value: (h) => h.hr }
];
const PITCH_COLS: { key: string; width: number; value: (p: PitchingLine) => React.ReactNode }[] = [
    { key: 'ip', width: 48, value: (p) => p.ip },
    { key: 'era', width: 52, value: (p) => p.era },
    { key: 'whip', width: 56, value: (p) => p.whip },
    { key: 'k', width: 40, value: (p) => p.k },
    { key: 'bb', width: 40, value: (p) => p.bb },
    { key: 'hr', width: 40, value: (p) => p.hr }
];

export const Situations: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const pitcher = player.role === 'P';
    const rows = (player.splits ?? []).filter((split) => (pitcher ? split.pitching : split.hitting));
    if (!rows.length) return null;
    // Al lanzador: «A zurdos» / «A derechos» (los bateadores que enfrentó)
    const name = (split: Split) => t(`playerMore.sit.${split.code}${pitcher && (split.code === 'vl' || split.code === 'vr') ? 'P' : ''}`);
    const columns: FrozenColumn<Split>[] = pitcher
        ? PITCH_COLS.map((col) => ({ key: col.key, width: col.width, header: <HeadText>{t(`statsPage.labels.${col.key}`)}</HeadText>, cell: (row) => <CellText>{col.value(row.pitching!) ?? '—'}</CellText> }))
        : HIT_COLS.map((col) => ({ key: col.key, width: col.width, header: <HeadText>{t(`statsPage.labels.${col.key}`)}</HeadText>, cell: (row) => <CellText>{col.value(row.hitting!) ?? '—'}</CellText> }));
    return (
        <Section title={t('playerMore.situations')}>
            <FrozenTable
                rows={rows}
                rowKey={(row) => row.code}
                rowHeight={44}
                first={{
                    width: 132,
                    header: <HeadText>{t('playerMore.situation')}</HeadText>,
                    cell: (row) => (
                        <Txt size={13} weight="semibold" numberOfLines={2} style={{ lineHeight: 16 }}>
                            {name(row)}
                        </Txt>
                    )
                }}
                columns={columns}
            />
        </Section>
    );
};

export const Postseason: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const pitcher = player.role === 'P';
    const p = pitcher ? player.postseason?.pitching : undefined;
    const h = !pitcher ? player.postseason?.hitting : undefined;
    if (!p && !h) return null;
    const l = (key: string) => t(`statsPage.labels.${key}`);
    const tiles: [string, React.ReactNode][] = p
        ? [
              [l('g'), p.g],
              [l('wl'), `${p.w}-${p.l}`],
              [l('era'), p.era],
              [l('ip'), p.ip],
              [l('k'), p.k],
              [l('whip'), p.whip]
          ]
        : [
              [l('g'), h!.g],
              [l('avg'), h!.avg],
              [l('hr'), h!.hr],
              [l('rbi'), h!.rbi],
              [l('ops'), h!.ops],
              [l('h'), h!.h]
          ];
    return (
        <Section title={t('playerMore.postseason')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {tiles.map(([label, value]) => (
                    // Tres por fila: (100 % − 2 huecos de 8) / 3
                    <View key={label} style={[{ flexBasis: '30%', flexGrow: 1, borderRadius: radius.tile, paddingHorizontal: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.surface }, shadow('card')]}>
                        <Txt size={10} weight="bold" tone="faint" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {label}
                        </Txt>
                        <Txt size={18} weight="extrabold" tabular numberOfLines={1} adjustsFontSizeToFit>
                            {value}
                        </Txt>
                    </View>
                ))}
            </View>
        </Section>
    );
};

// ---------------------------------------------------------------- sus últimos juegos, pitcheo a pitcheo

type RecentView = 'spray' | 'zones' | 'arsenal';

const ZoneGrid: React.FC<{ pitches: RecentPitch[]; pitcher: boolean }> = ({ pitches, pitcher }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const grid = useMemo(() => zoneGrid(pitches), [pitches]);
    if (!grid.total) return <Empty text={t('playerMore.noLocations')} />;
    type Cell = (typeof grid.cells)[number];
    // Bateador: promedio en cada zona (caliente o frío). Lanzador: dónde tira más
    const value = (cell: Cell) => (pitcher ? cell.pitches / grid.total : cell.atBats ? cell.hits / cell.atBats : null);
    const color = (cell: Cell) => {
        const v = value(cell);
        if (v === null) return colors.raised;
        if (pitcher) return `rgba(216, 38, 58, ${Math.min(0.85, 0.12 + v * 3.2)})`;
        return v >= 0.3 ? 'rgba(216, 38, 58, 0.75)' : v >= 0.25 ? 'rgba(236, 125, 107, 0.6)' : v >= 0.2 ? 'rgba(154, 163, 178, 0.45)' : 'rgba(47, 95, 201, 0.6)';
    };
    const label = (cell: Cell) => {
        const v = value(cell);
        if (v === null) return '—';
        return pitcher ? `${Math.round(v * 100)}%` : v.toFixed(3).replace(/^0/, '');
    };
    const outsideSwing = grid.outside.pitches ? Math.round((grid.outside.swings / grid.outside.pitches) * 100) : null;
    const rows = [0, 1, 2].map((row) => grid.cells.slice(row * 3, row * 3 + 3));
    return (
        <View style={{ gap: 8 }}>
            <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={`${t(pitcher ? 'playerMore.zonesAriaP' : 'playerMore.zonesAria')}: ${grid.cells.map(label).join(', ')}`}
                style={{ alignSelf: 'center', width: 214, gap: 4, padding: 4, borderRadius: 12, borderWidth: 2, borderColor: alpha(colors.ink, 0.7) }}
            >
                {rows.map((line, row) => (
                    <View key={row} style={{ flexDirection: 'row', gap: 4 }}>
                        {line.map((cell, col) => (
                            <View key={col} style={{ flex: 1, height: 62, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: color(cell) }}>
                                <Txt size={16} weight="extrabold" tabular>
                                    {label(cell)}
                                </Txt>
                                <Txt size={10} weight="semibold" style={{ marginTop: 2, opacity: 0.75 }}>
                                    {pitcher ? cell.pitches : t('playerMore.abs', { count: cell.atBats })}
                                </Txt>
                            </View>
                        ))}
                    </View>
                ))}
            </View>
            <Txt size={12} tone="muted" center>
                {pitcher ? t('playerMore.zonesNoteP', { count: grid.total, out: Math.round((grid.outside.pitches / grid.total) * 100) }) : t('playerMore.zonesNote')}
                {outsideSwing !== null && !pitcher ? ` · ${t('playerMore.chase', { pct: outsideSwing })}` : ''}
            </Txt>
        </View>
    );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
    <Txt size={14} tone="muted" center style={{ paddingVertical: 24 }}>
        {text}
    </Txt>
);

export const RecentPitches: React.FC<{ player: PlayerDetail; league: LeagueId }> = ({ player, league }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const query = usePlayerPitches(player.id, league, player.season);
    const { isDark } = useTheme();
    const [view, setView] = useState<RecentView>('spray');
    const pitcher = player.role === 'P';
    const pitches = useMemo(() => query.data?.pitches ?? [], [query.data]);
    const balls = useMemo(() => recentBatted(pitches), [pitches]);
    // arsenal() solo lee tipo, velocidad, código y resultado: los de la ficha traen eso
    const mix = useMemo(() => arsenal(pitches as unknown as Pitch[], i18n.language), [pitches, i18n.language]);
    // Sin red la consulta queda en pausa: no se deja el esqueleto para siempre
    if (query.isPending && query.fetchStatus === 'fetching') return <Skeleton height={300} />;
    if (!query.data || !pitches.length) return null;

    const title = t('playerMore.recent', { count: query.data.games });
    const count = (kind: BattedKind) => balls.filter((ball) => ball.kind === kind).length;

    return (
        <Section title={title}>
            <Card style={{ gap: 12 }}>
                <Segmented<RecentView>
                    small
                    value={view}
                    onChange={setView}
                    options={[
                        { value: 'spray', label: t('playerMore.spray') },
                        { value: 'zones', label: t('playerMore.zones') },
                        { value: 'arsenal', label: t(pitcher ? 'playerMore.arsenal' : 'playerMore.seen') }
                    ]}
                />
                {view === 'spray' &&
                    (balls.length ? (
                        <View style={{ gap: 4 }}>
                            <View style={{ width: '100%', maxWidth: 360, alignSelf: 'center', aspectRatio: VIEW.w / VIEW.h, borderRadius: radius.tile, overflow: 'hidden' }} accessible accessibilityRole="image" accessibilityLabel={t('spray.aria', { count: balls.length })}>
                                <Svg width="100%" height="100%" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}>
                                    <SprayField park={PARK} view={VIEW} dark={isDark} u={VIEW.w / 340} />
                                    {pitches.map((pitch, index) => {
                                        if (!pitch.hit || typeof pitch.hit.x !== 'number' || typeof pitch.hit.y !== 'number') return null;
                                        const spot = gamedayToFeet(pitch.hit.x, pitch.hit.y);
                                        const result = resultOf(pitch.event);
                                        const u = VIEW.w / 340;
                                        return (
                                            <Circle
                                                key={index}
                                                cx={spot.x}
                                                cy={-spot.y}
                                                r={(result === 'hr' ? 5.2 : 4.4) * u}
                                                fill={result === 'out' ? 'rgba(255,255,255,0.18)' : RESULT_COLORS[result]}
                                                stroke={result === 'out' ? '#ffffff' : 'rgba(0,0,0,0.45)'}
                                                strokeWidth={(result === 'out' ? 1.8 : 1) * u}
                                            />
                                        );
                                    })}
                                </Svg>
                            </View>
                            <Txt size={12} tone="muted" center>
                                {t(pitcher ? 'playerMore.sprayNoteP' : 'playerMore.sprayNote', { hits: count('hit'), hr: count('hr'), outs: count('out') })}
                            </Txt>
                        </View>
                    ) : (
                        <Empty text={t('playerMore.noBatted')} />
                    ))}
                {view === 'zones' && <ZoneGrid pitches={pitches} pitcher={pitcher} />}
                {view === 'arsenal' &&
                    (mix.length ? (
                        <View>
                            <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
                                <HeadCell flex>{t('pro.live.type')}</HeadCell>
                                <HeadCell>%</HeadCell>
                                <HeadCell>{t('pro.live.avgMph')}</HeadCell>
                                <HeadCell>{t('playerMore.whiffPct')}</HeadCell>
                            </View>
                            {mix.map((row) => (
                                <View key={row.type} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.line }}>
                                    <Txt size={14} weight="semibold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                        {row.name}
                                    </Txt>
                                    <NumCell>{`${Math.round(row.share * 100)}%`}</NumCell>
                                    <NumCell>{row.avgMph !== null ? row.avgMph.toFixed(1) : '—'}</NumCell>
                                    <NumCell>{row.count ? `${Math.round((row.whiffs / row.count) * 100)}%` : '—'}</NumCell>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <Empty text={t('playerMore.noTypes')} />
                    ))}
            </Card>
        </Section>
    );
};

/** Encabezado de la tabla del repertorio: el tipo a la izquierda y las cifras a la derecha */
const HeadCell: React.FC<{ children: React.ReactNode; flex?: boolean }> = ({ children, flex }) => (
    <Txt size={11} weight="bold" tone="muted" numberOfLines={1} style={[{ textTransform: 'uppercase' }, flex ? { flex: 1 } : { width: 64, textAlign: 'right' }]}>
        {children}
    </Txt>
);

const NumCell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Txt size={14} tabular numberOfLines={1} style={{ width: 64, textAlign: 'right' }}>
        {children}
    </Txt>
);
