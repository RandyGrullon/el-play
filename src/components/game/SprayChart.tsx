import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Maximize2, Play, Square, X } from 'lucide-react';
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
    heatColor,
    heatGrid,
    zoneStats,
    flightPath,
    markerRadius,
    pathD,
    replayStep,
    sprayBalls,
    sprayBatters,
    sprayStats,
    svgPoint,
    withTeam,
    type SprayBall,
    type SprayFilters,
    type SprayResult
} from '../../lib/spray';
import { usePreferences } from '../../store/preferences';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { BottomSheet, pushModalLayer } from '../ui/BottomSheet';
import { Segmented } from '../ui/Segmented';
import { PlayerLink } from '../ui/PlayerLink';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { GlowDef, ParkDrawing, ResultMarker } from '../spray/ParkDrawing';

// Mapa de batazos sobre el parque de verdad del juego (en pies): cada bola con su vuelo desde home y dónde cayó,
// filtros que se combinan (equipo, resultado, tipo y bateador), la ficha de la bola tocada, «Repetir» y los números de lo filtrado.
// «Ampliar» lo abre a pantalla completa con los mismos controles (filtros, vista y bola tocada compartidos con la tarjeta).

type SprayMode = 'balls' | 'zones' | 'heat';

/** Lo que comparten la tarjeta y la copia a pantalla completa */
interface SprayShared {
    filters: SprayFilters;
    setFilters: (filters: SprayFilters) => void;
    mode: SprayMode;
    setMode: (mode: SprayMode) => void;
    selected: number | null;
    setSelected: (key: number | null) => void;
}

const RESULTS: SprayResult[] = ['single', 'double', 'triple', 'hr', 'error', 'out'];
const TRAJS: SprayFilters['traj'][] = ['all', 'ground', 'line', 'fly', 'popup'];
const TEXT_ON: Record<SprayResult, string> = { single: '#ffffff', double: '#ffffff', triple: '#14151a', hr: '#ffffff', error: '#14151a', out: '' };

interface Geo {
    ball: SprayBall;
    d: string;
    x: number;
    y: number;
    r: number;
    bounces: { x: number; y: number }[];
}

/** Ancho en pantalla de un elemento (0 hasta medirlo) */
const useWidth = (node: Element | null) => {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        if (!node) return;
        const measure = () => setWidth(Math.round(node.getBoundingClientRect().width));
        measure();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [node]);
    return width;
};

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

/** El mapa en su tarjeta y, con «Ampliar», a pantalla completa (se cierra con la X, Escape o «atrás») */
export const SprayChart: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const [filters, setFilters] = useState<SprayFilters>(DEFAULT_FILTERS);
    const [mode, setMode] = useState<SprayMode>('balls');
    const [selected, setSelected] = useState<number | null>(null);
    const [open, setOpen] = useState(false);
    const shared: SprayShared = { filters, setFilters, mode, setMode, selected, setSelected };
    return (
        <>
            <SprayBody game={game} shared={shared} onExpand={() => setOpen(true)} />
            {open && <SprayDialog label={t('spray.title')} onClose={() => setOpen(false)}>{(close) => <SprayBody game={game} shared={shared} big onClose={close} />}</SprayDialog>}
        </>
    );
};

