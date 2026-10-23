// Fantasy de El Play: cada día armas tu equipo (5 bateadores y 1 lanzador de los juegos de ese día, máximo 2 por
// equipo, sin pasarte de los créditos del día, un capitán que suma ×1,5) y pronosticas quién gana cada juego. Cada pelotero se cierra cuando empieza su
// juego. Para jugar hace falta cuenta (Supabase): el equipo vive en la cuenta y el teléfono guarda una copia por usuario.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { LeagueId, ScheduleGame } from '../types';

export interface FantasyLine {
    [stat: string]: number | string;
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
}

export interface FantasyGame extends ScheduleGame {
    state: ScheduleGame['state'];
    /** Primer lanzamiento (solo juegos empezados en vivo): con la hora por definir, ahí se cierra */
    firstPitch?: string;
}

export interface FantasyDay {
    league: LeagueId;
    date: string;
    games: FantasyGame[];
    teams: Record<string, { id: number; abbrev: string; color: string; logo: string }>;
    players: FantasyPlayer[];
    scoring: { batter: Record<string, number>; pitcher: Record<string, number> };
    /** Días con créditos: presupuesto del equipo y rango de precios (el servidor pone los precios) */
    credits?: { budget: number; min: number; max: number };
}

export const RULES = { batters: 5, pitchers: 1, perTeam: 2, captain: 1.5, pick: 10, budget: 50 };

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
    const response = await fetch(`/api/v2/fantasy?league=${league}${date ? `&date=${date}` : ''}`, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`fantasy ${response.status}`);
    return (await response.json()) as FantasyDay;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const NOT_PLAYING = /postponed|cancel|suspended/i;

/**
 * Cada cuánto se vuelve a pedir el día: cada 20 s con juegos en vivo y cada 30 s desde 15 min antes del próximo juego
 * (también si ya pasó su hora y sigue en previa), para que el cierre llegue a tiempo. Lejos del juego despierta al
 * entrar en esos 15 min, sin pasar de 15 min entre consultas.
 */
export const fantasyInterval = (day: FantasyDay | undefined, now = Date.now()): number | false => {
    if (!day) return false;
    if (day.games.some((game) => game.state === 'live')) return 20 * SECOND;
    const starts = day.games
        .filter((game) => game.state === 'preview' && !NOT_PLAYING.test(game.detailedState ?? ''))
        .map((game) => Date.parse(game.date))
        .filter(Number.isFinite);
    if (!starts.length) return false;
    const startsIn = Math.min(...starts) - now;
    if (startsIn <= 15 * MINUTE) return 30 * SECOND;
    return Math.min(startsIn - 15 * MINUTE, 15 * MINUTE);
};

/** Próxima hora de inicio que todavía no llega (ahí se cierran los peloteros de ese juego) */
export const nextLockAt = (day: FantasyDay | undefined, now = Date.now()) => {
    const upcoming = (day?.games ?? [])
        .filter((game) => !game.startTimeTBD && !gameStarted(game, now))
        .map((game) => Date.parse(game.date))
        .filter(Number.isFinite);
    return upcoming.length ? Math.min(...upcoming) : null;
};

