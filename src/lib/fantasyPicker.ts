// El selector de peloteros del Fantasy (igual que src/lib/fantasyPicker.ts de la web, en el Lite y en PRO): estado de
// cada uno para el juego, su rival, por qué no se puede agregar, filtros (Disponibles, Me alcanza, Titulares, por juego
// y por equipo), orden (Proyección, Valor, Precio, Pts/J, Últimos 5 y % elegido) y lo que falta para completar. Lo nuevo
// de las reglas v2 (status, opp, season, last5, priceDelta) puede no venir: se saca de lo que ya hay. Lógica pura.
import { canAdd, creditsLeft, gameStarted, isLocked, occupying, perTeamLimit, playerPostponed, rulesOf, type AddProblem, type DayEntry, type FantasyDay, type FantasyGame, type FantasyPlayer, type PlayerStatus } from './fantasy';
import { valueOf } from './fantasyBest';

export type PickSort = 'proj' | 'value' | 'price' | 'ppg' | 'last5' | 'owned';
export const PICK_SORTS: PickSort[] = ['proj', 'value', 'price', 'ppg', 'last5', 'owned'];

/** La etiqueta de la fila: cómo llega a su juego, o que ya empezó (no se puede agregar ni quitar) */
export type BadgeStatus = PlayerStatus | 'started';

const round1 = (value: number) => Math.round(value * 10) / 10;
const gameOf = (day: Pick<FantasyDay, 'games'>, player: Pick<FantasyPlayer, 'gamePk'>) => day.games.find((game) => game.gamePk === player.gamePk);

/** Jugó en el juego (el servidor lo marca; si la línea trae algo, también) */
const hasPlayed = (player: FantasyPlayer) =>
    player.played || player.points !== 0 || (!!player.line && Object.entries(player.line).some(([key, value]) => key !== 'ip' && typeof value === 'number' && value > 0));

/**
 * Cómo llega a su juego: el `status` del servidor o, si no viene, lo que se sepa de otra parte (`hint`: en PRO, las
 * alineaciones publicadas o esperadas) o lo que se saca del día: pospuesto; «No jugó» si su juego terminó sin él;
 * lanzador abridor probable, descansando (abrió hace 4 días o menos) o bullpen; bateador en la banca si no abrió el
 * último juego, y si sí, esperado (confirmado con su juego ya empezado). Igual que la web.
 */
export const statusOf = (day: FantasyDay, player: FantasyPlayer, now = Date.now(), hint?: PlayerStatus | null): PlayerStatus | null => {
    if (player.status) return player.status === 'probable' && player.estimated ? 'rotation' : player.status;
    if (playerPostponed(day, player)) return 'postponed';
    const game = gameOf(day, player);
    if (!game) return null;
    if (game.state === 'final' && !hasPlayed(player)) return 'dnp';
    if (hint) return hint;
    if (player.role === 'P') {
        const probables = game.probables ?? { away: game.away?.probable?.id ?? null, home: game.home?.probable?.id ?? null };
        if (probables.away === player.id || probables.home === player.id) return 'probable';
        if (player.rest || (player.startedAgo !== undefined && player.startedAgo <= 4)) return 'resting';
        return 'bullpen';
    }
    // Antes del juego `starter` es «abrió el último juego»; empezado, «está en la alineación»
    if (!player.starter) return 'bench';
    return gameStarted(game, now) ? 'confirmed' : 'expected';
};

/** La etiqueta que se ve en la lista: pospuesto y «No jugó» siempre; con su juego empezado, «Ya empezó» */
export const badgeOf = (row: Pick<PickRow, 'status' | 'locked'>): BadgeStatus | null => (row.status === 'dnp' || row.status === 'postponed' ? row.status : row.locked ? 'started' : row.status);

/** Va de titular: confirmado o esperado en la alineación, abridor probable o le toca abrir por la rotación */
export const isStarterStatus = (status: BadgeStatus | null) => status === 'confirmed' || status === 'expected' || status === 'probable' || status === 'rotation';

/** Por qué no se puede agregar, con lo que hace falta para el texto («Ya tienes 2 de LIC», «Te faltan 1.5 créditos») */
export type PickReason = { kind: 'started' } | { kind: 'postponed' } | { kind: 'fullB'; n: number } | { kind: 'fullP'; count: number } | { kind: 'team'; n: number; team: string } | { kind: 'budget'; short: number };

