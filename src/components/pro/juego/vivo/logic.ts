// Lógica pura del juego en vivo y la zona de strike del modo PRO (parte «vivo»). Es la misma de la web
// (el-play/src/lib/pro/vivo.ts): todo sale de lo que MLB manda (GameDetail + /api/v2/game/:pk/pro + /winprob); si
// falta un dato se devuelve null y la pantalla no lo pinta.
import { useQuery } from '@tanstack/react-query';
import type { AtBat, GameDetail, LeagueId, Pitch } from '../../../../types';
import type { GamePro, ProPitch, ProPlay, WinProb } from '../../../../lib/pro/juego';
import { HOUR, calmOn404, getPro, queryString, retryUnless } from '../../../../lib/pro/http';
import { usePlayer, type PlayerDetail } from '../../../../lib/stats';

// ---------------------------------------------------------------- Swings y abanicados

// Una sola regla para la zona, el repertorio y los lanzadores: abanicado = swing sin contacto (S, W, M, Q);
// swing = abanicado + foul + en juego
const WHIFF_CODES = new Set(['S', 'W', 'M', 'Q']);
const CONTACT_CODES = new Set(['F', 'T', 'L', 'O', 'R', 'X', 'D', 'E']);

export const isWhiff = (pitch: Pick<Pitch, 'code'>) => !!pitch.code && WHIFF_CODES.has(pitch.code);
export const isSwing = (pitch: Pick<Pitch, 'code'>) => !!pitch.code && (WHIFF_CODES.has(pitch.code) || CONTACT_CODES.has(pitch.code));
/** Strike de cualquier tipo (cantado, tirándole, foul) o bola en juego: los «strikes» del lanzador para MLB */
export const isStrike = (pitch: Pick<Pitch, 'r'>) => pitch.r === 'strike' || pitch.r === 'inplay';

/** Conteo ANTES del pitcheo k (Pitch.b/s es el conteo después de cada pitcheo) */
export const countBefore = (pitches: Pick<Pitch, 'b' | 's'>[], k: number) => {
    if (k <= 0) return { balls: 0, strikes: 0 };
    const previous = pitches[k - 1];
    return { balls: previous?.b ?? 0, strikes: previous?.s ?? 0 };
};

// ---------------------------------------------------------------- Pitcheos con sus extras PRO

/** Un pitcheo del Lite con su ficha PRO (mismo índice en ProPlay.pitches) y el turno donde ocurrió */
export interface PitchItem {
    pitch: Pitch;
    pro: ProPitch | null;
    atBat: AtBat;
    /** Posición dentro del turno (0 = primero) */
    k: number;
}

const playMap = (pro: GamePro | undefined) => new Map((pro?.plays ?? []).map((play) => [play.i, play]));

/**
 * Quiebre horizontal visto desde el receptor (positivo = hacia primera), como pfx_x de Statcast. MLB manda
 * breakHorizontal al revés (positivo = hacia tercera): la sinker de un derecho trae +15 y aquí sale −15.
 */
export const hbView = (pitch: Pick<ProPitch, 'hb'> | null | undefined) => (typeof pitch?.hb === 'number' ? -pitch.hb : null);

/** Pitcheos de una lista de turnos, cada uno con su ficha PRO si llegó */
export const pitchItems = (atBats: AtBat[], pro: GamePro | undefined, filter?: (atBat: AtBat) => boolean): PitchItem[] => {
    const plays = playMap(pro);
    return atBats
        .filter((atBat) => !filter || filter(atBat))
        .flatMap((atBat) => {
            const play = plays.get(atBat.i);
            return atBat.pitches.map((pitch, k) => ({ pitch, pro: play?.pitches[k] ?? null, atBat, k }));
        });
};

const mean = (values: (number | null | undefined)[]) => {
    const list = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
};

/** Dispersión (para el halo de la nube de movimiento): raíz del promedio de distancias al centro */
const spread = (points: { x: number; y: number }[], cx: number, cy: number) =>
    points.length > 1 ? Math.sqrt(points.reduce((sum, point) => sum + (point.x - cx) ** 2 + (point.y - cy) ** 2, 0) / points.length) : 0;