// Al llegar la hora de un juego se vuelve a pintar quien usa el día: sus peloteros se ven cerrados aunque los datos no cambien
const useLockClock = (day: FantasyDay | undefined) => {
    const [tick, setTick] = useState(0);
    const next = nextLockAt(day);
    useEffect(() => {
        if (next === null) return;
        // setTimeout no aguanta esperas de semanas: si falta mucho se vuelve a calcular a las 6 h
        const timer = setTimeout(() => setTick((value) => value + 1), Math.min(Math.max(0, next - Date.now()) + 250, 6 * 60 * MINUTE));
        return () => clearTimeout(timer);
    }, [next, tick]);
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

const load = (): Store => {
    if (store) return store;
    try {
        store = JSON.parse(localStorage.getItem(storageKey()) || '{}') as Store;
    } catch {
        store = {};
    }
    return store;
};

const save = (next: Store) => {
    store = next;
    try {
        localStorage.setItem(storageKey(), JSON.stringify(next));
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
    listeners.forEach((listener) => listener());
};

/** Lo que se armó sin cuenta en la primera versión del fantasy: pasa una sola vez a la cuenta que entre */
export const takeLegacyStore = (): Store => {
    try {
        const raw = localStorage.getItem(KEY);
        localStorage.removeItem(KEY);
        return raw ? (JSON.parse(raw) as Store) : {};
    } catch {
        return {};
    }
};

const update = (league: LeagueId, date: string, change: (entry: DayEntry) => DayEntry) => {
    const all = load();
    const key = entryKey(league, date);
    save({ ...all, [key]: { ...change(all[key] ?? EMPTY), savedAt: Date.now() } });
};

// ---------------------------------------------------------------- reglas

const gameOf = (day: FantasyDay, gamePk: number) => day.games.find((game) => game.gamePk === gamePk);

/**
 * Un juego ya empezó si el servidor lo dice o si ya pasó su hora (el estado guardado puede tardar en cambiar).
 * Con la hora por definir solo cuenta el estado: la hora que trae es de relleno.
 */
export const gameStarted = (game: Pick<FantasyGame, 'state' | 'date' | 'startTimeTBD'>, now = Date.now()) => {
    if (game.state !== 'preview') return true;
    if (game.startTimeTBD) return false;
    const start = Date.parse(game.date);
    return Number.isFinite(start) && start <= now;
};

/** Un pelotero se cierra cuando su juego empieza */
export const isLocked = (day: FantasyDay, player: Pick<FantasyPlayer, 'gamePk'>, now = Date.now()) => {
    const game = gameOf(day, player.gamePk);
    return !!game && gameStarted(game, now);
};

/**
 * Máximo por equipo del día: 2, salvo que haya pocos equipos jugando. Con un solo juego (Serie Final, eliminatorias,
 * final de la Serie del Caribe) dos equipos no alcanzan para 6 peloteros con 2 cada uno: sube a 3. Igual que el servidor.
 */
export const perTeamLimit = (day: Pick<FantasyDay, 'games'> | null | undefined) => {
    const teams = new Set((day?.games ?? []).flatMap((game) => [game.away?.id, game.home?.id]).filter(Boolean)).size;
    return teams ? Math.max(RULES.perTeam, Math.ceil((RULES.batters + RULES.pitchers) / teams)) : RULES.perTeam;
};

export type AddProblem = 'locked' | 'full' | 'team' | 'budget' | 'already' | null;

const priceOf = (player: Pick<FantasyPlayer, 'price'> | undefined) => (player && Number.isFinite(player.price) ? player.price! : 0);

/** Lo que cuesta un equipo con los precios del día */
export const entryCost = (day: FantasyDay, entry: Pick<DayEntry, 'lineup'>) =>
    Math.round(entry.lineup.reduce((sum, id) => sum + priceOf(day.players.find((p) => p.id === id)), 0) * 10) / 10;

/** Créditos que quedan (null si el día no se juega con créditos) */
export const creditsLeft = (day: FantasyDay, entry: Pick<DayEntry, 'lineup'>) => (day.credits ? Math.round((day.credits.budget - entryCost(day, entry)) * 10) / 10 : null);

export const canAdd = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer, now = Date.now()): AddProblem => {
    if (entry.lineup.includes(player.id)) return 'already';
    if (isLocked(day, player, now)) return 'locked';
    const chosen = entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    const sameRole = chosen.filter((p) => p.role === player.role).length;
    if (sameRole >= (player.role === 'P' ? RULES.pitchers : RULES.batters)) return 'full';
    if (chosen.filter((p) => p.teamId === player.teamId).length >= perTeamLimit(day)) return 'team';
    const left = creditsLeft(day, entry);
    if (left !== null && priceOf(player) > left + 1e-9) return 'budget';
    return null;
};

export const addPlayer = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer) => {
    if (canAdd(day, entry, player)) return false;
    update(day.league, day.date, (current) => ({ ...current, lineup: [...current.lineup, player.id] }));
    return true;
};

export const removePlayer = (day: FantasyDay, player: FantasyPlayer) => {
    if (isLocked(day, player)) return false;
    update(day.league, day.date, (current) => ({
        ...current,
        lineup: current.lineup.filter((id) => id !== player.id),
        captain: current.captain === player.id ? null : current.captain
    }));
    return true;
};

/** El capitán solo se cambia mientras ni el actual ni el nuevo han empezado a jugar */
export const setCaptain = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer) => {
    const current = day.players.find((p) => p.id === entry.captain);
    if (isLocked(day, player) || (current && isLocked(day, current))) return false;
    update(day.league, day.date, (value) => ({ ...value, captain: value.captain === player.id ? null : player.id }));
    return true;
};

/**
 * Pone un equipo entero (el sugerido): los peloteros ya cerrados se quedan y el capitán cerrado no se cambia; del
 * resto entra lo que se pide si su juego no ha empezado.
 */
export const applyLineup = (day: FantasyDay, lineup: number[], captain: number | null, now = Date.now()) => {
    const find = (id: number | null) => (id === null ? undefined : day.players.find((p) => p.id === id));
    const locked = (id: number | null) => {
        const player = find(id);
        return !!player && isLocked(day, player, now);
    };
    update(day.league, day.date, (current) => {
        const kept = current.lineup.filter((id) => locked(id));
        const next = [...new Set([...kept, ...lineup.filter((id) => !!find(id) && !locked(id))])];
        const captainLocked = current.captain !== null && current.lineup.includes(current.captain) && locked(current.captain);
        const nextCaptain = captainLocked ? current.captain : captain !== null && next.includes(captain) && !locked(captain) ? captain : current.captain !== null && next.includes(current.captain) ? current.captain : null;
        return { ...current, lineup: next, captain: nextCaptain };
    });
};

