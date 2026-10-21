// Lógica pura de «Más» en el modo PRO (la misma de la web: el-play/src/lib/pro/mas.ts y sus componentes): la tarjeta de
// mi equipo, los juegos con y sin aviso, los movimientos de la liga, el glosario y el estado de la temporada.
// Lo que MLB no manda no se inventa: llega null y el bloque no sale o sale el texto honesto.
import type { LeagueId, ScheduleGame, StandingRow } from '../../../types';
import type { CalendarGame, FormGame, LeagueHistory, SeasonCalendar, SeasonOverview, StandingPro, Transaction, WinLoss } from '../../../types/pro-liga';
import type { MetricFormat } from '../../../lib/pro/pantallas';
import type { StatsTeam } from '../../../lib/stats';
import { dayKey, localeFor } from '../../../lib/format';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// ---------------------------------------------------------------- mi equipo

/** Fila de posiciones: la PRO (con `pro`) o, si la ruta PRO no existe todavía, la del Lite */
export type TableRow = StandingRow & { pro?: StandingPro };

export interface TeamCard {
    team: StandingRow['team'];
    rank: number;
    wins: number;
    losses: number;
    pct: string;
    gamesBack: string;
    runsScored: number | null;
    runsAllowed: number | null;
    runDiff: number | null;
    /** Racha: ganando (true) o perdiendo y cuántos */
    streak: { won: boolean; n: number } | null;
    home: WinLoss | null;
    away: WinLoss | null;
    expected: WinLoss | null;
    /** Últimos 10 terminados, del más reciente al más viejo */
    form: FormGame[];
    next: CalendarGame | null;
}

/** «W3» → ganando 3; «L1» → perdiendo 1; null si MLB no la manda */
export const parseStreak = (streak: string | null | undefined) => {
    const match = /^([WL])(\d+)$/.exec(streak ?? '');
    return match ? { won: match[1] === 'W', n: Number(match[2]) } : null;
};

/** Juego del calendario del Lite en la forma del calendario PRO (para la forma y el próximo juego sin la ruta PRO) */
const calendarOf = (game: ScheduleGame): CalendarGame => ({
    gamePk: game.gamePk,
    date: game.date,
    day: dayKey(game.date),
    gameType: game.gameType,
    phase: null,
    state: game.state === 'final' && /postponed|cancel/i.test(game.detailedState) ? 'postponed' : game.state,
    detailedState: game.detailedState,
    reason: null,
    startTimeTBD: !!game.startTimeTBD,
    away: { id: game.away.id, score: game.away.score, isWinner: game.away.isWinner },
    home: { id: game.home.id, score: game.home.score, isWinner: game.home.isWinner },
    venue: game.venue,
    description: game.description,
    doubleHeader: null,
    gameNumber: null,
    seriesGameNumber: null,
    gamesInSeries: null,
    ifNecessary: false,
    dayNight: null
});

/** Los últimos 10 del equipo con los juegos terminados del calendario del Lite (lo que haya en esos días) */
const formFromSchedule = (games: ScheduleGame[], teamId: number): FormGame[] =>
    games
        .filter((game) => game.state === 'final' && !/postponed|cancel/i.test(game.detailedState) && (game.away.id === teamId || game.home.id === teamId) && game.away.score !== null && game.home.score !== null)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10)
        .map((game) => {
            const isHome = game.home.id === teamId;
            const own = isHome ? game.home : game.away;
            const rival = isHome ? game.away : game.home;
            return { gamePk: game.gamePk, day: dayKey(game.date), phase: null, opponentId: rival.id, isHome, isWin: (own.score ?? 0) > (rival.score ?? 0), runs: own.score ?? 0, runsAllowed: rival.score ?? 0 };
        });

/**
 * Todo lo de la tarjeta de mi equipo: posiciones (PRO o del Lite) + calendario PRO (forma y próximo juego) o, sin él,
 * el calendario del Lite.
 */
export const teamCardOf = (rows: TableRow[], calendar: SeasonCalendar | undefined, schedule: ScheduleGame[], teamId: number, now = Date.now()): TeamCard | null => {
    const row = rows.find((item) => item.team.id === teamId);
    if (!row) return null;
    const upcoming = (games: CalendarGame[]) =>
        games
            .filter((game) => (game.state === 'preview' || game.state === 'live') && (game.away.id === teamId || game.home.id === teamId) && Date.parse(game.date) > now - 4 * 60 * MINUTE)
            .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
    const next = calendar ? upcoming(calendar.games) : upcoming(schedule.map(calendarOf));
    const known = (value: number | null | undefined): value is number => value !== null && value !== undefined;
    return {
        team: row.team,
        rank: row.rank,
        wins: row.wins,
        losses: row.losses,
        pct: row.pct,
        gamesBack: row.gamesBack,
        runsScored: row.runsScored ?? null,
        runsAllowed: row.runsAllowed ?? null,
        runDiff: row.pro?.runDiff ?? (known(row.runsScored) && known(row.runsAllowed) ? row.runsScored - row.runsAllowed : null),
        streak: parseStreak(row.streak),
        home: row.pro?.splits?.home ?? row.home ?? null,
        away: row.pro?.splits?.away ?? row.away ?? null,
        expected: row.pro?.expected ?? null,
        form: calendar?.form?.[String(teamId)] ?? formFromSchedule(schedule, teamId),
        next
    };
};

// ---------------------------------------------------------------- avisos

export interface AlertGames {
    /** Juegos por empezar con aviso, por hora */
    on: ScheduleGame[];
    /** Por empezar sin aviso, de hoy y los dos días siguientes (hasta `limit`) */
    off: ScheduleGame[];
}

