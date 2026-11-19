import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../i18n';
import { keys } from '../../lib/queries';
import { FloatingButton, FloatingProvider } from './Floating';
import type { GameDetail } from '../../types';

// Juego inventado: equipos e ids de prueba
const team = (id: number, abbrev: string, color: string, runs: number) => ({ id, abbrev, name: `Equipo ${abbrev}`, color, logo: '', runs });
const game = {
    gamePk: 123,
    state: 'live',
    scheduledInnings: 9,
    linescore: [],
    inning: { n: 6, ordinal: '6th', isTop: false, state: 'Bottom' },
    count: { balls: 1, strikes: 2, outs: 2 },
    runners: { first: null, second: { id: 2, name: 'Dos' }, third: null },
    matchup: { batter: { id: 302, name: 'Juan Bateador' }, pitcher: { id: 401, name: 'Luis Lanzador' }, onDeck: null },
    atBats: [],
    currentAtBat: null,
    dueUp: null,
    away: team(90001, 'VIS', '#aa1141', 2),
    home: team(90002, 'CAS', '#FDB927', 4)
} as unknown as GameDetail;

/** Hace de ventana flotante: un iframe vacío del mismo sitio, como la que abre Chrome */
const fakePipWindow = () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const win = frame.contentWindow!;
    win.close = vi.fn();
    return win;
};

const renderWith = (ui: React.ReactNode) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(keys.game(123), game);
    return render(
        <QueryClientProvider client={client}>
            <FloatingProvider>{ui}</FloatingProvider>
        </QueryClientProvider>
    );
};

describe('FloatingButton', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
    });
    afterEach(() => {
        delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture;
        document.querySelectorAll('iframe').forEach((frame) => frame.remove());
    });

    it('no sale si el navegador no deja abrir ventanas flotantes', () => {
        renderWith(<FloatingButton gamePk={123} />);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('abre el marcador en la ventana flotante, se cambia de juego y se quita', async () => {
        const win = fakePipWindow();
        const requestWindow = vi.fn(async () => win);
        (window as unknown as { documentPictureInPicture: unknown }).documentPictureInPicture = { requestWindow, window: null };

        renderWith(
            <>
                <FloatingButton gamePk={123} />
                <FloatingButton gamePk={456} />
            </>
        );
        const [mine] = screen.getAllByRole('button');
        expect(mine.textContent).toBe('Ver en ventana flotante');

        await act(async () => {
            fireEvent.click(mine);
        });
        expect(requestWindow).toHaveBeenCalledWith({ width: 340, height: 200 });
        const [here, other] = screen.getAllByRole('button');
        expect(here.textContent).toBe('Quitar la ventana flotante');
        // En otro juego en vivo el botón la pasa a ese juego
        expect(other.textContent).toBe('Poner este juego en la ventana flotante');

        const text = win.document.body.textContent ?? '';
        expect(text).toContain('VIS');
        expect(text).toContain('CAS');
        expect(text).toContain('1-2');
        expect(text).toContain('Batea Bateador · Lanza Lanzador');
        expect(win.document.title).toBe('VIS 2-4 CAS · El Play');

        await act(async () => {
            fireEvent.click(here);
        });
        expect(win.close).toHaveBeenCalled();
        expect(screen.getAllByRole('button')[0].textContent).toBe('Ver en ventana flotante');
        expect(win.document.body.textContent).toBe('');
    });
});
