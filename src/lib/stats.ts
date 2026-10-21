// Estadísticas de peloteros: la temporada de todos (para buscar y comparar) y la ficha de cada uno.
// Los puntos de fantasy vienen calculados del servidor con la misma regla del juego.
import { useQuery } from '@tanstack/react-query';
import { ApiError, networkErrorCode } from './api';
import type { LeagueId } from '../types';
import { API_BASE } from './config';
import { battingAdvanced, eraPlus, numOf, opsPlus, pitchingAdvanced } from './advanced';

export interface HittingLine {
    g: number;
    pa: number;
    ab: number;
    r: number;
    h: number;
    d: number;
    t: number;
    hr: number;
    rbi: number;
    bb: number;
    k: number;
    sb: number;
    cs: number;
    hbp: number;
    sf?: number;
    tb?: number;
    gidp?: number;
    avg: string;
    obp: string;
    slg: string;
    ops: string;
}

export interface PitchingLine {
    g: number;
    gs: number;
    ip: string;
    outs: number;
    w: number;
    l: number;
    sv: number;
    hld: number;
    k: number;
    bb: number;
    h: number;
    er: number;
    hr: number;
    hbp?: number;
    bf?: number;
    np?: number;
    era: string;
    whip: string;
}

export interface StatsTeam {
    id: number;
    abbrev: string;
    name: string;
    color: string;
    logo: string;
}

export interface PlayerRow {
    id: number;
    name: string;
    teamId: number | null;
    pos: string;
    number: string | null;
    role: 'B' | 'P';
    hitting: HittingLine | null;
    pitching: PitchingLine | null;
    g: number;
    pts: number;
    ppg: number;
}

export interface PlayersData {
    league: LeagueId;
    season: number;
    currentSeason: number;
    seasons: number[];
    isPreviousSeason: boolean;
    teams: Record<string, StatsTeam>;
    players: PlayerRow[];
}

export interface GameLogRow {
    gamePk: number;
    date: string;
    isHome: boolean;
    isWin: boolean | null;
    opponent: StatsTeam | null;
    hitting: HittingLine | null;
    pitching: PitchingLine | null;
    pts: number;
}

export interface CareerRow {
    season: number;
    team: StatsTeam | null;
    hitting?: HittingLine;
    pitching?: PitchingLine;
    pts: number;
}

export interface PlayerDetail {
    league: LeagueId;
    season: number;
    currentSeason: number;
    id: number;
    name: string;
    number: string | null;
    pos: string;
    role: 'B' | 'P';
    bats: string | null;
    throws: string | null;
    age: number | null;
    birthDate: string | null;
    birthPlace: string | null;
    height: string | null;
    weight: number | null;
    mlbDebut: string | null;
    team: StatsTeam | null;
    hitting: HittingLine | null;
    pitching: PitchingLine | null;
    g: number;
    pts: number;
    ppg: number;
    log: GameLogRow[];
    career: CareerRow[];
}

const getJson = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const response = await fetch(path, { signal, headers: { Accept: 'application/json' } }).catch(async (error: Error) => {
        if (error.name === 'AbortError') throw error;
        // navigator.onLine no existe en el teléfono: el estado real lo da NetInfo
        throw new ApiError(error.message, await networkErrorCode());
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ApiError(`HTTP ${response.status}`, typeof body.error === 'string' ? body.error : 'internal_error', response.status);
    }
    return (await response.json()) as T;
};

const retry = (failureCount: number, error: Error) => !(error instanceof ApiError && [400, 404].includes(error.status)) && failureCount < 2;

/** `enabled` solo lo usa el PRO (respaldo si su ruta no existe); el Lite la monta siempre */
export const usePlayers = (league: LeagueId, season?: number, enabled = true) =>
    useQuery({
        queryKey: ['players', league, season ?? 'actual'],
        queryFn: ({ signal }) => getJson<PlayersData>(`${API_BASE}/api/v2/players?league=${league}${season ? `&season=${season}` : ''}`, signal),
        enabled,
        staleTime: 5 * 60 * 1000,
        placeholderData: (previous) => (previous?.league === league ? previous : undefined),
        retry
    });

