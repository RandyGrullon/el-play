// Datos del juego para el modo PRO (server/services/pro/juego*.js de la web). Son rutas aparte del detalle del Lite
// (/api/v2/game/:pk) para que ese no crezca: el PRO pide además estos extras y los une por id o por índice.
// Lo que MLB no manda llega en null o no viene: nunca hay que rellenarlo. Mismos tipos y lógica que la web
// (el-play/src/lib/pro/juego.ts); la lectura va con API_BASE y aguanta que la ruta no exista (ver ./http.ts).
// Montar los hooks solo en PRO (pasar `enabled = useIsPro()`) para que el Lite no gaste datos.
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gameInterval } from '../polling';
import type { GameDetail, GameState, LeagueId, PersonRef, SeriesStatus } from '../../types';
import type { LineHalf } from '../../types/pro-juego';
import { HOUR, SECOND, calmOn404, getPro, jitter, pollUnlessMissing, retryUnless } from './http';

// ---------------------------------------------------------------- Tipos: /api/v2/game/:pk/pro

/** Extras de un pitcheo, en el mismo orden que AtBat.pitches del Lite. Sin rastreo solo vienen `n` y `t`. */
export interface ProPitch {
    n?: number;
    /** Velocidad al llegar al plato (mph); la inicial es Pitch.mph */
    end?: number;
    /** Extensión (pies) y tiempo al plato (s) */
    ext?: number;
    pt?: number;
    /** Quiebre vertical inducido y horizontal (pulgadas) */
    ivb?: number;
    hb?: number;
    /** Eje del giro en grados (180 = 6:00, 210 ≈ 7:00) */
    sd?: number;
    /** Movimiento (pulgadas) */
    pfxX?: number;
    pfxZ?: number;
    /** Trayectoria para el vuelo: salida a y0 = 50 pies (x0, z0), velocidad (pies/s) y aceleración (pies/s²) */
    x0?: number;
    z0?: number;
    vx0?: number;
    vy0?: number;
    vz0?: number;
    ax?: number;
    ay?: number;
    az?: number;
    /** Segundos desde el primer pitcheo del juego (GamePro.t0) */
    t?: number;
    /** Reto ABS (type «MJ») u otra revisión sobre este pitcheo: over = se revocó la decisión */
    rev?: ProReview;
}

export interface ProReview {
    type: string | null;
    over: boolean;
    team: number | null;
    player: number | null;
}

/** Recorrido de un corredor (o del bateador) en la jugada */
export interface ProRunner {
    id?: number;
    /** Base de salida y de llegada: '1B' | '2B' | '3B' | 'score' (sin `from` = el bateador) */
    from?: string;
    to?: string;
    out?: true;
    outBase?: string;
    outNum?: number;
    event?: string;
    reason?: string;
    scored?: true;
    earned?: boolean;
    rbi?: true;
    /** Lanzador responsable de la carrera */
    pitcher?: number;
    /** Quién intervino: posición 1-9 y crédito de MLB (f_putout, f_assist, f_fielded_ball…) */
    credits?: { id: number | null; pos: number | null; c: string | null }[];
}

/** Evento que no es pitcheo (robo, WP, visita, cambio de lanzador…), con cuántos pitcheos iban en el turno */
export interface ProAction {
    k: number;
    type: string;
    desc?: string;
    player?: number;
    /** A quién reemplaza (en un cambio de lanzador lo calcula el servidor) */
    replaced?: number | null;
    pos?: string;
    out?: true;
    t?: number;
}

export interface ProPlay {
    /** Mismo índice que AtBat.i */
    i: number;
    /** captivatingIndex de MLB (0-100) */
    ci?: number;
    start?: string;
    end?: string;
    /** Posición (1-9) de quien fildeó la bola */
    loc?: number;
    runners: ProRunner[];
    pitches: ProPitch[];
    actions: ProAction[];
    review?: ProReview;
}

