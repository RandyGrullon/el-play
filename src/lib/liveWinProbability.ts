// Probabilidad de victoria en vivo (estimación de El Play), jugada a jugada.
// - Cada turno de un equipo promedio termina en out, boleto, sencillo, doble, triple o jonrón con las frecuencias de
//   abajo (unas 0,5 carreras por entrada, como en LIDOM). Con eso se saca, para cada situación de bases y outs, cuántas
//   carreras faltan por entrar en esa media entrada (una cadena de Markov resuelta una sola vez).
// - Con las medias entradas que quedan se calcula la diferencia final y si gana el local: si después de la alta de la
//   última entrada va ganando, ganó; si quedan empatados, extra innings con una ligera ventaja para el local.
// - Al principio pesa la fuerza de los equipos (la misma de la probabilidad antes del juego) y se va apagando a medida
//   que se juegan los outs.
import type { AtBat, GameDetail } from '../types';

const MAX_RUNS = 15;
const EXTRAS_HOME = 0.52;

/** Frecuencias de un turno (suman 1) */
const PA = { out: 0.672, walk: 0.095, single: 0.156, double: 0.047, triple: 0.005, hr: 0.025 };
/** Con corredor en tercera y menos de dos outs, parte de los outs traen la carrera (elevado de sacrificio, rodado) */
const OUT_SCORES_FROM_THIRD = 0.3;
/** En un sencillo, el de primera llega a tercera */
const FIRST_TO_THIRD = 0.25;
/** Con corredor en primera y menos de dos outs, parte de los outs son doble play */
const DOUBLE_PLAY = 0.12;

type Dist = number[];

const zero = (): Dist => {
    const dist = new Array(MAX_RUNS + 1).fill(0);
    dist[0] = 1;
    return dist;
};

/** Suma `weight` veces `dist` corrida `runs` carreras */
const addShifted = (target: Dist, dist: Dist, runs: number, weight: number) => {
    if (weight <= 0) return;
    for (let r = 0; r <= MAX_RUNS; r++) target[Math.min(MAX_RUNS, r + runs)] += dist[r] * weight;
};

const bit = (bases: number, base: 0 | 1 | 2) => (bases >> base) & 1;
const count = (bases: number) => bit(bases, 0) + bit(bases, 1) + bit(bases, 2);

/** Qué pasa con un turno: [probabilidad, outs que suma, bases después, carreras] */
const transitions = (outs: number, bases: number): [number, number, number, number][] => {
    const list: [number, number, number, number][] = [];
    // Boleto: avanzan solo los forzados
    {
        let next = bases | 1;
        let runs = 0;
        if (bit(bases, 0)) {
            next |= 2;
            if (bit(bases, 1)) {
                next |= 4;
                if (bit(bases, 2)) runs = 1;
            }
        }
        list.push([PA.walk, 0, next, runs]);
    }
    // Sencillo: anotan los de segunda y tercera; el de primera pasa a segunda (o a tercera una de cada cuatro veces)
    if (bit(bases, 0)) {
        list.push([PA.single * (1 - FIRST_TO_THIRD), 0, 1 | 2, bit(bases, 1) + bit(bases, 2)]);
        list.push([PA.single * FIRST_TO_THIRD, 0, 1 | 4, bit(bases, 1) + bit(bases, 2)]);
    } else list.push([PA.single, 0, 1, bit(bases, 1) + bit(bases, 2)]);
    // Doble: anotan todos menos el de primera, que llega a tercera
    list.push([PA.double, 0, 2 | (bit(bases, 0) ? 4 : 0), bit(bases, 1) + bit(bases, 2)]);
    list.push([PA.triple, 0, 4, count(bases)]);
    list.push([PA.hr, 0, 0, count(bases) + 1]);
    // Outs
    let out = PA.out;
    if (outs < 2 && bit(bases, 0)) {
        const dp = PA.out * DOUBLE_PLAY;
        list.push([dp, 2, bases & ~1, 0]);
        out -= dp;
    }
    if (outs < 2 && bit(bases, 2)) {
        const scores = out * OUT_SCORES_FROM_THIRD;
        list.push([scores, 1, bases & ~4, 1]);
        out -= scores;
    }
    list.push([out, 1, bases, 0]);
    return list;
};

