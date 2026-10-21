// Jugada a jugada y box score del modo PRO: lógica pura (sin React) que une el detalle del Lite (atBats, box),
// los extras PRO (pro.plays, pro.box, pro.notes) y la probabilidad de ganar (winprob) por índice de turno.
// Todo sale de lo que manda MLB: si un dato no llega, la función devuelve null y la pantalla no lo pinta.
// Es la misma lógica de la web (el-play/src/lib/pro/jugadas.ts); aquí vive con sus pantallas (src/lib/pro es de «datos»).
import type { AtBat, GameDetail, Pitch, PitcherLine } from '../../../../types';
import type { GamePro, ProAction, ProPlay, ProRunner, WinProb, WinProbPlay } from '../../../../lib/pro/juego';
import { describePlay } from '../../../../lib/baseball';

export type Side = 'away' | 'home';
export type Base = '1B' | '2B' | '3B';
export type Bases = Record<Base, number | null>;

/** Índice de presión (leverage) a partir del cual la jugada lleva el chip «Presión ×2.04» */
export const PRESSURE_LI = 2;
/** captivatingIndex de MLB (0-100) a partir del cual una jugada es «Clave» */
export const KEY_CI = 60;

export const BASES: Base[] = ['1B', '2B', '3B'];
export const emptyBases = (): Bases => ({ '1B': null, '2B': null, '3B': null });
export const basesCount = (bases: Bases) => BASES.filter((base) => bases[base] !== null).length;
const other = (side: Side): Side => (side === 'away' ? 'home' : 'away');

// ------------------------------------------------------------------ Nombres

const fold = (text: string) =>
    text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i;

/** Apellido de un nombre completo: «Mel Rojas Jr.» → «Rojas Jr.» */
export const lastOf = (name: string) => {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return name;
    const last = parts[parts.length - 1];
    return SUFFIX.test(last) && parts.length > 2 ? `${parts[parts.length - 2]} ${last}` : last;
};

/**
 * Nombre corto de un nombre suelto (sin id): el apellido y, si MLB lo distingue con la inicial («Hernandez, Ra»),
 * «R. Hernández». Con id, la libreta del juego (nameBook) pone la inicial solo si el apellido se repite en el juego.
 * `short` es el nombre del box de MLB; `last` (con tildes) se prefiere cuando es el mismo apellido.
 */
export const shortLabel = (person: { name?: string | null; short?: string | null; last?: string | null }) => {
    const short = person.short?.trim() || '';
    const last = person.last?.trim() || (person.name ? lastOf(person.name) : '');
    if (short.includes(',')) {
        const [surname, initial = ''] = short.split(',').map((part) => part.trim());
        const best = last && fold(last) === fold(surname) ? last : surname;
        return initial ? `${initial[0].toUpperCase()}. ${best}` : best;
    }
    if (short) return last && fold(last) === fold(short) ? last : short;
    return last || person.name || '';
};

