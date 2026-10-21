// Fantasy PRO (parte «Fantasy y fanáticos»): lógica pura de las pantallas PRO del Fantasy y de los fanáticos. Es la de
// la web (el-play/src/lib/pro/fantasy.ts) más los créditos y el máximo por equipo del día (perTeamLimit).
// Los puntos son los de src/lib/fantasy.ts: aquí solo se arman vistas con ellos. Lo de los demás se puntúa con el
// equipo que cuenta (effectiveEntry) y nunca se muestra antes de que empiece su juego.
import type { Rival } from '../../../lib/account';
import { RULES, effectiveEntry, gameStarted, lockTime, perTeamLimit, pickPoints, playerScore, teamPoints, type DayEntry, type FantasyDay, type FantasyLine, type FantasyPlayer } from '../../../lib/fantasy';
import type { ProStandingRow, ProStandings } from '../../../types/pro-liga';

export const round1 = (value: number) => Math.round(value * 10) / 10;

// ---------------------------------------------------------------- desglose de puntos

export type PartKey = 'single' | 'double' | 'triple' | 'homeRun' | 'run' | 'rbi' | 'walk' | 'hitByPitch' | 'stolenBase' | 'strikeOut' | 'out' | 'win' | 'save' | 'earnedRun' | 'hit';

export interface PointPart {
    /** Clave de la regla (la misma de day.scoring): sirve para el texto corto (1B, HR, CI…) */
    key: PartKey;
    count: number;
    /** Puntos de cada uno según la regla */
    per: number;
    /** Puntos en total de esta parte */
    pts: number;
}

type Scoring = FantasyDay['scoring'];

/** De dónde salen los puntos de un pelotero en un juego: «1B ×2 = 6 · HR 10 · K −1». Suma lo mismo que `points` */
export const pointParts = (player: Pick<FantasyPlayer, 'role' | 'line'>, scoring: Scoring): PointPart[] => {
    const line: FantasyLine | null = player.line;
    if (!line) return [];
    const n = (key: string) => Number(line[key]) || 0;
    const items: [PartKey, number, number | undefined][] =
        player.role === 'P'
            ? [
                  ['out', n('outs'), scoring.pitcher.out],
                  ['strikeOut', n('k'), scoring.pitcher.strikeOut],
                  ['win', n('w'), scoring.pitcher.win],
                  ['save', n('sv'), scoring.pitcher.save],
                  ['earnedRun', n('er'), scoring.pitcher.earnedRun],
                  ['hit', n('h'), scoring.pitcher.hit],
                  ['walk', n('bb'), scoring.pitcher.walk]
              ]
            : [
                  ['single', n('h') - n('d') - n('t') - n('hr'), scoring.batter.single],
                  ['double', n('d'), scoring.batter.double],
                  ['triple', n('t'), scoring.batter.triple],
                  ['homeRun', n('hr'), scoring.batter.homeRun],
                  ['run', n('r'), scoring.batter.run],
                  ['rbi', n('rbi'), scoring.batter.rbi],
                  ['walk', n('bb'), scoring.batter.walk],
                  ['hitByPitch', n('hbp'), scoring.batter.hitByPitch],
                  ['stolenBase', n('sb'), scoring.batter.stolenBase],
                  ['strikeOut', n('k'), scoring.batter.strikeOut]
              ];
    return items.filter(([, count, per]) => count > 0 && typeof per === 'number' && per !== 0).map(([key, count, per]) => ({ key, count, per: per!, pts: round1(count * per!) }));
};

export const partsTotal = (parts: PointPart[]) => round1(parts.reduce((sum, part) => sum + part.pts, 0));

// ---------------------------------------------------------------- proyección

/** Lo que se espera de un pelotero: su promedio de puntos por juego (×1.5 si es el capitán) */
export const projectedPoints = (ppg: number | null | undefined, captain: boolean) => (ppg === null || ppg === undefined || !Number.isFinite(ppg) ? null : round1(ppg * (captain ? RULES.captain : 1)));

