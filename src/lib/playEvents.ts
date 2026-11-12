// Jugadas que disparan una animación en la pantalla del juego en vivo: se comparan dos lecturas seguidas del
// juego y solo cuenta lo nuevo (al abrir el juego no se repite nada de lo que ya pasó).
// El Lite (como la web) anima también la base por bolas, el error, el robo, el cambio de lanzador, el cambio en el
// marcador y el dejado en el terreno. El modo PRO (newPlayEvents con { pro: true }) suma WP/PB, carrera, el aviso de sin
// hit y «Te lo perdiste» al volver del segundo plano, y no tiene ni el cambio en el marcador ni el dejado en el terreno.
// Al tocar una jugada del historial o de la cronología se repite su animación (replayEventOf y, para un robo, un cambio
// de lanzador o un emergente, replayActionOf: con el mismo armado que en vivo), una a la vez y con pausa entre
// repeticiones (replayGate).
import type { AtBat, GameDetail, GameTeam, LeagueId, PitcherLine, Pitch, SeriesStatus } from '../types';
import type { AnimationMode } from '../state/preferences';
import { proActive } from './pro';
import { basesOf, basesOfMask, type Bases } from './runners';

export type PlayKind =
    | 'inning'
    | 'k'
    | 'single'
    | 'double'
    | 'triple'
    | 'hr'
    | 'win'
    | 'champion'
    | 'pinchHitter'
    | 'pinchRunner'
    | 'out'
    | 'abs'
    | 'walk'
    | 'steal'
    | 'pitchingChange'
    | 'error'
    // Solo en el Lite
    | 'lead'
    | 'walkoff'
    // Solo en el modo PRO
    | 'wildPitch'
    | 'run'
    | 'noHitter'
    | 'missed';

/** Persona que entra o sale (cambio de lanzador, emergente) */
export interface PlayPerson {
    id: number | null;
    name: string;
}

/** Cambio en el marcador: abre el marcador, se va arriba, le da la vuelta o empata */
export type LeadChange = 'open' | 'ahead' | 'comeback' | 'tie';

/** Reto del ABS: «revisando» (si alcanzó a verse) y el resultado */
export interface AbsPlay {
    phase: 'checking' | 'result';
    overturned: boolean;
    /** Decisión que queda (en «revisando», la del umpire) y la que había cantado el umpire */
    call: 'ball' | 'strike';
    original: 'ball' | 'strike';
    by: 'batter' | 'pitcher' | 'catcher' | null;
    player: string | null;
    /** Retos que le quedan al equipo que retó (null si no se sabe) */
    remaining: number | null;
    pitch: Pitch;
}

/** Cómo fue el out: cada uno tiene su propia trayectoria en la animación */
export type OutVariant = 'ground' | 'fly' | 'line' | 'pop' | 'force' | 'dp' | 'tp' | 'sac';

export interface PlayEvent {
    /** Una animación por jugada aunque el juego se lea varias veces */
    key: string;
    kind: PlayKind;
    /** Equipo protagonista: el que batea en hits y jonrones, el que lanza en ponches, el que entra a batear al cambiar de entrada */
    team: GameTeam;
    rival: GameTeam;
    away: GameTeam;
    home: GameTeam;
    atBat: AtBat | null;
    /** Media entrada que terminó (solo en fin de entrada) */
    inning: { n: number; isTop: boolean } | null;
    /** Ponches del lanzador en el juego, contando este */
    strikeouts?: number;
    league?: LeagueId;
    /** Serie del ganador después del juego (finales al mejor de varios) */
    seriesRecord?: { wins: number; losses: number } | null;
    /** Emergente: quién entra y a quién sustituye */
    sub?: { in: { id: number | null; name: string }; out: { id: number | null; name: string } | null };
    /** Out: tipo y outs que quedan en la entrada después de la jugada */
    out?: { variant: OutVariant; outs: number };
    /** Estadio (para dibujar el parque con sus medidas en el jonrón) */
    venue?: string;
    /** Hits, jonrones y bases por bolas del Lite: quién estaba en base antes (de la lectura anterior; null si no se sabe) */
    bases?: Bases | null;
    /**
     * Carreras que entraron con la jugada y el marcador después. En el PRO, en cada jugada que las trae; en el Lite, en
     * los hits, jonrones y bases por bolas (del marcador del turno anterior al de este) para los corredores que anotan y
     * «Remolca N».
     */
    runs?: { count: number; away: number; home: number };
    /** Reto del ABS */
    abs?: AbsPlay;
    /** Base por bolas, intencional o golpeado */
    walk?: 'bb' | 'ibb' | 'hbp';
    /** Se embasa por error o por interferencia */
    reach?: 'error' | 'interference';
    /** Robo (o atrapado robando): a qué base (4 = home) y quién (su nombre en la narración) */
    steal?: { base: 2 | 3 | 4; caught: boolean; runner: string | null };
    /** Cambio de lanzador: quién entra y quién sale; en el Lite, con lo que hizo en el juego el que sale (del box) */
    change?: { in: PlayPerson | null; out: PlayPerson | null; line?: PitcherLine | null };
    /** Lite: cambio en el marcador (el protagonista es el equipo que anotó) y cómo estaba antes */
    lead?: { change: LeadChange; before: { away: number; home: number } };
    // ---- Modo PRO
    /** Juego de la jugada (para leer sus extras PRO: corredores, quién fildeó, medidas del parque) */
    gamePk?: number | null;
    /** Lanzamiento descontrolado o passed ball */
    wild?: 'wp' | 'pb';
    /** Sin hit: entradas completas del equipo que batea sin un hit */
    noHit?: { innings: number };
    /** Índice de la acción dentro del turno (robo, WP, cambio) */
    action?: number;
    /** «Te lo perdiste»: lo que pasó mientras no se miraba */
    missed?: MissedSummary;
    /** Repetición pedida desde el historial de jugadas (no está pasando ahora) */
    replay?: boolean;
}

