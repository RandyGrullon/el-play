// Contrato de la API v2 (server/utils/transformers.js)

export type LeagueId = 'lidom' | 'wbc' | 'sdc';
export type GameState = 'preview' | 'live' | 'final';
export type PitchResult = 'ball' | 'strike' | 'inplay' | 'hbp';

export interface PersonRef {
    id: number;
    name: string;
}

export interface TeamBase {
    id: number;
    name: string;
    abbrev: string;
    logo: string;
    color: string;
    /** Segundo color del uniforme, si se conoce */
    color2?: string | null;
    flag?: string | null;
    record: { wins: number; losses: number } | null;
}

export interface Runners {
    first: boolean;
    second: boolean;
    third: boolean;
}

export interface ScheduleTeam extends TeamBase {
    score: number | null;
    /** Hits en el juego (null antes de empezar) */
    hits?: number | null;
    isWinner: boolean;
    probable: PersonRef | null;
}

export interface ScheduleGame {
    gamePk: number;
    league: LeagueId;
    date: string;
    /** Hora por definir (p. ej. el segundo de un doble juego): `date` trae una hora de relleno */
    startTimeTBD?: boolean;
    state: GameState;
    detailedState: string;
    gameType: string | null;
    description: string | null;
    venue: string;
    scheduledInnings: number;
    inningsPlayed: number | null;
    away: ScheduleTeam;
    home: ScheduleTeam;
    live: {
        inning: number | null;
        ordinal: string | null;
        isTop: boolean;
        inningState: string | null;
        balls: number;
        strikes: number;
        outs: number;
        runners: Runners;
        batter: PersonRef | null;
        pitcher: PersonRef | null;
    } | null;
    decisions: { winner: PersonRef | null; loser: PersonRef | null; save: PersonRef | null } | null;
}

export interface Schedule {
    league: LeagueId;
    timeZone: string;
    startDate: string;
    endDate: string;
    games: ScheduleGame[];
}

export interface Pitch {
    n: number | null;
    x: number | null;
    z: number | null;
    top: number | null;
    bot: number | null;
    r: PitchResult;
    code: string | null;
    call: string;
    type: string | null;
    typeDesc: string | null;
    mph: number | null;
    spin: number | null;
    zone: number | null;
    b: number | null;
    s: number | null;
    /** Ubicación marcada por el anotador (sin rastreo): aproximada */
    est?: boolean;
    /** x/y: dónde cayó, en el cuadro de Gameday (250×250, home ≈ 125,198); traj/hard: trayectoria y fuerza */
    hit?: { ev: number | null; la: number | null; dist: number | null; x?: number | null; y?: number | null; traj?: string | null; hard?: string | null };
}

export interface AtBat {
    i: number;
    inning: number;
    top: boolean;
    complete: boolean;
    scoring: boolean;
    batter: PersonRef & { side: string | null };
    pitcher: PersonRef & { hand: string | null };
    event: string | null;
    eventLabel: string | null;
    desc: string;
    rbi: number;
    away: number | null;
    home: number | null;
    outs: number | null;
    /** Bases ocupadas al terminar la jugada (1 = primera, 2 = segunda, 4 = tercera) */
    post?: number;
    pitches: Pitch[];
    /** Acciones del turno (robos, cambios, visitas al montículo); `at`: cuántos pitcheos iban cuando pasó */
    actions: { event: string | null; desc: string; at?: number; sub?: { pos: string | null; in: PersonRef; out: PersonRef | null } }[];
}

export interface GameTeam extends TeamBase {
    teamName: string;
    runs: number;
    hits: number;
    errors: number;
    lob: number;
    isWinner: boolean;
}

export interface BatterLine {
    id: number;
    name: string;
    pos: string;
    sub: boolean;
    ab: number;
    r: number;
    h: number;
    rbi: number;
    bb: number;
    k: number;
    hr: number;
    avg: string | null;
}

export interface PitcherLine {
    id: number;
    name: string;
    note: string | null;
    ip: string;
    h: number;
    r: number;
    er: number;
    bb: number;
    k: number;
    hr: number;
    np: number | null;
    st: number | null;
    era: string | null;
}

export interface BenchPlayer {
    id: number;
    name: string;
    pos: string;
    bats: string | null;
    avg: string | null;
    hr: number | null;
}

export interface BullpenArm {
    id: number;
    name: string;
    throws: string | null;
    era: string | null;
    ip: string | null;
    sv: number | null;
}

export interface BoxTeam {
    batters: BatterLine[];
    pitchers: PitcherLine[];
    bench?: BenchPlayer[];
    bullpen?: BullpenArm[];
    totals: { ab: number | null; r: number | null; h: number | null; rbi: number | null; bb: number | null; k: number | null; hr: number | null; lob: number | null; avg: string | null };
}

export interface Decision extends PersonRef {
    wins: number | null;
    losses: number | null;
    saves?: number | null;
    era: string | null;
}

export type TopPerformer =
    | ({ kind: 'hitter'; teamId: number } & BatterLine)
    | ({ kind: 'pitcher'; teamId: number } & PitcherLine);

/** Estado de la serie (finales y Serie del Caribe): para saber si un juego da el campeonato */
export interface SeriesStatus {
    name: string | null;
    game: number | null;
    total: number | null;
    over: boolean;
    tied: boolean;
    leaderId: number | null;
    wins: number;
    losses: number;
    championship: boolean;
}