export interface Projection {
    byId: Record<number, number | null>;
    total: number;
    /** Peloteros con promedio conocido */
    known: number;
    /** Peloteros del equipo que están en el día */
    count: number;
}

/** Proyección del equipo: la suma de los promedios de cada pelotero (con la corona) */
export const projectionOf = (day: Pick<FantasyDay, 'players'>, entry: Pick<DayEntry, 'lineup' | 'captain'>, ppgOf: (id: number) => number | null | undefined): Projection => {
    const byId: Record<number, number | null> = {};
    let total = 0;
    let known = 0;
    let count = 0;
    for (const id of entry.lineup) {
        if (!day.players.some((player) => player.id === id)) continue;
        count += 1;
        const value = projectedPoints(ppgOf(id), entry.captain === id);
        byId[id] = value;
        if (value !== null) {
            total += value;
            known += 1;
        }
    }
    return { byId, total: round1(total), known, count };
};

// ---------------------------------------------------------------- equipo ideal del día

export interface IdealTeam {
    players: FantasyPlayer[];
    captain: FantasyPlayer | null;
    total: number;
    /** Peloteros que jugaron (de donde se escoge) */
    pool: number;
}

const byPoints = (a: FantasyPlayer, b: FantasyPlayer) => b.points - a.points || a.id - b.id;
const priceTenths = (player: FantasyPlayer) => (Number.isFinite(player.price) ? Math.max(0, Math.round(player.price! * 10)) : 0);

/** Sin créditos: con lanzador y capitán fijos, los bateadores de mayor a menor dentro de los cupos es lo mejor (matroide) */
const idealGreedy = (pool: FantasyPlayer[], perTeam: number) => {
    const batters = pool.filter((player) => player.role === 'B').sort(byPoints);
    const pitchers = pool.filter((player) => player.role === 'P').sort(byPoints);
    const pitcherOptions: (FantasyPlayer | null)[] = pitchers.length ? pitchers : [null];
    let best: { players: FantasyPlayer[]; captain: FantasyPlayer | null; total: number } | null = null;
    for (const pitcher of pitcherOptions) {
        const captainOptions: (FantasyPlayer | null)[] = [null, ...pool.filter((player) => player.role === 'B' || player === pitcher)];
        for (const captain of captainOptions) {
            const chosen: FantasyPlayer[] = [];
            const count = new Map<number, number>();
            const take = (player: FantasyPlayer) => {
                chosen.push(player);
                count.set(player.teamId, (count.get(player.teamId) ?? 0) + 1);
            };
            if (pitcher) take(pitcher);
            if (captain && captain !== pitcher) {
                if ((count.get(captain.teamId) ?? 0) >= perTeam) continue;
                take(captain);
            }
            for (const batter of batters) {
                if (chosen.filter((player) => player.role === 'B').length >= RULES.batters) break;
                if (chosen.includes(batter) || (count.get(batter.teamId) ?? 0) >= perTeam) continue;
                take(batter);
            }
            const entry = { lineup: chosen.map((player) => player.id), captain: captain?.id ?? null } as DayEntry;
            const total = round1(chosen.reduce((sum, player) => sum + playerScore(entry, player), 0));
            if (!best || total > best.total) best = { players: chosen, captain, total };
        }
    }
    return best;
};

/**
 * Con créditos: mochila por equipos. Estado = (bateadores, lanzador, capitán usado, créditos gastados en décimas);
 * de cada equipo se prueban los grupos de hasta `perTeam` peloteros con o sin capitán. Exacto y rápido (unos
 * 12 000 estados por equipo).
 */