/** Tipo de out según el evento de MLB y, en los «field_out», la trayectoria del batazo (o la etiqueta de MLB) */
export const outVariant = (atBat: Pick<AtBat, 'event' | 'eventLabel' | 'pitches'>): OutVariant | null => {
    const event = atBat.event ?? '';
    if (event === 'triple_play') return 'tp';
    if (event === 'grounded_into_double_play' || event === 'double_play' || event === 'sac_fly_double_play' || event === 'sac_bunt_double_play') return 'dp';
    if (event === 'sac_fly' || event === 'sac_bunt') return 'sac';
    if (event === 'force_out' || event === 'fielders_choice_out') return 'force';
    if (event !== 'field_out' && event !== 'other_out') return null;
    const traj = [...atBat.pitches].reverse().find((pitch) => pitch.r === 'inplay')?.hit?.traj ?? '';
    const label = atBat.eventLabel ?? '';
    if (/ground|bunt_grounder/i.test(traj) || /ground/i.test(label)) return 'ground';
    if (/line/i.test(traj) || /line/i.test(label)) return 'line';
    if (/popup|bunt_popup/i.test(traj) || /pop/i.test(label)) return 'pop';
    if (/fly/i.test(traj) || /fly/i.test(label)) return 'fly';
    return 'ground';
};

/** Victorias del equipo en la serie después de este juego, y si con eso se lleva el título */
export const titleClinch = (series: SeriesStatus | null | undefined, winnerId: number) => {
    if (!series?.championship) return { champion: false, record: null };
    const total = series.total || 1;
    const needed = Math.floor(total / 2) + 1;
    // Si MLB ya contó este juego, la serie dice quién la ganó; si no, se suma la victoria de hoy
    if (series.over) {
        const champion = series.leaderId === winnerId;
        return { champion, record: total > 1 ? { wins: series.wins, losses: series.losses } : null };
    }
    const mine = series.leaderId === winnerId || series.tied ? series.wins : series.losses;
    const theirs = series.leaderId === winnerId || series.tied ? series.losses : series.wins;
    const record = total > 1 ? { wins: mine + 1, losses: theirs } : null;
    return { champion: mine + 1 >= needed, record };
};

const KIND: Record<string, PlayKind> = {
    single: 'single',
    double: 'double',
    triple: 'triple',
    home_run: 'hr',
    strikeout: 'k',
    strikeout_double_play: 'k',
    strikeout_triple_play: 'k'
};

export const playKind = (atBat: Pick<AtBat, 'event'>): PlayKind | null => (atBat.event ? KIND[atBat.event] ?? null : null);

// ---------------------------------------------------------------- compartido (Lite y PRO)

const WALKS: Record<string, 'bb' | 'ibb' | 'hbp'> = { walk: 'bb', intent_walk: 'ibb', hit_by_pitch: 'hbp' };
const STEAL = /^(stolen_base|caught_stealing|pickoff_caught_stealing)_/;
/** Se embasa por error (la interferencia también se anota como error): en el Lite corren como en un sencillo */
const REACHES: Record<string, 'error' | 'interference'> = { field_error: 'error', catcher_interf: 'interference', fielder_interference: 'interference' };

/**
 * Animación del resultado de un turno (null si no tiene): hit, jonrón, ponche, out con su tipo, base por bolas o error. El
 * PRO suma, si entraron carreras (`scored`), la carrera. La misma en vivo y al repetirla desde el historial.
 */
export const atBatKind = (atBat: Pick<AtBat, 'event' | 'eventLabel' | 'pitches'>, pro = false, scored = false): PlayKind | null => {
    const walk = atBat.event ? WALKS[atBat.event] : undefined;
    const reach = atBat.event ? REACHES[atBat.event] : undefined;
    const kind = playKind(atBat) ?? (outVariant(atBat) ? 'out' : walk ? 'walk' : reach ? 'error' : null);
    if (kind || !pro) return kind;
    return scored ? 'run' : null;
};

/** Ponches del lanzador del turno en el juego, contando este */
const strikeoutsOf = (game: GameDetail, atBat: AtBat) =>
    game.atBats.filter((other) => other.complete && other.i <= atBat.i && other.pitcher.id === atBat.pitcher.id && playKind(other) === 'k').length;

/** Jugadas del Lite en las que corren las bases (la base por bolas solo empuja a los forzados; en el error, como un sencillo) */
const movesBases = (kind: PlayKind) => kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'hr' || kind === 'walk' || kind === 'error';

/**
 * Lite: carreras que entraron con un hit, jonrón, base por bolas o error (el marcador del turno anterior contra el de este),
 * para los corredores que anotan y «Remolca N». En las demás jugadas, nada.
 */
const liteRuns = (game: GameDetail, atBat: AtBat, kind: PlayKind): PlayEvent['runs'] => {
    const battingRuns = (other: AtBat | undefined) => (other ? (atBat.top ? other.away : other.home) : 0);
    const after = battingRuns(atBat);
    const before = battingRuns(game.atBats.find((other) => other.i === atBat.i - 1));
    const scored = movesBases(kind) && after !== null && before !== null && atBat.away !== null && atBat.home !== null && after > before ? after - before : 0;
    return scored > 0 ? { count: scored, away: atBat.away ?? 0, home: atBat.home ?? 0 } : undefined;
};

