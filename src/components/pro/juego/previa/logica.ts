// Lógica pura de la previa PRO (y lo que comparte con el final): ordinales, cara a cara, serie particular, figuras,
// viento y estadio. Es la misma de la web (el-play/src/lib/pro/previa-final.ts), llevada a la app. Todo sale de datos
// reales; si falta un dato, la función devuelve null y el bloque no sale.
import type { GameDetail, LeagueId, Schedule } from '../../../../types';
import type { CalendarGame, FormGame, ProPhaseId, ProPlayerRow } from '../../../../types/pro-liga';
import type { PlayerRow, StatsTeam } from '../../../../lib/stats';
import type { PreviaVenue } from '../../../../lib/pro/pantallas';
import { isNotPlayed } from '../../../../lib/baseball';
import { dayKey } from '../../../../lib/format';

// ---------------------------------------------------------------- Ordinales y entradas

/** «2.º» / «2.ª» en español, «2nd» en inglés */
export const ordinal = (n: number, lang: string, gender: 'm' | 'f' = 'm') => {
    if (!lang.startsWith('en')) return `${n}.${gender === 'f' ? 'ª' : 'º'}`;
    const tens = n % 100;
    const suffix = tens >= 11 && tens <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
};

/** «▲ 2.ª» (alta) / «▼ 7.ª» (baja) */
export const inningLabel = (inning: number, top: boolean, lang: string) => `${top ? '▲' : '▼'} ${ordinal(inning, lang, 'f')}`;

/** Fase de LIDOM del juego (gameType de MLB) */
export const phaseOf = (game: Pick<GameDetail, 'league' | 'gameType'>): ProPhaseId | undefined => {
    if (game.league !== 'lidom') return undefined;
    return game.gameType === 'L' ? 'roundRobin' : game.gameType === 'W' ? 'final' : 'regular';
};

// ---------------------------------------------------------------- Cifras sueltas

export type Side = 'away' | 'home';
export type Better = 'left' | 'right' | null;

export interface WinLoss {
    wins: number;
    losses: number;
}

/** Porcentaje de victorias (null sin juegos) */
export const winPct = (record: WinLoss | null | undefined) => {
    if (!record) return null;
    const games = record.wins + record.losses;
    return games > 0 ? record.wins / games : null;
};

/** «.927», «1.000» */
export const fmtPct3 = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(3).replace(/^0(?=\.)/, ''));

/** Récord pitagórico: CA^e / (CA^e + CP^e), con el exponente 1.83 de Baseball-Reference */
export const pythagorean = (runsFor: number | null | undefined, runsAgainst: number | null | undefined, exponent = 1.83) => {
    if (runsFor === null || runsFor === undefined || runsAgainst === null || runsAgainst === undefined) return null;
    if (runsFor + runsAgainst <= 0) return null;
    const a = Math.pow(runsFor, exponent);
    const b = Math.pow(runsAgainst, exponent);
    return a / (a + b);
};

export const perGame = (runs: number | null | undefined, games: number) => (runs === null || runs === undefined || games <= 0 ? null : runs / games);

/** Qué lado tiene el mejor valor (null si empatan o falta uno) */
export const betterSide = (left: number | null | undefined, right: number | null | undefined, lowerIsBetter = false): Better => {
    if (left === null || left === undefined || right === null || right === undefined || !Number.isFinite(left) || !Number.isFinite(right) || left === right) return null;
    return left > right !== lowerIsBetter ? 'left' : 'right';
};

/** Racha de MLB («W3», «L1») → tipo y largo */
export const parseStreak = (streak: string | null | undefined): { type: 'W' | 'L'; count: number } | null => {
    const match = /^([WL])(\d+)$/.exec((streak || '').trim());
    return match ? { type: match[1] as 'W' | 'L', count: Number(match[2]) } : null;
};

