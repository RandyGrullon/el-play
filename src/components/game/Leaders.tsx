import React from 'react';
import { Card } from '../ui/Card';

interface LeaderItem {
    rank: number;
    player: string;
    team: string;
    teamLogo: string;
    value: string;
    statName: string;
}

interface LeadersProps {
    leaders: LeaderItem[];
}

export const Leaders: React.FC<LeadersProps> = ({ leaders }) => {
    if (!leaders) return null;

    return (
        <Card className="h-full">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Líderes de Jonrones</h3>
            <div className="space-y-3">
                {leaders.map((player, index) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3">
                            <span className="text-lg font-bold text-zinc-600 w-4">{player.rank}</span>
                            <div>
                                <div className="font-semibold text-zinc-200">{player.player}</div>
                                <div className="text-xs text-zinc-500 flex items-center gap-1">
                                    <img
                                        src={player.teamLogo}
                                        alt={player.team}
                                        className="w-3 h-3 object-contain"
                                        onError={(e) => (e.currentTarget.style.display = 'none')}
                                    />
                                    {player.team}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-cyan-400">{player.value}</span>
                            <span className="text-xs font-bold text-zinc-600 uppercase">{player.statName}</span>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};
