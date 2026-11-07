// Mapa de batazos: la lógica pura (resultado de cada bola, por dónde voló visto desde arriba, filtros y números).
// Todo va en pies con home en (0, 0): +y hacia el center, +x hacia primera. Se prueba en spray.test.ts.
import type { AtBat, Pitch } from '../types';
import { gamedayToFeet, polar, wallAt, type Feet, type Park } from './flight';

export type SprayResult = 'single' | 'double' | 'triple' | 'hr' | 'error' | 'out';
export type SprayTraj = 'ground' | 'line' | 'fly' | 'popup';
export type SprayTeam = 'all' | 'away' | 'home';
export type SprayResultFilter = 'all' | 'hits' | 'hr' | 'outs';

/** Colores de cada resultado (el out es un aro hueco blanco) */
export const SPRAY_RESULT_COLORS: Record<SprayResult, string> = {
    single: '#3b82f6',
    double: '#a855f7',
    triple: '#facc15',
    hr: '#ef4444',
    error: '#fb923c',
    out: '#ffffff'
};

export interface SprayBall {
    key: number;
    order: number;
    atBat: AtBat;
    pitch: Pitch;
    side: 'away' | 'home';
    result: SprayResult;
    traj: SprayTraj;
    land: Feet;
    deg: number;
    /** Distancia medida (pies) o, si no la hay, la del punto marcado */
    dist: number;
    measured: number | null;
    ev: number | null;
    la: number | null;
    hard: string | null;
}

export const resultOf = (event: string | null | undefined): SprayResult => {
    if (event === 'single' || event === 'double' || event === 'triple') return event;
    if (event === 'home_run') return 'hr';
    if (event === 'field_error') return 'error';
    return 'out';
};

export const isHit = (result: SprayResult) => result === 'single' || result === 'double' || result === 'triple' || result === 'hr';

/** Tipo de batazo: el del anotador; si falta, por el ángulo de salida; si tampoco, por la distancia */
export const trajOf = (traj: string | null | undefined, la: number | null | undefined, dist: number): SprayTraj => {
    if (traj) {
        if (/ground/.test(traj)) return 'ground';
        if (/line/.test(traj)) return 'line';
        if (/popup/.test(traj)) return 'popup';
        if (/fly/.test(traj)) return 'fly';
    }
    if (la != null) return la < 10 ? 'ground' : la < 25 ? 'line' : la < 50 ? 'fly' : 'popup';
    return dist < 140 ? 'ground' : 'fly';
};

const RAD = Math.PI / 180;

/** Cada bola en juego del juego, en orden, ya en pies sobre el parque (el jonrón cae detrás de la cerca) */
export const sprayBalls = (atBats: AtBat[], park: Park): SprayBall[] => {
    const balls: SprayBall[] = [];
    for (const atBat of atBats) {
        const pitch = [...atBat.pitches].reverse().find((p) => p.r === 'inplay' && typeof p.hit?.x === 'number' && typeof p.hit?.y === 'number');
        if (!pitch?.hit) continue;
        const hit = pitch.hit;
        const spot = gamedayToFeet(hit.x as number, hit.y as number);
        const deg = Math.max(-46, Math.min(46, Math.atan2(spot.x, spot.y) / RAD));
        const result = resultOf(atBat.event);
        const measured = hit.dist && hit.dist > 0 ? hit.dist : null;
        let reach = Math.hypot(spot.x, spot.y);
        const wall = wallAt(park, deg);
        if (result === 'hr') reach = Math.min(wall + 40, Math.max(reach, measured ?? 0, wall + 14));
        else reach = Math.min(reach, wall - 4);
        balls.push({
            key: atBat.i,
            order: balls.length,
            atBat,
            pitch,
            side: atBat.top ? 'away' : 'home',
            result,
            traj: trajOf(hit.traj, hit.la, reach),
            land: polar(deg, reach),
            deg,
            dist: Math.round(measured ?? reach),
            measured,
            ev: hit.ev ?? null,
            la: hit.la ?? null,
            hard: hit.hard ?? null
        });
    }
    return balls;
};