export const usePlayer = (id: number | null, league: LeagueId, season?: number) =>
    useQuery({
        queryKey: ['player', league, id, season ?? 'actual'],
        queryFn: ({ signal }) => getJson<PlayerDetail>(`${API_BASE}/api/v2/player/${id}?league=${league}${season ? `&season=${season}` : ''}`, signal),
        enabled: !!id,
        staleTime: 5 * 60 * 1000,
        retry
    });

// ---------------------------------------------------------------- catálogo de columnas del PRO

/**
 * Promedios de la liga para las cifras que se comparan con ella (OPS+, EFE+) y la constante FIP de la liga.
 * Salen de /api/v2/pro/team-stats o de sumar las líneas de todos los peloteros; sin ellos esas columnas quedan en «—».
 */
export interface StatContext {
    obp: number | null;
    slg: number | null;
    era: number | null;
    fipConstant: number | null;
}

/** Una columna de estadística: cómo se lee, cómo se escribe y si menos es mejor */
export interface StatColumn {
    key: string;
    /** Valor para ordenar y para el percentil (null = va al final y no cuenta) */
    value: (row: PlayerRow, ctx?: StatContext | null) => number | null;
    /** Cómo se escribe en la tabla */
    show: (row: PlayerRow, ctx?: StatContext | null) => string;
    /** Menos es mejor (EFE, WHIP, K% del bateador…) */
    asc?: boolean;
    /** Promedios: solo cuentan quienes tienen turnos o entradas suficientes */
    rate?: boolean;
    /** Volumen o contexto (J, IP, BE, G-P): va sin color de percentil */
    neutral?: boolean;
}

const fixed1 = (value: number) => String(Math.round(value * 10) / 10);
const dash = (value: number | null, write: (value: number) => string) => (value === null || !Number.isFinite(value) ? '—' : write(value));

// Cuentas de bateo y pitcheo: se escriben como en el Lite («0» si no hay línea)
const hitCount = (key: keyof HittingLine, asc = false): StatColumn => ({ key, value: (r) => (r.hitting ? ((r.hitting[key] as number | undefined) ?? null) : null), show: (r) => String((r.hitting?.[key] as number | undefined) ?? 0), asc });
const pitchCount = (key: keyof PitchingLine, asc = false): StatColumn => ({ key, value: (r) => (r.pitching ? ((r.pitching[key] as number | undefined) ?? null) : null), show: (r) => String((r.pitching?.[key] as number | undefined) ?? 0), asc });
// Cifras calculadas con la línea completa (advanced.ts): ISO, BABIP, K%, FIP…
const hitCalc = (key: string, calc: (h: HittingLine) => number | null, write: (value: number) => string, extra: Partial<StatColumn> = {}): StatColumn => ({
    key,
    value: (r) => (r.hitting ? calc(r.hitting) : null),
    show: (r) => dash(r.hitting ? calc(r.hitting) : null, write),
    rate: true,
    ...extra
});
const pitchCalc = (key: string, calc: (p: PitchingLine, ctx?: StatContext | null) => number | null, write: (value: number) => string, extra: Partial<StatColumn> = {}): StatColumn => ({
    key,
    value: (r, ctx) => (r.pitching ? calc(r.pitching, ctx) : null),
    show: (r, ctx) => dash(r.pitching ? calc(r.pitching, ctx) : null, write),
    rate: true,
    ...extra
});

const rate3 = (value: number) => value.toFixed(3).replace(/^0(?=\.)/, '');
const dec = (digits: number) => (value: number) => value.toFixed(digits);
const pct1 = (value: number) => `${(value * 100).toFixed(1)}%`;
const whole = (value: number) => String(Math.round(value));