export interface TypeMixRow {
    type: string;
    count: number;
    /** 0-1 del total */
    share: number;
    avgMph: number | null;
    maxMph: number | null;
    avgEnd: number | null;
    avgSpin: number | null;
    ivb: number | null;
    /** Quiebre horizontal promedio, visto desde el receptor (hbView) */
    hb: number | null;
    /** Dispersión del movimiento (pulgadas) */
    spread: number | null;
    strikes: number;
    swings: number;
    whiffs: number;
}

/** Mezcla por tipo de pitcheo, de más a menos usado (sin tipo: «??») */
export const typeMix = (items: Pick<PitchItem, 'pitch' | 'pro'>[]): TypeMixRow[] => {
    const groups = new Map<string, Pick<PitchItem, 'pitch' | 'pro'>[]>();
    for (const item of items) {
        const key = item.pitch.type || '??';
        groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()]
        .map(([type, list]) => {
            const speeds = list.map((item) => item.pitch.mph).filter((mph): mph is number => typeof mph === 'number');
            const moves = list.filter((item) => typeof item.pro?.ivb === 'number' && typeof item.pro?.hb === 'number').map((item) => ({ x: hbView(item.pro) as number, y: item.pro!.ivb as number }));
            const ivb = mean(moves.map((point) => point.y));
            const hb = mean(moves.map((point) => point.x));
            return {
                type,
                count: list.length,
                share: items.length ? list.length / items.length : 0,
                avgMph: mean(speeds),
                maxMph: speeds.length ? Math.max(...speeds) : null,
                avgEnd: mean(list.map((item) => item.pro?.end)),
                avgSpin: mean(list.map((item) => item.pitch.spin)),
                ivb,
                hb,
                spread: ivb !== null && hb !== null ? spread(moves, hb, ivb) : null,
                strikes: list.filter((item) => isStrike(item.pitch)).length,
                swings: list.filter((item) => isSwing(item.pitch)).length,
                whiffs: list.filter((item) => isWhiff(item.pitch)).length
            };
        })
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
};

/** Cuántos de cada tipo: [{ type, count }] de más a menos */
const tally = (types: (string | null)[]) => {
    const counts = new Map<string, number>();
    for (const type of types) counts.set(type || '??', (counts.get(type || '??') ?? 0) + 1);
    return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
};

/** Uso por conteo: el primer pitcheo de cada turno y los pitcheos con 2 strikes */
export const usageByCount = (atBats: AtBat[]) => {
    const firsts = atBats.filter((atBat) => atBat.pitches.length > 0).map((atBat) => atBat.pitches[0].type);
    const twoStrikes = atBats.flatMap((atBat) => atBat.pitches.filter((_, k) => countBefore(atBat.pitches, k).strikes === 2).map((pitch) => pitch.type));
    return { first: { total: firsts.length, types: tally(firsts) }, twoStrikes: { total: twoStrikes.length, types: tally(twoStrikes) } };
};

// ---------------------------------------------------------------- Velocidad de la recta

const FASTBALLS = ['FF', 'SI', 'FT', 'FA'];

/** El tipo de recta más usado por el lanzador (FF, SI, FT, FA; si no tira ninguna, el cutter) */
export const mainFastball = (items: Pick<PitchItem, 'pitch'>[]) => {
    const counts = tally(items.map((item) => item.pitch.type)).filter((row) => FASTBALLS.includes(row.type));
    if (counts.length) return counts[0].type;
    return items.some((item) => item.pitch.type === 'FC') ? 'FC' : null;
};

/**
 * Velocidad de la recta principal por número de pitcheo del lanzador, y cuánto cambió entre la primera y la
 * última entrada en que la tiró (null si solo lanzó una entrada o no hay velocidades).
 */
export const fastballTrend = (items: Pick<PitchItem, 'pitch' | 'atBat'>[]) => {
    const type = mainFastball(items);
    if (!type) return null;
    const points = items
        .map((item, index) => ({ n: index + 1, mph: item.pitch.mph, inning: item.atBat.inning, type: item.pitch.type }))
        .filter((point): point is { n: number; mph: number; inning: number; type: string } => point.type === type && typeof point.mph === 'number');
    if (!points.length) return null;
    const innings = [...new Set(points.map((point) => point.inning))];
    const first = mean(points.filter((point) => point.inning === innings[0]).map((point) => point.mph));
    const last = mean(points.filter((point) => point.inning === innings[innings.length - 1]).map((point) => point.mph));
    const delta = innings.length > 1 && first !== null && last !== null ? Math.round((last - first) * 10) / 10 : null;
    return { type, points: points.map(({ n, mph }) => ({ n, mph })), firstInning: innings[0], lastInning: innings[innings.length - 1], delta, firstAvg: first };
};

