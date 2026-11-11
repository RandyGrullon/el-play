// Jugadas que disparan una animación en la pantalla del juego en vivo: se comparan dos lecturas seguidas del
// juego y solo cuenta lo nuevo (al abrir el juego no se repite nada de lo que ya pasó).
import type { AtBat, GameDetail, GameTeam, LeagueId, PitcherLine, Pitch, SeriesStatus } from '../types';
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
    | 'lead'
    | 'walkoff';

/** Persona que entra o sale (cambio de lanzador) o que roba */
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
    /** Hits, jonrones y bases por bolas: quién estaba en base antes (de la lectura anterior; null si no se sabe) */
    bases?: Bases | null;
    /** Hits, jonrones y bases por bolas: carreras del equipo al bate antes y después de la jugada */
    runs?: { before: number; after: number } | null;
    /** Reto del ABS */
    abs?: AbsPlay;
    /** Base por bolas, intencional o golpeado */
    walk?: 'bb' | 'ibb' | 'hbp';
    /** Robo (o atrapado robando): a qué base (4 = home) y quién */
    steal?: { base: 2 | 3 | 4; caught: boolean; runner: PlayPerson | null };
    /** Cambio de lanzador: quién entra y quién sale, con lo que hizo en el juego el que sale */
    change?: { in: PlayPerson; out: PlayPerson | null; line: PitcherLine | null };
    /** Cambio en el marcador (el protagonista es el equipo que anotó) y cómo estaba antes */
    lead?: { change: LeadChange; before: { away: number; home: number } };
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

const WALKS: Record<string, 'bb' | 'ibb' | 'hbp'> = { walk: 'bb', intent_walk: 'ibb', hit_by_pitch: 'hbp' };
const STEAL = /^(stolen_base|caught_stealing|pickoff_caught_stealing)_/;

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

/** Alguien del box por su nombre de la narración (para tener su id y su foto) */
const byName = (list: { id: number; name: string }[] | undefined, name: string | null | undefined): PlayPerson | null => {
    if (!name) return null;
    const found = list?.find((person) => sameName(person.name, name));
    return { id: found?.id ?? null, name };
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
            // El equipo que retó (MLB a veces cambia el id en la revisión: vale el último)
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
                abs: { phase, overturned: phase === 'result' && abs.overturned, call, original, by, player: abs.by?.name ?? null, remaining: count?.remaining ?? null, pitch }
            });
        });
    }
    return events;
};

const scoreOf = (atBat: AtBat | undefined, top: boolean) => (atBat ? (top ? atBat.away : atBat.home) : 0);

/**
 * Animación del resultado de un turno terminado (hit, jonrón, ponche, out con su tipo, base por bolas o golpeado): la
 * misma en vivo y al repetirla desde el historial. `bases`: quién estaba en base antes (null si no se sabe). Las
 * carreras de antes y de después salen del marcador de ese turno y del anterior. null si el resultado no se anima.
 */
const atBatEvent = (game: GameDetail, atBat: AtBat, bases: Bases | null): PlayEvent | null => {
    const variant = outVariant(atBat);
    const walk = atBat.event ? WALKS[atBat.event] : undefined;
    const kind = playKind(atBat) ?? (variant ? 'out' : walk ? 'walk' : null);
    if (!kind) return null;
    const batting = atBat.top ? game.away : game.home;
    const fielding = atBat.top ? game.home : game.away;
    // El out lo celebra el equipo que lo hizo (como el ponche)
    const defense = kind === 'k' || kind === 'out';
    // Jugadas en las que corren las bases (la base por bolas solo empuja a los forzados)
    const moves = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'hr' || kind === 'walk';
    const after = scoreOf(atBat, atBat.top);
    const before = scoreOf(game.atBats.find((other) => other.i === atBat.i - 1), atBat.top);
    return {
        key: `ab-${atBat.i}`,
        kind,
        team: defense ? fielding : batting,
        rival: defense ? batting : fielding,
        out: kind === 'out' && variant ? { variant, outs: atBat.outs ?? 0 } : undefined,
        walk,
        away: game.away,
        home: game.home,
        atBat,
        inning: null,
        venue: game.venue,
        bases: moves ? bases : null,
        runs: moves && after !== null && before !== null && after >= before ? { before, after } : null,
        strikeouts:
            kind === 'k'
                ? game.atBats.filter((other) => other.complete && other.i <= atBat.i && other.pitcher.id === atBat.pitcher.id && playKind(other) === 'k').length
                : undefined
    };
};