/** Todas las columnas del PRO (Estadísticas, ficha y cara a cara), por rol */
export const STAT_COLUMNS: Record<'B' | 'P', Record<string, StatColumn>> = {
    B: {
        pts: { key: 'pts', value: (r) => r.pts, show: (r) => fixed1(r.pts) },
        ppg: { key: 'ppg', value: (r) => (r.g ? r.ppg : null), show: (r) => fixed1(r.ppg) },
        g: { ...hitCount('g'), neutral: true },
        pa: { ...hitCount('pa'), neutral: true },
        ab: { ...hitCount('ab'), neutral: true },
        h: hitCount('h'),
        d: hitCount('d'),
        t: hitCount('t'),
        hr: hitCount('hr'),
        rbi: hitCount('rbi'),
        r: hitCount('r'),
        bb: hitCount('bb'),
        k: hitCount('k', true),
        sb: hitCount('sb'),
        cs: hitCount('cs', true),
        gidp: hitCount('gidp', true),
        avg: { key: 'avg', value: (r) => numOf(r.hitting?.avg), show: (r) => r.hitting?.avg ?? '—', rate: true },
        obp: { key: 'obp', value: (r) => numOf(r.hitting?.obp), show: (r) => r.hitting?.obp ?? '—', rate: true },
        slg: { key: 'slg', value: (r) => numOf(r.hitting?.slg), show: (r) => r.hitting?.slg ?? '—', rate: true },
        ops: { key: 'ops', value: (r) => numOf(r.hitting?.ops), show: (r) => r.hitting?.ops ?? '—', rate: true },
        opsPlus: {
            key: 'opsPlus',
            value: (r, ctx) => (ctx ? opsPlus(numOf(r.hitting?.obp), numOf(r.hitting?.slg), ctx) : null),
            show: (r, ctx) => dash(ctx ? opsPlus(numOf(r.hitting?.obp), numOf(r.hitting?.slg), ctx) : null, whole),
            rate: true
        },
        iso: hitCalc('iso', (h) => battingAdvanced(h).iso, rate3),
        babip: hitCalc('babip', (h) => battingAdvanced(h).babip, rate3),
        kPct: hitCalc('kPct', (h) => battingAdvanced(h).kPct, pct1, { asc: true }),
        bbPct: hitCalc('bbPct', (h) => battingAdvanced(h).bbPct, pct1),
        bbK: hitCalc('bbK', (h) => battingAdvanced(h).bbK, dec(2)),
        abHr: hitCalc('abHr', (h) => battingAdvanced(h).abHr, dec(1), { asc: true }),
        xbh: { key: 'xbh', value: (r) => (r.hitting ? battingAdvanced(r.hitting).xbh : null), show: (r) => (r.hitting ? String(battingAdvanced(r.hitting).xbh) : '—') },
        sbPct: hitCalc('sbPct', (h) => battingAdvanced(h).sbPct, (value) => `${Math.round(value * 100)}%`)
    },
    P: {
        pts: { key: 'pts', value: (r) => r.pts, show: (r) => fixed1(r.pts) },
        ppg: { key: 'ppg', value: (r) => (r.g ? r.ppg : null), show: (r) => fixed1(r.ppg) },
        g: { ...pitchCount('g'), neutral: true },
        gs: { ...pitchCount('gs'), neutral: true },
        ip: { key: 'ip', value: (r) => r.pitching?.outs ?? null, show: (r) => r.pitching?.ip ?? '0.0', neutral: true },
        wl: { key: 'wl', value: (r) => (r.pitching ? r.pitching.w - r.pitching.l : null), show: (r) => (r.pitching ? `${r.pitching.w}-${r.pitching.l}` : '—'), neutral: true },
        bf: { ...pitchCount('bf'), neutral: true },
        w: pitchCount('w'),
        l: pitchCount('l', true),
        sv: pitchCount('sv'),
        hld: pitchCount('hld'),
        k: pitchCount('k'),
        bb: pitchCount('bb', true),
        h: pitchCount('h', true),
        hr: pitchCount('hr', true),
        er: pitchCount('er', true),
        era: { key: 'era', value: (r) => numOf(r.pitching?.era), show: (r) => r.pitching?.era ?? '—', asc: true, rate: true },
        whip: { key: 'whip', value: (r) => numOf(r.pitching?.whip), show: (r) => r.pitching?.whip ?? '—', asc: true, rate: true },
        eraPlus: pitchCalc('eraPlus', (p, ctx) => (ctx ? eraPlus(numOf(p.era), ctx.era) : null), whole),
        // FIP con la constante de la liga (sin ella no hay cifra: la fija de MLB no es la de esta liga)
        fip: pitchCalc('fip', (p, ctx) => (ctx && ctx.fipConstant !== null ? pitchingAdvanced(p, ctx.fipConstant).fip : null), dec(2), { asc: true }),
        k9: pitchCalc('k9', (p) => pitchingAdvanced(p).k9, dec(1)),
        bb9: pitchCalc('bb9', (p) => pitchingAdvanced(p).bb9, dec(1), { asc: true }),
        h9: pitchCalc('h9', (p) => pitchingAdvanced(p).h9, dec(1), { asc: true }),
        hr9: pitchCalc('hr9', (p) => pitchingAdvanced(p).hr9, dec(2), { asc: true }),
        kBb: pitchCalc('kBb', (p) => pitchingAdvanced(p).kBb, dec(2)),
        kPct: pitchCalc('kPct', (p) => pitchingAdvanced(p).kPct, pct1),
        bbPct: pitchCalc('bbPct', (p) => pitchingAdvanced(p).bbPct, pct1, { asc: true })
    }
};