// ---------------------------------------------------------------- Zona en palabras

export type ZoneRow = 'high' | 'mid' | 'low';
export type ZoneCol = 'in' | 'mid' | 'out' | 'left' | 'right';

/** Lugar del pitcheo: fila, columna (adentro/afuera según la mano del bateador) y si cayó en la zona */
export interface ZonePlace {
    row: ZoneRow;
    col: ZoneCol;
    inZone: boolean;
    /** Zona 5: el corazón */
    heart: boolean;
}

/**
 * Zona de MLB (vista del receptor: 1 arriba a la izquierda, 11-14 las esquinas de afuera) a palabras.
 * La izquierda del receptor es el lado de tercera: para un derecho eso es «adentro»; para un zurdo, «afuera».
 */
export const zonePlace = (zone: number | null | undefined, batterSide: string | null | undefined): ZonePlace | null => {
    if (!zone) return null;
    let row: ZoneRow;
    let left: boolean | null;
    if (zone >= 1 && zone <= 9) {
        row = zone <= 3 ? 'high' : zone <= 6 ? 'mid' : 'low';
        const col = (zone - 1) % 3;
        left = col === 0 ? true : col === 2 ? false : null;
    } else if (zone >= 11 && zone <= 14) {
        row = zone <= 12 ? 'high' : 'low';
        left = zone === 11 || zone === 13;
    } else return null;
    const side = batterSide === 'L' || batterSide === 'R' ? batterSide : null;
    const col: ZoneCol = left === null ? 'mid' : !side ? (left ? 'left' : 'right') : (side === 'R') === left ? 'in' : 'out';
    return { row, col, inZone: zone <= 9, heart: zone === 5 };
};

/** Zona 1-9 / 11-14 desde la ubicación (pies) cuando MLB no la manda (pitcheo marcado por el anotador) */
export const zoneFromLocation = (x: number | null, z: number | null, top: number | null, bot: number | null): number | null => {
    if (x === null || z === null || top === null || bot === null || !(top > bot)) return null;
    const half = 17 / 24;
    const inside = Math.abs(x) <= half && z >= bot && z <= top;
    if (inside) {
        const col = Math.min(2, Math.floor((x + half) / ((half * 2) / 3)));
        const row = Math.min(2, Math.floor((top - z) / ((top - bot) / 3)));
        return row * 3 + col + 1;
    }
    const high = z > (top + bot) / 2;
    const left = x < 0;
    return high ? (left ? 11 : 12) : left ? 13 : 14;
};