export const alertGamesOf = (games: ScheduleGame[], subscribed: number[], now = Date.now(), limit = 6): AlertGames => {
    const upcoming = games.filter((game) => game.state === 'preview' && !/postponed|cancel/i.test(game.detailedState) && Date.parse(game.date) > now).sort((a, b) => a.date.localeCompare(b.date));
    return {
        on: upcoming.filter((game) => subscribed.includes(game.gamePk)),
        off: upcoming.filter((game) => !subscribed.includes(game.gamePk) && Date.parse(game.date) - now < 3 * DAY).slice(0, limit)
    };
};

// ---------------------------------------------------------------- movimientos

/** El equipo de la liga del movimiento (al que llega o, si se va, del que sale) */
export const moveTeam = (move: Transaction): StatsTeam | null => move.toTeam ?? move.fromTeam ?? null;

const POSITIONS = ['LHP', 'RHP', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'IF', 'DH', 'UT'];

/** Posición que MLB pone en la narración («LHP Hector Yan assigned to…», «…activated CF Ismael Alcantara.») */
export const movePosition = (move: Pick<Transaction, 'description' | 'person'>) => {
    const text = move.description ?? '';
    const name = move.person?.name;
    const before = name ? text.slice(0, Math.max(0, text.indexOf(name))).trim().split(/\s+/).pop() : text.trim().split(/\s+/)[0];
    return before && POSITIONS.includes(before) ? before : null;
};

/** Clave del tipo de movimiento para los textos (asignado, activado, firmado…); null = usar el de MLB tal cual */
export const moveKind = (move: Pick<Transaction, 'type' | 'description'>) => {
    switch (move.type) {
        case 'ASG':
            return 'assigned';
        case 'SC':
            return /activated/i.test(move.description ?? '') ? 'activated' : 'status';
        case 'SGN':
        case 'SFA':
            return 'signed';
        case 'REL':
            return 'released';
        case 'TR':
            return 'trade';
        case 'DES':
            return 'designated';
        case 'OPT':
            return 'optioned';
        case 'CU':
            return 'recalled';
        default:
            return null;
    }
};

/** Movimientos de un equipo (o todos con null) */
export const movesOf = (moves: Transaction[], teamId: number | null) => (teamId === null ? moves : moves.filter((move) => moveTeam(move)?.id === teamId));

/** «16 oct» / «Oct 16» de una fecha YYYY-MM-DD (sin cambiar de día por la zona horaria) */
export const shortDay = (key: string | null | undefined, lang: string, withYear = false) =>
    key ? new Date(`${key}T12:00:00Z`).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).replace('.', '') : '';

// ---------------------------------------------------------------- historia

/** Campeonatos por equipo, de más a menos */
export const titlesByTeam = (history: LeagueHistory) => {
    const counts = new Map<number, { team: LeagueHistory['champions'][number]['team']; titles: number; last: number }>();
    for (const champion of history.champions) {
        const entry = counts.get(champion.team.id) ?? { team: champion.team, titles: 0, last: champion.season };
        entry.titles += 1;
        entry.last = Math.max(entry.last, champion.season);
        counts.set(champion.team.id, entry);
    }
    return [...counts.values()].sort((a, b) => b.titles - a.titles || b.last - a.last);
};

// ---------------------------------------------------------------- glosario

/** Cifra de una métrica: .348 / 1.039, 4.8 %, 1.01, 12.5 */
export const formatMetric = (value: number | null | undefined, format: MetricFormat, lang = 'es') => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    if (format === 'avg') return value.toFixed(3).replace(/^(-?)0(?=\.)/, '$1');
    if (format === 'pct') return lang.startsWith('en') ? `${value.toFixed(1)}%` : `${value.toFixed(1)} %`;
    return value.toFixed(format === 'dec1' ? 1 : 2);
};

/** Largo de la barra (0-1): siempre la más larga es la mejor; en «menos es mejor» la escala va al revés */
export const metricBar = (value: number | null, max: number | null, lowerIsBetter: boolean) => {
    if (value === null || !max) return 0;
    const share = Math.max(0, Math.min(1, value / max));
    return lowerIsBetter ? 1 - share : share;
};

/** Sin tildes ni mayúsculas, para el buscador del glosario */
export const plain = (text: string) =>
    text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

// ---------------------------------------------------------------- liga

type T = (key: string, options?: Record<string, unknown>) => string;

/** «Regular hasta 16 dic», «Empieza el 1 feb 2027 (en 107 días)», «Terminó el 17 mar 2026»; null sin fechas de MLB */
export const seasonState = (season: SeasonOverview | undefined, t: T, lang: string) => {
    if (!season?.stage || !season.dates) return null;
    const { dates } = season;
    switch (season.stage) {
        case 'regular':
            return t('pro.mas.league.regular', { date: shortDay(dates.regularEnd, lang) });
        case 'break':
            return t('pro.mas.league.break', { date: shortDay(dates.postStart, lang) });
        case 'postseason':
            return t('pro.mas.league.post', { date: shortDay(dates.postEnd ?? dates.seasonEnd, lang) });
        case 'preseason':
            return t('pro.mas.league.pre', { date: shortDay(dates.seasonStart, lang, true), count: season.daysToStart ?? 0 });
        default:
            return t('pro.mas.league.off', { date: shortDay(dates.seasonEnd ?? dates.postEnd, lang, true) });
    }
};

/** Siglas cortas de cada liga para su insignia */
export const LEAGUE_SHORT: Record<LeagueId, string> = { lidom: 'LIDOM', sdc: 'SDC', wbc: 'WBC' };
