import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../i18n';
import { Matchup } from './Matchup';
import { DEFAULT_RECENT, setRecentCount } from '../../lib/recentGames';
import type { GameDetail } from '../../types';
import type { HittingLine } from '../../lib/stats';

// Juego y peloteros inventados
const line = (h: number, ab: number) => ({ h, ab }) as HittingLine;
const game = {
    gamePk: 500,
    league: 'lidom',
    state: 'live',
    matchup: {
        batter: { id: 222, name: 'Bateador Prueba', side: 'L', h: 0, ab: 3, avg: '.250' },
        pitcher: { id: 111, name: 'Lanzador Prueba', hand: 'R', pitches: 50, ip: '4.0', k: 3, era: '3.00' },
        onDeck: null
    }
} as unknown as GameDetail;

const renderMatchup = (log: { gamePk: number; hitting: HittingLine | null }[] | null) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    if (log) client.setQueryData(['player', 'lidom', 222, 'actual'], { id: 222, role: 'B', log });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <Matchup game={game} />
            </MemoryRouter>
        </QueryClientProvider>
    );
};

describe('Matchup: el bateador con sus últimos juegos', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
        window.localStorage.clear();
        setRecentCount(DEFAULT_RECENT);
    });

    it('al lado de «Hoy 0-3» van los hits y turnos de sus juegos anteriores (sin el de hoy)', () => {
        renderMatchup([
            { gamePk: 500, hitting: line(0, 3) },
            { gamePk: 499, hitting: line(1, 4) },
            { gamePk: 498, hitting: line(0, 3) },
            { gamePk: 497, hitting: line(1, 4) }
        ]);
        expect(screen.getByText('Hoy').nextElementSibling?.textContent).toBe('0-3');
        const recent = screen.getByText('Últ. 3');
        expect(recent.nextElementSibling?.textContent).toBe('2-11');
        expect(recent.parentElement?.getAttribute('title')).toBe('Últimos 3 juegos: 11 turnos · 2 hits');
    });

    it('mide los juegos que escogiste en el perfil', () => {
        setRecentCount(2);
        renderMatchup([
            { gamePk: 500, hitting: line(0, 3) },
            { gamePk: 499, hitting: line(1, 4) },
            { gamePk: 498, hitting: line(0, 3) },
            { gamePk: 497, hitting: line(1, 4) }
        ]);
        expect(screen.getByText('Últ. 2').nextElementSibling?.textContent).toBe('1-7');
    });

    it('sin su perfil todavía, solo Hoy y AVG', () => {
        renderMatchup(null);
        expect(screen.queryByText(/^Últ\./)).toBeNull();
        expect(screen.getByText('Hoy')).toBeTruthy();
    });
});
