// Jugadas que disparan una animación en la pantalla del juego en vivo: se comparan dos lecturas seguidas del
// juego y solo cuenta lo nuevo (al abrir el juego no se repite nada de lo que ya pasó).
// El modo PRO (newPlayEvents con { pro: true }) suma base por bolas, error, robo, WP/PB, cambio de lanzador, carrera,
// el aviso de sin hit y «Te lo perdiste» al volver del segundo plano; el Lite sigue igual.
import type { AtBat, GameDetail, GameTeam, LeagueId, SeriesStatus } from '../types';
import type { AnimationMode } from '../state/preferences';
import { proActive } from './pro';
import { basesOf, type Bases } from './runners';

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
    // Solo en el modo PRO
    | 'walk'
    | 'error'
    | 'steal'
    | 'wildPitch'
    | 'pitchingChange'
    | 'run'
    | 'noHitter'
    | 'missed';

/** Persona que entra o sale (cambio de lanzador, emergente) */
export interface PlayPerson {
    id: number | null;
    name: string;
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
    /** Hits y jonrones del Lite: quién estaba en base antes (de la lectura anterior; null si no se sabe) */
    bases?: Bases | null;
    /**
     * Carreras que entraron con la jugada y el marcador después. En el PRO, en cada jugada que las trae; en el Lite, en
     * los hits y jonrones (del marcador del turno anterior al de este) para los corredores que anotan y «Remolca N».
     */
    runs?: { count: number; away: number; home: number };
    // ---- Modo PRO
    /** Juego de la jugada (para leer sus extras PRO: corredores, quién fildeó, medidas del parque) */
    gamePk?: number | null;
    /** Base por bolas, intencional o golpeado */
    walk?: 'bb' | 'ibb' | 'hbp';
    /** Robo (o atrapado robando): a qué base (4 = home) y quién */
    steal?: { base: 2 | 3 | 4; caught: boolean; runner: string | null };
    /** Lanzamiento descontrolado o passed ball */
    wild?: 'wp' | 'pb';
    /** Cambio de lanzador: quién entra y quién sale */
    change?: { in: PlayPerson | null; out: PlayPerson | null };
    /** Sin hit: entradas completas del equipo que batea sin un hit */
    noHit?: { innings: number };
    /** Índice de la acción dentro del turno (robo, WP, cambio) */
    action?: number;
    /** «Te lo perdiste»: lo que pasó mientras no se miraba */
    missed?: MissedSummary;
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
    const events: PlayEvent[] = [];
    // Los corredores de la lectura anterior son los de antes de la primera jugada nueva (de las siguientes no se sabe)
    let basesKnown = true;
    const battingRuns = (atBat: AtBat | undefined, top: boolean) => (atBat ? (top ? atBat.away : atBat.home) : 0);

    for (const atBat of next.atBats) {
        if (!atBat.complete || done.has(atBat.i)) continue;
        // Cualquier turno nuevo (también una base por bolas, que el Lite no anima) cambia las bases para los siguientes
        const firstNew = basesKnown;
        basesKnown = false;
        const variant = outVariant(atBat);
        const kind = playKind(atBat) ?? (variant ? 'out' : null);
        if (!kind) continue;
        const batting = atBat.top ? next.away : next.home;
        const fielding = atBat.top ? next.home : next.away;
        // El out lo celebra el equipo que lo hizo (como el ponche)
        const defense = kind === 'k' || kind === 'out';
        // Hits y jonrones: quién estaba en base y cuántas entraron (marcador del turno anterior contra el de este)
        const hit = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'hr';
        const after = battingRuns(atBat, atBat.top);
        const before = battingRuns(next.atBats.find((other) => other.i === atBat.i - 1), atBat.top);
        const scored = hit && after !== null && before !== null && atBat.away !== null && atBat.home !== null && after > before ? after - before : 0;
        events.push({
            key: `ab-${atBat.i}`,
            kind,
            team: defense ? fielding : batting,
            rival: defense ? batting : fielding,
            out: kind === 'out' && variant ? { variant, outs: atBat.outs ?? 0 } : undefined,
            away: next.away,
            home: next.home,
            atBat,
            inning: null,
            venue: next.venue,
            bases: hit && firstNew ? basesOf(prev.runners) : null,
            runs: scored > 0 ? { count: scored, away: atBat.away ?? 0, home: atBat.home ?? 0 } : undefined,
            strikeouts:
                kind === 'k'
                    ? next.atBats.filter((other) => other.complete && other.i <= atBat.i && other.pitcher.id === atBat.pitcher.id && playKind(other) === 'k').length
                    : undefined
        });
    }

