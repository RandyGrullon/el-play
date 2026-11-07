import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../i18n';
import { PreferencesProvider } from '../../store/preferences';
import { SprayChart } from './SprayChart';
import type { AtBat, GameDetail, GameTeam, Pitch } from '../../types';

// Juego inventado: equipos, peloteros e ids de prueba
const team = (id: number, name: string, abbrev: string): GameTeam => ({ id, name, teamName: name, abbrev, logo: '', color: '#123456', record: null, runs: 0, hits: 0, errors: 0, lob: 0, isWinner: false });
// Gameday: 2,5 pies por unidad, home en 125.42, 198.27
const at = (deg: number, feet: number) => ({ x: 125.42 + (Math.sin((deg * Math.PI) / 180) * feet) / 2.5, y: 198.27 - (Math.cos((deg * Math.PI) / 180) * feet) / 2.5 });
const pitch = (deg: number, feet: number, traj: string, ev: number | null): Pitch =>
    ({ n: 1, x: null, z: null, top: null, bot: null, r: 'inplay', code: 'X', call: '', type: 'SL', typeDesc: 'Slider', mph: 86, spin: null, zone: null, b: 0, s: 0, hit: { ev, la: null, dist: null, ...at(deg, feet), traj, hard: null } }) as Pitch;
const atBat = (i: number, top: boolean, batter: { id: number; name: string }, event: string, eventLabel: string, hit: Pitch): AtBat =>
    ({ i, inning: i + 1, top, complete: true, scoring: false, batter: { ...batter, side: 'R' }, pitcher: { id: 87654321, name: 'Lanzador Uno', hand: 'R' }, event, eventLabel, desc: '', rbi: 0, away: 0, home: 0, outs: 0, pitches: [hit], actions: [] }) as unknown as AtBat;
const UNO = { id: 12345678, name: 'Pelotero Uno' };
const DOS = { id: 12345679, name: 'Pelotero Dos' };
const TRES = { id: 12345680, name: 'Pelotero Tres' };
const game = {
    gamePk: 123456,
    venue: 'Estadio de Prueba',
    away: team(99991, 'Equipo Uno', 'UNO'),
    home: team(99992, 'Equipo Dos', 'DOS'),
    atBats: [
        atBat(0, true, UNO, 'home_run', 'Home Run', pitch(0, 380, 'fly_ball', 106)),
        atBat(1, false, DOS, 'single', 'Single', pitch(-30, 160, 'ground_ball', 92)),
        atBat(2, true, TRES, 'field_out', 'Flyout', pitch(20, 250, 'fly_ball', 88)),
        atBat(3, false, DOS, 'field_out', 'Groundout', pitch(5, 80, 'ground_ball', 80))
    ]
} as unknown as GameDetail;

const renderChart = () =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <PreferencesProvider>
                <MemoryRouter>
                    <SprayChart game={game} />
                </MemoryRouter>
            </PreferencesProvider>
        </QueryClientProvider>
    );
const hits = (root: ParentNode = document) => root.querySelectorAll('[data-hit]').length;
const card = () => document.querySelector('section') as HTMLElement;

