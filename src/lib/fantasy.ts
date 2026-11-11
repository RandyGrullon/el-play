// Fantasy de El Play: cada día armas tu equipo (5 bateadores y 1 lanzador de los juegos de ese día, máximo 2 por
// equipo o 3 si hay un solo juego, sin pasarte de los créditos del día, un capitán que suma ×1,5) y pronosticas quién
// gana cada juego. Cada pelotero se cierra cuando empieza su juego. Para jugar hace falta cuenta (Supabase): el equipo vive en la cuenta y el teléfono
// guarda una copia por usuario.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { LeagueId, ScheduleGame } from '../types';
import { isNotPlayed, isOnHold, isSuspended } from './baseball';
import { API_BASE } from './config';
import { getItem, onHydrated, removeItem, setItem } from './storage';

export interface FantasyLine {
    [stat: string]: number | string;
}

/**
 * Cómo llega al juego (lo manda el servidor nuevo; sin él, la app lo deduce de lo de siempre):
 * bateador confirmado en la alineación del día, esperado (abrió el último juego) o en la banca; lanzador abridor
 * probable, descansando (abrió hace 4 días o menos) o en el bullpen; pospuesto, o no jugó (su juego terminó sin él).
 */
// «rotation» no viene del servidor: es el «probable» estimado por la rotación (estimated), con su propia etiqueta
export type PlayerStatus = 'confirmed' | 'expected' | 'bench' | 'probable' | 'rotation' | 'bullpen' | 'resting' | 'postponed' | 'dnp';

/** Números cortos de la temporada (el servidor nuevo): bateador avg/ops/hr, lanzador era/whip/k */
export interface FantasySeasonLine {
    avg?: string;
    ops?: string;
    hr?: number;
    era?: string;
    whip?: string;
    k?: number;
    g: number;
}

export interface FantasyPlayer {
    id: number;
    name: string;
    teamId: number;
    gamePk: number;
    role: 'B' | 'P';
    pos: string;
    starter: boolean;
    played: boolean;
    line: FantasyLine | null;
    points: number;
    /** Créditos que cuesta ese día (solo los días que se juegan con créditos) */
    price?: number;
    /** Puntos que se esperan de él ese día (con lo de antes del día: no cambia mientras se juega) */
    proj?: number;
    /** Lanzador que abrió el último juego de su equipo: hoy le toca descansar */
    rest?: boolean;
    /** Lanzador de un juego por empezar: hace cuántos días abrió por última vez (si abrió en los 10 días anteriores) */
    startedAgo?: number;
    /** Lanzador de un juego por empezar: en cuántos juegos de los 10 días anteriores lanzó */
    outings?: number;
    // Lo del servidor nuevo (rules v2). Todo es opcional: sin ello la app sigue como antes
    /** Rival del día (home: juega en casa) */
    opp?: { id: number; abbrev: string; home: boolean } | null;
    status?: PlayerStatus;
    /** Abridor estimado por la rotación (la liga no lo anunció): el servidor lo manda con status «probable» */
    estimated?: boolean;
    /** Puntos de fantasy de sus últimos 5 juegos, del más viejo al más nuevo (pueden ser menos) */
    last5?: number[];
    season?: FantasySeasonLine | null;
    /** Precio de hoy menos el del día de juego anterior (null si no se sabe) */
    priceDelta?: number | null;
}

export type FantasyGameStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'suspended';

export interface FantasyGame extends ScheduleGame {
    state: ScheduleGame['state'];
    /** Primer lanzamiento (solo juegos empezados en vivo): con la hora por definir, ahí se cierra */
    firstPitch?: string;
    /** Servidor nuevo: el estado para el fantasy y los abridores probables (ids) */
    status?: FantasyGameStatus;
    probables?: { away: number | null; home: number | null };
}

type Scoring = { batter: Record<string, number>; pitcher: Record<string, number> };

/** Las reglas del día que manda el servidor nuevo (rules v2): de ahí salen todos los números de la ayuda */
export interface FantasyRules {
    version: number;
    roster: { batters: number; pitchers: number };
    /** El máximo de verdad por equipo ese día (sube los días de 1 o 2 juegos) */
    perTeam: number;
    /** Créditos del día; null = ese día no hay tope */
    budget: number | null;
    captain: number;
    picks: { points: number };
    scoring: Scoring;
    prices: { min: number; max: number; step: number; noData: number; seasonWeights: number[]; frozen: boolean };
    lock: 'per-game';
    timezone: string;
}

export interface FantasyDay {
    league: LeagueId;
    date: string;
    games: FantasyGame[];
    teams: Record<string, { id: number; abbrev: string; color: string; logo: string }>;
    players: FantasyPlayer[];
    scoring: Scoring;
    /** Días con créditos: presupuesto del equipo y rango de precios (el servidor pone los precios) */
    credits?: { budget: number; min: number; max: number };
    /** Servidor nuevo: las reglas del día (puede faltar o venir a medias: cada número tiene su valor de siempre) */
    rules?: Partial<FantasyRules>;
    /** Cuándo llegó (lo pone la app): cada respuesta es un objeto nuevo y las pantallas vuelven a mirar la hora */
    fetchedAt?: number;
}

