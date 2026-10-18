// Vuelo del batazo a escala para la animación del jonrón: hacia dónde salió y dónde cayó (las coordenadas que marca
// MLB en el cuadro de Gameday), cuánto voló (distancia de MLB) y qué tan alto (ángulo de salida), sobre el parque de
// verdad cuando MLB da sus medidas. Lógica pura: se prueba en lib.test.ts.
import type { AtBat } from '../types';

/** Pies con home en (0, 0): +y hacia el center, +x hacia el lado de primera (right) */
export interface Feet {
    x: number;
    y: number;
}

export interface Park {
    left: number;
    leftCenter: number;
    center: number;
    rightCenter: number;
    right: number;
    /** Alto de la cerca (pies) */
    wall: number;
    /** Medidas de MLB (si no, un parque genérico) */
    known: boolean;
}

// venue.fieldInfo de MLB para los parques de LIDOM que lo traen (Micheli y Julián Javier solo dan la capacidad)
const PARKS: { match: RegExp; left: number; center: number; right: number }[] = [
    { match: /quisqueya|marichal/i, left: 335, center: 411, right: 335 },
    { match: /cibao/i, left: 335, center: 385, right: 335 },
    { match: /tetelo/i, left: 330, center: 385, right: 330 }
];
const GENERIC = { left: 325, center: 400, right: 325 };

/** Medidas del parque por el nombre del estadio; los callejones no vienen y se estiman con la forma usual del abanico */
export const parkFor = (venue?: string | null): Park => {
    const found = PARKS.find((park) => park.match.test(venue ?? ''));
    const base = found ?? GENERIC;
    const alley = (line: number) => Math.round(line + (base.center - line) * 0.62);
    return { left: base.left, leftCenter: alley(base.left), center: base.center, rightCenter: alley(base.right), right: base.right, wall: 10, known: !!found };
};

const RAD = Math.PI / 180;

/** Punto a `dist` pies con ángulo en grados desde la línea home-center (negativo = lado del left) */
export const polar = (deg: number, dist: number): Feet => ({ x: Math.sin(deg * RAD) * dist, y: Math.cos(deg * RAD) * dist });

/** Distancia a la cerca en un ángulo, con una curva suave entre las medidas (línea, callejón, center) */
export const wallAt = (park: Park, deg: number) => {
    const marks: [number, number][] = [
        [-45, park.left],
        [-22.5, park.leftCenter],
        [0, park.center],
        [22.5, park.rightCenter],
        [45, park.right]
    ];
    const angle = Math.max(-45, Math.min(45, deg));
    for (let index = 1; index < marks.length; index++) {
        const [a1, d1] = marks[index - 1];
        const [a2, d2] = marks[index];
        if (angle <= a2) {
            const p = (angle - a1) / (a2 - a1);
            return d1 + (d2 - d1) * (1 - Math.cos(p * Math.PI)) / 2;
        }
    }
    return park.right;
};

/** Cuadro de Gameday (250 × 250, home ≈ 125.42, 198.27) a pies: la conversión usual de 2.5 pies por unidad */
export const gamedayToFeet = (x: number, y: number): Feet => ({ x: 2.5 * (x - 125.42), y: 2.5 * (198.27 - y) });

export interface Flight {
    /** Dónde cae (pies) y en qué ángulo salió (grados; negativo = left) */
    land: Feet;
    deg: number;
    /** Distancia que se dibuja: la medida por MLB o la del punto marcado */
    dist: number;
    /** Altura máxima (pies) */
    apex: number;
    /** Lo que mide MLB, si lo manda */
    ev: number | null;
    la: number | null;
    measured: number | null;
}

// Con el aire la bola sube más de lo que diría una parábola y cae más empinada: el pico va al 58 % del recorrido
const PEAK = 0.58;