const idealBudget = (pool: FantasyPlayer[], perTeam: number, budget: number) => {
    const B = Math.max(0, Math.round(budget * 10));
    const size = (RULES.batters + 1) * (RULES.pitchers + 1) * 2 * (B + 1);
    const index = (b: number, p: number, c: number, cost: number) => ((b * (RULES.pitchers + 1) + p) * 2 + c) * (B + 1) + cost;
    const teams = new Map<number, FantasyPlayer[]>();
    for (const player of pool) teams.set(player.teamId, [...(teams.get(player.teamId) ?? []), player]);

    let value = new Float64Array(size).fill(-Infinity);
    value[index(0, 0, 0, 0)] = 0;
    const steps: { from: Int32Array; option: Int32Array; options: { players: FantasyPlayer[]; captain: FantasyPlayer | null }[] }[] = [];

    for (const players of teams.values()) {
        // Grupos del equipo (hasta perTeam) con o sin capitán; por cada forma (b, p, c, costo) solo el de más puntos
        const best = new Map<string, { players: FantasyPlayer[]; captain: FantasyPlayer | null; b: number; p: number; c: number; cost: number; pts: number }>();
        const consider = (group: FantasyPlayer[]) => {
            const b = group.filter((player) => player.role === 'B').length;
            const p = group.length - b;
            if (b > RULES.batters || p > RULES.pitchers) return;
            const cost = group.reduce((sum, player) => sum + priceTenths(player), 0);
            if (cost > B) return;
            const base = group.reduce((sum, player) => sum + player.points, 0);
            for (const captain of [null, ...group]) {
                const pts = base + (captain ? captain.points * (RULES.captain - 1) : 0);
                const c = captain ? 1 : 0;
                const key = `${b}-${p}-${c}-${cost}`;
                const current = best.get(key);
                if (!current || pts > current.pts) best.set(key, { players: group, captain, b, p, c, cost, pts });
            }
        };
        const pick = (start: number, group: FantasyPlayer[]) => {
            consider(group);
            if (group.length >= perTeam) return;
            for (let i = start; i < players.length; i++) pick(i + 1, [...group, players[i]]);
        };
        pick(0, []);
        const options = [...best.values()];
        const next = new Float64Array(size).fill(-Infinity);
        const from = new Int32Array(size).fill(-1);
        const option = new Int32Array(size).fill(-1);
        for (let state = 0; state < size; state++) {
            const current = value[state];
            if (current === -Infinity) continue;
            const cost = state % (B + 1);
            const rest = (state - cost) / (B + 1);
            const c = rest % 2;
            const p = ((rest - c) / 2) % (RULES.pitchers + 1);
            const b = (rest - c - p * 2) / (2 * (RULES.pitchers + 1));
            for (let o = 0; o < options.length; o++) {
                const item = options[o];
                const nb = b + item.b;
                const np = p + item.p;
                const nc = c + item.c;
                const ncost = cost + item.cost;
                if (nb > RULES.batters || np > RULES.pitchers || nc > 1 || ncost > B) continue;
                const target = index(nb, np, nc, ncost);
                const total = current + item.pts;
                if (total > next[target]) {
                    next[target] = total;
                    from[target] = state;
                    option[target] = o;
                }
            }
        }
        steps.push({ from, option, options: options.map((item) => ({ players: item.players, captain: item.captain })) });
        value = next;
    }

    // El mejor equipo completo (5 + 1); si no alcanza, el más completo que se pueda
    let end = -1;
    for (const want of [RULES.batters + RULES.pitchers, RULES.batters, RULES.batters - 1, 3, 2, 1]) {
        for (let state = 0; state < size; state++) {
            if (value[state] === -Infinity) continue;
            const cost = state % (B + 1);
            const rest = (state - cost) / (B + 1);
            const c = rest % 2;
            const p = ((rest - c) / 2) % (RULES.pitchers + 1);
            const b = (rest - c - p * 2) / (2 * (RULES.pitchers + 1));
            if (b + p !== want || (want === RULES.batters + RULES.pitchers && (b !== RULES.batters || p !== RULES.pitchers))) continue;
            if (end < 0 || value[state] > value[end]) end = state;
        }
        if (end >= 0) break;
    }
    if (end < 0) return null;
    const players: FantasyPlayer[] = [];
    let captain: FantasyPlayer | null = null;
    let state = end;
    for (let step = steps.length - 1; step >= 0; step--) {
        const { from, option, options } = steps[step];
        const chosen = options[option[state]];
        if (chosen) {
            players.push(...chosen.players);
            if (chosen.captain) captain = chosen.captain;
        }
        state = from[state];
        if (state < 0) break;
    }
    const entry = { lineup: players.map((player) => player.id), captain: captain?.id ?? null } as DayEntry;
    return { players, captain, total: round1(players.reduce((sum, player) => sum + playerScore(entry, player), 0)) };
};

