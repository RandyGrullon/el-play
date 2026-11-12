import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../i18n';
import { PreferencesProvider } from '../../store/preferences';
import { LeagueProvider } from '../../store/LeagueContext';
import { ShareProvider } from '../../share/ShareSheet';
import { GameFeedCard } from '../feed/GameFeedCard';
import { FieldViewProvider } from './FieldView';
import { keys } from '../../lib/queries';
import type { BoxTeam, GameDetail, GameTeam, ScheduleGame } from '../../types';

// Juego inventado: equipos, peloteros e ids de prueba
const person = (id: number, name: string) => ({ id, name });
const team = (id: number, name: string, abbrev: string, teamName: string, color: string, runs: number): GameTeam => ({ id, name, teamName, abbrev, logo: '', color, record: null, runs, hits: 0, errors: 0, lob: 0, isWinner: false });
const box: BoxTeam = { batters: [], pitchers: [], totals: { ab: null, r: null, h: null, rbi: null, bb: null, k: null, hr: null, lob: null, avg: null } };
const detail: GameDetail = {
    gamePk: 123456,
    league: 'lidom',
    state: 'live',
    detailedState: 'In Progress',
    reason: null,
    date: '2026-11-01T23:00:00Z',
    venue: 'Estadio de Prueba',
    weather: null,
    description: null,
    scheduledInnings: 9,
    away: team(99991, 'Equipo Uno', 'UNO', 'Unos', '#123456', 2),
    home: team(99992, 'Equipo Dos', 'DOS', 'Doses', '#aa3322', 3),
    inning: { n: 7, ordinal: '7th', isTop: true, state: 'Top' },
    count: { balls: 1, strikes: 2, outs: 1 },
    runners: { first: person(87654304, 'Corredor Uno'), second: null, third: null },
    matchup: {
        pitcher: { ...person(12345601, 'Pelotero Uno'), hand: 'R', pitches: 50, ip: '6.0', k: 5, era: '2.00' },
        batter: { ...person(87654301, 'Bateador Uno'), side: 'L', h: 1, ab: 2, avg: '.300' },
        onDeck: person(87654302, 'Bateador Dos')
    },
    field: {
        defenseTeamId: 99992,
        offenseTeamId: 99991,
        defense: {
            pitcher: person(12345601, 'Pelotero Uno'),
            catcher: person(12345602, 'Pelotero Dos'),
            first: person(12345603, 'Pelotero Tres'),
            second: person(12345604, 'Pelotero Cuatro'),
            third: person(12345605, 'Pelotero Cinco'),
            shortstop: person(12345606, 'Pelotero Seis'),
            left: person(12345607, 'Pelotero Siete'),
            center: person(12345608, 'Pelotero Ocho'),
            right: person(12345609, 'Pelotero Nueve')
        },
        offense: { batter: person(87654301, 'Bateador Uno'), onDeck: person(87654302, 'Bateador Dos'), inHole: null, first: person(87654304, 'Corredor Uno'), second: null, third: null }
    },
    probables: { away: null, home: null },
    linescore: [],
    atBats: [],
    currentAtBat: null,
    box: { away: box, home: box },
    decisions: { winner: null, loser: null, save: null },
    topPerformers: [],
    updatedAt: null
};

const card: ScheduleGame = {
    gamePk: 123456,
    league: 'lidom',
    date: '2026-11-01T23:00:00Z',
    state: 'live',
    detailedState: 'In Progress',
    gameType: 'R',
    description: null,
    venue: 'Estadio de Prueba',
    scheduledInnings: 9,
    inningsPlayed: 7,
    away: { ...detail.away, score: 2, probable: null },
    home: { ...detail.home, score: 3, probable: null },
    live: { inning: 7, ordinal: '7th', isTop: true, inningState: 'Top', balls: 1, strikes: 2, outs: 1, runners: { first: true, second: false, third: false }, batter: person(87654301, 'Bateador Uno'), pitcher: person(12345601, 'Pelotero Uno') },
    decisions: null
};

