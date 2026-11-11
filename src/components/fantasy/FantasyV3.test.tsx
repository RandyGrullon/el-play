// Pantallas del Fantasy v3 con datos inventados: copiar el equipo de ayer y deshacer, las ideas del día (con la razón
// cuando no se puede agregar), Mi temporada (con el respaldo de los logros), la tabla por semana, la guía para empezar
// y las herramientas del dueño de una liga.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import i18n from '../../i18n';
import { IdeasSection } from './IdeasSection';
import { QuickActions } from './QuickActions';
import { SeasonView } from './SeasonView';
import { LeagueOwnerTools, LeagueWeeks } from './LeagueWeeks';
import { FirstTimeGuide } from './FirstTimeGuide';
import { FantasyHelpContext } from './fantasyUi';
import { getStore, replaceStore, resetUndo, setStoreOwner, useEntry, type DayEntry, type FantasyDay, type FantasyGame, type FantasyPlayer } from '../../lib/fantasy';
import { guideDismissed, resetGuide } from '../../lib/fantasyGuide';
import { resetOwnerTools } from '../../lib/fantasyLeagues';
import { hideToast, useToast } from '../../lib/toast';
import type { FanDay, FanProfileData } from '../../lib/fans';

const LIC = 12345601;
const TOR = 12345602;
const EST = 12345603;
const AGU = 12345604;
const TEAMS: FantasyDay['teams'] = {
    [LIC]: { id: LIC, abbrev: 'LIC', color: '#123456', logo: '' },
    [TOR]: { id: TOR, abbrev: 'TOR', color: '#654321', logo: '' },
    [EST]: { id: EST, abbrev: 'EST', color: '#abcdef', logo: '' },
    [AGU]: { id: AGU, abbrev: 'AGU', color: '#fedcba', logo: '' }
};
const side = (id: number) => ({ id, abbrev: TEAMS[id].abbrev, name: TEAMS[id].abbrev, color: TEAMS[id].color, logo: '', isWinner: false, score: null, probable: null });
const game = (gamePk: number, date: string, state: FantasyGame['state'], away: number, home: number) =>
    ({ gamePk, date, state, detailedState: 'Scheduled', startTimeTBD: false, away: side(away), home: side(home), live: null }) as unknown as FantasyGame;
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
    price: 10,
    proj: 6,
    ...extra
});

const FUTURE = '2099-11-10T23:30:00Z';
const UNO = 12345678;
const DOS = 12345679;
const TRES = 12345680;
const CUATRO = 12345681;
const VIEJO = 12345699;
const DAY: FantasyDay = {
    league: 'lidom',
    date: '2099-11-10',
    games: [game(1, FUTURE, 'preview', LIC, TOR), game(2, '2026-11-10T19:00:00Z', 'live', EST, AGU)],
    teams: TEAMS,
    players: [
        player(UNO, 'Pelotero Uno', 'B', LIC, 1, { opp: { id: TOR, abbrev: 'TOR', home: false } }),
        player(DOS, 'Pelotero Dos', 'B', LIC, 1),
        player(TRES, 'Pelotero Tres', 'B', LIC, 1),
        player(CUATRO, 'Pelotero Cuatro', 'B', EST, 2),
        player(12345683, 'Pelotero Seis', 'P', TOR, 1, { price: 8 })
    ],
    scoring: { batter: {}, pitcher: {} },
    credits: { budget: 50, min: 4, max: 12 }
};
const KEY = 'lidom:2099-11-10';
const OWNER = '00000000-0000-4000-8000-0000000000a1';
const BETO = '00000000-0000-4000-8000-0000000000a2';
const CARLA = '00000000-0000-4000-8000-0000000000a3';

type Route = (url: string) => unknown;
/** fetch inventado: cada ruta responde lo suyo; lo demás, 404 */
const stubFetch = (route: Route) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const body = route(String(input));
        return body === undefined ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => body };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