/**
 * La animación del resultado de un turno (la misma en vivo y al repetirla): quién la celebra (el que batea; en el ponche
 * y el out, la defensa), el tipo de out, la base por bolas y los ponches del lanzador. El Lite lleva además el estadio y
 * quién estaba en base (`bases`); el PRO, el juego (para leer sus extras: corredores, quién fildeó).
 */
const atBatEvent = (game: GameDetail, atBat: AtBat, kind: PlayKind, context: { pro: boolean; runs: PlayEvent['runs']; bases?: Bases | null }): PlayEvent => {
    const batting = atBat.top ? game.away : game.home;
    const fielding = atBat.top ? game.home : game.away;
    // El out lo celebra el equipo que lo hizo (como el ponche)
    const defense = kind === 'k' || kind === 'out';
    const variant = outVariant(atBat);
    const event: PlayEvent = {
        key: `ab-${atBat.i}`,
        kind,
        team: defense ? fielding : batting,
        rival: defense ? batting : fielding,
        away: game.away,
        home: game.home,
        atBat,
        inning: null,
        out: kind === 'out' && variant ? { variant, outs: atBat.outs ?? 0 } : undefined,
        walk: atBat.event ? WALKS[atBat.event] : undefined,
        reach: kind === 'error' && atBat.event ? REACHES[atBat.event] : undefined,
        runs: context.runs,
        strikeouts: kind === 'k' ? strikeoutsOf(game, atBat) : undefined
    };
    return context.pro ? { ...event, gamePk: game.gamePk } : { ...event, venue: game.venue, bases: context.bases ?? null };
};

/** El turno que dejó al local ganando en el terreno (baja de la última entrada o de una extra), si el juego terminó así */
const walkoffAtBat = (game: GameDetail): AtBat | null => {
    if (game.state !== 'final' || !game.home.isWinner) return null;
    const last = game.atBats[game.atBats.length - 1];
    return last && !last.top && last.inning >= (game.scheduledInnings || 9) ? last : null;
};

/** Base del robo según el código de MLB (stolen_base_2b, caught_stealing_home, pickoff_caught_stealing_3b…) */
const stealBase = (code: string): 2 | 3 | 4 | null => {
    const base = /_(2b|3b|home)$/.exec(code)?.[1];
    return base === '2b' ? 2 : base === '3b' ? 3 : base === 'home' ? 4 : null;
};

/** Quién roba, según la narración de MLB («Kevin Alcántara steals (1) 2nd base.», «X caught stealing 2nd base…») */
export const stealRunner = (desc: string) => /^(.+?)\s+(?:steals|caught stealing|picked off and caught stealing)\b/i.exec(desc.trim())?.[1] ?? null;

/** Quién entra y quién sale en un cambio de lanzador («Pitching Change: Michael Arias replaces Adonis Medina.») */
export const pitchingChangeNames = (desc: string) => {
    const match = /Pitching Change:\s*(.+?)\s+replaces\s+(.+?)\.?\s*$/i.exec(desc.trim());
    return match ? { in: match[1], out: match[2] } : null;
};

/** El box de MLB pone el apellido («Rhoades») o apellido e inicial («Espada, J»); la narración, el nombre completo */
export const sameName = (boxName: string, fullName: string) => {
    if (boxName === fullName) return true;
    const [last, initial] = boxName.split(',').map((part) => part.trim());
    return !!last && fullName.endsWith(` ${last}`) && (!initial || fullName.startsWith(initial));
};

/** Busca a un lanzador del box por su nombre (para tener su id y su foto) */
const pitcherByName = (game: GameDetail, side: 'away' | 'home', name: string | null | undefined): PlayPerson | null => {
    if (!name) return null;
    const found = game.box?.[side]?.pitchers.find((pitcher) => sameName(pitcher.name, name));
    return { id: found?.id ?? null, name };
};

/**
 * Quién entra y quién sale en el cambio de lanzador del turno `position`: de la narración y, con su id, del box. Si la
 * narración no dice quién sale, el último que lanzó a este mismo equipo.
 */
const pitchingChangeOf = (game: GameDetail, position: number, desc: string) => {
    const atBat = game.atBats[position];
    const side = atBat.top ? 'home' : 'away';
    const names = pitchingChangeNames(desc);
    const before = game.atBats
        .slice(0, position)
        .reverse()
        .find((other) => other.top === atBat.top);
    const incoming = pitcherByName(game, side, names?.in) ?? { id: atBat.pitcher.id, name: atBat.pitcher.name };
    const outgoing = pitcherByName(game, side, names?.out) ?? (before && before.pitcher.id !== incoming.id ? { id: before.pitcher.id, name: before.pitcher.name } : null);
    return { in: incoming, out: outgoing };
};

/**
 * Lite: la animación de una acción dentro de un turno (emergente PH / PR, robo o atrapado robando, cambio de lanzador con
 * la línea del que sale): la misma en vivo y al repetirla desde la cronología. `position`: el lugar del turno en
 * game.atBats; `index`: el de la acción dentro del turno. null si esa acción no se anima.
 */