export interface NameBook {
    /** Nombre corto («R. Hernández», «Made») */
    label: (id: number | null | undefined, fallback?: string) => string;
    /** Nombre completo («Ramón Hernández») */
    full: (id: number | null | undefined, fallback?: string) => string;
    /** De qué equipo es (visitante o local) */
    sideOf: (id: number | null | undefined) => Side | null;
    /** Cambia los nombres del box de MLB («Alcántara, K») por los cortos («K. Alcántara») dentro de un texto */
    replace: (text: string) => string;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Libreta de nombres del juego: pro.players si llegó; si no, los nombres del detalle del Lite */
export const nameBook = (game: GameDetail, pro?: GamePro): NameBook => {
    const fulls = new Map<number, string>();
    const shorts = new Map<number, string>();
    const sides = new Map<number, Side>();
    // Los que jugaron (pro.players trae los rósters completos: la banca no cuenta para repetir apellido)
    const played = new Set<number>();
    for (const atBat of game.atBats) {
        if (atBat.batter.id) fulls.set(atBat.batter.id, atBat.batter.name);
        if (atBat.pitcher.id) fulls.set(atBat.pitcher.id, atBat.pitcher.name);
        if (atBat.batter.id) sides.set(atBat.batter.id, atBat.top ? 'away' : 'home');
        if (atBat.pitcher.id) sides.set(atBat.pitcher.id, atBat.top ? 'home' : 'away');
        if (atBat.batter.id) played.add(atBat.batter.id);
        if (atBat.pitcher.id) played.add(atBat.pitcher.id);
    }
    for (const side of ['away', 'home'] as Side[]) {
        for (const line of [...game.box[side].batters, ...game.box[side].pitchers]) {
            shorts.set(line.id, line.name);
            sides.set(line.id, side);
            played.add(line.id);
        }
    }
    const players = pro?.players ?? {};
    for (const player of Object.values(players)) {
        fulls.set(player.id, player.name);
        if (player.short) shorts.set(player.id, player.short);
        if (player.teamId === game.away.id) sides.set(player.id, 'away');
        else if (player.teamId === game.home.id) sides.set(player.id, 'home');
    }
    // Apellido (con las tildes del nombre completo si es el mismo) e inicial de cada uno
    const surnameOf = (id: number) => {
        const full = fulls.get(id) ?? '';
        const short = shorts.get(id)?.trim() ?? '';
        const last = players[String(id)]?.last?.trim() || (full ? lastOf(full) : '');
        const fromShort = short.includes(',') ? short.split(',')[0].trim() : short;
        if (fromShort) return last && fold(last) === fold(fromShort) ? last : fromShort;
        return last;
    };
    const initialOf = (id: number, size = 1) => {
        const first = players[String(id)]?.first?.trim() || (fulls.get(id) ?? '').split(/\s+/)[0] || '';
        const short = shorts.get(id) ?? '';
        const fromShort = short.includes(',') ? short.split(',')[1].trim() : '';
        const text = first || fromShort;
        return text ? text.charAt(0).toUpperCase() + text.slice(1, size) : '';
    };
    // Apellidos repetidos entre los que jugaron (R., M. y E. Hernández): solo esos llevan la inicial
    const bySurname = new Map<string, number[]>();
    for (const id of played) {
        const surname = fold(surnameOf(id));
        if (surname) bySurname.set(surname, [...(bySurname.get(surname) ?? []), id]);
    }
    const labels = new Map<number, string>();
    const label = (id: number | null | undefined, fallback = '') => {
        if (!id) return fallback ? shortLabel({ name: fallback }) : '';
        const cached = labels.get(id);
        if (cached) return cached;
        if (!fulls.has(id) && !shorts.has(id)) return fallback ? shortLabel({ name: fallback }) : '';
        const surname = surnameOf(id) || fulls.get(id) || '';
        const twins = (bySurname.get(fold(surname)) ?? []).filter((other) => other !== id);
        let value = surname;
        if (twins.length) {
            // Si la inicial también se repite («Ra.» y «Ro.»), dos letras
            const size = twins.some((other) => initialOf(other) === initialOf(id)) ? 2 : 1;
            const initial = initialOf(id, size);
            if (initial) value = `${initial}. ${surname}`;
        }
        labels.set(id, value);
        return value;
    };
    // Reemplazos del texto de las notas: primero los nombres más largos («Rojas Jr.» antes que «Rojas»)
    const swaps = [...shorts.entries()]
        .filter(([, short]) => short.includes(','))
        .map(([id, short]) => [short, label(id)] as const)
        .sort((a, b) => b[0].length - a[0].length);
    const pattern = swaps.length ? new RegExp(swaps.map(([short]) => escapeRegex(short)).join('|'), 'g') : null;
    const lookup = new Map(swaps);
    return {
        label,
        full: (id, fallback = '') => (id && fulls.get(id)) || fallback,
        sideOf: (id) => (id ? sides.get(id) ?? null : null),
        replace: (text) => (pattern ? text.replace(pattern, (match) => lookup.get(match) ?? match) : text)
    };
};

// ------------------------------------------------------------------ Narración

// Frases que la traducción del Lite (describePlay) deja en inglés: se pasan antes de traducir (orden importa)
const NARRATE_BEFORE: [RegExp, string][] = [
    [/\breaches on a throwing error by\b/g, 'se embasa por error en tiro de'],
    [/\breaches on a fielding error by\b/g, 'se embasa por error de'],
    [/\breaches on a missed catch error by\b/g, 'se embasa por error al atrapar de'],
    [/(^|\.\s+)Throwing error by\b/g, '$1Error en tiro de'],
    [/(^|\.\s+)Fielding error by\b/g, '$1Error de'],
    [/(^|\.\s+)Missed catch error by\b/g, '$1Error al atrapar de'],
    [/\(pitch result\)/g, '(resultado del pitcheo)'],
    [/\(hit by pitch\)/g, '(golpeado)'],
    [/\(catch\/drop in outfield\)/g, '(atrapada en los jardines)'],
    [/\(fair\/foul in outfield\)/g, '(fair o foul en los jardines)'],
    [/\(fair\/foul\)/g, '(fair o foul)'],
    [/\(home run\)/g, '(jonrón)'],
    [/\(boundary call\)/g, '(límite del terreno)'],
    [/\(timing play\)/g, '(jugada de tiempo)'],
    [/\(tag-up play\)/g, '(pisa y corre)'],
    [/\(slide interference\)/g, '(interferencia al deslizarse)'],
    [/\(home-plate collision\)/g, '(choque en home)'],
    [/\(record keeping\)/g, '(registro del juego)']
];
// Y después: «de receptor Jason Schiavone» → «del receptor Jason Schiavone»
const NARRATE_AFTER: [RegExp, string][] = [
    [/\bde (receptor|lanzador|campocorto|jardinero (?:izquierdo|central|derecho)|(?:primera|segunda|tercera) base)(?= [A-ZÁÉÍÓÚÑ])/g, 'del $1']
];

/** Narración de MLB en el idioma de la app: la del Lite más las frases que esa deja en inglés */
export const narrate = (desc: string, lang: string) => {
    if (!desc || lang.startsWith('en')) return desc;
    let text = desc;
    for (const [pattern, replacement] of NARRATE_BEFORE) text = text.replace(pattern, replacement);
    text = describePlay(text, lang);
    for (const [pattern, replacement] of NARRATE_AFTER) text = text.replace(pattern, replacement);
    return text;
};

// ------------------------------------------------------------------ Probabilidad de ganar

/** A quién favoreció un cambio de probabilidad del local (en puntos) y cuánto, con un decimal */
export interface Swing {
    side: Side | null;
    value: number;
}

export const swingOf = (homeDelta: number): Swing => {
    const value = Math.round(Math.abs(homeDelta) * 10) / 10;
    return { side: value === 0 ? null : homeDelta > 0 ? 'home' : 'away', value };
};

/** Las jugadas «Clave»: las 3 de mayor |WPA| de MLB, las de captivatingIndex alto y las de mucha presión */
export const keySet = (winProb?: WinProb, pro?: GamePro) => {
    const keys = new Set<number>(winProb?.key ?? []);
    for (const play of winProb?.plays ?? []) {
        if ((play.ci ?? 0) >= KEY_CI || (play.li ?? 0) > PRESSURE_LI) keys.add(play.i);
    }
    for (const play of pro?.plays ?? []) if ((play.ci ?? 0) >= KEY_CI) keys.add(play.i);
    return keys;
};

// ------------------------------------------------------------------ Corredores

/**
 * Bases después de la jugada. MLB manda cada tramo de cada corredor (sin `from` = el bateador) pero no en orden
 * entre corredores: se toma dónde terminó cada uno (su último tramo), se le quita de donde estaba y se le pone ahí.
 */
export const advanceBases = (before: Bases, runners: ProRunner[] | undefined, batterId: number | null): Bases => {
    const bases = { ...before };
    const finals = new Map<number, Base | null>();
    for (const runner of runners ?? []) {
        const id = runner.id ?? (runner.from ? null : batterId);
        if (!id) continue;
        finals.set(id, !runner.out && runner.to && (BASES as string[]).includes(runner.to) ? (runner.to as Base) : null);
    }
    for (const id of finals.keys()) for (const base of BASES) if (bases[base] === id) bases[base] = null;
    for (const [id, base] of finals) if (base) bases[base] = id;
    return bases;
};

// ------------------------------------------------------------------ Eventos dentro del turno (chips)

export type EventKind =
    | 'pitching_change'
    | 'mound_visit'
    | 'stolen_base'
    | 'caught_stealing'
    | 'wild_pitch'
    | 'passed_ball'
    | 'pickoff'
    | 'balk'
    | 'pinch_hitter'
    | 'pinch_runner'
    | 'defense'
    | 'other';

export interface PlayEvent {
    kind: EventKind;
    /** Código de MLB (stolen_base_3b, pitching_substitution…) */
    type: string;
    /** Pitcheos que iban en el turno; -1 = pasó en el último pitcheo (va después de la jugada) */
    k: number;
    player: number | null;
    /** A quién reemplaza (cambio de lanzador, emergentes) */
    replaced: number | null;
    /** Corredor que se movió y adónde llegó (robo, WP, PB, revire) */
    runner: { id: number; to: string | null; out: boolean } | null;
    /** El número de la temporada que manda MLB: «se roba la 3.ª (1)» */
    count: number | null;
    /** Bases al empezar el turno (visita al montículo, corredores heredados) */
    bases: Bases | null;
    /** Equipo a la defensa */
    fielding: Side;
    pos: string | null;
    /** Texto de MLB en inglés (respaldo) */
    desc: string;
}

// Lo que no se pinta: tiempo pedido y avisos sin contenido
const SKIPPED = new Set(['batter_timeout', 'pitcher_timeout', 'game_advisory', 'other_advance']);
// Movimientos de corredor que son su propio evento (no la jugada del bateador)
const SIDE_EVENTS = /^(stolen_base|caught_stealing|wild_pitch|passed_ball|pickoff|balk)/;

export const eventKind = (type: string, pos?: string | null, desc = ''): EventKind | null => {
    if (SKIPPED.has(type)) return null;
    if (type === 'pitching_substitution') return 'pitching_change';
    if (type === 'mound_visit') return 'mound_visit';
    if (type.startsWith('pickoff')) return 'pickoff';
    if (type.startsWith('stolen_base')) return 'stolen_base';
    if (type.startsWith('caught_stealing')) return 'caught_stealing';
    if (type === 'wild_pitch' || type === 'passed_ball' || type === 'balk') return type;
    if (type === 'offensive_substitution') return pos === 'PR' || /pinch-runner/i.test(desc) ? 'pinch_runner' : 'pinch_hitter';
    if (type === 'defensive_substitution' || type === 'defensive_switch' || type === 'position_switch') return 'defense';
    return 'other';
};

const seasonCount = (desc: string) => {
    const match = desc.match(/\((\d+)\)/);
    return match ? Number(match[1]) : null;
};

/** Último tramo de un corredor en esta jugada con este evento (2B→3B y 3B→home: llegó a home) */
const runnerMove = (runners: ProRunner[] | undefined, id: number | null | undefined, type: string) => {
    if (!id || !runners) return null;
    const moves = runners.filter((runner) => runner.id === id && runner.event === type);
    const last = moves[moves.length - 1];
    return last ? { id, to: last.out ? last.outBase ?? null : last.to ?? null, out: !!last.out } : null;
};

const fromProAction = (action: ProAction, play: ProPlay, bases: Bases | null, fielding: Side): PlayEvent | null => {
    const kind = eventKind(action.type, action.pos, action.desc);
    if (!kind) return null;
    return {
        kind,
        type: action.type,
        k: action.k,
        player: action.player ?? null,
        replaced: action.replaced ?? null,
        runner: runnerMove(play.runners, action.player, action.type),
        count: kind === 'stolen_base' || kind === 'caught_stealing' ? seasonCount(action.desc ?? '') : null,
        bases,
        fielding,
        pos: action.pos ?? null,
        desc: action.desc ?? ''
    };
};

const LITE_BASE: Record<string, string> = { '1st': '1B', '2nd': '2B', '3rd': '3B', home: 'score' };

/**
 * Corredor de un evento del Lite (sin los extras PRO no hay `runners`): se lee de la descripción de MLB
 * («Erik González steals (1) 3rd base.», «Wild pitch by pitcher X. Adames to 3rd.») y el nombre se busca en el juego.
 */
export const liteRunner = (kind: EventKind, desc: string, idOf: (name: string) => number | null): PlayEvent['runner'] => {
    let found: { name: string; base: string; out: boolean } | null = null;
    if (kind === 'stolen_base') {
        const match = desc.match(/^\s*(.+?) steals \(\d+\) (2nd|3rd|home)\b/i);
        if (match) found = { name: match[1], base: match[2], out: false };
    } else if (kind === 'caught_stealing') {
        const match = desc.match(/^\s*(.+?) (?:picked off and )?caught stealing (2nd|3rd|home)\b/i);
        if (match) found = { name: match[1], base: match[2], out: true };
    } else if (kind === 'pickoff') {
        const match = desc.match(/picks off (.+?) at (1st|2nd|3rd)\b/i);
        if (match) found = { name: match[1], base: match[2], out: true };
    } else if (kind === 'wild_pitch' || kind === 'passed_ball' || kind === 'balk') {
        // El primer corredor que se movió después de la primera frase
        const match = desc.match(/\.\s+(.+?) (?:to (1st|2nd|3rd)|scores)\b/);
        if (match) found = { name: match[1], base: match[2] ?? 'home', out: false };
    }
    const id = found ? idOf(found.name) : null;
    return found && id ? { id, to: LITE_BASE[found.base.toLowerCase()] ?? null, out: found.out } : null;
};

const fromLiteAction = (action: AtBat['actions'][number], bases: Bases | null, fielding: Side, idOf: (name: string) => number | null): PlayEvent | null => {
    const type = action.event ?? '';
    const kind = eventKind(type, action.sub?.pos, action.desc);
    if (!kind) return null;
    return {
        kind,
        type,
        k: 0,
        player: action.sub?.in.id ?? null,
        replaced: action.sub?.out?.id ?? null,
        runner: liteRunner(kind, action.desc ?? '', idOf),
        count: kind === 'stolen_base' || kind === 'caught_stealing' ? seasonCount(action.desc) : null,
        bases,
        fielding,
        pos: action.sub?.pos ?? null,
        desc: action.desc
    };
};

/** Movimientos de corredor que pasaron en el último pitcheo (WP en el ponche) y que MLB no manda como acción */
const sideEvents = (play: ProPlay | undefined, atBat: AtBat, fielding: Side): PlayEvent[] => {
    if (!play) return [];
    const covered = new Set(play.actions.map((action) => `${action.type}:${action.player ?? ''}`));
    const seen = new Set<string>();
    const list: PlayEvent[] = [];
    for (const runner of play.runners) {
        const type = runner.event ?? '';
        if (!runner.id || !runner.from || type === atBat.event || !SIDE_EVENTS.test(type)) continue;
        const id = `${type}:${runner.id}`;
        if (covered.has(id) || seen.has(id)) continue;
        seen.add(id);
        const kind = eventKind(type);
        if (!kind) continue;
        list.push({ kind, type, k: -1, player: runner.id, replaced: null, runner: runnerMove(play.runners, runner.id, type), count: null, bases: null, fielding, pos: null, desc: '' });
    }
    return list;
};

// ------------------------------------------------------------------ Retos ABS y revisiones

export interface Challenge {
    /** Índice del pitcheo retado (0 = el primero) */
    k: number;
    /** Reto ABS (type MJ); si no, otra revisión (del mánager o del árbitro) */
    abs: boolean;
    /** true = se revocó la decisión */
    over: boolean;
    side: Side | null;
    player: number | null;
    /** Decisión final del pitcheo y la que se cantó al principio */
    call: 'ball' | 'strike' | null;
    original: 'ball' | 'strike' | null;
    /** El pitcheo retado fue el strike 3 o la bola 4 */
    strikeThree: boolean;
    ballFour: boolean;
    /** Retos que le quedaron al equipo después de este (null si MLB no dice cuántos tiene) */
    left: number | null;
}

const callOf = (pitch: Pitch | undefined): 'ball' | 'strike' | null => (!pitch ? null : pitch.r === 'ball' ? 'ball' : pitch.r === 'strike' ? 'strike' : null);

const challengesOf = (atBat: AtBat, play: ProPlay | undefined, sideOfTeam: (team: number | null) => Side | null): Challenge[] => {
    if (!play) return [];
    const list: Challenge[] = [];
    const add = (k: number, review: NonNullable<ProPlay['review']>) => {
        const pitch = atBat.pitches[k];
        const call = callOf(pitch);
        const last = k === atBat.pitches.length - 1;
        list.push({
            k,
            abs: review.type === 'MJ',
            over: review.over,
            side: sideOfTeam(review.team),
            player: review.player,
            call,
            original: call && review.over ? (call === 'ball' ? 'strike' : 'ball') : call,
            strikeThree: last && call === 'strike' && !!atBat.event?.startsWith('strikeout'),
            ballFour: last && call === 'ball' && (atBat.event === 'walk' || atBat.event === 'intent_walk'),
            left: null
        });
    };
    play.pitches.forEach((pitch, k) => pitch.rev && add(k, pitch.rev));
    // MLB pone la revisión en la jugada cuando el pitcheo retado fue el último del turno
    if (play.review && !list.some((item) => item.k === atBat.pitches.length - 1)) add(Math.max(0, atBat.pitches.length - 1), play.review);
    return list;
};

// ------------------------------------------------------------------ Medias entradas

export interface PlayItem {
    atBat: AtBat;
    pro: ProPlay | undefined;
    wp: WinProbPlay | undefined;
    /** Cuánto movió la probabilidad y a favor de quién */
    swing: Swing | null;
    /** Presión (leverage) si pasó de ×2 */
    pressure: number | null;
    key: boolean;
    scoring: boolean;
    /** Turno en curso (en vivo) */
    current: boolean;
    /** Bases antes y después (null sin los extras PRO) */
    before: Bases | null;
    after: Bases | null;
    outsBefore: number;
    /** Corredores que dejó en base si con este turno se acabó la entrada */
    lob: number | null;
    /** Chips antes de la jugada, en orden */
    events: PlayEvent[];
    /** Chips de lo que pasó en el último pitcheo (WP o PB en el ponche) */
    aside: PlayEvent[];
    challenges: Challenge[];
}

export interface HalfInning {
    key: string;
    inning: number;
    top: boolean;
    /** Equipo al bate y a la defensa */
    side: Side;
    fielding: Side;
    plays: PlayItem[];
    runs: number;
    hits: number;
    lob: number | null;
    /** Lanzadores que vio el equipo al bate, en orden */
    pitchers: number[];
    pitches: number;
    /** Cambio de probabilidad de toda la media entrada */
    swing: Swing | null;
    /** Tres bateadores, tres outs, nadie en base */
    oneTwoThree: boolean;
    complete: boolean;
    /** La media entrada que se está jugando */
    current: boolean;
}

const HITS = new Set(['single', 'double', 'triple', 'home_run']);
const REACHED = /^(single|double|triple|home_run|walk|intent_walk|hit_by_pitch|field_error|fielders_choice|catcher_interf|batter_interference)$/;

/** La jugada a jugada agrupada por media entrada, en orden del juego */
export const buildHalves = (game: GameDetail, pro?: GamePro, winProb?: WinProb): HalfInning[] => {
    const playsById = new Map((pro?.plays ?? []).map((play) => [play.i, play]));
    const wpById = new Map((winProb?.plays ?? []).map((play) => [play.i, play]));
    const keys = keySet(winProb, pro);
    const sideOfTeam = (team: number | null) => (team === game.away.id ? 'away' : team === game.home.id ? 'home' : null);
    const atBats = [...game.atBats].sort((a, b) => a.i - b.i);
    // Nombre completo → id (para los eventos del Lite, que solo traen la descripción)
    const ids = new Map<string, number>();
    for (const atBat of atBats) {
        if (atBat.batter.id && atBat.batter.name) ids.set(fold(atBat.batter.name), atBat.batter.id);
        if (atBat.pitcher.id && atBat.pitcher.name) ids.set(fold(atBat.pitcher.name), atBat.pitcher.id);
    }
    for (const player of Object.values(pro?.players ?? {})) ids.set(fold(player.name), player.id);
    const idOf = (name: string) => ids.get(fold(name)) ?? null;
    const halves: HalfInning[] = [];
    // Probabilidad del local al empezar cada media entrada (para su cambio total)
    const startHome = new Map<string, number>();
    let previousHome: number | null = null;
    let previous: AtBat | null = null;
    let bases = emptyBases();
    let outs = 0;

    for (const atBat of atBats) {
        const side: Side = atBat.top ? 'away' : 'home';
        const halfKey = `${atBat.inning}-${atBat.top ? 't' : 'b'}`;
        let half = halves[halves.length - 1];
        if (!half || half.key !== halfKey) {
            half = { key: halfKey, inning: atBat.inning, top: atBat.top, side, fielding: other(side), plays: [], runs: 0, hits: 0, lob: null, pitchers: [], pitches: 0, swing: null, oneTwoThree: false, complete: false, current: false };
            halves.push(half);
            bases = emptyBases();
            outs = 0;
        }
        const play = playsById.get(atBat.i);
        const wp = wpById.get(atBat.i);
        const before = play ? { ...bases } : null;
        const after = play ? advanceBases(bases, play.runners, atBat.batter.id) : null;
        const fielding = half.fielding;
        const events = play
            ? play.actions.map((action) => fromProAction(action, play, before, fielding)).filter((event): event is PlayEvent => !!event)
            : atBat.actions.map((action) => fromLiteAction(action, null, fielding, idOf)).filter((event): event is PlayEvent => !!event);
        half.plays.push({
            atBat,
            pro: play,
            wp,
            swing: wp && wp.complete && atBat.complete ? swingOf(wp.wpa) : null,
            pressure: wp?.li != null && wp.li > PRESSURE_LI ? wp.li : null,
            key: keys.has(atBat.i),
            scoring: atBat.scoring,
            current: !atBat.complete,
            before,
            after,
            outsBefore: outs,
            lob: atBat.complete && atBat.outs === 3 && after ? basesCount(after) : null,
            events: events.sort((a, b) => a.k - b.k),
            aside: sideEvents(play, atBat, fielding),
            challenges: challengesOf(atBat, play, sideOfTeam)
        });
        if (atBat.pitcher.id && !half.pitchers.includes(atBat.pitcher.id)) half.pitchers.push(atBat.pitcher.id);
        half.pitches += atBat.pitches.length;
        if (!atBat.complete) continue;
        const scoreBefore = previous ? (previous[side] ?? 0) : 0;
        half.runs += Math.max(0, (atBat[side] ?? scoreBefore) - scoreBefore);
        if (HITS.has(atBat.event ?? '')) half.hits += 1;
        if (wp && wp.complete) {
            if (!startHome.has(half.key)) startHome.set(half.key, previousHome ?? wp.home - wp.wpa);
            half.swing = swingOf(wp.home - (startHome.get(half.key) as number));
            previousHome = wp.home;
        }
        if (after) bases = after;
        outs = atBat.outs ?? outs;
        half.complete = atBat.outs === 3;
        previous = atBat;
    }

    for (const half of halves) {
        // La pizarra de MLB manda las carreras, hits y quedados de cada mitad
        const line = pro?.linescore.find((entry) => entry.n === half.inning)?.[half.side];
        if (line) {
            if (line.r !== null) half.runs = line.r;
            if (line.h !== null) half.hits = line.h;
            half.lob = line.lob;
        } else {
            const last = half.plays[half.plays.length - 1];
            half.lob = last?.lob ?? null;
        }
        const done = half.plays.filter((item) => item.atBat.complete);
        half.oneTwoThree =
            half.complete &&
            done.length === 3 &&
            half.runs === 0 &&
            done.every((item, index) => item.atBat.outs === index + 1 && !REACHED.test(item.atBat.event ?? ''));
    }
    if (game.state === 'live' && halves.length) halves[halves.length - 1].current = true;
    return halves;
};

export type PlayFilter = 'all' | 'scoring' | 'key';

/** Cuántas jugadas (turnos terminados) hay en cada filtro */
export const filterCounts = (halves: HalfInning[]) => {
    const done = halves.flatMap((half) => half.plays).filter((item) => item.atBat.complete);
    return { all: done.length, scoring: done.filter((item) => item.scoring).length, key: done.filter((item) => item.key).length };
};

/** Cuántos turnos terminados tiene el juego (para la insignia «Jugadas 87» de la hoja) */
export const countPlays = (game: Pick<GameDetail, 'atBats'>) => game.atBats.filter((atBat) => atBat.complete).length;

/** Las medias entradas con solo las jugadas del filtro (sin chips de eventos fuera de «Todas») */
export const filterHalves = (halves: HalfInning[], filter: PlayFilter): HalfInning[] => {
    if (filter === 'all') return halves;
    return halves
        .map((half) => ({
            ...half,
            plays: half.plays
                .filter((item) => item.atBat.complete && (filter === 'scoring' ? item.scoring : item.key))
                .map((item) => ({ ...item, events: [], aside: [] }))
        }))
        .filter((half) => half.plays.length > 0);
};

/** Retos que le quedan a cada equipo después de cada reto (se cuentan hacia atrás desde lo que dice MLB ahora) */
export const fillChallengesLeft = (halves: HalfInning[], pro: GamePro | undefined, scheduledInnings: number) => {
    const abs = pro?.abs;
    if (!abs) return halves;
    const list = halves.flatMap((half) => half.plays.flatMap((item) => item.challenges.filter((challenge) => challenge.abs).map((challenge) => ({ challenge, inning: half.inning }))));
    list.forEach(({ challenge, inning }, index) => {
        const side = challenge.side;
        const now = side ? abs[side].left : null;
        if (!side || now === null || now === undefined) return;
        // Después de este reto: los que tiene ahora + los que falló más tarde − los que le dieron en extras más tarde
        const laterFails = list.slice(index + 1).filter((entry) => entry.challenge.side === side && !entry.challenge.over).length;
        const lastInning = halves[halves.length - 1]?.inning ?? inning;
        const grants = Math.max(0, lastInning - Math.max(inning, scheduledInnings));
        challenge.left = Math.max(0, now + laterFails - grants);
    });
    return halves;
};

// ------------------------------------------------------------------ Texto corto de cada jugada

/** Anotación del anotador: K, BB, 1B, F8, 6-3, 6-4-3, E6… (null si no se puede decir) */
export const scorebook = (atBat: AtBat, play?: ProPlay): string | null => {
    const event = atBat.event ?? '';
    if (!event) return null;
    if (event.startsWith('strikeout')) return 'K';
    if (event === 'walk') return 'BB';
    if (event === 'intent_walk') return 'IBB';
    if (event === 'hit_by_pitch') return 'HBP';
    if (event === 'single') return '1B';
    if (event === 'double') return '2B';
    if (event === 'triple') return '3B';
    if (event === 'home_run') return 'HR';
    if (event === 'catcher_interf') return 'INT';
    const outs = (play?.runners ?? []).filter((runner) => runner.out);
    const errorBy = (play?.runners ?? []).flatMap((runner) => runner.credits ?? []).find((credit) => credit.c?.includes('error'));
    if (event === 'field_error') return errorBy?.pos ? `E${errorBy.pos}` : 'E';
    if (event.startsWith('fielders_choice') && !outs.length) return 'FC';
    const chain: number[] = [];
    for (const runner of outs) {
        for (const credit of runner.credits ?? []) {
            if (!credit.pos || !credit.c || !/putout|assist/.test(credit.c)) continue;
            if (chain[chain.length - 1] !== credit.pos) chain.push(credit.pos);
        }
    }
    if (!chain.length) return play?.loc ? String(play.loc) : null;
    const traj = atBat.pitches[atBat.pitches.length - 1]?.hit?.traj ?? null;
    // Out forzado o selección con un solo fildeador: su número («6»)
    if (chain.length === 1 && /force_out|fielders_choice/.test(event)) return String(chain[0]);
    if (chain.length === 1) {
        const pos = chain[0];
        if (event.startsWith('sac_fly')) return `SF${pos}`;
        if (traj === 'line_drive') return `L${pos}`;
        if (traj === 'popup') return `P${pos}`;
        if (traj === 'fly_ball') return `F${pos}`;
        return `${pos}U`;
    }
    const code = chain.join('-');
    return event.startsWith('sac_bunt') ? `SH ${code}` : code;
};

export type PlayDetail =
    | { kind: 'lob'; count: number }
    | { kind: 'runnerOut'; id: number }
    | { kind: 'loaded' }
    | { kind: 'advance'; id: number; base: Base }
    | { kind: 'strikeout'; called: boolean }
    | { kind: 'walk'; pitches: number }
    | { kind: 'reach'; base: Base }
    | { kind: 'direction'; pos: number }
    | null;

const finalBaseOf = (runners: ProRunner[], id: number) => {
    const moves = runners.filter((runner) => runner.id === id && !runner.out);
    const to = moves[moves.length - 1]?.to;
    return to && (BASES as string[]).includes(to) ? (to as Base) : null;
};

/** Lo que va después del nombre en la fila corta: «, cantado», «; Lake out», «; deja 3»… */
export const playDetail = (item: PlayItem): PlayDetail => {
    const { atBat, pro: play } = item;
    const event = atBat.event ?? '';
    const runners = play?.runners ?? [];
    const others = runners.filter((runner) => runner.from && runner.id && runner.id !== atBat.batter.id && (runner.event === event || !SIDE_EVENTS.test(runner.event ?? '')));
    const runnerOut = others.find((runner) => runner.out);
    if (runnerOut?.id) return { kind: 'runnerOut', id: runnerOut.id };
    if (item.lob) return { kind: 'lob', count: item.lob };
    if (event.startsWith('strikeout')) return { kind: 'strikeout', called: atBat.pitches[atBat.pitches.length - 1]?.code === 'C' };
    if (item.after && basesCount(item.after) === 3 && !atBat.scoring && (event === 'walk' || event === 'intent_walk' || event === 'hit_by_pitch' || event === 'single')) return { kind: 'loaded' };
    const moved = others.filter((runner) => runner.id && !runner.out && runner.to !== 'score');
    const last = moved[moved.length - 1];
    if (last?.id && !atBat.scoring) {
        const base = finalBaseOf(runners, last.id);
        if (base) return { kind: 'advance', id: last.id, base };
    }
    if (event === 'field_error' && atBat.batter.id) {
        const base = finalBaseOf(runners, atBat.batter.id);
        if (base) return { kind: 'reach', base };
    }
    if (event === 'walk' || event === 'intent_walk') return { kind: 'walk', pitches: atBat.pitches.length };
    if (play?.loc && play.loc >= 1 && play.loc <= 9) return { kind: 'direction', pos: play.loc };
    return null;
};

/** Conteo en el que se lanzó el último pitcheo («0-1») */
export const finalCount = (atBat: AtBat) => {
    const before = atBat.pitches[atBat.pitches.length - 2];
    return { balls: Math.min(3, before?.b ?? 0), strikes: Math.min(2, before?.s ?? 0) };
};

/** Datos del batazo del último pitcheo (velocidad, ángulo, distancia), si los hay */
export const battedBall = (atBat: AtBat) => {
    const hit = atBat.pitches[atBat.pitches.length - 1]?.hit;
    if (!hit || (hit.ev == null && hit.dist == null && hit.la == null)) return null;
    return { ev: hit.ev ?? null, la: hit.la ?? null, dist: hit.dist ?? null };
};

// ------------------------------------------------------------------ Box

/** «5.1» → 16 outs */
export const ipToOuts = (ip: string | null | undefined) => {
    if (!ip) return 0;
    const [whole, part = '0'] = ip.split('.');
    return (Number(whole) || 0) * 3 + Math.min(2, Number(part) || 0);
};

/** 16 outs → «5.1» */
export const outsToIp = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;

/** Totales de pitcheo del equipo */
export const pitchingTotals = (lines: PitcherLine[]) => {
    const sum = (pick: (line: PitcherLine) => number | null) => lines.reduce((total, line) => total + (pick(line) ?? 0), 0);
    const outs = sum((line) => ipToOuts(line.ip));
    return {
        ip: outsToIp(outs),
        h: sum((line) => line.h),
        r: sum((line) => line.r),
        er: sum((line) => line.er),
        bb: sum((line) => line.bb),
        k: sum((line) => line.k),
        np: lines.some((line) => line.np !== null) ? sum((line) => line.np) : null,
        st: lines.some((line) => line.st !== null) ? sum((line) => line.st) : null
    };
};

/** Decisión del Lite «(W, 1-0)» → { kind: 'W', record: '1-0' }; también H (hold), S (salvado), BS, L */
export const decisionOf = (note: string | null | undefined) => {
    const match = note?.match(/\(?\s*(W|L|S|SV|H|BS)\b\s*,?\s*([^)]*)\)?/);
    if (!match) return null;
    const kind = match[1] === 'SV' ? 'S' : match[1];
    return { kind: kind as 'W' | 'L' | 'S' | 'H' | 'BS', record: match[2].trim() || null };
};