    // Bateador o corredor emergente: acciones nuevas de cambio ofensivo (PH / PR)
    const seenActions = new Map(prev.atBats.map((atBat) => [atBat.i, atBat.actions.length]));
    for (const atBat of next.atBats) {
        atBat.actions.forEach((action, index) => {
            if (index < (seenActions.get(atBat.i) ?? 0) || !action.sub) return;
            const kind: PlayKind | null = action.sub.pos === 'PH' ? 'pinchHitter' : action.sub.pos === 'PR' ? 'pinchRunner' : null;
            if (!kind) return;
            events.push({
                key: `sub-${atBat.i}-${index}`,
                kind,
                team: atBat.top ? next.away : next.home,
                rival: atBat.top ? next.home : next.away,
                away: next.away,
                home: next.home,
                atBat,
                inning: null,
                sub: { in: action.sub.in, out: action.sub.out }
            });
        });
    }

    // Final del juego: victoria del ganador, o campeonato si con este juego se lleva el título
    if (next.state === 'final') {
        const winner = next.home.isWinner ? next.home : next.away.isWinner ? next.away : null;
        if (winner) {
            const { champion, record } = titleClinch(next.series ?? prev.series, winner.id);
            events.push({
                key: `final-${next.gamePk}`,
                kind: champion ? 'champion' : 'win',
                team: winner,
                rival: winner === next.home ? next.away : next.home,
                away: next.away,
                home: next.home,
                atBat: null,
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
 * plano, las jugadas ya pasaron: no se repiten y a lo sumo sale el final del juego (victoria o campeonato) como resumen.
 * En PRO (`pro`, por defecto el modo de la cuenta abierta) salen los eventos PRO y, al volver tras un rato fuera, una sola
 * tarjeta «Te lo perdiste» con lo que pasó en vez de repetir jugadas viejas.
 */
export const playsSince = (prev: { game: GameDetail; at: number } | null, next: GameDetail, at: number, background = false, pro = proActive()): PlayEvent[] => {
    const events = newPlayEvents(prev?.game, next, { pro });
    const stale = background || !prev || at - prev.at > STALE_READ_MS;
    if (!pro) return stale ? events.filter((event) => event.kind === 'win' || event.kind === 'champion') : events;
    return proPlaysSince(prev, next, events, stale, background);
};

/** Cola de animaciones: la que se está mostrando (la primera) no sale; de las que esperan quedan las más nuevas */
export const queuePlays = (queue: PlayEvent[], fresh: PlayEvent[], max = 4): PlayEvent[] => {
    const newest = (list: PlayEvent[], count: number) => list.slice(Math.max(0, list.length - count));
    if (!queue.length) return newest(fresh, max);
    return [queue[0], ...newest([...queue.slice(1), ...fresh], max - 1)];
};

/** Las que siempre salen aunque el juego no sea de tu equipo */
const BIG: PlayKind[] = ['hr', 'k', 'inning', 'win', 'champion', 'noHitter'];

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

const WALKS: Record<string, 'bb' | 'ibb' | 'hbp'> = { walk: 'bb', intent_walk: 'ibb', hit_by_pitch: 'hbp' };
const ERRORS = ['field_error', 'catcher_interf', 'fielder_interference'];

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

const scoreOf = (atBat: AtBat | undefined, fallback: { away: number; home: number }) =>
    atBat && atBat.away !== null && atBat.home !== null ? { away: atBat.away, home: atBat.home } : fallback;

/** Eventos del modo PRO: lo del Lite (con las carreras de cada jugada) más los eventos nuevos, en el orden del juego */
const proPlayEvents = (prev: GameDetail | null | undefined, next: GameDetail): PlayEvent[] => {
    if (!prev || prev.gamePk !== next.gamePk || prev.state !== 'live') return [];
    const done = new Set(prev.atBats.filter((atBat) => atBat.complete).map((atBat) => atBat.i));
    const seenActions = new Map(prev.atBats.map((atBat) => [atBat.i, atBat.actions.length]));
    const roles = (atBat: AtBat | null, batting: boolean, team?: GameTeam) => {
        const top = atBat ? atBat.top : true;
        const own = team ?? (batting === top ? next.away : next.home);
        return { team: own, rival: own === next.away ? next.home : next.away, away: next.away, home: next.home, atBat, inning: null, gamePk: next.gamePk };
    };
    const ordered: { order: number; event: PlayEvent }[] = [];
    // Marcador que ya se veía: así una carrera que entró con WP no se cuenta dos veces al cerrar el turno
    const shown = { away: prev.away.runs, home: prev.home.runs };
    const ordinal = (atBat: AtBat, index: number) => atBat.i * 1000 + index;

    next.atBats.forEach((atBat, position) => {
        // Acciones nuevas dentro del turno: robos, WP/PB y cambios de lanzador (los emergentes, como en el Lite)
        atBat.actions.forEach((action, index) => {
            if (index < (seenActions.get(atBat.i) ?? 0) || !action.event) return;
            const code = action.event;
            const key = `act-${atBat.i}-${index}`;
            if (/^(stolen_base|caught_stealing|pickoff_caught_stealing)_/.test(code)) {
                const target = stealBase(code);
                if (!target) return;
                const caught = !code.startsWith('stolen_base');
                ordered.push({ order: ordinal(atBat, index), event: { key, kind: 'steal', ...roles(atBat, !caught), steal: { base: target, caught, runner: stealRunner(action.desc) }, action: index } });
            } else if (code === 'wild_pitch' || code === 'passed_ball') {
                ordered.push({ order: ordinal(atBat, index), event: { key, kind: 'wildPitch', ...roles(atBat, false), wild: code === 'wild_pitch' ? 'wp' : 'pb', action: index } });
            } else if (code === 'pitching_substitution') {
                const side = atBat.top ? 'home' : 'away';
                const names = pitchingChangeNames(action.desc);
                const before = next.atBats
                    .slice(0, position)
                    .reverse()
                    .find((other) => other.top === atBat.top);
                const incoming = pitcherByName(next, side, names?.in) ?? { id: atBat.pitcher.id, name: atBat.pitcher.name };
                const outgoing = pitcherByName(next, side, names?.out) ?? (before && before.pitcher.id !== incoming.id ? { id: before.pitcher.id, name: before.pitcher.name } : null);
                ordered.push({ order: ordinal(atBat, index), event: { key, kind: 'pitchingChange', ...roles(atBat, false), change: { in: incoming, out: outgoing }, action: index } });
            } else if (action.sub && (action.sub.pos === 'PH' || action.sub.pos === 'PR')) {
                ordered.push({
                    order: ordinal(atBat, index),
                    event: { key: `sub-${atBat.i}-${index}`, kind: action.sub.pos === 'PH' ? 'pinchHitter' : 'pinchRunner', ...roles(atBat, true), sub: { in: action.sub.in, out: action.sub.out } }
                });
            }
        });

        if (!atBat.complete || done.has(atBat.i)) return;
        // Carreras de esta jugada: lo que subió el marcador sobre lo que ya se veía
        const previous = scoreOf(
            next.atBats
                .slice(0, position)
                .reverse()
                .find((other) => other.complete),
            { away: 0, home: 0 }
        );
        const after = scoreOf(atBat, previous);
        const side = atBat.top ? 'away' : 'home';
        const scored = Math.max(0, after[side] - Math.max(previous[side], shown[side]));
        shown.away = Math.max(shown.away, after.away);
        shown.home = Math.max(shown.home, after.home);
        const runs = scored > 0 ? { count: scored, away: after.away, home: after.home } : undefined;

        const variant = outVariant(atBat);
        const lite = playKind(atBat) ?? (variant ? 'out' : null);
        const walk = atBat.event ? WALKS[atBat.event] : undefined;
        const kind: PlayKind | null = lite ?? (walk ? 'walk' : atBat.event && ERRORS.includes(atBat.event) ? 'error' : runs ? 'run' : null);
        if (!kind) return;
        const defense = kind === 'k' || kind === 'out';
        ordered.push({
            order: ordinal(atBat, 999),
            event: {
                key: `ab-${atBat.i}`,
                kind,
                ...roles(atBat, !defense),
                out: kind === 'out' && variant ? { variant, outs: atBat.outs ?? 0 } : undefined,
                walk,
                runs,
                strikeouts:
                    kind === 'k'
                        ? next.atBats.filter((other) => other.complete && other.i <= atBat.i && other.pitcher.id === atBat.pitcher.id && playKind(other) === 'k').length
                        : undefined
            }
        });
    });

    // Carreras que entraron sin cerrar un turno (WP, PB, robo de home, balk): «+1» con el marcador nuevo
    (['away', 'home'] as const).forEach((side) => {
        const extra = next[side].runs - shown[side];
        if (extra <= 0) return;
        const current = next.atBats[next.atBats.length - 1] ?? null;
        ordered.push({
            order: Number.MAX_SAFE_INTEGER - 2,
            event: { key: `run-${side}-${next[side].runs}`, kind: 'run', ...roles(current, true, next[side]), runs: { count: extra, away: next.away.runs, home: next.home.runs } }
        });
    });

    const events = ordered.sort((a, b) => a.order - b.order).map((item) => item.event);

    // Final o fin de media entrada (igual que en el Lite) y, desde la 5.ª, el aviso de sin hit
    for (const event of litePlayEvents(prev, next)) {
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
