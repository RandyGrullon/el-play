// Contrato de la API del modo PRO, parte «liga» (server/routes/pro/liga.js de la web): posiciones, calendario de la
// temporada, líderes por fase, equipos, peloteros, ficha PRO, movimientos y fantasy. Lo que MLB no manda llega en null.
// Es el mismo de la web (el-play/src/types/pro-liga.ts): si cambia allá, se cambia aquí igual.
import type { LeagueId, StandingRow } from '../types';
import type { HittingLine, PitchingLine, PlayerRow, PlayersData, StatsTeam } from '../lib/stats';

export interface WinLoss {
    wins: number;
    losses: number;
}

/** Línea de bateo completa del PRO: la del Lite más lo que MLB manda (BB intencionales, toques, roletazos/elevados, pitcheos vistos, LOB) */
export interface ProHittingLine extends HittingLine {
    ibb: number;
    sh: number;
    go: number;
    ao: number;
    np: number;
    lob: number;
}

/** Línea de pitcheo completa del PRO: carreras, juegos completos y blanqueos, salvados (oportunidades y fallados), heredados, WP, balks… */
export interface ProPitchingLine extends PitchingLine {
    r: number;
    ibb: number;
    cg: number;
    sho: number;
    gf: number;
    svo: number;
    bs: number;
    ir: number;
    irs: number;
    wp: number;
    bk: number;
    go: number;
    ao: number;
    strikes: number;
}

// ---------------------------------------------------------------- fases

/** LIDOM: regular (R), roundRobin (L), final (W). Clásico: pool (F), quarterfinal (D), semifinal (L), final (W). Serie del Caribe: tournament (R) */
export type ProPhaseId = 'regular' | 'roundRobin' | 'final' | 'pool' | 'quarterfinal' | 'semifinal' | 'tournament';

export interface ProPhase {
    id: ProPhaseId;
    /** gameType de MLB */
    gameType: string;
    /** Ya hay juegos terminados de esa fase en la temporada (null si no se pudo saber) */
    played: boolean | null;
}

// ---------------------------------------------------------------- temporada (GET /v2/pro/season, /v2/pro/seasons)

export interface SeasonDates {
    seasonStart: string | null;
    regularStart: string | null;
    regularEnd: string | null;
    postStart: string | null;
    postEnd: string | null;
    seasonEnd: string | null;
    offseasonEnd: string | null;
}

export type SeasonStage = 'preseason' | 'regular' | 'break' | 'postseason' | 'offseason';

export interface SeasonOverview {
    league: LeagueId;
    season: number;
    /** De MLB: 'preseason' | 'inseason' | 'postseason' | 'offseason' */
    seasonState: string | null;
    /** Hoy en la hora de la liga (YYYY-MM-DD) */
    today: string;
    timeZone: string;
    regularSeasonGames: number | null;
    dates: SeasonDates | null;
    /** Regla de calificado de MLB por juego del equipo (LIDOM: 2.7 PA y 2.4 outs) */
    qualifier: { plateAppearances: number | null; outsPitched: number | null } | null;
    /** Dónde va la temporada hoy (null sin fechas de MLB) */
    stage: SeasonStage | null;
    /** Día N de la regular o de la postemporada */
    day: number | null;
    /** Días que faltan para empezar (pretemporada) */
    daysToStart: number | null;
}

// ---------------------------------------------------------------- posiciones (GET /v2/pro/standings)

export type SplitType = 'home' | 'away' | 'left' | 'right' | 'leftHome' | 'leftAway' | 'rightHome' | 'rightAway' | 'day' | 'night' | 'oneRun' | 'extraInning' | 'winners' | 'lastTen';

export interface StandingPro {
    /** Carreras anotadas − permitidas */
    runDiff: number | null;
    /** Récord esperado de MLB (xWinLoss) */
    expected: WinLoss | null;
    /** Récords por situación (vs zurdos/derechos, día/noche, contra ganadores…); falta la que MLB no manda */
    splits: Partial<Record<SplitType, WinLoss>>;
    clinched: boolean;
    eliminated: boolean;
    /** Número de eliminación de MLB (regular) o 'E'; null si no aplica */
    eliminationNumber: number | 'E' | null;
    /** Juegos respecto a la línea de clasificación (4.º en la regular; `advance` del Round Robin). Negativo = por encima, 0 = en la línea */
    cutGamesBack: number | null;
}

