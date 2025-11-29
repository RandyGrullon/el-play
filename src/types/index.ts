export interface Team {
    id: number;
    name: string;
    abbreviation: string;
    logo: string;
    color: string;
    runs: number;
    hits: number;
    errors: number;
    isWinner?: boolean;
    players?: Player[];
    teamStats?: TeamStats;
}

export interface Player {
    id: number;
    name: string;
    position: string;
    battingOrder?: string;
    stats: {
        batting: Record<string, any>;
        pitching: Record<string, any>;
    };
}

export interface Inning {
    num: number;
    away: number;
    home: number;
}

export interface Count {
    balls: number;
    strikes: number;
    outs: number;
}

export interface Runners {
    first: boolean;
    second: boolean;
    third: boolean;
}

export interface Matchup {
    pitcher: string;
    batter: string;
}

export interface Play {
    event: string;
    description: string;
    inning: string;
    time?: string;
}

export interface Pitch {
    id: number;
    coordinates: {
        pX: number;
        pZ: number;
    };
    strikeZoneTop: number;
    strikeZoneBottom: number;
    call: string;
    code: string;
    speed: number;
    type: string;
}

export interface GameData {
    status: string;
    gameDate: string;
    isTopInning: boolean;
    inning: string;
    home: Team;
    away: Team;
    count: Count;
    runners: Runners;
    matchup: Matchup;
    lastPlay: string;
    playHistory: Play[];
    currentPitches: Pitch[];
    innings: Inning[];
    decisions?: {
        winner?: { name: string; record: string; era: string };
        loser?: { name: string; record: string; era: string };
        save?: { name: string; record: string; era: string };
    };
    topPerformers?: {
        id: number;
        name: string;
        teamLogo: string;
        stats: string;
        type: string;
    }[];
}

export interface TeamStats {
    batting: {
        runs?: number;
        hits?: number;
        homeRuns?: number;
        rbi?: number;
        baseOnBalls?: number;
        strikeOuts?: number;
        leftOnBase?: number;
        avg?: string;
        ops?: string;
    };
    pitching: {
        runs?: number;
        hits?: number;
        baseOnBalls?: number;
        strikeOuts?: number;
        era?: string;
    };
    fielding: {
        errors?: number;
    };
}

export interface ScheduleItem {
    gamePk: number;
    status: string;
    date: string;
    away: {
        id: number;
        name: string;
        abbrev: string;
        logo: string;
        score: number;
        isWinner?: boolean;
    };
    home: {
        id: number;
        name: string;
        abbrev: string;
        logo: string;
        score: number;
        isWinner?: boolean;
    };
    liveData?: {
        inning: string;
        isTopInning: boolean;
        balls: number;
        strikes: number;
        outs: number;
        runners: Runners;
    };
}
