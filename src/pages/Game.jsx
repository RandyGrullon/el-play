import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Activity, BarChart2 } from 'lucide-react';
import { useGameData } from '../hooks/useGameData';
import { Card } from '../components/ui/Card';
import { Scoreboard } from '../components/game/Scoreboard';
import { BaseballDiamond } from '../components/game/BaseballDiamond';
import { LineScore } from '../components/game/LineScore';
import { StrikeZone } from '../components/game/StrikeZone';
import { BoxScore } from '../components/game/BoxScore';

export const Game = () => {
    const { gamePk } = useParams();
    const { gameData, loading, error } = useGameData(gamePk);
    const [activeTab, setActiveTab] = useState('game');

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
        home: { name: "Home Team", abbreviation: "HOM", runs: 0, hits: 0, errors: 0, players: [] },
        away: { name: "Away Team", abbreviation: "AWY", runs: 0, hits: 0, errors: 0, players: [] },
        count: { balls: 0, strikes: 0, outs: 0 },
        runners: { first: false, second: false, third: false },
        matchup: { pitcher: "N/A", batter: "N/A" },
        lastPlay: "N/A",
        playHistory: [],
        currentPitches: [],
        innings: []
    };

    // Determine batting team
    const battingTeam = displayData.isTopInning ? displayData.away : displayData.home;

    return (
        <div className="space-y-6">
            <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">
                <ArrowLeft className="w-4 h-4" />
                Volver
            </Link>

            <Card className="relative overflow-hidden min-h-[80vh]">
                {/* Decorative background elements inside card */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-gradient-to-b from-white/5 to-transparent opacity-50 pointer-events-none" />

                <Scoreboard
                    home={displayData.home}
                    away={displayData.away}
                    inning={displayData.inning}
                    status={displayData.status}
                />

                {/* Tabs Navigation */}
                <div className="flex justify-center mt-6 mb-6">
                    <div className="flex bg-zinc-900/50 p-1 rounded-full border border-white/5">
                        <button
                            onClick={() => setActiveTab('game')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'game'
                                ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                                : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            <Activity className="w-4 h-4" />
                            En Vivo
                        </button>
                        <button
                            onClick={() => setActiveTab('stats')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'stats'
                                ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                                : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            <BarChart2 className="w-4 h-4" />
                            Estadísticas
                        </button>
                    </div>
                </div>

                {activeTab === 'game' ? (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <LineScore
                            innings={displayData.innings}
                            home={displayData.home}
                            away={displayData.away}
                        />

                        {/* Mobile Optimized Layout */}
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-8 items-start">

                            {/* Center Column (Desktop) / Top (Mobile) - Strike Zone & Diamond */}
                            <div className="flex flex-col items-center gap-8 order-1 md:order-2">

                                {/* Mobile Batter Indicator */}
                                <div className="md:hidden w-full bg-zinc-900/50 border border-white/5 rounded-lg p-3 flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border border-white/10">
                                            <img src={battingTeam.logo} alt={battingTeam.name} className="w-8 h-8 object-contain" />
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Al Bate</div>
                                            <div className="text-sm font-bold text-white">{displayData.matchup.batter}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-zinc-500 font-mono">AVG .---</div>
                                </div>

                                {/* Strike Zone - Positioned "arriba debajo de la tabla" */}
                                <div className="w-full max-w-[250px]">
                                    <StrikeZone pitches={displayData.currentPitches} />
                                </div>

                                {/* Diamond - "Poco más pequeño" */}
                                <div className="transform scale-90 origin-top">
                                    <BaseballDiamond runners={displayData.runners} teamColor={battingTeam.color} />

                                    {/* Count Indicators */}
                                    <div className="flex justify-center gap-6 mt-4">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-[10px] font-bold text-zinc-600">B</span>
                                            <div className="flex gap-1">
                                                {[...Array(3)].map((_, i) => (
                                                    <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i < displayData.count.balls ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-zinc-800'}`} />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-[10px] font-bold text-zinc-600">S</span>
                                            <div className="flex gap-1">
                                                {[...Array(2)].map((_, i) => (
                                                    <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i < displayData.count.strikes ? 'bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]' : 'bg-zinc-800'}`} />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-[10px] font-bold text-zinc-600">O</span>
                                            <div className="flex gap-1">
                                                {[...Array(2)].map((_, i) => (
                                                    <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i < displayData.count.outs ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]' : 'bg-zinc-800'}`} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Left Column (Desktop) / Middle (Mobile) - Matchups */}
                            <div className="space-y-6 order-2 md:order-1">
                                <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
                                    <div className="bg-zinc-900/30 p-4 rounded-xl border border-white/5">
                                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Lanzador</h3>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border border-white/10">
                                                <img
                                                    src={displayData.isTopInning ? displayData.home.logo : displayData.away.logo}
                                                    alt="Pitching Team"
                                                    className="w-8 h-8 object-contain"
                                                />
                                            </div>
                                            <div>
                                                <div className="font-bold text-zinc-200 text-sm md:text-base">{displayData.matchup.pitcher}</div>
                                                <div className="text-[10px] md:text-xs text-zinc-500">Lanzando</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-zinc-900/30 p-4 rounded-xl border border-white/5">
                                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Bateador</h3>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border border-white/10">
                                                <img
                                                    src={battingTeam.logo}
                                                    alt="Batting Team"
                                                    className="w-8 h-8 object-contain"
                                                />
                                            </div>
                                            <div>
                                                <div className="font-bold text-zinc-200 text-sm md:text-base">{displayData.matchup.batter}</div>
                                                <div className="text-[10px] md:text-xs text-zinc-500">Al Bate</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column (Desktop) / Bottom (Mobile) - Play History */}
                            <div className="order-3 md:order-3">
                                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Historial de Jugadas</h3>
                                <div className="bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden backdrop-blur-sm">
                                    <div className="max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                                        {displayData.playHistory && displayData.playHistory.length > 0 ? (
                                            <div className="divide-y divide-white/5">
                                                {displayData.playHistory.map((play, index) => (
                                                    <div key={index} className="p-4 hover:bg-white/5 transition-colors">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${play.event === 'Ponche' ? 'bg-rose-500/20 text-rose-400' :
                                                                play.event === 'Base por Bolas' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                    play.event === 'Cuadrangular' ? 'bg-purple-500/20 text-purple-400' :
                                                                        'bg-zinc-800 text-zinc-400'
                                                                }`}>
                                                                {play.event}
                                                            </span>
                                                            <span className="text-[10px] text-zinc-600 font-mono">{play.inning}</span>
                                                        </div>
                                                        <p className="text-xs text-zinc-300 leading-relaxed">
                                                            {play.description}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-8 text-center text-zinc-500 text-xs">
                                                No hay jugadas recientes.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <BoxScore home={displayData.home} away={displayData.away} />
                    </div>
                )}
            </Card>
        </div>
    );
};