export const RULES = { batters: 5, pitchers: 1, perTeam: 2, captain: 1.5, pick: 10, budget: 50 };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Máximo por equipo ese día: el que manda el servidor (rules.perTeam) o, sin él, 2 o los que hagan falta para poder
 * llenar los 6 con los equipos que juegan (con un solo juego, como en la Serie Final o la final de la Serie del Caribe,
 * 3 por equipo). Igual que la web (src/lib/fantasy.ts) y su servidor (server/services/fantasyScore.js).
 */
export const perTeamLimit = (day: (Pick<FantasyDay, 'games'> & { rules?: FantasyDay['rules'] }) | null | undefined) => {
    if (finite(day?.rules?.perTeam) && day.rules.perTeam > 0) return day.rules.perTeam;
    // Los juegos pospuestos no cuentan (sus equipos no juegan ese día), como en el servidor
    const teams = new Set((day?.games ?? []).filter((game) => !isPostponed(game)).flatMap((game) => [game.away?.id, game.home?.id]).filter(Boolean)).size;
    return teams ? Math.max(RULES.perTeam, Math.ceil((RULES.batters + RULES.pitchers) / teams)) : RULES.perTeam;
};

/** Créditos del día: los de rules (null = sin tope) o, sin rules, los de `credits`; null si ese día no hay tope */
export const budgetOf = (day: Pick<FantasyDay, 'credits' | 'rules'> | null | undefined): number | null => {
    const rules = day?.rules;
    if (rules && 'budget' in rules) return finite(rules.budget) ? rules.budget : null;
    return day?.credits && finite(day.credits.budget) ? day.credits.budget : null;
};

const DEFAULT_PRICES: FantasyRules['prices'] = { min: 4, max: 12, step: 0.5, noData: 5, seasonWeights: [1, 0.5, 0.25, 0.125], frozen: true };

/** Créditos del día con el rango de precios (null si ese día no hay tope): lo que pintan la barra y el selector */
export const creditsOf = (day: Pick<FantasyDay, 'credits' | 'rules'> | null | undefined): { budget: number; min: number; max: number } | null => {
    const budget = budgetOf(day);
    if (budget === null) return null;
    const prices = day?.rules?.prices;
    return {
        budget,
        min: finite(prices?.min) ? prices.min : finite(day?.credits?.min) ? day.credits.min : DEFAULT_PRICES.min,
        max: finite(prices?.max) ? prices.max : finite(day?.credits?.max) ? day.credits.max : DEFAULT_PRICES.max
    };
};

/** Las claves de la puntuación como las usa la app (y la tabla de puntos) aunque el servidor las mande de otra forma */
const SCORING_KEYS: Record<string, string> = { hbp: 'hitByPitch', hitbypitch: 'hitByPitch', strikeout: 'strikeOut', strikeouts: 'strikeOut', homerun: 'homeRun', stolenbase: 'stolenBase', earnedrun: 'earnedRun' };

/** El orden de la tabla de puntos (el de la ayuda) */
export const SCORING_ORDER = {
    batter: ['single', 'double', 'triple', 'homeRun', 'run', 'rbi', 'walk', 'hitByPitch', 'stolenBase', 'strikeOut'],
    pitcher: ['out', 'strikeOut', 'win', 'save', 'earnedRun', 'hit', 'walk']
} as const;

const DEFAULT_SCORING: Scoring = {
    batter: { single: 3, double: 5, triple: 8, homeRun: 10, run: 2, rbi: 2, walk: 2, hitByPitch: 2, stolenBase: 5, strikeOut: -1 },
    pitcher: { out: 1, strikeOut: 2, win: 5, save: 5, earnedRun: -2, hit: -0.5, walk: -0.5 }
};

const normalizeGroup = (group: Record<string, unknown> | undefined) => {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(group ?? {})) if (finite(value)) out[SCORING_KEYS[key.toLowerCase()] ?? key] = value;
    return out;
};

/** La puntuación del día con las claves de la app: la de rules, la de `scoring` o la de siempre */
export const scoringOf = (day: Pick<FantasyDay, 'scoring' | 'rules'> | null | undefined): Scoring => {
    const pick = (role: 'batter' | 'pitcher') => {
        const fromRules = normalizeGroup(day?.rules?.scoring?.[role]);
        if (Object.keys(fromRules).length) return fromRules;
        const fromDay = normalizeGroup(day?.scoring?.[role]);
        return Object.keys(fromDay).length ? fromDay : { ...DEFAULT_SCORING[role] };
    };
    return { batter: pick('batter'), pitcher: pick('pitcher') };
};

