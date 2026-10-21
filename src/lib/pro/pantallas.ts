// Datos de las rutas PRO que la web agregó para pantallas concretas (aparte de juego y liga): portada, previa del juego,
// defensa, glosario, alineaciones del fantasy y detalle de un fanático. Aquí va solo la lectura y sus tipos, con los
// mismos nombres de la web (src/lib/pro/portada.ts, previa-final.ts, estadisticas.ts, mas.ts y fantasy.ts): la lógica
// de cada pantalla se porta con su pantalla. Si la web cambia un contrato, se cambia aquí igual.
// Producción todavía no tiene estas rutas: con 404 la consulta queda sin datos y no se relee (ver ./http.ts).
import { useQuery } from '@tanstack/react-query';
import type { LeagueId, PersonRef } from '../../types';
import type { ProPhaseId } from '../../types/pro-liga';
import type { FantasyLine } from '../fantasy';
import type { StatsTeam } from '../stats';
import { MINUTE, SECOND, calmOn404, getPro, isPermanent, pollUnlessMissing, queryString, retryUnless } from './http';

const retry = retryUnless([400, 404, 503]);

// ---------------------------------------------------------------- portada (GET /api/v2/pro/portada)

export interface BattingToday {
    ab: number;
    h: number;
    d: number;
    t: number;
    hr: number;
    rbi: number;
    bb: number;
    so: number;
    sb: number;
    r: number;
}

export interface PitchingToday {
    /** Entradas como las escribe MLB: «5.0», «1.1» */
    ip: string;
    outs: number;
    h: number;
    r: number;
    er: number;
    bb: number;
    k: number;
    hr: number;
    np: number | null;
}

export interface PortadaDecision {
    id: number;
    name: string;
    teamId: number | null;
    wins: number | null;
    losses: number | null;
    saves: number | null;
    era: string | null;
}

export interface PortadaWinProb {
    /** Probabilidad del home después de cada turno (0-100); la del visitante es 100 - home */
    home: number[];
    inning: (number | null)[];
    /** 1 = alta, 0 = baja */
    top: number[];
    last: { home: number; away: number; li: number | null } | null;
    /** Presión más alta del juego (leverageIndex) */
    maxLi: number | null;
}

export interface PortadaKeyPlay {
    /** atBatIndex de MLB */
    i: number;
    /** Posición en los arreglos de winProb */
    at: number;
    inning: number | null;
    top: boolean;
    batter: PersonRef | null;
    /** eventType de MLB («double») y etiqueta en inglés («Double») para traducirla */
    event: string | null;
    label: string | null;
    before: { away: number; home: number };
    after: { away: number; home: number };
    /** Corredores que anotaron (sin el bateador) */
    scored: string[];
    /** Puntos a favor del home (negativo = del visitante) */
    wpa: number;
    li: number | null;
}

export interface PortadaPerformer {
    id: number;
    name: string;
    teamId: number | null;
    type: 'starter' | 'reliever' | 'hitter' | null;
    gameScore: number | null;
    hitting: BattingToday | null;
    pitching: PitchingToday | null;
    decision: 'W' | 'L' | 'SV' | null;
}

export interface PortadaDuel {
    pitcher: (PersonRef & { teamId: number | null; hand: string | null; line: PitchingToday | null }) | null;
    batter: (PersonRef & { teamId: number | null; side: string | null; line: BattingToday | null }) | null;
    onDeck: PersonRef | null;
    inHole: PersonRef | null;
}

export interface PortadaGame {
    gamePk: number | null;
    state: 'preview' | 'live' | 'final';
    weather: { tempC: number | null; condition: string | null } | null;
    duel?: PortadaDuel | null;
    winProb?: PortadaWinProb | null;
    keyPlay?: PortadaKeyPlay | null;
    decisions?: { winner: PortadaDecision | null; loser: PortadaDecision | null; save: PortadaDecision | null } | null;
    top?: PortadaPerformer[];
}

export interface PortadaData {
    updatedAt: string;
    /** Por gamePk; null si ese juego falló (los demás sí llegan) */
    games: Record<string, PortadaGame | null>;
}

export const portadaKeys = {
    games: (league: LeagueId, gamePks: number[]) => ['pro', 'portada', league, gamePks.join(',')] as const
};

/** Lista estable (ordenada, sin repetidos, máx. 12 como el servidor) para la llave y la URL */
export const gameList = (gamePks: number[]) => [...new Set(gamePks)].sort((a, b) => a - b).slice(0, 12);

/**
 * Resúmenes PRO de las tarjetas del feed. `live`: hay juegos en vivo en la lista (se relee cada 10 s, como la
 * probabilidad de ganar de MLB); sin juegos en vivo los terminados casi no cambian y no se releen.
 */
