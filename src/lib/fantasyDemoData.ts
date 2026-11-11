// Datos inventados del modo de prueba del Fantasy (SOLO en desarrollo, /fantasy?demo=1): la temporada, las ideas del
// día, las semanas de la liga de prueba y un equipo de ayer para copiar. Se carga aparte (import dinámico) solo cuando
// el modo de prueba lo pide, así no pesa en la app.
import type { LeagueId } from '../types';
import { bestLineup } from './fantasyBest';
import { entryKey, getStore, isLocked, isPostponed, replaceStore, type FantasyDay, type FantasyPlayer } from './fantasy';
import type { FanStats } from './fantasyStats';
import type { FantasyTrends, TrendItem } from './fantasyTrends';
import type { LeagueWeeks } from './fantasyLeagues';
import { DEMO_USER } from './fantasyDemo';
import { todayKey } from './format';

const DAY_MS = 86400000;
const round1 = (value: number) => Math.round(value * 10) / 10;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Números fijos que parecen al azar (siempre los mismos: el video sale igual cada vez) */
const noise = (seed: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
};

// Peloteros inventados para cuando todavía no hay día cargado
const FALLBACK_PLAYERS: Pick<FantasyPlayer, 'id' | 'name' | 'teamId' | 'role'>[] = [
    { id: 12345678, name: 'Pelotero Uno', teamId: 12345601, role: 'B' },
    { id: 12345679, name: 'Pelotero Dos', teamId: 12345602, role: 'B' },
    { id: 12345680, name: 'Pelotero Tres', teamId: 12345603, role: 'B' },
    { id: 12345681, name: 'Pelotero Cuatro', teamId: 12345604, role: 'P' },
    { id: 12345682, name: 'Pelotero Cinco', teamId: 12345601, role: 'B' }
];

/** La temporada de quien prueba: 34 días de juego hasta ayer, con descansos, rachas y logros a medias */
export const demoStats = (league: LeagueId, seed: Pick<FantasyPlayer, 'id' | 'name' | 'teamId' | 'role'>[] = []): FanStats => {
    const today = todayKey();
    const days: FanStats['days'] = [];
    let date = shift(today, -44);
    for (let i = 0; days.length < 34; i++, date = shift(date, 1)) {
        // Los lunes no hay juego en LIDOM (y algún día suelto sin jugar)
        if (new Date(`${date}T12:00:00Z`).getUTCDay() === 1 || noise(i + 3) < 0.08) continue;
        if (date >= today) break;
        const team = round1(18 + noise(i) * 70 + (i % 9 === 0 ? 45 : 0));
        const picks = Math.round(noise(i + 50) * 4) * 10;
        const players = 40 + Math.round(noise(i + 90) * 25);
        days.push({ date, team, picks, total: round1(team + picks), rank: Math.max(1, Math.round(players * (1 - (team + picks) / 140))), players });
    }
    const totals = days.map((day) => day.total);
    const total = round1(totals.reduce((sum, value) => sum + value, 0));
    const best = days.reduce((top, day) => (day.total > top.total ? day : top), days[0]);
    const worst = days.reduce((low, day) => (day.total < low.total ? day : low), days[0]);
    const sorted = [...totals].sort((a, b) => a - b);
    const pool = (seed.length ? seed : FALLBACK_PLAYERS).slice(0, 40);
    const players = pool
        .slice(0, 8)
        .map((player, index) => ({ id: player.id, name: player.name, teamId: player.teamId ?? null, role: player.role, days: 22 - index * 2, points: round1(190 - index * 17 + noise(index) * 10) }));
    const captainBest = pool[0];
    const done = (value: number, goal: number, at: number | null) => ({ unlockedAt: value >= goal && at !== null ? `${days[Math.min(at, days.length - 1)]?.date}T23:00:00Z` : null, progress: { value: Math.min(value, goal), goal } });
    return {
        userId: DEMO_USER,
        league,
        season: Number(today.slice(0, 4)),
        days,
        totals: { days: days.length, total, avg: round1(total / Math.max(1, days.length)), median: round1(sorted[Math.floor(sorted.length / 2)] ?? 0), best: best ? { date: best.date, total: best.total } : null, worst: worst ? { date: worst.date, total: worst.total } : null },
        streak: { current: 4, longest: 9 },
        captain: { days: 29, avg: 14.6, bonus: 142.5, best: captainBest ? { id: captainBest.id, name: captainBest.name, points: 37.5, date: best?.date ?? today } : null },
        picks: { made: 96, hits: 58, pct: 60.4 },
        players,
        achievements: [
            { id: 'firstTeam', ...done(1, 1, 0) },
            { id: 'days10', ...done(days.length, 10, 9) },
            { id: 'days30', ...done(days.length, 30, 29) },
            { id: 'day50', ...done(1, 1, 2) },
            { id: 'day100', ...done(best ? best.total : 0, 100, days.indexOf(best)) },
            { id: 'day150', unlockedAt: null, progress: { value: Math.round(best?.total ?? 0), goal: 150 } },
            { id: 'streak3', ...done(9, 3, 5) },
            { id: 'streak7', ...done(9, 7, 9) },
            { id: 'streak14', unlockedAt: null, progress: { value: 9, goal: 14 } },
            { id: 'perfectPicks', ...done(1, 1, 12) },
            { id: 'captainMvp', ...done(1, 1, 7) },
            { id: 'season500', ...done(total, 500, 8) },
            { id: 'season1000', ...done(total, 1000, 16) },
            { id: 'top10Day', ...done(1, 1, 20) },
            { id: 'dayLeader', unlockedAt: null, progress: null },
            { id: 'bargain', ...done(1, 1, 4) },
            { id: 'weekChampion', unlockedAt: null, progress: null }
        ].map((item) => ({ ...item, progress: item.unlockedAt ? null : item.progress }))
    };
};