const liteActionEvent = (game: GameDetail, position: number, index: number): PlayEvent | null => {
    const atBat = game.atBats[position];
    const action = atBat?.actions[index];
    if (!action) return null;
    const batting = atBat.top ? game.away : game.home;
    const fielding = atBat.top ? game.home : game.away;
    const shared = { away: game.away, home: game.home, atBat, inning: null };
    const code = action.event ?? '';
    const key = `act-${atBat.i}-${index}`;
    if (action.sub && (action.sub.pos === 'PH' || action.sub.pos === 'PR')) {
        return { key: `sub-${atBat.i}-${index}`, kind: action.sub.pos === 'PH' ? 'pinchHitter' : 'pinchRunner', team: batting, rival: fielding, ...shared, sub: { in: action.sub.in, out: action.sub.out } };
    }
    if (STEAL.test(code)) {
        const base = stealBase(code);
        if (!base) return null;
        // El robo lo celebra el corredor; el atrapado, la defensa (como un out)
        const caught = !code.startsWith('stolen_base');
        return { key, kind: 'steal', team: caught ? fielding : batting, rival: caught ? batting : fielding, ...shared, steal: { base, caught, runner: stealRunner(action.desc) } };
    }
    if (code === 'pitching_substitution') {
        // Con la línea del que sale en el box (entradas, ponches y lanzamientos)
        const change = pitchingChangeOf(game, position, action.desc);
        const out = change.out;
        const line = out ? game.box?.[atBat.top ? 'home' : 'away']?.pitchers.find((pitcher) => (out.id !== null ? pitcher.id === out.id : sameName(pitcher.name, out.name))) ?? null : null;
        return { key, kind: 'pitchingChange', team: fielding, rival: batting, ...shared, change: { ...change, line } };
    }
    return null;
};

/** PRO: protagonista (el que batea o el que defiende en ese turno, o `team`) y rival, con el juego para sus extras */
const proRoles = (game: GameDetail, atBat: AtBat | null, batting: boolean, team?: GameTeam) => {
    const top = atBat ? atBat.top : true;
    const own = team ?? (batting === top ? game.away : game.home);
    return { team: own, rival: own === game.away ? game.home : game.away, away: game.away, home: game.home, atBat, inning: null, gamePk: game.gamePk };
};

/**
 * PRO: la animación de una acción dentro de un turno (robo, WP/PB, cambio de lanzador, emergente), la misma en vivo y al
 * repetirla. null si esa acción no se anima.
 */
const proActionEvent = (game: GameDetail, position: number, index: number): PlayEvent | null => {
    const atBat = game.atBats[position];
    const action = atBat?.actions[index];
    if (!action?.event) return null;
    const code = action.event;
    const key = `act-${atBat.i}-${index}`;
    if (STEAL.test(code)) {
        const target = stealBase(code);
        if (!target) return null;
        const caught = !code.startsWith('stolen_base');
        return { key, kind: 'steal', ...proRoles(game, atBat, !caught), steal: { base: target, caught, runner: stealRunner(action.desc) }, action: index };
    }
    if (code === 'wild_pitch' || code === 'passed_ball') return { key, kind: 'wildPitch', ...proRoles(game, atBat, false), wild: code === 'wild_pitch' ? 'wp' : 'pb', action: index };
    if (code === 'pitching_substitution') return { key, kind: 'pitchingChange', ...proRoles(game, atBat, false), change: pitchingChangeOf(game, position, action.desc), action: index };
    if (action.sub && (action.sub.pos === 'PH' || action.sub.pos === 'PR')) {
        return { key: `sub-${atBat.i}-${index}`, kind: action.sub.pos === 'PH' ? 'pinchHitter' : 'pinchRunner', ...proRoles(game, atBat, true), sub: { in: action.sub.in, out: action.sub.out } };
    }
    return null;
};

/** Cómo cambió el marcador entre dos lecturas, si anotó un solo equipo (con los dos no se sabe el orden) */
export const leadChange = (before: { away: number; home: number }, after: { away: number; home: number }): { side: 'away' | 'home'; lead: LeadChange } | null => {
    const away = after.away > before.away;
    const home = after.home > before.home;
    if (away === home) return null;
    const side = away ? 'away' : 'home';
    const other = away ? 'home' : 'away';
    const was = before[side] - before[other];
    const now = after[side] - after[other];
    if (was < 0 && now === 0) return { side, lead: 'tie' };
    if (was < 0 && now > 0) return { side, lead: 'comeback' };
    if (was === 0 && now > 0) return { side, lead: before.away + before.home === 0 ? 'open' : 'ahead' };
    return null;
};

/**
 * Retos del ABS nuevos entre dos lecturas: «revisando» cuando aparece en revisión y el resultado cuando se resuelve
 * (también si ya llegó resuelto: la revisión dura ~15 s y el juego se lee cada ~20). Van antes que la jugada del turno.
 * Los mismos en el Lite y en el PRO (en el PRO los pinta la animación del Lite).
 */