export interface ProSeasonPitching {
    w: number | null;
    l: number | null;
    sv: number | null;
    hld: number | null;
    era: string | null;
    whip: string | null;
    ip: string | null;
    g: number | null;
    k9: string | null;
    bb9: string | null;
}

export interface ProBatter {
    id: number;
    /** battingOrder de MLB: 100, 200… (101 = primer sustituto del 1.º) */
    order: number | null;
    /** Todas las posiciones del juego: «PH-SS» */
    pos: string;
    number: string | null;
    /** Letra de la nota de emergente (ver ProBoxTeam.notes) */
    note: string | null;
    pa: number | null;
    d: number;
    t: number;
    sb: number;
    cs: number;
    hbp: number;
    sf: number;
    sh: number;
    ibb: number;
    gidp: number;
    tb: number | null;
    lob: number;
    season: { avg: string | null; obp: string | null; slg: string | null; ops: string | null; hr: number | null; rbi: number | null; sb: number | null };
}

export interface ProPitcher {
    id: number;
    number: string | null;
    throws: string | null;
    starter: boolean;
    /** Primera y última entrada en que lanzó */
    inn: [number, number] | null;
    bf: number | null;
    outs: number | null;
    go: number | null;
    ao: number | null;
    np: number | null;
    st: number | null;
    b: number | null;
    /** Corredores heredados y cuántos anotaron */
    ir: number;
    irs: number;
    hld: number;
    bs: number;
    wp: number;
    bk: number;
    pk: number;
    hbp: number;
    /** Game Score v2: la misma fórmula del gameScore de MLB */
    gs: number | null;
    season: ProSeasonPitching;
}

export interface ProBoxTeam {
    batters: ProBatter[];
    pitchers: ProPitcher[];
    /** Lanzadores que aún no han lanzado */
    bullpen: { id: number; number: string | null; throws: string | null; season: ProSeasonPitching }[];
    bench: { id: number; number: string | null; pos: string | null; bats: string | null; season: { avg: string | null; obp: string | null; slg: string | null; ops: string | null; hr: number | null; ab: number | null } }[];
    /** Notas de emergentes: { label: 'a', value: 'Struck out for Made in the 8th.' } (inglés) */
    notes: { label: string; value: string }[];
    /** Notas del equipo por bloque (BATTING, BASERUNNING, FIELDING), en inglés como las manda MLB */
    info: { title: string; fields: { label: string; value: string | null }[] }[];
    totals: {
        d: number | null;
        t: number | null;
        sb: number | null;
        cs: number | null;
        hbp: number | null;
        sf: number | null;
        tb: number | null;
        gidp: number | null;
        obp: string | null;
        slg: string | null;
        ops: string | null;
        risp: { h: number; ab: number } | null;
        lob: number | null;
    };
}

/** Pelotero del juego (gameData.players + número del box) */
export interface ProPlayer {
    id: number;
    name: string;
    short: string;
    first: string | null;
    last: string | null;
    number: string | null;
    teamId: number | null;
    pos: string | null;
    bats: string | null;
    throws: string | null;
    age: number | null;
    country: string | null;
    city: string | null;
    height: string | null;
    weight: number | null;
    debut: string | null;
}

export interface ProWind {
    mph: number | null;
    /** Texto de MLB: «In From LF», «R To L» */
    text: string;
    dir: 'out' | 'in' | 'cross' | 'calm' | 'varies' | null;
    field: 'LF' | 'CF' | 'RF' | null;
    /** Hacia dónde sopla: 0 = de home al center, 90 = hacia el lado del right, -90 = hacia el del left */
    deg: number | null;
}

