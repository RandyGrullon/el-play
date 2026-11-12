import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { Timeline, type TimelineReplay } from './Timeline';
import type { AtBat, GameDetail, Pitch } from '../../types';

// Cronología con repetición: juego, equipos y peloteros inventados (ids de prueba)
const JUAN = { id: 12345678, name: 'Juan Prueba' };
const PEDRO = { id: 87654321, name: 'Pedro Prueba' };

const ab = (i: number, event: string | null, extra: Partial<AtBat> = {}): AtBat => ({
    i,
    inning: 1,
    top: true,
    complete: event !== null,
    scoring: false,
    batter: { ...JUAN, side: 'R' },
    pitcher: { ...PEDRO, hand: 'R' },
    event,
    eventLabel: null,
    desc: '',
    rbi: 0,
    away: 0,
    home: 0,
    outs: 0,
    pitches: [],
    actions: [],
    ...extra
});

const pitch = (n: number): Pitch => ({ n, x: null, z: null, top: null, bot: null, r: 'ball', code: 'B', call: 'Ball', type: null, typeDesc: null, mph: null, spin: null, zone: null, b: null, s: null });

const side = (id: number, abbrev: string) => ({ id, abbrev, name: `Equipo ${abbrev}`, logo: '', color: '#123456', record: null, teamName: abbrev, runs: 0, hits: 0, errors: 0, lob: 0, isWinner: false });

// Jonrón (se anima), selección (no se anima) y sencillo con un cambio defensivo (no sale en la cronología), una visita
// al montículo (sale, pero no se anima) y un robo (sí): el robo es la acción 2 del turno aunque sea la 2.ª que se ve
const homeRun = ab(0, 'home_run', { eventLabel: 'Home Run', desc: 'Juan Prueba homers (1) on a fly ball to left field.', scoring: true, rbi: 1, away: 1, post: 0 });
const choice = ab(1, 'fielders_choice', { eventLabel: 'Fielders Choice', desc: "Pedro Prueba reaches on a fielder's choice.", away: 1, batter: { ...PEDRO, side: 'L' }, pitcher: { ...JUAN, hand: 'R' } });
const single = ab(2, 'single', {
    eventLabel: 'Single',
    desc: 'Juan Prueba singles on a line drive to center field.',
    away: 1,
    actions: [
        { event: 'defensive_switch', desc: 'Defensive switch from left field to right field.' },
        { event: 'mound_visit', desc: 'Mound Visit.' },
        { event: 'stolen_base_2b', desc: 'Juan Prueba steals (1) 2nd base.' }
    ]
});

const game = (atBats: AtBat[], extra: Partial<GameDetail> = {}) =>
    ({
        gamePk: 12345678,
        state: 'final',
        scheduledInnings: 9,
        league: 'lidom',
        venue: 'Estadio de Prueba',
        currentAtBat: null,
        atBats,
        away: side(99991, 'AAA'),
        home: side(99992, 'BBB'),
        ...extra
    }) as unknown as GameDetail;

const HINT = 'Toca una jugada para verla otra vez';
const label = (play: string) => `Ver la jugada otra vez: ${play}`;
const replayButtons = () => screen.queryAllByRole('button', { name: /^Ver la jugada otra vez: / });

const view = (detail: GameDetail, replay?: TimelineReplay) => (
    <MemoryRouter>
        <Timeline game={detail} replay={replay} />
    </MemoryRouter>
);

