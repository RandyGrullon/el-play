// Lógica pura del final PRO: marcador acumulado, mayor ventaja, cómo se ganó, la jugada que lo cambió todo, el mejor
// pitcheo, la entrada grande, informe de pitcheo y récords. Es la misma de la web (el-play/src/lib/pro/previa-final.ts)
// llevada a la app; además, para cuando el servidor todavía no tiene las rutas PRO, los récords y las barras del
// bullpen se sacan del detalle del Lite (mismas reglas que el servidor). Si falta un dato, la función devuelve null.
import type { AtBat, GameDetail } from '../../../../types';
import type { LineHalf } from '../../../../types/pro-juego';
import type { GamePro, ProPitcher, ProPlay, WinProb, WinProbPlay } from '../../../../lib/pro/juego';
import { ipToOuts, type Side } from '../previa/logica';

export type { Side } from '../previa/logica';

// ---------------------------------------------------------------- Marcador, ventaja y la jugada clave

/** Carreras acumuladas al terminar cada entrada */
export const cumulativeRuns = (linescore: GameDetail['linescore'], side: Side) =>
    linescore.reduce<number[]>((list, inning) => [...list, (list[list.length - 1] ?? 0) + (inning[side] ?? 0)], []);

export interface Lead {
    side: Side;
    lead: number;
    inning: number;
    top: boolean;
}

/** Mayor ventaja del juego (al cerrar cada media entrada); la primera vez que se alcanzó */
export const biggestLead = (linescore: GameDetail['linescore']): Lead | null => {
    const away = cumulativeRuns(linescore, 'away');
    const home = cumulativeRuns(linescore, 'home');
    let best: Lead | null = null;
    linescore.forEach((inning, index) => {
        const checks: [number, boolean][] = [[away[index] - (home[index - 1] ?? 0), true]];
        if (inning.home !== null) checks.push([away[index] - home[index], false]);
        for (const [diff, top] of checks) {
            if (diff !== 0 && (!best || Math.abs(diff) > best.lead)) best = { side: diff > 0 ? 'away' : 'home', lead: Math.abs(diff), inning: inning.n, top };
        }
    });
    return best;
};

/** Entrada en que el ganador tomó la ventaja para siempre */
export const decisiveInning = (atBats: AtBat[], winner: Side, scheduled = 9): { inning: number; top: boolean; walkOff: boolean } | null => {
    let found: AtBat | null = null;
    let previous = { away: 0, home: 0 };
    for (const atBat of atBats) {
        if (atBat.away === null || atBat.home === null) continue;
        const now = { away: atBat.away, home: atBat.home };
        const leadNow = now[winner] > now[winner === 'away' ? 'home' : 'away'];
        const ledBefore = previous[winner] > previous[winner === 'away' ? 'home' : 'away'];
        if (leadNow && !ledBefore) found = atBat;
        if (!leadNow) found = null;
        previous = now;
    }
    if (!found) return null;
    const last = atBats[atBats.length - 1];
    return { inning: found.inning, top: found.top, walkOff: found === last && !found.top && found.inning >= scheduled };
};

export type LeadStoryKind = 'wire' | 'retook' | 'comeback' | 'walkoff';

/** Cómo ganó el ganador: de principio a fin, retomó la ventaja, remontó o lo dejó en el terreno */
export const leadStory = (atBats: AtBat[], winner: Side, scheduled = 9): { kind: LeadStoryKind; inning: number; top: boolean } | null => {
    const decisive = decisiveInning(atBats, winner, scheduled);
    if (!decisive) return null;
    if (decisive.walkOff) return { kind: 'walkoff', inning: decisive.inning, top: decisive.top };
    const loser: Side = winner === 'away' ? 'home' : 'away';
    let led = false;
    let scoredBefore = false;
    for (const atBat of atBats) {
        if (atBat.inning === decisive.inning && atBat.top === decisive.top) break;
        if (atBat.away === null || atBat.home === null) continue;
        if (atBat.away + atBat.home > 0) scoredBefore = true;
        if (atBat[winner]! > atBat[loser]!) led = true;
    }
    const kind: LeadStoryKind = !scoredBefore ? 'wire' : led ? 'retook' : 'comeback';
    return { kind, inning: decisive.inning, top: decisive.top };
};