export interface GamePro {
    gamePk: number;
    state: GameState;
    detailedState: string;
    reason: string | null;
    date: string | null;
    updatedAt: string | null;
    /** type «E» con rastreo, «Y» sin rastreo; los conteos dicen cuánto llegó (en vivo el rastreo llega tarde) */
    tracking: { type: string | null; pitches: number; speed: number; breaks: number };
    zoneSize: { width: number | null; depth: number | null } | null;
    /** Hora del primer pitcheo (base de ProPitch.t) */
    t0: string | null;
    game: {
        doubleHeader: 'Y' | 'S' | null;
        gameNumber: number | null;
        dayNight: 'day' | 'night' | null;
        firstPitch: string | null;
        durationMin: number | null;
        delayMin: number | null;
        venue: {
            id: number | null;
            name: string;
            /** Medidas en pies: solo 3 de los 5 parques de LIDOM las tienen */
            field: { capacity: number | null; leftLine: number | null; leftCenter: number | null; center: number | null; rightCenter: number | null; rightLine: number | null; turf: string | null; roof: string | null } | null;
        };
        weather: { condition: string | null; tempF: number | null; tempC: number | null; wind: ProWind | null } | null;
        /** type: 'Home Plate' | 'First Base' | 'Second Base' | 'Third Base' */
        officials: { type: string; id: number; name: string }[];
    };
    /** No-hit o perfecto en curso; quién lo lanza se ve en los hits de `totals` */
    flags: { noHitter: boolean; perfectGame: boolean };
    /** Retos ABS (LIDOM desde 2026): acertados, fallados y restantes */
    abs: { away: { ok: number; fail: number; left: number | null }; home: { ok: number; fail: number; left: number | null } } | null;
    review: { away: { used: number; left: number | null }; home: { used: number; left: number | null } } | null;
    moundVisits: { away: { used: number; left: number | null }; home: { used: number; left: number | null } } | null;
    linescore: { n: number; away: LineHalf; home: LineHalf }[];
    totals: { away: LineHalf; home: LineHalf } | null;
    offense: { batter: PersonRef | null; onDeck: PersonRef | null; inHole: PersonRef | null; first: PersonRef | null; second: PersonRef | null; third: PersonRef | null; teamId: number | null } | null;
    defense: {
        teamId: number | null;
        pitcher: PersonRef | null;
        catcher: PersonRef | null;
        first: PersonRef | null;
        second: PersonRef | null;
        third: PersonRef | null;
        shortstop: PersonRef | null;
        left: PersonRef | null;
        center: PersonRef | null;
        right: PersonRef | null;
    } | null;
    /** Duelo en curso: veces que se han visto hoy (antes de este turno) y vez por el orden del lanzador */
    current: { i: number | null; batter: number; pitcher: number | null; splits: { batter?: string; pitcher?: string; menOnBase?: string } | null; faced: number; tto: number } | null;
    box: { away: ProBoxTeam; home: ProBoxTeam };
    /** Notas generales del box (WP, HBP, reloj de pitcheo, ABS, Umpires, T…), en inglés */
    notes: { label: string; value: string | null }[];
    topPerformers: { type: 'starter' | 'reliever' | 'hitter' | null; id: number; teamId: number | null; name: string; gameScore: number | null; summary: string | null }[];
    /** Segundos promedio entre pitcheos seguidos de cada lanzador dentro del turno */
    pace: { id: number; sec: number; n: number }[];
    records: {
        fastest: { mph: number; pitcher: number | null; type: string | null; i: number; n: number | null } | null;
        hardest: { ev: number; la: number | null; dist: number | null; batter: number | null; event: string | null; i: number } | null;
        longest: { dist: number; ev: number | null; batter: number | null; event: string | null; i: number } | null;
        longestPA: { pitches: number; batter: number | null; pitcher: number | null; i: number } | null;
    };
    /** Serie y número de juego (del calendario de MLB) */
    schedule: { gameType: string | null; description: string | null; seriesGameNumber: number | null; gamesInSeries: number | null; ifNecessary: boolean; series: SeriesStatus | null } | null;
    /** Promedios de la liga en la temporada (/gamePace) para comparar: «Duró 3:33 (liga 3:17)» */
    leaguePace: { season: number; games: number; minutesPerGame: number | null; secondsPerPitch: number | null; pitchesPerGame: number | null; runsPerGame: number | null; pitchersPerGame: number | null } | null;
    /** Cuántas jugadas tiene el juego en total */
    total: number;
    /** El `since` con que se pidió (null = todo) */
    since: number | null;
    plays: ProPlay[];
    /** Solo en la primera lectura (sin since); después se conserva la que ya había */
    players?: Record<string, ProPlayer>;
}

