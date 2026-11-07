// El selector de peloteros: estado de cada uno (Confirmado, Banca, Abridor probable…), su rival, su línea de la
// temporada, filtros (Disponibles, Me alcanza, Titulares, por juego, por equipo), orden y por qué no se puede agregar.
// Lo nuevo de las reglas v2 (status, opp, season, last5, priceDelta) puede no venir: se saca de lo que ya hay.
import type { PlayerRow } from './stats';
import {
    canAdd,
    creditsLeft,
    gameOf,
    gameStarted,
    isLocked,
    isPostponed,
    perTeamLimit,
    rulesOf,
    type AddProblem,
    type DayEntry,
    type FantasyDay,
    type FantasyPlayer,
    type FantasySeasonLine,
    type PlayerStatus
} from './fantasy';
import { valueOf } from './fantasyBest';

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Jugó en el juego (el servidor lo marca; si la línea trae algo, también) */
const hasPlayed = (player: FantasyPlayer) =>
    player.played || player.points !== 0 || (!!player.line && Object.entries(player.line).some(([key, value]) => key !== 'ip' && typeof value === 'number' && value > 0));

/** Estado del pelotero: el que manda el servidor o, si no viene, el que se saca del día */
export const statusOf = (day: FantasyDay, player: FantasyPlayer, now = Date.now()): PlayerStatus | null => {
    if (player.status) return player.status;
    if (isPostponed(day, player)) return 'postponed';
    const game = gameOf(day, player.gamePk);
    if (!game) return null;
    if (game.state === 'final' && !hasPlayed(player)) return 'dnp';
    if (player.role === 'P') {
        const probables = game.probables ?? { away: game.away?.probable?.id ?? null, home: game.home?.probable?.id ?? null };
        if (probables.away === player.id || probables.home === player.id) return 'probable';
        // Abrió el último juego de su equipo, o en los últimos 4 días
        if (player.rest || (player.startedAgo !== undefined && player.startedAgo <= 4)) return 'resting';
        return 'bullpen';
    }
    // Antes del juego `starter` es «abrió el último juego»; empezado, «está en la alineación»
    if (!player.starter) return 'bench';
    return gameStarted(game, now) ? 'confirmed' : 'expected';
};

const STARTERS = new Set<PlayerStatus>(['confirmed', 'expected', 'probable']);
export const isStarter = (status: PlayerStatus | null) => !!status && STARTERS.has(status);

/** Su rival del día (home = él juega en casa): «LIC vs TOR» en casa, «LIC @ TOR» de visita */
export const opponentOf = (day: FantasyDay, player: FantasyPlayer): { id: number; abbrev: string; home: boolean } | null => {
    if (player.opp !== undefined) return player.opp;
    const game = gameOf(day, player.gamePk);
    if (!game?.away || !game.home) return null;
    const home = game.home.id === player.teamId;
    const other = home ? game.away : game.home;
    return { id: other.id, abbrev: day.teams[other.id]?.abbrev ?? other.abbrev, home };
};

/** Línea de la temporada: la del servidor o, si no viene, la de las estadísticas de la temporada actual */
export const seasonLineOf = (player: FantasyPlayer, row?: PlayerRow | null): FantasySeasonLine | null => {
    if (player.season !== undefined) return player.season;
    if (!row) return null;
    if (player.role === 'P' && row.pitching) return { era: row.pitching.era, whip: row.pitching.whip, k: row.pitching.k, g: row.pitching.g };
    if (player.role === 'B' && row.hitting) return { avg: row.hitting.avg, ops: row.hitting.ops, hr: row.hitting.hr, g: row.hitting.g };
    return null;
};

/** Promedio de sus últimos 5 juegos (null sin juegos) */
export const last5Average = (player: Pick<FantasyPlayer, 'last5'>) => {
    const list = Array.isArray(player.last5) ? player.last5.filter((value) => typeof value === 'number' && Number.isFinite(value)) : [];
    return list.length ? round1(list.reduce((sum, value) => sum + value, 0) / list.length) : null;
};

export type PickerSort = 'proj' | 'value' | 'price' | 'ppg' | 'last5' | 'owned';
export const PICKER_SORTS: PickerSort[] = ['proj', 'value', 'price', 'ppg', 'last5', 'owned'];