export interface SprayFilters {
    team: SprayTeam;
    result: SprayResultFilter;
    traj: 'all' | SprayTraj;
    batter: number | null;
}

export const DEFAULT_FILTERS: SprayFilters = { team: 'all', result: 'all', traj: 'all', batter: null };

export const filterBalls = (balls: SprayBall[], filters: SprayFilters) =>
    balls.filter((ball) => {
        if (filters.team !== 'all' && ball.side !== filters.team) return false;
        if (filters.result === 'hits' && !isHit(ball.result)) return false;
        if (filters.result === 'hr' && ball.result !== 'hr') return false;
        if (filters.result === 'outs' && ball.result !== 'out') return false;
        if (filters.traj !== 'all' && ball.traj !== filters.traj) return false;
        if (filters.batter !== null && ball.atBat.batter.id !== filters.batter) return false;
        return true;
    });

export interface SprayBatter {
    id: number;
    name: string;
    side: 'away' | 'home';
    count: number;
}

/** Los que pusieron la bola en juego (con el filtro de equipo): primero el visitante, luego el que más bateó y por nombre */
export const sprayBatters = (balls: SprayBall[], team: SprayTeam): SprayBatter[] => {
    const map = new Map<number, SprayBatter>();
    for (const ball of balls) {
        if (team !== 'all' && ball.side !== team) continue;
        const row = map.get(ball.atBat.batter.id) ?? { id: ball.atBat.batter.id, name: ball.atBat.batter.name, side: ball.side, count: 0 };
        row.count += 1;
        map.set(row.id, row);
    }
    return [...map.values()].sort((a, b) => (a.side === b.side ? b.count - a.count || a.name.localeCompare(b.name) : a.side === 'away' ? -1 : 1));
};

/** Cambiar de equipo: el bateador escogido se queda solo si bateó por ese equipo */
export const withTeam = (balls: SprayBall[], filters: SprayFilters, team: SprayTeam): SprayFilters => ({
    ...filters,
    team,
    batter: filters.batter !== null && (team === 'all' || balls.some((ball) => ball.side === team && ball.atBat.batter.id === filters.batter)) ? filters.batter : null
});

const DEFAULT_LA: Record<SprayTraj, number> = { ground: 0, line: 14, fly: 32, popup: 62 };

export interface FlightPath {
    to: Feet;
    /** Punto de control de la curva (cuadrática); en el rodado es el punto medio (línea recta) */
    control: Feet;
    /** Piques del rodado */
    bounces: Feet[];
}

/**
 * Visto desde arriba la altura no se ve: se dibuja como una panza de lado (a la izquierda del recorrido) que crece con
 * el ángulo de salida. Rodado: recta con 2-3 piques.
 */
export const flightPath = (ball: Pick<SprayBall, 'land' | 'traj' | 'la'>): FlightPath => {
    const to = ball.land;
    const length = Math.hypot(to.x, to.y) || 1;
    const mid = { x: to.x / 2, y: to.y / 2 };
    if (ball.traj === 'ground') {
        const marks = length > 120 ? [0.32, 0.58, 0.8] : [0.4, 0.72];
        return { to, control: mid, bounces: marks.map((p) => ({ x: to.x * p, y: to.y * p })) };
    }
    const angle = Math.max(5, Math.min(65, ball.la != null && ball.la > 0 ? ball.la : DEFAULT_LA[ball.traj]));
    const bulge = Math.min(length * 0.55, (length * Math.tan(angle * RAD)) / 4);
    // Perpendicular a la izquierda del recorrido; el control a 2× la panza (la curva llega a la mitad)
    const nx = -to.y / length;
    const ny = to.x / length;
    return { to, control: { x: mid.x + nx * bulge * 2, y: mid.y + ny * bulge * 2 }, bounces: [] };
};

/** Pies a la caja SVG (y hacia abajo) */
export const svgPoint = (point: Feet) => ({ x: point.x, y: -point.y });