describe('Timeline: tocar una jugada la repite', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
    });

    it('la burbuja de una jugada con animación pide la repetición de su turno; la acción del robo, la de esa acción', () => {
        const calls: [number, number | undefined][] = [];
        render(view(game([homeRun, choice, single]), { locked: false, onReplay: (atBat, action) => calls.push([atBat, action]) }));

        // Solo lo que se anima: el jonrón, el sencillo y el robo (no la selección ni la visita al montículo)
        expect(replayButtons().map((button) => button.getAttribute('aria-label'))).toEqual([label('Sencillo'), label('Robo'), label('Jonrón')]);
        expect(screen.queryByRole('button', { name: label('Selección') })).toBeNull();
        expect(screen.queryByRole('button', { name: label('Visita al montículo') })).toBeNull();
        // La visita al montículo sigue en la cronología, solo que no se toca
        expect(screen.getByText('Visita al montículo')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: label('Jonrón') }));
        expect(calls).toEqual([[0, undefined]]);
        fireEvent.click(screen.getByRole('button', { name: label('Sencillo') }));
        expect(calls).toEqual([
            [0, undefined],
            [2, undefined]
        ]);
        // El robo es la acción 2 del turno 2 (su lugar en el turno, no entre las que se ven)
        fireEvent.click(screen.getByRole('button', { name: label('Robo') }));
        expect(calls).toEqual([
            [0, undefined],
            [2, undefined],
            [2, 2]
        ]);
    });

    it('con algo que repetir sale el aviso; sin nada que se anime, no', () => {
        const replay: TimelineReplay = { locked: false, onReplay: () => undefined };
        const { unmount } = render(view(game([homeRun, choice]), replay));
        expect(screen.getByText(HINT)).toBeTruthy();
        unmount();

        render(view(game([choice]), replay));
        expect(screen.queryByText(HINT)).toBeNull();
        expect(replayButtons()).toHaveLength(0);
    });

    it('sin `replay` no hay nada que tocar (ni botones ni aviso), pero las jugadas y los enlaces siguen', () => {
        render(view(game([homeRun, choice, single])));
        expect(replayButtons()).toHaveLength(0);
        expect(screen.queryAllByRole('button')).toHaveLength(0);
        expect(screen.queryByText(HINT)).toBeNull();
        expect(screen.getAllByRole('link', { name: 'Juan Prueba' }).length).toBeGreaterThan(0);
        expect(screen.getByRole('link', { name: 'AAA' }).getAttribute('href')).toBe('/equipo/99991');
    });

    it('los nombres y los equipos de la burbuja siguen siendo enlaces (fuera del botón) y tocarlos no repite la jugada', () => {
        const calls: number[] = [];
        render(view(game([homeRun]), { locked: false, onReplay: (atBat) => calls.push(atBat) }));
        const batter = screen.getByRole('link', { name: 'Juan Prueba' });
        expect(batter.getAttribute('href')).toBe('/jugador/12345678');
        expect(screen.getByRole('link', { name: 'AAA' }).getAttribute('href')).toBe('/equipo/99991');
        expect(screen.getByRole('link', { name: 'BBB' }).getAttribute('href')).toBe('/equipo/99992');
        // El botón cubre la burbuja sin envolver los enlaces
        expect(document.querySelector('button a')).toBeNull();
        expect(screen.getByRole('button', { name: label('Jonrón') }).childElementCount).toBe(0);
        fireEvent.click(batter);
        fireEvent.click(screen.getByRole('link', { name: 'AAA' }));
        expect(calls).toEqual([]);
    });

    it('con el candado puesto los botones quedan marcados como apagados', () => {
        const replay = (locked: boolean): TimelineReplay => ({ locked, onReplay: () => undefined });
        const { rerender } = render(view(game([homeRun, single]), replay(false)));
        expect(replayButtons().map((button) => button.getAttribute('aria-disabled'))).toEqual(['false', 'false', 'false']);
        rerender(view(game([homeRun, single]), replay(true)));
        expect(replayButtons().map((button) => button.getAttribute('aria-disabled'))).toEqual(['true', 'true', 'true']);
    });

    it('el turno en curso: su robo se puede repetir (turno y acción); el turno en sí todavía no', () => {
        const calls: [number, number | undefined][] = [];
        const current = ab(3, null, {
            pitches: [pitch(1), pitch(2)],
            actions: [
                { event: 'defensive_switch', desc: 'Defensive switch from left field to right field.', at: 0 },
                { event: 'stolen_base_3b', desc: 'Juan Prueba steals (2) 3rd base.', at: 1 }
            ]
        });
        const live = game([homeRun, current], { state: 'live', currentAtBat: 3 } as Partial<GameDetail>);
        render(view(live, { locked: false, onReplay: (atBat, action) => calls.push([atBat, action]) }));
        expect(replayButtons().map((button) => button.getAttribute('aria-label'))).toEqual([label('Robo'), label('Jonrón')]);
        fireEvent.click(screen.getByRole('button', { name: label('Robo') }));
        expect(calls).toEqual([[3, 1]]);
    });
});
