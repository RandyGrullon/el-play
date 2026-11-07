import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../i18n';
import { PreferencesProvider } from '../../store/preferences';
import { LeagueProvider } from '../../store/LeagueContext';
import { ShareProvider } from '../../share/ShareSheet';
import { GameFeedCard } from './GameFeedCard';
import type { ScheduleGame } from '../../types';

// Juego inventado: equipos, peloteros e ids de prueba
const team = (id: number, name: string, abbrev: string, score: number, isWinner: boolean) => ({ id, name, abbrev, logo: '', color: '#123456', record: null, score, isWinner, probable: null });
const final: ScheduleGame = {
    gamePk: 123456,
    league: 'lidom',
    date: '2026-11-01T23:00:00Z',
    state: 'final',
    detailedState: 'Final',
    gameType: 'R',
    description: null,
    venue: 'Estadio de Prueba',
    scheduledInnings: 9,
    inningsPlayed: 9,
    away: team(99991, 'Equipo Uno', 'UNO', 5, true),
    home: team(99992, 'Equipo Dos', 'DOS', 3, false),
    live: null,
    decisions: { winner: { id: 12345678, name: 'Pelotero Uno' }, loser: { id: 87654321, name: 'Pelotero Dos' }, save: null }
};

const renderCard = (game: ScheduleGame) =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
                <PreferencesProvider>
                    <LeagueProvider>
                        <ShareProvider>
                            <GameFeedCard game={game} />
                        </ShareProvider>
                    </LeagueProvider>
                </PreferencesProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );

describe('GameFeedCard', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
    });

    it('la tarjeta abre el juego; los equipos y las decisiones, su página (ningún enlace dentro de otro)', () => {
        renderCard(final);
        const card = screen.getByRole('link', { name: 'Abrir el juego Equipo Uno contra Equipo Dos' });
        expect(card.getAttribute('href')).toBe('/juego/123456');
        expect(screen.getByRole('link', { name: 'Equipo Uno' }).getAttribute('href')).toBe('/equipo/99991');
        expect(screen.getByRole('link', { name: 'Equipo Dos' }).getAttribute('href')).toBe('/equipo/99992');
        expect(screen.getByRole('link', { name: 'Pelotero Uno' }).getAttribute('href')).toBe('/jugador/12345678');
        expect(screen.getByRole('link', { name: 'Pelotero Dos' }).getAttribute('href')).toBe('/jugador/87654321');
        expect(document.querySelector('a a')).toBeNull();
        expect(screen.getByText('G:', { exact: false }).textContent).toBe('G: Pelotero Uno · P: Pelotero Dos');
    });

    it('en vivo: los dos equipos y el que batea', () => {
        renderCard({
            ...final,
            state: 'live',
            detailedState: 'In Progress',
            decisions: null,
            live: { inning: 5, ordinal: '5th', isTop: true, inningState: 'Top', balls: 1, strikes: 2, outs: 1, runners: { first: false, second: false, third: false }, batter: { id: 11223344, name: 'Pelotero Tres' }, pitcher: { id: 87654321, name: 'Pelotero Dos' } }
        });
        expect(screen.getByRole('link', { name: 'Abrir el juego Equipo Uno contra Equipo Dos' }).getAttribute('href')).toBe('/juego/123456');
        expect(screen.getByRole('link', { name: 'Equipo Uno' }).getAttribute('href')).toBe('/equipo/99991');
        expect(screen.getByRole('link', { name: 'Pelotero Tres' }).getAttribute('href')).toBe('/jugador/11223344');
        expect(document.querySelector('a a')).toBeNull();
    });

    it('detenido por lluvia: la pastilla azul con la entrada en que se paró y sin bateador', () => {
        renderCard({
            ...final,
            state: 'live',
            detailedState: 'Delayed: Rain',
            decisions: null,
            live: { inning: 5, ordinal: '5th', isTop: true, inningState: 'Top', balls: 1, strikes: 2, outs: 1, runners: { first: true, second: false, third: false }, batter: { id: 11223344, name: 'Pelotero Tres' }, pitcher: { id: 87654321, name: 'Pelotero Dos' } }
        });
        expect(screen.getByText('Detenido · Lluvia · ▲ 5')).toBeTruthy();
        expect(screen.queryByRole('link', { name: 'Pelotero Tres' })).toBeNull();
    });
});
