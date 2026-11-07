import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Play, Square } from 'lucide-react';
import type { GameDetail } from '../../types';
import { eventName, inningName, pitchTypeName } from '../../lib/baseball';
import { parkFor, polar, wallAt } from '../../lib/flight';
import {
    DEFAULT_FILTERS,
    ENTRY_FLIGHT_MS,
    SPRAY_RESULT_COLORS,
    entryStagger,
    ZONES,
    fieldViewBox,
    filterBalls,
    zoneStats,
    flightPath,
    markerRadius,
    pathD,
    replayStep,
    sprayBalls,
    sprayStats,
    svgPoint,
    type SprayBall,
    type SprayFilters,
    type SprayResult
} from '../../lib/spray';
import { usePreferences } from '../../store/preferences';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Segmented } from '../ui/Segmented';
import { PlayerLink } from '../ui/PlayerLink';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { GlowDef, ParkDrawing, ResultMarker } from '../spray/ParkDrawing';

// Mapa de batazos sobre el parque de verdad del juego (en pies): cada bola con su vuelo desde home y dónde cayó,
// filtros por equipo y resultado, la ficha de la bola tocada, «Repetir» y los números de lo filtrado.

const RESULTS: SprayResult[] = ['single', 'double', 'triple', 'hr', 'error', 'out'];
const TEXT_ON: Record<SprayResult, string> = { single: '#ffffff', double: '#ffffff', triple: '#14151a', hr: '#ffffff', error: '#14151a', out: '' };

interface Geo {
    ball: SprayBall;
    d: string;
    x: number;
    y: number;
    r: number;
    bounces: { x: number; y: number }[];
}

