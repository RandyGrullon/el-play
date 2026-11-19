import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import i18n from '../../i18n';
import { RecentTotal } from './RecentTotal';
import { DEFAULT_RECENT, setRecentCount } from '../../lib/recentGames';
import type { HittingLine, PlayerDetail } from '../../lib/stats';

// Pelotero inventado: 12 juegos, del más nuevo al más viejo
const line = (h: number, ab: number, g = 1) => ({ g, h, ab }) as HittingLine;
const log = [
    [0, 4], [1, 3], [0, 2], [0, 3], [1, 3], [0, 2], [0, 3], [0, 2],
    [2, 4], [1, 4], [0, 3], [3, 5]
].map(([h, ab], index) => ({ gamePk: 1000 - index, hitting: line(h, ab) }));
const player = (over: Partial<PlayerDetail> = {}) =>
    ({ role: 'B', log, hitting: line(8, 38, 12), career: [{ hitting: line(8, 38, 12) }, { hitting: line(52, 200, 60) }], ...over }) as unknown as PlayerDetail;

const rows = () =>
    within(screen.getByRole('table'))
        .getAllByRole('row')
        .slice(1)
        .map((row) => Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent));

describe('RecentTotal', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
        window.localStorage.clear();
        setRecentCount(DEFAULT_RECENT);
    });

    it('los últimos 8, la temporada y la carrera: juegos, turnos, hits y promedio', () => {
        render(<RecentTotal player={player()} />);
        expect(rows()).toEqual([
            ['Últimos 8 juegos', '8', '22', '2', '.091'],
            ['Temporada', '12', '38', '8', '.211'],
            ['Carrera', '72', '238', '60', '.252']
        ]);
    });

    it('con − y + cambias cuántos juegos se miden', () => {
        render(<RecentTotal player={player()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Un juego más' }));
        expect(rows()[0]).toEqual(['Últimos 9 juegos', '9', '26', '4', '.154']);
        fireEvent.click(screen.getByRole('button', { name: 'Un juego menos' }));
        fireEvent.click(screen.getByRole('button', { name: 'Un juego menos' }));
        expect(rows()[0]).toEqual(['Últimos 7 juegos', '7', '20', '2', '.100']);
    });

    it('se puede escribir el número; más de los que jugó mide todos', () => {
        render(<RecentTotal player={player()} />);
        const input = screen.getByRole('spinbutton', { name: 'Cuántos juegos medir' });
        fireEvent.change(input, { target: { value: '3' } });
        expect(rows()[0]).toEqual(['Últimos 3 juegos', '3', '9', '1', '.111']);
        fireEvent.change(input, { target: { value: '1' } });
        expect(rows()[0]).toEqual(['Último juego', '1', '4', '0', '.000']);
        expect(screen.getByText('Último')).toBeTruthy();
        expect(screen.getByText('juego')).toBeTruthy();
        // Pide 40 y jugó 12: se miden los 12 y «Todos» queda marcado; igual que la temporada, esa fila no se repite
        fireEvent.change(input, { target: { value: '40' } });
        expect(screen.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');
        expect(rows().map((row) => row[0])).toEqual(['Temporada', 'Carrera']);
    });

    it('«Todos» mide la temporada entera y se recuerda para los demás peloteros', () => {
        const { unmount } = render(<RecentTotal player={player({ hitting: line(9, 40, 13) })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
        // La temporada trae un juego que no está en el juego a juego: sale aparte
        expect(rows()[0]).toEqual(['Sus 12 juegos', '12', '38', '8', '.211']);
        unmount();
        act(() => undefined);
        render(<RecentTotal player={player({ career: [] })} />);
        expect(screen.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');
        expect(rows().map((row) => row[0])).toEqual(['Temporada']);
    });
});
