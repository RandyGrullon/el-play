import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { LeagueProvider } from './store/LeagueContext';
import { PreferencesProvider } from './store/preferences';
import { AppShell } from './components/layout/AppShell';
import { Splash } from './components/brand/Splash';
import { Skeleton } from './components/ui/States';
import { GamesPage } from './pages/GamesPage';
import { ShareProvider } from './share/ShareSheet';
import { getInstallMode, openInstallSheet } from './lib/install';

// La portada va en el bundle principal; el resto se baja al entrar (o mientras corre la animación de entrada)
const loadGame = () => import('./pages/GamePage');
const loadStandings = () => import('./pages/StandingsPage');
const loadLeaders = () => import('./pages/LeadersPage');
const loadMore = () => import('./pages/MorePage');
const loadFantasy = () => import('./pages/FantasyPage');
const GamePage = lazy(() => loadGame().then((module) => ({ default: module.GamePage })));
const StandingsPage = lazy(() => loadStandings().then((module) => ({ default: module.StandingsPage })));
const LeadersPage = lazy(() => loadLeaders().then((module) => ({ default: module.LeadersPage })));
const MorePage = lazy(() => loadMore().then((module) => ({ default: module.MorePage })));
const FantasyPage = lazy(() => loadFantasy().then((module) => ({ default: module.FantasyPage })));

if (typeof window !== 'undefined') {
    const prefetch = () => [loadGame, loadStandings, loadLeaders, loadMore, loadFantasy].forEach((load) => load().catch(() => undefined));
    if ('requestIdleCallback' in window) window.requestIdleCallback(prefetch, { timeout: 3000 });
    else setTimeout(prefetch, 1500);
}

// Enlaces viejos /game/:id siguen funcionando
const LegacyGameRedirect: React.FC = () => {
    const { gamePk } = useParams();
    return <Navigate to={`/juego/${gamePk}`} replace />;
};

// Enlace para compartir (bio de Instagram, WhatsApp): el-play.vercel.app/instalar abre la guía sobre la portada
const InstallLink: React.FC = () => {
    useEffect(() => {
        if (getInstallMode() !== 'installed') openInstallSheet();
    }, []);
    return <Navigate to="/" replace />;
};

const PageFallback: React.FC = () => (
    <div className="space-y-4" aria-hidden="true">
        <Skeleton className="mx-4 mt-5 h-9 w-48" />
        <Skeleton className="mx-4 h-[160px] rounded-card" />
        <Skeleton className="mx-4 h-[320px] rounded-card" />
    </div>
);

const App: React.FC = () => (
    <BrowserRouter>
        <PreferencesProvider>
            <Splash />
            <LeagueProvider>
                <ShareProvider>
                <AppShell>
                    <Suspense fallback={<PageFallback />}>
                        <Routes>
                            <Route path="/" element={<GamesPage />} />
                            <Route path="/juego/:gamePk" element={<GamePage />} />
                            <Route path="/game/:gamePk" element={<LegacyGameRedirect />} />
                            <Route path="/posiciones" element={<StandingsPage />} />
                            <Route path="/lideres" element={<LeadersPage />} />
                            <Route path="/mas" element={<MorePage />} />
                            <Route path="/fantasy" element={<FantasyPage />} />
                            <Route path="/instalar" element={<InstallLink />} />
                            <Route path="/install" element={<InstallLink />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Suspense>
                </AppShell>
                </ShareProvider>
            </LeagueProvider>
        </PreferencesProvider>
        {import.meta.env.PROD && (
            <>
                <Analytics />
                <SpeedInsights />
            </>
        )}
    </BrowserRouter>
);

export default App;