const animateBall = (node: Element | null, delay: number, duration: number) => {
    if (!node || typeof (node as HTMLElement).animate !== 'function') return [];
    const out: Animation[] = [];
    const path = node.querySelector('[data-path]');
    const marker = node.querySelector('[data-marker]');
    const ripple = node.querySelector('[data-ripple]');
    if (path) out.push(path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration, delay, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)', fill: 'backwards' }));
    node.querySelectorAll('[data-bounce]').forEach((item, index, list) =>
        out.push(item.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80, delay: delay + (duration * (index + 1)) / (list.length + 1), fill: 'backwards' }))
    );
    if (marker) out.push(marker.animate([{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1.25)', offset: 0.6 }, { opacity: 1, transform: 'none' }], { duration: 300, delay: delay + duration, easing: 'ease-out', fill: 'backwards' }));
    if (ripple) out.push(ripple.animate([{ opacity: 0.85, transform: 'scale(0.6)' }, { opacity: 0, transform: 'scale(3)' }], { duration: 450, delay: delay + duration, easing: 'ease-out', fill: 'both' }));
    return out;
};

export const SprayChart: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const glow = `${useId().replace(/:/g, '')}-glow`;
    const { playAnimations } = usePreferences();
    const reduced = useReducedMotion();
    const motion = playAnimations && !reduced;
    const park = useMemo(() => parkFor(game.venue), [game.venue]);
    const view = useMemo(() => fieldViewBox(park), [park]);
    const all = useMemo(() => sprayBalls(game.atBats, park), [game.atBats, park]);
    const [filters, setFilters] = useState<SprayFilters>(DEFAULT_FILTERS);
    const [mode, setMode] = useState<'balls' | 'zones'>('balls');
    const [selected, setSelected] = useState<number | null>(null);
    const balls = useMemo(() => filterBalls(all, filters), [all, filters]);
    const stats = useMemo(() => sprayStats(balls), [balls]);
    const hasEv = useMemo(() => all.some((ball) => ball.ev != null), [all]);
    const geo = useMemo<Geo[]>(
        () =>
            balls.map((ball) => {
                const path = flightPath(ball);
                const p = svgPoint(ball.land);
                return { ball, d: pathD(path), x: p.x, y: p.y, r: markerRadius(ball), bounces: path.bounces.map(svgPoint) };
            }),
        [balls]
    );

    const svgRef = useRef<SVGSVGElement>(null);
    const nodes = useRef(new Map<number, SVGGElement>());
    const running = useRef<Animation[]>([]);
    const [entered, setEntered] = useState(!motion);
    const seen = useRef<Set<number> | null>(null);
    const [replaying, setReplaying] = useState(false);
    const [tick, setTick] = useState<SprayBall | null>(null);
    const timers = useRef<number[]>([]);

    // Entrada: la primera vez que el mapa se ve, las bolas vuelan en orden (≤ 2,5 s)
    useEffect(() => {
        if (entered || !svgRef.current) return;
        if (typeof IntersectionObserver === 'undefined') return setEntered(true);
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                observer.disconnect();
                const stagger = entryStagger(geo.length);
                geo.forEach((item, index) => running.current.push(...animateBall(nodes.current.get(item.ball.key) ?? null, index * stagger, ENTRY_FLIGHT_MS)));
                setEntered(true);
            },
            { threshold: 0.3 }
        );
        observer.observe(svgRef.current);
        return () => observer.disconnect();
    }, [entered, geo]);

    // En vivo: la bola nueva vuela igual
    useEffect(() => {
        if (!seen.current) {
            seen.current = new Set(all.map((ball) => ball.key));
            return;
        }
        const fresh = all.filter((ball) => !seen.current!.has(ball.key));
        fresh.forEach((ball) => seen.current!.add(ball.key));
        if (motion && entered) fresh.forEach((ball) => animateBall(nodes.current.get(ball.key) ?? null, 0, ENTRY_FLIGHT_MS));
    }, [all, motion, entered]);

    const stopReplay = () => {
        timers.current.forEach((timer) => window.clearTimeout(timer));
        timers.current = [];
        running.current.forEach((animation) => animation.cancel());
        running.current = [];
        setReplaying(false);
        setTick(null);
    };
    useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

    const replay = () => {
        if (replaying) return stopReplay();
        stopReplay();
        setSelected(null);
        setReplaying(true);
        const step = replayStep(geo.length);
        const flight = Math.min(600, Math.round(step * 0.85));
        geo.forEach((item, index) => {
            running.current.push(...animateBall(nodes.current.get(item.ball.key) ?? null, index * step, flight));
            timers.current.push(window.setTimeout(() => setTick(item.ball), index * step));
        });
        timers.current.push(window.setTimeout(stopReplay, geo.length * step + flight + 400));
    };

    const select = (key: number | null) => {
        setSelected(key);
        if (key !== null && motion) animateBall(nodes.current.get(key) ?? null, 0, ENTRY_FLIGHT_MS);
    };

    const setFilter = <K extends keyof SprayFilters>(key: K, value: SprayFilters[K]) => {
        if (replaying) stopReplay();
        setSelected(null);
        setFilters((current) => ({ ...current, [key]: value }));
    };

    if (!all.length) return null;

    const resultLabel = (result: SprayResult) => t(`spray.result.${result}`);
    const labelOf = (ball: SprayBall) =>
        [ball.atBat.batter.name, eventName(ball.atBat, lang) || resultLabel(ball.result), inningName({ n: ball.atBat.inning, isTop: ball.atBat.top }, lang), ball.ev != null ? `${ball.ev} mph` : '', t('spray.feet', { ft: ball.dist })]
            .filter(Boolean)
            .join(' · ');
    const index = selected !== null ? balls.findIndex((ball) => ball.key === selected) : -1;
    const current = index >= 0 ? balls[index] : null;
    const present = RESULTS.filter((result) => balls.some((ball) => ball.result === result));

    return (
        <section className="card overflow-hidden" aria-labelledby="spray-title">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/10 px-4 py-3">
                <h2 id="spray-title" className="eyebrow">
                    {t('spray.title')}
                </h2>
                <Segmented<'balls' | 'zones'>
                    size="sm"
                    label={t('spray.views.label')}
                    value={mode}
                    onChange={(value) => {
                        if (replaying) stopReplay();
                        setSelected(null);
                        setMode(value);
                    }}
                    options={[
                        { value: 'balls', label: t('spray.views.balls') },
                        { value: 'zones', label: t('spray.views.zones') }
                    ]}
                />
                <button
                    type="button"
                    onClick={replay}
                    aria-pressed={replaying}
                    disabled={!balls.length || mode !== 'balls'}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-raised px-3 text-xs font-bold text-ink disabled:opacity-40"
                >
                    {replaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {replaying ? t('spray.stop') : t('spray.replay')}
                </button>
            </header>

            <div className="flex gap-2 overflow-x-auto px-4 pt-3 scrollbar-none">
                <Segmented<SprayFilters['team']>
                    size="sm"
                    label={t('spray.filter')}
                    value={filters.team}
                    onChange={(value) => setFilter('team', value)}
                    options={[
                        { value: 'all', label: t('spray.both') },
                        { value: 'away', label: game.away.abbrev },
                        { value: 'home', label: game.home.abbrev }
                    ]}
                />
                <Segmented<SprayFilters['result']>
                    size="sm"
                    label={t('spray.resultFilter')}
                    value={filters.result}
                    onChange={(value) => setFilter('result', value)}
                    options={[
                        { value: 'all', label: t('spray.all') },
                        { value: 'hits', label: t('spray.onlyHits') },
                        { value: 'hr', label: t('spray.onlyHr') },
                        { value: 'outs', label: t('spray.onlyOuts') }
                    ]}
                />
            </div>

            <div className="fld relative px-3 pt-3">
                <svg
                    ref={svgRef}
                    viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                    className="mx-auto h-auto w-full max-w-[520px] select-none rounded-2xl"
                    style={{ background: 'var(--fld-foul)' }}
                    role="group"
                    aria-label={t('spray.aria', { count: balls.length })}
                >
                    <GlowDef id={glow} />
                    <ParkDrawing park={park} />
                    {mode === 'zones' && <ZonesLayer balls={balls} park={park} />}
                    <g style={entered ? (mode === 'balls' ? undefined : { display: 'none' }) : { opacity: 0 }}>
                        {geo.map((item) => {
                            const active = item.ball.key === selected;
                            const color = SPRAY_RESULT_COLORS[item.ball.result];
                            return (
                                <g
                                    key={item.ball.key}
                                    ref={(node) => {
                                        if (node) nodes.current.set(item.ball.key, node);
                                        else nodes.current.delete(item.ball.key);
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={labelOf(item.ball)}
                                    aria-pressed={active}
                                    onClick={() => select(active ? null : item.ball.key)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            select(active ? null : item.ball.key);
                                        }
                                    }}
                                    style={{ cursor: 'pointer', opacity: selected !== null && !active ? 0.22 : 1, transition: 'opacity .2s' }}
                                >
                                    <path data-path d={item.d} pathLength={1} strokeDasharray="1" fill="none" stroke={color} strokeOpacity={active ? 0.95 : 0.42} strokeWidth={active ? 3.2 : 2.2} strokeLinecap="round" />
                                    {item.bounces.map((point, n) => (
                                        <circle key={n} data-bounce cx={point.x} cy={point.y} r={2.4} fill={color} fillOpacity={0.7} />
                                    ))}
                                    <circle cx={item.x} cy={item.y} r={16} fill="transparent" />
                                    <circle data-ripple cx={item.x} cy={item.y} r={item.r} fill="none" stroke={color} strokeWidth={2} opacity={0} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                                    <g data-marker style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
                                        {active && <circle cx={item.x} cy={item.y} r={item.r + 5} fill="none" stroke="#ffffff" strokeWidth={2} />}
                                        <ResultMarker result={item.ball.result} x={item.x} y={item.y} r={item.r} glowId={glow} />
                                    </g>
                                </g>
                            );
                        })}
                    </g>
                </svg>
                {!balls.length && <p className="absolute inset-x-0 top-1/2 text-center text-sm font-bold text-white">{t('spray.empty')}</p>}
            </div>

            <ol className="sr-only" aria-label={t('spray.list')}>
                {balls.map((ball) => (
                    <li key={ball.key}>{labelOf(ball)}</li>
                ))}
            </ol>

            <div className="px-4 pb-4 pt-2">
                {replaying && tick ? (
                    <p className="text-center text-sm font-bold" aria-live="polite">
                        {inningName({ n: tick.atBat.inning, isTop: tick.atBat.top }, lang)} · {tick.atBat.batter.name} · <span style={{ color: tick.result === 'out' ? undefined : SPRAY_RESULT_COLORS[tick.result] }}>{eventName(tick.atBat, lang) || resultLabel(tick.result)}</span>
                    </p>
                ) : current && mode === 'balls' ? (
                    <DetailCard ball={current} position={index} total={balls.length} onStep={(delta) => select(balls[(index + delta + balls.length) % balls.length].key)} />
                ) : (
                    <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-muted">
                        {present.map((result) => (
                            <span key={result} className="inline-flex items-center gap-1.5">
                                <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={result === 'out' ? { boxShadow: 'inset 0 0 0 2px rgb(var(--muted))' } : { backgroundColor: SPRAY_RESULT_COLORS[result] }}
                                />
                                {resultLabel(result)} {balls.filter((ball) => ball.result === result).length}
                            </span>
                        ))}
                        <span className="text-faint">{t('spray.tap')}</span>
                    </p>
                )}

                <StatsStrip stats={stats} hasEv={hasEv} />
            </div>
        </section>
    );
};