let table: Dist[][] | null = null;

/** Carreras que faltan en la media entrada desde cada situación (outs 0-2 × bases 0-7) */
export const runsToCome = (outs: number, bases: number): Dist => {
    if (!table) {
        let current: Dist[][] = [0, 1, 2].map(() => Array.from({ length: 8 }, zero));
        // Iteración hasta que se estabiliza (los boletos pueden encadenarse sin outs)
        for (let round = 0; round < 80; round++) {
            const next: Dist[][] = [0, 1, 2].map(() => Array.from({ length: 8 }, () => new Array(MAX_RUNS + 1).fill(0)));
            for (let o = 0; o < 3; o++) {
                for (let b = 0; b < 8; b++) {
                    for (const [p, addOuts, nextBases, runs] of transitions(o, b)) {
                        const after = o + addOuts >= 3 ? zero() : current[o + addOuts][nextBases];
                        addShifted(next[o][b], after, runs, p);
                    }
                }
            }
            current = next;
        }
        table = current;
    }
    return outs >= 3 ? zero() : table[outs][bases & 7];
};

/** Carreras esperadas en lo que falta de la media entrada */
export const expectedRuns = (outs: number, bases: number) => runsToCome(outs, bases).reduce((sum, p, runs) => sum + p * runs, 0);

export interface LiveState {
    inning: number;
    top: boolean;
    outs: number;
    /** Bases ocupadas (1 = primera, 2 = segunda, 4 = tercera) */
    bases: number;
    /** Carreras del local menos las del visitante */
    diff: number;
    scheduled: number;
}

const OFFSET = 40;

/** Probabilidad de que gane el local desde una situación, con equipos parejos */
export const homeWinFrom = (state: LiveState) => {
    const last = Math.max(state.scheduled, state.inning);
    let dist = new Array(OFFSET * 2 + 1).fill(0);
    dist[OFFSET + Math.max(-OFFSET, Math.min(OFFSET, state.diff))] = 1;
    let win = 0;
    let inning = state.inning;
    let top = state.top;
    let outs = state.outs;
    let bases = state.bases;
    for (;;) {
        const runs = runsToCome(outs, bases);
        const next = new Array(OFFSET * 2 + 1).fill(0);
        for (let d = 0; d < dist.length; d++) {
            if (!dist[d]) continue;
            for (let r = 0; r <= MAX_RUNS; r++) {
                const target = Math.max(0, Math.min(OFFSET * 2, d + (top ? -r : r)));
                next[target] += dist[d] * runs[r];
            }
        }
        dist = next;
        if (inning >= last) {
            if (top) {
                // Si tras la alta de la última el local va ganando, no se juega la baja
                for (let d = OFFSET + 1; d < dist.length; d++) {
                    win += dist[d];
                    dist[d] = 0;
                }
            } else {
                for (let d = OFFSET + 1; d < dist.length; d++) win += dist[d];
                return Math.min(1, Math.max(0, win + dist[OFFSET] * EXTRAS_HOME));
            }
        }
        if (top) top = false;
        else {
            top = true;
            inning += 1;
        }
        outs = 0;
        bases = 0;
    }
};

const logit = (p: number) => Math.log(p / (1 - p));
const fromLogit = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Con la fuerza de los equipos: `prior` es la probabilidad del local antes del juego (la de la previa) y pesa según la
 * parte del juego que falta.
 */
export const homeWin = (state: LiveState, prior: number | null = null) => {
    const even = homeWinFrom(state);
    if (prior === null || even <= 0 || even >= 1) return even;
    const start = homeWinFrom({ inning: 1, top: true, outs: 0, bases: 0, diff: 0, scheduled: state.scheduled });
    const totalOuts = state.scheduled * 6;
    const played = Math.min(totalOuts, (state.inning - 1) * 6 + (state.top ? 0 : 3) + state.outs);
    const weight = Math.max(0, 1 - played / totalOuts);
    const clamped = Math.min(0.99, Math.max(0.01, prior));
    return fromLogit(logit(Math.min(0.999, Math.max(0.001, even))) + weight * (logit(clamped) - logit(start)));
};