/** Carreras por juego promedio de la liga (por equipo) con las sumas de las posiciones */
export const leagueRunsPerGame = (rows: { runsScored?: number | null; wins: number; losses: number }[]) => {
    let runs = 0;
    let games = 0;
    for (const row of rows) {
        if (typeof row.runsScored !== 'number') continue;
        runs += row.runsScored;
        games += row.wins + row.losses;
    }
    return games > 0 ? runs / games : null;
};

/** Minutos → «3:33» */
export const clock = (minutes: number | null | undefined) => {
    if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return null;
    const total = Math.round(minutes);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** mph → km/h redondeado */
export const toKmh = (mph: number | null | undefined) => (mph === null || mph === undefined || !Number.isFinite(mph) ? null : Math.round(mph * 1.609344));

/** Outs → entradas lanzadas como las escribe MLB: 7 → «2.1» */
export const outsToIp = (outs: number | null | undefined) => (outs === null || outs === undefined ? '—' : `${Math.floor(outs / 3)}.${outs % 3}`);

/** «2.1» → 7 outs */
export const ipToOuts = (ip: string | null | undefined) => {
    const match = /^(\d+)(?:\.(\d))?$/.exec((ip || '').trim());
    return match ? Number(match[1]) * 3 + Number(match[2] || 0) : null;
};

/** Número del juego de un equipo (récord + 1) */
export const nextGameNumber = (record: WinLoss | null | undefined) => (record ? record.wins + record.losses + 1 : null);

/** Sin «Estadio» delante: «Quisqueya Juan Marichal» */
export const shortVenue = (name: string) => name.replace(/^Estadio\s+/i, '');

// ---------------------------------------------------------------- Serie particular y forma

/** Lo que necesitan la serie particular y la forma: el calendario PRO o, sin él, el calendario del Lite */
export interface SeriesSource {
    timeZone: string;
    teams: Record<string, StatsTeam>;
    games: CalendarGame[];
    /** Últimos juegos terminados de cada equipo, del más reciente al más viejo */
    form: Record<string, FormGame[]>;
    /** Cara a cara de la temporada pasada (solo con el calendario PRO) */
    headToHead?: Partial<Record<ProPhaseId, Record<string, Record<string, { wins: number; losses: number }>>>>;
    /** Con el calendario del Lite: solo cubre estas fechas (no toda la temporada) */
    window: { from: string; to: string } | null;
}

const phaseOfType = (gameType: string | null, league: LeagueId): ProPhaseId | null =>
    league !== 'lidom' ? null : gameType === 'L' ? 'roundRobin' : gameType === 'W' ? 'final' : gameType === 'R' ? 'regular' : null;

/**
 * Serie y forma con el calendario del Lite (/api/v2/schedule, el que sí está en producción): solo los días que trae
 * (unos diez), así que se dice de qué fechas es.
 */
export const sourceFromSchedule = (schedule: Schedule): SeriesSource => {
    const teams: Record<string, StatsTeam> = {};
    const games: CalendarGame[] = [];
    for (const item of schedule.games) {
        for (const side of ['away', 'home'] as const) {
            const team = item[side];
            teams[team.id] = { id: team.id, abbrev: team.abbrev, name: team.name, color: team.color, logo: team.logo };
        }
        const final = item.state === 'final' && item.away.score !== null && item.home.score !== null;
        games.push({
            gamePk: item.gamePk,
            date: item.date,
            day: dayKey(item.date, schedule.timeZone),
            gameType: item.gameType,
            phase: phaseOfType(item.gameType, schedule.league),
            state: isNotPlayed(item.detailedState) ? (/cancel/i.test(item.detailedState) ? 'cancelled' : 'postponed') : item.state,
            detailedState: item.detailedState,
            reason: null,
            startTimeTBD: !!item.startTimeTBD,
            away: { id: item.away.id, score: item.away.score, isWinner: final ? item.away.isWinner : null },
            home: { id: item.home.id, score: item.home.score, isWinner: final ? item.home.isWinner : null },
            venue: item.venue,
            description: item.description,
            doubleHeader: null,
            gameNumber: null,
            seriesGameNumber: null,
            gamesInSeries: null,
            ifNecessary: false,
            dayNight: null
        });
    }
    games.sort((a, b) => a.date.localeCompare(b.date));
    const form: Record<string, FormGame[]> = {};
    for (const item of [...games].reverse()) {
        if (item.state !== 'final' || item.away.score === null || item.home.score === null) continue;
        for (const side of ['away', 'home'] as const) {
            const own = item[side];
            const other = item[side === 'away' ? 'home' : 'away'];
            const list = (form[own.id] ??= []);
            if (list.length >= 10) continue;
            list.push({ gamePk: item.gamePk, day: item.day, phase: item.phase, opponentId: other.id, isHome: side === 'home', isWin: !!own.isWinner, runs: own.score ?? 0, runsAllowed: other.score ?? 0 });
        }
    }
    return { timeZone: schedule.timeZone, teams, games, form, window: { from: schedule.startDate, to: schedule.endDate } };
};

/** Juegos entre los equipos `a` y `b` (en la fase, si se da), del más viejo al más nuevo */
export const gamesBetween = (source: SeriesSource, a: number, b: number, phase?: ProPhaseId) =>
    source.games.filter((game) => (!phase || !game.phase || game.phase === phase) && ((game.away.id === a && game.home.id === b) || (game.away.id === b && game.home.id === a)));

export interface SeasonSeries {
    /** Juegos entre los dos en la fase, en orden (sin pospuestos ni cancelados) */
    games: CalendarGame[];
    played: CalendarGame[];
    wins: Record<number, number>;
    /** Este juego dentro de la serie (1 = el primero) */
    index: number | null;
    current: CalendarGame | null;
    /** El siguiente choque después de este */
    next: CalendarGame | null;
    /** Los que faltan después del siguiente */
    later: CalendarGame[];
    leaderId: number | null;
}

/** Serie particular de la temporada entre los equipos `a` y `b`, vista desde el juego `gamePk` */
export const seasonSeries = (list: CalendarGame[], a: number, b: number, gamePk: number | null): SeasonSeries => {
    const games = list.filter((game) => game.state !== 'postponed' && game.state !== 'cancelled').sort((x, y) => x.date.localeCompare(y.date));
    const played = games.filter((game) => game.state === 'final' && game.away.score !== null && game.home.score !== null);
    const wins: Record<number, number> = { [a]: 0, [b]: 0 };
    for (const game of played) {
        const winner = game.away.isWinner ? game.away.id : game.home.isWinner ? game.home.id : (game.away.score ?? 0) > (game.home.score ?? 0) ? game.away.id : game.home.id;
        wins[winner] = (wins[winner] ?? 0) + 1;
    }
    const position = gamePk ? games.findIndex((game) => game.gamePk === gamePk) : -1;
    const current = position >= 0 ? games[position] : null;
    const after = position >= 0 ? games.slice(position + 1) : games.filter((game) => game.state === 'preview');
    const upcoming = after.filter((game) => game.state === 'preview' || game.state === 'live');
    const leaderId = wins[a] === wins[b] ? null : wins[a] > wins[b] ? a : b;
    return { games, played, wins, index: position >= 0 ? position + 1 : null, current, next: upcoming[0] ?? null, later: upcoming.slice(1), leaderId };
};

/** Parque del calendario (nombre de MLB sin tildes) → el de la lista con ciudad */
export const venueByName = (venues: PreviaVenue[] | null | undefined, name: string | null | undefined) => {
    if (!venues || !name) return null;
    const key = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const target = key(name);
    return venues.find((venue) => key(venue.name) === target) ?? null;
};

// ---------------------------------------------------------------- Figuras de cada equipo

export interface FigureMinimums {
    /** Apariciones al plato */
    pa: number;
    /** Outs lanzados (60 = 20 IP) */
    outs: number;
}

/** Mínimos para «mejor OPS» y «mejor EFE»: 100 AP y 20 IP con la temporada completa (50 juegos), proporcionales antes */
export const figureMinimums = (teamGames: number): FigureMinimums => {
    const games = Math.max(0, teamGames);
    return { pa: Math.min(100, Math.max(3, Math.round(2 * games))), outs: Math.min(60, Math.max(9, Math.round(1.2 * games))) };
};

type FigureRow = PlayerRow | ProPlayerRow;
const opsOf = (row: FigureRow) => (row.hitting ? Number.parseFloat(row.hitting.ops) : NaN);
const eraOf = (row: FigureRow) => (row.pitching ? Number.parseFloat(row.pitching.era) : NaN);

/** Mejor bateador del equipo por OPS (con el mínimo de apariciones); a igualdad, el de más apariciones */
export const bestHitter = <T extends FigureRow>(players: T[], teamId: number, minimums: FigureMinimums): T | null =>
    players
        .filter((row) => row.teamId === teamId && row.hitting && row.hitting.pa >= minimums.pa && Number.isFinite(opsOf(row)))
        .sort((x, y) => opsOf(y) - opsOf(x) || (y.hitting?.pa ?? 0) - (x.hitting?.pa ?? 0))[0] ?? null;

/** Mejor lanzador del equipo por EFE (con el mínimo de outs); a igualdad, el de más outs */
export const bestPitcher = <T extends FigureRow>(players: T[], teamId: number, minimums: FigureMinimums): T | null =>
    players
        .filter((row) => row.teamId === teamId && row.pitching && row.pitching.outs >= minimums.outs && Number.isFinite(eraOf(row)))
        .sort((x, y) => eraOf(x) - eraOf(y) || (y.pitching?.outs ?? 0) - (x.pitching?.outs ?? 0))[0] ?? null;

// ---------------------------------------------------------------- Viento y estadio

export type WindKind = 'out' | 'in' | 'cross-lr' | 'cross-rl' | 'calm' | 'varies' | null;

/** Texto de viento de MLB («In From LF», «Out To CF», «L To R») → tipo y jardín */
export const windKind = (text: string | null | undefined): { kind: WindKind; field: 'LF' | 'CF' | 'RF' | null } => {
    const value = (text || '').trim();
    const field = (/\b(LF|CF|RF)\b/.exec(value)?.[1] as 'LF' | 'CF' | 'RF' | undefined) ?? null;
    if (/^out/i.test(value)) return { kind: 'out', field };
    if (/^in/i.test(value)) return { kind: 'in', field };
    if (/^l to r/i.test(value)) return { kind: 'cross-lr', field: null };
    if (/^r to l/i.test(value)) return { kind: 'cross-rl', field: null };
    if (/calm/i.test(value)) return { kind: 'calm', field: null };
    if (/vari/i.test(value)) return { kind: 'varies', field: null };
    return { kind: null, field: null };
};

/** Clave del cielo de MLB («Partly Cloudy») para traducirla; null si no se conoce */
export const skyKey = (condition: string | null | undefined) => {
    const value = (condition || '').toLowerCase();
    if (!value) return null;
    if (value.includes('partly')) return 'partlyCloudy';
    if (value.includes('overcast')) return 'overcast';
    if (value.includes('cloud')) return 'cloudy';
    if (value.includes('drizzle')) return 'drizzle';
    if (value.includes('rain')) return 'rain';
    if (value.includes('sun')) return 'sunny';
    if (value.includes('clear')) return 'clear';
    if (value.includes('roof') || value.includes('dome')) return 'roof';
    return null;
};

/** Lado del equipo de un pelotero en el juego */
export const sideOfTeam = (game: Pick<GameDetail, 'away' | 'home'>, teamId: number | null | undefined): Side | null =>
    teamId === game.away.id ? 'away' : teamId === game.home.id ? 'home' : null;