/** Bases ocupadas y outs al empezar el turno `i` (se reconstruye con los recorridos de los corredores) */
export const situationBefore = (atBats: AtBat[], plays: ProPlay[] | undefined, i: number) => {
    const index = atBats.findIndex((atBat) => atBat.i === i);
    if (index < 0) return null;
    const atBat = atBats[index];
    const previous = atBats[index - 1];
    const sameHalf = previous && previous.inning === atBat.inning && previous.top === atBat.top;
    const outs = sameHalf ? (previous.outs ?? 0) : 0;
    if (!plays) return { outs, bases: null };
    const bases = new Set<string>();
    const start = atBats.findIndex((item) => item.inning === atBat.inning && item.top === atBat.top);
    for (let k = start; k < index; k++) {
        const play = plays.find((item) => item.i === atBats[k].i);
        for (const runner of play?.runners ?? []) {
            if (runner.from) bases.delete(runner.from);
            if (runner.to && runner.to !== 'score' && !runner.out) bases.add(runner.to);
        }
    }
    return { outs, bases: { first: bases.has('1B'), second: bases.has('2B'), third: bases.has('3B') } };
};

/** Quiénes anotaron en el turno (ids, en orden) */
export const scorersOf = (play: ProPlay | undefined) =>
    (play?.runners ?? [])
        .filter((runner) => runner.to === 'score' || runner.scored)
        .map((runner) => runner.id)
        .filter((id): id is number => typeof id === 'number');

/** Marcador antes del turno `i` */
export const scoreBefore = (atBats: AtBat[], i: number) => {
    const index = atBats.findIndex((atBat) => atBat.i === i);
    for (let k = index - 1; k >= 0; k--) {
        const atBat = atBats[k];
        if (atBat.away !== null && atBat.home !== null) return { away: atBat.away, home: atBat.home };
    }
    return { away: 0, home: 0 };
};

export type LeadChange = 'ahead' | 'tie' | 'extend' | 'cut' | null;

/** Qué hizo la jugada con el marcador para el equipo que bateaba */
export const leadChange = (before: { away: number; home: number }, after: { away: number | null; home: number | null }, batting: Side): LeadChange => {
    if (after.away === null || after.home === null) return null;
    const now = { away: after.away, home: after.home };
    const other = batting === 'away' ? 'home' : 'away';
    const runs = now[batting] - before[batting];
    if (runs <= 0) return null;
    const diffBefore = before[batting] - before[other];
    const diffAfter = now[batting] - now[other];
    if (diffAfter === 0) return 'tie';
    if (diffBefore <= 0 && diffAfter > 0) return 'ahead';
    if (diffBefore > 0) return 'extend';
    return 'cut';
};

export interface SwingPlay {
    play: WinProbPlay;
    atBat: AtBat;
    /** Equipo al que favoreció */
    side: Side;
    /** Puntos que ganó ese equipo */
    gain: number;
    /** Probabilidad de ese equipo antes y después (0-100) */
    before: number;
    after: number;
}

/** Una jugada de la probabilidad de ganar vista desde el equipo al que favoreció */
export const swingOf = (play: WinProbPlay, atBats: AtBat[]): SwingPlay | null => {
    const atBat = atBats.find((item) => item.i === play.i);
    if (!atBat || !play.wpa) return null;
    const side: Side = play.wpa > 0 ? 'home' : 'away';
    const homeBefore = play.home - play.wpa;
    const before = side === 'home' ? homeBefore : 100 - homeBefore;
    const after = side === 'home' ? play.home : 100 - play.home;
    return { play, atBat, side, gain: Math.abs(play.wpa), before: Math.round(before * 10) / 10, after: Math.round(after * 10) / 10 };
};

/** Las jugadas clave de MLB (las 3 de mayor |WPA|), de mayor a menor */
export const keySwings = (winProb: WinProb | undefined, atBats: AtBat[]) =>
    (winProb?.key ?? [])
        .map((i) => winProb?.plays.find((play) => play.i === i))
        .map((play) => (play ? swingOf(play, atBats) : null))
        .filter((swing): swing is SwingPlay => swing !== null);

/** Presión más alta del juego */
export const maxLeverage = (winProb: WinProb | undefined) => (winProb?.plays ?? []).reduce((top, play) => Math.max(top, play.li ?? 0), 0);

/** Pico del equipo `side` (su mayor probabilidad) y en qué jugada */
export const peakFor = (winProb: WinProb | undefined, side: Side) => {
    let best: { value: number; play: WinProbPlay } | null = null;
    for (const play of winProb?.plays ?? []) {
        const value = side === 'home' ? play.home : 100 - play.home;
        if (!best || value > best.value) best = { value: Math.round(value * 10) / 10, play };
    }
    return best;
};

/** Lo más bajo que estuvo el equipo `side` desde la jugada `i` */
export const floorAfter = (winProb: WinProb | undefined, side: Side, i: number) => {
    const plays = winProb?.plays ?? [];
    const position = plays.findIndex((play) => play.i === i);
    if (position < 0) return null;
    const rest = plays.slice(position);
    if (!rest.length) return null;
    return Math.round(Math.min(...rest.map((play) => (side === 'home' ? play.home : 100 - play.home))) * 10) / 10;
};