const renderList = (browser = false) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(keys.game(123456), detail);
    // Con el historial de verdad (BrowserRouter) para probar «atrás»
    const Router = browser ? BrowserRouter : MemoryRouter;
    return render(
        <QueryClientProvider client={client}>
            <Router>
                <PreferencesProvider>
                    <LeagueProvider>
                        <ShareProvider>
                            <FieldViewProvider>
                                <Routes>
                                    <Route path="/" element={<GameFeedCard game={card} />} />
                                    <Route path="/juego/:gamePk" element={<p>Página del juego</p>} />
                                    <Route path="/jugador/:playerId" element={<p>Página del pelotero</p>} />
                                </Routes>
                            </FieldViewProvider>
                        </ShareProvider>
                    </LeagueProvider>
                </PreferencesProvider>
            </Router>
        </QueryClientProvider>
    );
};

describe('vista del terreno', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
        vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/api/v2/game/') ? { ok: true, status: 200, json: async () => detail } : { ok: false, status: 404, json: async () => ({}) })));
    });

    it('el diamante de la tarjeta abre el terreno (no el juego) con las caras de los que están en juego', async () => {
        renderList();
        fireEvent.click(screen.getByRole('button', { name: 'Ver el terreno' }));
        const dialog = await screen.findByRole('dialog', { name: 'El terreno' }, { timeout: 5000 });
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(screen.queryByText('Página del juego')).toBeNull();
        // Los nueve, el corredor, el bateador y el que espera; cada cara abre su página
        expect(screen.getByRole('link', { name: 'Pitcher: Pelotero Uno' }).getAttribute('href')).toBe('/jugador/12345601');
        expect(screen.getByRole('link', { name: 'Campocorto: Pelotero Seis' }).getAttribute('href')).toBe('/jugador/12345606');
        expect(screen.getByRole('link', { name: 'Corredor en primera: Corredor Uno' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Al bate: Bateador Uno' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'En espera: Bateador Dos' })).toBeTruthy();
        expect(dialog.querySelectorAll('a[href^="/jugador/"]')).toHaveLength(12);
        // Cabecera: entrada, conteo y quién defiende y quién batea
        const header = within(dialog);
        expect(header.getByText('Alta 7')).toBeTruthy();
        expect(header.getByText('1-2')).toBeTruthy();
        expect(header.getByText('Defensa: Doses')).toBeTruthy();
        expect(header.getByText('Al bate: Unos')).toBeTruthy();
    });

    it('Escape lo cierra y tocar una cara va a la página del pelotero', async () => {
        renderList();
        fireEvent.click(screen.getByRole('button', { name: 'Ver el terreno' }));
        await screen.findByRole('dialog', { name: 'El terreno' }, { timeout: 5000 });
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });

        fireEvent.click(screen.getByRole('button', { name: 'Ver el terreno' }));
        await screen.findByRole('dialog', { name: 'El terreno' }, { timeout: 5000 });
        fireEvent.click(screen.getByRole('link', { name: 'Receptor: Pelotero Dos' }));
        expect(await screen.findByText('Página del pelotero')).toBeTruthy();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    }, 20000);

    it('al volver «atrás» desde el pelotero, el terreno sale abierto otra vez; la X lo cierra', async () => {
        window.history.replaceState(null, '', '/');
        renderList(true);
        fireEvent.click(screen.getByRole('button', { name: 'Ver el terreno' }));
        await screen.findByRole('dialog', { name: 'El terreno' }, { timeout: 5000 });
        fireEvent.click(screen.getByRole('link', { name: 'Receptor: Pelotero Dos' }));
        expect(await screen.findByText('Página del pelotero')).toBeTruthy();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });

        window.history.back();
        await screen.findByRole('dialog', { name: 'El terreno' }, { timeout: 5000 });
        expect(window.location.pathname).toBe('/');

        fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
        expect(window.history.state?.elPlayField).toBeUndefined();
    }, 20000);

    it('entre entradas lo dice y muestra la defensa que sale', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        client.setQueryData(keys.game(123456), { ...detail, inning: { n: 7, ordinal: '7th', isTop: true, state: 'Middle' } });
        render(
            <QueryClientProvider client={client}>
                <MemoryRouter>
                    <PreferencesProvider>
                        <LeagueProvider>
                            <ShareProvider>
                                <FieldViewProvider>
                                    <GameFeedCard game={card} />
                                </FieldViewProvider>
                            </ShareProvider>
                        </LeagueProvider>
                    </PreferencesProvider>
                </MemoryRouter>
            </QueryClientProvider>
        );
        fireEvent.click(screen.getByRole('button', { name: 'Ver el terreno' }));
        expect(await screen.findByText('Entre entradas: así sale a la defensa Doses')).toBeTruthy();
    });
});