const absEvents = (prev: GameDetail, next: GameDetail): PlayEvent[] => {
    const before = new Map(prev.atBats.map((atBat) => [atBat.i, atBat.pitches]));
    const events: PlayEvent[] = [];
    for (const atBat of next.atBats) {
        atBat.pitches.forEach((pitch, index) => {
            const abs = pitch.abs;
            if (!abs) return;
            const seen = before.get(atBat.i)?.[index]?.abs;
            const phase = abs.inProgress ? 'checking' : 'result';
            if (phase === 'checking' ? seen?.inProgress : seen && !seen.inProgress) return;
            // El equipo que retó (a veces cambia el id en la revisión: vale el último)
            const team = abs.teamId === next.home.id ? next.home : abs.teamId === next.away.id ? next.away : atBat.top ? next.away : next.home;
            const rival = team.id === next.home.id ? next.away : next.home;
            const call = pitch.r === 'ball' ? 'ball' : 'strike';
            const original = phase === 'result' && abs.overturned ? (call === 'ball' ? 'strike' : 'ball') : call;
            const by = abs.by ? (abs.by.id === atBat.batter.id ? 'batter' : abs.by.id === atBat.pitcher.id ? 'pitcher' : 'catcher') : null;
            const count = next.abs?.[team.id === next.home.id ? 'home' : 'away'];
            events.push({
                key: `abs-${atBat.i}-${index}-${phase}`,
                kind: 'abs',
                team,
                rival,
                away: next.away,
                home: next.home,
                atBat,
                inning: null,
                gamePk: next.gamePk,
                abs: { phase, overturned: phase === 'result' && abs.overturned, call, original, by, player: abs.by?.name ?? null, remaining: count?.remaining ?? null, pitch }
            });
        });
    }
    return events;
};

export interface PlayEventOptions {
    /** Modo PRO: eventos nuevos y carreras en cada jugada */
    pro?: boolean;
}

export const newPlayEvents = (prev: GameDetail | null | undefined, next: GameDetail, options: PlayEventOptions = {}): PlayEvent[] =>
    options.pro ? proPlayEvents(prev, next) : litePlayEvents(prev, next);

const litePlayEvents = (prev: GameDetail | null | undefined, next: GameDetail): PlayEvent[] => {
    // Solo si ya se estaba viendo este juego en vivo (un jonrón que deja en el terreno sí sale aunque el juego ya diga «final»)
    if (!prev || prev.gamePk !== next.gamePk || prev.state !== 'live') return [];
    const done = new Set(prev.atBats.filter((atBat) => atBat.complete).map((atBat) => atBat.i));
    // Jugadas y acciones en el orden en que pasaron: las acciones de un turno (robo, cambio de lanzador) van antes de su resultado
    const ordered: { order: number; event: PlayEvent }[] = [];
    const ordinal = (atBat: AtBat, index: number) => atBat.i * 1000 + index;
    // Los corredores de la lectura anterior son los de antes de la primera jugada nueva (de las siguientes no se sabe)
    let basesKnown = true;

    for (const atBat of next.atBats) {
        if (!atBat.complete || done.has(atBat.i)) continue;
        // Cualquier turno nuevo cambia las bases para los siguientes
        const firstNew = basesKnown;
        basesKnown = false;
        const kind = atBatKind(atBat);
        if (!kind) continue;
        // Jugadas en las que corren las bases: quién estaba en base y cuántas entraron
        const bases = movesBases(kind) && firstNew ? basesOf(prev.runners) : null;
        ordered.push({ order: ordinal(atBat, 999), event: atBatEvent(next, atBat, kind, { pro: false, runs: liteRuns(next, atBat, kind), bases }) });
    }

    // Acciones nuevas dentro de los turnos: emergentes (PH / PR), robos y cambios de lanzador
    const seenActions = new Map(prev.atBats.map((atBat) => [atBat.i, atBat.actions.length]));
    next.atBats.forEach((atBat, position) => {
        atBat.actions.forEach((_action, index) => {
            if (index < (seenActions.get(atBat.i) ?? 0)) return;
            const event = liteActionEvent(next, position, index);
            if (event) ordered.push({ order: ordinal(atBat, index), event });
        });
    });
    const events = [...absEvents(prev, next), ...ordered.sort((a, b) => a.order - b.order).map((item) => item.event)];

    // Cambio en el marcador (después de la jugada que lo hizo): abren el marcador, se van arriba, le dan la vuelta o empatan
    const shown = { away: prev.away.runs, home: prev.home.runs };
    const lead = next.state === 'live' ? leadChange(shown, { away: next.away.runs, home: next.home.runs }) : null;
    if (lead) {
        const team = next[lead.side];
        events.push({
            key: `lead-${next.away.runs}-${next.home.runs}`,
            kind: 'lead',
            team,
            rival: team === next.home ? next.away : next.home,
            away: next.away,
            home: next.home,
            atBat: [...next.atBats].reverse().find((atBat) => atBat.complete) ?? null,
            inning: null,
            lead: { change: lead.lead, before: shown }
        });
    }

    // Final del juego: victoria del ganador, dejado en el terreno o campeonato si con este juego se lleva el título
    if (next.state === 'final') {
        const winner = next.home.isWinner ? next.home : next.away.isWinner ? next.away : null;
        if (winner) {
            const { champion, record } = titleClinch(next.series ?? prev.series, winner.id);
            // En el terreno: el local gana en la baja de la última entrada (si iba arriba, esa baja no se juega)
            const walkoff = walkoffAtBat(next);
            events.push({
                key: `final-${next.gamePk}`,
                kind: champion ? 'champion' : walkoff ? 'walkoff' : 'win',
                team: winner,
                rival: winner === next.home ? next.away : next.home,
                away: next.away,
                home: next.home,
                atBat: walkoff && !champion ? walkoff : null,
                inning: null,
                league: next.league,
                seriesRecord: record
            });
        }
    }

    // Fin de media entrada: se pasó de jugar (alta/baja) a la mitad o al final, o ya cambió de lado
    const before = prev.inning;
    const after = next.inning;
    if (next.state === 'live' && before && after && (before.state === 'Top' || before.state === 'Bottom')) {
        const ended = after.state === 'Middle' || after.state === 'End' || after.n !== before.n || after.isTop !== before.isTop;
        if (ended) {
            events.push({
                key: `inning-${before.n}-${before.isTop ? 'top' : 'bottom'}`,
                kind: 'inning',
                team: before.isTop ? next.home : next.away,
                rival: before.isTop ? next.away : next.home,
                away: next.away,
                home: next.home,
                atBat: null,
                inning: { n: before.n, isTop: before.isTop }
            });
        }
    }
    return events;
};

