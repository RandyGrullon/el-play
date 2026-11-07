import React, { useRef } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { PreferencesProvider } from '../store/preferences';
import { useSwipeBack } from './useSwipeBack';

const Harness: React.FC = () => {
    const shell = useRef<HTMLDivElement>(null);
    const page = useRef<HTMLElement>(null);
    const backdrop = useRef<HTMLDivElement>(null);
    useSwipeBack(shell, page, backdrop);
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <div ref={shell}>
            <div ref={backdrop} data-testid="backdrop" />
            <main ref={page} data-testid="page">
                <p data-testid="path">{location.pathname}</p>
                <div data-no-swipe>
                    <span data-testid="marked">Marcado</span>
                </div>
                {/* Un enlace a Estadísticas y la pestaña de Líderes (reemplaza la entrada, como StatsTabs) */}
                <button type="button" data-testid="link-stats" onClick={() => navigate('/estadisticas')} />
                <button type="button" data-testid="tab-leaders" onClick={() => navigate('/lideres', { replace: true })} />
            </main>
        </div>
    );
};

const mount = (entries: string[]) =>
    render(
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
            <PreferencesProvider>
                <Harness />
            </PreferencesProvider>
        </MemoryRouter>
    );

// Cada punto 50 ms después del anterior (la velocidad al soltar sale de ahí)
const touch = (target: Element, type: string, [x, y]: Point, t: number) => {
    const event = new Event(type, { bubbles: true, cancelable: type !== 'touchcancel' });
    const point = [{ clientX: x, clientY: y }];
    Object.defineProperty(event, 'touches', { value: type === 'touchend' || type === 'touchcancel' ? [] : point });
    Object.defineProperty(event, 'changedTouches', { value: point });
    Object.defineProperty(event, 'timeStamp', { value: t });
    target.dispatchEvent(event);
    return event;
};

type Point = [number, number];
const swipe = (target: Element, points: Point[]) => {
    touch(target, 'touchstart', points[0], 0);
    const moves = points.slice(1).map((point, index) => touch(target, 'touchmove', point, (index + 1) * 50));
    const end = touch(target, 'touchend', points[points.length - 1], points.length * 50);
    return { moves, end };
};
const right = (...xs: number[]): Point[] => xs.map((x, index) => [x, 200 + index]);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('useSwipeBack', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('deslizar a la derecha más de un tercio vuelve a la página de antes', async () => {
        mount(['/', '/juego/12345']);
        const { moves, end } = swipe(screen.getByTestId('path'), right(60, 66, 120, 300, 520));
        // Los primeros px no deciden; ya decidido, la página no se desplaza ni se abre el enlace al soltar
        expect(screen.getByTestId('backdrop').style.display).toBe('block');
        expect(moves[0].defaultPrevented).toBe(false);
        expect(moves[1].defaultPrevented).toBe(true);
        expect(end.defaultPrevented).toBe(true);
        await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/'));
        expect(screen.getByTestId('page').style.transform).toBe('');
        expect(screen.getByTestId('backdrop').style.display).toBe('');
    });

    it('soltar antes del umbral deja la página donde estaba', async () => {
        mount(['/', '/juego/12345']);
        const path = screen.getByTestId('path');
        touch(path, 'touchstart', [60, 200], 0);
        touch(path, 'touchmove', [80, 200], 50);
        touch(path, 'touchmove', [120, 200], 100);
        await waitFor(() => expect(screen.getByTestId('page').style.transform).toBe('translate3d(60px, 0, 0)'));
        touch(path, 'touchend', [120, 200], 150);
        await wait(400);
        expect(screen.getByTestId('page').style.transform).toBe('');
        expect(screen.getByTestId('backdrop').style.display).toBe('');
        expect(path.textContent).toBe('/juego/12345');
    });

    it('sin historial va a la página de respaldo', async () => {
        mount(['/jugador/12345678']);
        swipe(screen.getByTestId('path'), right(40, 60, 300, 600));
        await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/estadisticas'));
    });

    it('hacia arriba, hacia abajo o hacia la izquierda no vuelve (la página se desplaza)', async () => {
        mount(['/', '/juego/12345']);
        const path = screen.getByTestId('path');
        const gestures: Point[][] = [
            [[60, 400], [62, 385], [64, 300], [300, 280]],
            [[60, 200], [66, 214], [70, 260], [500, 260]],
            [[600, 200], [590, 200], [500, 200], [100, 200]]
        ];
        for (const points of gestures) expect(swipe(path, points).moves.some((event) => event.defaultPrevented)).toBe(false);
        await wait(300);
        expect(path.textContent).toBe('/juego/12345');
    });

    it('no empieza en lo marcado con data-no-swipe ni en las páginas de la barra', async () => {
        mount(['/', '/juego/12345']);
        const blocked = swipe(screen.getByTestId('marked'), right(60, 80, 300, 600));
        expect(blocked.moves.some((event) => event.defaultPrevented)).toBe(false);
        cleanup();
        mount(['/juego/12345', '/posiciones']);
        const root = swipe(screen.getByTestId('path'), right(60, 80, 300, 600));
        expect(root.moves.some((event) => event.defaultPrevented)).toBe(false);
        await wait(300);
        expect(screen.getByTestId('path').textContent).toBe('/posiciones');
    });

    it('Líderes abierto desde Posiciones vuelve a Posiciones', async () => {
        mount(['/', '/lideres']);
        swipe(screen.getByTestId('path'), right(40, 60, 300, 600));
        await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/posiciones'));
    });

    it('Estadísticas abierta con un enlace vuelve a esa página, también tras cambiar de pestaña', async () => {
        mount(['/fantasy']);
        fireEvent.click(screen.getByTestId('link-stats'));
        fireEvent.click(screen.getByTestId('tab-leaders'));
        expect(screen.getByTestId('path').textContent).toBe('/lideres');
        swipe(screen.getByTestId('path'), right(40, 60, 300, 600));
        await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/fantasy'));
    });

    it('sin animaciones la página no sigue al dedo, pero soltar pasado el umbral vuelve', async () => {
        vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
        mount(['/', '/juego/12345']);
        const path = screen.getByTestId('path');
        touch(path, 'touchstart', [60, 200], 0);
        expect(touch(path, 'touchmove', [80, 200], 50).defaultPrevented).toBe(true);
        touch(path, 'touchmove', [500, 200], 100);
        await wait(50);
        expect(screen.getByTestId('page').style.transform).toBe('');
        expect(screen.getByTestId('backdrop').style.display).toBe('');
        touch(path, 'touchend', [500, 200], 150);
        await waitFor(() => expect(path.textContent).toBe('/'));
    });
});
