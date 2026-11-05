// Página del equipo: sus juegos de la temporada y lo que se saca de ellos (resultados, forma, contra cada rival, el
// próximo juego) más su fila en las posiciones. Lógica pura, la misma de la web (src/lib/team.ts, con sus pruebas).
import { useQuery } from '@tanstack/react-query';
import type { LeagueId, ScheduleGame, ScheduleTeam, StandingRow, Standings } from '../types';
import { isNotPlayed } from './baseball';
import { ApiError, getApiJson } from './api';

export interface TeamGamesData {
    league: LeagueId;
    season: number;
    currentSeason: number;
    teamId: number;
    games: ScheduleGame[];
}

// No reintentar lo que no se arregla solo (equipo inexistente, petición inválida)
const retry = (failureCount: number, error: Error) => !(error instanceof ApiError && [400, 404].includes(error.status)) && failureCount < 2;

/** Todos los juegos del equipo en la temporada (jugados y por jugar), con su marcador: GET /api/v2/team/:id/games */
export const useTeamGames = (league: LeagueId, teamId: number | null, season?: number) =>
    useQuery({
        queryKey: ['team-games', league, teamId, season ?? 'actual'],
        queryFn: ({ signal }) => getApiJson<TeamGamesData>(`/api/v2/team/${teamId}/games?league=${league}${season ? `&season=${season}` : ''}`, signal),
        enabled: !!teamId,
        staleTime: 60 * 1000,
        // Con un juego en vivo se vuelve a pedir cada 30 s (el marcador del juego de hoy)
        refetchInterval: (query) => (query.state.data?.games.some((game) => game.state === 'live') ? 30 * 1000 : false),
        retry
    });

/** Un juego terminado visto desde el equipo */
export interface TeamResult {
    game: ScheduleGame;
    home: boolean;
    opponent: ScheduleTeam;
    runs: number;
    allowed: number;
    won: boolean;
}

/** Juegos terminados del equipo (sin pospuestos, cancelados ni empates), del más viejo al más nuevo */
export const teamResults = (games: ScheduleGame[], teamId: number): TeamResult[] =>
    games
        .filter((game) => game.state === 'final' && !isNotPlayed(game.detailedState) && game.away.score !== null && game.home.score !== null && game.away.score !== game.home.score)
        .map((game) => {
            const home = game.home.id === teamId;
            const mine = home ? game.home : game.away;
            const theirs = home ? game.away : game.home;
            return { game, home, opponent: theirs, runs: mine.score ?? 0, allowed: theirs.score ?? 0, won: (mine.score ?? 0) > (theirs.score ?? 0) };
        })
        .sort((a, b) => a.game.date.localeCompare(b.game.date));

export interface Split {
    w: number;
    l: number;
}

export interface TeamSummary {
    w: number;
    l: number;
    rs: number;
    ra: number;
    home: Split;
    away: Split;
    /** Decididos por una carrera */
    oneRun: Split;
    /** Racha: ganados o perdidos seguidos al final */
    streak: { won: boolean; n: number } | null;
    /** Los últimos 10, del más viejo al más nuevo */
    last10: TeamResult[];
}

const add = (split: Split, won: boolean) => {
    if (won) split.w++;
    else split.l++;
};

export const summarize = (results: TeamResult[]): TeamSummary => {
    const summary: TeamSummary = { w: 0, l: 0, rs: 0, ra: 0, home: { w: 0, l: 0 }, away: { w: 0, l: 0 }, oneRun: { w: 0, l: 0 }, streak: null, last10: results.slice(-10) };
    for (const result of results) {
        add(summary, result.won);
        summary.rs += result.runs;
        summary.ra += result.allowed;
        add(result.home ? summary.home : summary.away, result.won);
        if (Math.abs(result.runs - result.allowed) === 1) add(summary.oneRun, result.won);
    }
    const last = results[results.length - 1];
    if (last) {
        let n = 0;
        for (let index = results.length - 1; index >= 0 && results[index].won === last.won; index--) n++;
        summary.streak = { won: last.won, n };
    }
    return summary;
};

export interface Versus extends Split {
    team: ScheduleTeam;
    rs: number;
    ra: number;
}

/** Cómo le va contra cada rival (los que más juegos tienen primero) */
export const versusAll = (results: TeamResult[]): Versus[] => {
    const rivals = new Map<number, Versus>();
    for (const result of results) {
        const row = rivals.get(result.opponent.id) ?? { team: result.opponent, w: 0, l: 0, rs: 0, ra: 0 };
        add(row, result.won);
        row.rs += result.runs;
        row.ra += result.allowed;
        rivals.set(result.opponent.id, row);
    }
    return [...rivals.values()].sort((a, b) => b.w + b.l - (a.w + a.l) || b.w - b.l - (a.w - a.l));
};

/** Entre los dos esta temporada (desde el equipo de la página) */
export const headToHead = (results: TeamResult[], otherId: number) => versusAll(results).find((row) => row.team.id === otherId) ?? null;

/** En espera: pospuesto, cancelado o suspendido cuya hora pasó hace más de una hora (todavía sin fecha nueva) */
const isOnHold = (game: ScheduleGame, now: number) => {
    if (isNotPlayed(game.detailedState)) return true;
    if (!/^suspended/i.test(game.detailedState)) return false;
    const start = Date.parse(game.date);
    return !Number.isFinite(start) || start < now - 3600000;
};

/** El juego que toca: el que está en vivo o el próximo por jugar (los pospuestos y suspendidos sin fecha no cuentan) */
export const nextGame = (games: ScheduleGame[], now = Date.now()) =>
    games.find((game) => game.state === 'live') ??
    games.filter((game) => game.state === 'preview' && !isOnHold(game, now) && Date.parse(game.date) > now - 4 * 3600 * 1000).sort((a, b) => a.date.localeCompare(b.date))[0] ??
    null;

/** La fila del equipo en las posiciones de la fase que se está jugando (o en la regular) y el nombre de esa fase */
export const standingOf = (standings: Standings | undefined, teamId: number): { row: StandingRow; phase: 'regular' | 'roundRobin' | 'final' | null; total: number } | null => {
    if (!standings) return null;
    if (standings.type === 'lidom') {
        for (const phase of [standings.activePhase, 'regular'] as const) {
            const rows = standings[phase];
            const row = rows.find((item) => item.team.id === teamId);
            if (row) return { row, phase, total: rows.length };
        }
        return null;
    }
    const groups = standings.type === 'sdc' ? [standings.teams] : Object.values(standings.pools);
    for (const rows of groups) {
        const row = rows.find((item) => item.team.id === teamId);
        if (row) return { row, phase: null, total: rows.length };
    }
    return null;
};
