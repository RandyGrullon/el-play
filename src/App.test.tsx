import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from './i18n';
import App from './App';

describe('App', () => {
    beforeEach(() => {
        window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
        i18n.changeLanguage('es');
        // Calendario vacío: la app debe pintar el armazón y el estado "sin juegos"
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => ({
                ok: true,
                json: async () =>
                    url.includes('/schedule')
                        ? { league: 'lidom', timeZone: 'America/Santo_Domingo', startDate: '2026-10-06', endDate: '2026-10-16', games: [] }
                        : { type: 'lidom', regular: [], roundRobin: [], final: [], activePhase: 'regular', season: 2026, isPreviousSeason: false }
            }))
        );
    });

    it('pinta la navegación y la página de juegos', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <App />
            </QueryClientProvider>
        );
        expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeTruthy();
        expect(await screen.findByText('Hoy en LIDOM')).toBeTruthy();
        expect(await screen.findByText('No hay juegos este día')).toBeTruthy();
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v2/schedule?league=lidom'), expect.anything());
    });
});
