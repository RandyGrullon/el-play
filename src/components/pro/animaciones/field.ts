// Geometría del mini campo de las jugadas PRO (lógica pura, la misma de la web: el-play/.../animaciones/field.ts).
// Pies con home en (0, 0): +y hacia el center, +x hacia el lado de primera. El batazo cae donde lo marcó MLB
// (hit.x/y del cuadro de Gameday) y vuela la distancia medida (hit.dist) con la altura del ángulo de salida.
import type { Pitch } from '../../../types';

export interface FeetPoint {
    x: number;
    y: number;
}

/** Medidas del parque en pies (MLB venue.fieldInfo); sin ellas, un campo genérico */
export interface FieldSize {
    leftLine: number;
    leftCenter: number;
    center: number;
    rightCenter: number;
    rightLine: number;
}

export const GENERIC_FIELD: FieldSize = { leftLine: 325, leftCenter: 375, center: 400, rightCenter: 375, rightLine: 325 };

type MaybeField = { leftLine: number | null; leftCenter: number | null; center: number | null; rightCenter: number | null; rightLine: number | null } | null | undefined;

/**
 * Las medidas de MLB: completas (`real`), algunas (`partial`: las que faltan salen de las que hay, en la proporción del
 * campo genérico; el Quisqueya trae las líneas y el center pero no los callejones) o ninguna (`generic`).
 */
export const fieldOf = (field: MaybeField): { size: FieldSize; real: 'real' | 'partial' | 'generic' } => {
    const known = (['leftLine', 'leftCenter', 'center', 'rightCenter', 'rightLine'] as const).filter((key) => (field?.[key] ?? 0) > 0);
    if (!field || !known.length) return { size: GENERIC_FIELD, real: 'generic' };
    // Cuánto más grande (o chico) es este parque que el genérico, con lo que sí se sabe
    const ratio = known.reduce((sum, key) => sum + (field[key] as number) / GENERIC_FIELD[key], 0) / known.length;
    const value = (key: keyof FieldSize) => (field[key] && field[key]! > 0 ? field[key]! : Math.round(GENERIC_FIELD[key] * ratio));
    return {
        size: { leftLine: value('leftLine'), leftCenter: value('leftCenter'), center: value('center'), rightCenter: value('rightCenter'), rightLine: value('rightLine') },
        real: known.length === 5 ? 'real' : 'partial'
    };
};

const RAD = Math.PI / 180;
/** Punto a `dist` pies con ángulo en grados desde la línea home-center (negativo = lado del left) */
export const polarFeet = (deg: number, dist: number): FeetPoint => ({ x: Math.sin(deg * RAD) * dist, y: Math.cos(deg * RAD) * dist });

export const BASES_FT: Record<'home' | '1B' | '2B' | '3B', FeetPoint> = {
    home: { x: 0, y: 0 },
    '1B': polarFeet(45, 90),
    '2B': { x: 0, y: 127.3 },
    '3B': polarFeet(-45, 90)
};

/** Posiciones de siempre de los 9 a la defensa (1 lanzador … 9 right), para iluminar a quien hizo la jugada */
export const FIELDERS_FT: Record<number, FeetPoint> = {
    1: { x: 0, y: 60.5 },
    2: { x: 0, y: -5 },
    3: polarFeet(40, 108),
    4: polarFeet(17, 150),
    5: polarFeet(-40, 108),
    6: polarFeet(-17, 150),
    7: polarFeet(-28, 290),
    8: polarFeet(0, 315),
    9: polarFeet(28, 290)
};

/** La cerca: puntos de foul a foul (−45° … 45°) a la distancia de cada medida */
export const wallPoints = (size: FieldSize): FeetPoint[] => [
    polarFeet(-45, size.leftLine),
    polarFeet(-22.5, size.leftCenter),
    polarFeet(0, size.center),
    polarFeet(22.5, size.rightCenter),
    polarFeet(45, size.rightLine)
];

/** Distancia de la cerca en un ángulo (interpolada entre las medidas) */
export const wallAt = (size: FieldSize, deg: number) => {
    const marks: [number, number][] = [
        [-45, size.leftLine],
        [-22.5, size.leftCenter],
        [0, size.center],
        [22.5, size.rightCenter],
        [45, size.rightLine]
    ];
    const angle = Math.max(-45, Math.min(45, deg));
    for (let index = 1; index < marks.length; index++) {
        const [a1, d1] = marks[index - 1];
        const [a2, d2] = marks[index];
        if (angle <= a2) return d1 + ((angle - a1) / (a2 - a1)) * (d2 - d1);
    }
    return size.rightLine;
};

/** Cuadro de Gameday (250 × 250, home ≈ 125.42, 198.27) a pies: la conversión usual de 2.5 pies por unidad */
export const gamedayToFeet = (x: number, y: number): FeetPoint => ({ x: 2.5 * (x - 125.42), y: 2.5 * (198.27 - y) });

export interface BattedFlight {
    /** Dónde cae (pies) */
    land: FeetPoint;
    /** Distancia que se dibuja: la medida por MLB o la del punto marcado */
    dist: number;
    /** Ángulo de la línea home-center (grados; negativo = left) */
    deg: number;
    /** Velocidad de salida (mph), ángulo de salida (°) y distancia medida (pies), si MLB los manda */
    ev: number | null;
    la: number | null;
    measured: number | null;
    traj: string | null;
    /** Altura máxima aproximada (pies), según el ángulo de salida */
    apex: number;
    /** Rodado: va pegado al piso */
    ground: boolean;
}