/** Juegos del equipo que más ha jugado (la base de la regla de calificado) */
export const teamGamesOf = (players: Pick<PlayerRow, 'hitting'>[]) => Math.max(0, ...players.map((row) => row.hitting?.g ?? 0));

/** Apariciones mínimas de un bateador calificado del PRO: 2 por juego del equipo (y al menos 5) */
export const minPlateAppearances = (teamGames: number) => Math.max(5, Math.floor(teamGames * 2));

// ---------------------------------------------------------------- orden de la tabla

export type SortKey = 'pts' | 'ppg' | 'avg' | 'hr' | 'rbi' | 'h' | 'sb' | 'ops' | 'era' | 'k' | 'w' | 'sv' | 'whip' | 'ip';

export interface SortOption {
    key: SortKey;
    /** Valor para ordenar (null = va al final) */
    value: (row: PlayerRow) => number | null;
    /** Lo que se muestra grande a la derecha */
    show: (row: PlayerRow) => string;
    asc?: boolean;
    /** Promedios: solo cuentan quienes tienen turnos o entradas suficientes para la fecha */
    rate?: boolean;
}

const num = (value: string | undefined | null) => {
    const parsed = parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
};

const fmt = (value: number) => String(Math.round(value * 10) / 10);

export const SORTS: Record<'B' | 'P', SortOption[]> = {
    B: [
        { key: 'pts', value: (r) => r.pts, show: (r) => fmt(r.pts) },
        { key: 'ppg', value: (r) => (r.g ? r.ppg : null), show: (r) => fmt(r.ppg) },
        { key: 'avg', value: (r) => num(r.hitting?.avg), show: (r) => r.hitting?.avg ?? '—', rate: true },
        { key: 'hr', value: (r) => r.hitting?.hr ?? null, show: (r) => String(r.hitting?.hr ?? 0) },
        { key: 'rbi', value: (r) => r.hitting?.rbi ?? null, show: (r) => String(r.hitting?.rbi ?? 0) },
        { key: 'h', value: (r) => r.hitting?.h ?? null, show: (r) => String(r.hitting?.h ?? 0) },
        { key: 'sb', value: (r) => r.hitting?.sb ?? null, show: (r) => String(r.hitting?.sb ?? 0) },
        { key: 'ops', value: (r) => num(r.hitting?.ops), show: (r) => r.hitting?.ops ?? '—', rate: true }
    ],
    P: [
        { key: 'pts', value: (r) => r.pts, show: (r) => fmt(r.pts) },
        { key: 'ppg', value: (r) => (r.g ? r.ppg : null), show: (r) => fmt(r.ppg) },
        { key: 'era', value: (r) => num(r.pitching?.era), show: (r) => r.pitching?.era ?? '—', asc: true, rate: true },
        { key: 'k', value: (r) => r.pitching?.k ?? null, show: (r) => String(r.pitching?.k ?? 0) },
        { key: 'w', value: (r) => r.pitching?.w ?? null, show: (r) => String(r.pitching?.w ?? 0) },
        { key: 'sv', value: (r) => r.pitching?.sv ?? null, show: (r) => String(r.pitching?.sv ?? 0) },
        { key: 'whip', value: (r) => num(r.pitching?.whip), show: (r) => r.pitching?.whip ?? '—', asc: true, rate: true },
        { key: 'ip', value: (r) => r.pitching?.outs ?? null, show: (r) => r.pitching?.ip ?? '0.0' }
    ]
};

