// Estadísticas colectivas de cada equipo (las mismas de la web, lib/teamStats.ts): el récord y las carreras que usa la
// probabilidad de victoria antes del juego, y el bateo y el pitcheo con su puesto en la liga (página del equipo y comparar).
import { useQuery } from '@tanstack/react-query';
import type { LeagueId } from '../types';
import type { HittingLine, PitchingLine, StatsTeam } from './stats';
import { getApiJson } from './api';

export interface TeamHitting extends HittingLine {
    lob: number;
    babip: string;
}

export interface TeamPitching extends PitchingLine {
    r: number;
    avg: string;
}

export interface TeamRow extends StatsTeam {
    hitting: TeamHitting | null;
    pitching: TeamPitching | null;
}

export interface TeamStatsData {
    league: LeagueId;
    season: number;
    currentSeason: number;
    isPreviousSeason: boolean;
    teams: TeamRow[];
}

export const useTeamStats = (league: LeagueId, enabled = true) =>
    useQuery({
        queryKey: ['team-stats', league, 'actual'],
        queryFn: ({ signal }) => getApiJson<TeamStatsData>(`/api/v2/team-stats?league=${league}`, signal),
        enabled,
        staleTime: 5 * 60 * 1000
    });

/** Récord (de las decisiones del pitcheo) y carreras anotadas y permitidas */
export const recordOf = (team: TeamRow) => {
    const w = team.pitching?.w ?? 0;
    const l = team.pitching?.l ?? 0;
    const scored = team.hitting?.r ?? null;
    const allowed = team.pitching?.r ?? null;
    return { w, l, scored, allowed, diff: scored !== null && allowed !== null ? scored - allowed : null };
};

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

/** Lo que se mira de cada equipo (los textos van en team.sort.<grupo>.<clave>) */
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