/** El batazo del turno (el último pitcheo en juego con dónde cayó); null si MLB no marcó dónde */
export const flightOf = (atBat: Pick<AtBat, 'pitches'> | null | undefined): Flight | null => {
    const pitch = [...(atBat?.pitches ?? [])].reverse().find((item) => item.hit && item.hit.x != null && item.hit.y != null);
    const hit = pitch?.hit;
    if (!hit || hit.x == null || hit.y == null) return null;
    const spot = gamedayToFeet(hit.x, hit.y);
    const deg = Math.max(-50, Math.min(50, Math.atan2(spot.x, spot.y) / RAD));
    const measured = hit.dist && hit.dist > 0 ? hit.dist : null;
    const dist = Math.max(60, measured ?? Math.hypot(spot.x, spot.y));
    const la = hit.la ?? null;
    // Sin ángulo de salida, el de un elevado típico según la trayectoria
    const angle = la !== null ? Math.max(5, Math.min(60, la)) : /line/i.test(hit.traj ?? '') ? 18 : 28;
    const apex = Math.max(12, Math.min(180, dist * Math.tan(angle * RAD) * 0.45));
    return { land: polar(deg, dist), deg, dist, apex, ev: hit.ev ?? null, la, measured };
};

/** Duración del vuelo en la animación: 1.6 s a 300 pies y 2.4 s a 500 */
export const flightMs = (flight: Pick<Flight, 'dist'>) => Math.round(Math.max(1500, Math.min(2400, 1600 + (flight.dist - 300) * 4)));

/** Lo recorrido sobre el piso en el instante `t` (0-1 del tiempo): sale rápido y se frena con el aire */
export const groundAt = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 1.35);

/** Altura (pies) cuando lleva recorrida la parte `s` (0-1) de la distancia */
export const heightAt = (flight: Pick<Flight, 'apex'>, s: number) => {
    const p = Math.max(0, Math.min(1, s));
    const side = p < PEAK ? (p - PEAK) / PEAK : (p - PEAK) / (1 - PEAK);
    return flight.apex * (1 - side * side);
};

/** Parte del recorrido (0-1) en la que pasa la cerca; null si cae adentro */
export const wallCrossing = (flight: Pick<Flight, 'dist' | 'deg'>, park: Park) => {
    const wall = wallAt(park, flight.deg);
    return flight.dist > wall ? wall / flight.dist : null;
};

/**
 * Cámara detrás de home, como la de la transmisión: pasa pies (x, y, altura) a la caja SVG de `width` × `height`.
 * Encuadra el parque completo (de foul a foul, hasta el fondo) y deja aire arriba para el vuelo.
 */
export const camera = (park: Park, width: number, height: number) => {
    const deep = Math.max(park.center, park.leftCenter, park.rightCenter);
    // Un poco hacia primera, como la cámara de la transmisión: así hasta el batazo al center dibuja su curva
    const eye = { x: 0.09 * deep, y: -0.36 * deep, z: 0.25 * deep };
    const target = { x: 0, y: 0.62 * deep, z: 0 };
    const fx = target.x - eye.x;
    const fy = target.y - eye.y;
    const fz = target.z - eye.z;
    const fl = Math.hypot(fx, fy, fz);
    const forward = { x: fx / fl, y: fy / fl, z: fz / fl };
    // Derecha = adelante × vertical; arriba = derecha × adelante
    const rl = Math.hypot(forward.y, forward.x);
    const right = { x: forward.y / rl, y: -forward.x / rl, z: 0 };
    const up = { x: right.y * forward.z - right.z * forward.y, y: right.z * forward.x - right.x * forward.z, z: right.x * forward.y - right.y * forward.x };
    const raw = (x: number, y: number, z: number) => {
        const dx = x - eye.x;
        const dy = y - eye.y;
        const dz = z - eye.z;
        const depth = dx * forward.x + dy * forward.y + dz * forward.z;
        return { u: (dx * right.x + dy * right.y + dz * right.z) / depth, v: (dx * up.x + dy * up.y + dz * up.z) / depth, depth };
    };
    // Escala para que los dos postes de foul quepan a lo ancho, centrados
    const left = raw(polar(-45, park.left).x, polar(-45, park.left).y, 0);
    const rightPole = raw(polar(45, park.right).x, polar(45, park.right).y, 0);
    const focal = (width * 0.8) / (rightPole.u - left.u);
    const middle = (rightPole.u + left.u) / 2;
    const homeV = raw(0, 0, 0).v;
    const baseY = height * 0.93;
    return (x: number, y: number, z = 0) => {
        const point = raw(x, y, z);
        return { x: width / 2 + focal * (point.u - middle), y: baseY - focal * (point.v - homeV), depth: point.depth };
    };
};