export const reasonFrom = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer, problem: AddProblem): PickReason | null => {
    if (problem === 'locked') return { kind: 'started' };
    if (problem === 'postponed') return { kind: 'postponed' };
    if (problem === 'full') return player.role === 'P' ? { kind: 'fullP', count: rulesOf(day).roster.pitchers } : { kind: 'fullB', n: rulesOf(day).roster.batters };
    if (problem === 'team') return { kind: 'team', n: perTeamLimit(day), team: day.teams[player.teamId]?.abbrev ?? '' };
    if (problem === 'budget') return { kind: 'budget', short: round1(Math.max(0, (player.price ?? 0) - (creditsLeft(day, entry) ?? 0))) };
    return null;
};

export const reasonOf = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer, now = Date.now()): PickReason | null => reasonFrom(day, entry, player, canAdd(day, entry, player, now));

/** Rival del día: «vs TOR» en casa, «@ TOR» de visitante (del servidor nuevo o, sin él, del juego) */
export const matchupOf = (day: FantasyDay, player: FantasyPlayer): { team: string; opp: string; home: boolean } | null => {
    const team = day.teams[player.teamId]?.abbrev ?? '';
    if (player.opp !== undefined) return player.opp ? { team, opp: player.opp.abbrev, home: player.opp.home } : null;
    const game = gameOf(day, player);
    if (!game?.away || !game.home) return null;
    const home = game.home.id === player.teamId;
    const other = home ? game.away : game.home;
    return { team, opp: day.teams[other.id]?.abbrev ?? other.abbrev, home };
};

/** Promedio de una lista de puntos (con un decimal); null si no hay */
export const avgOf = (list: number[] | null | undefined) => (list?.length ? round1(list.reduce((sum, value) => sum + value, 0) / list.length) : null);

/** Lo que el selector sabe de cada uno además del día (de otras consultas): Pts/J, últimos 5 y % elegido */
export interface PickExtras {
    /** Puntos de fantasy por juego en la temporada actual */
    ppg?: (player: FantasyPlayer) => number | null | undefined;
    /** Últimos 5 juegos si el día no los trae (en PRO, la forma), del más viejo al más nuevo */
    last5?: (player: FantasyPlayer) => number[] | null | undefined;
    /** % de fanáticos que lo eligieron (solo existe cuando ya empezó algún juego) */
    owned?: (player: FantasyPlayer) => number | null | undefined;
    /** Cómo llega a su juego si el día no lo dice (en PRO, por las alineaciones) */
    status?: (player: FantasyPlayer) => PlayerStatus | null | undefined;
}

export interface PickFilters {
    role: 'B' | 'P';
    search: string;
    /** Sin los cerrados, los pospuestos ni los que no se pueden agregar (los de tu equipo siempre se ven) */
    available: boolean;
    /** Precio que cabe en los créditos que quedan */
    affordable: boolean;
    /** Confirmados, esperados y abridores probables */
    starters: boolean;
    gamePk: number | null;
    teamId: number | null;
}

export const DEFAULT_FILTERS: Omit<PickFilters, 'role'> = { search: '', available: true, affordable: false, starters: false, gamePk: null, teamId: null };
export const defaultFilters = (role: 'B' | 'P'): PickFilters => ({ role, ...DEFAULT_FILTERS });

/** Hay algún filtro puesto (para «Quitar filtros») */
export const isFiltered = (filters: PickFilters) => filters.search !== '' || !filters.available || filters.affordable || filters.starters || filters.gamePk !== null || filters.teamId !== null;

export interface PickRow {
    player: FantasyPlayer;
    inTeam: boolean;
    locked: boolean;
    status: PlayerStatus | null;
    problem: AddProblem;
    /** Por qué no se puede agregar (null si se puede o si ya está en tu equipo) */
    reason: PickReason | null;
    value: number | null;
    ppg: number | null;
    last5: number[];
    last5Avg: number | null;
    owned: number | null;
}

/** Sin tildes ni mayúsculas, para buscar «nunez» y encontrar a Núñez */
export const normalized = (text: string) =>
    text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

