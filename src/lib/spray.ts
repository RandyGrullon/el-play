// Mapa de batazos: lógica pura (filtros, resultado, trayectoria, vuelo dibujado desde arriba, zonas, halado/contrario,
// cifras y mapa de calor). Todo en pies con home en (0, 0) y +y hacia el center (src/lib/flight.ts). Sus casos de
// prueba corren con `node scripts/probar-jugadas.js`.
import type { AtBat, Pitch } from '../types';
import { gamedayToFeet, wallAt, type Feet, type Park } from './flight';

export type SprayResult = 'single' | 'double' | 'triple' | 'hr' | 'out' | 'error';
export type SprayTraj = 'ground' | 'line' | 'fly' | 'popup';
export type SprayZone = 'LF' | 'LCF' | 'CF' | 'RCF' | 'RF' | 'IF';
export type SprayDir = 'pull' | 'center' | 'oppo';
export type TeamFilter = 'all' | 'away' | 'home';
export type ResultFilter = 'all' | 'hits' | 'hr' | 'outs';
export type TrajFilter = 'all' | SprayTraj;

export interface SprayFilters {
    team: TeamFilter;
    result: ResultFilter;
    traj: TrajFilter;
    batter: number | null;
}

export const NO_FILTERS: SprayFilters = { team: 'all', result: 'all', traj: 'all', batter: null };
export const TRAJS: SprayTraj[] = ['ground', 'line', 'fly', 'popup'];
export const ZONES: SprayZone[] = ['LF', 'LCF', 'CF', 'RCF', 'RF', 'IF'];
export const DIRS: SprayDir[] = ['pull', 'center', 'oppo'];
/** Batazo fuerte: 95 mph o más de salida */
export const HARD_HIT = 95;
/** Hasta aquí (pies desde home) es el cuadro */
export const INFIELD_FT = 150;

export interface SprayBall {
    /** El turno (atBat.i) */
    key: number;
    /** Orden en el juego (0, 1, 2…) */
    order: number;
    atBat: AtBat;
    pitch: Pitch;
    side: 'away' | 'home';
    result: SprayResult;
    traj: SprayTraj | null;
    ev: number | null;
    la: number | null;
    hard: string | null;
    /** Dónde se dibuja la caída (pies); el jonrón siempre pasa la cerca y lo demás queda adentro */
    land: Feet;
    /** Ángulo desde la línea home-center (grados; negativo = left) */
    deg: number;
    /** Distancia: la medida o la del punto marcado */
    feet: number;
    measured: boolean;
    zone: SprayZone;
    dir: SprayDir | null;
}

const RAD = Math.PI / 180;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Clase del resultado por el evento del turno */
export const resultOf = (event: string | null | undefined): SprayResult => {
    if (event === 'single' || event === 'double' || event === 'triple') return event;
    if (event === 'home_run') return 'hr';
    if (event === 'field_error') return 'error';
    return 'out';
};

export const isHit = (result: SprayResult) => result === 'single' || result === 'double' || result === 'triple' || result === 'hr';

/** Trayectoria: la que marca la fuente; si no, por el ángulo de salida o por el nombre del out */
export const trajOf = (traj: string | null | undefined, la: number | null | undefined, label?: string | null): SprayTraj | null => {
    const text = `${traj ?? ''}`.toLowerCase();
    if (/ground/.test(text)) return 'ground';
    if (/line/.test(text)) return 'line';
    if (/pop/.test(text)) return 'popup';
    if (/fly/.test(text)) return 'fly';
    if (typeof la === 'number') return la < 10 ? 'ground' : la < 25 ? 'line' : la < 50 ? 'fly' : 'popup';
    const name = `${label ?? ''}`.toLowerCase();
    if (/ground|grounded/.test(name)) return 'ground';
    if (/line/.test(name)) return 'line';
    if (/pop/.test(name)) return 'popup';
    if (/fly/.test(name)) return 'fly';
    return null;
};

/** Zona del batazo: el cuadro (menos de 150 pies o sobre la tierra) o una de las 5 tajadas del jardín */
export const zoneOf = (spot: Feet): SprayZone => {
    const dist = Math.hypot(spot.x, spot.y);
    if (dist < INFIELD_FT || Math.hypot(spot.x, spot.y - 60.5) <= 95) return 'IF';
    const deg = Math.atan2(spot.x, spot.y) / RAD;
    if (deg < -27) return 'LF';
    if (deg < -9) return 'LCF';
    if (deg <= 9) return 'CF';
    if (deg <= 27) return 'RCF';
    return 'RF';
};

