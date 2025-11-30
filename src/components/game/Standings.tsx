import React from 'react';
import { Card } from '../ui/Card';

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

interface StandingsProps {
    standings: StandingItem[];
}

export const Standings: React.FC<StandingsProps> = ({ standings }) => {
    if (!standings) return null;

    return (
        <Card className="h-full flex flex-col">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex-shrink-0">Tabla de Posiciones</h3>
            <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent max-h-[400px]">
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
                        {standings.map((team) => (
                            <tr key={team.team.id} className="hover:bg-white/5 transition-colors">
                                <td className="py-3 pl-2 font-medium text-zinc-200">
                                    <div className="flex items-center gap-2">
                                        <img
                                            src={team.team.logo}
                                            alt={team.team.name}
                                            className="w-6 h-6 object-contain"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                        <span className="truncate max-w-[120px] md:max-w-none">{team.team.name}</span>
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
            </div>
        </Card>
    );
};