/** Todas las reglas del día, con el valor de siempre donde el servidor no manda nada */
export const rulesOf = (day: FantasyDay | null | undefined): FantasyRules => {
    const rules = day?.rules;
    const prices = rules?.prices;
    const credits = creditsOf(day);
    return {
        version: finite(rules?.version) ? rules.version : 1,
        roster: { batters: finite(rules?.roster?.batters) ? rules.roster.batters : RULES.batters, pitchers: finite(rules?.roster?.pitchers) ? rules.roster.pitchers : RULES.pitchers },
        perTeam: perTeamLimit(day),
        budget: budgetOf(day),
        captain: finite(rules?.captain) ? rules.captain : RULES.captain,
        picks: { points: finite(rules?.picks?.points) ? rules.picks.points : RULES.pick },
        scoring: scoringOf(day),
        prices: {
            min: credits?.min ?? (finite(prices?.min) ? prices.min : DEFAULT_PRICES.min),
            max: credits?.max ?? (finite(prices?.max) ? prices.max : DEFAULT_PRICES.max),
            step: finite(prices?.step) ? prices.step : DEFAULT_PRICES.step,
            noData: finite(prices?.noData) ? prices.noData : DEFAULT_PRICES.noData,
            seasonWeights: Array.isArray(prices?.seasonWeights) && prices.seasonWeights.every(finite) ? prices.seasonWeights : DEFAULT_PRICES.seasonWeights,
            frozen: prices?.frozen ?? DEFAULT_PRICES.frozen
        },
        lock: 'per-game',
        timezone: typeof rules?.timezone === 'string' && rules.timezone ? rules.timezone : 'America/Santo_Domingo'
    };
};

/**
 * Historial que escribe la base con su hora (supabase/2026-10-17-antitrampa.sql), en ms; 0 = de antes del arreglo.
 * players: tramos [entró, salió o null]; captain y picks: cambios [valor, cuándo].
 */
export interface EntryHistory {
    v: number;
    players: Record<string, [number, number | null][]>;
    captain?: [number | null, number][];
    picks?: Record<string, [number | null, number][]>;
}

export interface DayEntry {
    lineup: number[];
    captain: number | null;
    picks: Record<string, number>;
    savedAt: number;
    /** Solo en los equipos que vienen de Supabase */
    history?: EntryHistory | null;
    /** Cuando el día terminó: puntos finales (para el historial sin volver a pedir el día) */
    result?: { team: number; picks: number };
}

// ---------------------------------------------------------------- datos del día (servidor)

export const fetchFantasyDay = async (league: LeagueId, date?: string, signal?: AbortSignal) => {
    const response = await fetch(`${API_BASE}/api/v2/fantasy?league=${league}${date ? `&date=${date}` : ''}`, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`fantasy ${response.status}`);
    return { ...((await response.json()) as FantasyDay), fetchedAt: Date.now() };
};

const MINUTE = 60 * 1000;
const startTime = (game: Pick<FantasyGame, 'date'>) => (game.date ? new Date(game.date).getTime() : NaN);

/** Juego pospuesto o cancelado: sus peloteros no suman, no se pueden agregar y los que están se pueden cambiar */
export const isPostponed = (game: Partial<Pick<FantasyGame, 'status' | 'detailedState'>> | null | undefined) => !!game && (game.status === 'postponed' || isNotPlayed(game.detailedState ?? ''));

/**
 * Cada cuánto volver a pedir el día (igual que la web): 20 s con juegos en vivo; 30 s desde 15 minutos antes de un
 * juego que todavía no empieza (así se cierra a tiempo aunque el estado tarde en cambiar); si falta más, se despierta
 * al entrar en esos 15 minutos, sin pasar de 15 minutos entre consultas.
 */
export const fantasyInterval = (day: FantasyDay | undefined, now = Date.now()): number | false => {
    if (!day) return false;
    if (day.games.some((game) => game.state === 'live')) return 20000;
    // Sin los que están en espera (el suspendido con fecha nueva sí cuenta: se cierra cuando se reanuda)
    const pending = day.games.filter((game) => game.state === 'preview' && !game.startTimeTBD && !isPostponed(game) && !isOnHold(game, now)).map((game) => startTime(game) - now);
    if (!pending.length || pending.every((startsIn) => Number.isNaN(startsIn))) return false;
    const next = Math.min(...pending.filter((startsIn) => !Number.isNaN(startsIn)));
    if (next <= 15 * MINUTE) return 30000;
    return Math.min(next - 15 * MINUTE, 15 * MINUTE);
};

/**
 * Al llegar la hora de un juego se vuelve a pintar quien usa el día (igual que la web): sus peloteros se ven cerrados
 * aunque los datos no cambien todavía. setTimeout no aguanta esperas de semanas: si falta mucho, se calcula a las 6 h.
 */
export const useLockClock = (day: FantasyDay | undefined) => {
    const [tick, setTick] = useState(0);
    const next = nextLockAt(day);
    useEffect(() => {
        if (next === null) return;
        const timer = setTimeout(() => setTick((value) => value + 1), Math.min(Math.max(0, next - Date.now()) + 250, 6 * 60 * MINUTE));
        return () => clearTimeout(timer);
    }, [next, tick]);
    return tick;
};

export const useFantasyDay = (league: LeagueId, date?: string, enabled = true) => {
    const query = useQuery({
        queryKey: ['fantasy', league, date ?? 'hoy'],
        queryFn: ({ signal }) => fetchFantasyDay(league, date, signal),
        enabled,
        staleTime: 15000,
        refetchInterval: (query) => fantasyInterval(query.state.data),
        refetchOnWindowFocus: true
    });
    useLockClock(query.data);
    return query;
};

// ---------------------------------------------------------------- lo que eligió el usuario (copia en el teléfono de lo de su cuenta)

