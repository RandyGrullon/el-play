// Pantallas del Fantasy v2 con datos inventados: «Cómo se juega», el selector y las tarjetas del equipo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import i18n from '../../i18n';
import { HowToPlay } from './HowToPlay';
import { PlayerPicker } from './PlayerPicker';
import { TeamTab } from './TeamTab';
import { FantasyHelpContext } from './fantasyUi';
import { getStore, replaceStore, setStoreOwner, type DayEntry, type FantasyDay, type FantasyGame, type FantasyPlayer } from '../../lib/fantasy';
import { resetSaveStatus, saveEntry } from '../../lib/fantasySave';

const LIC = 12345601;
const TOR = 12345602;
const EST = 12345603;
const AGU = 12345604;
const TEAMS = {
    [LIC]: { id: LIC, abbrev: 'LIC', color: '#123456', logo: '' },
    [TOR]: { id: TOR, abbrev: 'TOR', color: '#654321', logo: '' },
    [EST]: { id: EST, abbrev: 'EST', color: '#abcdef', logo: '' },
    [AGU]: { id: AGU, abbrev: 'AGU', color: '#fedcba', logo: '' }
};
const side = (id: number) => ({ id, abbrev: TEAMS[id].abbrev, name: TEAMS[id].abbrev, color: TEAMS[id].color, logo: '', isWinner: false, score: null, probable: null });
const game = (gamePk: number, date: string, state: FantasyGame['state'], away: number, home: number, extra: Partial<FantasyGame> = {}) =>
    ({ gamePk, date, state, detailedState: 'Scheduled', startTimeTBD: false, away: side(away), home: side(home), live: null, ...extra }) as unknown as FantasyGame;
const player = (id: number, name: string, role: 'B' | 'P', teamId: number, gamePk: number, extra: Partial<FantasyPlayer> = {}): FantasyPlayer => ({
    id,
    name,
    teamId,
    gamePk,
    role,
    pos: role === 'P' ? 'P' : 'SS',
    starter: true,
    played: false,
    line: null,
    points: 0,
    price: 8,
    proj: 5,
    ...extra
});

// LIC @ TOR por empezar (lejos en el futuro: nada se cierra solo durante la prueba), EST @ AGU ya empezó y un pospuesto
const FUTURE = '2099-11-10T23:30:00Z';
const makeDay = (players: FantasyPlayer[], extra: Partial<FantasyDay> = {}): FantasyDay => ({
    league: 'lidom',
    date: '2099-11-10',
    games: [game(1, FUTURE, 'preview', LIC, TOR), game(2, '2026-11-10T19:00:00Z', 'live', EST, AGU), game(3, FUTURE, 'final', TOR, LIC, { status: 'postponed', detailedState: 'Postponed' })],
    teams: TEAMS,
    players,
    scoring: { batter: {}, pitcher: {} },
    credits: { budget: 50, min: 4, max: 12 },
    ...extra
});

const wrap = (node: React.ReactNode, openHelp: (topic?: string) => void = () => undefined) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <FantasyHelpContext.Provider value={openHelp as never}>{node}</FantasyHelpContext.Provider>
            </MemoryRouter>
        </QueryClientProvider>
    );
};

beforeEach(async () => {
    await i18n.changeLanguage('es');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    setStoreOwner('test-pantallas');
    replaceStore({});
    resetSaveStatus();
});
afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('el-play-fantasy-v1:test-pantallas');
    setStoreOwner(null);
});