const SprayBody: React.FC<{ game: GameDetail; shared: SprayShared; big?: boolean; onExpand?: () => void; onClose?: () => void }> = ({ game, shared, big = false, onExpand, onClose }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const uid = useId().replace(/:/g, '');
    const glow = `${uid}-glow`;
    const { playAnimations } = usePreferences();
    const reduced = useReducedMotion();
    const motion = playAnimations && !reduced;
    const park = useMemo(() => parkFor(game.venue), [game.venue]);
    const view = useMemo(() => fieldViewBox(park), [park]);
    const all = useMemo(() => sprayBalls(game.atBats, park), [game.atBats, park]);
    const { filters, setFilters, mode, setMode, selected, setSelected } = shared;
    const [picking, setPicking] = useState(false);
    const balls = useMemo(() => filterBalls(all, filters), [all, filters]);
    const batters = useMemo(() => sprayBatters(all, filters.team), [all, filters.team]);
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

    const svgRef = useRef<SVGSVGElement | null>(null);
    const [svgNode, setSvgNode] = useState<SVGSVGElement | null>(null);
    const attachSvg = useCallback((node: SVGSVGElement | null) => {
        svgRef.current = node;
        setSvgNode(node);
    }, []);
    // El círculo que se toca mide ~26 px en pantalla (en pies depende del ancho del dibujo), nunca menos de 16 pies
    const width = useWidth(svgNode);
    const hitRadius = Math.max(16, (13 * view.w) / (width || (big ? 900 : 520)));
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

    const changeFilters = (next: SprayFilters) => {
        if (replaying) stopReplay();
        setSelected(null);
        setFilters(next);
    };
    const setFilter = <K extends keyof SprayFilters>(key: K, value: SprayFilters[K]) => changeFilters({ ...filters, [key]: value });

    if (!all.length) return null;

    const resultLabel = (result: SprayResult) => t(`spray.result.${result}`);
    const labelOf = (ball: SprayBall) =>
        [ball.atBat.batter.name, eventName(ball.atBat, lang) || resultLabel(ball.result), inningName({ n: ball.atBat.inning, isTop: ball.atBat.top }, lang), ball.ev != null ? `${ball.ev} mph` : '', t('spray.feet', { ft: ball.dist })]
            .filter(Boolean)
            .join(' · ');
    const index = selected !== null ? balls.findIndex((ball) => ball.key === selected) : -1;
    const current = index >= 0 ? balls[index] : null;
    const present = RESULTS.filter((result) => balls.some((ball) => ball.result === result));
    const batterName = filters.batter !== null ? (all.find((ball) => ball.atBat.batter.id === filters.batter)?.atBat.batter.name ?? '') : '';
    const filterAria = (group: 'team' | 'result' | 'type', label: string) => `${t(`spray.filters.${group}`)}: ${label}`;

    return (
        <section className="card overflow-hidden" aria-labelledby={`${uid}-title`}>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/10 px-4 py-3">
                <h2 id={`${uid}-title`} className="eyebrow">
                    {t('spray.title')}
                </h2>
                <Segmented<SprayMode>
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
                        { value: 'zones', label: t('spray.views.zones') },
                        { value: 'heat', label: t('spray.views.heat') }
                    ]}
                />
                {big ? (
                    <button type="button" data-close onClick={onClose} aria-label={t('common.close')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-ink">
                        <X className="h-[18px] w-[18px]" />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => {
                            if (replaying) stopReplay();
                            onExpand?.();
                        }}
                        aria-haspopup="dialog"
                        className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full bg-raised px-3 text-xs font-bold text-ink"
                    >
                        <Maximize2 className="h-3.5 w-3.5" />
                        {t('spray.expand')}
                    </button>
                )}
            </header>

            <div className="flex items-center gap-2 overflow-x-auto px-4 pt-3 scrollbar-none" role="group" aria-label={t('spray.filters.label')}>
                <Segmented<SprayFilters['team']>
                    size="sm"
                    className="shrink-0"
                    label={t('spray.filters.team')}
                    value={filters.team}
                    onChange={(value) => changeFilters(withTeam(all, filters, value))}
                    options={[
                        { value: 'all', label: t('spray.both'), aria: filterAria('team', t('spray.both')) },
                        { value: 'away', label: game.away.abbrev, aria: filterAria('team', game.away.name) },
                        { value: 'home', label: game.home.abbrev, aria: filterAria('team', game.home.name) }
                    ]}
                />
                <Segmented<SprayFilters['result']>
                    size="sm"
                    className="shrink-0"
                    label={t('spray.filters.result')}
                    value={filters.result}
                    onChange={(value) => setFilter('result', value)}
                    options={(['all', 'hits', 'hr', 'outs'] as const).map((value) => ({ value, label: t(`spray.filters.${value}`), aria: filterAria('result', t(`spray.filters.${value}`)) }))}
                />
                <Segmented<SprayFilters['traj']>
                    size="sm"
                    className="shrink-0"
                    label={t('spray.filters.type')}
                    value={filters.traj}
                    onChange={(value) => setFilter('traj', value)}
                    options={TRAJS.map((value) => {
                        const label = value === 'all' ? t('spray.filters.all') : t(`spray.kind.${value}`);
                        return { value, label, aria: filterAria('type', label) };
                    })}
                />
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setPicking(true)}
                        aria-haspopup="dialog"
                        aria-label={filters.batter !== null ? `${t('spray.batter')}: ${batterName}` : t('spray.pickBatter')}
                        className={`inline-flex min-h-10 max-w-[180px] items-center gap-1 rounded-full px-4 text-xs font-semibold transition-colors ${filters.batter !== null ? 'bg-ink text-bg' : 'bg-raised text-muted hover:text-ink'}`}
                    >
                        <span className="truncate">{filters.batter !== null ? batterName : t('spray.batter')}</span>
                        {filters.batter === null && <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                    {filters.batter !== null && (
                        <button type="button" onClick={() => setFilter('batter', null)} aria-label={t('spray.clearBatter')} className="flex h-10 w-10 items-center justify-center rounded-full bg-raised text-ink">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            <BottomSheet open={picking} onClose={() => setPicking(false)} title={t('spray.pickBatter')}>
                <ul className="space-y-1">
                    {batters.map((row) => {
                        const team = game[row.side];
                        const active = filters.batter === row.id;
                        const count = t('spray.ballsCount', { count: row.count });
                        return (
                            <li key={row.id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPicking(false);
                                        setFilter('batter', row.id);
                                    }}
                                    aria-pressed={active}
                                    aria-label={`${row.name}, ${team.abbrev}, ${count}`}
                                    className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors ${active ? 'bg-accent/15' : 'hover:bg-raised'}`}
                                >
                                    <PlayerPhoto personId={row.id} name={row.name} size={44} team={team} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[15px] font-bold">{row.name}</span>
                                        <span className="block text-[13px] text-muted">{team.abbrev}</span>
                                    </span>
                                    <span className="shrink-0 text-[13px] font-semibold text-muted">{count}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </BottomSheet>

            <div className="fld relative px-3 pt-3">
                <svg
                    ref={attachSvg}
                    viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                    className={`mx-auto h-auto w-full select-none rounded-2xl ${big ? 'max-w-[900px]' : 'max-w-[520px]'}`}
                    style={{ background: 'var(--fld-foul)' }}
                    role="group"
                    aria-label={mode === 'heat' ? t('spray.heatAria', { count: balls.length }) : mode === 'zones' ? t('spray.zonesAria', { count: balls.length }) : t('spray.aria', { count: balls.length })}
                >
                    <GlowDef id={glow} />
                    <ParkDrawing park={park} />
                    {mode === 'zones' && <ZonesLayer balls={balls} park={park} />}
                    {mode === 'heat' && <HeatLayer balls={balls} box={view} park={park} />}
                    <g style={entered ? (mode === 'balls' ? undefined : { display: 'none' }) : { opacity: 0 }}>
                        {/* El dibujo (vuelo, piques, marca) no recibe toques: el vuelo de una bola no tapa la marca de otra */}
                        <g pointerEvents="none">
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
                                        style={{ opacity: selected !== null && !active ? 0.22 : 1, transition: 'opacity .2s' }}
                                    >
                                        <path data-path d={item.d} pathLength={1} strokeDasharray="1" fill="none" stroke={color} strokeOpacity={active ? 0.95 : 0.42} strokeWidth={active ? 3.2 : 2.2} strokeLinecap="round" pointerEvents="none" />
                                        {item.bounces.map((point, n) => (
                                            <circle key={n} data-bounce cx={point.x} cy={point.y} r={2.4} fill={color} fillOpacity={0.7} />
                                        ))}
                                        <circle data-ripple cx={item.x} cy={item.y} r={item.r} fill="none" stroke={color} strokeWidth={2} opacity={0} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                                        <g data-marker style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
                                            {active && <circle cx={item.x} cy={item.y} r={item.r + 5} fill="none" stroke="#ffffff" strokeWidth={2} />}
                                            <ResultMarker result={item.ball.result} x={item.x} y={item.y} r={item.r} glowId={glow} />
                                        </g>
                                    </g>
                                );
                            })}
                        </g>
                        {/* Encima de todo, el círculo que se toca (≈ 26 px en pantalla, como en la app), centrado en la marca */}
                        <g>
                            {geo.map((item) => {
                                const active = item.ball.key === selected;
                                return (
                                    <circle
                                        key={item.ball.key}
                                        data-hit
                                        cx={item.x}
                                        cy={item.y}
                                        r={hitRadius}
                                        fill="transparent"
                                        stroke="transparent"
                                        strokeWidth={2.5}
                                        pointerEvents="all"
                                        className="cursor-pointer outline-none focus-visible:stroke-white"
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
                                    />
                                );
                            })}
                        </g>
                    </g>
                </svg>
                {!balls.length && <p className="absolute inset-x-0 top-1/2 text-center text-sm font-bold text-white">{t('spray.empty')}</p>}
            </div>

            <ol className="sr-only" aria-label={t('spray.list')}>
                {balls.map((ball) => (
                    <li key={ball.key}>{labelOf(ball)}</li>
                ))}
            </ol>

            <div className="space-y-3 px-4 pb-4 pt-2.5">
                {mode === 'balls' && (
                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={replay}
                            aria-pressed={replaying}
                            disabled={!balls.length}
                            className={`inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold disabled:opacity-40 ${replaying ? 'bg-ink text-bg' : 'bg-raised text-ink'}`}
                        >
                            {replaying ? <Square className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
                            {replaying ? t('spray.stop') : t('spray.replay')}
                        </button>
                        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold" aria-live="polite">
                            {replaying && tick && (
                                <>
                                    {inningName({ n: tick.atBat.inning, isTop: tick.atBat.top }, lang)} · {tick.atBat.batter.name} ·{' '}
                                    <span className="font-extrabold" style={{ color: tick.result === 'out' ? undefined : SPRAY_RESULT_COLORS[tick.result] }}>
                                        {eventName(tick.atBat, lang) || resultLabel(tick.result)}
                                    </span>
                                    <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">
                                        {balls.findIndex((ball) => ball.key === tick.key) + 1}/{balls.length}
                                    </span>
                                </>
                            )}
                        </p>
                    </div>
                )}

                {current && mode === 'balls' ? (
                    <DetailCard ball={current} position={index} total={balls.length} onStep={(delta) => select(balls[(index + delta + balls.length) % balls.length].key)} />
                ) : mode !== 'balls' ? (
                    <RampLegend color={mode === 'zones' ? zoneFill : heatColor} />
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

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Pantalla completa: entrada en el historial («atrás» cierra), Escape (si es la capa de arriba), foco atrapado adentro
 * y la página de atrás quieta. Un enlace de adentro (un pelotero) reemplaza la entrada en vez de apilar otra.
 */
const SprayDialog: React.FC<{ label: string; onClose: () => void; children: (close: () => void) => React.ReactNode }> = ({ label, onClose, children }) => {
    const navigate = useNavigate();
    const root = useRef<HTMLDivElement>(null);
    const token = useRef(`spray-${Math.random().toString(36).slice(2)}`);
    const pushed = useRef(false);
    const done = useRef(false);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const finish = useCallback(() => {
        if (done.current) return;
        done.current = true;
        onCloseRef.current();
    }, []);
    // ¿La entrada de arriba del historial sigue siendo la nuestra?
    const ours = () => pushed.current && window.history.state?.elPlaySpray === token.current;

    const leaving = useRef(false);
    const requestClose = useCallback(() => {
        // Una sola vez: dos toques rápidos no deben volver dos veces atrás (y salir del juego)
        if (done.current || leaving.current) return;
        if (ours()) {
            leaving.current = true;
            window.history.back();
            // Por si el navegador no avisa del «atrás»
            window.setTimeout(finish, 450);
            return;
        }
        finish();
    }, [finish]);
    const requestCloseRef = useRef(requestClose);
    requestCloseRef.current = requestClose;

    useEffect(() => {
        try {
            if (window.history.state?.elPlaySpray !== token.current) window.history.pushState({ ...(window.history.state || {}), elPlaySpray: token.current }, '');
            pushed.current = true;
        } catch {
            pushed.current = false;
        }
        const onPop = () => {
            if (pushed.current && window.history.state?.elPlaySpray !== token.current) {
                pushed.current = false;
                finish();
            }
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [finish]);

    useEffect(() => {
        const layer = pushModalLayer();
        const previous = document.activeElement as HTMLElement | null;
        root.current?.querySelector<HTMLElement>('[data-close]')?.focus({ preventScroll: true });
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (event: KeyboardEvent) => {
            if (!layer.isTop() || !root.current) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                requestCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => item.getAttribute('aria-hidden') !== 'true' && item.getClientRects().length > 0);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (event.shiftKey && (active === first || !root.current.contains(active))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (active === last || !root.current.contains(active))) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            layer.remove();
            document.body.style.overflow = overflow;
            if (previous?.isConnected) previous.focus({ preventScroll: true });
        };
    }, []);

    const onLink = (event: React.MouseEvent<HTMLDivElement>) => {
        const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
        if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return;
        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        event.preventDefault();
        const replace = ours();
        pushed.current = false;
        finish();
        navigate(`${url.pathname}${url.search}${url.hash}`, { replace });
    };

    return createPortal(
        <div ref={root} className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-bg motion-safe:animate-fade-up" role="dialog" aria-modal="true" aria-label={label} onClickCapture={onLink}>
            <div className="mx-auto w-full max-w-[940px] px-2 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(8px+env(safe-area-inset-top))] sm:px-4">{children(requestClose)}</div>
        </div>,
        document.body
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

/** Sombra de la zona según su parte de la que más tiene (0 a 1) */
const zoneFill = (share: number) => `rgb(220 38 38 / ${(0.08 + 0.62 * share).toFixed(2)})`;

/** «Menos ▭▭▭▭▭▭ Más»: la escala de la sombra (Zonas) o del calor, sobre la grama como en el mapa */
const RampLegend: React.FC<{ color: (value: number) => string }> = ({ color }) => {
    const { t } = useTranslation();
    return (
        <p className="fld flex items-center justify-center gap-2 text-[11px] font-semibold text-muted">
            <span>{t('spray.less')}</span>
            <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((step) => (
                    <span key={step} className="h-2 w-[18px] rounded-full" style={{ background: `linear-gradient(${color(step / 5)}, ${color(step / 5)}), var(--fld-g1)` }} />
                ))}
            </span>
            <span>{t('spray.more')}</span>
        </p>
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
                        <path d={d} fill={zoneFill(row.count / top)} stroke="#ffffff" strokeOpacity={0.7} strokeWidth={1.5} />
                        <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize={14} fontWeight={800} style={{ paintOrder: 'stroke', stroke: 'rgb(0 0 0 / 0.45)', strokeWidth: 3 }}>
                            {t('spray.zoneLabel', { count: row.count, pct: row.pct, hits: row.hits })}
                        </text>
                    </g>
                );
            })}
        </g>
    );
};

const HeatLayer: React.FC<{ balls: SprayBall[]; box: { x: number; y: number; w: number; h: number }; park: ReturnType<typeof parkFor> }> = ({ balls, box, park }) => {
    const id = useId().replace(/:/g, '');
    const grid = useMemo(() => heatGrid(balls, box), [balls, box]);
    // Recortado al terreno: de foul a foul hasta 40 pies detrás de la cerca (donde caen los jonrones)
    const clip = useMemo(() => {
        const points: string[] = [];
        for (let deg = -45; deg <= 45.001; deg += 1.5) {
            const p = svgPoint(polar(deg, wallAt(park, deg) + 40));
            points.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
        }
        return `M0 0 L${points.join(' L')} Z`;
    }, [park]);
    return (
        <g>
            <defs>
                <clipPath id={`${id}-c`}>
                    <path d={clip} />
                </clipPath>
                <filter id={`${id}-b`} x="-10%" y="-10%" width="120%" height="120%">
                    <feGaussianBlur stdDeviation={grid.step * 0.7} />
                </filter>
            </defs>
            <g clipPath={`url(#${id}-c)`}>
                <g filter={`url(#${id}-b)`}>
                    {grid.values.map((value, index) =>
                        value > 0.05 ? <rect key={index} x={grid.x + (index % grid.cols) * grid.step} y={grid.y + Math.floor(index / grid.cols) * grid.step} width={grid.step + 0.5} height={grid.step + 0.5} fill={heatColor(value)} /> : null
                    )}
                </g>
            </g>
        </g>
    );
};