const KEY = 'el-play-fantasy-v1';
type Store = Record<string, DayEntry>;
let store: Store | null = null;
let owner: string | null = null;
const listeners = new Set<() => void>();
const storageKey = () => (owner ? `${KEY}:${owner}` : KEY);
onHydrated(() => {
    store = null;
});

const load = (): Store => {
    if (store) return store;
    try {
        store = JSON.parse(getItem(storageKey()) || '{}') as Store;
    } catch {
        store = {};
    }
    return store;
};

const save = (next: Store) => {
    store = next;
    try {
        setItem(storageKey(), JSON.stringify(next));
    } catch {
        /* sin almacenamiento: dura mientras la app esté abierta */
    }
    listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const entryKey = (league: LeagueId, date: string) => `${league}:${date}`;
const EMPTY: DayEntry = { lineup: [], captain: null, picks: {}, savedAt: 0 };
/** El día sin equipo ni pronósticos */
export const EMPTY_ENTRY: DayEntry = EMPTY;

export const useFantasyStore = () => useSyncExternalStore(subscribe, load, () => ({}) as Store);
export const useEntry = (league: LeagueId, date: string | undefined) => {
    const all = useFantasyStore();
    return (date && all[entryKey(league, date)]) || EMPTY;
};

export const getStore = () => load();
/** Reemplaza todo (lo usa la sincronización con la cuenta) */
export const replaceStore = (next: Store) => save(next);

/** Cada cuenta tiene su propia copia en el teléfono; account.ts lo cambia al entrar y al salir */
export const setStoreOwner = (id: string | null) => {
    if (id === owner) return;
    owner = id;
    store = null;
    undoSlot = null;
    listeners.forEach((listener) => listener());
};

/** Lo que se armó sin cuenta en la primera versión del fantasy: pasa una sola vez a la cuenta que entre */
export const takeLegacyStore = (): Store => {
    try {
        const raw = getItem(KEY);
        removeItem(KEY);
        return raw ? (JSON.parse(raw) as Store) : {};
    } catch {
        return {};
    }
};

/**
 * Un pelotero que ya no sale en la lista del día (cambio de roster, o pospuesto con la API de antes) o de un juego
 * pospuesto no suma ni ocupa cupo. Si con él el equipo pasa de 6, sale: la base rechaza más de 6 y entonces ese día no se
 * guardaría ningún cambio. Así, agregar al que lo reemplaza saca al pospuesto. Igual que la web.
 */
export const withoutMissing = (day: FantasyDay, entry: DayEntry): DayEntry => {
    if (entry.lineup.length <= RULES.batters + RULES.pitchers) return entry;
    const lineup = entry.lineup.filter((id) => {
        const player = day.players.find((p) => p.id === id);
        return !!player && !playerPostponed(day, player);
    });
    return { ...entry, lineup, captain: entry.captain !== null && lineup.includes(entry.captain) ? entry.captain : null };
};

// ---------------------------------------------------------------- deshacer (un paso, igual que la web)

/** Qué fue el último cambio que se puede deshacer */
export type UndoKind = 'add' | 'remove' | 'captain' | 'fill' | 'suggested' | 'copy';
type LineupState = Pick<DayEntry, 'lineup' | 'captain'>;
interface UndoSlot {
    key: string;
    kind: UndoKind;
    before: LineupState;
    after: LineupState;
}
let undoSlot: UndoSlot | null = null;
/** Mientras corre withUndo, los cambios de adentro no se anotan uno por uno (cuenta el conjunto) */
let undoBatch: { key: string; kind: UndoKind; before: LineupState } | null = null;

const sameLineup = (a: LineupState, b: LineupState) => a.captain === b.captain && a.lineup.length === b.lineup.length && a.lineup.every((id, index) => b.lineup[index] === id);
const lineupState = (entry: LineupState): LineupState => ({ lineup: [...entry.lineup], captain: entry.captain });

const update = (day: FantasyDay, change: (entry: DayEntry) => DayEntry, kind?: UndoKind) => {
    const all = load();
    const key = entryKey(day.league, day.date);
    const before = all[key] ?? EMPTY;
    const next = { ...withoutMissing(day, change(before)), savedAt: Date.now() };
    if (kind && !undoBatch && !sameLineup(before, next)) undoSlot = { key, kind, before: lineupState(before), after: lineupState(next) };
    save({ ...all, [key]: next });
};

/** Varios cambios que se deshacen juntos (cambiar a uno por otro: quitar, agregar y pasarle la corona) */
export const withUndo = <T>(day: FantasyDay, kind: UndoKind, run: () => T): T => {
    const key = entryKey(day.league, day.date);
    const outer = !undoBatch;
    if (outer) undoBatch = { key, kind, before: lineupState(load()[key] ?? EMPTY) };
    try {
        return run();
    } finally {
        if (outer && undoBatch) {
            const after = lineupState(load()[key] ?? EMPTY);
            if (!sameLineup(undoBatch.before, after)) undoSlot = { key, kind, before: undoBatch.before, after };
            undoBatch = null;
            listeners.forEach((listener) => listener());
        }
    }
};

/**
 * Se puede deshacer mientras nada de lo que cambió se haya cerrado: los que entraron o salieron y, si cambió la corona,
 * el capitán de antes y el de después. Uno que ya no sale en el día no se cierra.
 */
export const undoAllowed = (day: FantasyDay, before: LineupState, after: LineupState, now = Date.now()) => {
    const involved = new Set([...before.lineup.filter((id) => !after.lineup.includes(id)), ...after.lineup.filter((id) => !before.lineup.includes(id))]);
    if (before.captain !== after.captain) {
        if (before.captain !== null) involved.add(before.captain);
        if (after.captain !== null) involved.add(after.captain);
    }
    return [...involved].every((id) => {
        const player = day.players.find((p) => p.id === id);
        return !player || !isLocked(day, player, now);
    });
};

/**
 * El último cambio de ese día si todavía se puede deshacer (el equipo sigue como quedó y nada de eso se cerró), con el
 * pelotero que entró o salió para el texto («Deshacer: agregaste a …»)
 */
export const undoState = (day: FantasyDay, entry: LineupState, now = Date.now()): { kind: UndoKind; playerId: number | null } | null => {
    const slot = undoSlot;
    if (!slot || slot.key !== entryKey(day.league, day.date) || !sameLineup(slot.after, entry)) return null;
    if (!undoAllowed(day, slot.before, slot.after, now)) return null;
    const moved = slot.kind === 'remove' ? slot.before.lineup.find((id) => !slot.after.lineup.includes(id)) : slot.after.lineup.find((id) => !slot.before.lineup.includes(id));
    return { kind: slot.kind, playerId: moved ?? null };
};

/** Deshace el último cambio (un solo paso): vuelven el equipo y la corona de antes; los pronósticos no se tocan */
export const undoLast = (day: FantasyDay, now = Date.now()) => {
    const slot = undoSlot;
    if (!slot || !undoState(day, load()[slot.key] ?? EMPTY, now)) return false;
    undoSlot = null;
    update(day, (current) => ({ ...current, lineup: [...slot.before.lineup], captain: slot.before.captain }));
    return true;
};

/** Se olvida el último cambio */
export const clearUndo = () => {
    undoSlot = null;
    undoBatch = null;
};

/** Arregla el equipo guardado que quedó con más de 6 (lo dejó así la versión de antes): se vuelve a guardar */
export const repairEntry = (day: FantasyDay) => {
    const current = load()[entryKey(day.league, day.date)];
    if (!current || withoutMissing(day, current) === current) return false;
    update(day, (entry) => entry);
    return true;
};

// ---------------------------------------------------------------- reglas

const gameOf = (day: FantasyDay, gamePk: number) => day.games.find((game) => game.gamePk === gamePk);

/**
 * El juego empezó: lo dice su estado o ya pasó la hora de inicio (el estado guardado puede tardar en cambiar). Con la
 * hora por definir solo cuenta el estado: la hora que trae es de relleno. Uno pospuesto no empieza (sus peloteros se
 * pueden quitar); uno suspendido ya empezó. Igual que la web.
 */
export const gameStarted = (game: Pick<FantasyGame, 'state' | 'date' | 'startTimeTBD'> & Partial<Pick<FantasyGame, 'status' | 'detailedState'>>, now = Date.now()) => {
    if (isPostponed(game)) return false;
    if (game.status === 'suspended' || isSuspended(game.detailedState ?? '')) return true;
    return game.state !== 'preview' || (!game.startTimeTBD && startTime(game) <= now);
};

/** Próxima hora de inicio que todavía no llega (ahí se cierran los peloteros de ese juego) */
export const nextLockAt = (day: FantasyDay | undefined, now = Date.now()) => {
    const upcoming = (day?.games ?? [])
        .filter((game) => !game.startTimeTBD && !isPostponed(game) && !gameStarted(game, now))
        .map((game) => Date.parse(game.date))
        .filter(Number.isFinite);
    return upcoming.length ? Math.min(...upcoming) : null;
};

/** Su juego fue pospuesto (lo dice el servidor nuevo en el pelotero o en el juego) */
export const playerPostponed = (day: Pick<FantasyDay, 'games'>, player: Pick<FantasyPlayer, 'gamePk' | 'status'>) => player.status === 'postponed' || isPostponed(gameOf(day as FantasyDay, player.gamePk));

/** Un pelotero se cierra cuando su juego empieza (el de un juego pospuesto no: hay que poder cambiarlo) */
export const isLocked = (day: FantasyDay, player: Pick<FantasyPlayer, 'gamePk'> & { status?: PlayerStatus }, now = Date.now()) => {
    const game = gameOf(day, player.gamePk);
    return !!game && !playerPostponed(day, player) && gameStarted(game, now);
};

export type AddProblem = 'locked' | 'postponed' | 'full' | 'team' | 'budget' | 'already' | null;

const priceOf = (player: Pick<FantasyPlayer, 'price'> | undefined) => (player && Number.isFinite(player.price) ? player.price! : 0);

/** Los de la alineación que ocupan cupo: los que están en el día y no son de un juego pospuesto (como el servidor) */
export const occupying = (day: FantasyDay, entry: Pick<DayEntry, 'lineup'>) =>
    entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p && !playerPostponed(day, p));

