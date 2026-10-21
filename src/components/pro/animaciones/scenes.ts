// Guion de cada jugada PRO: cuándo sale la bola, cuánto vuela, qué fildeador se ilumina, por dónde corre cada corredor
// y cuándo cambian el marcador y el título. Lógica pura, la misma de la web (el-play/src/components/pro/animaciones/scenes.ts).
// Todo en milisegundos desde que empieza la escena: se anima por tiempo, nunca por cuadros.
import type { AtBat } from '../../../types';
import type { PlayEvent, PlayKind } from '../../../lib/playEvents';
import type { ProPlay, ProRunner } from '../../../lib/pro/juego';
import { BASES_FT, GENERIC_FIELD, battedFlight, flightMs, runnerPath, wallCrossing, type BattedFlight, type FeetPoint, type FieldSize } from './field';

/** Jugadas que tienen escena PRO propia; las demás (fin de entrada, emergente, victoria, campeón) usan la del Lite */
export const PRO_SCENES: PlayKind[] = ['single', 'double', 'triple', 'hr', 'out', 'k', 'walk', 'error', 'steal', 'wildPitch', 'pitchingChange', 'run', 'noHitter'];

export const hasProScene = (event: Pick<PlayEvent, 'kind' | 'out'>) => PRO_SCENES.includes(event.kind) && (event.kind !== 'out' || !!event.out);

/** Jugadas que pasan en el campo (bola, fildeadores y corredores) */
const FIELD_KINDS: PlayKind[] = ['single', 'double', 'triple', 'hr', 'out', 'walk', 'error', 'steal', 'wildPitch', 'run'];
export const isFieldScene = (kind: PlayKind) => FIELD_KINDS.includes(kind);

/** «Cine» alarga las jugadas un 30 % */
export const CINE_SCALE = 1.3;

/** Duración de referencia de las escenas sin campo (ms) */
export const FIXED_MS: Partial<Record<PlayKind, number>> = { k: 2100, pitchingChange: 2500, noHitter: 2200 };

const LEG_MS = 380;
const HR_LEG_MS = 430;
const CONTACT_MS = 150;

export interface RunnerTrack {
    id: number | null;
    /** Bases que recorre, en pies */
    path: FeetPoint[];
    batter: boolean;
    out: boolean;
    scored: boolean;
    /** Cuándo sale y cuánto tarda por base */
    start: number;
    legMs: number;
}

export interface FieldScript {
    kind: PlayKind;
    flight: BattedFlight | null;
    contactAt: number;
    flightMs: number;
    /** Cuándo la bola pasa la cerca (jonrón); null si cae adentro */
    crossAt: number | null;
    /** Quién fildeó (1-9) y si fue error */
    fielder: { pos: number; error: boolean } | null;
    runners: RunnerTrack[];
    /** WP/PB: la bola se le escapa al receptor */
    escape: { at: number; ms: number } | null;
    /** Robo: el corredor se desliza al final */
    slideAt: number | null;
    titleAt: number;
    scoreAt: number;
    total: number;
}

const ROUND = (value: number) => Math.round(value);

/** Une los tramos de un mismo corredor (MLB los manda partidos: de 2.ª a 3.ª y de 3.ª a home) */
export const mergeRunners = (runners: ProRunner[]) => {
    const merged: { id: number | null; from: string | null; to: string | null; out: boolean; outBase: string | null; scored: boolean; credits: ProRunner['credits'] }[] = [];
    for (const runner of runners) {
        const same = merged.find((item) => item.id !== null && item.id === (runner.id ?? null) && !item.out);
        if (same) {
            same.to = runner.out ? same.to : runner.to ?? same.to;
            same.out = same.out || !!runner.out;
            same.outBase = runner.outBase ?? same.outBase;
            same.scored = same.scored || !!runner.scored || runner.to === 'score';
            same.credits = [...(same.credits ?? []), ...(runner.credits ?? [])];
            continue;
        }
        merged.push({
            id: runner.id ?? null,
            from: runner.from ?? null,
            to: runner.out ? null : runner.to ?? null,
            out: !!runner.out,
            outBase: runner.outBase ?? null,
            scored: !!runner.scored || runner.to === 'score',
            credits: runner.credits
        });
    }
    return merged;
};

/** Hasta dónde llega el bateador en cada jugada si no hay recorrido de MLB */
const BATTER_TO: Partial<Record<PlayKind, string>> = { single: '1B', double: '2B', triple: '3B', hr: 'score', walk: '1B', error: '1B' };

/** Los recorridos que pertenecen a la escena: los del resultado del turno o los de la acción (robo, WP) */
const runnersOf = (event: PlayEvent, play: ProPlay | undefined) => {
    if (!play) return [];
    const atBat = event.atBat;
    if (event.kind === 'steal') return play.runners.filter((runner) => /^(stolen_base|caught_stealing|pickoff_caught_stealing)_/.test(runner.event ?? ''));
    if (event.kind === 'wildPitch') return play.runners.filter((runner) => runner.event === (event.wild === 'pb' ? 'passed_ball' : 'wild_pitch'));
    // Carrera que entró sin cerrar el turno: solo quien anotó
    if (event.kind === 'run' && atBat && !atBat.complete) return play.runners.filter((runner) => runner.scored || runner.to === 'score');
    return play.runners.filter((runner) => !atBat?.event || runner.event === atBat.event);
};