/** Más que esto entre dos lecturas (segundo plano, sin red o lo guardado al abrir) y las jugadas ya son viejas */
export const STALE_READ_MS = 30000;

/**
 * Lo que se anima al llegar una lectura nueva (`at` = cuándo se leyó). Si la anterior es vieja o la app está en segundo
 * plano, las jugadas ya pasaron: no se repiten y a lo sumo sale el final del juego (victoria, dejado en el terreno o
 * campeonato) como resumen.
 * En PRO (`pro`, por defecto el modo de la cuenta abierta) salen los eventos PRO y, al volver tras un rato fuera, una sola
 * tarjeta «Te lo perdiste» con lo que pasó en vez de repetir jugadas viejas.
 */
export const playsSince = (prev: { game: GameDetail; at: number } | null, next: GameDetail, at: number, background = false, pro = proActive()): PlayEvent[] => {
    const events = newPlayEvents(prev?.game, next, { pro });
    const stale = background || !prev || at - prev.at > STALE_READ_MS;
    if (!pro) return stale ? events.filter((event) => event.kind === 'win' || event.kind === 'walkoff' || event.kind === 'champion') : events;
    return proPlaysSince(prev, next, events, stale, background);
};

/** Cola de animaciones: la que se está mostrando (la primera) no sale; de las que esperan quedan las más nuevas */
export const queuePlays = (queue: PlayEvent[], fresh: PlayEvent[], max = 4): PlayEvent[] => {
    const newest = (list: PlayEvent[], count: number) => list.slice(Math.max(0, list.length - count));
    if (!queue.length) return newest(fresh, max);
    return [queue[0], ...newest([...queue.slice(1), ...fresh], max - 1)];
};

/** Las que siempre salen aunque el juego no sea de tu equipo */
const BIG: PlayKind[] = ['hr', 'k', 'inning', 'win', 'champion', 'abs', 'noHitter', 'lead', 'walkoff'];

/**
 * Filtra las animaciones según lo elegido en «Más» (en «smart», tu equipo las ve todas; «cine» es «all» más largo).
 * «Te lo perdiste» (PRO) no es una animación: sale siempre, también con «Apagadas».
 */
export const forMode = (events: PlayEvent[], mode: AnimationMode, favoriteTeamId: number | null, teamIds: number[]) => {
    if (mode === 'off') return events.filter((event) => event.kind === 'missed');
    if (mode === 'all' || mode === 'cine' || (favoriteTeamId !== null && teamIds.includes(favoriteTeamId))) return events;
    return events.filter((event) => BIG.includes(event.kind) || event.kind === 'missed');
};

// ---------------------------------------------------------------- modo PRO

const scoreOf = (atBat: AtBat | undefined, fallback: { away: number; home: number }) =>
    atBat && atBat.away !== null && atBat.home !== null ? { away: atBat.away, home: atBat.home } : fallback;

/** Marcador antes del turno `position` (el del turno terminado anterior; 0-0 al empezar) y después de él */
const scoresAround = (game: GameDetail, position: number) => {
    const before = scoreOf(
        game.atBats
            .slice(0, position)
            .reverse()
            .find((other) => other.complete),
        { away: 0, home: 0 }
    );
    return { before, after: scoreOf(game.atBats[position], before) };
};

