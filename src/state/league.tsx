import React, { createContext, useContext, useMemo, useState } from 'react';
import { LEAGUES, type LeagueConfig } from '../lib/leagues';
import type { LeagueId } from '../types';
import { getItem, setItem } from '../lib/storage';

interface LeagueValue {
    activeLeague: LeagueId;
    setActiveLeague: (league: LeagueId) => void;
    leagueConfig: LeagueConfig;
    leagues: LeagueConfig[];
}

const LeagueContext = createContext<LeagueValue | null>(null);
const KEY = 'el-play-league';

/** Liga activa (LIDOM, Clásico, Serie del Caribe): cambia los datos y el color de acento de la app */
export const LeagueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeLeague, setActive] = useState<LeagueId>(() => {
        const saved = getItem(KEY);
        return LEAGUES.some((league) => league.id === saved) ? (saved as LeagueId) : 'lidom';
    });
    const value = useMemo<LeagueValue>(
        () => ({
            activeLeague,
            setActiveLeague: (league) => {
                setActive(league);
                setItem(KEY, league);
            },
            leagueConfig: LEAGUES.find((league) => league.id === activeLeague) ?? LEAGUES[0],
            leagues: LEAGUES
        }),
        [activeLeague]
    );
    return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
};

export const useLeague = () => {
    const value = useContext(LeagueContext);
    if (!value) throw new Error('useLeague fuera de LeagueProvider');
    return value;
};