/**
 * El mejor equipo posible con lo que pasó: 5 bateadores y 1 lanzador de los que jugaron, el máximo por equipo del día,
 * los créditos del día (si se juega con créditos) y el capitán ×1.5.
 */
export const idealTeam = (day: Pick<FantasyDay, 'players' | 'games' | 'credits'>): IdealTeam | null => {
    const pool = day.players.filter((player) => player.played);
    if (!pool.length) return null;
    const perTeam = perTeamLimit(day);
    const best = day.credits ? idealBudget(pool, perTeam, day.credits.budget) : idealGreedy(pool, perTeam);
    if (!best) return null;
    const entry = { lineup: best.players.map((player) => player.id), captain: best.captain?.id ?? null } as DayEntry;
    const players = [...best.players].sort((a, b) => playerScore(entry, b) - playerScore(entry, a) || a.id - b.id);
    return { players, captain: best.captain, total: best.total, pool: pool.length };
};

// ---------------------------------------------------------------- tablas: puesto, porcentaje, histograma y movimiento

/** Puesto con empates: 1 + cuántos tienen más puntos */
export const rankIn = (scores: number[], points: number) => 1 + scores.filter((score) => score > points).length;

/** «Top 12 %»: el puesto sobre el total, redondeado hacia arriba (el líder de 120 es top 1 %) */
export const topPercent = (rank: number | null | undefined, total: number | null | undefined) => (rank && total && total > 0 ? Math.max(1, Math.min(100, Math.ceil((rank / total) * 100))) : null);

export interface Bin {
    from: number;
    to: number;
    count: number;
}

/** Tramos de `width` puntos con cuántos equipos cayeron en cada uno (para el histograma del día) */
export const histogram = (scores: number[], width = 20): Bin[] => {
    const clean = scores.filter(Number.isFinite);
    if (!clean.length) return [];
    const min = Math.floor(Math.min(...clean) / width) * width;
    const max = Math.max(...clean);
    const bins: Bin[] = [];
    for (let from = min; from <= max; from += width) bins.push({ from, to: from + width, count: 0 });
    for (const score of clean) bins[Math.min(bins.length - 1, Math.floor((score - min) / width))].count += 1;
    return bins;
};

export const binIndex = (bins: Bin[], points: number) => bins.findIndex((bin, index) => points >= bin.from && (points < bin.to || index === bins.length - 1));

/** Puestos ganados (positivo) o perdidos (negativo) desde la lectura anterior; null si no había puesto */
export const movementOf = (rank: number | null | undefined, previous: number | null | undefined) => (rank === null || rank === undefined || previous === null || previous === undefined ? null : previous - rank);

/** Puestos con empates (dos con los mismos puntos comparten el puesto) */
export const ranked = <T extends { points: number }>(rows: T[]) => {
    let rank = 0;
    return rows.map((row, index) => {
        if (index === 0 || row.points !== rows[index - 1].points) rank = index + 1;
        return { ...row, rank };
    });
};