/** Eje del giro en reloj: 180° = 6:00, 218° ≈ 7:15 (redondeado al cuarto de hora, como Statcast) */
export const spinClock = (degrees: number | null | undefined) => {
    if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return null;
    const minutes = Math.round(((((degrees % 360) + 360) % 360) * 2) / 15) * 15;
    const hours = Math.floor(minutes / 60) % 12 || 12;
    return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- Resultado de cada turno

const HIT_CODES: Record<string, string> = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' };

/** Bateador en la jugada (el corredor sin base de salida) */
const batterRunner = (play: ProPlay | undefined) => play?.runners.find((runner) => !runner.from);

/** Notación del anotador con las posiciones: «6-3», «F8», «L6», «3U», o null si no llegaron los créditos */
export const fieldingNotation = (atBat: Pick<AtBat, 'event' | 'pitches'>, play: ProPlay | undefined) => {
    const runner = batterRunner(play);
    const credits = (runner?.credits ?? []).filter((credit) => credit.pos && (credit.c === 'f_assist' || credit.c === 'f_putout'));
    if (!credits.length) return null;
    const traj = [...atBat.pitches].reverse().find((pitch) => pitch.r === 'inplay')?.hit?.traj ?? '';
    if (credits.length === 1) {
        const pos = credits[0].pos;
        if (/fly/.test(traj)) return `F${pos}`;
        if (/line/.test(traj)) return `L${pos}`;
        if (/pop/.test(traj)) return `P${pos}`;
        return `${pos}U`;
    }
    return credits.map((credit) => credit.pos).join('-');
};

/**
 * Código corto de un turno para los chips del bateador: K, BB, 1B, 2B, HR, GP (golpeado), E6, 6-3, F8…
 * `hbp` es el texto del golpeado en el idioma (GP en español, HBP en inglés). null si el turno no terminó.
 */
export const paCode = (atBat: AtBat, play: ProPlay | undefined, hbp = 'GP') => {
    if (!atBat.complete || !atBat.event) return null;
    const event = atBat.event;
    if (event.startsWith('strikeout')) return 'K';
    if (event === 'walk') return 'BB';
    if (event === 'intent_walk') return 'BBI';
    if (event === 'hit_by_pitch') return hbp;
    if (HIT_CODES[event]) return HIT_CODES[event];
    if (event === 'field_error') {
        const error = batterRunner(play)?.credits?.find((credit) => /error/.test(credit.c ?? ''));
        return error?.pos ? `E${error.pos}` : 'E';
    }
    const notation = fieldingNotation(atBat, play);
    if (event === 'sac_fly') return notation ? `SF${notation.replace(/^F/, '')}` : 'SF';
    if (event === 'sac_bunt') return 'SH';
    if (event.startsWith('fielders_choice')) return notation ? `FC ${notation}` : 'FC';
    return notation;
};

/** Tono del chip de un turno: hit (verde), walk (acento), out (neutro) */
export const paTone = (event: string | null): 'hit' | 'walk' | 'out' => {
    if (!event) return 'out';
    if (HIT_CODES[event]) return 'hit';
    if (['walk', 'intent_walk', 'hit_by_pitch'].includes(event)) return 'walk';
    return 'out';
};

// ---------------------------------------------------------------- Pizarra por entradas

export interface BoardCell {
    n: number;
    r: number | null;
    h: number | null;
    e: number | null;
    lob: number | null;
}

/** Pizarra con H/E/LOB por entrada (del PRO) o solo carreras (del Lite) mientras llega */
export const boardRows = (game: Pick<GameDetail, 'linescore' | 'scheduledInnings'>, pro: GamePro | undefined) => {
    const source = pro?.linescore?.length ? pro.linescore : null;
    const innings = Math.max(game.scheduledInnings || 9, source?.length ?? 0, game.linescore.length);
    const cell = (side: 'away' | 'home', n: number): BoardCell => {
        const full = source?.find((inning) => inning.n === n)?.[side];
        if (full) return { n, r: full.r, h: full.h, e: full.e, lob: full.lob };
        const lite = game.linescore.find((inning) => inning.n === n);
        return { n, r: lite ? lite[side] : null, h: null, e: null, lob: null };
    };
    const range = Array.from({ length: innings }, (_, index) => index + 1);
    return { innings, detailed: !!source, away: range.map((n) => cell('away', n)), home: range.map((n) => cell('home', n)) };
};

/** Errores del juego con quién y de qué tipo (tiro o fildeo), por entrada: salen de los créditos de cada jugada */
export const gameErrors = (atBats: AtBat[], pro: GamePro | undefined) => {
    const plays = playMap(pro);
    const list: { inning: number; top: boolean; player: number; pos: number | null; kind: 'throw' | 'field' }[] = [];
    const seen = new Set<string>();
    for (const atBat of atBats) {
        for (const runner of plays.get(atBat.i)?.runners ?? []) {
            for (const credit of runner.credits ?? []) {
                if (!credit.id || !/error/.test(credit.c ?? '')) continue;
                const key = `${atBat.i}-${credit.id}-${credit.c}`;
                if (seen.has(key)) continue;
                seen.add(key);
                list.push({ inning: atBat.inning, top: atBat.top, player: credit.id, pos: credit.pos, kind: credit.c === 'f_throwing_error' ? 'throw' : 'field' });
            }
        }
    }
    return list;
};

// ---------------------------------------------------------------- Probabilidad de ganar

/** Presión alta: índice de presión (leverage) de 2 o más */
export const PRESSURE_MIN = 2;
export const highPressure = (li: number | null | undefined) => typeof li === 'number' && li >= PRESSURE_MIN;

/**
 * Puntos de la gráfica en «entradas»: la 1.ª ocupa [0, 1), la alta su primera mitad y la baja la segunda; las
 * jugadas de cada mitad se reparten dentro. Así el eje dice 1-9 y queda el espacio de lo que falta por jugar.
 */
export const winProbPoints = (winProb: WinProb | undefined) => {
    const plays = winProb?.plays ?? [];
    const halves = new Map<string, number[]>();
    plays.forEach((play, index) => {
        const key = `${play.inning ?? 0}-${play.top ? 0 : 1}`;
        halves.set(key, [...(halves.get(key) ?? []), index]);
    });
    const xs = plays.map((play, index) => {
        const key = `${play.inning ?? 0}-${play.top ? 0 : 1}`;
        const list = halves.get(key) ?? [index];
        const order = list.indexOf(index);
        const start = Math.max(0, (play.inning ?? 1) - 1) + (play.top ? 0 : 0.5);
        // Siempre dentro de su media entrada (la última jugada de la alta no cae sobre la baja)
        return start + (0.5 * (order + 1)) / (list.length + 1);
    });
    // MLB no da la probabilidad de antes del primer pitcheo: la línea empieza en la primera jugada
    const points = plays.map((play, index) => ({ x: xs[index], top: 100 - play.home }));
    const xOf = new Map(plays.map((play, index) => [play.i, xs[index]]));
    return { points, xOf };
};

export interface KeyPlay {
    i: number;
    rank: number;
    /** Puntos de probabilidad que ganó el equipo beneficiado (siempre positivo) */
    gain: number;
    side: 'away' | 'home';
    li: number | null;
    /** Probabilidad del visitante después de la jugada */
    top: number;
    atBat: AtBat | null;
}

/** Las 3 jugadas de mayor WPA (MLB las da en `key`), con a quién favorecieron */
export const keyPlays = (winProb: WinProb | undefined, atBats: AtBat[]): KeyPlay[] =>
    (winProb?.key ?? []).flatMap((i, rank) => {
        const play = winProb?.plays.find((item) => item.i === i);
        if (!play) return [];
        return [{ i, rank: rank + 1, gain: Math.abs(play.wpa), side: play.wpa >= 0 ? 'home' : 'away', li: play.li, top: 100 - play.home, atBat: atBats.find((atBat) => atBat.i === i) ?? null }];
    });

/** Bases ocupadas al empezar la jugada (la primera base de salida de cada corredor que no es el bateador) */
export const basesBefore = (play: ProPlay | undefined): ('first' | 'second' | 'third')[] => {
    const seen = new Set<number>();
    const bases = new Set<string>();
    for (const runner of play?.runners ?? []) {
        if (!runner.from || runner.id === undefined || seen.has(runner.id)) continue;
        seen.add(runner.id);
        bases.add(runner.from);
    }
    return (['first', 'second', 'third'] as const).filter((base) => bases.has({ first: '1B', second: '2B', third: '3B' }[base]));
};

/** Probabilidad del equipo `side` antes de la jugada `i` (la de la jugada anterior); null en la primera */
export const probBefore = (winProb: WinProb | undefined, i: number, side: 'away' | 'home') => {
    const plays = winProb?.plays ?? [];
    const index = plays.findIndex((play) => play.i === i);
    if (index <= 0) return null;
    const home = plays[index - 1].home;
    return side === 'home' ? home : 100 - home;
};

// ---------------------------------------------------------------- Vuelo del pitcheo

/** Distancia (pies) del frente del plato al punto y = 0 de MLB (la punta de atrás del plato) */
export const PLATE_FRONT = 17 / 12;

export interface FlightPoint {
    t: number;
    x: number;
    y: number;
    z: number;
}

type FlightPitch = ProPitch & { x0: number; z0: number; vx0: number; vy0: number; vz0: number; ax: number; ay: number; az: number };

/** El pitcheo trae todo lo necesario para dibujar su vuelo */
export const hasFlight = (pitch: ProPitch | null | undefined): pitch is FlightPitch =>
    !!pitch && [pitch.x0, pitch.z0, pitch.vx0, pitch.vy0, pitch.vz0, pitch.ax, pitch.ay, pitch.az].every((value) => typeof value === 'number' && Number.isFinite(value));

/** Momento (s, desde y = 50 pies) en que la bola llega a la distancia `y` del plato */
const timeAt = (pitch: FlightPitch, y: number) => {
    const a = 0.5 * pitch.ay;
    const b = pitch.vy0;
    const c = 50 - y;
    if (Math.abs(a) < 1e-9) return -c / b;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    // vy0 es negativo (hacia el plato): la raíz que sirve es la de menor valor absoluto
    const roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)];
    return roots.reduce((best, root) => (Math.abs(root) < Math.abs(best) ? root : best));
};