/**
 * Mínimo para entrar en los promedios, el mismo de MLB con el que salen los Líderes (playerPool=QUALIFIED): 2,7
 * apariciones por juego del equipo que más ha jugado para bateo y 0,8 entradas (2,4 outs) por juego para pitcheo.
 * Así Líderes y Estadísticas ponen al mismo primero (comprobado con LIDOM 2025-26 y 2026-27).
 */
export const qualifies = (row: PlayerRow, teamGames: number) =>
    row.role === 'P' ? (row.pitching?.outs ?? 0) >= Math.round(teamGames * 2.4) : (row.hitting?.pa ?? 0) >= Math.round(teamGames * 2.7);

export const sortPlayers = (rows: PlayerRow[], option: SortOption, teamGames: number) => {
    const ranked = rows.map((row) => ({ row, value: option.rate && !qualifies(row, teamGames) ? null : option.value(row) }));
    ranked.sort((a, b) => {
        if (a.value === null && b.value === null) return b.row.pts - a.row.pts || a.row.name.localeCompare(b.row.name);
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return (option.asc ? a.value - b.value : b.value - a.value) || b.row.pts - a.row.pts;
    });
    return ranked.map(({ row, value }) => ({ row, ranked: value !== null }));
};

/** Sin tildes ni mayúsculas, para buscar «Jose» y encontrar «José» */
export const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Resumen corto de la temporada: «.312, 4 HR, 12 CI» o «2-1, 2.45 EFE, 30 K» */
export const seasonSummary = (row: Pick<PlayerRow, 'role' | 'hitting' | 'pitching'>, t: (key: string, options?: Record<string, unknown>) => string) => {
    if (row.role === 'P') {
        const p = row.pitching;
        if (!p || !p.g) return null;
        return t('statsPage.pitchSummary', { w: p.w, l: p.l, era: p.era, k: p.k, ip: p.ip });
    }
    const h = row.hitting;
    if (!h || !h.g) return null;
    return t('statsPage.batSummary', { avg: h.avg, hr: h.hr, rbi: h.rbi, h: h.h, ab: h.ab });
};

/** Línea de un juego: «2-4, HR, 3 CI» o «6.0 IP, 7 K, 1 CL» */
export const gameLine = (game: Pick<GameLogRow, 'hitting' | 'pitching'>, role: 'B' | 'P', t: (key: string, options?: Record<string, unknown>) => string) => {
    if (role === 'P' && game.pitching) {
        const p = game.pitching;
        return [t('statsPage.ipShort', { ip: p.ip }), `${p.k} K`, `${p.er} ${t('stats.er')}`, p.w ? t('statsPage.winShort') : '', p.sv ? t('statsPage.saveShort') : ''].filter(Boolean).join(', ');
    }
    const h = game.hitting;
    if (!h) return '—';
    const extra = [h.hr ? (h.hr > 1 ? `${h.hr} HR` : 'HR') : '', h.t ? `${h.t > 1 ? h.t : ''}3B` : '', h.d ? `${h.d > 1 ? h.d : ''}2B` : '', h.rbi ? `${h.rbi} ${t('stats.rbi')}` : '', h.r ? `${h.r} ${t('stats.r')}` : '', h.bb ? `${h.bb} BB` : '', h.sb ? `${h.sb} ${t('leaders.stolenBasesShort')}` : ''].filter(Boolean);
    return [`${h.h}-${h.ab}`, ...extra].join(', ');
};