// ---------------------------------------------------------------- Tipos: probabilidad, fuente ligera, duelo

export interface WinProbPlay {
    i: number;
    inning: number | null;
    top: boolean;
    complete: boolean;
    /** Probabilidad del home después de la jugada (0-100); la del visitante es 100 - home */
    home: number;
    /** Puntos que movió la jugada a favor del home (negativo = a favor del visitante) */
    wpa: number;
    /** Presión (leverageIndex); null en la primera jugada */
    li: number | null;
    ci: number | null;
}

export interface WinProb {
    gamePk: number;
    state: GameState;
    plays: WinProbPlay[];
    last: { home: number; away: number; li: number | null } | null;
    /** Índices de las 3 jugadas que más movieron la probabilidad, de mayor a menor */
    key: number[];
}

export interface LiveGame {
    gamePk: number;
    state: GameState;
    detailedState: string;
    reason: string | null;
    date: string | null;
    away: { id: number | null; abbrev: string; score: number | null };
    home: { id: number | null; abbrev: string; score: number | null };
    noHitter: boolean;
    perfectGame: boolean;
    // Solo en vivo:
    inning?: number | null;
    isTop?: boolean;
    inningState?: string | null;
    balls?: number;
    strikes?: number;
    outs?: number;
    runners?: { first: boolean; second: boolean; third: boolean };
    batter?: PersonRef | null;
    onDeck?: PersonRef | null;
    pitcher?: PersonRef | null;
    /** Última jugada terminada; event = código de MLB deducido de la etiqueta en inglés */
    last?: { event: string | null; label: string | null; desc: string; away: number | null; home: number | null } | null;
    wp?: { home: number; away: number; li: number | null } | null;
}

export interface LiveSlate {
    league: LeagueId;
    /** Día de la liga (zona horaria de la liga) */
    day: string;
    updatedAt: string;
    games: LiveGame[];
}

export interface SplitLine {
    pa: number | null;
    ab: number | null;
    h: number | null;
    d: number | null;
    t: number | null;
    hr: number | null;
    bb: number | null;
    k: number | null;
    avg: string | null;
    obp: string | null;
    slg: string | null;
    ops: string | null;
    /** Solo lanzadores */
    ip?: string | null;
    whip?: string | null;
    k9?: string | null;
}

/** Zona caliente: 01-09 dentro (de arriba a la izquierda, vista del receptor), 11-14 las esquinas de afuera */
export interface HotColdZone {
    zone: string;
    value: string | null;
    temp: 'hot' | 'warm' | 'lukewarm' | 'cool' | 'cold' | null;
}

export interface Zones {
    season: number;
    /** Bateo: battingAverage, onBasePercentage, sluggingPercentage, onBasePlusSlugging, exitVelocity.
     *  Pitcheo: numberOfPitches, numberOfStrikes, battingAverage, onBasePercentage, sluggingPercentage, onBasePlusSlugging, earnedRunAverage */
    metrics: Record<string, HotColdZone[]>;
}

export interface MatchupSide {
    id: number;
    /** Contra zurdos (vl) y derechos (vr) en la temporada de la liga; `season` dice cuál */
    splits: { season: number; vl: SplitLine | null; vr: SplitLine | null } | null;
    zones: Zones | null;
}

export interface Matchup {
    league: LeagueId;
    batter: MatchupSide | null;
    pitcher: MatchupSide | null;
    /** Historial del bateador contra el lanzador; en LIDOM solo juegos entre equipos de LIDOM */
    vs: { scope: 'lidom' | 'all'; seasons: string[]; line: SplitLine & { hbp: number; sf: number; rbi: number } } | null;
}

