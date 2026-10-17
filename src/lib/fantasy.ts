// Fantasy de El Play: cada día armas tu equipo (5 bateadores y 1 lanzador de los juegos de ese día, máximo 2 por
// equipo, un capitán que suma ×1,5) y pronosticas quién gana cada juego. Cada pelotero se cierra cuando empieza su
// juego. Sin cuenta todo se guarda en este teléfono; con cuenta (Supabase) además se compite en la tabla y en ligas.
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
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
}

export interface FantasyGame extends ScheduleGame {
    state: ScheduleGame['state'];
}

export interface FantasyDay {
    league: LeagueId;
    date: string;
    games: FantasyGame[];
    teams: Record<string, { id: number; abbrev: string; color: string; logo: string }>;
    players: FantasyPlayer[];
    scoring: { batter: Record<string, number>; pitcher: Record<string, number> };
}

export const RULES = { batters: 5, pitchers: 1, perTeam: 2, captain: 1.5, pick: 10 };

export interface DayEntry {
    lineup: number[];
    captain: number | null;
    picks: Record<string, number>;
    savedAt: number;
    /** Cuando el día terminó: puntos finales (para el historial sin volver a pedir el día) */
    result?: { team: number; picks: number };
}

// ---------------------------------------------------------------- datos del día (servidor)

export const useFantasyDay = (league: LeagueId, date?: string) =>
    useQuery({
        queryKey: ['fantasy', league, date ?? 'hoy'],
        queryFn: async ({ signal }) => {
            const response = await fetch(`/api/v2/fantasy?league=${league}${date ? `&date=${date}` : ''}`, { signal, headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`fantasy ${response.status}`);
            return (await response.json()) as FantasyDay;
        },
        staleTime: 15000,
        refetchInterval: (query) => (query.state.data?.games.some((game) => game.state === 'live') ? 20000 : false),
        refetchOnWindowFocus: true
    });

// ---------------------------------------------------------------- lo que eligió el usuario (en este teléfono)

const KEY = 'el-play-fantasy-v1';
type Store = Record<string, DayEntry>;
let store: Store | null = null;
const listeners = new Set<() => void>();

const load = (): Store => {
    if (store) return store;
    try {
        store = JSON.parse(localStorage.getItem(KEY) || '{}') as Store;
    } catch {
        store = {};
    }
    return store;
};

const save = (next: Store) => {
    store = next;
    try {
        localStorage.setItem(KEY, JSON.stringify(next));
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

const update = (league: LeagueId, date: string, change: (entry: DayEntry) => DayEntry) => {
    const all = load();
    const key = entryKey(league, date);
    save({ ...all, [key]: { ...change(all[key] ?? EMPTY), savedAt: Date.now() } });
};

// ---------------------------------------------------------------- reglas

const gameOf = (day: FantasyDay, gamePk: number) => day.games.find((game) => game.gamePk === gamePk);

/** Un pelotero se cierra cuando su juego empieza */
export const isLocked = (day: FantasyDay, player: Pick<FantasyPlayer, 'gamePk'>) => (gameOf(day, player.gamePk)?.state ?? 'preview') !== 'preview';

export type AddProblem = 'locked' | 'full' | 'team' | 'already' | null;

export const canAdd = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer): AddProblem => {
    if (entry.lineup.includes(player.id)) return 'already';
    if (isLocked(day, player)) return 'locked';
    const chosen = entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    const sameRole = chosen.filter((p) => p.role === player.role).length;
    if (sameRole >= (player.role === 'P' ? RULES.pitchers : RULES.batters)) return 'full';
    if (chosen.filter((p) => p.teamId === player.teamId).length >= RULES.perTeam) return 'team';
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

export const setPick = (day: FantasyDay, game: FantasyGame, teamId: number) => {
    if (game.state !== 'preview') return false;
    update(day.league, day.date, (value) => ({ ...value, picks: { ...value.picks, [game.gamePk]: teamId } }));
    return true;
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

/** Guarda el resultado del día cuando ya terminaron todos los juegos (para el historial y la racha) */
export const settleDay = (day: FantasyDay, entry: DayEntry) => {
    if (!day.games.length || day.games.some((game) => game.state !== 'final')) return;
    if (!entry.lineup.length && !Object.keys(entry.picks).length) return;
    const result = { team: teamPoints(day, entry), picks: pickPoints(day, entry) };
    if (entry.result && entry.result.team === result.team && entry.result.picks === result.picks) return;
    const all = load();
    save({ ...all, [entryKey(day.league, day.date)]: { ...entry, result } });
};

/** Historial: días terminados de la liga, del más reciente al más viejo */
export const history = (all: Store, league: LeagueId) =>
    Object.entries(all)
        .filter(([key, entry]) => key.startsWith(`${league}:`) && entry.result)
        .map(([key, entry]) => ({ date: key.slice(league.length + 1), points: (entry.result?.team ?? 0) + (entry.result?.picks ?? 0) }))
        .sort((a, b) => b.date.localeCompare(a.date));
