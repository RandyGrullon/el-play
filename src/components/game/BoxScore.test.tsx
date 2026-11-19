import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { BoxScore } from './BoxScore';
import type { AtBat, GameDetail } from '../../types';

// Juego inventado: peloteros, equipos e ids de prueba
const batter = (id: number, name: string) => ({ id, name, pos: 'CF', sub: false, ab: 1, r: 0, h: 0, rbi: 0, bb: 0, k: 0, hr: 0, avg: '.250' });
const totals = { ab: 2, r: 0, h: 0, rbi: 0, bb: 0, k: 0, hr: 0, lob: null, avg: null };
const team = (id: number, abbrev: string, color: string) => ({ id, abbrev, name: `Equipo ${abbrev}`, color, logo: '' });
const box = (ids: [number, string][]) => ({ batters: ids.map(([id, name]) => batter(id, name)), pitchers: [], totals });

const makeGame = (over: Partial<GameDetail> = {}) =>
    ({
        state: 'live',
        inning: { n: 4, isTop: false, state: 'Bottom' },
        matchup: { batter: { id: 222, name: 'Bateador Casa' }, pitcher: { id: 111, name: 'Lanzador Visita' }, onDeck: null },
        atBats: [] as AtBat[],
        currentAtBat: null,
        linescore: [],
        dueUp: null,
        away: team(90001, 'VIS', '#aa1141'),
        home: team(90002, 'CAS', '#FDB927'),
        box: {
            away: box([[111, 'Lanzador Visita'], [112, 'Otro Visita']]),
            home: box([[221, 'Primero Casa'], [222, 'Bateador Casa']])
        },
        ...over
    }) as unknown as GameDetail;

const renderBox = (game: GameDetail) =>
    render(
        <MemoryRouter>
            <BoxScore game={game} />
        </MemoryRouter>
    );

describe('BoxScore', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
    });

    it('en vivo pinta del color de su equipo al que está al bate y le pone el bate', () => {
        renderBox(makeGame());
        const row = screen.getByText('Bateador Casa').closest('tr')!;
        expect(row.getAttribute('aria-current')).toBe('true');
        expect(row.style.backgroundColor).toBe('rgb(253, 185, 39)');
        // Amarillo claro: letra oscura para que se lea
        expect(row.style.color).toBe('rgb(20, 21, 26)');
        expect(row.querySelector('svg[aria-label="Al bate"]')).not.toBeNull();
        expect(screen.getByText('Primero Casa').closest('tr')!.getAttribute('aria-current')).toBeNull();
    });

    it('la pestaña del equipo que batea lleva el bate y en la otra no se resalta a nadie', () => {
        renderBox(makeGame());
        expect(screen.getByRole('radio', { name: /CAS/ }).querySelector('svg[aria-label="Al bate"]')).not.toBeNull();
        expect(screen.getByRole('radio', { name: /VIS/ }).querySelector('svg')).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: /VIS/ }));
        expect(document.querySelector('tr[aria-current]')).toBeNull();
    });

    it('un juego terminado no resalta a nadie', () => {
        renderBox(makeGame({ state: 'final' }));
        expect(document.querySelector('tr[aria-current]')).toBeNull();
        expect(document.querySelector('svg[aria-label="Al bate"]')).toBeNull();
    });
});
