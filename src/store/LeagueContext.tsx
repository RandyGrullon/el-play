import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LEAGUES, type LeagueConfig } from '../constants/leagues';
import type { LeagueId } from '../types';
import { readRawStorage, writeRawStorage } from './storage';

export type LeagueType = LeagueId;

interface LeagueContextType {
    activeLeague: LeagueId;
    setActiveLeague: (league: LeagueId) => void;
    leagueConfig: LeagueConfig;
    leagues: LeagueConfig[];
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

const hexToRgb = (hex: string) => {
    const value = parseInt(hex.slice(1), 16);
    return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
};

export const LeagueProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeLeague, setActive] = useState<LeagueId>(() => {
        const saved = readRawStorage('activeLeague');
        return LEAGUES.some((league) => league.id === saved) ? (saved as LeagueId) : 'lidom';
    });

    const leagueConfig = LEAGUES.find((league) => league.id === activeLeague) || LEAGUES[0];

    // El color de la liga vive en variables CSS: los componentes usan bg-accent / text-accent-ink
    useEffect(() => {
        const root = document.documentElement.style;
        root.setProperty('--accent', hexToRgb(leagueConfig.color));
        root.setProperty('--accent-ink-light', hexToRgb(leagueConfig.inkLight));
        root.setProperty('--accent-ink-dark', hexToRgb(leagueConfig.inkDark));
    }, [leagueConfig]);

    const value = useMemo(
        () => ({
            activeLeague,
            setActiveLeague: (league: LeagueId) => {
                setActive(league);
                writeRawStorage('activeLeague', league);
            },
            leagueConfig,
            leagues: LEAGUES
        }),
        [activeLeague, leagueConfig]
    );

    return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
};

export const useLeague = (): LeagueContextType => {
    const context = useContext(LeagueContext);
    if (!context) throw new Error('useLeague must be used within a LeagueProvider');
    return context;
};

export { LEAGUES };
