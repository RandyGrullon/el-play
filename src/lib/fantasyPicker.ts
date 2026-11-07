// El selector de peloteros del Fantasy (igual en la web, en el Lite y en PRO): estado de cada uno para el juego, por qué
// no se puede agregar, filtros (Disponibles, Me alcanza, Titulares, por juego y por equipo), orden (Proyección, Valor,
// Precio, Pts/J, Últimos 5 y % elegido) y lo que falta para completar. Lógica pura: las pantallas solo la pintan.
import { RULES, canAdd, creditsLeft, isLocked, playerPostponed, type DayEntry, type FantasyDay, type FantasyGame, type FantasyPlayer, type PlayerStatus } from './fantasy';
import { valueOf } from './fantasyBest';

export type PickSort = 'proj' | 'value' | 'price' | 'ppg' | 'last5' | 'owned';
export const PICK_SORTS: PickSort[] = ['proj', 'value', 'price', 'ppg', 'last5', 'owned'];

/** La etiqueta de la fila: cómo llega a su juego, o que ya empezó (no se puede agregar ni quitar) */
export type BadgeStatus = PlayerStatus | 'started';

const round1 = (value: number) => Math.round(value * 10) / 10;
const gameOf = (day: Pick<FantasyDay, 'games'>, player: Pick<FantasyPlayer, 'gamePk'>) => day.games.find((game) => game.gamePk === player.gamePk);

/**
 * Cómo llega a su juego. Con el servidor nuevo, su `status`; sin él, lo que se sepa de otra parte (`hint`: en PRO, las
 * alineaciones publicadas o esperadas) y si no, lo de siempre: el bateador que abrió el último juego es «Esperado» (si
 * no, «Banca») y el lanzador que abrió hace 4 días o menos está «Descansando». Pospuesto, «No jugó» (su juego terminó
 * sin él) y «Ya empezó» van primero.
 */
export const statusOf = (day: FantasyDay, player: FantasyPlayer, now = Date.now(), hint?: PlayerStatus | null): BadgeStatus | null => {
    if (playerPostponed(day, player)) return 'postponed';
    const game = gameOf(day, player);
    if (player.status === 'dnp' || (game?.state === 'final' && !player.played)) return 'dnp';
    if (isLocked(day, player, now)) return 'started';
    if (player.status) return player.status;
    if (hint) return hint;
    if (player.role === 'B') return player.starter ? 'expected' : 'bench';
    return player.rest || (player.startedAgo !== undefined && player.startedAgo <= 4) ? 'resting' : null;
};

/** Va de titular: confirmado o esperado en la alineación, o abridor probable */
export const isStarterStatus = (status: BadgeStatus | null) => status === 'confirmed' || status === 'expected' || status === 'probable';

/** Por qué no se puede agregar, con lo que hace falta para el texto («Ya tienes 2 de LIC», «Te faltan 1.5 créditos») */
export type PickReason = { kind: 'started' } | { kind: 'postponed' } | { kind: 'fullB'; n: number } | { kind: 'fullP' } | { kind: 'team'; n: number; team: string } | { kind: 'budget'; short: number };

export const reasonOf = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer, now = Date.now()): PickReason | null => {
    const problem = canAdd(day, entry, player, now);
    if (problem === 'locked') return { kind: 'started' };
    if (problem === 'postponed') return { kind: 'postponed' };
    if (problem === 'full') return player.role === 'P' ? { kind: 'fullP' } : { kind: 'fullB', n: RULES.batters };
    if (problem === 'team') {
        const n = entry.lineup.filter((id) => day.players.find((p) => p.id === id)?.teamId === player.teamId).length;
        return { kind: 'team', n, team: day.teams[player.teamId]?.abbrev ?? '' };
    }
    if (problem === 'budget') return { kind: 'budget', short: round1(Math.max(0, (player.price ?? 0) - (creditsLeft(day, entry) ?? 0))) };
    return null;
};

/** Rival del día: «vs TOR» en casa, «@ TOR» de visitante (del servidor nuevo o, sin él, del juego) */
export const matchupOf = (day: FantasyDay, player: FantasyPlayer): { team: string; opp: string; home: boolean } | null => {
    const team = day.teams[player.teamId]?.abbrev ?? '';
    if (player.opp) return { team, opp: player.opp.abbrev, home: player.opp.home };
    const game = gameOf(day, player);
    if (!game) return null;
    const home = game.home.id === player.teamId;
    return { team, opp: (home ? game.away : game.home).abbrev, home };
};

/** Promedio de los últimos 5 (con un decimal); null si no hay */
export const avgOf = (list: number[] | null | undefined) => (list?.length ? round1(list.reduce((sum, value) => sum + value, 0) / list.length) : null);

/** Lo que el selector sabe de cada uno además del día (de otras consultas): Pts/J, últimos 5 y % elegido */
export interface PickExtras {
    /** Puntos de fantasy por juego en la temporada */
    ppg?: (player: FantasyPlayer) => number | null | undefined;
    /** Últimos 5 juegos (si el día no los trae), del más viejo al más nuevo */
    last5?: (player: FantasyPlayer) => number[] | null | undefined;
    /** % de fanáticos que lo eligieron (solo se ve cuando su juego ya empezó) */
    owned?: (player: FantasyPlayer) => number | null | undefined;
    /** Cómo llega a su juego si el día no lo dice (en PRO, por las alineaciones) */
    status?: (player: FantasyPlayer) => PlayerStatus | null | undefined;
}