/** Las ideas del día armadas con los peloteros de verdad del día de prueba (así «Agregar» funciona) */
export const demoTrends = (day: FantasyDay): FantasyTrends => {
    const open = day.players.filter((player) => !isLocked(day, player) && !isPostponed(day, player));
    const last5 = (player: FantasyPlayer) =>
        Array.isArray(player.last5) && player.last5.length >= 3 ? player.last5 : Array.from({ length: 5 }, (_, i) => round1((player.proj ?? 6) * (0.4 + noise(player.id + i) * 1.3)));
    const delta = (player: FantasyPlayer) => (typeof player.priceDelta === 'number' && player.priceDelta !== 0 ? player.priceDelta : round1((noise(player.id) - 0.5) * 3) || 0.5);
    const item = (player: FantasyPlayer, extra: Partial<TrendItem> = {}): TrendItem => ({
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        role: player.role,
        price: player.price,
        proj: player.proj,
        status: player.status,
        estimated: player.estimated,
        opp: player.opp ?? null,
        last5: last5(player),
        priceDelta: delta(player),
        ...extra
    });
    const average = (values: number[]) => round1(values.reduce((sum, value) => sum + value, 0) / values.length);
    const byProj = [...open].sort((a, b) => (b.proj ?? 0) - (a.proj ?? 0));
    const edges = ['good', 'good', 'even', 'even', 'tough', 'even'] as const;
    return {
        date: day.date,
        hot: open
            .map((player) => ({ player, avg: average(last5(player)) }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 8)
            .map(({ player, avg }) => item(player, { avg })),
        bargains: open
            .filter((player) => (player.price ?? 99) <= 7 && player.proj !== undefined)
            .map((player) => ({ player, value: round1(((player.proj ?? 0) / (player.price ?? 1)) * 10) / 10 }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8)
            .map(({ player, value }) => item(player, { value })),
        risers: open
            .filter((player) => delta(player) > 0)
            .sort((a, b) => delta(b) - delta(a))
            .slice(0, 5)
            .map((player) => item(player)),
        fallers: open
            .filter((player) => delta(player) < 0)
            .sort((a, b) => delta(a) - delta(b))
            .slice(0, 5)
            .map((player) => item(player)),
        pitchers: byProj
            .filter((player) => player.role === 'P')
            .slice(0, 6)
            .map((player, index) => item(player, { matchup: { oppOps: `.${640 + Math.round(noise(player.id) * 120)}`, edge: edges[index] } })),
        popular: byProj.slice(0, 8).map((player, index) => item(player, { owned: Math.max(6, 64 - index * 7 - Math.round(noise(player.id) * 4)) }))
    };
};

/** Lunes de la semana de una fecha (YYYY-MM-DD) */
const mondayOf = (date: string) => {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return shift(date, -((weekday + 6) % 7));
};

/** Las 4 semanas de la liga de prueba (la de ahora sin campeón todavía) */
export const demoWeeks = (members: string[]): LeagueWeeks => {
    const monday = mondayOf(todayKey());
    return {
        weeks: [0, 1, 2, 3].map((ago) => {
            const start = shift(monday, -7 * ago);
            const rows = members
                .map((userId, index) => ({ userId, total: round1(ago === 0 ? 40 + noise(index + ago * 7) * 120 : 160 + noise(index + ago * 7) * 260), days: ago === 0 ? 1 + (index % 3) : 4 + (index % 3) }))
                .sort((a, b) => b.total - a.total)
                .map((row, index) => ({ ...row, rank: index + 1 }));
            return { start, end: shift(start, 6), rows, champion: ago === 0 ? null : rows[0]?.userId ?? null };
        })
    };
};

/**
 * Un equipo de ayer para probar «Copiar mi equipo de ayer»: el mejor posible con los peloteros del día (los que ya se
 * cerraron salen como «su juego ya empezó») y uno que hoy no juega. Solo si ayer no hay nada guardado.
 */
export const seedDemoYesterday = (day: FantasyDay) => {
    const yesterday = shift(day.date, -1);
    const key = entryKey(day.league, yesterday);
    const all = getStore();
    if (all[key]) return;
    const best = bestLineup(day, { metric: 'proj', ignoreLocks: true });
    if (!best) return;
    replaceStore({ ...all, [key]: { lineup: [...best.lineup.slice(0, -1), 12345678, ...best.lineup.slice(-1)], captain: best.captain, picks: {}, savedAt: 1 } });
};