/** Eventos del modo PRO: lo del Lite (con las carreras de cada jugada) más los eventos nuevos, en el orden del juego */
const proPlayEvents = (prev: GameDetail | null | undefined, next: GameDetail): PlayEvent[] => {
    if (!prev || prev.gamePk !== next.gamePk || prev.state !== 'live') return [];
    const done = new Set(prev.atBats.filter((atBat) => atBat.complete).map((atBat) => atBat.i));
    const seenActions = new Map(prev.atBats.map((atBat) => [atBat.i, atBat.actions.length]));
    const ordered: { order: number; event: PlayEvent }[] = [];
    // Marcador que ya se veía: así una carrera que entró con WP no se cuenta dos veces al cerrar el turno
    const shown = { away: prev.away.runs, home: prev.home.runs };
    const ordinal = (atBat: AtBat, index: number) => atBat.i * 1000 + index;

    next.atBats.forEach((atBat, position) => {
        // Acciones nuevas dentro del turno: robos, WP/PB y cambios de lanzador (los emergentes, como en el Lite)
        atBat.actions.forEach((_action, index) => {
            if (index < (seenActions.get(atBat.i) ?? 0)) return;
            const event = proActionEvent(next, position, index);
            if (event) ordered.push({ order: ordinal(atBat, index), event });
        });

        if (!atBat.complete || done.has(atBat.i)) return;
        // Carreras de esta jugada: lo que subió el marcador sobre lo que ya se veía
        const { before: previous, after } = scoresAround(next, position);
        const side = atBat.top ? 'away' : 'home';
        const scored = Math.max(0, after[side] - Math.max(previous[side], shown[side]));
        shown.away = Math.max(shown.away, after.away);
        shown.home = Math.max(shown.home, after.home);
        const runs = scored > 0 ? { count: scored, away: after.away, home: after.home } : undefined;

        const kind = atBatKind(atBat, true, !!runs);
        if (!kind) return;
        ordered.push({ order: ordinal(atBat, 999), event: atBatEvent(next, atBat, kind, { pro: true, runs }) });
    });

    // Carreras que entraron sin cerrar un turno (WP, PB, robo de home, balk): «+1» con el marcador nuevo
    (['away', 'home'] as const).forEach((side) => {
        const extra = next[side].runs - shown[side];
        if (extra <= 0) return;
        const current = next.atBats[next.atBats.length - 1] ?? null;
        ordered.push({
            order: Number.MAX_SAFE_INTEGER - 2,
            event: { key: `run-${side}-${next[side].runs}`, kind: 'run', ...proRoles(next, current, true, next[side]), runs: { count: extra, away: next.away.runs, home: next.home.runs } }
        });
    });

    const events = [...absEvents(prev, next), ...ordered.sort((a, b) => a.order - b.order).map((item) => item.event)];

    // Final o fin de media entrada (igual que en el Lite, pero el dejado en el terreno es la victoria de siempre) y, desde
    // la 5.ª, el aviso de sin hit
    for (const event of litePlayEvents(prev, next)) {
        if (event.kind === 'walkoff') {
            events.push({ ...event, kind: 'win', atBat: null, gamePk: next.gamePk });
            continue;
        }
        if (event.kind !== 'win' && event.kind !== 'champion' && event.kind !== 'inning') continue;
        events.push({ ...event, gamePk: next.gamePk });
        if (event.kind !== 'inning' || !event.inning || event.inning.n < 5 || next.state !== 'live') continue;
        const batting = event.inning.isTop ? next.away : next.home;
        if (batting.hits !== 0) continue;
        events.push({
            key: `nohit-${event.inning.n}-${event.inning.isTop ? 'top' : 'bottom'}`,
            kind: 'noHitter',
            team: batting === next.away ? next.home : next.away,
            rival: batting,
            away: next.away,
            home: next.home,
            atBat: null,
            inning: event.inning,
            gamePk: next.gamePk,
            noHit: { innings: event.inning.n }
        });
    }
    return events;
};

// ---------------------------------------------------------------- «Te lo perdiste»

export interface MissedSummary {
    gamePk: number | null;
    /** Carreras de cada equipo mientras no se miraba */
    runs: { away: number; home: number };
    /** Jonrones (con la distancia si MLB la midió) */
    homers: { batter: string; teamId: number; dist: number | null }[];
    /** Cambios de lanzador */
    pitchingChanges: number;
    /** Turnos que terminaron, en orden */
    plays: AtBat[];
    /** El juego terminó en ese rato */
    final: boolean;
}

/**
 * Lo que pasó entre la última lectura antes de irse al segundo plano y la primera al volver. null si no pasó nada
 * (o si es otro juego). Reemplaza repetir las animaciones viejas.
 */
export const missedSummary = (before: GameDetail | null | undefined, after: GameDetail): MissedSummary | null => {
    if (!before || before.gamePk !== after.gamePk || before.state === 'final') return null;
    const done = new Set(before.atBats.filter((atBat) => atBat.complete).map((atBat) => atBat.i));
    const plays = after.atBats.filter((atBat) => atBat.complete && !done.has(atBat.i));
    const seenActions = new Map(before.atBats.map((atBat) => [atBat.i, atBat.actions.length]));
    const pitchingChanges = after.atBats.reduce(
        (count, atBat) => count + atBat.actions.filter((action, index) => index >= (seenActions.get(atBat.i) ?? 0) && action.event === 'pitching_substitution').length,
        0
    );
    const runs = { away: Math.max(0, after.away.runs - before.away.runs), home: Math.max(0, after.home.runs - before.home.runs) };
    const homers = plays
        .filter((atBat) => atBat.event === 'home_run')
        .map((atBat) => ({
            batter: atBat.batter.name,
            teamId: (atBat.top ? after.away : after.home).id,
            dist: [...atBat.pitches].reverse().find((pitch) => pitch.hit?.dist)?.hit?.dist ?? null
        }));
    const final = after.state === 'final';
    if (!plays.length && !pitchingChanges && !runs.away && !runs.home && !final) return null;
    return { gamePk: after.gamePk, runs, homers, pitchingChanges, plays, final };
};

/** La tarjeta «Te lo perdiste» como un evento más de la cola (la pinta PlayAnimation en PRO) */
export const missedEvent = (summary: MissedSummary, game: GameDetail): PlayEvent => ({
    key: `missed-${game.gamePk}-${game.atBats.length}-${game.away.runs}-${game.home.runs}`,
    kind: 'missed',
    team: game.away,
    rival: game.home,
    away: game.away,
    home: game.home,
    atBat: null,
    inning: null,
    gamePk: game.gamePk,
    missed: summary
});

// Última lectura de cada juego vista con la app a la vista (PRO): si una lectura llegó con la app en segundo plano, el
// resumen al volver cuenta desde antes de irse y no desde esa lectura
const watched = new Map<number, GameDetail>();

const proPlaysSince = (prev: { game: GameDetail; at: number } | null, next: GameDetail, events: PlayEvent[], stale: boolean, background: boolean): PlayEvent[] => {
    const pk = next.gamePk;
    const seen = pk !== null ? watched.get(pk) : undefined;
    if (pk !== null && !background) watched.set(pk, next);
    if (!stale) return events;
    // Al abrir el juego no se resume nada; con la app en segundo plano tampoco (se resume al volver)
    if (!prev || background) return [];
    const summary = missedSummary(seen ?? prev.game, next);
    return summary ? [missedEvent(summary, next)] : [];
};