/** runDiff: diferencia de carreras de los grupos del Clásico (la web la tiene en StandingRow; la app todavía no) */
export type ProStandingRow = StandingRow & { runDiff?: number; pro: StandingPro };

export interface StandingsProInfo {
    /** Hay juegos en vivo o recién terminados: las posiciones se renuevan cada minuto */
    live: boolean;
    // Solo LIDOM:
    dates?: SeasonDates | null;
    regularSeasonGames?: number | null;
    advance?: { regular: number; roundRobin: number };
    phases?: {
        regular: { played: number; perTeam: number | null };
        roundRobin: { played: number; perTeam: number | null; startDate: string | null; endDate: string | null };
        final: { played: number; total: number | null; over: boolean; leaderId: number | null };
    };
    /** Última actualización de /standings según MLB (ISO) */
    lastUpdated?: string | null;
}

interface SeasonView {
    season: number;
    isPreviousSeason: boolean;
}

export type ProStandings = SeasonView & { pro: StandingsProInfo } & (
        | {
              type: 'lidom';
              regular: ProStandingRow[];
              roundRobin: ProStandingRow[];
              final: ProStandingRow[];
              activePhase: 'regular' | 'roundRobin' | 'final';
              roundRobinInfo: { games: number; advance: number; startDate?: string; endDate?: string } | null;
          }
        | { type: 'wbc'; pools: Record<string, ProStandingRow[]> }
        | { type: 'sdc'; teams: ProStandingRow[] }
    );

// ---------------------------------------------------------------- calendario de la temporada (GET /v2/pro/calendar)

export type CalendarState = 'preview' | 'live' | 'final' | 'postponed' | 'cancelled';

export interface CalendarSide {
    id: number;
    score: number | null;
    /** Solo en juegos terminados */
    isWinner: boolean | null;
}

export interface CalendarGame {
    gamePk: number;
    /** Hora de inicio (ISO) */
    date: string;
    /** Día oficial del juego (YYYY-MM-DD) */
    day: string;
    gameType: string | null;
    phase: ProPhaseId | null;
    state: CalendarState;
    detailedState: string;
    /** Motivo de posposición o demora («Rain») */
    reason: string | null;
    startTimeTBD: boolean;
    away: CalendarSide;
    home: CalendarSide;
    venue: string;
    description: string | null;
    /** 'Y' o 'S' en un doble juego; null si no es doble */
    doubleHeader: string | null;
    gameNumber: number | null;
    seriesGameNumber: number | null;
    gamesInSeries: number | null;
    ifNecessary: boolean;
    dayNight: 'day' | 'night' | null;
}

/** Récord de cada equipo al cierre de cada fecha con juegos terminados; las listas van alineadas con `dates` */
export interface PhaseRace {
    dates: string[];
    teams: Record<string, { w: number[]; l: number[] }>;
}

export interface HeadToHeadCell {
    wins: number;
    losses: number;
    runsFor: number;
    runsAgainst: number;
}

export interface FormGame {
    gamePk: number;
    day: string;
    phase: ProPhaseId | null;
    opponentId: number;
    isHome: boolean;
    isWin: boolean;
    runs: number;
    runsAllowed: number;
}

export interface SeasonCalendar extends SeasonView {
    league: LeagueId;
    timeZone: string;
    teams: Record<string, StatsTeam>;
    /** Todos los juegos de la temporada (una fila por gamePk), por hora */
    games: CalendarGame[];
    /** Carrera por fase (regular y Round Robin en LIDOM; grupos en el Clásico; torneo en la Serie del Caribe) */
    race: Partial<Record<ProPhaseId, PhaseRace>>;
    /** Cara a cara por fase: headToHead[fase][equipo][rival] */
    headToHead: Partial<Record<ProPhaseId, Record<string, Record<string, HeadToHeadCell>>>>;
    /** Últimos 10 juegos terminados de cada equipo (cualquier fase), del más reciente al más viejo */
    form: Record<string, FormGame[]>;
    live: boolean;
    updatedAt: string;
}

// ---------------------------------------------------------------- líderes (GET /v2/pro/leaders)

