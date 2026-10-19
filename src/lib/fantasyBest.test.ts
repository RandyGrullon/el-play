import { afterEach, describe, expect, it } from 'vitest';
import { bestLineup, projectedPoints, valueOf } from './fantasyBest';
import { applyLineup, getStore, replaceStore, setStoreOwner, type FantasyDay, type FantasyPlayer } from './fantasy';

const LATER = '2099-10-20T23:00:00Z';
const p = (id: number, role: 'B' | 'P', teamId: number, price: number, proj: number, extra: Partial<FantasyPlayer> = {}): FantasyPlayer => ({
    id,
    name: `P${id}`,
    teamId,
    gamePk: teamId <= 2 ? 1 : 2,
    role,
    pos: role === 'P' ? 'P' : 'SS',
    starter: true,
    played: false,
    line: null,
    points: 0,
    price,
    proj,
    ...extra
});
// Dos juegos (4 equipos: máximo 2 por equipo), 50 créditos
const day = (players: FantasyPlayer[], firstDate = LATER) =>
    ({
        league: 'lidom',
        date: '2099-10-20',
        teams: {},
        scoring: { batter: {}, pitcher: {} },
        credits: { budget: 50, min: 4, max: 12 },
        games: [
            { gamePk: 1, date: firstDate, state: 'preview', startTimeTBD: false, away: { id: 1 }, home: { id: 2 } },
            { gamePk: 2, date: LATER, state: 'preview', startTimeTBD: false, away: { id: 3 }, home: { id: 4 } }
        ],
        players
    }) as unknown as FantasyDay;