/** El guion de una jugada en el campo. `play` son los extras PRO del turno (pueden no haber llegado todavía). */
export const fieldScript = (event: PlayEvent, play: ProPlay | undefined, scale = 1, size: FieldSize = GENERIC_FIELD): FieldScript => {
    const { kind } = event;
    const atBat: AtBat | null = event.atBat;
    const batted = kind === 'walk' || kind === 'steal' || kind === 'wildPitch' ? null : atBat ? battedFlight(atBat.pitches) : null;
    // Un «run» sin batazo (entró con WP o balk) no tiene vuelo
    const flight = kind === 'run' && atBat && atBat.complete === false ? null : batted;
    const air = flight ? ROUND(flightMs(flight) * scale) : 0;
    const contactAt = ROUND(CONTACT_MS * scale);
    const merged = mergeRunners(runnersOf(event, play));
    const fromMlb = merged.length > 0;
    // Sin datos PRO todavía: el bateador va a su base
    const tracks: RunnerTrack[] = (fromMlb ? merged : BATTER_TO[kind] ? [{ id: atBat?.batter.id ?? null, from: null, to: BATTER_TO[kind]!, out: false, outBase: null, scored: kind === 'hr', credits: undefined }] : []).map((runner) => {
        const batter = !runner.from;
        const legMs = ROUND((kind === 'hr' ? HR_LEG_MS : LEG_MS) * scale);
        // Al bateador que sale de out con la bola en el aire lo atrapan camino a primera (a media ruta), no en la base
        const caughtOnTheWay = runner.out && batter && !!flight && !flight.ground;
        const halfway = { x: BASES_FT['1B'].x / 2, y: BASES_FT['1B'].y / 2 };
        const path = caughtOnTheWay ? [BASES_FT.home, halfway] : runner.out ? runnerPath(runner.from, runner.outBase ?? (batter ? '1B' : null)) : runnerPath(runner.from, runner.to);
        // El bateador sale al hacer contacto (en la base por bolas, después del 4.º lanzamiento); los corredores, con él
        const start = kind === 'walk' ? ROUND(500 * scale) : kind === 'steal' || kind === 'wildPitch' ? ROUND(250 * scale) : contactAt + (batter ? ROUND(120 * scale) : ROUND(60 * scale));
        return { id: runner.id, path, batter, out: runner.out, scored: runner.scored, start, legMs };
    });
    // Quién fildeó: el crédito del bateador (o el primero de la jugada) o hitData.location
    const credits = merged.flatMap((runner) => runner.credits ?? []);
    const errorCredit = credits.find((credit) => /error/.test(credit.c ?? ''));
    const firstCredit = merged.find((runner) => !runner.from)?.credits?.[0] ?? credits[0];
    const pos = errorCredit?.pos ?? firstCredit?.pos ?? play?.loc ?? null;
    const fielder = pos && kind !== 'hr' && kind !== 'walk' ? { pos, error: !!errorCredit || kind === 'error' } : null;

    // El jonrón pasa la cerca cuando lleva recorrida la distancia de la cerca en esa dirección
    const crossing = flight && kind === 'hr' ? wallCrossing(flight, size) : null;
    const crossAt = crossing !== null ? contactAt + ROUND(air * crossing) : null;
    const runEnd = tracks.reduce((end, track) => Math.max(end, track.start + Math.max(0, track.path.length - 1) * track.legMs), 0);
    const scoring = tracks.filter((track) => track.scored);
    const lastScore = scoring.reduce((end, track) => Math.max(end, track.start + Math.max(0, track.path.length - 1) * track.legMs), 0);
    const landAt = contactAt + air;
    const titleAt = kind === 'walk' || kind === 'steal' || kind === 'wildPitch' ? ROUND(900 * scale) : kind === 'hr' ? (crossAt ?? landAt) + ROUND(150 * scale) : landAt + ROUND(80 * scale);
    const scoreAt = scoring.length ? lastScore : titleAt + ROUND(120 * scale);
    const minimum = ROUND(2000 * scale);
    const maximum = ROUND(3500 * scale);
    const total = Math.max(minimum, Math.min(maximum, Math.max(titleAt + ROUND(1200 * scale), runEnd + ROUND(450 * scale), scoreAt + ROUND(700 * scale))));
    return {
        kind,
        flight,
        contactAt,
        flightMs: air,
        crossAt,
        fielder,
        runners: tracks,
        escape: kind === 'wildPitch' ? { at: ROUND(200 * scale), ms: ROUND(650 * scale) } : null,
        slideAt: kind === 'steal' ? Math.max(0, runEnd - ROUND(300 * scale)) : null,
        titleAt,
        scoreAt,
        total
    };
};

/** Dónde va cada corredor en el instante `ms` (base a base) */
export const runnerAt = (track: RunnerTrack, ms: number): FeetPoint => {
    const legs = track.path.length - 1;
    if (legs <= 0) return track.path[0];
    const progress = Math.max(0, Math.min(legs, (ms - track.start) / track.legMs));
    const leg = Math.min(legs - 1, Math.floor(progress));
    const t = progress - leg;
    const a = track.path[leg];
    const b = track.path[leg + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
};

/** Duración total de la escena de una jugada (la de las sin campo es fija), con «cine» si toca */
export const sceneTotal = (event: PlayEvent, play: ProPlay | undefined, scale = 1, size: FieldSize = GENERIC_FIELD) =>
    isFieldScene(event.kind) ? fieldScript(event, play, scale, size).total : ROUND((FIXED_MS[event.kind] ?? 2500) * scale);