/** Halado, al centro o a la banda contraria: el derecho hala al left, el zurdo al right; el ambidiestro según el lanzador */
export const dirOf = (deg: number, side: string | null | undefined, hand: string | null | undefined): SprayDir | null => {
    const bats = side === 'S' ? (hand === 'L' ? 'R' : hand === 'R' ? 'L' : null) : side;
    if (bats !== 'R' && bats !== 'L') return null;
    if (Math.abs(deg) <= 15) return 'center';
    return (bats === 'R') === deg < 0 ? 'pull' : 'oppo';
};

/** Cada bola puesta en juego con dónde se dibuja, en orden del juego */
export const sprayBalls = (atBats: AtBat[], park: Park): SprayBall[] => {
    const balls: SprayBall[] = [];
    for (const atBat of atBats) {
        const pitch = [...atBat.pitches].reverse().find((p) => p.r === 'inplay' && typeof p.hit?.x === 'number' && typeof p.hit?.y === 'number');
        if (!pitch?.hit) continue;
        const hit = pitch.hit;
        const spot = gamedayToFeet(hit.x as number, hit.y as number);
        const deg = clamp(Math.atan2(spot.x, spot.y) / RAD, -60, 60);
        const marked = Math.hypot(spot.x, spot.y);
        const measured = typeof hit.dist === 'number' && hit.dist > 30;
        const result = resultOf(atBat.event);
        const wall = wallAt(park, deg);
        // El jonrón cae detrás de la cerca; lo demás no la pasa (en un parque genérico el punto puede quedar afuera)
        const r = result === 'hr' ? clamp(Math.max(marked, measured ? (hit.dist as number) : 0), wall + 18, wall + 55) : Math.min(marked, wall - 6);
        const land = { x: Math.sin(deg * RAD) * r, y: Math.cos(deg * RAD) * r };
        balls.push({
            key: atBat.i,
            order: balls.length,
            atBat,
            pitch,
            side: atBat.top ? 'away' : 'home',
            result,
            traj: trajOf(hit.traj, hit.la, atBat.eventLabel),
            ev: typeof hit.ev === 'number' ? hit.ev : null,
            la: typeof hit.la === 'number' ? hit.la : null,
            hard: hit.hard ?? null,
            land,
            deg,
            feet: Math.round(measured ? (hit.dist as number) : Math.hypot(land.x, land.y)),
            measured,
            zone: zoneOf(land),
            dir: dirOf(deg, atBat.batter.side, atBat.pitcher.hand)
        });
    }
    return balls;
};

/** Los batazos que pasan todos los filtros */
export const filterBalls = (balls: SprayBall[], filters: SprayFilters) =>
    balls.filter(
        (ball) =>
            (filters.team === 'all' || ball.side === filters.team) &&
            (filters.result === 'all' || (filters.result === 'hits' ? isHit(ball.result) : filters.result === 'hr' ? ball.result === 'hr' : ball.result === 'out')) &&
            (filters.traj === 'all' || ball.traj === filters.traj) &&
            (filters.batter === null || ball.atBat.batter.id === filters.batter)
    );

// Ángulo de salida de cada trayectoria cuando no viene medido
const TYPICAL_LA: Record<SprayTraj, number> = { ground: 0, line: 15, fly: 32, popup: 58 };

export interface SprayPath {
    to: Feet;
    /** Punto de control de la curva cuadrática (la altura se ve como una panza hacia el centro) */
    control: Feet;
    /** Cuánto se separa la curva de la recta (pies) */
    bulge: number;
    /** Marcas de los piques del rodado */
    bounces: Feet[];
}

/** El vuelo visto desde arriba: el rodado es recto con 2-3 piques; lo de aire, una curva que crece con el ángulo */
export const flightPath = (land: Feet, traj: SprayTraj | null, la: number | null): SprayPath => {
    const dist = Math.hypot(land.x, land.y);
    if (traj === 'ground' || dist < 1) {
        const marks = dist > 110 ? [0.3, 0.55, 0.78] : [0.35, 0.68];
        return { to: land, control: { x: land.x / 2, y: land.y / 2 }, bulge: 0, bounces: marks.map((t) => ({ x: land.x * t, y: land.y * t })) };
    }
    const angle = la ?? TYPICAL_LA[traj ?? 'line'];
    const bulge = dist * clamp(0.05 + (angle - 10) * 0.0075, 0.05, 0.42);
    // Perpendicular hacia la línea home-center: al lado izquierdo del recorrido si va al right, al derecho si va al left
    const ux = land.x / dist;
    const uy = land.y / dist;
    const normal = land.x >= 0 ? { x: -uy, y: ux } : { x: uy, y: -ux };
    return { to: land, control: { x: land.x / 2 + normal.x * bulge * 2, y: land.y / 2 + normal.y * bulge * 2 }, bulge, bounces: [] };
};

