// Estadísticas de peloteros: la temporada de todos (para buscar y comparar) y la ficha de cada uno.
// Los puntos de fantasy vienen calculados del servidor con la misma regla del juego.
import { useQuery } from '@tanstack/react-query';
import { ApiError } from './api';
import type { LeagueId } from '../types';
import { API_BASE } from './config';

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
    const response = await fetch(path, { signal, headers: { Accept: 'application/json' } }).catch((error: Error) => {
        if (error.name === 'AbortError') throw error;
        throw new ApiError(error.message, typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network');
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new ApiError(`HTTP ${response.status}`, typeof body.error === 'string' ? body.error : 'internal_error', response.status);
    }
    return (await response.json()) as T;
};

const retry = (failureCount: number, error: Error) => !(error instanceof ApiError && [400, 404].includes(error.status)) && failureCount < 2;

export const usePlayers = (league: LeagueId, season?: number) =>
    useQuery({
        queryKey: ['players', league, season ?? 'actual'],
        queryFn: ({ signal }) => getJson<PlayersData>(`${API_BASE}/api/v2/players?league=${league}${season ? `&season=${season}` : ''}`, signal),
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
 * Mínimo para entrar en los promedios: 2 apariciones por juego del equipo que más ha jugado (y al menos 5) para bateo,
 * 0,8 entradas por juego (y al menos 3) para pitcheo. Así un 1-1 no sale primero en AVG ni en BABIP.
 */
export const qualifies = (row: PlayerRow, teamGames: number) =>
    row.role === 'P' ? (row.pitching?.outs ?? 0) >= Math.max(9, Math.floor(teamGames * 0.8 * 3)) : (row.hitting?.pa ?? 0) >= Math.max(5, Math.floor(teamGames * 2));

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
