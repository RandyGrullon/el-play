// Estadísticas y ficha del modo PRO: vistas de columnas, quién entra en cada tabla, percentiles contra la liga,
// OPS+, EFE+ y FIP con los promedios y la constante de la liga, y las cuentas de la ficha (últimos días, promedio
// móvil, situaciones en pares, contra cada equipo). Es la misma lógica de la web (el-play/src/lib/pro/estadisticas.ts)
// más el respaldo de la liga calculado con las líneas de todos los peloteros (para cuando /api/v2/pro/team-stats no
// existe todavía en el servidor). Todo sale de datos reales de MLB; lo que no llega queda en null y no se pinta.
import { numOf } from '../../../lib/advanced';
import { STAT_COLUMNS, minPlateAppearances, type HittingLine, type PitchingLine, type PlayerRow, type StatColumn, type StatContext } from '../../../lib/stats';
import type { LeagueId } from '../../../types';
import type { LeagueAverages, ProPhaseId, ProPlayerRow, TeamStats } from '../../../types/pro-liga';

// ---------------------------------------------------------------- fases y temporada

/** Fases de cada liga, en orden (las mismas de /api/v2/pro/players?phase=) */
export const LEAGUE_PHASES: Record<LeagueId, ProPhaseId[]> = {
    lidom: ['regular', 'roundRobin', 'final'],
    wbc: ['pool', 'quarterfinal', 'semifinal', 'final'],
    sdc: ['tournament']
};

/** Con menos de 5 juegos por equipo los percentiles no dicen nada: se ve la temporada pasada completa */
export const TINY_SAMPLE_GAMES = 5;
export const tooEarly = (teamGames: number) => teamGames < TINY_SAMPLE_GAMES;

// ---------------------------------------------------------------- vistas de la tabla PRO

export type Role = 'B' | 'P';
/** Quién entra: bateadores calificados, lanzadores con entradas suficientes o relevistas */
export type PoolKind = 'batters' | 'pitchers' | 'relievers';

export interface StatsView {
    key: string;
    cols: string[];
    /** Columna con la que se ordena al entrar */
    sort: string;
    pool: PoolKind;
}

// Cada vista cabe en 390 px: nombre con la sigla del equipo y 4-7 columnas
export const STATS_VIEWS: Record<Role, StatsView[]> = {
    B: [
        { key: 'clasico', cols: ['avg', 'obp', 'slg', 'ops', 'opsPlus', 'hr', 'rbi'], sort: 'ops', pool: 'batters' },
        { key: 'poder', cols: ['hr', 'iso', 'slg', 'xbh', 'abHr', 'opsPlus'], sort: 'iso', pool: 'batters' },
        { key: 'disciplina', cols: ['bbPct', 'kPct', 'bbK', 'obp', 'opsPlus'], sort: 'bbPct', pool: 'batters' },
        { key: 'corrido', cols: ['sb', 'cs', 'sbPct', 'gidp', 'obp'], sort: 'sb', pool: 'batters' },
        { key: 'fantasy', cols: ['pts', 'ppg', 'g', 'last5'], sort: 'pts', pool: 'batters' }
    ],
    P: [
        { key: 'clasico', cols: ['era', 'eraPlus', 'wl', 'ip', 'k', 'whip'], sort: 'era', pool: 'pitchers' },
        { key: 'dominio', cols: ['kPct', 'k9', 'kBb', 'fip', 'era'], sort: 'kPct', pool: 'pitchers' },
        { key: 'control', cols: ['bb9', 'bbPct', 'whip', 'hr9', 'h9'], sort: 'bb9', pool: 'pitchers' },
        { key: 'relevo', cols: ['sv', 'hld', 'g', 'bf', 'era'], sort: 'sv', pool: 'relievers' }
    ]
};

/** Las del PRO que no están en el catálogo común: puntos de fantasy de los últimos 5 juegos (MLB lastXGames) */
const PRO_ONLY: Record<string, StatColumn> = {
    last5: {
        key: 'last5',
        value: (row) => (row as ProPlayerRow).last5?.pts ?? null,
        show: (row) => {
            const pts = (row as ProPlayerRow).last5?.pts;
            return typeof pts === 'number' ? String(Math.round(pts * 10) / 10) : '—';
        }
    }
};