export interface ProLeader {
    rank: number;
    /** Empatado con otro en el mismo puesto («T-1») */
    tied: boolean;
    id: number;
    name: string;
    teamId: number | null;
    teamName: string;
    teamAbbrev: string;
    logo: string | null;
    color: string | null;
    color2: string | null;
    value: string | number | null;
    extra: {
        g: number | null;
        // bateo
        ab?: number | null;
        pa?: number | null;
        h?: number | null;
        hr?: number | null;
        rbi?: number | null;
        sb?: number | null;
        bb?: number | null;
        avg?: string | null;
        obp?: string | null;
        slg?: string | null;
        ops?: string | null;
        // pitcheo
        ip?: string | null;
        k?: number | null;
        w?: number | null;
        l?: number | null;
        gs?: number | null;
        sv?: number | null;
        hld?: number | null;
        era?: string | null;
        whip?: string | null;
    };
}

export interface ProLeaderCategory {
    id: 'homeRuns' | 'battingAverage' | 'runsBattedIn' | 'ops' | 'hits' | 'stolenBases' | 'era' | 'strikeouts' | 'wins' | 'saves' | 'whip';
    group: 'hitting' | 'pitching';
    /** Campo de MLB del valor */
    stat?: string;
    order?: 'asc' | 'desc';
    /** Promedio con jugadores calificados (MLB QUALIFIED) */
    qualified?: boolean;
    /** Hasta 10, sin ceros en las de conteo */
    leaders: ProLeader[];
    error?: boolean;
}

export interface ProLeaders extends SeasonView {
    league: LeagueId;
    phase: ProPhaseId;
    gameType: string;
    phases: ProPhase[];
    categories: ProLeaderCategory[];
}

// ---------------------------------------------------------------- equipos (GET /v2/pro/team-stats)

export interface TeamHitting extends ProHittingLine {
    babip: string | null;
}

export interface TeamPitching extends ProPitchingLine {
    k9: string | null;
    bb9: string | null;
    hr9: string | null;
}

export interface LeagueAverages {
    avg: string | null;
    obp: string | null;
    slg: string | null;
    ops: string | null;
    iso: string | null;
    babip: string | null;
    /** % de ponches y bases por bolas por aparición (bateo) */
    kPct: number | null;
    bbPct: number | null;
    hrPerGame: number | null;
    runsPerGame: number | null;
    era: string | null;
    whip: string | null;
    k9: number | null;
    bb9: number | null;
    hr9: number | null;
    /** % de ponches y bases por bolas por bateador enfrentado (pitcheo) */
    pitchingKPct: number | null;
    pitchingBbPct: number | null;
}

export interface TeamStats extends SeasonView {
    league: LeagueId;
    phase: ProPhaseId;
    gameType: string;
    teams: { team: StatsTeam; hitting: TeamHitting | null; pitching: TeamPitching | null }[];
    /** Juegos de la liga en la fase (cada juego una vez) */
    games: number;
    averages: LeagueAverages;
    /** Constante FIP de la liga: FIP = (13·HR + 3·(BB+HBP) − 2·K) / IP + fip */
    constants: { fip: number | null };
    totals: { hitting: Record<string, number>; pitching: Record<string, number | string> };
}

// ---------------------------------------------------------------- peloteros (GET /v2/pro/players)

export interface LastFive {
    g: number;
    /** Puntos de fantasy de esos 5 juegos (misma regla del juego) */
    pts: number;
    hitting: ProHittingLine | null;
    pitching: ProPitchingLine | null;
}

export interface ProPlayerRow extends Omit<PlayerRow, 'hitting' | 'pitching'> {
    hitting: ProHittingLine | null;
    pitching: ProPitchingLine | null;
    /** null si todavía no lleva 5 juegos en la fase (MLB no lo da) */
    last5: LastFive | null;
}

export interface ProPlayersData extends Omit<PlayersData, 'players'> {
    phase: ProPhaseId;
    gameType: string;
    players: ProPlayerRow[];
}

// ---------------------------------------------------------------- ficha PRO (GET /v2/pro/player/:id)

/** Línea de una situación: la de bateo, o la de pitcheo con lo que le batean (AVG/OBP/SLG/OPS) */
export type SplitLine = ProHittingLine | (ProPitchingLine & { avg: string | null; obp: string | null; slg: string | null; ops: string | null });