export const pathD = (path: FlightPath) => {
    const c = svgPoint(path.control);
    const t = svgPoint(path.to);
    return `M0 0 Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${t.x.toFixed(1)} ${t.y.toFixed(1)}`;
};

/** Radio del marcador (pies): crece un poco con la velocidad de salida */
export const markerRadius = (ball: Pick<SprayBall, 'ev' | 'result'>) => {
    const base = ball.ev != null ? 6.5 + Math.max(0, Math.min(1, (ball.ev - 70) / 40)) * 3.5 : 7.5;
    return ball.result === 'hr' ? base + 1 : base;
};

export type SprayZone = 'IF' | 'LF' | 'LCF' | 'CF' | 'RCF' | 'RF';
export const OUTFIELD_ZONES: Exclude<SprayZone, 'IF'>[] = ['LF', 'LCF', 'CF', 'RCF', 'RF'];

/** Cuadro (menos de 150 pies) o una de las cinco tajadas del jardín (18° cada una) */
export const zoneOf = (ball: Pick<SprayBall, 'land' | 'deg'>): SprayZone => {
    if (Math.hypot(ball.land.x, ball.land.y) < 150) return 'IF';
    const index = Math.max(0, Math.min(4, Math.floor((ball.deg + 45) / 18)));
    return OUTFIELD_ZONES[index];
};

export type SprayDir = 'pull' | 'center' | 'oppo';

/** Halado / centro / contrario: derecho hala al left, zurdo al right; el ambidiestro batea contra la mano del lanzador */
export const directionOf = (ball: Pick<SprayBall, 'deg' | 'atBat'>): SprayDir | null => {
    const side = ball.atBat.batter.side;
    const bats = side === 'S' ? (ball.atBat.pitcher.hand === 'L' ? 'R' : 'L') : side;
    if (bats !== 'L' && bats !== 'R') return null;
    if (Math.abs(ball.deg) <= 15) return 'center';
    const toLeft = ball.deg < 0;
    return (bats === 'R') === toLeft ? 'pull' : 'oppo';
};

export interface SprayStats {
    count: number;
    hits: number;
    hr: number;
    hardPct: number | null;
    avgEv: number | null;
    avgLa: number | null;
    longest: SprayBall | null;
    traj: Record<SprayTraj, number>;
    dir: Record<SprayDir, number> | null;
}

const pctOf = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

export const sprayStats = (balls: SprayBall[]): SprayStats => {
    const withEv = balls.filter((ball) => ball.ev != null);
    const withLa = balls.filter((ball) => ball.la != null);
    const measured = balls.filter((ball) => ball.measured != null);
    const dirs = balls.map(directionOf).filter((dir): dir is SprayDir => dir !== null);
    const trajCount = (traj: SprayTraj) => pctOf(balls.filter((ball) => ball.traj === traj).length, balls.length);
    const dirCount = (dir: SprayDir) => pctOf(dirs.filter((item) => item === dir).length, dirs.length);
    return {
        count: balls.length,
        hits: balls.filter((ball) => isHit(ball.result)).length,
        hr: balls.filter((ball) => ball.result === 'hr').length,
        hardPct: withEv.length ? pctOf(withEv.filter((ball) => (ball.ev as number) >= 95).length, withEv.length) : null,
        avgEv: withEv.length ? Math.round((withEv.reduce((sum, ball) => sum + (ball.ev as number), 0) / withEv.length) * 10) / 10 : null,
        avgLa: withLa.length ? Math.round(withLa.reduce((sum, ball) => sum + (ball.la as number), 0) / withLa.length) : null,
        longest: measured.length ? measured.reduce((top, ball) => ((ball.measured as number) > (top.measured as number) ? ball : top)) : null,
        traj: { ground: trajCount('ground'), line: trajCount('line'), fly: trajCount('fly'), popup: trajCount('popup') },
        dir: dirs.length ? { pull: dirCount('pull'), center: dirCount('center'), oppo: dirCount('oppo') } : null
    };
};

