import React, { createContext, useContext, useState, ReactNode } from 'react';

export type LeagueType = 'lidom' | 'wbc' | 'sdc';

interface LeagueConfig {
    id: LeagueType;
    name: string;
    fullName: string;
    sportId: number;
    leagueId: number;
    logo?: string;
    color: string;
}

interface LeagueContextType {
    activeLeague: LeagueType;
    setActiveLeague: (league: LeagueType) => void;
    leagueConfig: LeagueConfig;
    leagues: LeagueConfig[];
}

const LEAGUES: LeagueConfig[] = [
    {
        id: 'lidom',
        name: 'LIDOM',
        fullName: 'Liga Dominicana de Béisbol',
        sportId: 17,
        leagueId: 131,
        color: '#22d3ee', // cyan-400
        logo: '🇩🇴'
    },
    {
        id: 'wbc',
        name: 'WBC',
        fullName: 'World Baseball Classic',
        sportId: 51,
        leagueId: 160,
        color: '#f59e0b', // amber-500
        logo: '🌎'
    },
    {
        id: 'sdc',
        name: 'SDC',
        fullName: 'Serie del Caribe',
        sportId: 17,
        leagueId: 162,
        color: '#ef4444', // red-500
        logo: '🌴'
    }
];

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

export const LeagueProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeLeague, setActiveLeagueState] = useState<LeagueType>(() => {
        // Restore from localStorage
        const saved = localStorage.getItem('activeLeague');
        return (saved as LeagueType) || 'lidom';
    });

    const setActiveLeague = (league: LeagueType) => {
        setActiveLeagueState(league);
        localStorage.setItem('activeLeague', league);
    };

    const leagueConfig = LEAGUES.find(l => l.id === activeLeague) || LEAGUES[0];

    return (
        <LeagueContext.Provider value={{ 
            activeLeague, 
            setActiveLeague, 
            leagueConfig,
            leagues: LEAGUES 
        }}>
            {children}
        </LeagueContext.Provider>
    );
};

export const useLeague = (): LeagueContextType => {
    const context = useContext(LeagueContext);
    if (!context) {
        throw new Error('useLeague must be used within a LeagueProvider');
    }
    return context;
};

export { LEAGUES };