/** Filas que se muestran de una tabla larga: los 3 primeros y los de alrededor de la tuya; entre los dos, un hueco */
export const tableWindow = <T>(rows: T[], mine: number, top = 3, around = 1): (T | { gap: number })[] => {
    if (mine < 0 || mine <= top + around) return rows.slice(0, Math.max(top, mine + around + 1));
    const start = Math.max(top, mine - around);
    const end = Math.min(rows.length, mine + around + 1);
    const out: (T | { gap: number })[] = rows.slice(0, top);
    if (start > top) out.push({ gap: start - top });
    return [...out, ...rows.slice(start, end)];
};

export const isGap = <T>(row: T | { gap: number }): row is { gap: number } => typeof row === 'object' && row !== null && 'gap' in row && Object.keys(row).length === 1;

// ---------------------------------------------------------------- cierres de hoy

export interface LockGroup {
    at: number;
    gamePk: number;
    players: FantasyPlayer[];
}

/** Peloteros del equipo que todavía no se cierran, agrupados por la hora de su juego (de la más cercana a la más lejana) */
export const lockGroups = (day: FantasyDay, entry: Pick<DayEntry, 'lineup'>, now = Date.now()): LockGroup[] => {
    const groups = new Map<number, LockGroup>();
    for (const id of entry.lineup) {
        const player = day.players.find((item) => item.id === id);
        const game = player ? day.games.find((item) => item.gamePk === player.gamePk) : undefined;
        if (!player || !game || gameStarted(game, now)) continue;
        const at = lockTime(game);
        if (!Number.isFinite(at)) continue;
        const group = groups.get(game.gamePk) ?? { at, gamePk: game.gamePk, players: [] };
        group.players.push(player);
        groups.set(game.gamePk, group);
    }
    return [...groups.values()].sort((a, b) => a.at - b.at || a.gamePk - b.gamePk);
};

/** Primer juego del día que todavía no empieza (ahí se cierra lo primero) */
export const nextGame = (day: FantasyDay, now = Date.now()) =>
    day.games.filter((game) => !game.startTimeTBD && !gameStarted(game, now)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0] ?? null;

// ---------------------------------------------------------------- forma de los equipos (pronósticos)

export interface Streak {
    won: boolean;
    n: number;
}

/** «W3» / «L1» de MLB → racha (null si no hay) */
export const streakOf = (code: string | null | undefined): Streak | null => {
    const match = /^([WL])(\d+)$/.exec(String(code ?? '').trim());
    return match ? { won: match[1] === 'W', n: Number(match[2]) } : null;
};

export interface TeamForm {
    wins: number;
    losses: number;
    last10: { wins: number; losses: number } | null;
    streak: Streak | null;
    runDiff: number | null;
}

/** Filas de la fase vigente de las posiciones PRO (LIDOM), o todas las de los grupos (Clásico, Serie del Caribe) */
export const standingRows = (standings: ProStandings | undefined): ProStandingRow[] => {
    if (!standings) return [];
    if (standings.type === 'lidom') return standings[standings.activePhase] ?? standings.regular ?? [];
    if (standings.type === 'wbc') return Object.values(standings.pools).flat();
    return standings.teams;
};

export const teamFormOf = (rows: ProStandingRow[]): Map<number, TeamForm> =>
    new Map(
        rows.map((row) => [
            row.team.id,
            {
                wins: row.wins,
                losses: row.losses,
                last10: row.lastTen ? { wins: row.lastTen.wins, losses: row.lastTen.losses } : null,
                streak: streakOf(row.streak),
                runDiff:
                    row.pro?.runDiff ?? (row.runsScored !== null && row.runsScored !== undefined && row.runsAllowed !== null && row.runsAllowed !== undefined ? row.runsScored - row.runsAllowed : null)
            }
        ])
    );

const pctOf = (record: { wins: number; losses: number } | null | undefined) => (record && record.wins + record.losses > 0 ? record.wins / (record.wins + record.losses) : null);

/** Qué lado tiene el mejor valor (null si empatan o falta el dato) */
export const betterSide = (away: number | null | undefined, home: number | null | undefined): 'away' | 'home' | null => {
    if (away === null || away === undefined || home === null || home === undefined || away === home) return null;
    return away > home ? 'away' : 'home';
};