const DetailCard: React.FC<{ ball: SprayBall; position: number; total: number; onStep: (delta: number) => void }> = ({ ball, position, total, onStep }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const { atBat, pitch } = ball;
    const color = SPRAY_RESULT_COLORS[ball.result];
    const facts: [string, string][] = [
        ...(ball.ev != null ? ([[t('spray.card.ev'), `${ball.ev} mph`]] as [string, string][]) : []),
        ...(ball.la != null ? ([[t('spray.card.la'), `${ball.la}°`]] as [string, string][]) : []),
        [t('spray.card.dist'), `${ball.measured ? '' : '≈ '}${t('spray.feet', { ft: ball.dist })}`],
        [t('spray.card.type'), t(`spray.traj.${pitch.hit?.traj || { ground: 'ground_ball', line: 'line_drive', fly: 'fly_ball', popup: 'popup' }[ball.traj]}`)],
        ...(ball.hard ? ([[t('spray.card.hard'), t(`spray.hard.${ball.hard}`, { defaultValue: ball.hard })]] as [string, string][]) : [])
    ];
    return (
        <div className="rounded-2xl bg-raised p-3 text-sm">
            <div className="flex items-center gap-3">
                <PlayerLink id={atBat.batter.id} decorative>
                    <PlayerPhoto personId={atBat.batter.id} name={atBat.batter.name} size={44} />
                </PlayerLink>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold">
                        <PlayerLink id={atBat.batter.id}>{atBat.batter.name}</PlayerLink>
                    </p>
                    <p className="truncate text-xs text-muted">
                        {inningName({ n: atBat.inning, isTop: atBat.top }, lang)} · <PlayerLink id={atBat.pitcher.id}>{atBat.pitcher.name}</PlayerLink>
                        {pitch.type || pitch.typeDesc ? ` · ${pitchTypeName(pitch, lang)}` : ''}
                        {pitch.mph ? ` ${pitch.mph} mph` : ''}
                    </p>
                </div>
                <span className="pill shrink-0" style={ball.result === 'out' ? { background: 'rgb(var(--surface))', color: 'rgb(var(--ink))' } : { background: color, color: TEXT_ON[ball.result] }}>
                    {eventName(atBat, lang) || t(`spray.result.${ball.result}`)}
                </span>
            </div>
            <dl className="mt-2.5 flex flex-wrap gap-1.5">
                {facts.map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-surface px-2.5 py-1.5">
                        <dt className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</dt>
                        <dd className="font-bold tabular-nums">{value}</dd>
                    </div>
                ))}
                {ball.ev != null && ball.ev >= 95 && <span className="pill self-center bg-live/15 text-live">{t('spray.card.hardHit')}</span>}
            </dl>
            <div className="mt-2 flex items-center justify-between">
                <button type="button" onClick={() => onStep(-1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface" aria-label={t('spray.card.prev')}>
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-bold text-muted tabular-nums">{t('spray.card.position', { n: position + 1, total })}</span>
                <button type="button" onClick={() => onStep(1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface" aria-label={t('spray.card.next')}>
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};

const StatsStrip: React.FC<{ stats: ReturnType<typeof sprayStats>; hasEv: boolean }> = ({ stats, hasEv }) => {
    const { t } = useTranslation();
    const tiles: [string, React.ReactNode][] = [
        [t('spray.stats.inPlay'), stats.count],
        [t('spray.stats.hits'), stats.hits],
        [t('spray.stats.hr'), stats.hr]
    ];
    if (hasEv) {
        tiles.push([t('spray.stats.hardPct'), stats.hardPct != null ? `${stats.hardPct}%` : '—']);
        tiles.push([t('spray.stats.avgEv'), stats.avgEv != null ? `${stats.avgEv}` : '—']);
        tiles.push([t('spray.stats.avgLa'), stats.avgLa != null ? `${stats.avgLa}°` : '—']);
    }
    if (stats.longest)
        tiles.push([
            t('spray.stats.longest'),
            <>
                {t('spray.feet', { ft: stats.longest.measured })}{' '}
                <PlayerLink id={stats.longest.atBat.batter.id} className="block truncate text-[11px] font-semibold text-muted">
                    {stats.longest.atBat.batter.name}
                </PlayerLink>
            </>
        ]);
    const bar = (label: string, parts: [string, number][]) => (
        <div>
            <p className="eyebrow mb-1">{label}</p>
            <p className="flex flex-wrap gap-x-3 text-xs font-semibold text-muted">
                {parts.map(([name, pct]) => (
                    <span key={name}>
                        {name} <b className="text-ink tabular-nums">{pct}%</b>
                    </span>
                ))}
            </p>
        </div>
    );
    return (
        <div className="mt-3 space-y-3 border-t border-line/10 pt-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {tiles.map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-2xl bg-raised px-2 py-2 text-center">
                        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-faint">{label}</p>
                        <div className="font-display text-base font-extrabold tabular-nums">{value}</div>
                    </div>
                ))}
            </div>
            {stats.count > 0 &&
                bar(t('spray.stats.types'), [
                    [t('spray.traj.ground_ball'), stats.traj.ground],
                    [t('spray.traj.line_drive'), stats.traj.line],
                    [t('spray.traj.fly_ball'), stats.traj.fly],
                    [t('spray.traj.popup'), stats.traj.popup]
                ])}
            {stats.dir &&
                bar(t('spray.stats.dirs'), [
                    [t('spray.stats.pull'), stats.dir.pull],
                    [t('spray.stats.center'), stats.dir.center],
                    [t('spray.stats.oppo'), stats.dir.oppo]
                ])}
            {!hasEv && <p className="text-[11px] text-faint">{t('spray.noEv')}</p>}
        </div>
    );
};

