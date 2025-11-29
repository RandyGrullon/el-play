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
        <Card className="h-full">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Tabla de Posiciones</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-zinc-500 uppercase border-b border-white/5">
                        <tr>
                            <th className="py-2">Equipo</th>
                            <th className="py-2 text-center">G</th>
                            <th className="py-2 text-center">P</th>
                            <th className="py-2 text-center">PCT</th>
                            <th className="py-2 text-center">DIF</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {standings.map((team) => (
                            <tr key={team.team.id} className="hover:bg-white/5 transition-colors">
                                <td className="py-3 font-medium text-zinc-200">
                                    <div className="flex items-center gap-2">
                                        <img
                                            src={team.team.logo}
                                            alt={team.team.name}
                                            className="w-6 h-6 object-contain"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                        <span>{team.team.name}</span>
                                    </div>
                                </td>
                                <td className="py-3 text-center text-zinc-400">{team.wins}</td>
                                <td className="py-3 text-center text-zinc-400">{team.losses}</td>
                                <td className="py-3 text-center text-zinc-400">{team.pct}</td>
                                <td className="py-3 text-center text-zinc-400">{team.gamesBack}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};