export const usePortadaGames = (league: LeagueId, gamePks: number[], live: boolean, enabled = true) => {
    const list = gameList(gamePks);
    return useQuery({
        queryKey: portadaKeys.games(league, list),
        queryFn: ({ signal }) => getPro<PortadaData>('pro-portada', `/api/v2/pro/portada?league=${league}&games=${list.join(',')}`, signal, 12 * SECOND),
        enabled: enabled && list.length > 0,
        staleTime: live ? 4 * SECOND : 10 * MINUTE,
        // Depende de `live` (de la pantalla), no de los datos: sin pollUnlessMissing, que guarda el valor hasta que cambien
        refetchInterval: (query) => (live && !isPermanent(query.state.error) ? 10 * SECOND : false),
        refetchOnWindowFocus: (query) => live && !isPermanent(query.state.error),
        refetchOnReconnect: calmOn404.refetchOnReconnect,
        // Al cambiar la lista (un juego pasa a final) las tarjetas siguen con lo que tenían mientras llega lo nuevo
        placeholderData: (previous) => previous,
        retry
    });
};

// ---------------------------------------------------------------- previa (GET /api/v2/game/:pk/previa)

export interface PreviaField {
    capacity: number | null;
    leftLine: number | null;
    leftCenter: number | null;
    center: number | null;
    rightCenter: number | null;
    rightLine: number | null;
    turf: string | null;
    roof: string | null;
}

export interface PreviaVenue {
    id: number | null;
    name: string;
    city: string | null;
    country: string | null;
    field: PreviaField | null;
    /** Equipos de la liga que juegan ahí de local */
    homeOf: number[];
}

export interface LineupPlayer {
    id: number;
    name: string;
    pos: string | null;
    order: number;
}

export interface PreviewExtras {
    gamePk: number;
    state: string;
    venue: PreviaVenue | null;
    /** Parques de la liga (para decir en qué ciudad es el próximo choque) */
    venues: PreviaVenue[] | null;
    /** Alineaciones de MLB: null hasta que las publiquen */
    lineups: { away: LineupPlayer[] | null; home: LineupPlayer[] | null } | null;
}

export const previaKeys = {
    extras: (gamePk: number | null | undefined, league: LeagueId) => ['pro', 'previa', league, gamePk ?? null] as const
};

/** Estadio, parques de la liga y alineaciones (en la previa se relee cada minuto por si publican las alineaciones) */
export const usePreviewExtras = (gamePk: number | null | undefined, league: LeagueId, enabled = true) =>
    useQuery({
        queryKey: previaKeys.extras(gamePk, league),
        queryFn: ({ signal }) => getPro<PreviewExtras>('pro-previa', `/api/v2/game/${gamePk}/previa?league=${league}`, signal),
        enabled: enabled && !!gamePk,
        staleTime: MINUTE,
        refetchInterval: pollUnlessMissing<PreviewExtras>((data) => (data?.state === 'preview' ? MINUTE : false)),
        ...calmOn404,
        retry
    });

// ---------------------------------------------------------------- defensa (GET /api/v2/pro/fielding)

export interface FieldingRow {
    id: number;
    name: string;
    teamId: number | null;
    /** Posición (C, 1B, SS, LF…) */
    pos: string;
    g: number;
    gs: number;
    /** Entradas a la defensa («239.0») y en outs */
    inn: string | null;
    outs: number;
    po: number;
    a: number;
    e: number;
    ch: number;
    dp: number;
    fpct: number | null;
    rf9: number | null;
    /** Receptores: robos permitidos, atrapados, % de atrapados y passed balls */
    sb: number | null;
    cs: number | null;
    csPct: number | null;
    pb: number | null;
}

export interface FieldingData {
    league: LeagueId;
    season: number;
    currentSeason: number;
    isPreviousSeason: boolean;
    phase: ProPhaseId;
    gameType: string;
    teams: Record<string, StatsTeam>;
    /** De más outs a menos; el simulador no tiene defensa (lista vacía) */
    rows: FieldingRow[];
}

/** Defensa de todos los peloteros de una fase (MLB group=fielding): una fila por pelotero y posición */
export const useProFielding = (league: LeagueId, season?: number, phase?: ProPhaseId, enabled = true) =>
    useQuery({
        queryKey: ['pro', 'fielding', league, season ?? 'actual', phase ?? 'primera'],
        queryFn: ({ signal }) => getPro<FieldingData>('pro-fielding', `/api/v2/pro/fielding${queryString({ league, season, phase })}`, signal, 15 * SECOND),
        enabled,
        staleTime: 5 * MINUTE,
        ...calmOn404,
        retry
    });

// ---------------------------------------------------------------- glosario (GET /api/v2/pro/glossary)

export type MetricFormat = 'avg' | 'pct' | 'dec2' | 'dec1';
export type GlossaryMetricId = 'ops' | 'iso' | 'babip' | 'kPct' | 'bbPct' | 'era' | 'fip' | 'whip' | 'k9' | 'kBb';

export interface GlossaryMetric {
    id: GlossaryMetricId;
    group: 'hitting' | 'pitching';
    format: MetricFormat;
    lowerIsBetter: boolean;
    /** Valor del líder y promedio de la liga (null si no hay quien califique) */
    value: number | null;
    league: number | null;
    /** Tope de la escala de la barra */
    max: number | null;
    qualified: number;
    leader: { id: number; name: string; teamId: number | null; abbrev: string | null; color: string | null; logo: string | null } | null;
}