export const formCompare = (away: TeamForm | undefined, home: TeamForm | undefined) => ({
    record: betterSide(pctOf(away), pctOf(home)),
    last10: betterSide(pctOf(away?.last10), pctOf(home?.last10)),
    streak: betterSide(away?.streak ? (away.streak.won ? away.streak.n : -away.streak.n) : null, home?.streak ? (home.streak.won ? home.streak.n : -home.streak.n) : null),
    runDiff: betterSide(away?.runDiff, home?.runDiff)
});

// ---------------------------------------------------------------- líneas de la temporada

export interface SeasonPoint {
    date: string;
    total: number;
}

/** Las líneas de la temporada sobre las mismas fechas: por día (null si no jugó) o acumulada (repite lo que llevaba) */
export const alignSeries = (series: Record<string, SeasonPoint[]>, mode: 'daily' | 'cumulative') => {
    const dates = [...new Set(Object.values(series).flatMap((list) => list.map((point) => point.date)))].sort();
    const out: Record<string, (number | null)[]> = {};
    for (const [id, list] of Object.entries(series)) {
        const byDate = new Map(list.map((point) => [point.date, point.total]));
        let sum = 0;
        let started = false;
        out[id] = dates.map((date) => {
            const value = byDate.get(date);
            if (mode === 'daily') return value === undefined ? null : round1(value);
            if (value !== undefined) {
                sum += value;
                started = true;
            }
            return started ? round1(sum) : null;
        });
    }
    return { dates, values: out };
};

// ---------------------------------------------------------------- comparar dos equipos

export interface LineupItem {
    id: number;
    name: string;
    teamId: number;
    points: number;
    /** Con la corona si es el capitán */
    score: number;
    captain: boolean;
}

export type CompareRow = { kind: 'common'; left: LineupItem; right: LineupItem; diff: number } | { kind: 'pair'; left: LineupItem | null; right: LineupItem | null; diff: number };

/** Dos equipos frente a frente: primero los que tienen los dos (solo cambia la corona) y luego los distintos, de mayor a menor */
export const compareLineups = (left: LineupItem[], right: LineupItem[]): { common: CompareRow[]; pairs: CompareRow[] } => {
    const rightIds = new Set(right.map((item) => item.id));
    const leftIds = new Set(left.map((item) => item.id));
    const desc = (a: LineupItem, b: LineupItem) => b.score - a.score || a.id - b.id;
    const common: CompareRow[] = left
        .filter((item) => rightIds.has(item.id))
        .sort(desc)
        .map((item) => {
            const other = right.find((value) => value.id === item.id)!;
            return { kind: 'common' as const, left: item, right: other, diff: round1(item.score - other.score) };
        });
    const onlyLeft = left.filter((item) => !rightIds.has(item.id)).sort(desc);
    const onlyRight = right.filter((item) => !leftIds.has(item.id)).sort(desc);
    const pairs: CompareRow[] = Array.from({ length: Math.max(onlyLeft.length, onlyRight.length) }, (_, index) => {
        const a = onlyLeft[index] ?? null;
        const b = onlyRight[index] ?? null;
        return { kind: 'pair' as const, left: a, right: b, diff: round1((a?.score ?? 0) - (b?.score ?? 0)) };
    });
    return { common, pairs };
};

// ---------------------------------------------------------------- repetición de un juego jugada a jugada

export interface ReplayAtBat {
    i: number;
    inning: number;
    top: boolean;
    complete: boolean;
    event: string | null;
    rbi: number;
    outs: number | null;
    away: number | null;
    home: number | null;
    desc: string;
    batter: { id: number; name: string };
    pitcher: { id: number; name: string };
}

export interface ReplayPlay {
    i: number;
    runners: { id?: number; scored?: true; earned?: boolean; pitcher?: number; event?: string; out?: true }[];
}

