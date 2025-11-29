import React from 'react';

export const SplashLoader: React.FC = () => {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-900/20 rounded-full blur-[100px] animate-pulse" />
            </div>

            {/* Logo Container */}
            <div className="relative z-10 flex flex-col items-center gap-8">
                <div className="relative w-32 h-32 md:w-40 md:h-40 animate-bounce-slow">
                    <img
                        src="/logo.svg"
                        alt="El Play Logo"
                        className="w-full h-full drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                    />

                    {/* Ripple Effect */}
                    <div className="absolute inset-0 rounded-full border-2 border-white/10 animate-ping-slow" />
                    <div className="absolute inset-0 rounded-full border border-white/5 animate-ping-slower delay-150" />
                </div>

                {/* Loading Text */}
                <div className="flex flex-col items-center gap-2">
                    <h1 className="text-2xl font-black tracking-tighter text-white">
                        EL <span className="text-cyan-400">PLAY</span>
                    </h1>
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-0" />
                        <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-100" />
                        <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-200" />
                    </div>
                </div>
            </div>
        </div>
    );
};
