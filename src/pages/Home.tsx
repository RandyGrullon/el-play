import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ChevronRight, ChevronLeft, Heart, Bell, MapPin } from 'lucide-react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBaseballBatBall, faBaseball } from '@fortawesome/free-solid-svg-icons';
import { useSchedule } from '../hooks/useGameData';
import { useFavoriteTeam } from '../hooks/useFavoriteTeam';
import { useAnalytics } from '../hooks/useAnalytics';
import { useLeague } from '../store/LeagueContext';
import { fetchStandings, fetchLeaders } from '../services/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Standings } from '../components/game/Standings';
import { Leaders } from '../components/game/Leaders';
import { GameCardSkeleton } from '../components/game/GameCardSkeleton';
import { ScheduleItem } from '../types';
import { PullToRefresh } from '../components/common/PullToRefresh';
import MiniGame from '../components/game/MiniGame';

const TEAM_COLORS: Record<number, string> = {
    667: '#FDB927', // Aguilas
    668: '#FA4616', // Toros
    670: '#aa1141', // Gigantes
    671: '#E31837', // Escogido
    672: '#0069e0', // Licey
    673: '#00be66'  // Estrellas
};

export const Home: React.FC = () => {
    const { activeLeague, leagueConfig } = useLeague();
    const { schedule: scheduleRaw, loading, isError: scheduleError, error: scheduleErrorMessage, refetch } = useSchedule(activeLeague) as { schedule: ScheduleItem[], loading: boolean, isError: boolean, error: string | null, refetch: () => Promise<any> };
    // Solo mostrar juegos de la liga activa (evita ver WBC al elegir SDC por cache/placeholder)
    const schedule = useMemo(() => {
        if (!scheduleRaw?.length) return scheduleRaw ?? [];
        return scheduleRaw.filter(g => g.league === activeLeague);
    }, [scheduleRaw, activeLeague]);
    const { favoriteTeamId, toggleFavoriteTeam, subscribedGames, toggleGameSubscription } = useFavoriteTeam();
    const { trackNotificationSubscribe, trackNotificationUnsubscribe } = useAnalytics();
    const [standings, setStandings] = useState<any>(null);
    const [leaders, setLeaders] = useState<any[]>([]);
    const [standingsError, setStandingsError] = useState<string | null>(null);
    const [leadersError, setLeadersError] = useState<string | null>(null);
    const hasCalculatedInitialDate = useRef(false);
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    });

    // Refetch data when league changes
    useEffect(() => {
        setStandingsError(null);
        setLeadersError(null);
        fetchStandings(activeLeague).then((data) => { setStandings(data); setStandingsError(null); }).catch((err) => setStandingsError(err?.message || 'Error al cargar tabla'));
        fetchLeaders(activeLeague).then((data) => { setLeaders(data); setLeadersError(null); }).catch((err) => setLeadersError(err?.message || 'Error al cargar líderes'));
    }, [activeLeague]);

    const retryStandings = () => {
        setStandingsError(null);
        fetchStandings(activeLeague).then((data) => { setStandings(data); setStandingsError(null); }).catch((err) => setStandingsError(err?.message || 'Error al cargar tabla'));
    };
    const retryLeaders = () => {
        setLeadersError(null);
        fetchLeaders(activeLeague).then((data) => { setLeaders(data); setLeadersError(null); }).catch((err) => setLeadersError(err?.message || 'Error al cargar líderes'));
    };

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current && selectedDate) {
            const selectedEl = document.getElementById(`date-${selectedDate}`);
            if (selectedEl) {
                const container = scrollRef.current;
                const scrollLeft = selectedEl.offsetLeft - (container.clientWidth / 2) + (selectedEl.clientWidth / 2);
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }
    }, [selectedDate]);

    // Generate next 7 days for the date picker based on La Paz time
    const dates = useMemo(() => {
        const days: string[] = [];
        const today = new Date();

        for (let i = -3; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
            days.push(dateStr);
        }
        return days;
    }, []);

    // Get today's date string for comparison
    const todayStr = useMemo(() => {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    }, []);

    // Check if there are live games from yesterday that should still be shown
    const liveGamesFromPreviousDays = useMemo(() => {
        const now = new Date();
        return schedule.filter(game => {
            const gameDateStr = new Date(game.date).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
            const isFromPreviousDay = gameDateStr < todayStr;
            const isLive = game.status === 'Live' || game.status === 'In Progress';
            
            // Also show games that ended less than 1 hour ago
            const isRecentlyEnded = (game.status === 'Final' || game.status === 'Game Over') && (() => {
                // Estimate game end time as game start + 3 hours (typical game length)
                const gameStart = new Date(game.date);
                const estimatedEnd = new Date(gameStart.getTime() + 3 * 60 * 60 * 1000);
                const hoursSinceEnd = (now.getTime() - estimatedEnd.getTime()) / (1000 * 60 * 60);
                return hoursSinceEnd < 1 && hoursSinceEnd >= 0;
            })();
            
            return isFromPreviousDay && (isLive || isRecentlyEnded);
        });
    }, [schedule, todayStr]);

    // Calculate initial date when schedule loads (before render, no animation)
    useEffect(() => {
        if (!loading && schedule.length > 0 && !hasCalculatedInitialDate.current) {
            hasCalculatedInitialDate.current = true;
            
            // Check for live games from previous days
            const liveFromPrev = schedule.filter(game => {
                const gameDateStr = new Date(game.date).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
                const isFromPreviousDay = gameDateStr < todayStr;
                const isLive = game.status === 'Live' || game.status === 'In Progress';
                return isFromPreviousDay && isLive;
            });
            
            if (liveFromPrev.length > 0) {
                const liveGameDate = new Date(liveFromPrev[0].date)
                    .toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
                if (dates.includes(liveGameDate)) {
                    setSelectedDate(liveGameDate);
                }
            }
        }
    }, [loading, schedule, todayStr, dates]);

    // Filter games for selected date (includes live games from previous days when viewing today)
    const filteredGames = useMemo(() => {
        const gamesForSelectedDate = schedule.filter(game => {
            // Convert game UTC date to La Paz date string for comparison
            const gameDateSD = new Date(game.date).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
            return gameDateSD === selectedDate;
        });

        // If viewing today, also include live games from previous days
        if (selectedDate === todayStr) {
            const liveFromPrevious = liveGamesFromPreviousDays.filter(game => {
                const gameDateSD = new Date(game.date).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
                return gameDateSD !== selectedDate; // Don't duplicate
            });
            return [...liveFromPrevious, ...gamesForSelectedDate];
        }

        return gamesForSelectedDate;
    }, [schedule, selectedDate, todayStr, liveGamesFromPreviousDays]);

    // Sort games to show favorite team first
    const sortedGames = useMemo(() => {
        if (!favoriteTeamId) return filteredGames;
        return [...filteredGames].sort((a, b) => {
            const aHasFav = a.away.id === favoriteTeamId || a.home.id === favoriteTeamId;
            const bHasFav = b.away.id === favoriteTeamId || b.home.id === favoriteTeamId;
            if (aHasFav && !bHasFav) return -1;
            if (!aHasFav && bHasFav) return 1;
            return 0;
        });
    }, [filteredGames, favoriteTeamId]);

    // Wrapper function for game subscription with analytics tracking
    const handleGameSubscription = async (gamePk: number, teamName: string) => {
        const wasSubscribed = subscribedGames.includes(gamePk);
        await toggleGameSubscription(gamePk);

        // Track the action
        if (wasSubscribed) {
            trackNotificationUnsubscribe(gamePk.toString());
        } else {
            trackNotificationSubscribe(gamePk.toString(), teamName);
        }
    };

    // Notification Logic
    useEffect(() => {
        if (subscribedGames.length === 0) return;

        const checkGameStart = () => {
            const now = new Date();
            schedule.forEach(game => {
                const isSubscribedGame = subscribedGames.includes(game.gamePk);

                if (isSubscribedGame) {
                    const gameDate = new Date(game.date);
                    const timeDiff = gameDate.getTime() - now.getTime();

                    // 1. Notification: 10 minutes before
                    if (timeDiff > 0 && timeDiff <= 10 * 60 * 1000) {
                        const notifiedKey = `notified-pre-${game.gamePk}`;
                        if (!sessionStorage.getItem(notifiedKey)) {
                            if (Notification.permission === 'granted') {
                                new Notification('¡El juego va a comenzar!', {
                                    body: `${game.away.name} vs ${game.home.name} comienza en 10 minutos.`,
                                    icon: '/pwa-192x192.png'
                                });
                                sessionStorage.setItem(notifiedKey, 'true');
                            }
                        }
                    }

                    // 2. Notification: Game Started (Playball)
                    if (game.status === 'Live' || game.status === 'In Progress') {
                        const notifiedKey = `notified-start-${game.gamePk}`;
                        if (!sessionStorage.getItem(notifiedKey)) {
                            if (Notification.permission === 'granted') {
                                new Notification('¡Playball!', {
                                    body: `El juego entre ${game.away.name} y ${game.home.name} ha comenzado.`,
                                    icon: '/pwa-192x192.png'
                                });
                                sessionStorage.setItem(notifiedKey, 'true');
                            }
                        }
                    }
                }
            });
        };

        const interval = setInterval(checkGameStart, 60000); // Check every minute
        checkGameStart(); // Check immediately

        return () => clearInterval(interval);
    }, [schedule, subscribedGames]);

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

    const getGameStatus = (game: ScheduleItem) => {
        const now = new Date();
        const gameDate = new Date(game.date);
        const timeDiff = gameDate.getTime() - now.getTime();
        const minutesDiff = timeDiff / (1000 * 60);

        if (game.status === 'Final' || game.status === 'Game Over') {
            return { text: 'Ended', variant: 'default' as const };
        }

        if (game.status === 'Live' || game.status === 'In Progress') {
            return { text: 'In Progress', variant: 'live' as const };
        }

        if (minutesDiff > 0 && minutesDiff <= 10) {
            return { text: 'Starting', variant: 'live' as const };
        }

        if (minutesDiff > 0 && minutesDiff <= 30) {
            return { text: 'Preparing', variant: 'default' as const };
        }

        return { text: "", variant: 'default' as const };
    };

    const handleRefresh = async () => {
        setStandingsError(null);
        setLeadersError(null);
        await refetch();
        fetchStandings(activeLeague).then((data) => { setStandings(data); setStandingsError(null); }).catch((err) => setStandingsError(err?.message || 'Error al cargar tabla'));
        fetchLeaders(activeLeague).then((data) => { setLeaders(data); setLeadersError(null); }).catch((err) => setLeadersError(err?.message || 'Error al cargar líderes'));
    };

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="space-y-6">
                {/* Date Selector & Games */}
                <section className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 transition-colors duration-300" style={{ color: leagueConfig.color }} />
                            <h2 className="text-xl font-bold text-white tracking-tight">Calendario</h2>
                            <span 
                                className="text-xs font-medium px-2 py-0.5 rounded-full ml-2 transition-all duration-300"
                                style={{ 
                                    backgroundColor: `${leagueConfig.color}15`,
                                    color: leagueConfig.color
                                }}
                            >
                                {leagueConfig.name}
                            </span>
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
                        <div
                            ref={scrollRef}
                            role="tablist"
                            aria-label="Seleccionar fecha"
                            className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x"
                        >
                            {dates.map((date) => {
                                const d = new Date(date + 'T12:00:00');
                                const isSelected = date === selectedDate;
                                const hasGames = schedule.some(g => {
                                    const gDate = new Date(g.date).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
                                    return gDate === date;
                                });
                                const dateLabel = d.toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });

                                return (
                                    <button
                                        key={date}
                                        id={`date-${date}`}
                                        role="tab"
                                        aria-selected={isSelected}
                                        aria-label={dateLabel}
                                        onClick={() => setSelectedDate(date)}
                                        className={`
                                            flex-shrink-0 snap-start flex flex-col items-center justify-center w-16 h-20 rounded-2xl border transition-all duration-300
                                            ${isSelected
                                                ? 'text-black scale-105'
                                                : 'bg-zinc-900/50 text-zinc-400 border-white/5 hover:bg-zinc-800 hover:border-white/10'
                                            }
                                        `}
                                        style={isSelected ? {
                                            backgroundColor: leagueConfig.color,
                                            borderColor: leagueConfig.color,
                                            boxShadow: `0 0 20px ${leagueConfig.color}40`
                                        } : undefined}
                                    >
                                        <span className="text-[10px] font-bold uppercase tracking-wider">
                                            {d.toLocaleDateString('es-DO', { weekday: 'short', timeZone: 'America/La_Paz' }).replace('.', '')}
                                        </span>
                                        <span className={`text-2xl font-black ${isSelected ? 'text-black' : 'text-white'}`}>
                                            {d.getDate()}
                                        </span>
                                        {hasGames && (
                                            <div 
                                                className={`w-1.5 h-1.5 rounded-full mt-1 transition-colors duration-300`}
                                                style={{ backgroundColor: isSelected ? '#000' : leagueConfig.color }}
                                            />
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
                        {loading ? (
                            [...Array(3)].map((_, i) => <GameCardSkeleton key={i} />)
                        ) : scheduleError ? (
                            <div className="col-span-full flex flex-col items-center justify-center py-12 px-4 rounded-xl border border-white/10 bg-zinc-900/50">
                                <p className="text-zinc-400 text-sm text-center mb-4">No se pudieron cargar los partidos.</p>
                                {scheduleErrorMessage && <p className="text-zinc-500 text-xs mb-4">{scheduleErrorMessage}</p>}
                                <button
                                    type="button"
                                    onClick={() => refetch()}
                                    className="px-4 py-2 rounded-lg font-medium text-white transition-opacity hover:opacity-90"
                                    style={{ backgroundColor: leagueConfig.color }}
                                >
                                    Reintentar
                                </button>
                            </div>
                        ) : sortedGames.length > 0 ? (
                            sortedGames.map((game) => (
                                <Link key={game.gamePk} to={`/game/${game.gamePk}`}>
                                    <Card 
                                        className="hover:bg-white/5 transition-all duration-300 group cursor-pointer border-l-4 h-full"
                                        style={{ 
                                            borderLeftColor: 'transparent',
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.borderLeftColor = leagueConfig.color)}
                                        onMouseLeave={(e) => (e.currentTarget.style.borderLeftColor = 'transparent')}
                                    >
                                        <div className="flex justify-between items-center mb-4">
                                            {(() => {
                                                const status = getGameStatus(game);
                                                return (
                                                    <Badge variant={status.variant} style={status.variant === 'live' ? { backgroundColor: `${leagueConfig.color}20`, color: leagueConfig.color } : undefined}>
                                                        {status.text}
                                                    </Badge>
                                                );
                                            })()}
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        handleGameSubscription(game.gamePk, `${game.away.name} vs ${game.home.name}`);
                                                    }}
                                                    className="transition-colors"
                                                    style={{ color: subscribedGames.includes(game.gamePk) ? leagueConfig.color : undefined }}
                                                    title={subscribedGames.includes(game.gamePk) ? "Desactivar notificación" : "Activar notificación"}
                                                    aria-label={subscribedGames.includes(game.gamePk) ? "Desactivar notificación para este partido" : "Activar notificación para este partido"}
                                                >
                                                    <Bell className={`w-4 h-4 ${subscribedGames.includes(game.gamePk) ? 'fill-current' : 'text-zinc-600 hover:text-zinc-400'}`} />
                                                </button>
                                                {/* Show inning if game is live, otherwise show time if not started */}
                                                {(game.status === 'Live' || game.status === 'In Progress') && game.liveData?.inning ? (
                                                    <div 
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
                                                        style={{ 
                                                            backgroundColor: `${leagueConfig.color}15`,
                                                            borderColor: `${leagueConfig.color}30`
                                                        }}
                                                    >
                                                        <span 
                                                            className="text-xs font-bold uppercase tracking-wider"
                                                            style={{ color: leagueConfig.color }}
                                                        >
                                                            {game.liveData.isTopInning ? '▲' : '▼'} {game.liveData.inning}
                                                        </span>
                                                    </div>
                                                ) : game.status !== 'Final' && game.status !== 'Game Over' ? (
                                                    <span className="text-xs text-zinc-500 font-medium">
                                                        {new Date(game.date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/La_Paz' })}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={game.away.logo}
                                                        alt={game.away.name}
                                                        loading="lazy"
                                                        className="w-10 h-10 object-contain"
                                                        onError={(e) => {
                                                            const target = e.target as HTMLImageElement;
                                                            target.onerror = null;
                                                            target.style.display = 'none';
                                                            if (target.nextSibling) (target.nextSibling as HTMLElement).style.display = 'flex';
                                                        }}
                                                    />
                                                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-400 border border-white/5 hidden">
                                                        {game.away.abbrev}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-zinc-200 flex items-center gap-2">
                                                            {game.away.name}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    toggleFavoriteTeam(game.away.id);
                                                                }}
                                                                className={`transition-colors ${favoriteTeamId === game.away.id ? 'text-red-500 fill-current' : 'text-zinc-600 hover:text-zinc-400'}`}
                                                                aria-label={favoriteTeamId === game.away.id ? `Quitar ${game.away.name} de favoritos` : `Marcar ${game.away.name} como favorito`}
                                                            >
                                                                <Heart className={`w-4 h-4 ${favoriteTeamId === game.away.id ? 'fill-current' : ''}`} />
                                                            </button>
                                                        </span>
                                                    </div>
                                                    {(game.status === 'Live' || game.status === 'In Progress') && game.liveData?.isTopInning && (
                                                        <FontAwesomeIcon icon={faBaseballBatBall} className="w-4 h-4" style={{ color: leagueConfig.color }} />
                                                    )}
                                                </div>
                                                <span className="text-xl font-black text-white">{game.away.score}</span>
                                            </div>

                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={game.home.logo}
                                                        alt={game.home.name}
                                                        loading="lazy"
                                                        className="w-10 h-10 object-contain"
                                                        onError={(e) => {
                                                            const target = e.target as HTMLImageElement;
                                                            target.onerror = null;
                                                            target.style.display = 'none';
                                                            if (target.nextSibling) (target.nextSibling as HTMLElement).style.display = 'flex';
                                                        }}
                                                    />
                                                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-400 border border-white/5 hidden">
                                                        {game.home.abbrev}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-zinc-200 flex items-center gap-2">
                                                            {game.home.name}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    toggleFavoriteTeam(game.home.id);
                                                                }}
                                                                className={`transition-colors ${favoriteTeamId === game.home.id ? 'text-red-500 fill-current' : 'text-zinc-600 hover:text-zinc-400'}`}
                                                                aria-label={favoriteTeamId === game.home.id ? `Quitar ${game.home.name} de favoritos` : `Marcar ${game.home.name} como favorito`}
                                                            >
                                                                <Heart className={`w-4 h-4 ${favoriteTeamId === game.home.id ? 'fill-current' : ''}`} />
                                                            </button>
                                                        </span>
                                                    </div>
                                                    {(game.status === 'Live' || game.status === 'In Progress') && !game.liveData?.isTopInning && (
                                                        <FontAwesomeIcon icon={faBaseballBatBall} className="w-4 h-4" style={{ color: leagueConfig.color }} />
                                                    )}
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
                                                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < game.liveData!.balls ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-zinc-800'}`} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {/* Strikes */}
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-[10px] font-bold text-zinc-600">S</span>
                                                        <div className="flex gap-1">
                                                            {[...Array(2)].map((_, i) => (
                                                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < game.liveData!.strikes ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-zinc-800'}`} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {/* Outs */}
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-[10px] font-bold text-zinc-600">O</span>
                                                        <div className="flex gap-1">
                                                            {[...Array(2)].map((_, i) => (
                                                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < game.liveData!.outs ? 'bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]' : 'bg-zinc-800'}`} />
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
                                                    <div
                                                        className={`absolute top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border border-zinc-900 ${!game.liveData!.runners.second ? 'bg-zinc-700' : ''}`}
                                                        style={game.liveData!.runners.second ? {
                                                            backgroundColor: game.liveData.isTopInning
                                                                ? (game.away.id === 673 ? '#00be66' : (game.away.color || TEAM_COLORS[game.away.id] || '#ffffff'))
                                                                : (game.home.id === 673 ? '#00be66' : (game.home.color || TEAM_COLORS[game.home.id] || '#ffffff')),
                                                            boxShadow: `0 0 5px ${game.liveData.isTopInning
                                                                ? (game.away.id === 673 ? '#00be66' : (game.away.color || TEAM_COLORS[game.away.id] || '#ffffff'))
                                                                : (game.home.id === 673 ? '#00be66' : (game.home.color || TEAM_COLORS[game.home.id] || '#ffffff'))}`
                                                        } : {}}
                                                    />
                                                    {/* 3rd Base (Left) */}
                                                    <div
                                                        className={`absolute top-1/2 left-0.5 -translate-y-1/2 w-2 h-2 rotate-45 border border-zinc-900 ${!game.liveData!.runners.third ? 'bg-zinc-700' : ''}`}
                                                        style={game.liveData!.runners.third ? {
                                                            backgroundColor: game.liveData.isTopInning
                                                                ? (game.away.id === 673 ? '#00be66' : (game.away.color || TEAM_COLORS[game.away.id] || '#ffffff'))
                                                                : (game.home.id === 673 ? '#00be66' : (game.home.color || TEAM_COLORS[game.home.id] || '#ffffff')),
                                                            boxShadow: `0 0 5px ${game.liveData.isTopInning
                                                                ? (game.away.id === 673 ? '#00be66' : (game.away.color || TEAM_COLORS[game.away.id] || '#ffffff'))
                                                                : (game.home.id === 673 ? '#00be66' : (game.home.color || TEAM_COLORS[game.home.id] || '#ffffff'))}`
                                                        } : {}}
                                                    />
                                                    {/* 1st Base (Right) */}
                                                    <div
                                                        className={`absolute top-1/2 right-0.5 -translate-y-1/2 w-2 h-2 rotate-45 border border-zinc-900 ${!game.liveData!.runners.first ? 'bg-zinc-700' : ''}`}
                                                        style={game.liveData!.runners.first ? {
                                                            backgroundColor: game.liveData.isTopInning
                                                                ? (game.away.id === 673 ? '#00be66' : (game.away.color || TEAM_COLORS[game.away.id] || '#ffffff'))
                                                                : (game.home.id === 673 ? '#00be66' : (game.home.color || TEAM_COLORS[game.home.id] || '#ffffff')),
                                                            boxShadow: `0 0 5px ${game.liveData.isTopInning
                                                                ? (game.away.id === 673 ? '#00be66' : (game.away.color || TEAM_COLORS[game.away.id] || '#ffffff'))
                                                                : (game.home.id === 673 ? '#00be66' : (game.home.color || TEAM_COLORS[game.home.id] || '#ffffff'))}`
                                                        } : {}}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {game.venue && (
                                            <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2 text-xs text-zinc-500">
                                                <MapPin className="w-3.5 h-3.5" />
                                                <span className="truncate">{game.venue}</span>
                                            </div>
                                        )}

                                        {/* Batter & Pitcher Info */}
                                        {(game.status === 'Live' || game.status === 'In Progress') && game.liveData && (
                                            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                                                {/* Batter */}
                                                {game.liveData.batter && (
                                                    <div className="flex items-center gap-2 text-xs text-zinc-300">
                                                        <img
                                                            src={game.liveData.isTopInning ? game.away.logo : game.home.logo}
                                                            alt="Batting Team"
                                                            loading="lazy"
                                                            className="w-3.5 h-3.5 object-contain"
                                                        />
                                                        <span className="font-medium truncate">{game.liveData.batter.name}</span>
                                                        <span className="text-zinc-500 text-[10px] uppercase ml-auto flex-shrink-0">Al Bate</span>
                                                    </div>
                                                )}

                                                {/* Pitcher */}
                                                {game.liveData.pitcher && (
                                                    <div className="flex items-center gap-2 text-xs text-zinc-300">
                                                        <FontAwesomeIcon icon={faBaseball} className="w-3.5 h-3.5 text-zinc-500" />
                                                        <span className="font-medium truncate">{game.liveData.pitcher.name}</span>
                                                        <span className="text-zinc-500 text-[10px] uppercase ml-auto flex-shrink-0">Lanzando</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-2 pt-2 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: leagueConfig.color }}>Ver Detalles</span>
                                            <ChevronRight className="w-4 h-4" style={{ color: leagueConfig.color }} />
                                        </div>
                                    </Card>
                                </Link>
                            ))
                        ) : (
                            <MiniGame 
                                leagueColor={leagueConfig.color} 
                                leagueName={activeLeague.toUpperCase()} 
                            />
                        )}
                    </div>
                </section>

                {/* Stats Grid */}
                <section className="grid md:grid-cols-2 gap-4 md:gap-8 pt-8 border-t border-white/5">
                    {standingsError ? (
                        <Card className="flex flex-col items-center justify-center py-8 px-4">
                            <p className="text-zinc-400 text-sm text-center mb-3">No se pudo cargar la tabla de posiciones.</p>
                            <button type="button" onClick={retryStandings} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: leagueConfig.color }}>Reintentar</button>
                        </Card>
                    ) : (
                        <Standings standings={standings} />
                    )}
                    {leadersError ? (
                        <Card className="flex flex-col items-center justify-center py-8 px-4">
                            <p className="text-zinc-400 text-sm text-center mb-3">No se pudieron cargar los líderes.</p>
                            <button type="button" onClick={retryLeaders} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: leagueConfig.color }}>Reintentar</button>
                        </Card>
                    ) : (
                        <Leaders leaders={leaders} />
                    )}
                </section>

            </div>
        </PullToRefresh>
    );
};