/**
 * Trayectoria con la física de MLB (posición inicial a 50 pies, velocidad y aceleración constantes) desde la
 * salida de la mano (60.5 − extensión) hasta el frente del plato.
 */
export const flightPath = (pitch: ProPitch, steps = 24): FlightPoint[] | null => {
    if (!hasFlight(pitch)) return null;
    const release = 60.5 - (typeof pitch.ext === 'number' ? pitch.ext : 6);
    const t0 = timeAt(pitch, release);
    const t1 = timeAt(pitch, PLATE_FRONT);
    if (t0 === null || t1 === null || !(t1 > t0)) return null;
    return Array.from({ length: steps + 1 }, (_, index) => {
        const t = t0 + ((t1 - t0) * index) / steps;
        return {
            t: t - t0,
            x: pitch.x0 + pitch.vx0 * t + 0.5 * pitch.ax * t * t,
            y: 50 + pitch.vy0 * t + 0.5 * pitch.ay * t * t,
            z: pitch.z0 + pitch.vz0 * t + 0.5 * pitch.az * t * t
        };
    });
};

/** Posición del vuelo a la distancia `y` del plato (interpolada) */
const atDistance = (path: FlightPoint[], y: number) => {
    for (let index = 1; index < path.length; index++) {
        const a = path[index - 1];
        const b = path[index];
        if ((a.y - y) * (b.y - y) <= 0) {
            const f = a.y === b.y ? 0 : (a.y - y) / (a.y - b.y);
            return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
        }
    }
    return null;
};