/** vl/vr contra zurdos y derechos, h/a casa y visita, risp corredores en posición, d/n día y noche */
export type SitCode = 'vl' | 'vr' | 'h' | 'a' | 'risp' | 'd' | 'n';

export interface HotColdMap {
    /** battingAverage, onBasePercentage, sluggingPercentage, onBasePlusSlugging, exitVelocity (bateo); también numberOfPitches, numberOfStrikes, earnedRunAverage (pitcheo) */
    metric: string;
    /** 13 zonas: 01-09 dentro (de arriba a la izquierda), 11-14 las esquinas de afuera */
    zones: { zone: string; value: string | null; temp: 'hot' | 'warm' | 'lukewarm' | 'cool' | 'cold' | string | null }[];
}

export interface ArsenalPitch {
    code: string;
    name: string;
    /** % de uso (0-100) */
    pct: number;
    count: number;
    total: number | null;
    /** Velocidad media (mph) */
    mph: number | null;
}

export interface ProGameLogRow {
    gamePk: number;
    date: string;
    gameType: string;
    phase: ProPhaseId | null;
    isHome: boolean;
    isWin: boolean | null;
    opponent: StatsTeam | null;
    /** Resumen de MLB: «2-4 | HR, 2B, 2 RBI» */
    summary: string | null;
    /** Ojo: avg/obp/slg/ops (y era/whip) de cada fila son los acumulados de la temporada hasta ese juego (así los da MLB) */
    hitting: ProHittingLine | null;
    pitching: ProPitchingLine | null;
    pts: number;
}

export interface ProCareerRow {
    season: number;
    phase: ProPhaseId | null;
    gameType: string;
    team: StatsTeam | null;
    hitting?: SplitLine;
    pitching?: SplitLine;
    pts: number;
}

export interface PlayerPro {
    league: LeagueId;
    season: number;
    currentSeason: number;
    id: number;
    name: string;
    role: 'B' | 'P';
    number: string | null;
    /** Equipo de la liga en esa temporada (currentTeam de MLB puede ser de otra liga) */
    team: StatsTeam | null;
    bio: { mlbDebut: string | null; nameMatrilineal: string | null; draft: { year: number | null; round: string | null; pick: number | null; school: string | null } | null };
    /** Temporada por fase (regular, Round Robin, final) */
    phases: { phase: ProPhaseId; gameType: string; g: number; pts: number; ppg: number; hitting: ProHittingLine | null; pitching: ProPitchingLine | null }[];
    /** Juego a juego de todas las fases, del más reciente al más viejo */
    log: ProGameLogRow[];
    splits: Partial<Record<SitCode, SplitLine>> | null;
    /** % de batazos por sector, de izquierda a derecha (solo bateadores) */
    sprayChart: { lf: number; lcf: number; cf: number; rcf: number; rf: number } | null;
    hotColdZones: HotColdMap[] | null;
    /** Repertorio (solo lanzadores; pitcheos con rastreo) */
    arsenal: ArsenalPitch[] | null;
    /** seasonAdvanced de MLB tal cual (babip, iso, whiffPercentage, qualityStarts, inheritedRunners…) */
    advanced: Record<string, string | number> | null;
    /** En victorias y en derrotas de su equipo (temporada regular) */
    byResult: { win: SplitLine | null; loss: SplitLine | null } | null;
    /** Mes a mes de la temporada regular (month 1-12; year del mes) */
    byMonth: { month: number; year: number; line: SplitLine }[] | null;
    /** Carrera en la liga por temporada y fase */
    career: ProCareerRow[];
    /** Total de la carrera por fase (de MLB) */
    careerTotals: { phase: ProPhaseId | null; gameType: string; hitting?: SplitLine; pitching?: SplitLine; pts: number }[];
    /** Premios de la liga (MVP, Lanzador, Novato, Mánager y MVP de la Final de LIDOM) */
    awards: { id: string; name: string; season: number | null; team: StatsTeam | null }[];
    /** Movimientos con equipos de la liga */
    transactions: Transaction[];
}

// ---------------------------------------------------------------- movimientos (GET /v2/pro/transactions)