export interface ReplayStep {
    atBat: ReplayAtBat;
    /** Lo que sumó (o restó) cada pelotero en esta jugada y por qué */
    changes: { id: number; pts: number; keys: PartKey[] }[];
    /** Puntos acumulados de cada pelotero al terminar la jugada */
    totals: Record<number, number>;
    /** Partes acumuladas (para los chips «1B ×2 = 6») */
    parts: Record<number, Partial<Record<PartKey, number>>>;
    /** Victoria y salvado, al final del juego */
    final?: boolean;
}

const HIT_EVENTS: Record<string, PartKey> = { single: 'single', double: 'double', triple: 'triple', home_run: 'homeRun' };
const WALK_EVENTS = new Set(['walk', 'intent_walk']);
const K_EVENTS = new Set(['strikeout', 'strikeout_double_play', 'strikeout_triple_play']);

/**
 * Un juego jugada a jugada en puntos de fantasy, con la misma regla del box score (bateo, carreras y robos de quien
 * corre, outs, ponches, hits, bases por bolas y carreras limpias del lanzador; al final, victoria y salvado). Solo
 * deja las jugadas donde intervino alguno de `ids`.
 */
export const replaySteps = (
    atBats: ReplayAtBat[],
    plays: ReplayPlay[],
    decisions: { winner?: { id: number } | null; save?: { id: number } | null } | null | undefined,
    scoring: Scoring,
    ids: number[]
): ReplayStep[] => {
    const wanted = new Set(ids);
    const totals: Record<number, number> = {};
    const parts: Record<number, Partial<Record<PartKey, number>>> = {};
    const byIndex = new Map(plays.map((play) => [play.i, play]));
    const steps: ReplayStep[] = [];
    const snapshot = () => ({ totals: { ...totals }, parts: Object.fromEntries(Object.entries(parts).map(([id, value]) => [id, { ...value }])) });

    for (const atBat of [...atBats].sort((a, b) => a.i - b.i)) {
        const changes = new Map<number, { pts: number; keys: PartKey[] }>();
        const add = (id: number | undefined, key: PartKey, pts: number | undefined) => {
            if (!id || !wanted.has(id) || !pts) return;
            totals[id] = round1((totals[id] ?? 0) + pts);
            parts[id] = { ...parts[id], [key]: (parts[id]?.[key] ?? 0) + 1 };
            const change = changes.get(id) ?? { pts: 0, keys: [] };
            change.pts = round1(change.pts + pts);
            if (!change.keys.includes(key)) change.keys.push(key);
            changes.set(id, change);
        };
        const event = atBat.complete ? atBat.event : null;
        if (event) {
            const hit = HIT_EVENTS[event];
            if (hit) {
                add(atBat.batter.id, hit, scoring.batter[hit]);
                add(atBat.pitcher.id, 'hit', scoring.pitcher.hit);
            }
            if (WALK_EVENTS.has(event)) {
                add(atBat.batter.id, 'walk', scoring.batter.walk);
                add(atBat.pitcher.id, 'walk', scoring.pitcher.walk);
            }
            if (event === 'hit_by_pitch') add(atBat.batter.id, 'hitByPitch', scoring.batter.hitByPitch);
            if (K_EVENTS.has(event)) {
                add(atBat.batter.id, 'strikeOut', scoring.batter.strikeOut);
                add(atBat.pitcher.id, 'strikeOut', scoring.pitcher.strikeOut);
            }
            for (let n = 0; n < (atBat.rbi || 0); n++) add(atBat.batter.id, 'rbi', scoring.batter.rbi);
        }
        for (const runner of byIndex.get(atBat.i)?.runners ?? []) {
            if (runner.scored) {
                add(runner.id, 'run', scoring.batter.run);
                if (runner.earned) add(runner.pitcher ?? atBat.pitcher.id, 'earnedRun', scoring.pitcher.earnedRun);
            }
            if (/^stolen_base/.test(runner.event ?? '')) add(runner.id, 'stolenBase', scoring.batter.stolenBase);
            if (runner.out) add(atBat.pitcher.id, 'out', scoring.pitcher.out);
        }
        const involved = wanted.has(atBat.batter.id) || wanted.has(atBat.pitcher.id) || changes.size > 0;
        if (involved) steps.push({ atBat, changes: [...changes.entries()].map(([id, change]) => ({ id, ...change })), ...snapshot() });
    }
    // Victoria y salvado al final
    const last = atBats[atBats.length - 1];
    if (last) {
        const changes: ReplayStep['changes'] = [];
        for (const [person, key] of [
            [decisions?.winner, 'win'],
            [decisions?.save, 'save']
        ] as const) {
            const pts = scoring.pitcher[key];
            if (!person || !wanted.has(person.id) || !pts) continue;
            totals[person.id] = round1((totals[person.id] ?? 0) + pts);
            parts[person.id] = { ...parts[person.id], [key]: (parts[person.id]?.[key] ?? 0) + 1 };
            changes.push({ id: person.id, pts, keys: [key] });
        }
        if (changes.length) steps.push({ atBat: last, changes, ...snapshot(), final: true });
    }
    return steps;
};

