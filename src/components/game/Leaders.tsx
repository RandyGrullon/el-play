import React, { useState, useRef } from 'react';
import { Card } from '../ui/Card';

interface LeaderItem {
    rank: number;
    player: string;
    team: string;
    teamLogo: string;
    value: string;
    statName: string;
}

interface LeadersData {
    homeRuns: LeaderItem[];
    battingAverage: LeaderItem[];
    runsBattedIn: LeaderItem[];
    ops: LeaderItem[];
    hits: LeaderItem[];
    stolenBases: LeaderItem[];
}

interface LeadersProps {
    leaders: LeadersData | any;
}

export const Leaders: React.FC<LeadersProps> = ({ leaders }) => {
    const [activeTab, setActiveTab] = useState<'homeRuns' | 'battingAverage' | 'runsBattedIn' | 'ops' | 'hits' | 'stolenBases'>('homeRuns');
    const scrollRef = useRef<HTMLDivElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);

    if (!leaders) return null;

    const tabs = [
        { id: 'homeRuns', label: 'Jonrones' },
        { id: 'battingAverage', label: 'Bateo' },
        { id: 'runsBattedIn', label: 'Remolcadas' },
        { id: 'ops', label: 'OPS' },
        { id: 'hits', label: 'Hits' },
        { id: 'stolenBases', label: 'Robos' }
    ];

    const handleTabClick = (tabId: string) => {
        setActiveTab(tabId as any);
        const index = tabs.findIndex(t => t.id === tabId);
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                left: index * scrollRef.current.clientWidth,
                behavior: 'smooth'
            });
        }
    };

    const handleScroll = () => {
        if (scrollRef.current) {
            const index = Math.round(scrollRef.current.scrollLeft / scrollRef.current.clientWidth);
            const tabId = tabs[index]?.id;
            if (tabId && tabId !== activeTab) {
                setActiveTab(tabId as any);

                // Scroll active tab into view in the header
                if (tabsRef.current) {
                    const tabButton = tabsRef.current.children[0].children[index] as HTMLElement;
                    if (tabButton) {
                        tabButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                }
            }
        }
    };

    return (
        <Card className="h-full flex flex-col min-h-[400px] overflow-hidden w-full max-w-full">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Líderes</h3>

            <div ref={tabsRef} className="flex items-center justify-between mb-6 overflow-x-auto scrollbar-hide w-full">
                <div className="flex bg-zinc-900/50 rounded-lg p-1 border border-white/5 w-full md:w-auto min-w-max">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`flex-1 md:flex-none px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-cyan-500 text-black shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide w-full max-w-full"
                onScroll={handleScroll}
                style={{ scrollBehavior: 'smooth' }}
            >
                {tabs.map((tab) => {
                    const currentLeaders = Array.isArray(leaders) ? [] : (leaders[tab.id] || []);

                    return (
                        <div key={tab.id} className="min-w-full w-full snap-center px-1">
                            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-hide">
                                {currentLeaders.length > 0 ? (
                                    currentLeaders.map((player: LeaderItem, index: number) => (
                                        <div key={`${tab.id}-${index}`} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <span className={`text-lg font-black w-6 text-center ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-zinc-400' : index === 2 ? 'text-amber-700' : 'text-zinc-700'}`}>
                                                    {player.rank}
                                                </span>
                                                <div>
                                                    <div className="font-bold text-zinc-200 text-sm">{player.player}</div>
                                                    <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                                                        <img
                                                            src={player.teamLogo}
                                                            alt={player.team}
                                                            className="w-3.5 h-3.5 object-contain"
                                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                                        />
                                                        <span className="uppercase tracking-wider">{player.team}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-xl font-black text-cyan-400 tabular-nums leading-none">{player.value}</span>
                                                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mt-1">{player.statName}</span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-2 opacity-50">
                                        <div className="w-12 h-1 bg-zinc-800 rounded-full" />
                                        <span className="text-xs">No hay datos disponibles</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};