/** Lo que cuesta un equipo con los precios del día (un pospuesto no gasta créditos) */
export const entryCost = (day: FantasyDay, entry: Pick<DayEntry, 'lineup'>) => Math.round(occupying(day, entry).reduce((sum, player) => sum + priceOf(player), 0) * 10) / 10;

/** Créditos que quedan (null si el día no se juega con créditos) */
export const creditsLeft = (day: FantasyDay, entry: Pick<DayEntry, 'lineup'>) => {
    const budget = budgetOf(day);
    return budget === null ? null : Math.round((budget - entryCost(day, entry)) * 10) / 10;
};

export const canAdd = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer, now = Date.now()): AddProblem => {
    if (entry.lineup.includes(player.id)) return 'already';
    if (playerPostponed(day, player)) return 'postponed';
    if (isLocked(day, player, now)) return 'locked';
    // El pospuesto no ocupa cupo: agregar al que lo reemplaza lo saca (withoutMissing)
    const chosen = occupying(day, entry);
    const sameRole = chosen.filter((p) => p.role === player.role).length;
    if (sameRole >= (player.role === 'P' ? RULES.pitchers : RULES.batters)) return 'full';
    if (chosen.filter((p) => p.teamId === player.teamId).length >= perTeamLimit(day)) return 'team';
    const left = creditsLeft(day, entry);
    if (left !== null && priceOf(player) > left + 1e-9) return 'budget';
    return null;
};