export interface PickerFilters {
    role: 'B' | 'P';
    search: string;
    /** Oculta a los cerrados, pospuestos y a los que no se pueden agregar (los del equipo siempre se ven) */
    available: boolean;
    /** Precio ≤ créditos que quedan */
    affordable: boolean;
    /** Confirmado, Esperado o Abridor probable */
    starters: boolean;
    gamePk: number | null;
    teamId: number | null;
}

export const defaultFilters = (role: 'B' | 'P'): PickerFilters => ({ role, search: '', available: true, affordable: false, starters: false, gamePk: null, teamId: null });

export interface PickerContext {
    /** Puntos de fantasy por juego en la temporada */
    ppg?: Map<number, number>;
    /** % que lo eligió (solo con juegos empezados) */
    owned?: Map<number, number>;
    now?: number;
}

export interface PickerRow {
    player: FantasyPlayer;
    reason: AddProblem;
    inTeam: boolean;
    status: PlayerStatus | null;
    locked: boolean;
}

export const normalizeText = (text: string) =>
    text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

/** El número por el que se ordena (null va al final) */
export const sortValue = (player: FantasyPlayer, sort: PickerSort, context: PickerContext = {}): number | null => {
    switch (sort) {
        case 'proj':
            return player.proj ?? null;
        case 'value':
            return valueOf(player);
        case 'price':
            return player.price ?? null;
        case 'ppg':
            return context.ppg?.get(player.id) ?? null;
        case 'last5':
            return last5Average(player);
        case 'owned':
            return context.owned?.get(player.id) ?? null;
    }
};

const desc = (a: number | null | undefined, b: number | null | undefined) => (b ?? -Infinity) - (a ?? -Infinity) || 0;

/** Las filas del selector con los filtros y el orden (de mayor a menor; empates por proyección y nombre) */
export const pickerRows = (day: FantasyDay, entry: DayEntry, filters: PickerFilters, sort: PickerSort, context: PickerContext = {}): PickerRow[] => {
    const now = context.now ?? Date.now();
    const left = creditsLeft(day, entry);
    const query = normalizeText(filters.search);
    // Por juego: los de sus dos equipos (en una doble cartelera el pelotero va con el primer juego, pero juega los dos)
    const picked = filters.gamePk === null ? null : gameOf(day, filters.gamePk);
    const inGame = (player: FantasyPlayer) => filters.gamePk === null || player.gamePk === filters.gamePk || (!!picked && (picked.away?.id === player.teamId || picked.home?.id === player.teamId));
    return day.players
        .filter(
            (player) =>
                player.role === filters.role &&
                inGame(player) &&
                (filters.teamId === null || player.teamId === filters.teamId) &&
                (!query || normalizeText(player.name).includes(query))
        )
        .map((player) => ({ player, reason: canAdd(day, entry, player, now), inTeam: entry.lineup.includes(player.id), status: statusOf(day, player, now), locked: isLocked(day, player, now) }))
        .filter((row) => {
            if (filters.available && !row.inTeam && row.reason !== null) return false;
            if (filters.affordable && !row.inTeam && left !== null && (row.player.price ?? 0) > left + 1e-9) return false;
            if (filters.starters && !isStarter(row.status)) return false;
            return true;
        })
        .sort((a, b) => desc(sortValue(a.player, sort, context), sortValue(b.player, sort, context)) || desc(a.player.proj, b.player.proj) || a.player.name.localeCompare(b.player.name, 'es'));
};

/** Los números de la razón: «Ya tienes 2 de LIC», «Te faltan 1,5 créditos», «Ya tienes tus 5 bateadores» */
export const reasonDetail = (day: FantasyDay, entry: DayEntry, player: FantasyPlayer, reason: AddProblem) => {
    const rules = rulesOf(day);
    if (reason === 'team') return { n: perTeamLimit(day), team: day.teams[player.teamId]?.abbrev ?? '' };
    if (reason === 'budget') return { short: round1(Math.max(0, (player.price ?? 0) - (creditsLeft(day, entry) ?? 0))) };
    if (reason === 'full') return player.role === 'P' ? { count: rules.pitchers } : { n: rules.batters };
    return {};
};

/** Los juegos del día para los chips («LIC-TOR 7:30»), en orden de hora */
export const pickerGames = (day: FantasyDay) =>
    [...day.games]
        .filter((game) => game.away && game.home)
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.gamePk - b.gamePk)
        .map((game) => ({ gamePk: game.gamePk, away: day.teams[game.away.id]?.abbrev ?? game.away.abbrev, home: day.teams[game.home.id]?.abbrev ?? game.home.abbrev, date: game.date, tbd: !!game.startTimeTBD }));