export interface Glossary {
    league: LeagueId;
    /** Temporada de los líderes: la en curso o, al empezar, la anterior completa */
    season: number;
    currentSeason: number;
    isPreviousSeason: boolean;
    teamGames: number;
    /** Juegos por equipo de la temporada en curso (para decir por qué se usa la anterior) */
    currentTeamGames: number;
    /** Constante FIP de la liga en esa temporada */
    fip: number | null;
    /** Calificados: apariciones y outs mínimos */
    minPa: number;
    minOuts: number;
    metrics: GlossaryMetric[];
}

/** Glosario PRO de la liga (30 min) */
export const useProGlossary = (league: LeagueId, enabled = true) =>
    useQuery({
        queryKey: ['pro', 'mas', 'glossary', league],
        queryFn: ({ signal }) => getPro<Glossary>('pro-glossary', `/api/v2/pro/glossary?league=${league}`, signal),
        enabled,
        staleTime: 30 * MINUTE,
        ...calmOn404,
        retry
    });

// ---------------------------------------------------------------- fantasy: alineaciones del día (GET /api/v2/pro/fantasy/lineups)

export interface DayLineups {
    league: LeagueId;
    date: string;
    games: { gamePk: number; state: string; away: number[] | null; home: number[] | null }[];
    /** Juegos con al menos una alineación publicada */
    posted: number;
    updatedAt: string;
}

/** Alineaciones del día según MLB (chip «Titular»): llegan cuando cada equipo las publica */
export const useFantasyLineups = (league: LeagueId, date: string | undefined, enabled = true) =>
    useQuery({
        queryKey: ['pro', 'fantasy-lineups', league, date ?? 'hoy'],
        queryFn: ({ signal }) => getPro<DayLineups>('pro-fantasy-lineups', `/api/v2/pro/fantasy/lineups${queryString({ league, date })}`, signal),
        enabled,
        staleTime: MINUTE,
        refetchInterval: pollUnlessMissing<DayLineups>((data) => (data?.games.some((game) => game.state === 'preview' && (!game.away || !game.home)) ? 2 * MINUTE : false)),
        ...calmOn404,
        retry
    });

/** Titulares confirmados del día: ids de las alineaciones publicadas */
export const startersOf = (lineups: DayLineups | null | undefined) => new Set((lineups?.games ?? []).flatMap((game) => [...(game.away ?? []), ...(game.home ?? [])]));

// ---------------------------------------------------------------- fantasy: detalle de un fanático (GET /api/v2/pro/fantasy/fan/:userId/detail)

export interface FanLineupItem {
    id: number;
    name: string;
    teamId: number;
    role: 'B' | 'P';
    pos: string;
    gamePk: number;
    played: boolean;
    line: FantasyLine | null;
    points: number;
    score: number;
    captain: boolean;
}

export interface FanDetailGame {
    gamePk: number;
    date: string;
    state: 'preview' | 'live' | 'final';
    venue: string | null;
    away: { id: number; score: number | null; isWinner: boolean };
    home: { id: number; score: number | null; isWinner: boolean };
}

export interface FanDetailDay {
    date: string;
    started: boolean;
    final: boolean;
    live: boolean;
    team: number;
    picks: number;
    total: number;
    /** Solo los peloteros de juegos que ya empezaron */
    lineup: FanLineupItem[];
    /** Peloteros escondidos (su juego no ha empezado) */
    hidden: number;
    captainHidden: boolean;
    pickList: { gamePk: number; teamId: number; result: 'win' | 'loss' | 'pending' }[];
    picksHidden: number;
    games: FanDetailGame[];
}

export interface FanDetail {
    userId: string;
    league: LeagueId;
    name: string | null;
    players: { id: number; name: string; teamId: number; role: 'B' | 'P'; pos: string; days: number; points: number; base: number; captainDays: number }[];
    captains: { id: number; name: string; teamId: number; pos: string; days: number; bonus: number }[];
    byTeam: { teamId: number; points: number }[];
    picks: { points: number; made: number; won: number };
    teams: Record<string, { id: number; abbrev: string; color: string; logo: string }>;
    /** Del más reciente al más viejo */
    days: FanDetailDay[];
    live: boolean;
    partial: boolean;
    updatedAt: string;
}

/** Temporada de un fanático en detalle (perfil PRO y «Comparar conmigo»): lo de juegos sin empezar no sale */
export const useFanDetail = (userId: string | null | undefined, league: LeagueId, enabled = true) =>
    useQuery({
        queryKey: ['pro', 'fan-detail', league, userId ?? ''],
        queryFn: ({ signal }) => getPro<FanDetail>('pro-fan-detail', `/api/v2/pro/fantasy/fan/${encodeURIComponent(userId!)}/detail?league=${league}`, signal, 15 * SECOND),
        enabled: enabled && !!userId,
        staleTime: MINUTE,
        refetchInterval: pollUnlessMissing<FanDetail>((data) => (data?.partial ? 15 * SECOND : data?.live ? MINUTE : false)),
        ...calmOn404,
        retry
    });