describe('«Cómo se juega»', () => {
    it('pasos, puntos, ejemplos y preguntas con los números de rules', () => {
        const day = makeDay([], { rules: { perTeam: 3, budget: null, captain: 1.5, picks: { points: 10 }, roster: { batters: 5, pitchers: 1 } } });
        wrap(<HowToPlay day={day} onClose={() => undefined} />);
        const dialog = screen.getByRole('dialog', { name: 'Cómo se juega' });
        expect(within(dialog).getByText('Escoge 5 bateadores y 1 lanzador de los juegos del día.')).toBeTruthy();
        expect(within(dialog).getByText('Hoy no hay tope de créditos: escoge a quien quieras.')).toBeTruthy();
        expect(within(dialog).getByText('Nombra un capitán: sus puntos valen ×1,5.')).toBeTruthy();
        expect(within(dialog).getByText('Jonrón solitario: 10 + 2 (carrera) + 2 (impulsada) = 14. De capitán: 21.')).toBeTruthy();
        expect(within(dialog).getByText(/= 30\.$/)).toBeTruthy();
        expect(within(dialog).getByText('Golpeado')).toBeTruthy();
        // Acordeón: cerrado hasta tocarlo
        const question = within(dialog).getByRole('button', { name: '¿Cuántos puedo tener del mismo equipo?' });
        expect(question.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(question);
        expect(question.getAttribute('aria-expanded')).toBe('true');
        expect(within(dialog).getByText('Hasta 3. Los días con pocos juegos el tope sube.')).toBeTruthy();
    });

    it('un «?» la abre en su pregunta', () => {
        wrap(<HowToPlay day={makeDay([])} topic="captain" onClose={() => undefined} />);
        expect(screen.getByRole('button', { name: '¿Cómo funciona el capitán?' }).getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByText(/Sus puntos valen ×1,5, también los negativos/)).toBeTruthy();
    });
});

describe('selector de peloteros', () => {
    const players = () => [
        player(12345678, 'Pelotero Uno', 'B', LIC, 1, { proj: 9, price: 12, last5: [3, 8, -1, 12, 5], priceDelta: 0.5, opp: { id: TOR, abbrev: 'TOR', home: false } }),
        player(12345679, 'Pelotero Dos', 'B', TOR, 1, { proj: 6, price: 6, starter: false }),
        player(12345680, 'Pelotero Tres', 'B', EST, 2, { proj: 8 }),
        player(12345681, 'Pelotero Cuatro', 'B', TOR, 3, { status: 'postponed' }),
        player(12345682, 'Pelotero Cinco', 'P', LIC, 1, { season: { era: '3.12', whip: '1.10', k: 41, g: 8 } })
    ];

    it('dice cuántos faltan, filtra con «Disponibles» y explica por qué no se puede', () => {
        const day = makeDay(players());
        wrap(<PlayerPicker day={day} entry={{ lineup: [], captain: null, picks: {}, savedAt: 0 }} role="B" onClose={() => undefined} />);
        expect(screen.getByText('Te faltan 5 bateadores y 1 lanzador · 50 créditos')).toBeTruthy();
        const available = screen.getByRole('button', { name: 'Disponibles' });
        expect(available.getAttribute('aria-pressed')).toBe('true');
        // El de un juego empezado y el pospuesto no salen con «Disponibles»
        expect(screen.queryByText('Pelotero Tres')).toBeNull();
        expect(screen.queryByText('Pelotero Cuatro')).toBeNull();
        // Rival, estado, precio con la flecha y los últimos 5
        expect(screen.getByText('LIC @ TOR')).toBeTruthy();
        expect(screen.getAllByText('Esperado').length).toBeGreaterThan(0);
        expect(screen.getByLabelText('Cuesta 12 créditos. Subió 0,5 desde el último día de juego')).toBeTruthy();
        expect(screen.getByRole('img', { name: 'Últimos 5: 3, 8, -1, 12, 5' })).toBeTruthy();
        fireEvent.click(available);
        expect(screen.getByText('Su juego ya empezó')).toBeTruthy();
        expect(screen.getByText('Juego pospuesto')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Agregar a Pelotero Tres' }) as HTMLButtonElement).disabled).toBe(true);
        // Titulares: fuera el que no abrió el último juego
        fireEvent.click(screen.getByRole('button', { name: 'Titulares' }));
        expect(screen.queryByText('Pelotero Dos')).toBeNull();
    });

    it('ordena por precio y agrega con el botón de la fila', () => {
        const day = makeDay(players());
        wrap(<PlayerPicker day={day} entry={{ lineup: [], captain: null, picks: {}, savedAt: 0 }} role="B" onClose={() => undefined} />);
        fireEvent.click(screen.getByRole('radio', { name: 'Precio' }));
        const rows = screen.getAllByRole('button', { name: /^Agregar a/ }).map((button) => button.getAttribute('aria-label'));
        expect(rows[0]).toBe('Agregar a Pelotero Uno');
        fireEvent.click(screen.getByRole('button', { name: 'Agregar a Pelotero Dos' }));
        expect(getStore()['lidom:2099-11-10'].lineup).toEqual([12345679]);
    });

    it('lanzadores: su línea de la temporada', () => {
        wrap(<PlayerPicker day={makeDay(players())} entry={{ lineup: [], captain: null, picks: {}, savedAt: 0 }} role="P" onClose={() => undefined} />);
        expect(screen.getByText('3.12 EFE · 1.10 WHIP · 41 K')).toBeTruthy();
    });
});

describe('tarjetas de mi equipo', () => {
    it('hora de cierre, «Pospuesto: cámbialo», «No cuenta» y el estado del guardado', async () => {
        const list = [
            player(12345678, 'Pelotero Uno', 'B', LIC, 1, { price: 30 }),
            player(12345681, 'Pelotero Cuatro', 'B', TOR, 3, { status: 'postponed', price: 10 }),
            player(12345683, 'Pelotero Seis', 'B', AGU, 1, { price: 15 })
        ];
        const day = makeDay(list);
        // 55 de 50 créditos: el último que entró no cuenta
        const entry: DayEntry = { lineup: [12345678, 12345681, 12345683], captain: null, picks: {}, savedAt: 5 };
        replaceStore({ 'lidom:2099-11-10': entry });
        wrap(<TeamTab day={day} entry={entry} onPick={() => undefined} />);
        expect(screen.getAllByText(/^Cierra /).length).toBe(2);
        expect(screen.getByText('Pospuesto: cámbialo')).toBeTruthy();
        expect(screen.getByText('No cuenta: te pasaste del tope')).toBeTruthy();
        // El pospuesto se puede quitar aunque su juego «terminó»
        expect((screen.getByRole('button', { name: 'Quitar a Pelotero Cuatro' }) as HTMLButtonElement).disabled).toBe(false);
        expect(screen.getByText('Máx. 2 por equipo')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Ayuda sobre los créditos' })).toBeTruthy();
        await act(async () => {
            await saveEntry('lidom', '2099-11-10', entry, async () => null);
        });
        expect(screen.getByRole('status').textContent).toContain('Guardado');
    });
});
