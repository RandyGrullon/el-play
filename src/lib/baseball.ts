import type { AtBat, GameDetail, Pitch, PitchResult } from '../types';

// Textos de béisbol en español/inglés. MLB manda todo en inglés con códigos estables
// (eventType, call.code, type.code); aquí se traducen. Antes se traducía en el servidor con
// reemplazos sueltos que rompían palabras ("al jardín centraler").

type Lang = 'es' | 'en';
const isEs = (lang: string): boolean => !lang.startsWith('en');

// ------------------------------------------------------------------ Tipos de pitcheo

const PITCH_TYPES: Record<string, [string, string]> = {
    FF: ['Recta 4 costuras', 'Four-seam'],
    FA: ['Recta', 'Fastball'],
    SI: ['Sinker', 'Sinker'],
    FT: ['Recta 2 costuras', 'Two-seam'],
    FC: ['Cutter', 'Cutter'],
    SL: ['Slider', 'Slider'],
    ST: ['Sweeper', 'Sweeper'],
    SV: ['Slurve', 'Slurve'],
    CU: ['Curva', 'Curveball'],
    KC: ['Curva de nudillos', 'Knuckle curve'],
    CS: ['Curva lenta', 'Slow curve'],
    CH: ['Cambio', 'Changeup'],
    FS: ['Splitter', 'Splitter'],
    FO: ['Forkball', 'Forkball'],
    SC: ['Screwball', 'Screwball'],
    KN: ['Nudillera', 'Knuckleball'],
    EP: ['Eephus', 'Eephus'],
    PO: ['Pitchout', 'Pitchout']
};

export const pitchTypeName = (pitch: Pick<Pitch, 'type' | 'typeDesc'>, lang: string) => {
    const known = pitch.type ? PITCH_TYPES[pitch.type] : undefined;
    if (known) return isEs(lang) ? known[0] : known[1];
    return pitch.typeDesc || pitch.type || '—';
};

/** Color estable por tipo de pitcheo (vista "lanzador") */
export const PITCH_TYPE_COLORS: Record<string, string> = {
    FF: '#ef4444', FA: '#ef4444', SI: '#f97316', FT: '#f97316', FC: '#a16207',
    SL: '#eab308', ST: '#84cc16', SV: '#22c55e', CU: '#06b6d4', KC: '#0ea5e9', CS: '#38bdf8',
    CH: '#3b82f6', FS: '#8b5cf6', FO: '#a855f7', SC: '#d946ef', KN: '#ec4899', EP: '#94a3b8'
};
export const pitchTypeColor = (type: string | null) => (type && PITCH_TYPE_COLORS[type]) || '#94a3b8';

// ------------------------------------------------------------------ Resultado de cada pitcheo

const CALLS: Record<string, [string, string]> = {
    B: ['Bola', 'Ball'],
    '*B': ['Bola en tierra', 'Ball in dirt'],
    I: ['Bola intencional', 'Intentional ball'],
    P: ['Pitchout', 'Pitchout'],
    V: ['Bola automática', 'Automatic ball'],
    C: ['Strike cantado', 'Called strike'],
    S: ['Strike tirándole', 'Swinging strike'],
    W: ['Strike tirándole', 'Swinging strike (blocked)'],
    A: ['Strike automático', 'Automatic strike'],
    F: ['Foul', 'Foul'],
    T: ['Foul tip', 'Foul tip'],
    L: ['Foul de toque', 'Foul bunt'],
    M: ['Toque fallido', 'Missed bunt'],
    O: ['Foul tip de toque', 'Foul tip bunt'],
    Q: ['Strike en pitchout', 'Swinging pitchout'],
    R: ['Foul en pitchout', 'Foul pitchout'],
    X: ['En juego, out', 'In play, out(s)'],
    D: ['En juego, hit', 'In play, no out'],
    E: ['En juego, carrera', 'In play, run(s)'],
    H: ['Golpeado', 'Hit by pitch']
};

export const pitchCallName = (pitch: Pick<Pitch, 'code' | 'call'>, lang: string) => {
    const known = pitch.code ? CALLS[pitch.code] : undefined;
    if (known) return isEs(lang) ? known[0] : known[1];
    return pitch.call || '—';
};

