// Estadísticas colectivas de bateo y pitcheo de cada equipo (las de MLB en /teams/stats): orden, puestos en la liga y
// el promedio de la liga para comparar.
import { useQuery } from '@tanstack/react-query';
import { ApiError } from './api';
import type { LeagueId } from '../types';
import type { HittingLine, PitchingLine, StatsTeam } from './stats';

export interface TeamHitting extends HittingLine {
    lob: number;
    babip: string;
}

export interface TeamPitching extends PitchingLine {
    /** Carreras permitidas (limpias y sucias) */
    r: number;
    /** Lo que le batean */
    avg: string;
    obp: string;
    ops: string;
    svo: number;
    bs: number;
    sho: number;
    cg: number;
}

export interface TeamRow extends StatsTeam {
    hitting: TeamHitting | null;
    pitching: TeamPitching | null;
}

export interface TeamStatsData {
    league: LeagueId;
    season: number;
    currentSeason: number;
    seasons: number[];
    isPreviousSeason: boolean;
    teams: TeamRow[];
}

const getJson = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const response = await fetch(path, { signal, headers: { Accept: 'application/json' } }).catch((error: Error) => {
        if (error.name === 'AbortError') throw error;
        throw new ApiError(error.message, typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'network');
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ApiError(`HTTP ${response.status}`, typeof body.error === 'string' ? body.error : 'internal_error', response.status);
    }
    return (await response.json()) as T;
};

export const useTeamStats = (league: LeagueId, season: number | undefined, enabled = true) =>
    useQuery({
        queryKey: ['team-stats', league, season ?? 'actual'],
        queryFn: ({ signal }) => getJson<TeamStatsData>(`/api/v2/team-stats?league=${league}${season ? `&season=${season}` : ''}`, signal),
        enabled,
        staleTime: 5 * 60 * 1000,
        placeholderData: (previous) => (previous?.league === league ? previous : undefined),
        retry: (count, error) => !(error instanceof ApiError && [400, 404].includes(error.status)) && count < 2
    });

// ---------------------------------------------------------------- orden y puestos

export type TeamGroup = 'bat' | 'pitch';

export interface TeamSort {
    key: string;
    value: (team: TeamRow) => number | null;
    show: (value: number) => string;
    /** Menos es mejor (EFE, WHIP, lo que le batean, los ponches recibidos…) */
    asc?: boolean;
}

const num = (value: string | number | undefined | null) => {
    const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
};
/** .265 sin el cero, como se escribe en béisbol */
const rate3 = (value: number) => value.toFixed(3).replace(/^0(?=\.)/, '');
const rate2 = (value: number) => value.toFixed(2);
const whole = (value: number) => String(Math.round(value));

export const TEAM_SORTS: Record<TeamGroup, TeamSort[]> = {
    bat: [
        { key: 'avg', value: (t) => num(t.hitting?.avg), show: rate3 },
        { key: 'ops', value: (t) => num(t.hitting?.ops), show: rate3 },
        { key: 'r', value: (t) => t.hitting?.r ?? null, show: whole },
        { key: 'hr', value: (t) => t.hitting?.hr ?? null, show: whole },
        { key: 'h', value: (t) => t.hitting?.h ?? null, show: whole },
        { key: 'obp', value: (t) => num(t.hitting?.obp), show: rate3 },
        { key: 'slg', value: (t) => num(t.hitting?.slg), show: rate3 },
        { key: 'sb', value: (t) => t.hitting?.sb ?? null, show: whole },
        { key: 'bb', value: (t) => t.hitting?.bb ?? null, show: whole },
        { key: 'k', value: (t) => t.hitting?.k ?? null, show: whole, asc: true }
    ],
    pitch: [
        { key: 'era', value: (t) => num(t.pitching?.era), show: rate2, asc: true },
        { key: 'whip', value: (t) => num(t.pitching?.whip), show: rate2, asc: true },
        { key: 'k', value: (t) => t.pitching?.k ?? null, show: whole },
        { key: 'avg', value: (t) => num(t.pitching?.avg), show: rate3, asc: true },
        { key: 'r', value: (t) => t.pitching?.r ?? null, show: whole, asc: true },
        { key: 'bb', value: (t) => t.pitching?.bb ?? null, show: whole, asc: true },
        { key: 'hr', value: (t) => t.pitching?.hr ?? null, show: whole, asc: true },
        { key: 'sv', value: (t) => t.pitching?.sv ?? null, show: whole }
    ]
};

/** Los de la tarjeta de cada vista (los que más se miran) */
export const TEAM_HIGHLIGHTS: Record<TeamGroup, string[]> = { bat: ['avg', 'hr', 'r', 'sb'], pitch: ['era', 'k', 'whip', 'sv'] };

export const teamSort = (group: TeamGroup, key: string) => TEAM_SORTS[group].find((sort) => sort.key === key) ?? TEAM_SORTS[group][0];

/** Equipos de mejor a peor en ese orden (los que no tienen el dato van al final) */
export const rankTeams = (teams: TeamRow[], sort: TeamSort) =>
    teams
        .map((team) => ({ team, value: sort.value(team) }))
        .sort((a, b) => {
            if (a.value === null && b.value === null) return a.team.abbrev.localeCompare(b.team.abbrev);
            if (a.value === null) return 1;
            if (b.value === null) return -1;
            return (sort.asc ? a.value - b.value : b.value - a.value) || a.team.abbrev.localeCompare(b.team.abbrev);
        });

/** Puesto de un equipo en la liga (1 = el mejor; los empatados comparten puesto) */
export const leagueRank = (teams: TeamRow[], team: TeamRow, sort: TeamSort) => {
    const mine = sort.value(team);
    if (mine === null) return null;
    const better = teams.filter((other) => {
        const value = sort.value(other);
        return value !== null && (sort.asc ? value < mine : value > mine);
    }).length;
    return better + 1;
};

/** Promedio de la liga en ese orden (los totales, por equipo) */
export const leagueAverage = (teams: TeamRow[], sort: TeamSort) => {
    const values = teams.map(sort.value).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
};

/** Récord (de las decisiones del pitcheo), diferencia de carreras y juegos */
export const recordOf = (team: TeamRow) => {
    const w = team.pitching?.w ?? 0;
    const l = team.pitching?.l ?? 0;
    const scored = team.hitting?.r ?? null;
    const allowed = team.pitching?.r ?? null;
    return { w, l, games: Math.max(w + l, team.hitting?.g ?? 0), scored, allowed, diff: scored !== null && allowed !== null ? scored - allowed : null };
};