/** Partes acumuladas de un paso con su valor (para los chips) */
export const replayParts = (counts: Partial<Record<PartKey, number>> | undefined, role: 'B' | 'P', scoring: Scoring): PointPart[] => {
    const order: PartKey[] = role === 'P' ? ['out', 'strikeOut', 'win', 'save', 'earnedRun', 'hit', 'walk'] : ['single', 'double', 'triple', 'homeRun', 'run', 'rbi', 'walk', 'hitByPitch', 'stolenBase', 'strikeOut'];
    const table = (role === 'P' ? scoring.pitcher : scoring.batter) as Record<string, number>;
    return order
        .filter((key) => (counts?.[key] ?? 0) > 0 && typeof table[key] === 'number')
        .map((key) => ({ key, count: counts![key]!, per: table[key], pts: round1(counts![key]! * table[key]) }));
};

// ---------------------------------------------------------------- tabla del día (equipos de todos, sin mostrarlos)

export interface DayRow {
    userId: string;
    name: string | null;
    points: number;
    team: number;
    picks: number;
}

/** Puntos del día de cada uno con el equipo que contaba al empezar cada juego (lo cambiado después no cuenta) */
export const dayRanking = (day: FantasyDay, rivals: Rival[]): (DayRow & { rank: number })[] =>
    ranked(
        rivals
            .map((rival) => {
                const entry = effectiveEntry(day, rival.entry);
                const team = teamPoints(day, entry);
                const picks = pickPoints(day, entry);
                return { userId: rival.userId, name: rival.name, team, picks, points: round1(team + picks) };
            })
            .sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId))
    );

// ---------------------------------------------------------------- ayudas de la vista

/** Apellido para frases cortas («Lester», «De Los Santos»: el compuesto va entero, sin «Jr.») */
export const surname = (name: string) => {
    const parts = name
        .trim()
        .split(/\s+/)
        .filter((part) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(part));
    if (parts.length < 2) return name;
    const rest = parts.slice(1);
    const lower = rest.map((part) => part.toLowerCase());
    const join = lower.findIndex((part) => ['de', 'del', 'la', 'los', 'las'].includes(part));
    return join >= 0 ? rest.slice(join).join(' ') : rest[rest.length - 1];
};

/** «vie 16» / «Fri 16» (los días vienen sin hora) */
export const shortDayName = (date: string, lang: string) => {
    const noon = new Date(`${date}T12:00:00Z`);
    const weekday = noon.toLocaleDateString(lang.startsWith('en') ? 'en-US' : 'es-DO', { weekday: 'short', timeZone: 'UTC' }).replace(/\.$/, '');
    return `${weekday} ${noon.getUTCDate()}`;
};

/** La primera letra en mayúscula */
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