export const addPlayer = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer) => {
    if (canAdd(day, entry, player)) return false;
    update(day, (current) => ({ ...current, lineup: [...current.lineup, player.id] }), 'add');
    return true;
};

/** Quita a uno (también a uno que ya no sale en el día: no tiene juego que lo cierre) */
export const removeId = (day: FantasyDay, id: number, now = Date.now()) => {
    const player = day.players.find((p) => p.id === id);
    if (player && isLocked(day, player, now)) return false;
    update(
        day,
        (current) => ({
            ...current,
            lineup: current.lineup.filter((value) => value !== id),
            captain: current.captain === id ? null : current.captain
        }),
        'remove'
    );
    return true;
};

export const removePlayer = (day: FantasyDay, player: FantasyPlayer) => removeId(day, player.id);

/** El capitán solo se cambia mientras ni el actual ni el nuevo han empezado a jugar */
export const setCaptain = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer) => {
    const current = day.players.find((p) => p.id === entry.captain);
    if (isLocked(day, player) || (current && isLocked(day, current))) return false;
    update(day, (value) => ({ ...value, captain: value.captain === player.id ? null : player.id }), 'captain');
    return true;
};

/**
 * Pone un equipo entero (el sugerido): los peloteros ya cerrados se quedan y el capitán cerrado no se cambia; del
 * resto entra lo que se pide si su juego no ha empezado. Igual que la web.
 */
export const applyLineup = (day: FantasyDay, lineup: number[], captain: number | null, now = Date.now(), kind: UndoKind = 'suggested') => {
    const find = (id: number | null) => (id === null ? undefined : day.players.find((p) => p.id === id));
    const locked = (id: number | null) => {
        const player = find(id);
        return !!player && isLocked(day, player, now);
    };
    update(day, (current) => {
        const kept = current.lineup.filter((id) => locked(id));
        const next = [...new Set([...kept, ...lineup.filter((id) => !!find(id) && !locked(id))])];
        const captainLocked = current.captain !== null && current.lineup.includes(current.captain) && locked(current.captain);
        const nextCaptain = captainLocked ? current.captain : captain !== null && next.includes(captain) && !locked(captain) ? captain : current.captain !== null && next.includes(current.captain) ? current.captain : null;
        return { ...current, lineup: next, captain: nextCaptain };
    }, kind);
};

/** Pone el equipo y la corona tal cual (lo ya revisado, como «Copiar mi equipo de ayer»), con su deshacer */
export const putLineup = (day: FantasyDay, lineup: number[], captain: number | null, kind: UndoKind) => update(day, (current) => ({ ...current, lineup: [...lineup], captain }), kind);

export const setPick = (day: FantasyDay, game: FantasyGame, teamId: number) => {
    if (gameStarted(game) || isPostponed(game)) return false;
    update(day, (value) => ({ ...value, picks: { ...value.picks, [game.gamePk]: teamId } }));
    return true;
};

// ---------------------------------------------------------------- sin trampas
// Igual que la web (el-play/src/lib/fantasy.ts) y su servidor (server/services/fantasyScore.js).

/**
 * Hora (ms) en que se cierra un juego: la programada (o el primer lanzamiento si fue antes). Con la hora por definir,
 * el primer lanzamiento; si ya empezó y MLB no lo dio, la hora que traiga. Si no ha empezado, sigue abierto.
 */
export const lockTime = (game: Pick<FantasyGame, 'state' | 'date' | 'startTimeTBD' | 'firstPitch'> & Partial<Pick<FantasyGame, 'status' | 'detailedState'>>) => {
    // Pospuesto: no se cierra (quien lo cambia por otro no se pasa del cupo). Igual que la web y el servidor
    if (isPostponed(game)) return Infinity;
    const first = Date.parse(game.firstPitch ?? '');
    const scheduled = game.startTimeTBD ? NaN : Date.parse(game.date ?? '');
    const times = [first, scheduled].filter(Number.isFinite);
    if (times.length) return Math.min(...times);
    const placeholder = Date.parse(game.date ?? '');
    return game.state !== 'preview' && Number.isFinite(placeholder) ? placeholder : Infinity;
};