/**
 * Túnel: a cuántos pies del plato dos pitcheos se separan más de `threshold` pies (4 pulgadas por defecto).
 * null si ya salen separados de la mano o no se separan nunca.
 */
export const tunnelSplit = (a: FlightPoint[], b: FlightPoint[], threshold = 4 / 12) => {
    const from = Math.min(a[0].y, b[0].y);
    const pa0 = atDistance(a, from);
    const pb0 = atDistance(b, from);
    const start = pa0 && pb0 ? Math.hypot(pa0.x - pb0.x, pa0.z - pb0.z) : null;
    if (start === null || start > threshold) return null;
    for (let y = from; y >= PLATE_FRONT; y -= 0.5) {
        const pa = atDistance(a, y);
        const pb = atDistance(b, y);
        if (pa && pb && Math.hypot(pa.x - pb.x, pa.z - pb.z) > threshold) return Math.round(y);
    }
    return null;
};

// ---------------------------------------------------------------- Peloteros

/** País de nacimiento corto (MLB lo manda en inglés): «Dominican Republic» → «RD» */
const COUNTRIES: Record<string, [string, string]> = {
    'Dominican Republic': ['RD', 'DR'],
    Venezuela: ['VEN', 'VEN'],
    Cuba: ['CUB', 'CUB'],
    USA: ['EE. UU.', 'USA'],
    'United States': ['EE. UU.', 'USA'],
    'Puerto Rico': ['PR', 'PR'],
    Mexico: ['MEX', 'MEX'],
    Colombia: ['COL', 'COL'],
    Panama: ['PAN', 'PAN'],
    Nicaragua: ['NCA', 'NCA'],
    Haiti: ['HAI', 'HAI'],
    Curacao: ['CUR', 'CUR'],
    'Curaçao': ['CUR', 'CUR'],
    Aruba: ['ARU', 'ARU'],
    Bahamas: ['BAH', 'BAH'],
    Japan: ['JPN', 'JPN'],
    'South Korea': ['KOR', 'KOR'],
    Canada: ['CAN', 'CAN'],
    Brazil: ['BRA', 'BRA'],
    Australia: ['AUS', 'AUS']
};

