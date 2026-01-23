import React from 'react';
import { useLeague, LeagueType } from '../../store/LeagueContext';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

// Baseball SVG with seams for the hamburger icon
export const BaseballIcon: React.FC<{ isOpen: boolean; onClick: () => void }> = ({ isOpen, onClick }) => {
    return (
        <button
            onClick={onClick}
            className="relative w-10 h-10 flex items-center justify-center focus:outline-none group"
            aria-label="Toggle menu"
        >
            <div className={`transition-transform duration-500 ease-out ${isOpen ? 'rotate-180' : 'group-hover:rotate-45'}`}>
                <svg
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="drop-shadow-lg"
                >
                    {/* Baseball base */}
                    <circle cx="16" cy="16" r="14" fill="#f5f5f4" stroke="#d6d3d1" strokeWidth="1" />
                    
                    {/* Left seam curve */}
                    <path
                        d="M8 6 Q4 16, 8 26"
                        stroke="#dc2626"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                    />
                    {/* Left seam stitches */}
                    <path d="M7 8 L10 9" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    <path d="M5.5 11 L8.5 12" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    <path d="M5 14.5 L8 15" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    <path d="M5 17.5 L8 17" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    <path d="M5.5 21 L8.5 20" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    <path d="M7 24 L10 23" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    
                    {/* Right seam curve */}
                    <path
                        d="M24 6 Q28 16, 24 26"
                        stroke="#dc2626"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                    />
                    {/* Right seam stitches */}
                    <path d="M25 8 L22 9" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    <path d="M26.5 11 L23.5 12" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    <path d="M27 14.5 L24 15" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    <path d="M27 17.5 L24 17" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    <path d="M26.5 21 L23.5 20" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                    <path d="M25 24 L22 23" stroke="#dc2626" strokeWidth="1" strokeLinecap="round" />
                </svg>
            </div>
        </button>
    );
};

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
    const { activeLeague, setActiveLeague, leagues, leagueConfig } = useLeague();

    const handleLeagueSelect = (leagueId: LeagueType) => {
        setActiveLeague(leagueId);
        onClose();
    };

    return (
        <>
            {/* Overlay */}
            <div
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
                    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />

            {/* Sidebar */}
            <div
                className={`fixed top-0 left-0 h-full w-72 bg-zinc-900 border-r border-white/10 z-50 transform transition-transform duration-300 ease-out ${
                    isOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="p-6 border-b border-white/10">
                    <h2 className="text-xl font-bold text-white">Selecciona Liga</h2>
                    <p className="text-xs text-zinc-500 mt-1">Elige qué torneo quieres ver</p>
                </div>

                {/* League List */}
                <div className="p-4 space-y-3">
                    {leagues.map((league) => (
                        <button
                            key={league.id}
                            onClick={() => handleLeagueSelect(league.id)}
                            className={`w-full p-4 rounded-xl text-left transition-all duration-300 group ${
                                activeLeague === league.id
                                    ? 'bg-gradient-to-r border-2 shadow-lg'
                                    : 'bg-zinc-800/50 border-2 border-transparent hover:bg-zinc-800 hover:border-white/10'
                            }`}
                            style={{
                                borderColor: activeLeague === league.id ? league.color : undefined,
                                background: activeLeague === league.id 
                                    ? `linear-gradient(135deg, ${league.color}15 0%, ${league.color}05 100%)`
                                    : undefined,
                                boxShadow: activeLeague === league.id 
                                    ? `0 4px 20px ${league.color}20`
                                    : undefined
                            }}
                        >
                            <div className="flex items-center gap-4">
                                <div 
                                    className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-110"
                                    style={{ 
                                        backgroundColor: `${league.color}20`, 
                                        boxShadow: activeLeague === league.id ? `0 0 20px ${league.color}30` : undefined
                                    }}
                                >
                                    <img 
                                        src={league.id === 'lidom' ? '/lidom.png' : '/wbsc.jpg'}
                                        alt={league.name}
                                        className="w-10 h-10 object-contain"
                                    />
                                </div>
                                <div className="flex-1">
                                    <h3 
                                        className="font-bold text-lg transition-colors duration-300"
                                        style={{ color: activeLeague === league.id ? league.color : 'white' }}
                                    >
                                        {league.name}
                                    </h3>
                                    <p className="text-xs text-zinc-500">{league.fullName}</p>
                                </div>
                                {activeLeague === league.id && (
                                    <div 
                                        className="w-3 h-3 rounded-full animate-pulse"
                                        style={{ backgroundColor: league.color }}
                                    />
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
                    <div className="text-center text-xs text-zinc-600">
                        <span className="text-zinc-400">EL</span>{' '}
                        <span style={{ color: leagueConfig.color }}>PLAY</span>
                        <p className="mt-1">Tu app de béisbol</p>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Sidebar;
