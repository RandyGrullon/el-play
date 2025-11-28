import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useGameData } from '../hooks/useGameData';
import { Card } from '../components/ui/Card';
import { Scoreboard } from '../components/game/Scoreboard';
import { BaseballDiamond } from '../components/game/BaseballDiamond';
import { LineScore } from '../components/game/LineScore';
import { StrikeZone } from '../components/game/StrikeZone';

export const Game = () => {
    const { gamePk } = useParams();
    const { gameData, loading, error } = useGameData(gamePk);

    if (loading && !gameData) {
        return (
            <div className="min-h-[50vh] flex flex-col items-center justify-center text-zinc-500 gap-4">
                <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
                <span className="text-sm font-medium tracking-widest uppercase">Cargando Juego...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl text-sm font-medium inline-block backdrop-blur-sm mb-4">
                    {error}
                </div>
                <br />
                <Link to="/" className="text-cyan-400 hover:text-cyan-300 text-sm font-bold uppercase tracking-widest">
                    &larr; Volver al Inicio
                </Link>
            </div>
        );
    }

    // Fallback data if gameData is null but not loading (shouldn't happen often with the hook logic)
    const displayData = gameData || {
        status: "Unknown",
        inning: "",
        home: { name: "Home Team", abbreviation: "HOM", runs: 0, hits: 0, errors: 0 },
        away: { name: "Away Team", abbreviation: "AWY", runs: 0, hits: 0, errors: 0 },
        count: { balls: 0, strikes: 0, outs: 0 },
        runners: { first: false, second: false, third: false },
        matchup: { pitcher: "N/A", batter: "N/A" },
        matchup: { pitcher: "N/A", batter: "N/A" },
        lastPlay: "N/A",
        pitchData: null,
        innings: []
    };

    return (
        <div className="space-y-6">
            <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">
                <ArrowLeft className="w-4 h-4" />
                Volver
            </Link>

            <Card className="relative overflow-hidden">
                {/* Decorative background elements inside card */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-gradient-to-b from-white/5 to-transparent opacity-50 pointer-events-none" />

                <Scoreboard
                    home={displayData.home}
                    away={displayData.away}
                    inning={displayData.inning}
                    status={displayData.status}
                />

                <div className="mt-8">
                    <LineScore
                        innings={displayData.innings}
                        home={displayData.home}
                        away={displayData.away}
                    />
                </div>

                <div className="mt-8 md:mt-12 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-8 items-start">

                    {/* Center: Diamond & Count (Order 1 on Mobile) */}
                    <div className="flex flex-col items-center order-1 md:order-2">
                        <BaseballDiamond runners={displayData.runners} />

                        {/* Count Indicators */}
                        <div className="flex gap-6 mt-4">
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[10px] font-bold text-zinc-600">B</span>
                                <div className="flex gap-1">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i < displayData.count.balls ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-zinc-800'}`} />
                                    ))}
                                </div>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[10px] font-bold text-zinc-600">S</span>
                                <div className="flex gap-1">
                                    {[...Array(2)].map((_, i) => (
                                        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i < displayData.count.strikes ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-zinc-800'}`} />
                                    ))}
                                </div>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-[10px] font-bold text-zinc-600">O</span>
                                <div className="flex gap-1">
                                    {[...Array(2)].map((_, i) => (
                                        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i < displayData.count.outs ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-zinc-800'}`} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Left: Matchup (Order 2 on Mobile) */}
                    <div className="space-y-6 order-2 md:order-1">
                        <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
                            <div>
                                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Lanzador</h3>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">P</div>
                                    <div>
                                        <div className="font-bold text-zinc-200 text-sm md:text-base">{displayData.matchup.pitcher}</div>
                                        <div className="text-[10px] md:text-xs text-zinc-500">Lanzando</div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Bateador</h3>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">B</div>
                                    <div>
                                        <div className="font-bold text-zinc-200 text-sm md:text-base">{displayData.matchup.batter}</div>
                                        <div className="text-[10px] md:text-xs text-zinc-500">Al Bate</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Last Play & Strike Zone (Order 3 on Mobile) */}
                    <div className="order-3 md:order-3 space-y-6">
                        <div>
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Última Jugada</h3>
                            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 backdrop-blur-sm">
                                <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                                    {displayData.lastPlay}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-center">
                            <StrikeZone pitchData={displayData.pitchData} />
                        </div>
                    </div>

                </div>
            </Card>
        </div>
    );
};