/** Largo aproximado del recorrido (para dibujarlo con strokeDashoffset) */
export const pathLength = (path: SprayPath) => {
    let length = 0;
    let last = { x: 0, y: 0 };
    for (let step = 1; step <= 16; step++) {
        const s = step / 16;
        const point = { x: 2 * (1 - s) * s * path.control.x + s * s * path.to.x, y: 2 * (1 - s) * s * path.control.y + s * s * path.to.y };
        length += Math.hypot(point.x - last.x, point.y - last.y);
        last = point;
    }
    return length;
};

export interface ZoneStat {
    count: number;
    share: number;
    hits: number;
}

/** Cuántos batazos (y hits) caen en cada zona */
export const zoneStats = (balls: SprayBall[]): Record<SprayZone, ZoneStat> => {
    const out = Object.fromEntries(ZONES.map((zone) => [zone, { count: 0, share: 0, hits: 0 }])) as Record<SprayZone, ZoneStat>;
    for (const ball of balls) {
        out[ball.zone].count += 1;
        if (isHit(ball.result)) out[ball.zone].hits += 1;
    }
    for (const zone of ZONES) out[zone].share = balls.length ? out[zone].count / balls.length : 0;
    return out;
};

export interface SprayStats {
    balls: number;
    hits: number;
    hr: number;
    /** Con velocidad de salida medida */
    tracked: number;
    /** Parte (0-1) de los batazos fuertes entre los medidos */
    hardHit: number | null;
    avgEv: number | null;
    avgLa: number | null;
    longest: SprayBall | null;
    /** Parte (0-1) de cada trayectoria y de cada dirección (null si ninguno la tiene) */
    traj: Record<SprayTraj, number> | null;
    dir: Record<SprayDir, number> | null;
}

const shares = <K extends string>(keys: K[], values: (K | null)[]): Record<K, number> | null => {
    const known = values.filter((value): value is K => value !== null);
    if (!known.length) return null;
    return Object.fromEntries(keys.map((key) => [key, known.filter((value) => value === key).length / known.length])) as Record<K, number>;
};

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/** Las cifras de los batazos filtrados */
export const sprayStats = (balls: SprayBall[]): SprayStats => {
    const evs = balls.map((ball) => ball.ev).filter((ev): ev is number => ev !== null);
    const las = balls.map((ball) => ball.la).filter((la): la is number => la !== null);
    return {
        balls: balls.length,
        hits: balls.filter((ball) => isHit(ball.result)).length,
        hr: balls.filter((ball) => ball.result === 'hr').length,
        tracked: evs.length,
        hardHit: evs.length ? evs.filter((ev) => ev >= HARD_HIT).length / evs.length : null,
        avgEv: average(evs),
        avgLa: average(las),
        longest: balls.reduce<SprayBall | null>((best, ball) => (!best || ball.feet > best.feet ? ball : best), null),
        traj: shares(TRAJS, balls.map((ball) => ball.traj)),
        dir: shares(DIRS, balls.map((ball) => ball.dir))
    };
};

/** Tiempos de la entrada: cada bola dura `dur` ms y sale `step` ms después de la anterior; todo en 2,5 s o menos */
export const entryTiming = (count: number, total = 2500, dur = 650) => ({ dur, step: count > 1 ? Math.min(90, (total - dur) / (count - 1)) : 0 });

/** «Repetir»: unos 700 ms por bola, 20 s como mucho en total */
export const replayStep = (count: number) => (count ? Math.min(700, 20000 / count) : 700);

export interface HeatCell {
    x: number;
    y: number;
    v: number;
}

/** Densidad de las caídas (núcleo gaussiano) en celdas de `cell` pies; v de 0 a 1 y solo las que se ven */
export const heatGrid = (points: Feet[], box: { minX: number; maxX: number; minY: number; maxY: number }, cell = 20, sigma = 30): HeatCell[] => {
    if (!points.length) return [];
    const cells: HeatCell[] = [];
    for (let y = box.minY + cell / 2; y < box.maxY; y += cell) {
        for (let x = box.minX + cell / 2; x < box.maxX; x += cell) {
            let v = 0;
            for (const p of points) v += Math.exp(-((p.x - x) ** 2 + (p.y - y) ** 2) / (2 * sigma * sigma));
            cells.push({ x, y, v });
        }
    }
    const max = Math.max(...cells.map((c) => c.v));
    return cells.map((c) => ({ ...c, v: c.v / max })).filter((c) => c.v >= 0.05);
};

// De frío a caliente
const RAMP = ['#3b82f6', '#22d3ee', '#a3e635', '#facc15', '#f97316', '#ef4444'];
/** Color del mapa de calor para v (0-1) */
export const heatColor = (v: number) => RAMP[Math.round(clamp(v, 0, 1) * (RAMP.length - 1))];