/** El pronóstico se cierra cuando empieza el juego (como los peloteros) */
export const setPick = (day: FantasyDay, game: FantasyGame, teamId: number, now = Date.now()) => {
    if (gameStarted(game, now)) return false;
    update(day.league, day.date, (value) => ({ ...value, picks: { ...value.picks, [game.gamePk]: teamId } }));
    return true;
};

// ---------------------------------------------------------------- sin trampas
// Igual que server/services/fantasyScore.js: si cambia allá, cambia aquí.

/**
 * Hora (ms) en que se cierra un juego: la programada (o el primer lanzamiento si fue antes). Con la hora por definir,
 * el primer lanzamiento; si ya empezó y MLB no lo dio, la hora que traiga. Si no ha empezado, sigue abierto.
 */
export const lockTime = (game: Pick<FantasyGame, 'state' | 'date' | 'startTimeTBD' | 'firstPitch'>) => {
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
 * el orden de la alineación.
 */
export const effectiveEntry = (day: FantasyDay, entry: DayEntry): DayEntry => {
    const history = entry.history;
    const budget = day.credits ? day.credits.budget : null;
    if (!history || typeof history !== 'object' || !history.players || typeof history.players !== 'object') {
        if (budget === null) return entry;
        const kept: FantasyPlayer[] = [];
        const lineup: number[] = [];
        for (const id of entry.lineup) {
            const player = day.players.find((p) => p.id === id);
            if (!player) lineup.push(id);
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
        if (!player) continue;
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
    for (const game of day.games) {
        const pick = valueAt(history.picks?.[game.gamePk], locks.get(String(game.gamePk)) ?? Infinity);
        if (pick) picks[game.gamePk] = pick;
    }
    return { ...entry, lineup, captain: captains[0]?.player.id ?? null, picks };
};

// ---------------------------------------------------------------- puntos

export const playerScore = (entry: DayEntry, player: FantasyPlayer) => (entry.captain === player.id ? Math.round(player.points * RULES.captain * 10) / 10 : player.points);

export const teamPoints = (day: FantasyDay, entry: DayEntry) =>
    Math.round(entry.lineup.reduce((sum, id) => {
        const player = day.players.find((p) => p.id === id);
        return sum + (player ? playerScore(entry, player) : 0);
    }, 0) * 10) / 10;

const winnerOf = (game: FantasyGame) => (game.state !== 'final' ? null : game.away.isWinner ? game.away.id : game.home.isWinner ? game.home.id : null);

export const pickResult = (game: FantasyGame, entry: DayEntry): 'win' | 'loss' | 'pending' | null => {
    const pick = entry.picks[game.gamePk];
    if (!pick) return null;
    const winner = winnerOf(game);
    if (!winner) return 'pending';
    return winner === pick ? 'win' : 'loss';
};

export const pickPoints = (day: FantasyDay, entry: DayEntry) => day.games.filter((game) => pickResult(game, entry) === 'win').length * RULES.pick;

/** Línea corta de lo que hizo en el día («2-4, 1 HR, 2 CI»), igual en Mi equipo y en el perfil de un fanático */
export const lineText = (player: FantasyPlayer, t: (key: string, options?: Record<string, unknown>) => string) => {
    const line = player.line;
    if (!line || !player.played) return null;
    if (player.role === 'P') return t('fantasy.pitchLine', { ip: line.ip, k: line.k, er: line.er });
    const extras = [
        Number(line.hr) ? `${line.hr} HR` : '',
        Number(line.d) ? `${line.d} 2B` : '',
        Number(line.t) ? `${line.t} 3B` : '',
        Number(line.rbi) ? `${line.rbi} ${t('stats.rbi')}` : '',
        Number(line.sb) ? `${line.sb} ${t('statsPage.unit.sb')}` : ''
    ]
        .filter(Boolean)
        .join(', ');
    return `${line.h}-${line.ab}${extras ? `, ${extras}` : ''}`;
};

/** Guarda el resultado del día cuando ya terminaron todos los juegos (para el historial y la racha) */
export const settleDay = (day: FantasyDay, entry: DayEntry) => {
    if (!day.games.length || day.games.some((game) => game.state !== 'final')) return;
    if (!entry.lineup.length && !Object.keys(entry.picks).length) return;
    const result = { team: teamPoints(day, entry), picks: pickPoints(day, entry) };
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