/** Primera jugada de cada entrada (para los rótulos del eje de la probabilidad) */
export const inningStarts = (plays: Pick<WinProbPlay, 'inning'>[]) => {
    const starts: { index: number; inning: number }[] = [];
    plays.forEach((play, index) => {
        if (play.inning !== null && !starts.some((start) => start.inning === play.inning)) starts.push({ index, inning: play.inning });
    });
    return starts;
};

// ---------------------------------------------------------------- Historia: mejor pitcheo, entrada grande

/** El ponche que más ayudó al equipo del lanzador (por WPA); sin probabilidad no se sabe: null */
export const bestStrikeout = (winProb: WinProb | undefined, atBats: AtBat[]) => {
    let best: { atBat: AtBat; gain: number; play: WinProbPlay } | null = null;
    for (const play of winProb?.plays ?? []) {
        const atBat = atBats.find((item) => item.i === play.i);
        if (!atBat || !atBat.event?.startsWith('strikeout') || !atBat.pitches.length) continue;
        // El que lanza es el del otro lado: si batea el visitante (alta), lanza el local
        const gain = atBat.top ? play.wpa : -play.wpa;
        if (gain > 0 && (!best || gain > best.gain)) best = { atBat, gain: Math.round(gain * 10) / 10, play };
    }
    return best;
};

/** Conteo antes del último pitcheo del turno («2-2») */
export const countBeforeLast = (atBat: AtBat) => {
    const previous = atBat.pitches[atBat.pitches.length - 2];
    return previous ? `${previous.b ?? 0}-${previous.s ?? 0}` : '0-0';
};

/** Dónde fue el pitcheo para el bateador: arriba/medio/abajo, adentro/centro/afuera y si fue en la zona */
export const pitchSpot = (pitch: { x: number | null; z: number | null; top: number | null; bot: number | null; zone: number | null }, batterSide: string | null) => {
    if (pitch.x === null || pitch.z === null) return null;
    const top = pitch.top ?? 3.4;
    const bot = pitch.bot ?? 1.6;
    const third = (top - bot) / 3;
    const height = pitch.z > top - third ? 'high' : pitch.z < bot + third ? 'low' : 'middle';
    // x de MLB: vista del receptor; negativo = lado de 3.ª = adentro para el derecho
    const halfPlate = 17 / 24;
    const inside = batterSide === 'L' ? pitch.x > halfPlate / 3 : pitch.x < -halfPlate / 3;
    const outside = batterSide === 'L' ? pitch.x < -halfPlate / 3 : pitch.x > halfPlate / 3;
    const side = inside ? 'inside' : outside ? 'outside' : 'center';
    const inZone = pitch.zone !== null ? pitch.zone >= 1 && pitch.zone <= 9 : Math.abs(pitch.x) <= halfPlate && pitch.z <= top && pitch.z >= bot;
    return { height, side, inZone } as const;
};

/** Media entrada con más carreras (a igualdad, la de más hits y luego la más tardía) */
export const bigInning = (linescore: GamePro['linescore'] | null | undefined, fallback: GameDetail['linescore']) => {
    let best: { inning: number; side: Side; runs: number; hits: number | null } | null = null;
    const rows = linescore?.length
        ? linescore
        : fallback.map((inning) => ({ n: inning.n, away: { r: inning.away, h: null, e: null, lob: null } as LineHalf, home: { r: inning.home, h: null, e: null, lob: null } as LineHalf }));
    for (const inning of rows) {
        for (const side of ['away', 'home'] as const) {
            const runs = inning[side].r ?? 0;
            const hits = inning[side].h;
            if (runs <= 0) continue;
            if (!best || runs > best.runs || (runs === best.runs && (hits ?? 0) >= (best.hits ?? 0))) best = { inning: inning.n, side, runs, hits };
        }
    }
    return best;
};

/** Turnos de una media entrada */
export const halfInning = (atBats: AtBat[], inning: number, side: Side) => atBats.filter((atBat) => atBat.inning === inning && atBat.top === (side === 'away') && atBat.complete);

// ---------------------------------------------------------------- Informe de pitcheo

export interface PitcherSpan {
    id: number;
    side: Side;
    starter: boolean;
    /** Dónde empieza y cuánto dura, en entradas (5.0 IP desde el principio → start 0, length 5) */
    start: number;
    length: number;
    outs: number | null;
    /** Entró sin outs en la entrada (abrió entrada) */
    openedInning: boolean;
    /** Corredores heredados y anotados (null sin los datos PRO) */
    ir: number | null;
    irs: number | null;
}