export interface Transaction {
    id: number;
    date: string | null;
    /** typeCode de MLB: ASG asignado, SC cambio de estado… */
    type: string | null;
    typeDesc: string | null;
    description: string | null;
    person?: { id: number; name: string } | null;
    toTeam: StatsTeam | null;
    fromTeam: StatsTeam | null;
}

export interface Transactions {
    league: LeagueId;
    startDate: string;
    endDate: string;
    /** Solo LIDOM tiene movimientos de sus equipos */
    supported: boolean;
    transactions: Transaction[];
}

// ---------------------------------------------------------------- historia (GET /v2/pro/history)

export interface AwardWinner {
    season: number | null;
    date: string | null;
    person: { id: number; name: string };
    team: StatsTeam | null;
}

/** Campeones desde 2006 (faltan 2007 y 2008) y premios desde 2007 según MLB; solo LIDOM */
export interface LeagueHistory {
    league: LeagueId;
    supported: boolean;
    firstSeason?: number;
    champions: { season: number; team: StatsTeam; opponent: StatsTeam | null; wins: number | null; losses: number | null }[];
    awards: Partial<Record<'mvp' | 'pitcher' | 'rookie' | 'manager' | 'finalMvp', AwardWinner[]>>;
}

// ---------------------------------------------------------------- fantasy PRO

/** GET /v2/pro/fantasy/stats: solo de juegos cerrados (lo de un juego abierto no sale ni en %) */
export interface FantasyDayStats {
    league: LeagueId;
    date: string;
    /** Fanáticos con equipo o pronósticos que cuentan */
    fans: number;
    games: { gamePk: number; locked: boolean; picks: Record<string, { count: number; pct: number }> | null; picksMade: number | null }[];
    /** Por pelotero de un juego cerrado: % de fanáticos que lo tienen y % que lo hizo capitán */
    players: Record<string, { count: number; pct: number; captain: number; captainPct: number }>;
    topCaptain: { id: number; count: number; pct: number } | null;
    /** Puntos del día de cada fanático (sin nombres), de mayor a menor: para el histograma y el puesto */
    scores: number[];
    average: number | null;
    median: number | null;
    max: number | null;
    /** Próximo cierre de un juego (ms): ahí aparecen sus % */
    nextLockAt: number | null;
    final: boolean;
    partial: boolean;
    updatedAt: string;
}

/** GET /v2/pro/fantasy/form: puntos de los últimos 5 juegos de cada pelotero del día, del más reciente al más viejo */
export interface FantasyForm {
    league: LeagueId;
    date: string;
    players: Record<string, { date: string; gamePk: number; pts: number }[]>;
    partial: boolean;
}

export interface FanSeasonPro {
    /** Cuenta creada (profiles.created_at) */
    createdAt: string | null;
    picks: { made: number; won: number; pct: number | null };
    /** Días terminados con capitán y cuántos fue su mejor pelotero */
    captain: { days: number; best: number; pct: number | null };
    average: number | null;
    topPlayers: { id: number; name: string; days: number; points: number }[];
    topCaptain: { id: number; name: string; days: number } | null;
    series: { date: string; total: number }[];
}

/** GET /v2/pro/fantasy/fan/:userId: el perfil de /v2/fantasy/fan/:userId más `pro` */
export interface FanProfilePro {
    userId: string;
    league: LeagueId;
    name: string | null;
    season: { points: number; days: number; best: { date: string; points: number } | null };
    days: { date: string; final: boolean; live: boolean; team: number; picks: number; total: number; lineup: number[]; captain: number | null; picksMade: number }[];
    pro: FanSeasonPro;
}

export interface SeasonRankingProRow {
    userId: string;
    name: string | null;
    points: number;
    days: number;
    rank: number | null;
    /** Puesto antes del último día con juegos (null si ese día jugó por primera vez) */
    prevRank: number | null;
    /** Lo que sumó el último día con juegos (null si no jugó) */
    lastDay: number | null;
}

/** GET /v2/pro/fantasy/season */
export interface SeasonRankingPro {
    league: LeagueId;
    season: number;
    ranking: SeasonRankingProRow[];
    partial: boolean;
    updatedAt: string;
    /** Fanáticos con al menos un día en la temporada */
    total: number;
    lastDate: string | null;
    /** Promedio de la liga en cada día con juegos */
    daily: { date: string; average: number; fans: number }[];
}
