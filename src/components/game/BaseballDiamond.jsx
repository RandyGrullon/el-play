import React from 'react';

export const BaseballDiamond = ({ runners }) => {
    return (
        <div className="relative w-48 h-48 mx-auto my-4">
            {/* Field Background - Rotated Square */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 bg-zinc-800/50 border-2 border-zinc-700 transform rotate-45 rounded-sm relative">

                    {/* Base Paths (Optional visual lines) */}
                    <div className="absolute inset-4 border border-zinc-700/50" />

                    {/* Bases */}

                    {/* 2nd Base (Top) */}
                    <div className={`absolute -top-3 -left-3 w-6 h-6 border-2 transform -rotate-45 transition-all duration-500 ${runners.second
                            ? 'bg-amber-400 border-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.5)]'
                            : 'bg-zinc-700 border-zinc-600'
                        }`} />

                    {/* 1st Base (Right) */}
                    <div className={`absolute -top-3 -right-3 w-6 h-6 border-2 transform -rotate-45 transition-all duration-500 ${runners.first
                            ? 'bg-amber-400 border-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.5)]'
                            : 'bg-zinc-700 border-zinc-600'
                        }`} />

                    {/* 3rd Base (Left) */}
                    <div className={`absolute -bottom-3 -left-3 w-6 h-6 border-2 transform -rotate-45 transition-all duration-500 ${runners.third
                            ? 'bg-amber-400 border-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.5)]'
                            : 'bg-zinc-700 border-zinc-600'
                        }`} />

                    {/* Home Plate (Bottom) */}
                    <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-zinc-400 border-2 border-zinc-300 transform -rotate-45"
                        style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} // Simple shape
                    />
                </div>
            </div>
        </div>
    );
};