export const RESULT_COLORS: Record<PitchResult, string> = {
    ball: 'rgb(var(--ball))',
    strike: 'rgb(var(--strike))',
    inplay: 'rgb(var(--inplay))',
    hbp: 'rgb(var(--hbp))'
};

// ------------------------------------------------------------------ Resultado de la jugada

const EVENT_LABELS: Record<string, string> = {
    Single: 'Sencillo', Double: 'Doble', Triple: 'Triple', 'Home Run': 'Jonrón',
    Walk: 'Base por bolas', 'Intent Walk': 'Base intencional', 'Hit By Pitch': 'Golpeado',
    Strikeout: 'Ponche', 'Strikeout Double Play': 'Ponche y doble play',
    Groundout: 'Rodado de out', Flyout: 'Elevado de out', Lineout: 'Línea de out', 'Pop Out': 'Elevado al cuadro',
    'Bunt Groundout': 'Toque de out', 'Bunt Pop Out': 'Toque elevado de out', 'Bunt Lineout': 'Toque de línea, out',
    Forceout: 'Out forzado', 'Grounded Into DP': 'Doble play', 'Double Play': 'Doble play', 'Triple Play': 'Triple play',
    'Sac Fly': 'Elevado de sacrificio', 'Sac Bunt': 'Toque de sacrificio', 'Sac Fly Double Play': 'Sacrificio y doble play',
    'Sac Bunt Double Play': 'Toque y doble play', 'Fielders Choice': 'Selección', 'Fielders Choice Out': 'Selección, out',
    'Field Error': 'Error', 'Catcher Interference': 'Interferencia del receptor', 'Fan Interference': 'Interferencia de fanático',
    'Batter Interference': 'Interferencia del bateador', 'Runner Out': 'Corredor out', 'Game Advisory': 'Aviso',
    'Stolen Base 2B': 'Robo de 2da', 'Stolen Base 3B': 'Robo de 3ra', 'Stolen Base Home': 'Robo del home',
    'Caught Stealing 2B': 'Atrapado robando 2da', 'Caught Stealing 3B': 'Atrapado robando 3ra', 'Caught Stealing Home': 'Atrapado robando home',
    'Pickoff 1B': 'Out en revire a 1ra', 'Pickoff 2B': 'Out en revire a 2da', 'Pickoff 3B': 'Out en revire a 3ra',
    'Wild Pitch': 'Wild pitch', 'Passed Ball': 'Passed ball', Balk: 'Balk', 'Defensive Indiff': 'Indiferencia defensiva',
    'Pitching Substitution': 'Cambio de lanzador', 'Offensive Substitution': 'Sustitución ofensiva', 'Defensive Switch': 'Cambio defensivo',
    'Defensive Sub': 'Sustitución defensiva', 'Mound Visit': 'Visita al montículo'
};

export const eventName = (atBat: Pick<AtBat, 'eventLabel' | 'event'>, lang: string) => {
    const label = atBat.eventLabel || '';
    if (!isEs(lang)) return label || atBat.event || '';
    return EVENT_LABELS[label] || label || atBat.event || '';
};

export type EventTone = 'hit' | 'hr' | 'out' | 'k' | 'walk' | 'other';

export const eventTone = (event: string | null): EventTone => {
    if (!event) return 'other';
    if (event === 'home_run') return 'hr';
    if (['single', 'double', 'triple'].includes(event)) return 'hit';
    if (event.startsWith('strikeout')) return 'k';
    if (['walk', 'intent_walk', 'hit_by_pitch'].includes(event)) return 'walk';
    if (/out|double_play|triple_play|sac_|fielders_choice/.test(event)) return 'out';
    return 'other';
};

// ------------------------------------------------------------------ Descripción de la jugada

const FIELDS: Record<string, string> = {
    'left-center': 'jardín izquierdo-central',
    'right-center': 'jardín derecho-central',
    left: 'jardín izquierdo',
    center: 'jardín central',
    right: 'jardín derecho'
};

