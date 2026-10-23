// Estadísticas colectivas de cada equipo (las mismas de la web, lib/teamStats.ts): aquí solo lo que usa la
// probabilidad de victoria antes del juego (récord y carreras de cada equipo).
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