describe('equipo sugerido e ideal: el mejor con las reglas y los créditos', () => {
    it('el sugerido maximiza la proyección sin pasarse de los créditos ni del máximo por equipo', () => {
        const players = [
            // Estrellas caras (12) del mismo equipo: solo caben 2 por equipo
            p(1, 'B', 1, 12, 10),
            p(2, 'B', 1, 12, 9.5),
            p(3, 'B', 1, 12, 9),
            p(4, 'B', 2, 8, 7),
            p(5, 'B', 3, 6, 6),
            p(6, 'B', 4, 5, 5.5),
            p(7, 'B', 4, 4, 3),
            p(8, 'B', 3, 4, 2),
            p(9, 'P', 2, 10, 12),
            p(10, 'P', 3, 5, 6)
        ];
        const best = bestLineup(day(players), { metric: 'proj' })!;
        expect(best.cost).toBeLessThanOrEqual(50);
        const chosen = best.lineup.map((id) => players.find((x) => x.id === id)!);
        expect(chosen.filter((x) => x.role === 'B')).toHaveLength(5);
        expect(chosen.filter((x) => x.role === 'P')).toHaveLength(1);
        expect(chosen.filter((x) => x.teamId === 1).length).toBeLessThanOrEqual(2);
        // Capitán: el de más proyección, y el total lo cuenta ×1,5
        const top = chosen.reduce((a, b) => ((b.proj ?? 0) > (a.proj ?? 0) ? b : a));
        expect(best.captain).toBe(top.id);
        expect(best.total).toBeCloseTo(projectedPoints(day(players), best.lineup, best.captain), 5);
        // Ningún otro equipo válido proyecta más (fuerza bruta)
        const valid = (ids: number[]) => {
            const list = ids.map((id) => players.find((x) => x.id === id)!);
            const teams = new Map<number, number>();
            list.forEach((x) => teams.set(x.teamId, (teams.get(x.teamId) ?? 0) + 1));
            return list.filter((x) => x.role === 'B').length === 5 && list.filter((x) => x.role === 'P').length === 1 && [...teams.values()].every((n) => n <= 2) && list.reduce((s, x) => s + (x.price ?? 0), 0) <= 50;
        };
        let bruteBest = 0;
        const ids = players.map((x) => x.id);
        const pick = (start: number, acc: number[]) => {
            if (acc.length === 6) {
                if (valid(acc)) bruteBest = Math.max(bruteBest, projectedPoints(day(players), acc, acc.reduce((a, b) => ((players.find((x) => x.id === b)!.proj ?? 0) > (players.find((x) => x.id === a)!.proj ?? 0) ? b : a))));
                return;
            }
            for (let i = start; i < ids.length; i++) pick(i + 1, [...acc, ids[i]]);
        };
        pick(0, []);
        expect(best.total).toBeCloseTo(bruteBest, 5);
    });

    it('el capitán cuenta en la búsqueda: una estrella de capitán puede valer más que un equipo parejo', () => {
        const players = [
            p(1, 'B', 1, 30, 26),
            p(2, 'B', 2, 8, 7),
            p(3, 'B', 2, 8, 7),
            p(4, 'B', 3, 8, 7),
            p(5, 'B', 3, 8, 7),
            p(6, 'B', 4, 8, 7),
            p(7, 'B', 1, 4, 1),
            p(8, 'B', 2, 4, 1),
            p(11, 'B', 3, 4, 1),
            p(12, 'B', 4, 4, 1),
            p(9, 'P', 4, 4, 2)
        ];
        // Parejo: 5 de 7 + el lanzador = 37 (+3,5 del capitán) = 40,5; con la estrella: 32 (+13) = 45
        const best = bestLineup(day(players), { metric: 'proj' })!;
        expect(best.captain).toBe(1);
        expect(best.total).toBe(45);
        expect(best.lineup.sort((a, b) => a - b)).toEqual([1, 7, 8, 9, 11, 12]);
        // Con el capitán fijo (ya cerrado) la estrella ya no conviene
        const fixed = bestLineup(day(players), { metric: 'proj', keep: [2], captain: 2 })!;
        expect(fixed.captain).toBe(2);
        expect(fixed.total).toBe(40.5);
    });

    it('los peloteros que se quedan (cerrados o el equipo a completar) se respetan', () => {
        const players = [p(1, 'B', 1, 12, 10), p(2, 'B', 2, 4, 1), p(3, 'B', 3, 6, 6), p(4, 'B', 4, 5, 5.5), p(5, 'B', 3, 4, 3), p(6, 'B', 4, 4, 2), p(7, 'B', 1, 8, 4), p(9, 'P', 2, 10, 12), p(10, 'P', 3, 5, 6)];
        const best = bestLineup(day(players), { metric: 'proj', keep: [2] })!;
        expect(best.lineup).toContain(2);
        expect(best.lineup).toHaveLength(6);
        // Sin lugar para completar (no alcanzan los créditos): null
        expect(bestLineup(day([p(1, 'B', 1, 12, 10), p(2, 'B', 2, 12, 9), p(3, 'B', 3, 12, 8), p(4, 'B', 4, 12, 7), p(5, 'B', 1, 12, 6), p(9, 'P', 2, 12, 12)]), { metric: 'proj' })).toBeNull();
    });

    it('el ideal del día mira los puntos de verdad (aunque los juegos ya hayan empezado)', () => {
        const past = '2000-01-01T00:00:00Z';
        const players = [
            p(1, 'B', 1, 12, 10, { played: true, points: 2 }),
            p(2, 'B', 2, 4, 1, { played: true, points: 18 }),
            p(3, 'B', 1, 6, 6, { played: true, points: 9 }),
            p(4, 'B', 2, 5, 5.5, { played: true, points: 7 }),
            p(5, 'B', 3, 4, 3, { played: true, points: 5 }),
            p(6, 'B', 4, 4, 2, { played: true, points: 4 }),
            p(7, 'B', 4, 8, 4, { played: false, points: 0 }),
            p(9, 'P', 3, 10, 12, { played: true, points: 15 })
        ];
        const ideal = bestLineup(day(players, past), { metric: 'points', ignoreLocks: true })!;
        expect(ideal.lineup).toEqual(expect.arrayContaining([2, 3, 4, 5, 6, 9]));
        expect(ideal.captain).toBe(2);
        expect(ideal.total).toBe(18 * 1.5 + 9 + 7 + 5 + 4 + 15);
    });

    it('valor = proyección por crédito', () => {
        expect(valueOf({ proj: 8.4, price: 12 })).toBe(0.7);
        expect(valueOf({ proj: undefined, price: 12 })).toBeNull();
    });
});

describe('usar el equipo sugerido', () => {
    afterEach(() => setStoreOwner(null));

    it('los cerrados se quedan (y su capitán); entra el resto', () => {
        setStoreOwner('sugerido-prueba');
        const past = '2000-01-01T00:00:00Z';
        const players = [p(1, 'B', 1, 12, 10), p(2, 'B', 2, 4, 1), p(3, 'B', 3, 6, 6), p(4, 'B', 4, 5, 5.5), p(9, 'P', 3, 10, 12)];
        const d = day(players, past); // el juego 1 (equipos 1 y 2) ya empezó
        replaceStore({ 'lidom:2099-10-20': { lineup: [1, 4], captain: 1, picks: {}, savedAt: 1 } });
        applyLineup(d, [2, 3, 9], 9);
        const saved = getStore()['lidom:2099-10-20'];
        // 1 está cerrado: se queda; 4 (abierto) sale; 2 está cerrado (juego empezado) y no entra
        expect(saved.lineup).toEqual([1, 3, 9]);
        expect(saved.captain).toBe(1);
    });
});