/** Lanzador del informe: el del box PRO, o lo que se sabe con el box del Lite */
export type SpanPitcher = Pick<ProPitcher, 'id' | 'starter' | 'outs'> & { inn: [number, number] | null; ir: number | null; irs: number | null };

/** Barra de cada lanzador por las entradas que lanzó (con los outs que ya había al entrar) */
export const pitcherSpans = (side: Side, pitchers: SpanPitcher[], atBats: AtBat[]): PitcherSpan[] =>
    pitchers.map((pitcher) => {
        const first = atBats.find((atBat) => atBat.pitcher.id === pitcher.id);
        let start = pitcher.inn ? pitcher.inn[0] - 1 : 0;
        let openedInning = true;
        if (first) {
            const index = atBats.indexOf(first);
            const previous = atBats[index - 1];
            const outsBefore = previous && previous.inning === first.inning && previous.top === first.top ? (previous.outs ?? 0) : 0;
            start = first.inning - 1 + outsBefore / 3;
            openedInning = outsBefore === 0 && !(previous && previous.inning === first.inning && previous.top === first.top);
        }
        return { id: pitcher.id, side, starter: pitcher.starter, start, length: (pitcher.outs ?? 0) / 3, outs: pitcher.outs, openedInning, ir: pitcher.ir, irs: pitcher.irs };
    });

/** Lanzadores del Lite (sin corredores heredados ni Game Score): el primero de la lista es el abridor */
export const litePitchers = (game: GameDetail, side: Side): SpanPitcher[] =>
    game.box[side].pitchers.map((line, index) => ({ id: line.id, starter: index === 0, outs: ipToOuts(line.ip), inn: null, ir: null, irs: null }));

/** Porcentaje de strikes redondeado (null sin pitcheos) */
export const strikePct = (pitches: number | null | undefined, strikes: number | null | undefined) =>
    pitches && strikes !== null && strikes !== undefined ? Math.round((strikes / pitches) * 100) : null;

/** Relevista con más ponches (del box del Lite: lanzadores que no abrieron) */
export const reliefStrikeouts = (game: GameDetail) => {
    let best: { id: number; name: string; k: number; ip: string; side: Side } | null = null;
    for (const side of ['away', 'home'] as const) {
        game.box[side].pitchers.slice(1).forEach((line) => {
            if (line.k > 0 && (!best || line.k > best.k)) best = { id: line.id, name: line.name, k: line.k, ip: line.ip, side };
        });
    }
    return best as { id: number; name: string; k: number; ip: string; side: Side } | null;
};

// ---------------------------------------------------------------- Récords (del feed del Lite si no llegan los PRO)

export type GameRecords = GamePro['records'];

/**
 * Récords del juego sacados de los turnos del Lite: pitcheo más rápido, batazo más duro y más largo, turno más largo.
 * Es la misma regla del servidor (server/services/pro/juego*.js); el ritmo entre pitcheos no se puede (falta la hora).
 */
export const recordsFromLite = (game: GameDetail): GameRecords => {
    const records: GameRecords = { fastest: null, hardest: null, longest: null, longestPA: null };
    for (const atBat of game.atBats) {
        atBat.pitches.forEach((pitch, index) => {
            if (pitch.mph && (!records.fastest || pitch.mph > records.fastest.mph)) records.fastest = { mph: pitch.mph, pitcher: atBat.pitcher.id, type: pitch.type, i: atBat.i, n: pitch.n ?? index + 1 };
            const hit = pitch.hit;
            if (!hit) return;
            if (hit.ev && (!records.hardest || hit.ev > records.hardest.ev)) records.hardest = { ev: hit.ev, la: hit.la, dist: hit.dist, batter: atBat.batter.id, event: atBat.event, i: atBat.i };
            if (hit.dist && (!records.longest || hit.dist > records.longest.dist)) records.longest = { dist: hit.dist, ev: hit.ev, batter: atBat.batter.id, event: atBat.event, i: atBat.i };
        });
        if (atBat.complete && atBat.pitches.length && (!records.longestPA || atBat.pitches.length > records.longestPA.pitches))
            records.longestPA = { pitches: atBat.pitches.length, batter: atBat.batter.id, pitcher: atBat.pitcher.id, i: atBat.i };
    }
    return records;
};

/** Lado del equipo de un pelotero en el juego */
export const sideOfTeam = (game: Pick<GameDetail, 'away' | 'home'>, teamId: number | null | undefined): Side | null =>
    teamId === game.away.id ? 'away' : teamId === game.home.id ? 'home' : null;