export interface ZonesResponse {
    id: number;
    group: 'hitting' | 'pitching';
    league: LeagueId;
    season: number | null;
    metrics: Record<string, HotColdZone[]> | null;
}

// ---------------------------------------------------------------- Lectura

const TIMEOUT_MS = 10 * SECOND;

// No reintentar lo que no se arregla solo (petición inválida, no existe)
const retry = retryUnless([400, 404]);

export const proKeys = {
    game: (gamePk: string | number) => ['pro', 'game', String(gamePk)] as const,
    winProb: (gamePk: string | number) => ['pro', 'winprob', String(gamePk)] as const,
    live: (league: LeagueId) => ['pro', 'live', league] as const,
    matchup: (league: LeagueId, batter?: number | null, pitcher?: number | null) => ['pro', 'matchup', league, batter ?? 0, pitcher ?? 0] as const,
    zones: (league: LeagueId, personId: number, group: 'hitting' | 'pitching') => ['pro', 'zones', league, personId, group] as const
};

/** Rutas del juego PRO (también sirven para precargar con queryClient.prefetchQuery) */
export const proJuegoApi = {
    game: (gamePk: string | number, since: number | null, signal?: AbortSignal) =>
        getPro<GamePro>('game-pro', `/api/v2/game/${gamePk}/pro${since !== null ? `?since=${since}` : ''}`, signal, TIMEOUT_MS),
    winProb: (gamePk: string | number, signal?: AbortSignal) => getPro<WinProb>('winprob', `/api/v2/game/${gamePk}/winprob`, signal, TIMEOUT_MS),
    live: (league: LeagueId, signal?: AbortSignal) => getPro<LiveSlate>('live', `/api/v2/live?league=${league}`, signal, TIMEOUT_MS),
    matchup: (league: LeagueId, batter?: number | null, pitcher?: number | null, signal?: AbortSignal) => {
        const params = new URLSearchParams({ league });
        if (batter) params.set('batter', String(batter));
        if (pitcher) params.set('pitcher', String(pitcher));
        return getPro<Matchup>('matchup', `/api/v2/matchup?${params.toString()}`, signal, TIMEOUT_MS);
    },
    zones: (league: LeagueId, personId: number, group: 'hitting' | 'pitching', signal?: AbortSignal) =>
        getPro<ZonesResponse>('zones', `/api/v2/zones/${personId}?group=${group}&league=${league}`, signal, TIMEOUT_MS)
};

/** Une una lectura incremental (?since=) con lo que ya había: se reemplazan las jugadas desde `since`. */
export function mergeGamePro(previous: GamePro | undefined, next: GamePro): GamePro {
    if (next.since === null || !previous) return next;
    const since = next.since;
    const kept = previous.plays.filter((play) => play.i < since);
    return { ...next, players: next.players ?? previous.players, plays: [...kept, ...next.plays] };
}

/** Desde qué turno pedir: el último que ya se tiene (puede estar a medias). null = pedir todo. */
export function sinceFor(previous: GamePro | undefined): number | null {
    if (!previous || previous.state !== 'live' || !previous.players || previous.plays.length === 0) return null;
    return previous.plays[previous.plays.length - 1].i;
}

// gameInterval solo mira state, detailedState y date, que GamePro también trae
const asGame = (data: GamePro | undefined) => data as unknown as GameDetail | undefined;

/** Extras PRO del juego. En vivo se relee cada ~5 s (como el detalle del Lite) pidiendo solo las jugadas nuevas. */
export const useGamePro = (gamePk: string | number | undefined, enabled = true) => {
    const client = useQueryClient();
    return useQuery({
        queryKey: proKeys.game(gamePk ?? ''),
        queryFn: async ({ signal }) => {
            const previous = client.getQueryData<GamePro>(proKeys.game(gamePk!));
            const since = sinceFor(previous);
            const next = await proJuegoApi.game(gamePk!, since, signal);
            return mergeGamePro(since !== null ? previous : undefined, next);
        },
        enabled: enabled && !!gamePk,
        staleTime: 2000,
        refetchInterval: pollUnlessMissing<GamePro>((data) => gameInterval(asGame(data))),
        ...calmOn404,
        retry
    });
};

