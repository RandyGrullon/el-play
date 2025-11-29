import React, { useState } from 'react';
import { Team } from '../../types';

interface BoxScoreProps {
    home: Team;
    away: Team;
}

export const BoxScore: React.FC<BoxScoreProps> = ({ home, away }) => {
    const [activeTab, setActiveTab] = useState<'home' | 'away'>('away'); // Default to away team (usually bats first)

    const activeTeam = activeTab === 'home' ? home : away;

    const batters = activeTeam.players?.filter(p => p.stats.batting && Object.keys(p.stats.batting).length > 0 && p.battingOrder) || [];
    const pitchers = activeTeam.players?.filter(p => p.stats.pitching && Object.keys(p.stats.pitching).length > 0) || [];

    return (
        <div className="space-y-6">
            {/* Team Tabs */}
            <div className="flex p-1 bg-zinc-900/50 rounded-xl border border-white/5">
                <button
                    onClick={() => setActiveTab('away')}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'away'
                        ? 'bg-zinc-800 text-white shadow-lg'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    {away.name}
                </button>
                <button
                    onClick={() => setActiveTab('home')}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'home'
                        ? 'bg-zinc-800 text-white shadow-lg'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    {home.name}
                </button>
            </div>

            {/* Batting Stats */}
            <div className="overflow-x-auto">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 px-2">Bateo</h3>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-white/10 text-[10px] text-zinc-500 uppercase tracking-wider">
                            <th className="p-2 font-bold w-full">Jugador</th>
                            <th className="p-2 font-bold text-center">AB</th>
                            <th className="p-2 font-bold text-center">R</th>
                            <th className="p-2 font-bold text-center">H</th>
                            <th className="p-2 font-bold text-center">RBI</th>
                            <th className="p-2 font-bold text-center">BB</th>
                            <th className="p-2 font-bold text-center">SO</th>
                            <th className="p-2 font-bold text-center">AVG</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs font-medium text-zinc-300">
                        {batters.map((player) => (
                            <tr key={player.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                <td className="p-2">
                                    <div className="flex flex-col">
                                        <span className="text-white">{player.name}</span>
                                        <span className="text-[10px] text-zinc-500">{player.position}</span>
                                    </div>
                                </td>
                                <td className="p-2 text-center">{player.stats.batting.atBats}</td>
                                <td className="p-2 text-center">{player.stats.batting.runs}</td>
                                <td className="p-2 text-center">{player.stats.batting.hits}</td>
                                <td className="p-2 text-center">{player.stats.batting.rbi}</td>
                                <td className="p-2 text-center">{player.stats.batting.baseOnBalls}</td>
                                <td className="p-2 text-center">{player.stats.batting.strikeOuts}</td>
                                <td className="p-2 text-center">{player.stats.batting.avg}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pitching Stats */}
            <div className="overflow-x-auto">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 px-2">Pitcheo</h3>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-white/10 text-[10px] text-zinc-500 uppercase tracking-wider">
                            <th className="p-2 font-bold w-full">Jugador</th>
                            <th className="p-2 font-bold text-center">IP</th>
                            <th className="p-2 font-bold text-center">H</th>
                            <th className="p-2 font-bold text-center">R</th>
                            <th className="p-2 font-bold text-center">ER</th>
                            <th className="p-2 font-bold text-center">BB</th>
                            <th className="p-2 font-bold text-center">SO</th>
                            <th className="p-2 font-bold text-center">ERA</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs font-medium text-zinc-300">
                        {pitchers.map((player) => (
                            <tr key={player.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                <td className="p-2">
                                    <div className="flex flex-col">
                                        <span className="text-white">{player.name}</span>
                                        <span className="text-[10px] text-zinc-500">{player.position}</span>
                                    </div>
                                </td>
                                <td className="p-2 text-center">{player.stats.pitching.inningsPitche}</td>
                                <td className="p-2 text-center">{player.stats.pitching.hits}</td>
                                <td className="p-2 text-center">{player.stats.pitching.runs}</td>
                                <td className="p-2 text-center">{player.stats.pitching.earnedRuns}</td>
                                <td className="p-2 text-center">{player.stats.pitching.baseOnBalls}</td>
                                <td className="p-2 text-center">{player.stats.pitching.strikeOuts}</td>
                                <td className="p-2 text-center">{player.stats.pitching.era}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