const POSITIONS: [string, string][] = [
    ['left fielder', 'jardinero izquierdo'],
    ['center fielder', 'jardinero central'],
    ['right fielder', 'jardinero derecho'],
    ['first baseman', 'primera base'],
    ['second baseman', 'segunda base'],
    ['third baseman', 'tercera base'],
    ['shortstop', 'campocorto'],
    ['catcher', 'receptor'],
    ['pitcher', 'lanzador']
];
const MASCULINE = new Set(['jardinero izquierdo', 'jardinero central', 'jardinero derecho', 'campocorto', 'receptor', 'lanzador']);

const BASES: Record<string, string> = { '1st': '1ra', '2nd': '2da', '3rd': '3ra', home: 'home' };

// Orden importa: frases largas antes que las cortas
const RULES: [RegExp, string | ((...args: string[]) => string)][] = [
    [/\bchallenged \(/g, 'pidió revisión ('],
    [/\bplay at (1st|2nd|3rd|home)\b/g, (_m, base) => `jugada en ${BASES[base]}`],
    [/\btag play\b/g, 'jugada de toque'],
    [/\bforce play\b/g, 'jugada forzada'],
    [/\bcall on the field was (upheld|confirmed)\b/g, 'se mantuvo la decisión'],
    [/\bcall on the field was overturned\b/g, 'se revocó la decisión'],
    [/\bcall on the field stands\b/g, 'se mantuvo la decisión'],
    [/\bremains in the game as the\b/g, 'sigue en el juego como'],
    [/\bdesignated hitter\b/g, 'bateador designado'],
    [/\bBatter Timeout\./g, 'Tiempo del bateador.'],
    [/\bAutomatic Ball - Intentional\b/g, 'Bola automática (intencional)'],
    [/\bon a fielding error by\b/g, 'por error de'],
    [/\bon a throwing error by\b/g, 'por error en tiro de'],
    [/\bin foul territory\b/g, 'en territorio foul'],
    // MLB escribe tanto "right-center field" como "right center field"
    [/\bto (deep|shallow) (left[- ]center|right[- ]center|left|center|right) field\b/g, (_m, depth, field) => `al ${FIELDS[field.replace(' ', '-')]} ${depth === 'deep' ? 'profundo' : 'corto'}`],
    [/\bto (left[- ]center|right[- ]center|left|center|right) field\b/g, (_m, field) => `al ${FIELDS[field.replace(' ', '-')]}`],
    [/\b(deep|shallow) (left[- ]center|right[- ]center|left|center|right) field\b/g, (_m, depth, field) => `${FIELDS[field.replace(' ', '-')]} ${depth === 'deep' ? 'profundo' : 'corto'}`],
    [/\b(left[- ]center|right[- ]center|left|center|right) field\b/g, (_m, field) => FIELDS[field.replace(' ', '-')]],
    ...POSITIONS.map(([en, es]): [RegExp, string] => [new RegExp(`\\bto ${en}\\b`, 'g'), `${MASCULINE.has(es) ? 'al' : 'a'} ${es}`]),
    ...POSITIONS.map(([en, es]): [RegExp, string] => [new RegExp(`\\b${en}\\b`, 'g'), es]),
    [/\bon a sharp line drive\b/g, 'con línea fuerte'],
    [/\bon a line drive\b/g, 'de línea'],
    [/\bon a sharp ground ball\b/g, 'con rodado fuerte'],
    [/\bon a soft ground ball\b/g, 'con rodado suave'],
    [/\bon a ground ball\b/g, 'de rodado'],
    [/\bon a bunt ground ball\b/g, 'con toque'],
    [/\bon a fly ball\b/g, 'de elevado'],
    [/\bon a pop up\b/g, 'con elevado corto'],
    [/\bon a bunt pop up\b/g, 'con toque elevado'],
    [/\bhits a grand slam\b/g, 'conecta grand slam'],
    [/\bhits a (\w+) home run\b/g, 'conecta jonrón'],
    [/\bhomers\b/g, 'conecta jonrón'],
    [/\bground-rule double\b/g, 'doble por regla de terreno'],
    [/\bsingles\b/g, 'conecta sencillo'],
    [/\bdoubles\b/g, 'conecta doble'],
    [/\btriples\b/g, 'conecta triple'],
    [/\bstrikes out swinging\b/g, 'se poncha tirándole'],
    [/\bstrikes out on a foul tip\b/g, 'se poncha con foul tip'],
    [/\bstrikes out on a missed bunt\b/g, 'se poncha en toque fallido'],
    [/\bstrikes out\b/g, 'se poncha'],
    [/\bcalled out on strikes\b/g, 'se poncha mirando'],
    [/\bintentionally walks\b/g, 'da base intencional a'],
    [/\bwalks\b/g, 'recibe base por bolas'],
    [/\bhit by pitch\b/g, 'golpeado por lanzamiento'],
    [/\bgrounds into a double play\b/g, 'batea para doble play'],
    [/\bgrounds into a force out\b/g, 'batea rodado para out forzado'],
    [/\bgrounds into a fielder's choice\b/g, 'batea rodado de selección'],
    [/\bgrounds out softly\b/g, 'batea rodado suave de out'],
    [/\bgrounds out sharply\b/g, 'batea rodado fuerte de out'],
    [/\bgrounds out\b/g, 'batea rodado de out'],
    [/\bflies out sharply\b/g, 'batea elevado fuerte de out'],
    [/\bflies out\b/g, 'batea elevado de out'],
    [/\blines out sharply\b/g, 'batea línea fuerte de out'],
    [/\blines out\b/g, 'batea línea de out'],
    [/\bpops out softly\b/g, 'batea elevado suave de out'],
    [/\bpops out\b/g, 'batea elevado de out'],
    [/\bbunt grounds out\b/g, 'toca de out'],
    [/\bflies into a double play\b/g, 'batea elevado para doble play'],
    [/\blines into a double play\b/g, 'batea línea para doble play'],
    [/\bout on a sacrifice fly\b/g, 'out con elevado de sacrificio'],
    [/\bout on a sacrifice bunt\b/g, 'out con toque de sacrificio'],
    [/\bhits a sacrifice bunt\b/g, 'toca de sacrificio'],
    [/\breaches on a fielding error by\b/g, 'se embasa por error de'],
    [/\breaches on a throwing error by\b/g, 'se embasa por error en tiro de'],
    [/\breaches on a missed catch error by\b/g, 'se embasa por error al atrapar de'],
    [/\breaches on a fielder's choice\b/g, 'se embasa por selección'],
    [/\breaches on catcher interference by\b/g, 'se embasa por interferencia de'],
    [/\bfielding error by\b/g, 'error de'],
    [/\bthrowing error by\b/g, 'error en tiro de'],
    [/\bsteals \((\d+)\) (2nd|3rd) base\b/g, (_m, n, base) => `se roba la ${BASES[base]} (${n})`],
    [/\bsteals \((\d+)\) home\b/g, (_m, n) => `se roba el home (${n})`],
    [/\bcaught stealing (2nd|3rd) base\b/g, (_m, base) => `atrapado robando la ${BASES[base]}`],
    [/\bpicks off\b/g, 'sorprende en revire a'],
    [/\bpicked off and caught stealing\b/g, 'sorprendido en revire y atrapado robando'],
    [/\bWild pitch by\b/g, 'Wild pitch de'],
    [/\bPassed ball by\b/g, 'Passed ball de'],
    [/\bBalk by\b/g, 'Balk de'],
    [/\bPitching Change:/g, 'Cambio de lanzador:'],
    [/\bOffensive Substitution: Pinch-hitter\b/g, 'Sustitución ofensiva: bateador emergente'],
    [/\bOffensive Substitution: Pinch-runner\b/g, 'Sustitución ofensiva: corredor emergente'],
    [/\bDefensive Substitution:/g, 'Sustitución defensiva:'],
    [/\bDefensive switch from\b/g, 'Cambio defensivo de'],
    [/\bMound Visit\./g, 'Visita al montículo.'],
    [/\breplaces\b/g, 'sustituye a'],
    [/\bplaying\b/g, 'jugando'],
    [/\bscores\b/g, 'anota'],
    [/\bscore\b/g, 'anotan'],
    [/\bout at (1st|2nd|3rd|home)\b/g, (_m, base) => `out en ${BASES[base]}`],
    [/\badvances to (1st|2nd|3rd)\b/g, (_m, base) => `avanza a ${BASES[base]}`],
    [/\bto (1st|2nd|3rd)\b/g, (_m, base) => `a ${BASES[base]}`],
    [/\bon a throw\b/g, 'con un tiro'],
    [/\bassisted by\b/g, 'con asistencia de'],
    [/\bdeflected by\b/g, 'desviado por'],
    [/\bfielded by\b/g, 'fildeado por'],
    [/\bfoul territory\b/g, 'territorio foul'],
    [/\bfirst base\b/g, 'primera base'],
    [/\bsecond base\b/g, 'segunda base'],
    [/\bthird base\b/g, 'tercera base'],
    [/\bto\b/g, 'a'],
    [/\band\b/g, 'y'],
    [/\ba el\b/g, 'al']
];

export const describePlay = (description: string, lang: string) => {
    if (!description || !isEs(lang)) return description;
    let text = description;
    for (const [pattern, replacement] of RULES) {
        text = text.replace(pattern, replacement as string);
    }
    return text.replace(/\s+/g, ' ').trim();
};

// ------------------------------------------------------------------ Estado del juego

const STATES: [RegExp, string, string][] = [
    [/^Scheduled$/, 'Programado', 'Scheduled'],
    [/^Pre-Game$/, 'Pre-juego', 'Pre-game'],
    [/^Warmup$/, 'Calentamiento', 'Warmup'],
    [/^In Progress$/, 'En vivo', 'Live'],
    [/^Delayed Start/, 'Inicio demorado', 'Delayed start'],
    [/^Delayed/, 'Demorado', 'Delayed'],
    [/^Suspended/, 'Suspendido', 'Suspended'],
    [/^Postponed/, 'Pospuesto', 'Postponed'],
    [/^Cancell?ed/, 'Cancelado', 'Cancelled'],
    [/^Completed Early/, 'Final (acortado)', 'Final (shortened)'],
    [/^(Final|Game Over)/, 'Final', 'Final'],
    [/^Manager challenge/i, 'Revisión de video', 'Manager challenge'],
    [/^Umpire review/i, 'Revisión del árbitro', 'Umpire review']
];

export const stateName = (detailedState: string, lang: string) => {
    for (const [pattern, es, en] of STATES) {
        if (pattern.test(detailedState)) return isEs(lang) ? es : en;
    }
    return detailedState;
};

export const isNotPlayed = (detailedState: string) => /postponed|cancel/i.test(detailedState);

/** "Alta 7" / "Top 7"; entre entradas "Mitad 7" / "Mid 7" */
export const inningName = (inning: { n?: number | null; isTop: boolean; state?: string | null } | null | undefined, lang: string, short = false) => {
    if (!inning?.n) return '';
    const es = isEs(lang);
    const state = inning.state || (inning.isTop ? 'Top' : 'Bottom');
    if (short) {
        if (state === 'Middle') return `${es ? 'Mit' : 'Mid'} ${inning.n}`;
        if (state === 'End') return `${es ? 'Fin' : 'End'} ${inning.n}`;
        return `${inning.isTop ? '▲' : '▼'} ${inning.n}`;
    }
    const names: Record<string, [string, string]> = { Top: ['Alta', 'Top'], Bottom: ['Baja', 'Bottom'], Middle: ['Mitad', 'Middle'], End: ['Fin', 'End'] };
    const [nameEs, nameEn] = names[state] || names.Top;
    return `${es ? nameEs : nameEn} ${inning.n}`;
};

export const finalLabel = (innings: number, scheduled: number, lang: string) =>
    innings > scheduled ? `Final/${innings}` : isEs(lang) ? 'Final' : 'Final';

// ------------------------------------------------------------------ Turnos para la zona de strike

/**
 * Turno que se muestra en la zona de strike: en vivo, siempre el del bateador actual (cuando entra uno nuevo la zona
 * se limpia, aunque todavía no le hayan lanzado). Fuera de vivo, si el último turno no tiene pitcheos, el anterior.
 */
export const atBatForZone = (game: Pick<GameDetail, 'atBats' | 'currentAtBat' | 'state'>) => {
    const { atBats } = game;
    if (!atBats.length) return { atBat: null, isPrevious: false };
    const currentIndex = atBats.findIndex((atBat) => atBat.i === game.currentAtBat);
    const current = currentIndex >= 0 ? atBats[currentIndex] : atBats[atBats.length - 1];
    if (current.pitches.length > 0 || game.state === 'live') return { atBat: current, isPrevious: false };
    for (let index = (currentIndex >= 0 ? currentIndex : atBats.length - 1) - 1; index >= 0; index--) {
        if (atBats[index].pitches.length > 0) return { atBat: atBats[index], isPrevious: true };
    }
    return { atBat: current, isPrevious: false };
};

export interface InningBreak {
    /** Terminó la alta (si no, la baja) de la entrada `inning` */
    endedTop: boolean;
    inning: number;
    /** El que viene a batear y el que acaba de salir */
    next: GameDetail['home'];
    ended: GameDetail['home'];
    /** Carreras del que salió en esa mitad (null si no se sabe) */
    runs: number | null;
    dueUp: { id: number; name: string }[];
}

/**
 * Pausa entre entradas: en vivo, tras el tercer out y hasta que llega el primer bateador de la otra mitad (MLB lo dice
 * con inningState «Middle» o «End»; si tarda, el último turno terminado con 3 outs).
 */
export const inningBreak = (game: Pick<GameDetail, 'atBats' | 'currentAtBat' | 'state' | 'inning' | 'away' | 'home' | 'linescore' | 'dueUp'>): InningBreak | null => {
    if (game.state !== 'live') return null;
    const { atBat } = atBatForZone(game);
    if (!atBat || !atBat.complete) return null;
    const state = game.inning?.state;
    if (state !== 'Middle' && state !== 'End' && (atBat.outs ?? 0) < 3) return null;
    const endedTop = state === 'Middle' ? true : state === 'End' ? false : atBat.top;
    const inning = game.inning?.n ?? atBat.inning;
    const next = endedTop ? game.home : game.away;
    const ended = endedTop ? game.away : game.home;
    const half = game.linescore.find((row) => row.n === inning);
    const runs = half ? (endedTop ? half.away : half.home) : null;
    const dueUp = game.dueUp && (game.dueUp.teamId === null || game.dueUp.teamId === next.id) ? game.dueUp.batters : [];
    return { endedTop, inning, next, ended, runs: runs ?? null, dueUp };
};

/** Pitcheos del lanzador en el juego; con `batterId`, solo los que le tiró a ese bateador (en todos sus turnos) */
export const pitchesByPitcher = (atBats: AtBat[], pitcherId: number | null | undefined, batterId?: number | null) =>
    pitcherId
        ? atBats.filter((atBat) => atBat.pitcher.id === pitcherId && (batterId == null || atBat.batter.id === batterId)).flatMap((atBat) => atBat.pitches)
        : [];

/** Bateadores que ha enfrentado el lanzador, en orden y sin repetir */
export const battersFaced = (atBats: AtBat[], pitcherId: number | null | undefined) => {
    const seen = new Map<number, { id: number; name: string }>();
    for (const atBat of atBats) {
        if (atBat.pitcher.id === pitcherId && atBat.batter.id !== null && !seen.has(atBat.batter.id)) seen.set(atBat.batter.id, { id: atBat.batter.id, name: atBat.batter.name });
    }
    return [...seen.values()];
};

export interface ArsenalRow {
    type: string;
    name: string;
    count: number;
    share: number;
    avgMph: number | null;
    maxMph: number | null;
    strikes: number;
    whiffs: number;
}

/** Abanicado: le tiró y no le dio (strike tirándole, bloqueado, toque fallido o pitchout tirándole) */
export const isWhiff = (pitch: Pick<Pitch, 'code'>) => pitch.code === 'S' || pitch.code === 'W' || pitch.code === 'M' || pitch.code === 'Q';

/**
 * Repertorio por tipo; los pitcheos sin tipo (sin rastreo) no hacen fila y el % es sobre los que sí lo tienen. Si
 * ninguno trae tipo, una sola fila «—» con todos, para no perder los strikes ni los abanicados.
 */
export const arsenal = (pitches: Pitch[], lang: string): ArsenalRow[] => {
    const groups = new Map<string, Pitch[]>();
    const typed = pitches.filter((pitch) => pitch.type);
    const counted = typed.length ? typed : pitches;
    for (const pitch of counted) {
        const key = pitch.type || '??';
        groups.set(key, [...(groups.get(key) || []), pitch]);
    }
    return [...groups.entries()]
        .map(([type, list]) => {
            const speeds = list.map((p) => p.mph).filter((mph): mph is number => typeof mph === 'number');
            return {
                type,
                name: pitchTypeName(list[0], lang),
                count: list.length,
                share: list.length / counted.length,
                avgMph: speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null,
                maxMph: speeds.length ? Math.max(...speeds) : null,
                strikes: list.filter((p) => p.r === 'strike' || p.r === 'inplay').length,
                whiffs: list.filter(isWhiff).length
            };
        })
        .sort((a, b) => b.count - a.count);
};

// ------------------------------------------------------------------ Mapa de batazos

export type BattedKind = 'hr' | 'hit' | 'out';
export interface BattedBall {
    atBat: AtBat;
    pitch: Pitch;
    x: number;
    y: number;
    kind: BattedKind;
    side: 'away' | 'home';
}

const HIT_EVENTS = new Set(['single', 'double', 'triple']);

/** Cada bola puesta en juego con el lugar donde cayó (el anotador lo marca en todos los estadios) */
export const battedBalls = (atBats: AtBat[]): BattedBall[] =>
    atBats.flatMap((atBat) => {
        const pitch = [...atBat.pitches].reverse().find((p) => p.r === 'inplay' && typeof p.hit?.x === 'number' && typeof p.hit?.y === 'number');
        if (!pitch) return [];
        const kind: BattedKind = atBat.event === 'home_run' ? 'hr' : HIT_EVENTS.has(atBat.event ?? '') ? 'hit' : 'out';
        return [{ atBat, pitch, x: pitch.hit!.x as number, y: pitch.hit!.y as number, kind, side: atBat.top ? 'away' : 'home' }];
    });

export type { Lang };

// ------------------------------------------------------------------ Jugada del juego

export interface KeyPlay {
    atBat: AtBat;
    headline: string;
    detail: string;
}

/** La jugada que más pesó: la anotadora con más impulsadas; a igualdad, jonrón y luego la más tardía */
export const keyPlayOf = (atBats: AtBat[], lang: string): KeyPlay | null => {
    const scoring = atBats.filter((atBat) => atBat.complete && atBat.scoring);
    if (!scoring.length) return null;
    const weight = (atBat: AtBat) => atBat.rbi * 10 + (atBat.event === 'home_run' ? 5 : 0) + atBat.inning * 0.1 + atBat.i * 0.0001;
    const best = scoring.reduce((top, atBat) => (weight(atBat) > weight(top) ? atBat : top));
    const es = isEs(lang);
    const grandSlam = best.event === 'home_run' && best.rbi === 4;
    const name = grandSlam ? 'Grand slam' : eventName(best, lang) || (es ? 'Jugada' : 'Play');
    const headline = es ? `${name} de ${best.batter.name}` : `${best.batter.name}: ${name}`;
    const hit = best.pitches[best.pitches.length - 1]?.hit;
    const parts = [inningName({ n: best.inning, isTop: best.top }, lang)];
    if (hit?.ev) parts.push(es ? `${hit.ev} mph de salida` : `${hit.ev} mph exit velo`);
    if (best.rbi > 0) parts.push(es ? `${best.rbi} CI` : `${best.rbi} RBI`);
    return { atBat: best, headline, detail: parts.join(' · ') };
};