describe('mapa de batazos', () => {
    beforeEach(() => {
        i18n.changeLanguage('es');
    });

    it('los filtros de tipo son radios «Tipo: …» y se combinan con el equipo', () => {
        renderChart();
        expect(hits()).toBe(4);
        expect(screen.getByRole('radiogroup', { name: 'Tipo' })).toBeTruthy();
        expect(screen.getByRole('radio', { name: 'Tipo: Todo' }).getAttribute('aria-checked')).toBe('true');
        fireEvent.click(screen.getByRole('radio', { name: 'Tipo: Rodado' }));
        expect(screen.getByRole('radio', { name: 'Tipo: Rodado' }).getAttribute('aria-checked')).toBe('true');
        expect(hits()).toBe(2);
        fireEvent.click(screen.getByRole('radio', { name: 'Resultado: Hits' }));
        expect(hits()).toBe(1);
        fireEvent.click(screen.getByRole('radio', { name: 'Equipo: Equipo Uno' }));
        expect(hits()).toBe(0);
        expect(screen.getByText('Ningún batazo con estos filtros')).toBeTruthy();
    });

    it('el bateador se escoge en la hoja, se quita con la X y se va al cambiar a otro equipo', () => {
        renderChart();
        fireEvent.click(screen.getByRole('button', { name: 'Escoge un bateador' }));
        const sheet = screen.getByRole('dialog', { name: 'Escoge un bateador' });
        const rows = within(sheet).getAllByRole('button', { pressed: false });
        expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['Pelotero Tres, UNO, 1 batazo', 'Pelotero Uno, UNO, 1 batazo', 'Pelotero Dos, DOS, 2 batazos']);
        fireEvent.click(within(sheet).getByRole('button', { name: 'Pelotero Dos, DOS, 2 batazos' }));
        expect(screen.queryByRole('dialog', { name: 'Escoge un bateador' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Bateador: Pelotero Dos' }).textContent).toBe('Pelotero Dos');
        expect(hits()).toBe(2);
        fireEvent.click(screen.getByRole('button', { name: 'Quitar el bateador' }));
        expect(hits()).toBe(4);

        // Con el equipo local la hoja solo trae a los suyos; al pasar al visitante se quita
        fireEvent.click(screen.getByRole('radio', { name: 'Equipo: Equipo Dos' }));
        fireEvent.click(screen.getByRole('button', { name: 'Escoge un bateador' }));
        expect(within(screen.getByRole('dialog', { name: 'Escoge un bateador' })).getAllByRole('button', { name: /batazo/ })).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Pelotero Dos, DOS, 2 batazos' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Equipo: Equipo Uno' }));
        expect(screen.getByRole('button', { name: 'Escoge un bateador' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Quitar el bateador' })).toBeNull();
        expect(hits()).toBe(2);
    });

    it('la marca se toca por encima de los vuelos y abre la ficha', () => {
        renderChart();
        const path = document.querySelector('[data-path]')!;
        expect(path.closest('[pointer-events="none"]')).not.toBeNull();
        const hr = screen.getByRole('button', { name: /Jonrón · (Alta|Baja)/ });
        expect(hr.tagName.toLowerCase()).toBe('circle');
        expect(hr.closest('[pointer-events="none"]')).toBeNull();
        // Los círculos que se tocan van después (encima) de todo el dibujo de las bolas
        expect(path.compareDocumentPosition(hr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        fireEvent.click(hr);
        expect(hr.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Batazo siguiente' })).toBeTruthy();
    });

    it('Zonas y Calor llevan la escala de menos a más', () => {
        renderChart();
        expect(screen.queryByText('Menos')).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: 'Zonas' }));
        expect(screen.getByText('Menos')).toBeTruthy();
        expect(screen.getByText('Más')).toBeTruthy();
        expect(screen.getByRole('group', { name: 'Zonas con 4 batazos' })).toBeTruthy();
        fireEvent.click(screen.getByRole('radio', { name: 'Calor' }));
        expect(screen.getByText('Menos')).toBeTruthy();
        expect(screen.getByRole('group', { name: 'Mapa de calor con 4 batazos' })).toBeTruthy();
    });

    it('«Ampliar» abre la pantalla completa con los mismos filtros y se cierra con Escape, la X o «atrás»', async () => {
        renderChart();
        fireEvent.click(screen.getByRole('radio', { name: 'Tipo: Elevado' }));
        const expand = screen.getByRole('button', { name: 'Ampliar' });
        expand.focus();
        fireEvent.click(expand);
        const dialog = screen.getByRole('dialog', { name: 'Mapa de batazos' });
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(window.history.state?.elPlaySpray).toBeTruthy();
        const close = within(dialog).getByRole('button', { name: 'Cerrar' });
        expect(document.activeElement).toBe(close);
        // Mismo estado que la tarjeta
        expect(within(dialog).getByRole('radio', { name: 'Tipo: Elevado' }).getAttribute('aria-checked')).toBe('true');
        expect(hits(dialog)).toBe(2);
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Tipo: Rodado' }));
        expect(within(card()).getByRole('radio', { name: 'Tipo: Rodado' }).getAttribute('aria-checked')).toBe('true');
        // El foco no sale del diálogo
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(dialog.contains(document.activeElement)).toBe(true);

        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mapa de batazos' })).toBeNull());
        expect(document.activeElement).toBe(expand);

        fireEvent.click(screen.getByRole('button', { name: 'Ampliar' }));
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Mapa de batazos' })).getByRole('button', { name: 'Cerrar' }));
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mapa de batazos' })).toBeNull());

        fireEvent.click(screen.getByRole('button', { name: 'Ampliar' }));
        expect(screen.getByRole('dialog', { name: 'Mapa de batazos' })).toBeTruthy();
        window.history.back();
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mapa de batazos' })).toBeNull());
    });
});