export interface WinPoint {
    /** Índice del turno (null: antes del primer lanzamiento) */
    atBat: AtBat | null;
    inning: number;
    top: boolean;
    home: number;
    /** Cuánto movió la jugada la probabilidad del local */
    delta: number;
}

/** Estado después de un turno completo (al tercer out, el principio de la media entrada que sigue) */
const stateAfter = (atBat: AtBat, scheduled: number): LiveState | null => {
    if (atBat.away === null || atBat.home === null) return null;
    const outs = atBat.outs ?? 0;
    const diff = atBat.home - atBat.away;
    if (outs >= 3) return atBat.top ? { inning: atBat.inning, top: false, outs: 0, bases: 0, diff, scheduled } : { inning: atBat.inning + 1, top: true, outs: 0, bases: 0, diff, scheduled };
    return { inning: atBat.inning, top: atBat.top, outs, bases: atBat.post ?? 0, diff, scheduled };
};

/** Probabilidad del local antes del juego y después de cada turno terminado; al final del juego, 100 % o 0 % */
export const winSeries = (game: GameDetail, prior: number | null = null): WinPoint[] => {
    const scheduled = game.scheduledInnings || 9;
    const start = homeWin({ inning: 1, top: true, outs: 0, bases: 0, diff: 0, scheduled }, prior);
    const points: WinPoint[] = [{ atBat: null, inning: 1, top: true, home: start, delta: 0 }];
    let previous = start;
    const complete = game.atBats.filter((atBat) => atBat.complete);
    complete.forEach((atBat, index) => {
        const state = stateAfter(atBat, scheduled);
        if (!state) return;
        const lastPlay = index === complete.length - 1;
        const ended = (atBat.outs ?? 0) >= 3;
        const late = atBat.inning >= scheduled;
        let home: number;
        if (game.state === 'final' && lastPlay) home = game.home.runs > game.away.runs ? 1 : 0;
        // Decidido: el local deja en el terreno, se acaba la baja de la última sin empate, o tras la alta el local va arriba
        else if (late && !atBat.top && (state.diff > 0 || (ended && state.diff < 0))) home = state.diff > 0 ? 1 : 0;
        else if (late && atBat.top && ended && state.diff > 0) home = 1;
        else home = homeWin(state, prior);
        points.push({ atBat, inning: atBat.inning, top: atBat.top, home, delta: home - previous });
        previous = home;
    });
    return points;
};

/** Ahora mismo (con el turno en curso: bases y outs de este momento) */
export const winNow = (game: GameDetail, prior: number | null = null) => {
    if (game.state === 'final') return game.home.runs > game.away.runs ? 1 : 0;
    if (game.state !== 'live' || !game.inning) return null;
    const scheduled = game.scheduledInnings || 9;
    const diff = game.home.runs - game.away.runs;
    const between = game.inning.state === 'Middle' || game.inning.state === 'End';
    if (between) {
        return game.inning.state === 'Middle'
            ? homeWin({ inning: game.inning.n, top: false, outs: 0, bases: 0, diff, scheduled }, prior)
            : homeWin({ inning: game.inning.n + 1, top: true, outs: 0, bases: 0, diff, scheduled }, prior);
    }
    const bases = (game.runners.first ? 1 : 0) + (game.runners.second ? 2 : 0) + (game.runners.third ? 4 : 0);
    return homeWin({ inning: game.inning.n, top: game.inning.isTop, outs: Math.min(2, game.count.outs), bases, diff, scheduled }, prior);
};

/** Las jugadas que más movieron el juego (a favor de cualquiera) */
export const biggestSwings = (points: WinPoint[], limit = 3) =>
    points
        .filter((point) => point.atBat && Math.abs(point.delta) >= 0.04)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, limit);