export const columnOf = (role: Role, key: string): StatColumn => STAT_COLUMNS[role][key] ?? PRO_ONLY[key];

// ---------------------------------------------------------------- quién entra en cada tabla

/** Lanzadores de la tabla PRO: 0,4 entradas por juego del equipo (20 IP en 50 juegos), como en el diseño */
export const minOutsPro = (teamGames: number) => Math.max(3, Math.floor(teamGames * 1.2));
/** Relevistas: ninguna apertura y 1 juego por cada 4 del equipo (12 en 50) */
export const minRelieverGames = (teamGames: number) => Math.max(1, Math.floor(teamGames * 0.24));

export const inPool = (row: PlayerRow, kind: PoolKind, teamGames: number) => {
    if (kind === 'batters') return row.role === 'B' && (row.hitting?.pa ?? 0) >= minPlateAppearances(teamGames);
    const p = row.pitching;
    if (row.role !== 'P' || !p) return false;
    if (kind === 'relievers') return p.gs === 0 && p.g >= minRelieverGames(teamGames);
    return p.outs >= minOutsPro(teamGames);
};

export const poolOf = <Row extends PlayerRow>(rows: Row[], kind: PoolKind, teamGames: number) => rows.filter((row) => inPool(row, kind, teamGames));

/** Grupo de un pelotero para su ficha: los bateadores calificados o los lanzadores con entradas suficientes */
export const poolKindFor = (role: Role): PoolKind => (role === 'P' ? 'pitchers' : 'batters');

// ---------------------------------------------------------------- percentiles

export interface Standing {
    /** 0 = el peor del grupo, 100 = el mejor (en «menos es mejor» ya va invertido) */
    pct: number;
    /** Puesto en el grupo (1 = el mejor) */
    rank: number;
    /** Empata con otro en la cifra que se ve (se escribe «T-3») */
    tied: boolean;
    /** Tamaño del grupo con cifra */
    n: number;
}

interface Ranked {
    id: number;
    value: number;
    label: string;
}

/**
 * Percentil y puesto de cada uno dentro del grupo. Los empates se cuentan con la cifra que se ve (dos .316 empatan
 * aunque MLB tenga más decimales) y toman el puesto medio: así el percentil no depende del orden de la lista.
 */
export const standingsOf = (items: Ranked[], asc = false): Map<number, Standing> => {
    const n = items.length;
    const better = (a: number, b: number) => (asc ? a < b : a > b);
    const out = new Map<number, Standing>();
    for (const item of items) {
        let above = 0;
        let same = 0;
        for (const other of items) {
            if (other === item) continue;
            if (other.label === item.label) same += 1;
            else if (better(other.value, item.value)) above += 1;
        }
        const below = n - 1 - above - same;
        const pct = n > 1 ? Math.round((100 * (below + same / 2)) / (n - 1)) : 50;
        out.set(item.id, { pct, rank: above + 1, tied: same > 0, n });
    }
    return out;
};

/** Percentil de una cifra contra un grupo en el que no está (un pelotero que no califica): sin puesto */
export const percentileAgainst = (value: number, values: number[], asc = false) => {
    if (!values.length) return null;
    const below = values.filter((other) => (asc ? other > value : other < value)).length;
    const same = values.filter((other) => other === value).length;
    return Math.round((100 * (below + same / 2)) / values.length);
};

/** Percentiles de una columna en el grupo, por id de pelotero */
export const columnStandings = (pool: PlayerRow[], column: StatColumn, ctx?: StatContext | null) =>
    standingsOf(
        pool.flatMap((row) => {
            const value = column.value(row, ctx);
            return value === null || !Number.isFinite(value) ? [] : [{ id: row.id, value, label: column.show(row, ctx) }];
        }),
        !!column.asc
    );

/**
 * Ordena el grupo por una columna: los que no tienen cifra al final; en un empate decide la columna principal de la
 * vista y después el nombre (así el orden no salta entre lecturas).
 */
