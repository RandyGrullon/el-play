import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../ui/Card';
import { useLeague } from '../../store/LeagueContext';

interface StandingItem {
    team: {
        id: number;
        name: string;
        logo: string;
    };
    wins: number;
    losses: number;
    pct: string;
    gamesBack: string;
}

interface StandingsData {
    regular: StandingItem[];
    roundRobin: StandingItem[];
    final: StandingItem[];
    activePhase: 'regular' | 'roundRobin' | 'final';
}

interface WBCStandingsData {
    pools: Record<string, StandingItem[]>;
    type: 'wbc';
    league: string;
}

interface SDCStandingsData {
    teams: StandingItem[];
    type: 'sdc';
    league: string;
}

interface StandingsProps {
    standings: StandingsData | WBCStandingsData | SDCStandingsData | StandingItem[];
}

type PhaseType = 'regular' | 'roundRobin' | 'final';

// Check if standings is WBC format
const isWBCFormat = (data: any): data is WBCStandingsData => {
    return data && typeof data === 'object' && data.type === 'wbc' && 'pools' in data;
};

// Check if standings is SDC format
const isSDCFormat = (data: any): data is SDCStandingsData => {
    return data && typeof data === 'object' && data.type === 'sdc' && 'teams' in data;
};

export const Standings: React.FC<StandingsProps> = ({ standings }) => {
    const { leagueConfig } = useLeague();
    const [activeTab, setActiveTab] = useState<PhaseType>('regular');
    const tabsRef = useRef<HTMLDivElement>(null);

    // Determine if we have the new multi-phase structure
    const isMultiPhase = standings && !Array.isArray(standings) && 'regular' in standings;

    // Calculate dynamic height based on number of teams (each row ~48px + header ~36px)
    const getPhaseHeight = (phase: PhaseType): number => {
        if (!isMultiPhase) return 400;
        const data = standings as StandingsData;
        const teams = data[phase]?.length || 0;
        if (teams === 0) return 256; // Empty state height
        const rowHeight = 48;
        const headerHeight = 36;
        const padding = 16;
        return headerHeight + (teams * rowHeight) + padding;
    };

    const tabs = [
        { id: 'regular', label: 'Regular' },
        { id: 'roundRobin', label: 'Round Robin' },
        { id: 'final', label: 'Final' }
    ];

    // Set initial active tab based on which phase is currently active
    useEffect(() => {
        if (isMultiPhase) {
            const data = standings as StandingsData;
            if (data.activePhase) {
                setActiveTab(data.activePhase);
            }
        }
    }, [standings, isMultiPhase]);

    if (!standings) return null;

    // Handle WBC format with pools
    if (isWBCFormat(standings)) {
        const poolNames = Object.keys(standings.pools).sort();
        return (
            <Card className="h-full flex flex-col">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex-shrink-0">Tabla de Posiciones - WBC</h3>
                <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent max-h-[500px] space-y-6">
                    {poolNames.length > 0 ? poolNames.map(poolName => (
                        <div key={poolName}>
                            <h4 className="text-sm font-bold text-amber-500 mb-2 px-2">{poolName}</h4>
                            <StandingsTable standings={standings.pools[poolName]} />
                        </div>
                    )) : (
                        <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-2 opacity-50">
                            <div className="w-12 h-1 bg-zinc-800 rounded-full" />
                            <span className="text-xs">No hay datos disponibles</span>
                        </div>
                    )}
                </div>
            </Card>
        );
    }

    // Handle SDC format (Serie del Caribe)
    if (isSDCFormat(standings)) {
        return (
            <Card className="h-full flex flex-col">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex-shrink-0">Tabla de Posiciones - Serie del Caribe</h3>
                <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent max-h-[500px]">
                    {standings.teams.length > 0 ? (
                        <StandingsTable standings={standings.teams} />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-2 opacity-50">
                            <div className="w-12 h-1 bg-zinc-800 rounded-full" />
                            <span className="text-xs">No hay datos disponibles</span>
                        </div>
                    )}
                </div>
            </Card>
        );
    }

    // Handle legacy array format
    if (Array.isArray(standings)) {
        return (
            <Card className="h-full flex flex-col">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex-shrink-0">Tabla de Posiciones</h3>
                <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent max-h-[400px]">
                    <StandingsTable standings={standings} />
                </div>
            </Card>
        );
    }

    const handleTabClick = (tabId: PhaseType) => {
        setActiveTab(tabId);
    };

    return (
        <Card className="flex flex-col overflow-hidden w-full max-w-full">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Tabla de Posiciones</h3>

            <div ref={tabsRef} className="flex items-center justify-between mb-4 overflow-x-auto scrollbar-hide w-full">
                <div className="flex bg-zinc-900/50 rounded-lg p-1 border border-white/5 w-full md:w-auto min-w-max">
                    {tabs.map((tab) => {
                        const phaseData = standings[tab.id as PhaseType] || [];
                        const hasData = phaseData.length > 0;
                        
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleTabClick(tab.id as PhaseType)}
                                disabled={!hasData}
                                className={`flex-1 md:flex-none px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                                    activeTab === tab.id
                                        ? 'text-black shadow-sm'
                                        : hasData
                                            ? 'text-zinc-500 hover:text-zinc-300'
                                            : 'text-zinc-700 cursor-not-allowed'
                                }`}
                                style={activeTab === tab.id ? { backgroundColor: leagueConfig.color } : {}}
                            >
                                {tab.label}
                                {hasData && <span className="ml-1 text-[8px]">({phaseData.length})</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div
                className="overflow-hidden transition-all duration-300 ease-out"
                style={{ height: getPhaseHeight(activeTab) }}
            >
                {tabs.map((tab) => {
                    const phaseStandings = standings[tab.id as PhaseType] || [];
                    const isActive = activeTab === tab.id;

                    return (
                        <div 
                            key={tab.id} 
                            className={`w-full px-1 transition-opacity duration-200 ${isActive ? 'block' : 'hidden'}`}
                        >
                            {phaseStandings.length > 0 ? (
                                <div>
                                    <StandingsTable standings={phaseStandings} />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-2 opacity-50">
                                    <div className="w-12 h-1 bg-zinc-800 rounded-full" />
                                    <span className="text-xs">No hay datos disponibles</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};

// Extracted table component for reuse
const StandingsTable: React.FC<{ standings: StandingItem[] }> = ({ standings }) => (
    <table className="w-full text-sm text-left border-collapse">
        <thead className="text-xs text-zinc-500 uppercase border-b border-white/5 sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-10">
            <tr>
                <th className="py-2 pl-2">Equipo</th>
                <th className="py-2 text-center">G</th>
                <th className="py-2 text-center">P</th>
                <th className="py-2 text-center">PCT</th>
                <th className="py-2 text-center pr-2">DIF</th>
            </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
            {standings.map((team, index) => (
                <tr key={team.team.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 pl-2 font-medium text-zinc-200">
                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold w-5 text-center ${
                                index === 0 ? 'text-yellow-500' : 
                                index === 1 ? 'text-zinc-400' : 
                                index === 2 ? 'text-amber-700' : 'text-zinc-600'
                            }`}>
                                {index + 1}
                            </span>
                            <img
                                src={team.team.logo}
                                alt={team.team.name}
                                loading="lazy"
                                className="w-6 h-6 object-contain"
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                            <span className="truncate max-w-[100px] md:max-w-none">{team.team.name}</span>
                        </div>
                    </td>
                    <td className="py-3 text-center text-zinc-400">{team.wins}</td>
                    <td className="py-3 text-center text-zinc-400">{team.losses}</td>
                    <td className="py-3 text-center text-zinc-400">{team.pct}</td>
                    <td className="py-3 text-center text-zinc-400 pr-2">{team.gamesBack}</td>
                </tr>
            ))}
        </tbody>
    </table>
);
