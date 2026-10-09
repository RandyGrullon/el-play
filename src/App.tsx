import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { LeagueProvider } from './store/LeagueContext';
import { PreferencesProvider } from './store/preferences';
import { AppShell } from './components/layout/AppShell';
import { Splash } from './components/brand/Splash';
import { GamesPage } from './pages/GamesPage';
import { GamePage } from './pages/GamePage';
import { StandingsPage } from './pages/StandingsPage';
import { LeadersPage } from './pages/LeadersPage';

// Enlaces viejos /game/:id siguen funcionando
const LegacyGameRedirect: React.FC = () => {
    const { gamePk } = useParams();
    return <Navigate to={`/juego/${gamePk}`} replace />;
};

const App: React.FC = () => (
    <BrowserRouter>
        <PreferencesProvider>
            <Splash />
            <LeagueProvider>
                <AppShell>
                    <Routes>
                        <Route path="/" element={<GamesPage />} />
                        <Route path="/juego/:gamePk" element={<GamePage />} />
                        <Route path="/game/:gamePk" element={<LegacyGameRedirect />} />
                        <Route path="/posiciones" element={<StandingsPage />} />
                        <Route path="/lideres" element={<LeadersPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
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
