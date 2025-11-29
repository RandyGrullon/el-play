import React from 'react';
import { Team } from '../../types';

interface ScoreboardProps {
    home: Team;
    away: Team;
    inning: string;
    status: string;
}

interface TeamScoreProps {
    team: Team;
    isHome: boolean;
}

const TeamScore: React.FC<TeamScoreProps> = ({ team, isHome }) => (
    <div className={`flex flex-col ${isHome ? 'items-start' : 'items-end'} space-y-1`}>
        <img
            src={team.logo}
            alt={team.name}
            className="w-12 h-12 md:w-16 md:h-16 object-contain mb-2"
            onError={(e) => (e.currentTarget.style.display = 'none')}
        />
        <div className="text-3xl md:text-5xl font-black text-white tracking-tighter">
            {team.abbreviation}
        </div>
        <div className="text-[10px] md:text-xs font-medium text-zinc-500 uppercase tracking-widest">
            {team.name}
        </div>
        <div className="text-5xl md:text-7xl font-bold text-white tabular-nums leading-none mt-2">
            {team.runs}
        </div>
        <div className="flex gap-3 text-[10px] md:text-xs font-mono text-zinc-400 mt-2">
            <span title="Hits">H: <span className="text-zinc-200">{team.hits}</span></span>
            <span title="Errors">E: <span className="text-zinc-200">{team.errors}</span></span>
        </div>
    </div>
);

export const Scoreboard: React.FC<ScoreboardProps> = ({ home, away, inning, status }) => {
    return (
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 md:gap-8 items-center w-full">
            <TeamScore team={away} isHome={false} />

            <div className="flex flex-col items-center justify-center px-4 py-2 md:px-6 md:py-4 bg-zinc-900/50 rounded-xl border border-white/5 backdrop-blur-sm">
                <span className="text-[8px] md:text-[10px] font-bold text-cyan-400 uppercase tracking-[0.2em] mb-1 text-center">
                    {status}
                </span>
                <span className="text-lg md:text-2xl font-bold text-white whitespace-nowrap">
                    {inning}
                </span>
            </div>

            <TeamScore team={home} isHome={true} />
        </div>
    );
};
