import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Home } from './pages/Home';
import { Game } from './pages/Game';

import { SplashLoader } from './components/ui/SplashLoader';

import { UpdateModal } from './components/common/UpdateModal';
import { InstallPWA } from './components/common/InstallPWA';
import { OfflineFallback } from './components/common/OfflineFallback';
import { Sidebar, BaseballIcon } from './components/common/Sidebar';
import { LeagueProvider, useLeague } from './store/LeagueContext';

function AppContent() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { leagueConfig, activeLeague } = useLeague();
    const [isLoading, setIsLoading] = React.useState(true);
    const [showTransitionLoader, setShowTransitionLoader] = React.useState(false);
    const [contentVisible, setContentVisible] = React.useState(false);
    const [isOnline, setIsOnline] = React.useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const isFirstLeagueRender = React.useRef(true);

    React.useEffect(() => {
        const timer = setTimeout(() => setIsLoading(false), 2500);
        return () => clearTimeout(timer);
    }, []);

    React.useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    React.useEffect(() => {
        if (isFirstLeagueRender.current) {
            isFirstLeagueRender.current = false;
            return;
        }
        setShowTransitionLoader(true);
        const t = setTimeout(() => setShowTransitionLoader(false), 500);
        return () => clearTimeout(t);
    }, [activeLeague]);

    React.useEffect(() => {
        if (showTransitionLoader) {
            setContentVisible(false);
            return;
        }
        const id = setTimeout(() => setContentVisible(true), 50);
        return () => clearTimeout(id);
    }, [showTransitionLoader]);

    if (showTransitionLoader) {
        return <SplashLoader color={leagueConfig.color} />;
    }
    if (isLoading) {
        return <SplashLoader />;
    }
    if (!isOnline) {
        return <OfflineFallback onRetry={() => setIsOnline(navigator.onLine)} accentColor={leagueConfig.color} />;
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-cyan-500/30">
            <UpdateModal />
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Background Gradient Mesh - changes based on league */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden transition-all duration-700">
                <div 
                    className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full blur-[120px] transition-colors duration-700"
                    style={{ backgroundColor: `${leagueConfig.color}15` }}
                />
                <div 
                    className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] rounded-full blur-[100px] transition-colors duration-700"
                    style={{ backgroundColor: `${leagueConfig.color}08` }}
                />
                <div 
                    className="absolute bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full blur-[80px] transition-colors duration-700"
                    style={{ backgroundColor: `${leagueConfig.color}05` }}
                />
            </div>

            <div className={`relative max-w-5xl mx-auto p-6 md:p-12 space-y-8 transition-opacity duration-300 ${contentVisible ? 'opacity-100' : 'opacity-0'}`}>

                {/* Header */}
                <header className="flex flex-col gap-6 border-b pb-6 transition-colors duration-500" style={{ borderColor: `${leagueConfig.color}20` }}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <BaseballIcon isOpen={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)} />
                            <Link to="/">
                                <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent cursor-pointer">
                                    EL <span className="transition-colors duration-500" style={{ color: leagueConfig.color }}>PLAY</span>
                                </h1>
                            </Link>
                        </div>
                        <div className="flex items-center gap-3">
                            <InstallPWA />
                            <div 
                                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all duration-500"
                                style={{ 
                                    backgroundColor: `${leagueConfig.color}08`,
                                    borderColor: `${leagueConfig.color}20`
                                }}
                            >
                                <Activity className="w-3 h-3 text-emerald-500" />
                                <span className="text-zinc-500 hidden sm:inline">Live</span>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main>
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/game/:gamePk" element={<Game />} />
                    </Routes>
                </main>

            </div>

            {/* Vercel Analytics & Speed Insights */}
            <Analytics />
            <SpeedInsights />
        </div>
    );
}

function App() {
    return (
        <Router>
            <LeagueProvider>
                <AppContent />
            </LeagueProvider>
        </Router>
    );
}

export default App;