/** Valor vigente justo antes de `at` en una lista de cambios [[valor, cuándo], ...] (undefined si no había) */
function valueAt<T>(changes: [T, number][] | undefined, at: number): T | undefined {
    let value: T | undefined;
    for (const change of Array.isArray(changes) ? changes : []) {
        if (Array.isArray(change) && Number(change[1]) < at) value = change[0];
    }
    return value;
}

/** Tramo en el que estaba en el equipo cuando se cerró su juego (entró antes y no había salido) */
const spanAt = (spans: [number, number | null][] | undefined, at: number) =>
    (Array.isArray(spans) ? spans : []).find((span) => Array.isArray(span) && Number(span[0]) < at && (span[1] === null || span[1] === undefined || Number(span[1]) >= at));

/** Cabe en el equipo (en el orden en que entraron): cupo de su rol, máximo por equipo y presupuesto */
const fits = (kept: FantasyPlayer[], player: FantasyPlayer, budget: number | null, perTeam: number) => {
    const sameRole = kept.filter((k) => k.role === player.role).length;
    const sameTeam = kept.filter((k) => k.teamId === player.teamId).length;
    const spent = kept.reduce((sum, k) => sum + priceOf(k), 0);
    return sameRole < (player.role === 'P' ? RULES.pitchers : RULES.batters) && sameTeam < perTeam && (budget === null || spent + priceOf(player) <= budget + 1e-9);
};

/**
 * El equipo que cuenta: cada pelotero si estaba cuando empezó su juego, el capitán que había cuando empezó el suyo
 * (el primero que se cerró: cambiarlo después no vale) y cada pronóstico como estaba al empezar su juego.
 * Si alguien se pasa de los cupos o del presupuesto (quitó a uno ya cerrado para meter a otro, o los precios
 * cambiaron), sobran los que entraron de último. Sin historial (lo del teléfono o filas de antes del arreglo) cuenta
 * el orden de la alineación. Un pelotero de un juego pospuesto no suma ni ocupa cupo, rol ni créditos (se puede cambiar
 * cuando sea) y un pronóstico de un juego pospuesto no cuenta. Igual que el servidor.
 */
const hasHistory = (history: DayEntry['history']): history is EntryHistory => !!history && typeof history === 'object' && !!history.players && typeof history.players === 'object';

export const effectiveEntry = (day: FantasyDay, entry: DayEntry): DayEntry => {
    const history = entry.history;
    const budget = budgetOf(day);
    if (!hasHistory(history)) {
        if (budget === null) return entry;
        const kept: FantasyPlayer[] = [];
        const lineup: number[] = [];
        for (const id of entry.lineup) {
            const player = day.players.find((p) => p.id === id);
            if (!player || playerPostponed(day, player)) lineup.push(id);
            else if (fits(kept, player, budget, perTeamLimit(day))) {
                kept.push(player);
                lineup.push(id);
            }
        }
        if (lineup.length === entry.lineup.length) return entry;
        return { ...entry, lineup, captain: entry.captain !== null && lineup.includes(entry.captain) ? entry.captain : null };
    }
    const locks = new Map(day.games.map((game) => [String(game.gamePk), lockTime(game)]));
    const counted: { player: FantasyPlayer; lock: number; added: number }[] = [];
    for (const [key, spans] of Object.entries(history.players)) {
        const player = day.players.find((p) => String(p.id) === key);
        if (!player || playerPostponed(day, player)) continue;
        const lock = locks.get(String(player.gamePk)) ?? Infinity;
        const span = spanAt(spans, lock);
        if (span) counted.push({ player, lock, added: Number(span[0]) });
    }
    counted.sort((a, b) => a.added - b.added || a.player.id - b.player.id);
    const kept: typeof counted = [];
    for (const item of counted) {
        if (fits(kept.map((k) => k.player), item.player, budget, perTeamLimit(day))) kept.push(item);
    }
    const order = (id: number) => (entry.lineup.includes(id) ? entry.lineup.indexOf(id) : entry.lineup.length);
    const lineup = kept.map((item) => item.player.id).sort((a, b) => order(a) - order(b));
    const captains = kept.filter((item) => valueAt(history.captain, item.lock) === item.player.id).sort((a, b) => a.lock - b.lock);
    const picks: Record<string, number> = {};
    for (const game of day.games.filter((item) => !isPostponed(item))) {
        const pick = valueAt(history.picks?.[game.gamePk], locks.get(String(game.gamePk)) ?? Infinity);
        if (pick) picks[game.gamePk] = pick;
    }
    return { ...entry, lineup, captain: captains[0]?.player.id ?? null, picks };
};

/** Por qué un pelotero del equipo no cuenta: se pasó del tope (cupo, máximo por equipo o créditos) o entró tarde */
export type NotCounted = 'over' | 'late';

/**
 * Los del equipo que no cuentan (para el aviso «No cuenta: …» de su tarjeta), con la misma regla de effectiveEntry
 * (igual que notCounting de la web): «late» si su juego ya se cerró y no estaba en el equipo a esa hora (lo dice el
 * historial de la base); «over» si se pasa del tope y entró de último.
 */