/** Muestra el aviso de abajo (showToast) para poder leerlo */
const ToastProbe: React.FC = () => {
    const toast = useToast();
    return toast ? (
        <div data-testid="toast">
            {toast.text}
            {toast.action && (
                <button type="button" onClick={toast.action.run}>
                    {toast.action.label}
                </button>
            )}
        </div>
    ) : null;
};

const wrap = (node: React.ReactNode, openHelp: () => void = () => undefined) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <FantasyHelpContext.Provider value={openHelp}>
                    {node}
                    <ToastProbe />
                </FantasyHelpContext.Provider>
            </MemoryRouter>
        </QueryClientProvider>
    );
};

/** Mi equipo de verdad: lo que hay en el teléfono para ese día */
const Live: React.FC<{ render: (entry: DayEntry) => React.ReactNode }> = ({ render: draw }) => <>{draw(useEntry('lidom', DAY.date))}</>;

beforeEach(async () => {
    await i18n.changeLanguage('es');
    stubFetch(() => undefined);
    setStoreOwner('test-v3-pantallas');
    replaceStore({});
    resetUndo();
    resetGuide();
    resetOwnerTools();
    hideToast();
    localStorage.removeItem('el-play-fantasy-ideas-closed');
});
afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('el-play-fantasy-v1:test-v3-pantallas');
    setStoreOwner(null);
});

// ---------------------------------------------------------------- acciones rápidas

describe('copiar mi equipo de ayer y deshacer', () => {
    it('copia lo que se puede, dice lo que no y se deshace', async () => {
        const fetchMock = stubFetch((url) => (url.includes('date=2099-11-09') ? { ...DAY, date: '2099-11-09', players: [...DAY.players, player(VIEJO, 'Pelotero Viejo', 'B', AGU, 9)] } : undefined));
        replaceStore({ 'lidom:2099-11-09': { lineup: [UNO, DOS, TRES, CUATRO, VIEJO], captain: DOS, picks: {}, savedAt: 1 } });
        wrap(<Live render={(entry) => <QuickActions day={DAY} entry={entry} now={Date.now()} />} />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('date=2099-11-09'), expect.anything()));
        // Que llegue el día de ayer (de ahí salen los nombres de los que hoy no juegan)
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
        fireEvent.click(screen.getByRole('button', { name: 'Copiar mi equipo de ayer' }));
        expect(getStore()[KEY]).toMatchObject({ lineup: [UNO, DOS], captain: DOS });
        expect(screen.getByTestId('toast').textContent).toContain(
            'Copiamos 2 peloteros y tu capitán. No se pudo: Pelotero Tres (ya tienes 2 de LIC), Pelotero Cuatro (su juego ya empezó), Pelotero Viejo (no juega hoy).'
        );
        fireEvent.click(screen.getByRole('button', { name: 'Deshacer: copiar el equipo de ayer' }));
        expect(getStore()[KEY]).toMatchObject({ lineup: [], captain: null });
        expect(screen.getByTestId('toast').textContent).toBe('Listo: deshicimos el último cambio.');
        // Ya no hay nada que deshacer y el botón de copiar vuelve
        expect(screen.queryByRole('button', { name: /^Deshacer/ })).toBeNull();
        expect(screen.getByRole('button', { name: 'Copiar mi equipo de ayer' })).toBeTruthy();
    });

    it('sin equipo de ayer ni nada que deshacer no sale nada', () => {
        const { container } = wrap(<QuickActions day={DAY} entry={{ lineup: [], captain: null, picks: {}, savedAt: 0 }} now={Date.now()} />);
        expect(container.querySelector('[role="group"]')).toBeNull();
    });
});

// ---------------------------------------------------------------- ideas

