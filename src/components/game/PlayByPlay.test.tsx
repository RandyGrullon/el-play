import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { PlayByPlay } from './PlayByPlay';
import type { AtBat, GameDetail } from '../../types';

// Juego inventado con un solo turno: peloteros e ids de prueba
const UNO = { id: 12345678, name: 'Pelotero Uno' };
const DOS = { id: 87654321, name: 'Pelotero Dos' };
const atBat = {
    i: 0,
    inning: 1,
    top: true,
    complete: true,
    scoring: true,
    batter: { ...UNO, side: 'R' },
    pitcher: { ...DOS, hand: 'R' },
    event: 'home_run',
    eventLabel: 'Home Run',
    desc: 'Pelotero Uno homers (1) on a fly ball to left field.',
    rbi: 1,
    away: 1,
    home: 0,
    outs: 0,
    pitches: [],
    actions: []
} as unknown as AtBat;
const side = (id: number, abbrev: string) => ({ id, abbrev, name: `Equipo ${abbrev}`, color: '#123456' });
const game = { atBats: [atBat], away: side(99991, 'UNO'), home: side(99992, 'DOS') } as unknown as GameDetail;

describe('PlayByPlay', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
    });

    it('la fila abre los pitcheos y los nombres de la jugada abren la página (sin enlaces dentro del botón)', () => {
        render(
            <MemoryRouter>
                <PlayByPlay game={game} />
            </MemoryRouter>
        );
        const batter = screen.getByRole('link', { name: 'Pelotero Uno' });
        expect(batter.getAttribute('href')).toBe('/jugador/12345678');
        expect(screen.getByRole('link', { name: 'UNO' }).getAttribute('href')).toBe('/equipo/99991');
        expect(document.querySelector('button a')).toBeNull();

        const row = document.querySelector('button[aria-expanded]')!;
        expect(row.getAttribute('aria-expanded')).toBe('false');
        // Tocar el nombre no abre la fila
        fireEvent.click(batter);
        expect(row.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(row);
        expect(document.querySelector('button[aria-expanded]')!.getAttribute('aria-expanded')).toBe('true');
        // Sin `replay` (animaciones apagadas o menos movimiento) no se ofrece repetir
        expect(screen.queryByRole('button', { name: 'Repetir la jugada' })).toBeNull();
    });

    it('repetir: ▶ solo en las jugadas con animación, la fila también la pide (y sigue abriendo) y apagado con el candado', () => {
        const error = { ...atBat, i: 1, event: 'field_error', eventLabel: 'Field Error', scoring: false, desc: 'Pelotero Dos reaches on a fielding error.' } as AtBat;
        const both = { ...game, atBats: [atBat, error] } as GameDetail;
        const calls: number[] = [];
        const view = (locked: boolean) => (
            <MemoryRouter>
                <PlayByPlay game={both} replay={{ locked, onReplay: (index) => calls.push(index) }} />
            </MemoryRouter>
        );
        const { rerender } = render(view(false));
        const replays = screen.getAllByRole('button', { name: 'Repetir la jugada' });
        expect(replays).toHaveLength(1);
        expect(replays[0].getAttribute('aria-disabled')).toBe('false');
        fireEvent.click(replays[0]);
        expect(calls).toEqual([0]);

        // La fila del jonrón repite y abre los pitcheos; la del error solo abre
        const rows = Array.from(document.querySelectorAll('button[aria-expanded]'));
        fireEvent.click(rows[1]);
        expect(calls).toEqual([0, 0]);
        expect(rows[1].getAttribute('aria-expanded')).toBe('true');
        fireEvent.click(rows[0]);
        expect(calls).toEqual([0, 0]);

        rerender(view(true));
        expect(screen.getByRole('button', { name: 'Repetir la jugada' }).getAttribute('aria-disabled')).toBe('true');
    });
});