const wedge = (park: ReturnType<typeof parkFor>, from: number, to: number, inner: number) => {
    const outer: string[] = [];
    for (let deg = from; deg <= to + 0.001; deg += 1.5) {
        const p = svgPoint(polar(deg, wallAt(park, deg)));
        outer.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
    const a = svgPoint(polar(to, inner));
    const b = svgPoint(polar(from, inner));
    return `M${outer.join(' L')} L${a.x.toFixed(1)} ${a.y.toFixed(1)} A${inner} ${inner} 0 0 0 ${b.x.toFixed(1)} ${b.y.toFixed(1)} Z`;
};

const ZonesLayer: React.FC<{ balls: SprayBall[]; park: ReturnType<typeof parkFor> }> = ({ balls, park }) => {
    const { t } = useTranslation();
    const rows = useMemo(() => zoneStats(balls), [balls]);
    const top = Math.max(1, ...rows.map((row) => row.count));
    const l = svgPoint(polar(-45, 150));
    const r = svgPoint(polar(45, 150));
    return (
        <g>
            {rows.map((row) => {
                const from = -45 + (ZONES.indexOf(row.zone) - 1) * 18;
                const d = row.zone === 'IF' ? `M0 0 L${l.x} ${l.y} A150 150 0 0 1 ${r.x} ${r.y} Z` : wedge(park, from, from + 18, 150);
                const mid = row.zone === 'IF' ? svgPoint(polar(0, 100)) : svgPoint(polar(from + 9, (150 + wallAt(park, from + 9)) / 2));
                return (
                    <g key={row.zone}>
                        <path d={d} fill={`rgb(220 38 38 / ${(0.08 + 0.62 * (row.count / top)).toFixed(2)})`} stroke="#ffffff" strokeOpacity={0.7} strokeWidth={1.5} />
                        <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize={14} fontWeight={800} style={{ paintOrder: 'stroke', stroke: 'rgb(0 0 0 / 0.45)', strokeWidth: 3 }}>
                            {t('spray.zoneLabel', { count: row.count, pct: row.pct, hits: row.hits })}
                        </text>
                    </g>
                );
            })}
        </g>
    );
};