/** Entrada: cada bola sale tras la anterior y todo termina en 2,5 s como mucho */
export const ENTRY_FLIGHT_MS = 520;
export const ENTRY_TOTAL_MS = 2500;
export const entryStagger = (count: number) => (count > 1 ? Math.min(90, (ENTRY_TOTAL_MS - ENTRY_FLIGHT_MS - 350) / (count - 1)) : 0);

/** «Repetir»: ~700 ms por bola, todo en 20 s como mucho */
export const replayStep = (count: number) => (count ? Math.round(Math.min(700, 20000 / count)) : 700);

/** El dibujo del parque: la cerca muestreada cada 1,5° de poste a poste */
export const wallPoints = (park: Park, inset = 0) => {
    const points: Feet[] = [];
    for (let deg = -45; deg <= 45.001; deg += 1.5) points.push(polar(deg, wallAt(park, deg) - inset));
    return points;
};

export const fieldViewBox = (park: Park) => {
    const half = Math.max(park.left, park.right) * Math.sin(45 * RAD) + 48;
    const top = Math.max(park.center, park.leftCenter, park.rightCenter) + 52;
    return { x: -half, y: -top, w: half * 2, h: top + 26 };
};

export const ZONES: SprayZone[] = ['IF', 'LF', 'LCF', 'CF', 'RCF', 'RF'];

/** Cuántas bolas (y hits) cayeron en cada zona y su parte del total */
export const zoneStats = (balls: SprayBall[]) =>
    ZONES.map((zone) => {
        const inside = balls.filter((ball) => zoneOf(ball) === zone);
        return { zone, count: inside.length, hits: inside.filter((ball) => isHit(ball.result)).length, pct: pctOf(inside.length, balls.length) };
    });

/** Rejilla de calor: manchas gaussianas (σ 28 pies) en celdas de 12 pies, normalizada a 1 en lo más caliente */
export const heatGrid = (balls: Pick<SprayBall, 'land'>[], box: { x: number; y: number; w: number; h: number }, step = 12, sigma = 28) => {
    const cols = Math.ceil(box.w / step);
    const rows = Math.ceil(box.h / step);
    const values = new Array<number>(cols * rows).fill(0);
    const reach = sigma * 3;
    for (const ball of balls) {
        const p = svgPoint(ball.land);
        const c0 = Math.max(0, Math.floor((p.x - reach - box.x) / step));
        const c1 = Math.min(cols - 1, Math.ceil((p.x + reach - box.x) / step));
        const r0 = Math.max(0, Math.floor((p.y - reach - box.y) / step));
        const r1 = Math.min(rows - 1, Math.ceil((p.y + reach - box.y) / step));
        for (let r = r0; r <= r1; r++)
            for (let c = c0; c <= c1; c++) {
                const dx = box.x + (c + 0.5) * step - p.x;
                const dy = box.y + (r + 0.5) * step - p.y;
                values[r * cols + c] += Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
            }
    }
    const max = Math.max(0, ...values);
    return { cols, rows, step, x: box.x, y: box.y, values: max ? values.map((v) => v / max) : values };
};

const RAMP: [number, [number, number, number]][] = [
    [0, [59, 130, 246]],
    [0.3, [34, 211, 238]],
    [0.55, [250, 204, 21]],
    [0.8, [249, 115, 22]],
    [1, [220, 38, 38]]
];

/** Frío a caliente (azul, celeste, amarillo, naranja, rojo); más opaco donde hay más */
export const heatColor = (value: number) => {
    const v = Math.max(0, Math.min(1, value));
    let index = 1;
    while (index < RAMP.length - 1 && v > RAMP[index][0]) index++;
    const [a, ca] = RAMP[index - 1];
    const [b, cb] = RAMP[index];
    const p = (v - a) / (b - a || 1);
    const mix = ca.map((channel, n) => Math.round(channel + (cb[n] - channel) * p));
    return `rgb(${mix.join(' ')} / ${(0.25 + 0.6 * v).toFixed(2)})`;
};
