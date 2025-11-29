
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronRight, ChevronLeft } from 'lucide-react';
import { useSchedule } from '../hooks/useGameData';
import { fetchStandings, fetchLeaders } from '../services/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Standings } from '../components/game/Standings';
import { Leaders } from '../components/game/Leaders';

export const Home = () => {
    const schedule = useSchedule();
    const [standings, setStandings] = useState([]);
    const [leaders, setLeaders] = useState([]);
    const [selectedDate, setSelectedDate] = useState(() => {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
    });

    useEffect(() => {
        fetchStandings().then(setStandings).catch(console.error);
        fetchLeaders().then(setLeaders).catch(console.error);
    }, []);

    // Generate next 7 days for the date picker based on Santo Domingo time
    const dates = useMemo(() => {
        const days = [];
        const today = new Date();

        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
            days.push(dateStr);
        }
        return days;
    }, []);

    // Filter games for selected date
    const filteredGames = useMemo(() => {
        return schedule.filter(game => {
            // Convert game UTC date to Santo Domingo date string for comparison
            const gameDateSD = new Date(game.date).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
            return gameDateSD === selectedDate;
        });
    }, [schedule, selectedDate]);

    const handlePrevDay = () => {
        const currentIndex = dates.indexOf(selectedDate);
        if (currentIndex > 0) {
            setSelectedDate(dates[currentIndex - 1]);
        }
    };

    const handleNextDay = () => {
        const currentIndex = dates.indexOf(selectedDate);
        if (currentIndex < dates.length - 1) {
            setSelectedDate(dates[currentIndex + 1]);
        }
    };

    return (
        <div className="space-y-8">

            {/* Date Selector & Games */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-cyan-400" />
                        <h2 className="text-xl font-bold text-white tracking-tight">Calendario</h2>
                    </div>

                    {/* Mobile Arrows (visible on small screens if needed, but we use scroll) */}
                    <div className="flex gap-2 md:hidden">
                        <button onClick={handlePrevDay} disabled={dates.indexOf(selectedDate) === 0} className="p-1 rounded-full hover:bg-white/10 disabled:opacity-30">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button onClick={handleNextDay} disabled={dates.indexOf(selectedDate) === dates.length - 1} className="p-1 rounded-full hover:bg-white/10 disabled:opacity-30">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Draggable Date Strip */}
                <div className="relative group">
                    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x">
                        {dates.map((date) => {
                            // Create date object for display, forcing noon to avoid shifts
                            const d = new Date(date + 'T12:00:00');
                            const isSelected = date === selectedDate;
                            // Check if there are games on this date (converted to SD time)
                            const hasGames = schedule.some(g => {
                                const gDate = new Date(g.date).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
                                return gDate === date;
                            });

                            return (
                                <button
                                    key={date}
                                    onClick={() => setSelectedDate(date)}
                                    className={`
                                        flex-shrink-0 snap-start flex flex-col items-center justify-center w-16 h-20 rounded-2xl border transition-all duration-300
                                        ${isSelected
                                            ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)] scale-105'
                                            : 'bg-zinc-900/50 text-zinc-400 border-white/5 hover:bg-zinc-800 hover:border-white/10'
                                        }
                                    `}
                                >
                                    <span className="text-[10px] font-bold uppercase tracking-wider">
                                        {d.toLocaleDateString('es-DO', { weekday: 'short', timeZone: 'America/Santo_Domingo' }).replace('.', '')}
                                    </span>
                                    <span className={`text-2xl font-black ${isSelected ? 'text-black' : 'text-white'}`}>
                                        {d.getDate()}
                                    </span>
                                    {hasGames && (
                                        <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-black' : 'bg-cyan-500'}`} />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Fade gradients for scrolling indication */}
                    <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-zinc-950 to-transparent pointer-events-none md:hidden" />
                    <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-zinc-950 to-transparent pointer-events-none md:hidden" />
                </div>

                {/* Games Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[200px]">
                    {filteredGames.length > 0 ? (
                        filteredGames.map((game) => (
                            <Link key={game.gamePk} to={`/game/${game.gamePk}`}>
                                <Card className="hover:bg-white/5 transition-all duration-300 group cursor-pointer border-l-4 border-l-transparent hover:border-l-cyan-400 h-full">
                                    <div className="flex justify-between items-center mb-4">
                                        <Badge variant={game.status === 'Live' || game.status === 'In Progress' ? 'live' : 'default'}>
                                            {game.status}
                                        </Badge>
                                        <span className="text-xs text-zinc-500 font-medium">
                                            {new Date(game.date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' })}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={game.away.logo}
                                                    alt={game.away.name}
                                                    className="w-10 h-10 object-contain"
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.style.display = 'none';
                                                        e.target.nextSibling.style.display = 'flex';
                                                    }}
                                                />
                                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-400 border border-white/5 hidden">
                                                    {game.away.abbrev}
                                                </div>
                                                <span className="font-bold text-zinc-200">{game.away.name}</span>
                                            </div>
                                            <span className="text-xl font-black text-white">{game.away.score}</span>
                                        </div>

                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={game.home.logo}
                                                    alt={game.home.name}
                                                    className="w-10 h-10 object-contain"
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.style.display = 'none';
                                                        e.target.nextSibling.style.display = 'flex';
                                                    }}
                                                />
                                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-400 border border-white/5 hidden">
                                                    {game.home.abbrev}
                                                </div>
                                                <span className="font-bold text-zinc-200">{game.home.name}</span>
                                            </div>
                                            <span className="text-xl font-black text-white">{game.home.score}</span>
                                        </div>
                                    </div>

                                    {/* Live Game Details */}
                                    {(game.status === 'Live' || game.status === 'In Progress') && game.liveData && (
                                        <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-end">
                                            {/* Count */}
                                            <div className="flex gap-4">
                                                {/* Balls */}
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] font-bold text-zinc-600">B</span>
                                                    <div className="flex gap-1">
                                                        {[...Array(3)].map((_, i) => (
                                                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < game.liveData.balls ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-zinc-800'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                                {/* Strikes */}
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] font-bold text-zinc-600">S</span>
                                                    <div className="flex gap-1">
                                                        {[...Array(2)].map((_, i) => (
                                                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < game.liveData.strikes ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-zinc-800'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                                {/* Outs */}
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] font-bold text-zinc-600">O</span>
                                                    <div className="flex gap-1">
                                                        {[...Array(2)].map((_, i) => (
                                                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < game.liveData.outs ? 'bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]' : 'bg-zinc-800'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Mini Diamond */}
                                            <div className="relative w-8 h-8 opacity-80">
                                                {/* Base Paths */}
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 border border-zinc-600 rotate-45" />

                                                {/* Bases */}
                                                {/* 2nd Base (Top) */}
                                                <div className={`absolute top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border border-zinc-900 ${game.liveData.runners.second ? 'bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)]' : 'bg-zinc-700'}`} />
                                                {/* 3rd Base (Left) */}
                                                <div className={`absolute top-1/2 left-0.5 -translate-y-1/2 w-2 h-2 rotate-45 border border-zinc-900 ${game.liveData.runners.third ? 'bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)]' : 'bg-zinc-700'}`} />
                                                {/* 1st Base (Right) */}
                                                <div className={`absolute top-1/2 right-0.5 -translate-y-1/2 w-2 h-2 rotate-45 border border-zinc-900 ${game.liveData.runners.first ? 'bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)]' : 'bg-zinc-700'}`} />
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Ver Detalles</span>
                                        <ChevronRight className="w-4 h-4 text-cyan-400" />
                                    </div>
                                </Card>
                            </Link>
                        ))
                    ) : (
                        <div className="col-span-full flex flex-col items-center justify-center p-12 text-center text-zinc-500 bg-zinc-900/30 rounded-xl border border-white/5 border-dashed">
                            <Calendar className="w-8 h-8 mb-3 opacity-20" />
                            <p>No hay juegos programados para este día.</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Stats Grid */}
            <section className="grid md:grid-cols-2 gap-8 pt-8 border-t border-white/5">
                <Standings standings={standings} />
                <Leaders leaders={leaders} />
            </section>

        </div>
    );
};
