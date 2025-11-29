import React from 'react';
import { Link } from 'react-router-dom';
import { GameData } from '../../types';
import { Card } from '../ui/Card';
import { LineScore } from './LineScore';

interface GameSummaryProps {
    gameData: GameData;
}

export const GameSummary: React.FC<GameSummaryProps> = ({ gameData }) => {
    const { home, away, decisions, topPerformers, innings } = gameData;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Section */}
            <Card className="p-6 md:p-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-8">
                    {/* Away Team */}
                    <div className="flex items-center gap-4 text-center md:text-left">
                        <div className="flex flex-col items-center md:items-end">
                            <h2 className="text-2xl font-bold text-white">{away.name}</h2>
                            <p className="text-zinc-500 text-sm font-medium">{away.runs} - {away.hits} - {away.errors}</p>
                        </div>
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-zinc-800 flex items-center justify-center border-4 border-zinc-700 shadow-lg p-2">
                            <img src={away.logo} alt={away.name} className="w-full h-full object-contain" />
                        </div>
                    </div>

                    {/* Score */}
                    <div className="flex items-center gap-8">
                        <span className="text-5xl md:text-7xl font-black text-white">{away.runs}</span>
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-1">Final</span>
                            <div className="h-1 w-12 bg-zinc-700 rounded-full" />
                        </div>
                        <span className="text-5xl md:text-7xl font-black text-white">{home.runs}</span>
                    </div>

                    {/* Home Team */}
                    <div className="flex items-center gap-4 text-center md:text-right flex-row-reverse md:flex-row">
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-zinc-800 flex items-center justify-center border-4 border-zinc-700 shadow-lg p-2">
                            <img src={home.logo} alt={home.name} className="w-full h-full object-contain" />
                        </div>
                        <div className="flex flex-col items-center md:items-start">
                            <h2 className="text-2xl font-bold text-white">{home.name}</h2>
                            <p className="text-zinc-500 text-sm font-medium">{home.runs} - {home.hits} - {home.errors}</p>
                        </div>
                    </div>
                </div>

                {/* Line Score & Decisions */}
                <div className="grid md:grid-cols-[1fr_auto] gap-8 items-start border-t border-white/5 pt-8">
                    <LineScore innings={innings} home={home} away={away} />

                    {decisions && (
                        <div className="bg-zinc-900/50 rounded-xl p-4 border border-white/5 min-w-[250px] space-y-3">
                            {decisions.winner && (
                                <div className="flex justify-between items-center text-sm">
                                    <span className="font-bold text-zinc-500">G:</span>
                                    <div className="text-right">
                                        <span className="font-bold text-white block">{decisions.winner.name}</span>
                                        <span className="text-xs text-zinc-500">{decisions.winner.record} | {decisions.winner.era} EFE</span>
                                    </div>
                                </div>
                            )}
                            {decisions.loser && (
                                <div className="flex justify-between items-center text-sm">
                                    <span className="font-bold text-zinc-500">P:</span>
                                    <div className="text-right">
                                        <span className="font-bold text-white block">{decisions.loser.name}</span>
                                        <span className="text-xs text-zinc-500">{decisions.loser.record} | {decisions.loser.era} EFE</span>
                                    </div>
                                </div>
                            )}
                            {decisions.save && (
                                <div className="flex justify-between items-center text-sm">
                                    <span className="font-bold text-zinc-500">S:</span>
                                    <div className="text-right">
                                        <span className="font-bold text-white block">{decisions.save.name}</span>
                                        <span className="text-xs text-zinc-500">{decisions.save.record} | {decisions.save.era} EFE</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card>

            {/* Top Performers */}
            {topPerformers && topPerformers.length > 0 && (
                <div>
                    <h3 className="text-lg font-bold text-white mb-4">Mejores Actuaciones</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {topPerformers.map((player) => (
                            <Card key={player.id} className="p-4 flex flex-col items-center text-center hover:bg-zinc-900/80 transition-colors">
                                <div className="relative mb-3">
                                    <div className="w-16 h-16 rounded-full bg-zinc-800 overflow-hidden border-2 border-zinc-700">
                                        <img
                                            src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.id}/headshot/67/current`}
                                            alt={player.name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Player';
                                            }}
                                        />
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                                        <img src={player.teamLogo} alt="Team" className="w-4 h-4 object-contain" />
                                    </div>
                                </div>
                                <Link to={`/player/${player.id}`} className="font-bold text-white hover:text-cyan-400 transition-colors mb-1">
                                    {player.name}
                                </Link>
                                <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-2">{player.type}</div>
                                <div className="text-sm font-mono text-cyan-400">{player.stats}</div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Team Comparison */}
            <Card className="p-6">
                <h3 className="text-lg font-bold text-white mb-6">Comparación de Equipos</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-center">
                        <thead>
                            <tr className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/10">
                                <th className="pb-4 text-left w-1/3">Equipo</th>
                                <th className="pb-4">C</th>
                                <th className="pb-4">H</th>
                                <th className="pb-4">HR</th>
                                <th className="pb-4">BT</th>
                                <th className="pb-4">BR</th>
                                <th className="pb-4">DEB</th>
                                <th className="pb-4">E</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm font-medium text-zinc-300">
                            <tr className="border-b border-white/5">
                                <td className="py-4 text-left flex items-center gap-3">
                                    <img src={away.logo} alt={away.name} className="w-6 h-6 object-contain" />
                                    <span className="font-bold text-white">{away.name}</span>
                                </td>
                                <td className="py-4 font-bold text-white">{away.teamStats?.batting?.runs || away.runs}</td>
                                <td className="py-4">{away.teamStats?.batting?.hits || away.hits}</td>
                                <td className="py-4">{away.teamStats?.batting?.homeRuns || 0}</td>
                                <td className="py-4">{away.teamStats?.batting?.strikeOuts || 0}</td>
                                <td className="py-4">{away.teamStats?.batting?.rbi || 0}</td>
                                <td className="py-4">{away.teamStats?.batting?.leftOnBase || 0}</td>
                                <td className="py-4">{away.teamStats?.fielding?.errors || away.errors}</td>
                            </tr>
                            <tr>
                                <td className="py-4 text-left flex items-center gap-3">
                                    <img src={home.logo} alt={home.name} className="w-6 h-6 object-contain" />
                                    <span className="font-bold text-white">{home.name}</span>
                                </td>
                                <td className="py-4 font-bold text-white">{home.teamStats?.batting?.runs || home.runs}</td>
                                <td className="py-4">{home.teamStats?.batting?.hits || home.hits}</td>
                                <td className="py-4">{home.teamStats?.batting?.homeRuns || 0}</td>
                                <td className="py-4">{home.teamStats?.batting?.strikeOuts || 0}</td>
                                <td className="py-4">{home.teamStats?.batting?.rbi || 0}</td>
                                <td className="py-4">{home.teamStats?.batting?.leftOnBase || 0}</td>
                                <td className="py-4">{home.teamStats?.fielding?.errors || home.errors}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