const num = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const pickRowOf = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer, extras: PickExtras = {}, now = Date.now()): PickRow => {
    const inTeam = entry.lineup.includes(player.id);
    const problem = canAdd(day, entry, player, now);
    const last5 = (Array.isArray(player.last5) ? player.last5 : (extras.last5?.(player) ?? [])).filter((value) => typeof value === 'number' && Number.isFinite(value)).slice(-5);
    return {
        player,
        inTeam,
        locked: isLocked(day, player, now),
        status: statusOf(day, player, now, extras.status?.(player)),
        problem,
        reason: inTeam ? null : reasonFrom(day, entry, player, problem),
        value: valueOf(player),
        ppg: num(extras.ppg?.(player)),
        last5,
        last5Avg: avgOf(last5),
        owned: num(extras.owned?.(player))
    };
};

/** El número por el que se ordena (null va al final) */
export const sortValue = (row: PickRow, sort: PickSort): number | null =>
    sort === 'proj' ? num(row.player.proj) : sort === 'value' ? row.value : sort === 'price' ? num(row.player.price) : sort === 'ppg' ? row.ppg : sort === 'last5' ? row.last5Avg : row.owned;

const desc = (a: number | null | undefined, b: number | null | undefined) => (b ?? -Infinity) - (a ?? -Infinity) || 0;

/** La lista del selector con los filtros y el orden (de mayor a menor, sin dato al final; empates por proyección y nombre) */
export const pickerRows = (day: FantasyDay, entry: DayEntry, filters: PickFilters, sort: PickSort, extras: PickExtras = {}, now = Date.now()): PickRow[] => {
    const left = creditsLeft(day, entry);
    const query = normalized(filters.search);
    return day.players
        .filter(
            (player) =>
                player.role === filters.role &&
                (filters.gamePk === null || player.gamePk === filters.gamePk) &&
                (filters.teamId === null || player.teamId === filters.teamId) &&
                (!query || normalized(player.name).includes(query))
        )
        .map((player) => pickRowOf(day, entry, player, extras, now))
        .filter((row) => {
            if (filters.available && !row.inTeam && row.problem !== null) return false;
            if (filters.affordable && !row.inTeam && left !== null && (row.player.price ?? 0) > left + 1e-9) return false;
            if (filters.starters && !isStarterStatus(row.status)) return false;
            return true;
        })
        .sort((a, b) => desc(sortValue(a, sort), sortValue(b, sort)) || desc(a.player.proj, b.player.proj) || a.player.name.localeCompare(b.player.name, 'es'));
};

/** Lo que falta: bateadores, lanzador y créditos que quedan (null si ese día no hay tope); un pospuesto deja su lugar libre */
export const slotsLeft = (day: FantasyDay, entry: Pick<DayEntry, 'lineup'>) => {
    const roster = rulesOf(day).roster;
    const chosen = occupying(day, entry);
    return {
        batters: Math.max(0, roster.batters - chosen.filter((p) => p.role === 'B').length),
        pitchers: Math.max(0, roster.pitchers - chosen.filter((p) => p.role === 'P').length),
        credits: creditsLeft(day, entry)
    };
};

/** Los juegos del día para los chips de juego («LIC-TOR 7:30»), en orden de hora */
export const pickerGames = (day: FantasyDay): FantasyGame[] => [...day.games].filter((game) => game.away && game.home).sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.gamePk - b.gamePk);

/** Qué orden se ofrece: sin proyección se empieza por Pts/J; el % elegido solo cuando ya hay (con algún juego empezado) */
export const pickerOptions = (day: FantasyDay, owned = false) => {
    const hasProj = day.players.some((player) => num(player.proj) !== null);
    return {
        affordable: creditsLeft(day, { lineup: [] }) !== null,
        sorts: PICK_SORTS.filter((sort) => sort !== 'owned' || owned),
        defaultSort: (hasProj ? 'proj' : 'ppg') as PickSort
    };
};

/** Lleno el rol que se está mirando (con «Disponibles» se avisa cómo cambiar a uno) */
export const roleFull = (day: FantasyDay, entry: DayEntry, role: 'B' | 'P') => slotsLeft(day, entry)[role === 'P' ? 'pitchers' : 'batters'] === 0;