const TRENDS = {
    date: '2099-11-10',
    hot: [{ id: UNO, name: 'Pelotero Uno', teamId: LIC, role: 'B', price: 10, proj: 6, last5: [8, 12, 4, 15, 9], avg: 9.6 }],
    bargains: [{ id: TRES, name: 'Pelotero Tres', teamId: LIC, role: 'B', price: 6, proj: 9, value: 1.5 }],
    risers: [{ id: CUATRO, name: 'Pelotero Cuatro', teamId: EST, role: 'B', price: 10, priceDelta: 1 }],
    fallers: [{ id: VIEJO, name: 'Pelotero Viejo', teamId: AGU, role: 'B', price: 5, priceDelta: -1.5 }],
    pitchers: [{ id: 12345683, name: 'Pelotero Seis', teamId: TOR, role: 'P', price: 8, proj: 12, matchup: { oppOps: '.640', edge: 'good' } }],
    popular: []
};

describe('ideas para hoy', () => {
    it('carruseles con su número, la razón cuando no se puede y «Agregar» que mete al pelotero', async () => {
        stubFetch((url) => (url.includes('/api/v2/fantasy/trends?league=lidom&date=2099-11-10') ? TRENDS : undefined));
        replaceStore({ [KEY]: { lineup: [DOS], captain: null, picks: {}, savedAt: 1 } });
        wrap(<Live render={(entry) => <IdeasSection day={DAY} entry={entry} now={Date.now()} />} />);
        const toggle = await screen.findByRole('button', { name: 'Ideas para hoy' });
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        for (const name of ['En racha', 'Gangas', 'Suben de precio', 'Bajan de precio', 'Lanzadores con mejor duelo']) expect(screen.getByRole('heading', { name })).toBeTruthy();
        // Lista vacía (nadie ayer): no sale
        expect(screen.queryByRole('heading', { name: 'Los más elegidos ayer' })).toBeNull();
        expect(screen.getByText('Prom. 9,6')).toBeTruthy();
        expect(screen.getByText('1,50 pts/crédito')).toBeTruthy();
        expect(screen.getByText('Duelo fácil')).toBeTruthy();
        // La misma razón del selector; uno que ya no está en el día: «No juega hoy»
        expect(screen.getByText('Su juego ya empezó')).toBeTruthy();
        expect(screen.getByText('No juega hoy')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Agregar a Pelotero Cuatro' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Agregar a Pelotero Uno' }));
        expect(getStore()[KEY].lineup).toEqual([DOS, UNO]);
        expect(screen.getByTestId('toast').textContent).toBe('Pelotero Uno entró a tu equipo');
        expect(screen.getByText('En tu equipo')).toBeTruthy();
        // Ya hay 2 de LIC: el tercero no se puede
        expect(screen.getByText('Ya tienes 2 de LIC')).toBeTruthy();
        // Se pliega y se acuerda
        fireEvent.click(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(localStorage.getItem('el-play-fantasy-ideas-closed')).toBe('1');
    });

    it('sin el servidor nuevo (404) la sección no sale', async () => {
        const fetchMock = stubFetch(() => undefined);
        wrap(<IdeasSection day={DAY} entry={{ lineup: [], captain: null, picks: {}, savedAt: 0 }} now={Date.now()} />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/trends'), expect.anything()));
        await act(async () => undefined);
        expect(screen.queryByText('Ideas para hoy')).toBeNull();
    });
});

// ---------------------------------------------------------------- mi temporada

const fanDay = (date: string, total: number): FanDay => ({ date, final: true, live: false, team: total, picks: 0, total, lineup: [UNO], captain: null, picksMade: 0 });
const DAYS = Array.from({ length: 12 }, (_, i) => fanDay(`2099-11-${String(12 - i).padStart(2, '0')}`, i === 3 ? 60 : 43.6));
const PROFILE: FanProfileData = { userId: OWNER, league: 'lidom', name: 'Fanático Prueba', season: { points: 540, days: 12, best: { date: '2099-11-09', points: 60 } }, days: DAYS };

