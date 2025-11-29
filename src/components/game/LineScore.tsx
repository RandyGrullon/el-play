import React from 'react';
import { Inning, Team } from '../../types';

interface LineScoreProps {
    innings: Inning[];
    home: Team;
    away: Team;
}

export const LineScore: React.FC<LineScoreProps> = ({ innings, home, away }) => {
    // Ensure we always show at least 9 innings
    const totalInnings = Math.max(9, innings ? innings.length : 9);
    const inningColumns = Array.from({ length: totalInnings }, (_, i) => i + 1);

    return (
        <div className="w-full">
            <table className="w-full text-center border-collapse text-[10px] md:text-sm">
                <thead>
                    <tr className="border-b border-white/10 text-zinc-500 uppercase">
                        <th className="py-2 text-left font-bold w-10 md:w-20">Eq</th>
                        {inningColumns.map(num => (
                            <th key={num} className="py-2 w-auto md:w-8 font-medium">{num}</th>
                        ))}
                        <th className="py-2 w-6 md:w-8 font-bold text-white bg-white/5">C</th>
                        <th className="py-2 w-6 md:w-8 text-zinc-400">H</th>
                        <th className="py-2 w-6 md:w-8 text-zinc-400">E</th>
                    </tr>
                </thead>
                <tbody className="text-zinc-300 font-medium">
                    {/* Away Team Row */}
                    <tr className="border-b border-white/5">
                        <td className="py-2 text-left font-bold text-white">
                            {away.abbreviation}
                        </td>
                        {inningColumns.map((num, i) => {
                            const score = innings && innings[i] ? innings[i].away : (i < innings?.length ? 0 : '-');
                            return (
                                <td key={num} className="py-2 text-zinc-400">
                                    {score !== undefined ? score : '-'}
                                </td>
                            );
                        })}
                        <td className="py-2 font-bold text-white bg-white/5">{away.runs}</td>
                        <td className="py-2 text-zinc-400">{away.hits}</td>
                        <td className="py-2 text-zinc-400">{away.errors}</td>
                    </tr>

                    {/* Home Team Row */}
                    <tr>
                        <td className="py-2 text-left font-bold text-white">
                            {home.abbreviation}
                        </td>
                        {inningColumns.map((num, i) => {
                            const displayScore = innings && innings[i] ? innings[i].home : '-';

                            return (
                                <td key={num} className="py-2 text-zinc-400">
                                    {displayScore}
                                </td>
                            );
                        })}
                        <td className="py-2 font-bold text-white bg-white/5">{home.runs}</td>
                        <td className="py-2 text-zinc-400">{home.hits}</td>
                        <td className="py-2 text-zinc-400">{home.errors}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};