/** El batazo del turno (el último pitcheo en juego con dónde cayó); null si MLB no marcó dónde */
export const battedFlight = (pitches: Pitch[]): BattedFlight | null => {
    const pitch = [...pitches].reverse().find((item) => item.hit && item.hit.x !== null && item.hit.x !== undefined && item.hit.y !== null && item.hit.y !== undefined);
    const hit = pitch?.hit;
    if (!hit || hit.x === null || hit.x === undefined || hit.y === null || hit.y === undefined) return null;
    const spot = gamedayToFeet(hit.x, hit.y);
    const deg = Math.max(-50, Math.min(50, Math.atan2(spot.x, spot.y) / RAD));
    const marked = Math.hypot(spot.x, spot.y);
    const measured = hit.dist && hit.dist > 0 ? hit.dist : null;
    const dist = Math.max(20, measured ?? marked);
    const la = hit.la ?? null;
    const traj = hit.traj ?? null;
    const ground = (la !== null && la < 8) || /ground|bunt_grounder/i.test(traj ?? '');
    // Tiro parabólico: altura máxima ≈ distancia · tan(ángulo) / 4 (sin el ángulo, una curva media según la trayectoria)
    const angle = la !== null ? Math.max(0, Math.min(70, la)) : /popup/i.test(traj ?? '') ? 60 : /fly/i.test(traj ?? '') ? 32 : /line/i.test(traj ?? '') ? 14 : 0;
    const apex = ground ? 0 : (dist * Math.tan(angle * RAD)) / 4;
    return { land: polarFeet(deg, dist), dist, deg, ev: hit.ev ?? null, la, measured, traj, apex, ground };
};

/** Duración del vuelo: 1.2 s a 250 pies y 2.0 s a 408 (los rodados, más cortos) */
export const flightMs = (flight: Pick<BattedFlight, 'dist' | 'ground'>) => {
    if (flight.ground) return Math.round(Math.max(450, Math.min(1000, 380 + flight.dist * 3)));
    return Math.round(Math.max(700, Math.min(2100, 1200 + ((flight.dist - 250) * 800) / 158)));
};

/** Posición del batazo en el instante `t` (0-1): sobre el piso y su altura (pies) */
export const flightAt = (flight: Pick<BattedFlight, 'land' | 'apex' | 'ground'>, t: number) => {
    const p = Math.max(0, Math.min(1, t));
    // En el aire avanza parejo; el rodado sale rápido y se va frenando
    const eased = flight.ground ? 1 - (1 - p) * (1 - p) : p;
    const ground = { x: flight.land.x * eased, y: flight.land.y * eased };
    const height = flight.ground ? Math.abs(Math.sin(p * Math.PI * 3)) * 4 * (1 - p) : 4 * flight.apex * p * (1 - p);
    return { ...ground, height };
};

/** Si la bola pasa la cerca, en qué instante (0-1) la cruza; null si cae adentro */
export const wallCrossing = (flight: Pick<BattedFlight, 'dist' | 'deg'>, size: FieldSize) => {
    const wall = wallAt(size, flight.deg);
    return flight.dist > wall ? wall / flight.dist : null;
};

export interface Viewport {
    /** Esquina de arriba a la izquierda y tamaño, en pies */
    minX: number;
    maxY: number;
    width: number;
    height: number;
}

/** Lo que se ve: todo el parque si la bola sale del cuadro; si no, el cuadro de cerca */
export const viewportFor = (size: FieldSize, flight: Pick<BattedFlight, 'land' | 'apex'> | null, aspect: number): Viewport => {
    const outfield = !!flight && (Math.hypot(flight.land.x, flight.land.y) > 150 || flight.apex > 40);
    if (!outfield) {
        // Cuadro: de tercera a primera y de home a un poco más allá de segunda
        const height = 165;
        const width = Math.max(240, height * aspect);
        return { minX: -width / 2, maxY: 150, width, height };
    }
    const deep = Math.max(size.center, size.leftCenter, size.rightCenter, flight ? flight.land.y : 0) + 25;
    const side = Math.max(size.leftLine, size.rightLine, flight ? Math.abs(flight.land.x) / Math.sin(45 * RAD) : 0) * Math.sin(45 * RAD) + 20;
    const height = deep + 18;
    const width = Math.max(side * 2, height * aspect);
    return { minX: -width / 2, maxY: deep, width, height: Math.max(height, width / aspect) };
};

/** De pies a la caja SVG (ancho × alto en px) */
export const projector = (view: Viewport, boxWidth: number, boxHeight: number) => {
    const scale = Math.min(boxWidth / view.width, boxHeight / view.height);
    const offsetX = (boxWidth - view.width * scale) / 2;
    const offsetY = (boxHeight - view.height * scale) / 2;
    return {
        scale,
        x: (feet: number) => offsetX + (feet - view.minX) * scale,
        y: (feet: number) => offsetY + (view.maxY - feet) * scale
    };
};

/** Base a pies ('score' es home) */
export const basePoint = (base: string | null | undefined): FeetPoint => {
    if (base === '1B' || base === '2B' || base === '3B') return BASES_FT[base];
    return BASES_FT.home;
};

const ORDER = ['home', '1B', '2B', '3B', 'score'];

/** Bases que recorre un corredor (incluidas la de salida y la de llegada), para ir base a base */
export const runnerPath = (from: string | null | undefined, to: string | null | undefined): FeetPoint[] => {
    const start = Math.max(0, ORDER.indexOf(from || 'home'));
    const end = to ? ORDER.indexOf(to) : start;
    if (end <= start) return [basePoint(ORDER[start])];
    return ORDER.slice(start, end + 1).map((base) => basePoint(base));
};