/** Nota de emergente de MLB: «Struck out for Made in the 8th.» */
export interface SubNote {
    letter: string;
    /** Verbo en clave: struck_out, grounded_out, ran… (null si no se entiende) */
    verb: string | null;
    /** Por quién (nombre del box de MLB) y en qué entrada */
    who: string | null;
    inning: number | null;
    /** Texto original */
    text: string;
}

export const parseSubNote = (note: { label: string; value: string }): SubNote => {
    const match = note.value.trim().match(/^(.+?) for (.+?) in the (\d+)(?:st|nd|rd|th)\.?$/i);
    if (!match) return { letter: note.label, verb: null, who: null, inning: null, text: note.value };
    const verb = match[1]
        .toLowerCase()
        .replace(/[^a-z]+/g, '_')
        .replace(/^_|_$/g, '');
    return { letter: note.label, verb, who: match[2], inning: Number(match[3]), text: note.value };
};

/** Los elementos de una nota de MLB: «Monegro; Espada, J; Armstrong.» → ['Monegro', 'Espada, J', 'Armstrong'] */
export const noteItems = (value: string | null | undefined) =>
    (value ?? '')
        .trim()
        .replace(/\.\s*$/, '')
        .split(/;\s*/)
        .map((item) => item.trim())
        .filter(Boolean);