export interface GameDetail {
    gamePk: number | null;
    league: LeagueId;
    state: GameState;
    detailedState: string;
    reason: string | null;
    date: string | null;
    venue: string;
    weather: { condition: string; temp: string | null } | null;
    description: string | null;
    gameType?: string | null;
    series?: SeriesStatus | null;
    scheduledInnings: number;
    away: GameTeam;
    home: GameTeam;
    inning: { n: number; ordinal: string; isTop: boolean; state: string } | null;
    count: { balls: number; strikes: number; outs: number };
    runners: { first: PersonRef | null; second: PersonRef | null; third: PersonRef | null };
    matchup: {
        pitcher: PersonRef & { hand: string | null; pitches: number | null; ip: string | null; k: number | null; era: string | null };
        batter: PersonRef & { side: string | null; h: number | null; ab: number | null; avg: string | null };
        onDeck: PersonRef | null;
    } | null;
    /** Pausa entre entradas: los tres que le toca batear al equipo que viene (`teamId`), si MLB los da */
    dueUp?: { teamId: number | null; batters: PersonRef[] } | null;
    probables: { away: Decision | null; home: Decision | null };
    linescore: { n: number; away: number | null; home: number | null }[];
    atBats: AtBat[];
    currentAtBat: number | null;
    box: { away: BoxTeam; home: BoxTeam };
    decisions: { winner: Decision | null; loser: Decision | null; save: Decision | null };
    topPerformers: TopPerformer[];
    /** Retos del ABS de cada equipo (ganados, perdidos, los que le quedan) y quién está retando ahora */
    abs?: { away: AbsCount; home: AbsCount; challenging: number | null } | null;
    /** Público, duración, demora (min), primer lanzamiento, viento y umpires */
    info?: GameInfo;
    /** Alineaciones anunciadas (antes del juego, cuando el equipo las publica) */
    lineups?: { away: LineupSpot[]; home: LineupSpot[] } | null;
    /** Hora del último pitcheo o acción (ISO) */
    lastPlayAt?: string | null;
    updatedAt: string | null;
}

export interface AbsCount {
    won: number;
    lost: number;
    remaining: number | null;
}

export interface GameInfo {
    attendance: number | null;
    durationMin: number | null;
    delayMin: number | null;
    firstPitch: string | null;
    wind: string | null;
    umpires: { type: string; name: string }[];
}

export interface LineupSpot {
    id: number;
    name: string;
    pos: string;
    bats: string | null;
    avg: string | null;
    ops: string | null;
    hr: number | null;
}

export interface HotHitter {
    id: number;
    name: string;
    teamId: number;
    g: number;
    pa: number;
    ab: number;
    h: number;
    hr: number;
    rbi: number;
    bb: number;
    avg: string;
    ops: string;
}

/** /api/v2/preview: enfrentamientos de la temporada y los que vienen calientes (cada parte null si falló) */
export interface PreviewData {
    league: LeagueId;
    season: number;
    headToHead: {
        games: { gamePk: number; date: string | null; away: { id: number; runs: number }; home: { id: number; runs: number }; winnerId: number | null }[];
        wins: Record<string, number>;
        runs: Record<string, number>;
    } | null;
    hot: { startDate: string; endDate: string; teams: Record<string, HotHitter[]> } | null;
}

/** /api/v2/race: victorias menos derrotas de cada equipo al final de cada día de juegos */
export interface RaceData {
    league: LeagueId;
    season: number;
    isPreviousSeason: boolean;
    days: string[];
    teams: { id: number; abbrev: string; name: string; color: string; logo: string; points: number[] }[];
}

export interface StandingRow {
    rank: number;
    team: { id: number; name: string; shortName: string; abbrev: string; logo: string; color: string; flag: string | null };
    wins: number;
    losses: number;
    gamesPlayed: number;
    pct: string;
    gamesBack: string;
    streak: string;
    lastTen: { wins: number; losses: number } | null;
    runsScored?: number | null;
    runsAllowed?: number | null;
    home?: { wins: number; losses: number } | null;
    away?: { wins: number; losses: number } | null;
    oneRun?: { wins: number; losses: number } | null;
    extraInning?: { wins: number; losses: number } | null;
    /** La liga ya lo marca como clasificado */
    clinched?: boolean;
}

interface SeasonInfo {
    season: number;
    isPreviousSeason: boolean;
}

export type Standings = SeasonInfo &
    (
        | { type: 'lidom'; regular: StandingRow[]; roundRobin: StandingRow[]; final: StandingRow[]; activePhase: 'regular' | 'roundRobin' | 'final'; roundRobinInfo: { games: number; advance: number } | null; regularSeasonGames?: number | null }
        | { type: 'wbc'; pools: Record<string, StandingRow[]> }
        | { type: 'sdc'; teams: StandingRow[] }
    );

export interface Leader {
    rank: number;
    id: number;
    name: string;
    teamId: number | null;
    teamName: string;
    teamAbbrev: string;
    logo: string | null;
    color: string | null;
    color2?: string | null;
    value: string | number | null;
    extra?: { ab?: number | null; h?: number | null; hr?: number | null; rbi?: number | null; ip?: string | null; k?: number | null; w?: number | null; l?: number | null; g?: number | null };
}

export interface Leaders extends SeasonInfo {
    league: LeagueId;
    categories: { id: string; group: 'hitting' | 'pitching'; leaders: Leader[]; error?: boolean }[];
}
