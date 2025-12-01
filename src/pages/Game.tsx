import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Activity, BarChart2 } from 'lucide-react';
import { useGameData } from '../hooks/useGameData';
import { useAnalytics } from '../hooks/useAnalytics';
import { Scoreboard } from '../components/game/Scoreboard';
import { BaseballDiamond } from '../components/game/BaseballDiamond';
import { LineScore } from '../components/game/LineScore';
import { StrikeZone } from '../components/game/StrikeZone';
import { BoxScore } from '../components/game/BoxScore';
import { GameSummary } from '../components/game/GameSummary';
import { GameDetailSkeleton } from '../components/game/GameDetailSkeleton';
import { GameData } from '../types';
import { PullToRefresh } from '../components/common/PullToRefresh';

export const Game: React.FC = () => {
    const { gamePk } = useParams<{ gamePk: string }>();
    const { gameData, loading, error, refetch } = useGameData(gamePk) as { gameData: GameData | null, loading: boolean, error: string | null, refetch: () => Promise<any> };
    const [activeTab, setActiveTab] = useState<'game' | 'stats'>('game');
    const { trackGameView, trackTabChange } = useAnalytics();

    // Track game view when component mounts and gameData is available
    useEffect(() => {
        if (gameData && gamePk) {
            trackGameView(gamePk, gameData.home.name, gameData.away.name);
        }
    }, [gameData, gamePk]);

    // Track tab changes
    const handleTabChange = (tab: 'game' | 'stats') => {
        setActiveTab(tab);
        if (gamePk) {
            trackTabChange(gamePk, tab);
        }
    };

    const handleRefresh = async () => {
        await refetch();
    };

    if (loading && !gameData) {
        return <GameDetailSkeleton />;
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
    const displayData: GameData = gameData || {
        status: "Unknown",
        gameDate: "",
        venue: "",
        isTopInning: false,
        inning: "",
        home: { id: 0, name: "Home Team", abbreviation: "HOM", logo: "", color: "", runs: 0, hits: 0, errors: 0, players: [] },
        away: { id: 0, name: "Away Team", abbreviation: "AWY", logo: "", color: "", runs: 0, hits: 0, errors: 0, players: [] },
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
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="space-y-6 px-4 pb-10">
                <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest ml-1">
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </Link>

                <div className="relative min-h-[80vh]">
                    {displayData.status !== 'Final' && (
                        <Scoreboard
                            home={displayData.home}
                            away={displayData.away}
                            inning={displayData.inning}
                            status={displayData.status}
                            venue={displayData.venue}
                        />
                    )}

                    {/* Tabs Navigation */}
                    <div className="flex justify-center mt-6 mb-6">
                        <div className="flex bg-zinc-900/50 p-1 rounded-full border border-white/5">
                            <button
                                onClick={() => handleTabChange('game')}
                                className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'game'
                                    ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                <Activity className="w-4 h-4" />
                                {displayData.status === 'Final' || displayData.status === 'Game Over' ? 'Resumen' : 'En Vivo'}
                            </button>
                            <button
                                onClick={() => handleTabChange('stats')}
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
                        (displayData.status === 'Final' || displayData.status === 'Game Over') ? (
                            <GameSummary gameData={displayData} />
                        ) : (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Mobile Optimized Layout */}
                                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-8 items-start">

                                    {/* Center Column (Desktop) / Top (Mobile) - Diamond, StrikeZone, Count, Matchup */}
                                    <div className="flex flex-col items-center gap-4 order-1 md:order-2 w-full">

                                        {/* Field State Grid: Diamond & Count Side-by-Side */}
                                        <div className="grid grid-cols-2 gap-4 w-full items-center justify-items-center max-w-md mx-auto">
                                            {/* Count Indicators - Centered Row */}
                                            <div className="flex justify-center gap-8 w-full bg-zinc-900/30 py-2 rounded-lg border border-white/5">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] font-bold text-zinc-600">B</span>
                                                    <div className="flex gap-1">
                                                        {[...Array(3)].map((_, i) => (
                                                            <div key={i} className={`w-2 h-2 rounded-full transition-colors duration-300 ${i < displayData.count.balls ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-zinc-800'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] font-bold text-zinc-600">S</span>
                                                    <div className="flex gap-1">
                                                        {[...Array(2)].map((_, i) => (
                                                            <div key={i} className={`w-2 h-2 rounded-full transition-colors duration-300 ${i < displayData.count.strikes ? 'bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]' : 'bg-zinc-800'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] font-bold text-zinc-600">O</span>
                                                    <div className="flex gap-1">
                                                        {[...Array(2)].map((_, i) => (
                                                            <div key={i} className={`w-2 h-2 rounded-full transition-colors duration-300 ${i < displayData.count.outs ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]' : 'bg-zinc-800'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Diamond Column */}
                                            <div className="flex flex-col items-center justify-center relative h-24 w-full">
                                                <div className="transform scale-[0.45] origin-center absolute inset-0 flex items-center justify-center">
                                                    <BaseballDiamond runners={displayData.runners} teamColor={battingTeam.id === 673 ? '#00be66' : battingTeam.color} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Last Pitch Info (Mobile Only) - Moved Above Play History */}
                                        {displayData.currentPitches && displayData.currentPitches.length > 0 && (
                                            <div className="md:hidden w-full flex justify-between items-center bg-zinc-900/50 border border-white/5 rounded-xl p-3 backdrop-blur-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Último Lanzamiento</span>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-lg font-bold text-white">
                                                                {displayData.currentPitches[displayData.currentPitches.length - 1].speed ? `${displayData.currentPitches[displayData.currentPitches.length - 1].speed.toFixed(1)}` : '--'}
                                                                <span className="text-xs text-zinc-400 ml-1">MPH</span>
                                                            </span>
                                                            <span className="text-xs font-bold text-cyan-400">
                                                                {displayData.currentPitches[displayData.currentPitches.length - 1].type || ''}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`px-3 py-1 rounded-full text-xs font-bold ${['S', 'C', 'W'].includes(displayData.currentPitches[displayData.currentPitches.length - 1].code) ? 'bg-red-500/20 text-red-400' :
                                                    ['B'].includes(displayData.currentPitches[displayData.currentPitches.length - 1].code) ? 'bg-green-500/20 text-green-400' :
                                                        'bg-blue-500/20 text-blue-400'
                                                    }`}>
                                                    {displayData.currentPitches[displayData.currentPitches.length - 1].call}
                                                </div>
                                            </div>
                                        )}
                                        {/* Play History (Mobile Only) - Moved Above StrikeZone */}
                                        <div className="md:hidden w-full">
                                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Historial de Jugadas</h3>
                                            <div className="bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden backdrop-blur-sm">
                                                <div className="max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                                                    {displayData.playHistory && displayData.playHistory.length > 0 ? (
                                                        <div className="divide-y divide-white/5">
                                                            {displayData.playHistory.map((play, index) => (
                                                                <div key={index} className="p-3 hover:bg-white/5 transition-colors">
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
                                                        <div className="p-6 text-center text-zinc-500 text-xs">
                                                            No hay jugadas recientes.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        {/* Compact Matchup (Mobile Only) */}
                                        <div className="md:hidden w-full grid grid-cols-[1fr_auto_1fr] gap-2 items-center bg-zinc-900/50 border border-white/5 rounded-xl p-3">
                                            {/* Pitcher */}
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/10">
                                                    <img
                                                        src={displayData.isTopInning ? displayData.home.logo : displayData.away.logo}
                                                        alt="Pitcher"
                                                        className="w-6 h-6 object-contain"
                                                    />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Lanzador</span>
                                                    <span className="text-xs font-bold text-white truncate">{displayData.matchup.pitcher}</span>
                                                </div>
                                            </div>

                                            {/* VS */}
                                            <div className="text-[10px] font-black text-zinc-700">VS</div>

                                            {/* Batter */}
                                            <div className="flex items-center justify-end gap-2 overflow-hidden text-right">
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Bateador</span>
                                                    <span className="text-xs font-bold text-white truncate">{displayData.matchup.batter}</span>
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/10">
                                                    <img
                                                        src={battingTeam.logo}
                                                        alt="Batter"
                                                        className="w-6 h-6 object-contain"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* StrikeZone Column */}
                                        <div className="flex flex-col items-center justify-center w-full">
                                            <div className="w-full max-w-[120px]">
                                                <StrikeZone pitches={displayData.currentPitches} />
                                            </div>
                                        </div>


                                    </div>

                                    {/* Left Column (Desktop Only) - Matchups */}
                                    <div className="hidden md:block space-y-6 order-2 md:order-1">

                                        <div className="grid grid-cols-1 gap-4">
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

                                    {/* Right Column (Desktop Only) - Play History */}
                                    <div className="hidden md:block order-3 md:order-3 w-full">
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

                                <LineScore
                                    innings={displayData.innings}
                                    home={displayData.home}
                                    away={displayData.away}
                                />
                            </div>
                        )
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <BoxScore home={displayData.home} away={displayData.away} />
                        </div>
                    )}
                </div>
            </div>
        </PullToRefresh>
    );
};