// ---------------------------------------------------------------- repetir una jugada desde el historial

/**
 * Repetición de una jugada ya hecha, pedida desde el historial: la misma animación que salió en vivo, armada para ese
 * turno (tipo, equipos con el marcador de entonces, bateador y lanzador, carreras del marcador de ese turno y del
 * anterior, estadio y, en el ponche, los del lanzador hasta ahí). Las bases de antes salen del turno anterior de la
 * misma media entrada (su `post`; vacías en el primero de la media). En el Lite, el turno que dejó en el terreno al
 * local repite «¡En el terreno!». Con `pro`, la del modo PRO (la carrera también, con el juego para sus extras). Si el
 * resultado no se anima pero al turno lo cerró un corredor (atrapado robando con el tercer out), se repite ese robo.
 * null si el turno no terminó o no tiene nada que se anime. No pasa por «Más»: una repetición pedida sale aunque sea de
 * las chicas.
 */
export const replayEventOf = (game: GameDetail, atBatIndex: number, options: PlayEventOptions = {}): PlayEvent | null => {
    const position = game.atBats.findIndex((item) => item.i === atBatIndex);
    const atBat = game.atBats[position];
    if (!atBat?.complete) return null;
    const pro = !!options.pro;
    const { before, after } = scoresAround(game, position);
    // Los equipos con el marcador de después de ese turno (no el de ahora)
    const away = { ...game.away, runs: after.away };
    const home = { ...game.home, runs: after.home };
    const then = (team: GameTeam) => (team.id === game.home.id ? home : away);
    const replay = (event: PlayEvent): PlayEvent => ({ ...event, key: `replay-${atBat.i}`, team: then(event.team), rival: then(event.rival), away, home, replay: true });

    if (!pro && walkoffAtBat(game) === atBat) {
        return replay({ key: '', kind: 'walkoff', team: game.home, rival: game.away, away: game.away, home: game.home, atBat, inning: null, league: game.league });
    }
    const side = atBat.top ? 'away' : 'home';
    const scored = Math.max(0, after[side] - before[side]);
    const kind = atBatKind(atBat, pro, scored > 0);
    if (!kind) {
        // El turno lo cerró un corredor (atrapado robando con el tercer out): se repite ese robo. Cualquier otro resultado
        // sin animación (selección, por ejemplo) no se repite aunque haya habido un robo antes en el turno
        if (!STEAL.test(atBat.event ?? '')) return null;
        const steals = atBat.actions.map((action, index) => (STEAL.test(action.event ?? '') ? index : -1)).filter((index) => index >= 0);
        return steals.length ? replayActionOf(game, atBat.i, steals[steals.length - 1], options) : null;
    }
    if (pro) return replay(atBatEvent(game, atBat, kind, { pro, runs: scored > 0 ? { count: scored, away: after.away, home: after.home } : undefined }));
    const previous = game.atBats.find((item) => item.i === atBat.i - 1);
    const sameHalf = !!previous && previous.inning === atBat.inning && previous.top === atBat.top;
    const bases = movesBases(kind) ? (sameHalf ? basesOfMask(previous.post) : { first: false, second: false, third: false }) : null;
    return replay(atBatEvent(game, atBat, kind, { pro, runs: liteRuns(game, atBat, kind), bases }));
};

/**
 * Repetición de una acción de un turno pedida desde la cronología (robo, atrapado robando, cambio de lanzador,
 * emergente; en el PRO también WP/PB): la misma animación que salió en vivo. Sirve también para el turno que está en
 * curso. null si esa acción no se anima.
 */
export const replayActionOf = (game: GameDetail, atBatIndex: number, actionIndex: number, options: PlayEventOptions = {}): PlayEvent | null => {
    const position = game.atBats.findIndex((item) => item.i === atBatIndex);
    if (position < 0) return null;
    const event = options.pro ? proActionEvent(game, position, actionIndex) : liteActionEvent(game, position, actionIndex);
    return event && { ...event, key: `replay-${atBatIndex}-${actionIndex}`, replay: true };
};

/** Pausa después de una repetición antes de poder pedir otra */
export const REPLAY_COOLDOWN_MS = 1200;

/** Candado de las repeticiones de una pantalla de juego: si hay una saliendo y desde cuándo se puede pedir otra */
export interface ReplayGateState {
    playing: boolean;
    readyAt: number;
}

const replayAllowed = (state: ReplayGateState, now: number) => !state.playing && now >= state.readyAt;

/**
 * Una repetición a la vez y con pausa entre una y otra: mientras sale, los toques se ignoran (ni la reinician ni hacen
 * cola) y, al terminar (sola o tocándola), hay que esperar REPLAY_COOLDOWN_MS. Lógica pura: `now` lo pone quien llama.
 * La misma de la web.
 */
export const replayGate = {
    idle: { playing: false, readyAt: 0 } as ReplayGateState,
    allowed: replayAllowed,
    /** El estado con la repetición saliendo, o null si el toque se ignora */
    start: (state: ReplayGateState, now: number): ReplayGateState | null => (replayAllowed(state, now) ? { playing: true, readyAt: state.readyAt } : null),
    /** Terminó: empieza la pausa (si ya había terminado, no la alarga) */
    end: (state: ReplayGateState, now: number): ReplayGateState => (state.playing ? { playing: false, readyAt: now + REPLAY_COOLDOWN_MS } : state)
};