export const countryShort = (country: string | null | undefined, lang: string) => {
    if (!country) return null;
    const known = COUNTRIES[country];
    return known ? known[lang.startsWith('en') ? 1 : 0] : country;
};

/** Nombre corto de los equipos de LIDOM para el texto corrido («Licey», «Escogido»); fuera de LIDOM, el del club */
const LIDOM_SHORT: Record<string, string> = { LIC: 'Licey', ESC: 'Escogido', AGU: 'Águilas', EST: 'Estrellas', TOR: 'Toros', GIG: 'Gigantes' };
export const teamShortName = (team: { abbrev: string; name: string; teamName?: string }) => LIDOM_SHORT[team.abbrev] ?? team.teamName ?? team.name;

// ---------------------------------------------------------------- Temporada del duelo

/**
 * Contexto de temporada de un pelotero para el duelo: juegos de esta temporada ANTES de hoy y la línea de la
 * temporada anterior (para decir «Es su 1.er juego» y mostrar la de 2025-26 en vez de una muestra de 3 turnos).
 */
export const seasonContext = (player: Pick<PlayerDetail, 'season' | 'log' | 'career'> | undefined, gamePk: number | null) => {
    if (!player) return null;
    const before = player.log.filter((row) => row.gamePk !== gamePk).length;
    const previous = player.career.find((row) => row.season === player.season - 1) ?? null;
    return { season: player.season, gamesBefore: before, previous };
};

/** Ficha de temporada del pelotero (ruta del Lite /api/v2/player/:id) reducida al contexto del duelo */
export const useSeasonContext = (personId: number | null | undefined, league: LeagueId, gamePk: number | null, enabled = true) => {
    const query = usePlayer(enabled && personId ? personId : null, league);
    return seasonContext(query.data, gamePk);
};

// ---------------------------------------------------------------- Parque

/**
 * Distancias de la cerca para el mapa de batazos: [línea izquierda, izquierda-central, central, derecha-central,
 * línea derecha] en pies. Sin las líneas o el central (Micheli y Julián Javier no las tienen en MLB) → null y se
 * dibuja un jardín genérico. Los entre-jardines que falten se dibujan a medio camino.
 */
export const fenceDistances = (field: { leftLine: number | null; leftCenter: number | null; center: number | null; rightCenter: number | null; rightLine: number | null } | null) => {
    if (!field || !field.leftLine || !field.center || !field.rightLine) return null;
    return [field.leftLine, field.leftCenter ?? (field.leftLine + field.center) / 2, field.center, field.rightCenter ?? (field.rightLine + field.center) / 2, field.rightLine];
};

// ---------------------------------------------------------------- Repertorio de la temporada (/api/v2/pro/arsenal)

export interface SeasonArsenal {
    id: number;
    league: LeagueId;
    /** Temporada que respondió (null = MLB no tiene pitcheos con rastreo de ese lanzador) */
    season: number | null;
    /** Pitcheos con rastreo que cuenta MLB */
    total: number | null;
    types: { type: string; name: string; count: number; pct: number | null; mph: number | null }[];
}

/**
 * Repertorio de la temporada de un lanzador (uso y velocidad media por tipo, de MLB). La ruta es de la web y aún no
 * está en producción: con 404 no sale y no se vuelve a pedir (getPro recuerda la ruta).
 */
export const useArsenal = (league: LeagueId, personId: number | null | undefined, season?: number, enabled = true) =>
    useQuery({
        queryKey: ['pro', 'arsenal', league, personId ?? 0, season ?? 'actual'],
        queryFn: ({ signal }) => getPro<SeasonArsenal>('arsenal', `/api/v2/pro/arsenal/${personId}${queryString({ league, season })}`, signal),
        enabled: enabled && !!personId,
        staleTime: HOUR,
        ...calmOn404,
        retry: retryUnless([400, 404])
    });

/** Qué temporada mostrar del repertorio: si hoy es su primer juego, la anterior (la vigente sería solo lo de hoy) */
export const arsenalSeason = (context: ReturnType<typeof seasonContext>) => (context ? (context.gamesBefore === 0 ? context.season - 1 : context.season) : undefined);