export const sortPool = <Row extends PlayerRow>(rows: Row[], column: StatColumn, asc: boolean, ctx?: StatContext | null, tiebreak?: StatColumn) =>
    rows
        .map((row) => ({ row, value: column.value(row, ctx), tie: tiebreak ? tiebreak.value(row, ctx) : null }))
        .sort((a, b) => {
            const emptyA = a.value === null || !Number.isFinite(a.value);
            const emptyB = b.value === null || !Number.isFinite(b.value);
            if (emptyA || emptyB) return emptyA === emptyB ? a.row.name.localeCompare(b.row.name) : emptyA ? 1 : -1;
            const diff = asc ? a.value! - b.value! : b.value! - a.value!;
            if (diff) return diff;
            if (a.tie !== null && b.tie !== null && a.tie !== b.tie) return tiebreak?.asc ? a.tie - b.tie : b.tie - a.tie;
            return a.row.name.localeCompare(b.row.name);
        })
        .map((item) => item.row);

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Nombre corto para la tabla y la gráfica: «G. Celestino». Si dos se leen igual (A. Rodriguez y A. Rodríguez)
 * se usan tres letras del nombre: «Alb. Rodriguez», «Ade. Rodríguez».
 */
export const shortNames = (rows: { id: number; name: string }[]) => {
    const short = (name: string, letters = 1) => {
        const parts = name.trim().split(/\s+/);
        if (parts.length < 2) return name;
        const first = parts[0].includes('.') ? parts[0] : `${parts[0].slice(0, letters)}.`;
        return `${first} ${parts.slice(1).join(' ')}`;
    };
    const groups = new Map<string, { id: number; name: string }[]>();
    for (const row of rows) {
        const key = plain(short(row.name));
        groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const out = new Map<number, string>();
    groups.forEach((members) => members.forEach((row) => out.set(row.id, short(row.name, members.length > 1 ? 3 : 1))));
    return out;
};

/** Promedio simple de una columna en el grupo (las flechas de los tiles: «▲ 8 más que el promedio de los calificados») */
export const poolAverage = (pool: PlayerRow[], column: StatColumn, ctx?: StatContext | null) => {
    const values = pool.map((row) => column.value(row, ctx)).filter((value): value is number => value !== null && Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
};

// ---------------------------------------------------------------- la liga (promedios y constante FIP)

/** Contexto de la liga para OPS+, EFE+ y FIP; null si no llegaron los promedios */
export const contextOf = (teamStats: TeamStats | undefined | null): StatContext | null => {
    if (!teamStats) return null;
    const { averages, constants } = teamStats;
    const ctx = { obp: numOf(averages.obp), slg: numOf(averages.slg), era: numOf(averages.era), fipConstant: constants.fip ?? null };
    return ctx.obp === null && ctx.era === null && ctx.fipConstant === null ? null : ctx;
};

const ratio = (num: number, den: number) => (den > 0 ? num / den : null);
const rate3 = (value: number | null) => (value === null ? null : value.toFixed(3).replace(/^0(?=\.)/, ''));
const dec = (value: number | null, digits: number) => (value === null ? null : value.toFixed(digits));

/**
 * Promedios de la liga sumando las líneas de TODOS los peloteros de la lista (no promedio de promedios), con la
 * constante FIP de la liga: EFE liga − (13·HR + 3·(BB+GP) − 2·K) / IP. Es el respaldo cuando el servidor todavía no
 * tiene /api/v2/pro/team-stats: mismos datos de MLB, sumados aquí. null sin juegos.
 */
export const leagueFromPlayers = (players: PlayerRow[]): { averages: LeagueAverages; ctx: StatContext } | null => {
    const hit = sumHitting(players.map((row) => row.hitting));
    const pitch = sumPitching(players.map((row) => row.pitching));
    if (!hit.pa && !pitch.outs) return null;
    const slash = slashOf(hit);
    const era = eraOf(pitch);
    const ip = pitch.outs / 3;
    const fipConstant = era !== null && ip > 0 ? era - (13 * pitch.hr + 3 * (pitch.bb + pitch.hbp) - 2 * pitch.k) / ip : null;
    const iso = slash.slg !== null && slash.avg !== null ? slash.slg - slash.avg : null;
    const babip = ratio(hit.h - hit.hr, hit.ab - hit.k - hit.hr + hit.sf);
    const averages: LeagueAverages = {
        avg: rate3(slash.avg),
        obp: rate3(slash.obp),
        slg: rate3(slash.slg),
        ops: rate3(slash.ops),
        iso: rate3(iso),
        babip: rate3(babip),
        kPct: hit.pa ? (100 * hit.k) / hit.pa : null,
        bbPct: hit.pa ? (100 * hit.bb) / hit.pa : null,
        hrPerGame: null,
        runsPerGame: null,
        era: dec(era, 2),
        whip: dec(whipOf(pitch), 2),
        k9: ip > 0 ? (9 * pitch.k) / ip : null,
        bb9: ip > 0 ? (9 * pitch.bb) / ip : null,
        hr9: ip > 0 ? (9 * pitch.hr) / ip : null,
        pitchingKPct: pitch.bf ? (100 * pitch.k) / pitch.bf : null,
        pitchingBbPct: pitch.bf ? (100 * pitch.bb) / pitch.bf : null
    };
    return { averages, ctx: { obp: slash.obp, slg: slash.slg, era, fipConstant } };
};

/** Color de una celda por percentil (azul mejor, gris en el medio, rojo peor): devuelve la opacidad y el lado */
export const percentileTint = (pct: number) => {
    const k = (pct - 50) / 50;
    if (Math.abs(k) < 0.12) return { side: 'mid' as const, alpha: 0.1 };
    return { side: k > 0 ? ('good' as const) : ('bad' as const), alpha: Math.min(0.78, 0.14 + Math.abs(k) * 0.66) };
};

// ---------------------------------------------------------------- cara a cara

export interface Duel {
    key: string;
    a: Standing | null;
    b: Standing | null;
    /** Quién gana la métrica (por percentil); null si empatan o falta una cifra */
    winner: 'a' | 'b' | null;
}

/** Métrica por métrica gana el de mayor percentil; cuenta victorias y empates */
export const duelOf = (keys: string[], a: Map<string, Standing | null>, b: Map<string, Standing | null>) => {
    const rows: Duel[] = keys.map((key) => {
        const sa = a.get(key) ?? null;
        const sb = b.get(key) ?? null;
        const winner = sa && sb ? (sa.pct > sb.pct ? 'a' : sb.pct > sa.pct ? 'b' : null) : null;
        return { key, a: sa, b: sb, winner };
    });
    return {
        rows,
        winsA: rows.filter((row) => row.winner === 'a').length,
        winsB: rows.filter((row) => row.winner === 'b').length,
        ties: rows.filter((row) => row.winner === null && row.a && row.b).length
    };
};

// ---------------------------------------------------------------- cuentas con líneas sumadas

export interface HitCounts {
    g: number;
    pa: number;
    ab: number;
    h: number;
    d: number;
    t: number;
    hr: number;
    rbi: number;
    r: number;
    bb: number;
    k: number;
    hbp: number;
    sf: number;
    sb: number;
    cs: number;
    tb: number;
}

export interface PitchCounts {
    g: number;
    outs: number;
    er: number;
    h: number;
    bb: number;
    k: number;
    hr: number;
    hbp: number;
    bf: number;
}

const tbOf = (h: Pick<HittingLine, 'h' | 'd' | 't' | 'hr' | 'tb'>) => h.tb ?? h.h + h.d + 2 * h.t + 3 * h.hr;

export const sumHitting = (lines: (HittingLine | null | undefined)[]): HitCounts => {
    const total: HitCounts = { g: 0, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, r: 0, bb: 0, k: 0, hbp: 0, sf: 0, sb: 0, cs: 0, tb: 0 };
    for (const line of lines) {
        if (!line) continue;
        total.g += line.g ?? 0;
        total.pa += line.pa ?? 0;
        total.ab += line.ab ?? 0;
        total.h += line.h ?? 0;
        total.d += line.d ?? 0;
        total.t += line.t ?? 0;
        total.hr += line.hr ?? 0;
        total.rbi += line.rbi ?? 0;
        total.r += line.r ?? 0;
        total.bb += line.bb ?? 0;
        total.k += line.k ?? 0;
        total.hbp += line.hbp ?? 0;
        total.sf += line.sf ?? 0;
        total.sb += line.sb ?? 0;
        total.cs += line.cs ?? 0;
        total.tb += tbOf(line);
    }
    return total;
};

export const sumPitching = (lines: (PitchingLine | null | undefined)[]): PitchCounts => {
    const total: PitchCounts = { g: 0, outs: 0, er: 0, h: 0, bb: 0, k: 0, hr: 0, hbp: 0, bf: 0 };
    for (const line of lines) {
        if (!line) continue;
        total.g += line.g ?? 0;
        total.outs += line.outs ?? 0;
        total.er += line.er ?? 0;
        total.h += line.h ?? 0;
        total.bb += line.bb ?? 0;
        total.k += line.k ?? 0;
        total.hr += line.hr ?? 0;
        total.hbp += line.hbp ?? 0;
        total.bf += line.bf ?? 0;
    }
    return total;
};

/** AVG, OBP, SLG y OPS de unas cuentas (las del juego a juego de MLB traen los acumulados, no los del juego) */
export const slashOf = (c: Pick<HitCounts, 'ab' | 'h' | 'bb' | 'hbp' | 'sf' | 'tb'>) => {
    const avg = ratio(c.h, c.ab);
    const obp = ratio(c.h + c.bb + c.hbp, c.ab + c.bb + c.hbp + c.sf);
    const slg = ratio(c.tb, c.ab);
    return { avg, obp, slg, ops: obp !== null && slg !== null ? obp + slg : (obp ?? slg) };
};

/** EFE de unas cuentas (9 × CL / IP) */
export const eraOf = (c: Pick<PitchCounts, 'er' | 'outs'>) => (c.outs > 0 ? (27 * c.er) / c.outs : null);
/** WHIP de unas cuentas */
export const whipOf = (c: Pick<PitchCounts, 'h' | 'bb' | 'outs'>) => (c.outs > 0 ? (3 * (c.h + c.bb)) / c.outs : null);

/** «12.1» entradas de unos outs */
export const ipOf = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;

/** Restar dos líneas (la temporada menos un split: «sin corredores en posición») */
export const minusHitting = (season: HittingLine, part: HittingLine): HitCounts => {
    const a = sumHitting([season]);
    const b = sumHitting([part]);
    const out = { ...a };
    (Object.keys(out) as (keyof HitCounts)[]).forEach((key) => {
        out[key] = Math.max(0, a[key] - b[key]);
    });
    // Juegos no se restan: los turnos con corredores en posición reparten casi todos los juegos
    out.g = a.g;
    return out;
};

// ---------------------------------------------------------------- juego a juego: ventanas y promedio móvil

export interface LogGame {
    gamePk: number;
    date: string;
    hitting: HittingLine | null;
    pitching: PitchingLine | null;
    pts: number;
}

const dayMs = 24 * 60 * 60 * 1000;
const dayNumber = (day: string) => Math.round(Date.parse(`${day.slice(0, 10)}T12:00:00Z`) / dayMs);

/** Juegos de los últimos `days` días que terminan en `end` (YYYY-MM-DD), del más viejo al más nuevo */
export const windowGames = <G extends LogGame>(log: G[], days: number, end: string) => {
    const last = dayNumber(end);
    const first = last - days + 1;
    return log
        .filter((game) => {
            const day = dayNumber(game.date);
            return day >= first && day <= last;
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.gamePk - b.gamePk);
};

/** Cifra de un tramo de juegos: OPS del bateador o EFE del lanzador */
export const valueOfGames = (games: LogGame[], role: Role) =>
    role === 'P' ? eraOf(sumPitching(games.map((game) => game.pitching))) : slashOf(sumHitting(games.map((game) => game.hitting))).ops;

/**
 * Promedio móvil de `size` juegos para cada juego de `games` (cronológico), usando los anteriores de `history`
 * (todo el juego a juego, cronológico) para que el primer punto ya tenga sus 5 juegos.
 */
export const rollingValues = (history: LogGame[], games: LogGame[], role: Role, size = 5) =>
    games.map((game) => {
        const index = history.findIndex((item) => item.gamePk === game.gamePk);
        const slice = history.slice(Math.max(0, index - size + 1), index + 1);
        return valueOfGames(slice, role);
    });

/** El juego a juego en orden de fecha (MLB lo da del más nuevo al más viejo) */
export const chronological = <G extends LogGame>(log: G[]) => [...log].sort((a, b) => a.date.localeCompare(b.date) || a.gamePk - b.gamePk);

/** Dobles juegos: «J1» y «J2» por el orden en que se jugaron el mismo día */
export const doubleHeaderTags = (log: LogGame[]) => {
    const byDay = new Map<string, LogGame[]>();
    for (const game of chronological(log)) byDay.set(game.date, [...(byDay.get(game.date) ?? []), game]);
    const tags = new Map<number, number>();
    byDay.forEach((games) => {
        if (games.length > 1) games.forEach((game, index) => tags.set(game.gamePk, index + 1));
    });
    return tags;
};

/** Promedio móvil simple de los puntos (fantasy por juego) */
export const movingAverage = (values: number[], size = 5) =>
    values.map((_, index) => {
        const slice = values.slice(Math.max(0, index - size + 1), index + 1);
        return slice.reduce((sum, value) => sum + value, 0) / slice.length;
    });

// ---------------------------------------------------------------- contra cada equipo (del juego a juego)

export interface VsTeamRow {
    opponentId: number;
    g: number;
    hitting: HitCounts | null;
    pitching: PitchCounts | null;
    pts: number;
}

export const vsTeamsOf = (log: (LogGame & { opponent: { id: number } | null })[], role: Role): VsTeamRow[] => {
    const groups = new Map<number, (LogGame & { opponent: { id: number } | null })[]>();
    for (const game of log) {
        if (!game.opponent) continue;
        groups.set(game.opponent.id, [...(groups.get(game.opponent.id) ?? []), game]);
    }
    return [...groups.entries()].map(([opponentId, games]) => ({
        opponentId,
        g: games.length,
        hitting: role === 'B' ? sumHitting(games.map((game) => game.hitting)) : null,
        pitching: role === 'P' ? sumPitching(games.map((game) => game.pitching)) : null,
        pts: Math.round(games.reduce((sum, game) => sum + game.pts, 0) * 10) / 10
    }));
};

// ---------------------------------------------------------------- ficha: bio y situaciones

/** Día en que arranca la temporada de cada liga (para la edad «en la 2025-26») */
const SEASON_START: Record<LeagueId, string> = { lidom: '10-15', wbc: '03-01', sdc: '02-01' };

/** Edad al empezar la temporada vista */
export const seasonAge = (birthDate: string | null | undefined, season: number, league: LeagueId) => {
    if (!birthDate) return null;
    const [year, month, day] = birthDate.slice(0, 10).split('-').map(Number);
    const [startMonth, startDay] = SEASON_START[league].split('-').map(Number);
    if (!year) return null;
    let age = season - year;
    if (month > startMonth || (month === startMonth && day > startDay)) age -= 1;
    return age;
};

/** Hacia dónde jala: un derecho hacia el jardín izquierdo, un zurdo hacia el derecho; un ambidiestro no */
export const pullSide = (bats: string | null | undefined): 'lf' | 'rf' | null => (bats === 'R' ? 'lf' : bats === 'L' ? 'rf' : null);

/**
 * Lado que destaca en un par de situaciones: hace falta una diferencia de .100 de OPS y al menos 20 apariciones
 * de cada lado (con menos, la frase sería ruido). En pitcheo el OPS es en contra: menos es mejor.
 */
export const pairVerdict = (left: number | null, right: number | null, leftPa: number, rightPa: number, role: Role, threshold = 0.1, minPa = 20) => {
    if (left === null || right === null || leftPa < minPa || rightPa < minPa) return null;
    const diff = left - right;
    if (Math.abs(diff) < threshold) return null;
    const leftBetter = role === 'P' ? diff < 0 : diff > 0;
    return { side: leftBetter ? ('left' as const) : ('right' as const), diff: Math.abs(diff) };
};

/** Puesto en una cifra de conteo entre todos los del rol (1 = el que más); null si es 0 */
export const countRank = (rows: PlayerRow[], id: number, column: StatColumn) => {
    const mine = rows.find((row) => row.id === id);
    const value = mine ? column.value(mine) : null;
    if (value === null || value <= 0) return null;
    return 1 + rows.filter((row) => row.role === mine!.role && (column.value(row) ?? -Infinity) > value).length;
};

/** Defensores de una posición con entradas suficientes: 1 entrada por juego del equipo (y al menos 5) */
export const minFieldingOuts = (teamGames: number) => Math.max(15, Math.floor(teamGames * 3));