export const notCounted = (day: FantasyDay, entry: DayEntry, effective: DayEntry = effectiveEntry(day, entry), now = Date.now()): Map<number, NotCounted> => {
    const out = new Map<number, NotCounted>();
    const history = hasHistory(entry.history) ? entry.history : null;
    const used = new Set(effective.lineup);
    for (const id of entry.lineup) {
        if (used.has(id)) continue;
        const player = day.players.find((p) => p.id === id);
        // El de un juego pospuesto tiene su propio aviso («Pospuesto: cámbialo»)
        if (!player || playerPostponed(day, player)) continue;
        const game = gameOf(day, player.gamePk);
        const lock = game ? lockTime(game) : Infinity;
        out.set(id, history && lock <= now && !spanAt(history.players[String(id)], lock) ? 'late' : 'over');
    }
    return out;
};

// ---------------------------------------------------------------- puntos

/** Puntos de uno en el equipo (el capitán ×1,5, o lo que digan las reglas del día) */
export const playerScore = (entry: Pick<DayEntry, 'captain'>, player: Pick<FantasyPlayer, 'id' | 'points'>, captain = RULES.captain) =>
    entry.captain === player.id ? Math.round(player.points * captain * 10) / 10 : player.points;

export const teamPoints = (day: FantasyDay, entry: DayEntry) => {
    const captain = rulesOf(day).captain;
    return (
        Math.round(
            entry.lineup.reduce((sum, id) => {
                const player = day.players.find((p) => p.id === id);
                return sum + (player ? playerScore(entry, player, captain) : 0);
            }, 0) * 10
        ) / 10
    );
};

const winnerOf = (game: FantasyGame) => (game.state !== 'final' ? null : game.away.isWinner ? game.away.id : game.home.isWinner ? game.home.id : null);

export const pickResult = (game: FantasyGame, entry: DayEntry): 'win' | 'loss' | 'pending' | null => {
    const pick = entry.picks[game.gamePk];
    if (!pick) return null;
    const winner = winnerOf(game);
    if (!winner) return 'pending';
    return winner === pick ? 'win' : 'loss';
};

export const pickPoints = (day: FantasyDay, entry: DayEntry) => day.games.filter((game) => pickResult(game, entry) === 'win').length * rulesOf(day).picks.points;

/** Puntos del día con el equipo que cuenta (effectiveEntry): los mismos de la tabla y del perfil */
export const dayPoints = (day: FantasyDay, entry: DayEntry, counted: DayEntry = effectiveEntry(day, entry)) => {
    const team = teamPoints(day, counted);
    const picks = pickPoints(day, counted);
    return { team, picks, total: Math.round((team + picks) * 10) / 10 };
};

/**
 * Puestos que se comparten en los empates (1, 2, 2, 4), de más a menos puntos: igual en la tabla del día, la de la
 * temporada y en PRO. Los puntos se comparan redondeados a un decimal (10,1 + 0,2 es 10,3).
 */
export const rankRows = <T extends { points: number }>(rows: T[], tie: (a: T, b: T) => number = () => 0): (T & { rank: number })[] => {
    const round = (value: number) => Math.round(value * 10) / 10;
    const sorted = [...rows].sort((a, b) => round(b.points) - round(a.points) || tie(a, b));
    let rank = 0;
    return sorted.map((row, index) => {
        if (index === 0 || round(row.points) !== round(sorted[index - 1].points)) rank = index + 1;
        return { ...row, rank };
    });
};

/**
 * Guarda el resultado del día cuando ya terminaron todos los juegos (para el historial y la racha), con el equipo que
 * cuenta (`counted`: el de la base con su historial si se tiene; si no, effectiveEntry con lo del teléfono)
 */
export const settleDay = (day: FantasyDay, entry: DayEntry, counted?: DayEntry) => {
    if (!day.games.length || day.games.some((game) => game.state !== 'final' && !isPostponed(game))) return;
    if (!entry.lineup.length && !Object.keys(entry.picks).length) return;
    const { team, picks } = dayPoints(day, entry, counted);
    const result = { team, picks };
    if (entry.result && entry.result.team === result.team && entry.result.picks === result.picks) return;
    const all = load();
    save({ ...all, [entryKey(day.league, day.date)]: { ...entry, result } });
};

/** Días ya pasados que jugó y no tienen resultado en este teléfono (p. ej. los trajo la cuenta desde otro teléfono) */
export const unsettledDays = (all: Store, league: LeagueId, today: string, limit = 10) =>
    Object.entries(all)
        .filter(([key, entry]) => key.startsWith(`${league}:`) && !entry.result && (entry.lineup.length > 0 || Object.keys(entry.picks).length > 0))
        .map(([key]) => key.slice(league.length + 1))
        .filter((date) => date < today)
        .sort((a, b) => b.localeCompare(a))
        .slice(0, limit);

/** Historial: días terminados de la liga, del más reciente al más viejo */
export const history = (all: Store, league: LeagueId) =>
    Object.entries(all)
        .filter(([key, entry]) => key.startsWith(`${league}:`) && entry.result)
        .map(([key, entry]) => ({ date: key.slice(league.length + 1), points: (entry.result?.team ?? 0) + (entry.result?.picks ?? 0) }))
        .sort((a, b) => b.date.localeCompare(a.date));