export interface PickFilters {
    role: 'B' | 'P';
    search: string;
    /** Sin los cerrados, los pospuestos ni los que no se pueden agregar (los de tu equipo que todavía se pueden quitar sí salen) */
    available: boolean;
    /** Precio que cabe en los créditos que quedan */
    affordable: boolean;
    /** Confirmados, esperados y abridores probables */
    starters: boolean;
    gamePk: number | null;
    teamId: number | null;
}

export const DEFAULT_FILTERS: Omit<PickFilters, 'role'> = { search: '', available: true, affordable: false, starters: false, gamePk: null, teamId: null };

export interface PickRow {
    player: FantasyPlayer;
    inTeam: boolean;
    locked: boolean;
    status: BadgeStatus | null;
    reason: PickReason | null;
    value: number | null;
    ppg: number | null;
    last5: number[];
    last5Avg: number | null;
    /** % elegido: solo con su juego ya cerrado */
    owned: number | null;
}

/** Sin tildes ni mayúsculas, para buscar «nunez» y encontrar a Núñez */
export const normalized = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const num = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const pickRowOf = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer, extras: PickExtras = {}, now = Date.now()): PickRow => {
    const inTeam = entry.lineup.includes(player.id);
    const locked = isLocked(day, player, now);
    const last5 = (Array.isArray(player.last5) ? player.last5 : extras.last5?.(player) ?? []).filter((value) => Number.isFinite(value)).slice(-5);
    return {
        player,
        inTeam,
        locked,
        status: statusOf(day, player, now, extras.status?.(player)),
        reason: inTeam ? null : reasonOf(day, entry, player, now),
        value: valueOf(player),
        ppg: num(extras.ppg?.(player)),
        last5,
        last5Avg: avgOf(last5),
        owned: locked ? num(extras.owned?.(player)) : null
    };
};

const metricOf = (row: PickRow, sort: PickSort): number | null =>
    sort === 'proj' ? num(row.player.proj) : sort === 'value' ? row.value : sort === 'price' ? num(row.player.price) : sort === 'ppg' ? row.ppg : sort === 'last5' ? row.last5Avg : row.owned;

/** Pasa los filtros (el rol siempre) */
export const passes = (day: FantasyDay, entry: DayEntry, row: PickRow, filters: PickFilters) => {
    const { player } = row;
    if (player.role !== filters.role) return false;
    if (filters.search && !normalized(player.name).includes(normalized(filters.search))) return false;
    if (filters.gamePk !== null && player.gamePk !== filters.gamePk) return false;
    if (filters.teamId !== null && player.teamId !== filters.teamId) return false;
    if (filters.available && (row.inTeam ? row.locked : row.locked || row.reason !== null || row.status === 'postponed')) return false;
    if (filters.affordable && !row.inTeam) {
        const left = creditsLeft(day, entry);
        if (left !== null && (player.price ?? 0) > left + 1e-9) return false;
    }
    if (filters.starters && !isStarterStatus(row.status)) return false;
    return true;
};

/** La lista del selector: filtrada y ordenada de mayor a menor (sin dato al final; empates por proyección y nombre) */
export const pickerRows = (day: FantasyDay, entry: DayEntry, filters: PickFilters, sort: PickSort, extras: PickExtras = {}, now = Date.now()): PickRow[] =>
    day.players
        .filter((player) => player.role === filters.role)
        .map((player) => pickRowOf(day, entry, player, extras, now))
        .filter((row) => passes(day, entry, row, filters))
        .sort((a, b) => {
            const x = metricOf(a, sort);
            const y = metricOf(b, sort);
            if (x !== y) {
                if (x === null) return 1;
                if (y === null) return -1;
                if (y !== x) return y - x;
            }
            return (num(b.player.proj) ?? -Infinity) - (num(a.player.proj) ?? -Infinity) || a.player.name.localeCompare(b.player.name) || a.player.id - b.player.id;
        });

/** Lo que falta: bateadores, lanzador y créditos que quedan (null si ese día no hay tope) */
export const slotsLeft = (day: FantasyDay, entry: DayEntry) => {
    const chosen = entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    return {
        batters: Math.max(0, RULES.batters - chosen.filter((p) => p.role === 'B').length),
        pitchers: Math.max(0, RULES.pitchers - chosen.filter((p) => p.role === 'P').length),
        credits: creditsLeft(day, entry)
    };
};

/** Los juegos del día para los chips de juego (en orden de hora) */
export const pickerGames = (day: FantasyDay): FantasyGame[] => [...day.games].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.gamePk - b.gamePk);

/** Qué opciones tienen sentido: sin créditos no hay «Me alcanza»; sin proyección no hay Proyección ni Valor */
export const pickerOptions = (day: FantasyDay, extras: PickExtras = {}) => {
    const hasProj = day.players.some((player) => num(player.proj) !== null);
    const hasPrice = day.players.some((player) => num(player.price) !== null);
    return {
        affordable: creditsLeft(day, { lineup: [] }) !== null,
        sorts: PICK_SORTS.filter((sort) => (sort === 'proj' || sort === 'value' ? hasProj : sort === 'price' ? hasPrice : sort === 'ppg' ? !!extras.ppg : sort === 'owned' ? !!extras.owned : true)),
        defaultSort: (hasProj ? 'proj' : extras.ppg ? 'ppg' : 'last5') as PickSort
    };
};