const STATS = {
    userId: OWNER,
    league: 'lidom',
    season: 2099,
    days: [
        { date: '2099-11-08', team: 40, picks: 10, total: 50, rank: 3, players: 45 },
        { date: '2099-11-09', team: 70, picks: 20, total: 90, rank: 1, players: 40 }
    ],
    totals: { days: 2, total: 140, avg: 70, median: 70, best: { date: '2099-11-09', total: 90 }, worst: { date: '2099-11-08', total: 50 } },
    streak: { current: 2, longest: 2 },
    captain: { days: 2, avg: 15, bonus: 11.5, best: { id: UNO, name: 'Pelotero Uno', points: 22.5, date: '2099-11-09' } },
    picks: { made: 5, hits: 3, pct: 60 },
    players: [{ id: UNO, name: 'Pelotero Uno', teamId: LIC, role: 'B', days: 2, points: 37 }],
    achievements: [
        { id: 'firstTeam', unlockedAt: '2099-11-08', progress: null },
        { id: 'days10', unlockedAt: null, progress: { value: 2, goal: 10 } },
        { id: 'algoNuevo', unlockedAt: null, progress: null }
    ]
};

describe('mi temporada', () => {
    it('del servidor: números, gráfica con el puesto, capitán, pronósticos, peloteros y logros', async () => {
        stubFetch((url) => (url.includes(`/api/v2/fantasy/fan/${OWNER}/stats?league=lidom`) ? STATS : url === '/api/v2/fantasy?league=lidom' ? DAY : undefined));
        wrap(<SeasonView userId={OWNER} league="lidom" own={false} />);
        expect(await screen.findByText('Días jugados')).toBeTruthy();
        expect(screen.getByRole('img', { name: 'Puntos de 2 días. Mejor día: 90 pts' })).toBeTruthy();
        const rank = screen.getByRole('button', { name: 'Ver su puesto' });
        fireEvent.click(rank);
        expect(rank.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByText('Puesto del día (el 1 arriba)')).toBeTruthy();
        const captain = screen.getByRole('region', { name: 'Capitán' });
        expect(within(captain).getByText('+11,5')).toBeTruthy();
        expect(within(captain).getByRole('link', { name: 'Pelotero Uno' }).getAttribute('href')).toBe(`/jugador/${UNO}`);
        expect(screen.getByRole('meter', { name: '3 de 5 (60 %)' })).toBeTruthy();
        const used = screen.getByRole('region', { name: 'Los que más usó' });
        // Las siglas salen del día de hoy (ya en la caché de la página)
        expect((await within(used).findByRole('link', { name: 'LIC' })).getAttribute('href')).toBe(`/equipo/${LIC}`);
        // Los logros del servidor (el que el cliente no conoce no sale)
        const gallery = screen.getByRole('region', { name: 'Logros' });
        expect(within(gallery).getByText(/Logros · 1 de 2/)).toBeTruthy();
        expect(within(gallery).getByText('2 de 10')).toBeTruthy();
    });

    it('sin el servidor nuevo: la temporada del perfil y los logros con el cálculo de antes', async () => {
        stubFetch(() => undefined);
        wrap(<SeasonView userId={OWNER} league="lidom" own={false} profile={PROFILE} />);
        expect(await screen.findByText('Faltan algunos números de la temporada: vuelve en un ratito.')).toBeTruthy();
        expect(screen.getByText('Promedio')).toBeTruthy();
        expect(screen.queryByRole('region', { name: 'Capitán' })).toBeNull();
        const gallery = screen.getByRole('region', { name: 'Logros' });
        expect(within(gallery).getByText(/Logros · 6 de 8/)).toBeTruthy();
        expect(within(gallery).getByText('10 días')).toBeTruthy();
        expect(within(gallery).getAllByText('Desbloqueado')).toHaveLength(6);
    });

    it('fanático nuevo: la temporada vacía con «Armar mi equipo»', async () => {
        stubFetch((url) => (url.includes('/stats') ? { ...STATS, days: [], totals: { days: 0, total: 0, avg: 0, median: 0, best: null, worst: null }, achievements: [] } : undefined));
        const onBuild = vi.fn();
        wrap(<SeasonView userId={OWNER} league="lidom" own onBuild={onBuild} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Armar mi equipo' }));
        expect(onBuild).toHaveBeenCalled();
        expect(screen.getByText(/Todavía no tienes temporada/)).toBeTruthy();
    });
});

// ---------------------------------------------------------------- semana de una liga

const WEEKS = {
    league: 'lidom',
    weeks: [
        // Llegan en cualquier orden: se muestran de la más nueva a la más vieja
        { start: '2099-10-26', end: '2099-11-01', rows: [{ userId: CARLA, total: 280, days: 6, rank: 1 }], champion: CARLA },
        {
            start: '2099-11-09',
            end: '2099-11-15',
            rows: [
                { userId: OWNER, total: 95.5, days: 2, rank: 1 },
                { userId: BETO, total: 40, days: 1, rank: 2 },
                { userId: CARLA, total: 0, days: 0, rank: 3 }
            ],
            champion: null
        },
        {
            start: '2099-11-02',
            end: '2099-11-08',
            rows: [
                { userId: BETO, total: 310, days: 5, rank: 1 },
                { userId: OWNER, total: 250, days: 6, rank: 2 }
            ],
            champion: BETO
        }
    ]
};
const NAMES = { [OWNER]: 'Ana Prueba', [BETO]: 'Beto Prueba', [CARLA]: 'Carla Prueba' };

describe('tabla por semana', () => {
    it('la semana de ahora en juego, el campeón de la semana pasada arriba y cada semana con su tabla', async () => {
        stubFetch((url) => (url.includes('/api/v2/fantasy/weeks?league=lidom&users=') ? WEEKS : undefined));
        const onOpen = vi.fn();
        wrap(<LeagueWeeks fantasyLeague="lidom" members={[OWNER, BETO, CARLA]} ownId={OWNER} onOpen={onOpen} names={NAMES} />);
        const champion = await screen.findByRole('button', { name: /^Campeón de la semana pasada: Beto Prueba, 310 pts en la semana/ });
        fireEvent.click(champion);
        expect(onOpen).toHaveBeenCalledWith(BETO, 'Beto Prueba');
        const weeks = screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label') ?? '');
        expect(weeks.map((label) => label.split(' (')[0])).toEqual(['Esta semana', 'La semana pasada', 'Hace 2 semanas']);
        expect(screen.getByRole('radio', { name: /^Esta semana/ }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByText(/En juego: el campeón sale al terminar el domingo\./)).toBeTruthy();
        // Esta semana: «Tú» primero, y quien no jugó también sale (con 0)
        const rows = screen.getAllByRole('button', { name: /^Ver/ }).map((row) => row.getAttribute('aria-label'));
        expect(rows[0]).toMatch(/^Ver tu perfil, #1, 95\.5 pts/);
        expect(rows).toHaveLength(3);
        fireEvent.click(screen.getByRole('radio', { name: /^La semana pasada/ }));
        expect(screen.getByText('🏆 Campeón · 5 días')).toBeTruthy();
        expect(screen.queryByText(/En juego/)).toBeNull();
    });

    it('sin el servidor nuevo no sale nada', async () => {
        const fetchMock = stubFetch(() => undefined);
        const { container } = wrap(<LeagueWeeks fantasyLeague="lidom" members={[OWNER, BETO]} ownId={OWNER} onOpen={() => undefined} names={NAMES} />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        await act(async () => undefined);
        expect(container.querySelector('ol')).toBeNull();
        expect(screen.queryByRole('radio')).toBeNull();
    });
});

// ---------------------------------------------------------------- dueño de la liga

describe('herramientas del dueño', () => {
    const league = { id: 'liga-prueba', name: 'Liga de Prueba', code: 'ABC123', owner: OWNER, members: [OWNER, BETO] };

    it('renombrar, sacar a alguien (confirmando) y borrar (escribiendo el nombre)', async () => {
        const actions = { rename: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), destroy: vi.fn(async () => undefined) };
        const onChanged = vi.fn();
        wrap(<LeagueOwnerTools league={league} fantasyLeague="lidom" ownId={OWNER} onChanged={onChanged} actions={actions} names={NAMES} />);
        expect(screen.getByText('Eres el dueño')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Nuevo nombre de la liga' }), { target: { value: '  Los   Panas ' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        });
        expect(actions.rename).toHaveBeenCalledWith('ABC123', 'Los Panas');
        expect(onChanged).toHaveBeenLastCalledWith('renamed');

        fireEvent.click(screen.getByRole('button', { name: 'Sacar a alguien' }));
        fireEvent.click(screen.getByRole('button', { name: 'Sacar a Beto Prueba' }));
        expect(screen.getByText('¿Sacar a Beto Prueba de la liga? Puede volver a entrar con el código.')).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Sí, sacar' }));
        });
        expect(actions.remove).toHaveBeenCalledWith('ABC123', BETO);

        fireEvent.click(screen.getByRole('button', { name: 'Borrar liga' }));
        const confirm = screen.getByRole('button', { name: 'Borrar para siempre' }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(true);
        fireEvent.change(screen.getByRole('textbox', { name: 'Escribe el nombre de la liga' }), { target: { value: 'liga de prueba' } });
        expect(confirm.disabled).toBe(false);
        await act(async () => {
            fireEvent.click(confirm);
        });
        expect(actions.destroy).toHaveBeenCalledWith('ABC123');
        expect(onChanged).toHaveBeenLastCalledWith('deleted');
    });

    it('no salen si no eres el dueño ni si la base no tiene las funciones', async () => {
        const actions = { rename: vi.fn(), remove: vi.fn(), destroy: vi.fn() };
        const { container, unmount } = wrap(<LeagueOwnerTools league={league} fantasyLeague="lidom" ownId={BETO} onChanged={() => undefined} actions={actions} names={NAMES} />);
        expect(container.querySelector('section')).toBeNull();
        unmount();
        const second = wrap(<LeagueOwnerTools league={league} fantasyLeague="lidom" ownId={OWNER} onChanged={() => undefined} names={NAMES} />);
        await act(async () => undefined);
        expect(second.container.querySelector('section')).toBeNull();
    });
});

// ---------------------------------------------------------------- guía para empezar

describe('guía para empezar', () => {
    it('3 pasos con los números del día, «Ver cómo se juega» y se acuerda al cerrarla', () => {
        const onHow = vi.fn();
        wrap(<FirstTimeGuide day={DAY} onHow={onHow} />);
        const guide = screen.getByRole('region', { name: 'Guía para empezar' });
        expect(within(guide).getByRole('heading', { name: 'Escoge 5 bateadores y 1 lanzador' })).toBeTruthy();
        expect(within(guide).getByText(/Paso 1 de 3/)).toBeTruthy();
        fireEvent.click(within(guide).getByRole('button', { name: 'Ver cómo se juega' }));
        expect(onHow).toHaveBeenCalled();
        fireEvent.click(within(guide).getByRole('button', { name: 'Siguiente' }));
        expect(within(guide).getByRole('heading', { name: 'Nombra tu capitán (×1,5)' })).toBeTruthy();
        fireEvent.click(within(guide).getByRole('button', { name: 'Siguiente' }));
        expect(within(guide).getByRole('heading', { name: 'Haz tus pronósticos' })).toBeTruthy();
        expect(guideDismissed()).toBe(false);
        fireEvent.click(within(guide).getByRole('button', { name: 'Listo' }));
        expect(guideDismissed()).toBe(true);
        expect(localStorage.getItem('el-play-fantasy-guide')).toBe('1');
    });

    it('cerrarla con la X también se acuerda', () => {
        wrap(<FirstTimeGuide day={DAY} onHow={() => undefined} />);
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar la guía' }));
        expect(guideDismissed()).toBe(true);
    });
});