/**
 * Probabilidad de ganar por jugada. En vivo se relee cada 10 s y también al cambiar de turno
 * (pasar GameDetail.currentAtBat); terminado ya no cambia. Antes del juego llega vacía (plays: [], last: null).
 */
export const useWinProb = (gamePk: string | number | undefined, currentAtBat?: number | null, enabled = true) => {
    const query = useQuery({
        queryKey: proKeys.winProb(gamePk ?? ''),
        queryFn: ({ signal }) => proJuegoApi.winProb(gamePk!, signal),
        enabled: enabled && !!gamePk,
        staleTime: 5000,
        refetchInterval: pollUnlessMissing<WinProb>((data) => {
            if (data?.state === 'final' && data.plays.length) return false;
            return data?.state === 'live' ? jitter(10 * SECOND) : 60 * SECOND;
        }),
        ...calmOn404,
        retry
    });
    const { refetch } = query;
    const live = query.data?.state === 'live';
    // Solo al cambiar de turno (no al montar): el primer valor ya lo trae la lectura normal
    const seen = useRef(currentAtBat);
    useEffect(() => {
        if (seen.current === currentAtBat) return;
        seen.current = currentAtBat;
        if (currentAtBat === undefined || currentAtBat === null || !live) return;
        void refetch();
    }, [currentAtBat, live, refetch]);
    return query;
};

/** Juegos de hoy en versión ligera (portada, avisos): cada 5 s si hay alguno en vivo, si no cada 30 s. */
export const useLiveSlate = (league: LeagueId, enabled = true) =>
    useQuery({
        queryKey: proKeys.live(league),
        queryFn: ({ signal }) => proJuegoApi.live(league, signal),
        enabled,
        staleTime: 3000,
        refetchInterval: pollUnlessMissing<LiveSlate>((data) => (data?.games.some((game) => game.state === 'live') ? jitter(5 * SECOND) : 30 * SECOND)),
        ...calmOn404,
        retry
    });

/** Duelo bateador contra lanzador: splits, historial y zonas (caché de 6 h en el servidor) */
export const useMatchup = (league: LeagueId, batter?: number | null, pitcher?: number | null, enabled = true) =>
    useQuery({
        queryKey: proKeys.matchup(league, batter, pitcher),
        queryFn: ({ signal }) => proJuegoApi.matchup(league, batter, pitcher, signal),
        enabled: enabled && !!(batter || pitcher),
        staleTime: HOUR,
        gcTime: 6 * HOUR,
        ...calmOn404,
        retry
    });

/** Zonas calientes de la temporada de un pelotero */
export const useZones = (league: LeagueId, personId: number | null | undefined, group: 'hitting' | 'pitching' = 'hitting', enabled = true) =>
    useQuery({
        queryKey: proKeys.zones(league, personId ?? 0, group),
        queryFn: ({ signal }) => proJuegoApi.zones(league, personId!, group, signal),
        enabled: enabled && !!personId,
        staleTime: HOUR,
        ...calmOn404,
        retry
    });

// ---------------------------------------------------------------- Ayudas

/** Los extras de un turno por su índice (AtBat.i) */
export const proPlayOf = (pro: GamePro | null | undefined, atBatIndex: number): ProPlay | undefined => pro?.plays.find((play) => play.i === atBatIndex);

/** ¿Hay rastreo? 'full' casi todo, 'partial' a medias (suele estar llegando), 'none' nada */
export const trackingLevel = (pro: GamePro | null | undefined): 'full' | 'partial' | 'none' => {
    if (!pro || pro.tracking.pitches === 0 || pro.tracking.speed === 0) return 'none';
    return pro.tracking.speed / pro.tracking.pitches >= 0.9 ? 'full' : 'partial';
};
