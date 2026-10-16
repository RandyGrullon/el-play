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
    isWinner: boolean;
    probable: PersonRef | null;
}

export interface ScheduleGame {
    gamePk: number;
    league: LeagueId;
    date: string;
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
    pitches: Pitch[];
    actions: { event: string | null; desc: string }[];
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

export interface BoxTeam {
    batters: BatterLine[];
    pitchers: PitcherLine[];
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
    probables: { away: Decision | null; home: Decision | null };
    linescore: { n: number; away: number | null; home: number | null }[];
    atBats: AtBat[];
    currentAtBat: number | null;
    box: { away: BoxTeam; home: BoxTeam };
    decisions: { winner: Decision | null; loser: Decision | null; save: Decision | null };
    topPerformers: TopPerformer[];
    updatedAt: string | null;
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
}

interface SeasonInfo {
    season: number;
    isPreviousSeason: boolean;
}

export type Standings = SeasonInfo &
    (
        | { type: 'lidom'; regular: StandingRow[]; roundRobin: StandingRow[]; final: StandingRow[]; activePhase: 'regular' | 'roundRobin' | 'final'; roundRobinInfo: { games: number; advance: number } | null }
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
