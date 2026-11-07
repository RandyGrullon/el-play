// Más de la ficha del pelotero: percentiles en la liga, por situación, postemporada, sus últimos juegos pitcheo a
// pitcheo (batazos, zonas y repertorio) y lo que se mira al compararlo con otro (el botón flotante de su página).
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LeagueId } from '../../types';
import { qualifies, usePlayerPitches, usePlayers, type HittingLine, type PitchingLine, type PlayerDetail, type PlayerRow, type RecentPitch } from '../../lib/stats';
import { HITTING_METRICS, PITCHING_METRICS, percentiles, recentBatted, zoneGrid, type Metric } from '../../lib/playerPitches';
import { arsenal } from '../../lib/baseball';
import type { Pitch } from '../../types';
import { Segmented } from '../ui/Segmented';
import { gamedayToFeet, parkFor } from '../../lib/flight';
import { fieldViewBox, markerRadius, resultOf, svgPoint } from '../../lib/spray';
import { ParkDrawing, ResultMarker } from '../spray/ParkDrawing';

const PARK = parkFor(null);
const BOX = fieldViewBox(PARK);

const Heading: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
    <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="eyebrow">{children}</h4>
        {aside}
    </div>
);

/** Color de la barra de percentil: azul (frío) a rojo (caliente), como en las fichas de Statcast */
const heat = (rank: number) => (rank >= 80 ? '#d8263a' : rank >= 60 ? '#ec7d6b' : rank >= 40 ? '#9aa3b2' : rank >= 20 ? '#6c9be0' : '#2f5fc9');

const teamGamesOf = (players: PlayerRow[]) => Math.max(0, ...players.map((row) => row.hitting?.g ?? 0));

// ---------------------------------------------------------------- percentiles

