import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { LeagueProvider } from './store/LeagueContext';
import { PreferencesProvider } from './store/preferences';
import { AppShell } from './components/layout/AppShell';
import { Splash } from './components/brand/Splash';
import { Skeleton } from './components/ui/States';
import { GamesPage } from './pages/GamesPage';

// La portada va en el bundle principal; el resto se baja al entrar (o mientras corre la animación de entrada)
const loadGame = () => import('./pages/GamePage');
const loadStandings = () => import('./pages/StandingsPage');
const loadLeaders = () => import('./pages/LeadersPage');
const GamePage = lazy(() => loadGame().then((module) => ({ default: module.GamePage })));
const StandingsPage = lazy(() => loadStandings().then((module) => ({ default: module.StandingsPage })));
const LeadersPage = lazy(() => loadLeaders().then((module) => ({ default: module.LeadersPage })));

if (typeof window !== 'undefined') {
    const prefetch = () => [loadGame, loadStandings, loadLeaders].forEach((load) => load().catch(() => undefined));
    if ('requestIdleCallback' in window) window.requestIdleCallback(prefetch, { timeout: 3000 });
    else setTimeout(prefetch, 1500);
}

// Enlaces viejos /game/:id siguen funcionando
const LegacyGameRedirect: React.FC = () => {
    const { gamePk } = useParams();
    return <Navigate to={`/juego/${gamePk}`} replace />;
};

const PageFallback: React.FC = () => (
    <div className="space-y-4" aria-hidden="true">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-[160px] rounded-card" />
        <Skeleton className="h-[320px] rounded-card" />
    </div>
);

const App: React.FC = () => (
    <BrowserRouter>
        <PreferencesProvider>
            <Splash />
            <LeagueProvider>
                <AppShell>
                    <Suspense fallback={<PageFallback />}>
                        <Routes>
                            <Route path="/" element={<GamesPage />} />
                            <Route path="/juego/:gamePk" element={<GamePage />} />
                            <Route path="/game/:gamePk" element={<LegacyGameRedirect />} />
                            <Route path="/posiciones" element={<StandingsPage />} />
                            <Route path="/lideres" element={<LeadersPage />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Suspense>
                </AppShell>
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
