import React, { useMemo } from 'react';
import { LEAGUE_COLORS, type LeagueId } from '../../constants/leagues';

function getLeagueColor(): string {
    const saved = localStorage.getItem('activeLeague') as LeagueId | null;
    return LEAGUE_COLORS[saved || 'lidom'] ?? LEAGUE_COLORS.lidom;
}

interface SplashLoaderProps {
    /** Si se pasa, usa este color (ej. al cambiar de segmento). Si no, usa el de localStorage. */
    color?: string;
}

export const SplashLoader: React.FC<SplashLoaderProps> = ({ color: colorProp }) => {
    const colorFromStorage = useMemo(() => getLeagueColor(), []);
    const leagueColor = colorProp ?? colorFromStorage;
    
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div 
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[100px] animate-pulse"
                    style={{ backgroundColor: `${leagueColor}20` }}
                />
            </div>

            {/* Logo Container */}
            <div className="relative z-10 flex flex-col items-center gap-8">
                <div className="relative w-32 h-32 md:w-40 md:h-40 animate-bounce-slow">
                    <img
                        src="/logo.svg"
                        alt="El Play Logo"
                        className="w-full h-full"
                        style={{ filter: `drop-shadow(0 0 15px ${leagueColor}50)` }}
                    />

                    {/* Ripple Effect */}
                    <div className="absolute inset-0 rounded-full border-2 border-white/10 animate-ping-slow" />
                    <div className="absolute inset-0 rounded-full border border-white/5 animate-ping-slower delay-150" />
                </div>

                {/* Loading Text */}
                <div className="flex flex-col items-center gap-2">
                    <h1 className="text-2xl font-black tracking-tighter text-white">
                        EL <span style={{ color: leagueColor }}>PLAY</span>
                    </h1>
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full animate-bounce delay-0" style={{ backgroundColor: leagueColor }} />
                        <div className="w-1.5 h-1.5 rounded-full animate-bounce delay-100" style={{ backgroundColor: leagueColor }} />
                        <div className="w-1.5 h-1.5 rounded-full animate-bounce delay-200" style={{ backgroundColor: leagueColor }} />
                    </div>
                </div>
            </div>
        </div>
    );
};
