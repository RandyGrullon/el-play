import React from 'react';
import { Card } from '../ui/Card';
import { ScheduleItem } from '../../types';

interface ScheduleBarProps {
    games: ScheduleItem[];
    onSelectGame: (gamePk: number) => void;
    activeGamePk: number;
}

export const ScheduleBar: React.FC<ScheduleBarProps> = ({ games, onSelectGame, activeGamePk }) => {
    if (!games || games.length === 0) return null;

    return (
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {games.map((game) => (
                <button
                    key={game.gamePk}
                    onClick={() => onSelectGame(game.gamePk)}
                    className={`flex-shrink-0 min-w-[200px] text-left transition-all duration-300 ${activeGamePk === game.gamePk
                        ? 'ring-2 ring-cyan-500 scale-[1.02]'
                        : 'hover:bg-white/5'
                        }`}
                >
                    <Card className="p-4 h-full bg-zinc-900/80">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                            {game.status}
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className={`font-bold ${game.away.isWinner ? 'text-cyan-400' : 'text-zinc-300'}`}>
                                    {game.away.name.split(' ').pop()}
                                </span>
                                <span className="font-mono text-zinc-400">{game.away.score}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className={`font-bold ${game.home.isWinner ? 'text-cyan-400' : 'text-zinc-300'}`}>
                                    {game.home.name.split(' ').pop()}
                                </span>
                                <span className="font-mono text-zinc-400">{game.home.score}</span>
                            </div>
                        </div>
                    </Card>
                </button>
            ))}
        </div>
    );
};
