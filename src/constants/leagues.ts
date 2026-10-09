import type { LeagueId } from '../types';

export type { LeagueId };

export interface LeagueConfig {
    id: LeagueId;
    name: string;
    fullName: string;
    shortName: string;
    timeZone: string;
    /** Relleno (botones, indicadores) y tinta para texto en tema claro/oscuro */
    color: string;
    inkLight: string;
    inkDark: string;
}

export const LEAGUES: LeagueConfig[] = [
    { id: 'lidom', name: 'LIDOM', fullName: 'Liga Dominicana de Béisbol', shortName: 'LIDOM', timeZone: 'America/Santo_Domingo', color: '#2563eb', inkLight: '#1d4ed8', inkDark: '#7aa7ff' },
    { id: 'wbc', name: 'Clásico Mundial', fullName: 'World Baseball Classic', shortName: 'WBC', timeZone: 'America/Santo_Domingo', color: '#d97706', inkLight: '#b45309', inkDark: '#fbbf24' },
    { id: 'sdc', name: 'Serie del Caribe', fullName: 'Serie del Caribe', shortName: 'SDC', timeZone: 'America/Santo_Domingo', color: '#dc2626', inkLight: '#b91c1c', inkDark: '#ff8a80' }
];

/** Compatibilidad: color de relleno por liga */
export const LEAGUE_COLORS: Record<LeagueId, string> = Object.fromEntries(LEAGUES.map((league) => [league.id, league.color])) as Record<LeagueId, string>;
