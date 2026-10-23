// Lo que se calcula del juego en vivo para la página del juego: datos detenidos, juego sin hit, acciones de la
// cronología, cansancio del lanzador, viento y umpires.
import type { AtBat, GameDetail } from '../types';
import { eventTone, pitchesByPitcher } from './baseball';

const isEs = (lang: string) => !lang.startsWith('en');

/** Minutos sin un pitcheo ni una acción nueva estando en vivo (fuera de las pausas entre entradas y las demoras) */
export const STALE_AFTER_MIN = 5;
export const staleMinutes = (game: GameDetail, now = Date.now()) => {
    if (game.state !== 'live' || !game.lastPlayAt) return null;
    if (game.inning?.state === 'Middle' || game.inning?.state === 'End') return null;
    if (/delay|suspend|review|challenge/i.test(game.detailedState)) return null;
    const last = Date.parse(game.lastPlayAt);
    if (!Number.isFinite(last)) return null;
    const minutes = Math.floor((now - last) / 60000);
    return minutes >= STALE_AFTER_MIN ? minutes : null;
};

/** Medias entradas que ya bateó cada equipo */
const halvesBatted = (game: GameDetail, side: 'away' | 'home') => {
    if (game.state === 'final') return game.linescore.filter((row) => row[side] !== null && row[side] !== undefined).length;
    const inning = game.inning;
    if (!inning) return 0;
    if (side === 'away') return inning.state === 'Top' ? inning.n - 1 : inning.n;
    return inning.state === 'End' ? inning.n : inning.n - 1;
};

export interface NoHitter {
    /** El equipo que lanza el juego sin hit */
    pitching: GameDetail['home'];
    batting: GameDetail['home'];
    innings: number;
    /** Nadie se ha embasado: juego perfecto */
    perfect: boolean;
    final: boolean;
}

/** Juego sin hit en marcha (desde 5 entradas completas) o terminado */
export const noHitterOf = (game: GameDetail): NoHitter[] => {
    if (game.state !== 'live' && game.state !== 'final') return [];
    const list: NoHitter[] = [];
    for (const side of ['away', 'home'] as const) {
        const batting = game[side];
        const pitching = side === 'away' ? game.home : game.away;
        const innings = halvesBatted(game, side);
        if (batting.hits > 0 || innings < 5) continue;
        const turns = game.atBats.filter((atBat) => atBat.complete && atBat.top === (side === 'away'));
        const perfect = pitching.errors === 0 && turns.every((atBat) => ['k', 'out'].includes(eventTone(atBat.event)) && !/error|interf/.test(atBat.event ?? ''));
        list.push({ pitching, batting, innings, perfect, final: game.state === 'final' });
    }
    return list;
};

export type ActionKind = 'steal' | 'caught' | 'pickoff' | 'wildPitch' | 'passedBall' | 'balk' | 'pitchingChange' | 'moundVisit' | 'sub' | 'injury' | 'ejection' | 'runner';

/** Las acciones que van en la cronología (las demás, como cambios defensivos, no) */
export const actionKind = (event: string | null): ActionKind | null => {
    if (!event) return null;
    if (/^caught_stealing|^pickoff_caught_stealing/.test(event)) return 'caught';
    if (/^stolen_base/.test(event)) return 'steal';
    if (/^pickoff/.test(event)) return 'pickoff';
    if (event === 'wild_pitch') return 'wildPitch';
    if (event === 'passed_ball') return 'passedBall';
    if (event === 'balk') return 'balk';
    if (event === 'pitching_substitution') return 'pitchingChange';
    if (event === 'mound_visit') return 'moundVisit';
    if (event === 'offensive_substitution') return 'sub';
    if (event === 'injury') return 'injury';
    if (event === 'ejection') return 'ejection';
    if (event === 'runner_placed') return 'runner';
    return null;
};

export const timelineActions = (atBat: AtBat) => atBat.actions.map((action) => ({ ...action, kind: actionKind(action.event) })).filter((action) => action.kind);

// ------------------------------------------------------------------ Cansancio del lanzador

export type Fatigue = 'fresh' | 'normal' | 'tired' | 'limit';

/** Por los pitcheos del día: un abridor se cansa a los 85-100; un relevista a los 25-35 */
export const fatigueOf = (pitches: number, starter: boolean): { level: Fatigue; share: number } => {
    const steps = starter ? [60, 85, 100] : [15, 25, 35];
    const level: Fatigue = pitches >= steps[2] ? 'limit' : pitches >= steps[1] ? 'tired' : pitches >= steps[0] ? 'normal' : 'fresh';
    return { level, share: Math.min(1, pitches / (steps[2] * 1.15)) };
};

const FASTBALLS = new Set(['FF', 'FA', 'SI', 'FT', 'FC']);

/** Velocidad de la recta al principio y en sus últimos pitcheos (cuando hay rastreo y suficientes rectas) */
export const velocityTrend = (game: GameDetail, pitcherId: number) => {
    const speeds = pitchesByPitcher(game.atBats, pitcherId)
        .filter((pitch) => pitch.type && FASTBALLS.has(pitch.type) && typeof pitch.mph === 'number')
        .map((pitch) => pitch.mph as number);
    if (speeds.length < 10) return null;
    const avg = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
    const first = avg(speeds.slice(0, 5));
    const last = avg(speeds.slice(-5));
    return { first: Math.round(first * 10) / 10, last: Math.round(last * 10) / 10, change: Math.round((last - first) * 10) / 10 };
};

// ------------------------------------------------------------------ Viento y umpires

const WIND: [RegExp, string, string][] = [
    [/out to cf/i, 'hacia el central', 'out to center'],
    [/out to lf/i, 'hacia el izquierdo', 'out to left'],
    [/out to rf/i, 'hacia el derecho', 'out to right'],
    [/in from cf/i, 'desde el central', 'in from center'],
    [/in from lf/i, 'desde el izquierdo', 'in from left'],
    [/in from rf/i, 'desde el derecho', 'in from right'],
    [/l to r/i, 'de izquierda a derecha', 'left to right'],
    [/r to l/i, 'de derecha a izquierda', 'right to left'],
    [/varies/i, 'variable', 'varies']
];

/** «8 mph, Out To CF» → «13 km/h hacia el central» (en inglés queda en mph) */
export const windText = (wind: string | null | undefined, lang: string) => {
    if (!wind) return null;
    const match = /(\d+)\s*mph/i.exec(wind);
    const speed = match ? Number(match[1]) : null;
    if (speed === 0 || /calm|none/i.test(wind)) return isEs(lang) ? 'En calma' : 'Calm';
    const direction = WIND.find(([pattern]) => pattern.test(wind));
    const where = direction ? (isEs(lang) ? direction[1] : direction[2]) : '';
    const amount = speed === null ? '' : isEs(lang) ? `${Math.round(speed * 1.609)} km/h` : `${speed} mph`;
    return [amount, where].filter(Boolean).join(' ') || wind;
};

const UMPIRES: Record<string, [string, string]> = {
    'Home Plate': ['Home', 'Home plate'],
    'First Base': ['Primera', 'First base'],
    'Second Base': ['Segunda', 'Second base'],
    'Third Base': ['Tercera', 'Third base'],
    'Left Field': ['Jardín izquierdo', 'Left field'],
    'Right Field': ['Jardín derecho', 'Right field']
};

export const umpireRole = (type: string, lang: string) => {
    const known = UMPIRES[type];
    return known ? (isEs(lang) ? known[0] : known[1]) : type;
};

/** «2:34» */
export const hoursMinutes = (minutes: number) => `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