/** Nombre del box al principio de un elemento: «Rojas Jr. 4» → «Rojas Jr.», «Hernandez, Ra (by Rhoades)» → «Hernandez, Ra» */
export const itemName = (item: string) =>
    item
        .replace(/\s*\(.*$/, '')
        .replace(/\s+\d+$/, '')
        .trim();

/** Suma de los números de una lista («Nunez, G 2; Florial 3; Made» → 6: sin número cuenta 1) */
export const sumItems = (value: string | null | undefined) =>
    noteItems(value).reduce((total, item) => {
        const match = item.replace(/\s*\(.*$/, '').match(/\s(\d+)$/);
        return total + (match ? Number(match[1]) : 1);
    }, 0);

const ORDINAL_ES = (n: string) => `${n}.ª`;

/** Pasa al español las frases fijas de las notas del box de MLB (los nombres se cambian aparte) */
export const translateNote = (value: string, lang: string) => {
    if (lang.startsWith('en')) return value;
    return value
        .replace(/(\d+)(?:st|nd|rd|th) inning off ([^,()]+), (\d) on, (\d) out/g, (_m, n, pitcher, on, out) => `en la ${ORDINAL_ES(n)} ante ${pitcher}, ${on} en base, ${out} out${out === '1' ? '' : 's'}`)
        .replace(/(\d+)(?:st|nd|rd|th) base off /g, (_m, n) => `${ORDINAL_ES(n)} base ante `)
        .replace(/\bhome off /g, 'home ante ')
        .replace(/(\d+)-for-(\d+)/g, '$1-$2')
        .replace(/\(by ([^)]+)\)/g, '(por $1)')
        .replace(/\bbatter timer\b/g, 'reloj del bateador')
        .replace(/\bpitcher timer\b/g, 'reloj del lanzador')
        .replace(/\bcatcher timer\b/g, 'reloj del receptor')
        .replace(/\bthrow\b/g, 'tiro')
        .replace(/\bfielding\b/g, 'fildeo')
        .replace(/\bdropped foul\b/g, 'foul soltado')
        .replace(/\bmissed catch\b/g, 'atrapada fallida')
        .replace(/(\d+)(?:st|nd|rd|th)\b/g, (_m, n) => ORDINAL_ES(n))
        .replace(/\bStrike-Confirmed\b/g, 'strike confirmado')
        .replace(/\bBall-Confirmed\b/g, 'bola confirmada')
        .replace(/\bBall-Overturned to Strike\b/g, 'bola cambiada a strike')
        .replace(/\bStrike-Overturned to Ball\b/g, 'strike cambiado a bola');
};

/** Duración en «3:33» */
export const fmtDuration = (minutes: number | null | undefined) => (minutes == null || !Number.isFinite(minutes) ? null : `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}`);

/** Millas por hora a km/h */
export const kmh = (mph: number | null | undefined) => (mph == null || !Number.isFinite(mph) ? null : Math.round(mph * 1.609344));

/** Pies a metros */
export const meters = (feet: number | null | undefined) => (feet == null || !Number.isFinite(feet) ? null : Math.round(feet * 0.3048));

/** Temporada de la liga por la fecha del juego (LIDOM empieza en octubre: 2026 = 2026-27) */
export const seasonOf = (date: string | null | undefined, league: string) => {
    const when = date ? new Date(date) : null;
    if (!when || Number.isNaN(when.getTime())) return null;
    const year = when.getUTCFullYear();
    return league === 'lidom' && when.getUTCMonth() < 6 ? year - 1 : year;
};

/** Retos ABS de cada equipo con quién retó y cómo le fue */
export const absByTeam = (halves: HalfInning[]) => {
    const result: Record<Side, { ok: number; fail: number; players: { id: number | null; ok: number; fail: number }[] }> = {
        away: { ok: 0, fail: 0, players: [] },
        home: { ok: 0, fail: 0, players: [] }
    };
    for (const half of halves) {
        for (const item of half.plays) {
            for (const challenge of item.challenges) {
                if (!challenge.abs || !challenge.side) continue;
                const team = result[challenge.side];
                let player = team.players.find((entry) => entry.id === challenge.player);
                if (!player) team.players.push((player = { id: challenge.player, ok: 0, fail: 0 }));
                if (challenge.over) {
                    team.ok += 1;
                    player.ok += 1;
                } else {
                    team.fail += 1;
                    player.fail += 1;
                }
            }
        }
    }
    return result;
};