export const Percentiles: React.FC<{ player: PlayerDetail; league: LeagueId }> = ({ player, league }) => {
    const { t } = useTranslation();
    const players = usePlayers(league, player.season);
    const line = player.role === 'P' ? player.pitching : player.hitting;
    const rows = useMemo(() => {
        const list = players.data?.players ?? [];
        if (!line || !list.length) return null;
        const teamGames = teamGamesOf(list);
        const pool = list.filter((row) => row.role === player.role && qualifies(row, teamGames));
        const me = list.find((row) => row.id === player.id);
        return { qualified: !!me && qualifies(me, teamGames), pool: pool.length, list: percentiles(line, pool, player.role) };
    }, [players.data, line, player.role, player.id]);
    if (!rows || rows.pool < 8) return null;

    return (
        <section aria-label={t('playerMore.percentiles')}>
            <Heading>{t('playerMore.percentiles')}</Heading>
            <div className="card space-y-2.5 p-4">
                {!rows.qualified && <p className="text-xs text-muted">{t('playerMore.notQualified')}</p>}
                {rows.list.map(({ metric, value, rank }) => (
                    <div key={metric.key} className="grid grid-cols-[4.2rem_1fr_3.2rem] items-center gap-2.5 text-sm">
                        <span className="text-xs font-bold text-muted">{t(`playerMore.metrics.${metric.key}`)}</span>
                        <span className="relative h-2.5 rounded-full bg-raised" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rank} aria-label={t('playerMore.rankAria', { metric: t(`playerMore.metrics.${metric.key}`), rank })}>
                            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(3, rank)}%`, backgroundColor: heat(rank) }} />
                            <span
                                className="absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-extrabold text-white ring-2 ring-surface"
                                style={{ left: `${Math.min(97, Math.max(3, rank))}%`, backgroundColor: heat(rank) }}
                            >
                                {rank}
                            </span>
                        </span>
                        <span className="text-right font-bold tabular-nums">{metric.show(value)}</span>
                    </div>
                ))}
                <p className="pt-1 text-[11px] text-faint">{t('playerMore.percentilesNote', { count: rows.pool })}</p>
            </div>
        </section>
    );
};

// ---------------------------------------------------------------- por situación y postemporada

const hittingCells = (h: HittingLine) => [h.pa, h.avg, h.obp, h.slg, h.ops, h.hr];
const pitchingCells = (p: PitchingLine) => [p.ip, p.era, p.whip, p.k, p.bb, p.hr];

export const Situations: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const pitcher = player.role === 'P';
    const rows = (player.splits ?? []).filter((split) => (pitcher ? split.pitching : split.hitting));
    if (!rows.length) return null;
    const head = pitcher ? ['ip', 'era', 'whip', 'k', 'bb', 'hr'] : ['pa', 'avg', 'obp', 'slg', 'ops', 'hr'];
    return (
        <section aria-label={t('playerMore.situations')}>
            <Heading>{t('playerMore.situations')}</Heading>
            <div className="card overflow-x-auto">
                <table className="w-full whitespace-nowrap text-sm tabular-nums">
                    <thead>
                        <tr className="text-[11px] font-bold uppercase tracking-wide text-muted">
                            <th scope="col" className="px-3 py-2 text-left">
                                {t('playerMore.situation')}
                            </th>
                            {head.map((key) => (
                                <th key={key} scope="col" className="px-2 py-2 text-right">
                                    {t(`statsPage.labels.${key}`)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line/10">
                        {rows.map((split) => (
                            <tr key={split.code}>
                                <th scope="row" className="px-3 py-2 text-left font-semibold">
                                    {t(`playerMore.sit.${split.code}${pitcher && (split.code === 'vl' || split.code === 'vr') ? 'P' : ''}`)}
                                </th>
                                {(pitcher ? pitchingCells(split.pitching!) : hittingCells(split.hitting!)).map((value, index) => (
                                    <td key={index} className="px-2 py-2 text-right">
                                        {value ?? '—'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export const Postseason: React.FC<{ player: PlayerDetail }> = ({ player }) => {
    const { t } = useTranslation();
    const pitcher = player.role === 'P';
    const line = pitcher ? player.postseason?.pitching : player.postseason?.hitting;
    if (!line) return null;
    const l = (key: string) => t(`statsPage.labels.${key}`);
    const tiles: [string, React.ReactNode][] = pitcher
        ? [
              [l('g'), (line as PitchingLine).g],
              [l('wl'), `${(line as PitchingLine).w}-${(line as PitchingLine).l}`],
              [l('era'), (line as PitchingLine).era],
              [l('ip'), (line as PitchingLine).ip],
              [l('k'), (line as PitchingLine).k],
              [l('whip'), (line as PitchingLine).whip]
          ]
        : [
              [l('g'), (line as HittingLine).g],
              [l('avg'), (line as HittingLine).avg],
              [l('hr'), (line as HittingLine).hr],
              [l('rbi'), (line as HittingLine).rbi],
              [l('ops'), (line as HittingLine).ops],
              [l('h'), (line as HittingLine).h]
          ];
    return (
        <section aria-label={t('playerMore.postseason')}>
            <Heading>{t('playerMore.postseason')}</Heading>
            <div className="grid grid-cols-3 gap-2">
                {tiles.map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-surface px-2 py-2.5 text-center shadow-card">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</p>
                        <p className="font-display text-lg font-extrabold tabular-nums">{value}</p>
                    </div>
                ))}
            </div>
        </section>
    );
};

// ---------------------------------------------------------------- sus últimos juegos, pitcheo a pitcheo

type RecentView = 'spray' | 'zones' | 'arsenal';

const ZoneGrid: React.FC<{ pitches: RecentPitch[]; pitcher: boolean }> = ({ pitches, pitcher }) => {
    const { t } = useTranslation();
    const grid = useMemo(() => zoneGrid(pitches), [pitches]);
    if (!grid.total) return <p className="py-6 text-center text-sm text-muted">{t('playerMore.noLocations')}</p>;
    // Bateador: promedio en cada zona (caliente o frío). Lanzador: dónde tira más
    const value = (cell: (typeof grid.cells)[number]) => (pitcher ? cell.pitches / grid.total : cell.atBats ? cell.hits / cell.atBats : null);
    const color = (cell: (typeof grid.cells)[number]) => {
        const v = value(cell);
        if (v === null) return 'rgb(var(--raised))';
        if (pitcher) return `rgba(216, 38, 58, ${Math.min(0.85, 0.12 + v * 3.2)})`;
        return v >= 0.3 ? 'rgba(216, 38, 58, 0.75)' : v >= 0.25 ? 'rgba(236, 125, 107, 0.6)' : v >= 0.2 ? 'rgba(154, 163, 178, 0.45)' : 'rgba(47, 95, 201, 0.6)';
    };
    const label = (cell: (typeof grid.cells)[number]) => {
        const v = value(cell);
        if (v === null) return '—';
        return pitcher ? `${Math.round(v * 100)}%` : v.toFixed(3).replace(/^0/, '');
    };
    const outsideSwing = grid.outside.pitches ? Math.round((grid.outside.swings / grid.outside.pitches) * 100) : null;
    return (
        <div>
            <div className="mx-auto grid w-[210px] grid-cols-3 gap-1 rounded-xl border-2 border-ink/70 p-1" role="img" aria-label={t(pitcher ? 'playerMore.zonesAriaP' : 'playerMore.zonesAria')}>
                {grid.cells.map((cell, index) => (
                    <div key={index} className="flex h-[62px] flex-col items-center justify-center rounded-md text-center" style={{ backgroundColor: color(cell) }}>
                        <span className="font-display text-base font-extrabold leading-none tabular-nums">{label(cell)}</span>
                        <span className="mt-0.5 text-[10px] font-semibold opacity-75">{pitcher ? cell.pitches : t('playerMore.abs', { count: cell.atBats })}</span>
                    </div>
                ))}
            </div>
            <p className="mt-2 text-center text-xs text-muted">
                {pitcher ? t('playerMore.zonesNoteP', { count: grid.total, out: Math.round((grid.outside.pitches / grid.total) * 100) }) : t('playerMore.zonesNote')}
                {outsideSwing !== null && !pitcher && ` · ${t('playerMore.chase', { pct: outsideSwing })}`}
            </p>
        </div>
    );
};

export const RecentPitches: React.FC<{ player: PlayerDetail; league: LeagueId }> = ({ player, league }) => {
    const { t, i18n } = useTranslation();
    const query = usePlayerPitches(player.id, league, player.season);
    const [view, setView] = useState<RecentView>('spray');
    const pitcher = player.role === 'P';
    const pitches = query.data?.pitches ?? [];
    const balls = useMemo(() => recentBatted(pitches), [pitches]);
    const mix = useMemo(() => arsenal(pitches as unknown as Pitch[], i18n.language), [pitches, i18n.language]);
    if (query.isPending) return <div className="skeleton h-[300px] rounded-card" aria-hidden="true" />;
    if (!query.data || !pitches.length) return null;

    return (
        <section aria-label={t('playerMore.recent', { count: query.data.games })}>
            <Heading>{t('playerMore.recent', { count: query.data.games })}</Heading>
            <div className="card p-4">
                <Segmented<RecentView>
                    size="sm"
                    className="mb-3"
                    label={t('playerMore.recent', { count: query.data.games })}
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
                        <>
                            <svg viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`} className="fld mx-auto h-auto w-full max-w-[360px] rounded-2xl" style={{ background: 'var(--fld-foul)' }} role="img" aria-label={t('spray.aria', { count: balls.length })}>
                                <ParkDrawing park={PARK} />
                                {balls.map((ball) => {
                                    const p = svgPoint(gamedayToFeet(ball.x, ball.y));
                                    const result = ball.kind === 'hr' ? 'hr' : ball.kind === 'hit' ? resultOf(ball.event) : 'out';
                                    return (
                                        <g key={ball.key}>
                                            <ResultMarker result={result === 'out' || result === 'error' ? (ball.kind === 'hit' ? 'single' : 'out') : result} x={p.x} y={p.y} r={markerRadius({ ev: ball.ev, result })} />
                                        </g>
                                    );
                                })}
                            </svg>
                            <p className="mt-1 text-center text-xs text-muted">
                                {t(pitcher ? 'playerMore.sprayNoteP' : 'playerMore.sprayNote', {
                                    hits: balls.filter((ball) => ball.kind === 'hit').length,
                                    hr: balls.filter((ball) => ball.kind === 'hr').length,
                                    outs: balls.filter((ball) => ball.kind === 'out').length
                                })}
                            </p>
                        </>
                    ) : (
                        <p className="py-6 text-center text-sm text-muted">{t('playerMore.noBatted')}</p>
                    ))}
                {view === 'zones' && <ZoneGrid pitches={pitches} pitcher={pitcher} />}
                {view === 'arsenal' &&
                    (mix.length ? (
                        <table className="w-full text-sm tabular-nums">
                            <thead>
                                <tr className="text-[11px] font-bold uppercase text-muted">
                                    <th className="py-1.5 text-left">{t('pro.live.type')}</th>
                                    <th className="px-1.5 py-1.5 text-right">%</th>
                                    <th className="px-1.5 py-1.5 text-right">{t('pro.live.avgMph')}</th>
                                    <th className="py-1.5 text-right">{t('playerMore.whiffPct')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line/10">
                                {mix.map((row) => (
                                    <tr key={row.type}>
                                        <td className="py-1.5 font-semibold">{row.name}</td>
                                        <td className="px-1.5 py-1.5 text-right">{Math.round(row.share * 100)}%</td>
                                        <td className="px-1.5 py-1.5 text-right">{row.avgMph !== null ? row.avgMph.toFixed(1) : '—'}</td>
                                        <td className="py-1.5 text-right">{row.count ? `${Math.round((row.whiffs / row.count) * 100)}%` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="py-6 text-center text-sm text-muted">{t('playerMore.noTypes')}</p>
                    ))}
            </div>
        </section>
    );
};

// ---------------------------------------------------------------- comparar (lo usa el botón flotante de la página)

type CompareMetric<L> = Metric | { key: string; higher: boolean; value: (l: L) => number; show: (v: number) => string };

export const COMPARE_HITTING: CompareMetric<HittingLine>[] = [
    { key: 'g', higher: true, value: (l: HittingLine) => l.g, show: String },
    ...HITTING_METRICS.slice(0, 4),
    { key: 'hr', higher: true, value: (l: HittingLine) => l.hr, show: String },
    { key: 'rbi', higher: true, value: (l: HittingLine) => l.rbi, show: String },
    { key: 'sb', higher: true, value: (l: HittingLine) => l.sb, show: String },
    ...HITTING_METRICS.slice(5)
];
export const COMPARE_PITCHING: CompareMetric<PitchingLine>[] = [
    { key: 'g', higher: true, value: (l: PitchingLine) => l.g, show: String },
    { key: 'ip', higher: true, value: (l: PitchingLine) => l.outs / 3, show: (v) => `${Math.floor(v)}.${Math.round((v % 1) * 3)}` },
    ...PITCHING_METRICS.slice(0, 2),
    { key: 'k', higher: true, value: (l: PitchingLine) => l.k, show: String },
    ...PITCHING_METRICS.slice(2)
];