/** El turno que dejó en el terreno al local (ganó en la baja de la última entrada o en extra); null si no fue así */
const walkoffAtBat = (game: GameDetail): AtBat | null => {
    const last = game.atBats[game.atBats.length - 1];
    return game.state === 'final' && game.home.isWinner && !!last && !last.top && last.inning >= (game.scheduledInnings || 9) ? last : null;
};

export const newPlayEvents = (prev: GameDetail | null | undefined, next: GameDetail): PlayEvent[] => {
    // Solo si ya se estaba viendo este juego en vivo (un jonrón que deja en el terreno sí sale aunque el juego ya diga «final»)
    if (!prev || prev.gamePk !== next.gamePk || prev.state !== 'live') return [];
    const done = new Set(prev.atBats.filter((atBat) => atBat.complete).map((atBat) => atBat.i));
    const events: PlayEvent[] = absEvents(prev, next);
    // Jugadas y acciones en el orden en que pasaron: las acciones de un turno (robo, cambio de lanzador) van antes de su resultado
    const ordered: { order: number; event: PlayEvent }[] = [];
    const orderOf = (atBat: AtBat, index: number) => atBat.i * 1000 + index;
    const sides = (atBat: AtBat) => ({ batting: atBat.top ? next.away : next.home, fielding: atBat.top ? next.home : next.away });
    // Los corredores de la lectura anterior son los de antes de la primera jugada nueva (de las siguientes no se sabe)
    let basesKnown = true;

    for (const atBat of next.atBats) {
        if (!atBat.complete || done.has(atBat.i)) continue;
        // Cualquier turno nuevo cambia las bases para los siguientes
        const firstNew = basesKnown;
        basesKnown = false;
        const event = atBatEvent(next, atBat, firstNew ? basesOf(prev.runners) : null);
        if (event) ordered.push({ order: orderOf(atBat, 999), event });
    }

    // Acciones nuevas dentro de los turnos: emergentes (PH / PR), robos y cambios de lanzador
    const seenActions = new Map(prev.atBats.map((atBat) => [atBat.i, atBat.actions.length]));
    next.atBats.forEach((atBat, position) => {
        atBat.actions.forEach((action, index) => {
            if (index < (seenActions.get(atBat.i) ?? 0)) return;
            const { batting, fielding } = sides(atBat);
            const shared = { away: next.away, home: next.home, atBat, inning: null };
            const code = action.event ?? '';
            const key = `act-${atBat.i}-${index}`;
            if (action.sub && (action.sub.pos === 'PH' || action.sub.pos === 'PR')) {
                ordered.push({
                    order: orderOf(atBat, index),
                    event: { key: `sub-${atBat.i}-${index}`, kind: action.sub.pos === 'PH' ? 'pinchHitter' : 'pinchRunner', team: batting, rival: fielding, ...shared, sub: { in: action.sub.in, out: action.sub.out } }
                });
            } else if (STEAL.test(code)) {
                const base = stealBase(code);
                if (!base) return;
                // El robo lo celebra el corredor; el atrapado, la defensa (como un out)
                const caught = !code.startsWith('stolen_base');
                const runner = byName(next.box?.[atBat.top ? 'away' : 'home']?.batters, stealRunner(action.desc));
                ordered.push({ order: orderOf(atBat, index), event: { key, kind: 'steal', team: caught ? fielding : batting, rival: caught ? batting : fielding, ...shared, steal: { base, caught, runner } } });
            } else if (code === 'pitching_substitution') {
                const pitchers = next.box?.[atBat.top ? 'home' : 'away']?.pitchers;
                const names = pitchingChangeNames(action.desc);
                // El que sale, si la narración no lo dice: el último que lanzó a este mismo equipo
                const before = next.atBats
                    .slice(0, position)
                    .reverse()
                    .find((other) => other.top === atBat.top);
                const incoming = byName(pitchers, names?.in) ?? { id: atBat.pitcher.id, name: atBat.pitcher.name };
                const outgoing = byName(pitchers, names?.out) ?? (before && before.pitcher.id !== incoming.id ? { id: before.pitcher.id, name: before.pitcher.name } : null);
                const line = outgoing ? pitchers?.find((pitcher) => (outgoing.id !== null ? pitcher.id === outgoing.id : sameName(pitcher.name, outgoing.name))) ?? null : null;
                ordered.push({ order: orderOf(atBat, index), event: { key, kind: 'pitchingChange', team: fielding, rival: batting, ...shared, change: { in: incoming, out: outgoing, line } } });
            }
        });
    });
    events.push(...ordered.sort((a, b) => a.order - b.order).map((item) => item.event));

    // Cambio en el marcador (después de la jugada que lo hizo): abre el marcador, se van arriba, le dan la vuelta o empatan
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
            const walkoff = winner === next.home ? walkoffAtBat(next) : null;
            events.push({
                key: `final-${next.gamePk}`,
                kind: champion ? 'champion' : walkoff ? 'walkoff' : 'win',
                team: winner,
                rival: winner === next.home ? next.away : next.home,
                away: next.away,
                home: next.home,
                atBat: walkoff,
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

/** Las que siempre salen aunque el juego no sea de tu equipo */
const BIG: PlayKind[] = ['hr', 'k', 'inning', 'win', 'champion', 'abs', 'lead', 'walkoff'];

/** Filtra las animaciones según lo elegido en «Más» (en «smart», tu equipo las ve todas) */
export const forMode = (events: PlayEvent[], mode: 'all' | 'smart' | 'off', favoriteTeamId: number | null, teamIds: number[]) => {
    if (mode === 'off') return [];
    if (mode === 'all' || (favoriteTeamId !== null && teamIds.includes(favoriteTeamId))) return events;
    return events.filter((event) => BIG.includes(event.kind));
};

/**
 * Repetición de una jugada ya hecha, pedida desde el historial: la misma animación que salió en vivo, armada para ese
 * turno. Las bases de antes salen del turno anterior de la misma media entrada (su `post`; vacías en el primero de la
 * media) y el turno que dejó en el terreno al local repite «¡En el terreno!». null si el turno no terminó o su
 * resultado no se anima. No pasa por «Más» (una repetición pedida sale aunque sea de las chicas).
 */
export const replayEventOf = (game: GameDetail, atBatIndex: number): PlayEvent | null => {
    const atBat = game.atBats.find((item) => item.i === atBatIndex);
    if (!atBat?.complete) return null;
    const key = `replay-${atBat.i}`;
    if (walkoffAtBat(game) === atBat) {
        return { key, kind: 'walkoff', team: game.home, rival: game.away, away: game.away, home: game.home, atBat, inning: null, league: game.league, replay: true };
    }
    const previous = game.atBats.find((item) => item.i === atBat.i - 1);
    const sameHalf = !!previous && previous.inning === atBat.inning && previous.top === atBat.top;
    const event = atBatEvent(game, atBat, sameHalf ? basesOfMask(previous.post) : { first: false, second: false, third: false });
    return event && { ...event, key, replay: true };
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
 */
export const replayGate = {
    idle: { playing: false, readyAt: 0 } as ReplayGateState,
    allowed: replayAllowed,
    /** El estado con la repetición saliendo, o null si el toque se ignora */
    start: (state: ReplayGateState, now: number): ReplayGateState | null => (replayAllowed(state, now) ? { playing: true, readyAt: state.readyAt } : null),
    /** Terminó: empieza la pausa (si ya había terminado, no la alarga) */
    end: (state: ReplayGateState, now: number): ReplayGateState => (state.playing ? { playing: false, readyAt: now + REPLAY_COOLDOWN_MS } : state)
};
