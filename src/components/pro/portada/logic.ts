// Lógica pura de la portada PRO (la misma de la web: el-play/src/lib/pro/portada.ts, sin la lectura, que en la app
// está en src/lib/pro/pantallas.ts): tiles de la jornada, avance de la temporada, termómetro, días, feed, en vivo,
// probabilidad de ganar, jugada del juego, línea del pelotero, lo mejor de la jornada y la hoja de ligas.
// Lo que MLB no manda llega en null: nunca se rellena.
import { isNotPlayed } from '../../../lib/baseball';
import type { ScheduleGame, StandingRow } from '../../../types';
import type { ScheduleGamePro } from '../../../types/pro-juego';
import type { CalendarGame, FormGame, SeasonCalendar, SeasonOverview } from '../../../types/pro-liga';
import type { LiveGame, LiveSlate } from '../../../lib/pro/juego';
import type { PortadaGame, PortadaKeyPlay, PortadaPerformer, PortadaWinProb } from '../../../lib/pro/pantallas';
import { contrastRatio, mix, teamInk } from '../kit';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------- Fechas

const noon = (key: string) => Date.parse(`${key}T12:00:00Z`);

/** Días entre dos fechas 'YYYY-MM-DD' (b − a) */
export const daysBetween = (a: string, b: string) => Math.round((noon(b) - noon(a)) / DAY);

/** La fecha `key` movida `days` días */
export const shiftDay = (key: string, days: number) => new Date(noon(key) + days * DAY).toISOString().slice(0, 10);

/** Cuánto va la hora local de `timeZone` por delante de UTC en ese instante (ms; negativo en América) */
const offsetAt = (ms: number, timeZone: string) => {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
            .formatToParts(ms)
            .map((part) => [part.type, part.value])
    );
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)) - ms;
};

/** Las 12:00 a. m. del día `day` en la zona de la liga, en ms (cuenta regresiva de fuera de temporada) */
export const zonedMidnight = (day: string, timeZone: string) => {
    const guess = Date.parse(`${day}T00:00:00Z`);
    return guess - offsetAt(guess, timeZone);
};

/** Día 'YYYY-MM-DD' de una hora ISO en la zona de la liga */
export const dayIn = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone });

// ---------------------------------------------------------------- Pizarra de la jornada

const played = (game: ScheduleGame) => !isNotPlayed(game.detailedState);
const runsOf = (games: ScheduleGame[]) =>
    games.filter((game) => played(game) && game.state !== 'preview').reduce((sum, game) => sum + (game.away.score ?? 0) + (game.home.score ?? 0), 0);

export interface DaySummary {
    /** Juegos de hoy (sin pospuestos ni cancelados) */
    games: number;
    live: number;
    /** Carreras de los juegos de hoy que ya empezaron */
    runs: number;
    /** Carreras de ayer; null si ayer no hubo juegos */
    runsYesterday: number | null;
    /** El próximo juego por empezar (puede ser de otro día); null si no hay */
    next: ScheduleGame | null;
}

/** Tiles de la jornada: cuántos hoy, en vivo, carreras (y las de ayer) y el próximo inicio */
export const daySummary = (byDay: Record<string, ScheduleGame[]>, today: string, now: number): DaySummary => {
    const todays = (byDay[today] ?? []).filter(played);
    const yesterday = (byDay[shiftDay(today, -1)] ?? []).filter(played);
    const upcoming = Object.values(byDay)
        .flat()
        .filter((game) => game.state === 'preview' && played(game) && Date.parse(game.date) > now - 3 * HOUR)
        .sort((a, b) => a.date.localeCompare(b.date));
    return {
        games: todays.length,
        live: todays.filter((game) => game.state === 'live').length,
        runs: runsOf(todays),
        runsYesterday: yesterday.length ? runsOf(yesterday) : null,
        next: upcoming[0] ?? null
    };
};

// ---------------------------------------------------------------- Avance de la temporada

export interface SeasonProgress {
    stage: 'preseason' | 'regular' | 'break' | 'postseason';
    /** Día N de M de la fase (null antes de empezar) */
    day: number | null;
    total: number | null;
    /** Lo lleno de la barra (0-1) */
    fraction: number;
    /** Lo que viene a la derecha: la postemporada, el fin o el inicio */
    nextKind: 'post' | 'end' | 'start' | null;
    nextDate: string | null;
}

/** Barra fina de la temporada: «Serie regular · día 3 de 63 · Round Robin desde 18 dic». null fuera de temporada o sin fechas. */
export const seasonProgress = (season: SeasonOverview | null | undefined, today: string): SeasonProgress | null => {
    const dates = season?.dates;
    if (!season || !dates || !season.stage || season.stage === 'offseason') return null;
    const span = (from: string | null, to: string | null) => {
        if (!from || !to) return { day: null, total: null, fraction: 0 };
        const total = daysBetween(from, to) + 1;
        const day = Math.min(total, Math.max(1, daysBetween(from, today) + 1));
        return { day, total, fraction: total > 0 ? day / total : 0 };
    };
    if (season.stage === 'regular') return { stage: 'regular', ...span(dates.regularStart, dates.regularEnd), nextKind: dates.postStart ? 'post' : dates.regularEnd ? 'end' : null, nextDate: dates.postStart ?? dates.regularEnd };
    if (season.stage === 'postseason') return { stage: 'postseason', ...span(dates.postStart, dates.postEnd), nextKind: dates.postEnd ? 'end' : null, nextDate: dates.postEnd };
    if (season.stage === 'break') return { stage: 'break', day: null, total: null, fraction: 1, nextKind: dates.postStart ? 'post' : null, nextDate: dates.postStart };
    return { stage: 'preseason', day: null, total: null, fraction: 0, nextKind: dates.seasonStart ? 'start' : null, nextDate: dates.seasonStart };
};

// ---------------------------------------------------------------- Termómetro de la liga

/** Fila de posiciones con lo PRO que sirva (la diferencia de carreras) si llegó */
export type ThermoRow = StandingRow & { runDiff?: number; pro?: { runDiff: number | null } };

/** Racha de MLB «W3» / «L2» */
export const parseStreak = (code: string | null | undefined) => {
    const match = /^([WL])(\d+)$/.exec(code ?? '');
    return match ? { win: match[1] === 'W', count: Number(match[2]) } : null;
};

/** Lo ganado (0-1) para el arco; null sin juegos */
export const winFraction = (wins: number, losses: number) => (wins + losses > 0 ? wins / (wins + losses) : null);

/** Diferencia de carreras de una fila de posiciones (la de MLB si viene; si no, CA − CP) */
export const runDiffOf = (row: ThermoRow) => {
    if (typeof row.pro?.runDiff === 'number') return row.pro.runDiff;
    if (typeof row.runDiff === 'number') return row.runDiff;
    if (typeof row.runsScored === 'number' && typeof row.runsAllowed === 'number') return row.runsScored - row.runsAllowed;
    return null;
};

/** Los últimos `n` de un equipo (del más reciente al más viejo) */
export const lastGames = (calendar: SeasonCalendar | undefined, teamId: number, n = 5): FormGame[] => (calendar?.form[teamId] ?? []).slice(0, n);

/** Los próximos `n` juegos de un equipo (sin los que pasaron hace más de 3 h ni los pospuestos) */
export const upcomingGames = (calendar: SeasonCalendar | undefined, teamId: number, now: number, n = 3): CalendarGame[] =>
    (calendar?.games ?? [])
        .filter((game) => game.state === 'preview' && (game.away.id === teamId || game.home.id === teamId) && Date.parse(game.date) > now - 3 * HOUR)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, n);

/** Serie particular de la temporada entre dos equipos: ganados de cada uno y jugados */
export const headToHead = (calendar: SeasonCalendar | undefined, a: number, b: number) => {
    let aWins = 0;
    let bWins = 0;
    for (const game of calendar?.games ?? []) {
        if (game.state !== 'final') continue;
        const pair = (game.away.id === a && game.home.id === b) || (game.away.id === b && game.home.id === a);
        if (!pair) continue;
        const winner = game.away.isWinner ? game.away.id : game.home.isWinner ? game.home.id : null;
        if (winner === a) aWins++;
        else if (winner === b) bWins++;
    }
    return { aWins, bWins, played: aWins + bWins };
};

/**
 * Forma de un equipo sacada del calendario del Lite (la semana que se ve): solo sirve de respaldo mientras el servidor
 * no tenga el calendario PRO. Del más reciente al más viejo.
 */
export const formFromSchedule = (games: ScheduleGame[], teamId: number, timeZone: string): FormGame[] =>
    games
        .filter((game) => game.state === 'final' && played(game) && (game.away.id === teamId || game.home.id === teamId))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((game) => {
            const isHome = game.home.id === teamId;
            const own = isHome ? game.home : game.away;
            const rival = isHome ? game.away : game.home;
            return { gamePk: game.gamePk, day: dayIn(game.date, timeZone), phase: null, opponentId: rival.id, isHome, isWin: own.isWinner, runs: own.score ?? 0, runsAllowed: rival.score ?? 0 };
        });

/** Los próximos juegos de un equipo sacados del calendario del Lite (respaldo, mismo formato que el calendario PRO) */
export const upcomingFromSchedule = (games: ScheduleGame[], teamId: number, now: number, timeZone: string, n = 3): CalendarGame[] =>
    games
        .filter((game) => game.state === 'preview' && played(game) && (game.away.id === teamId || game.home.id === teamId) && Date.parse(game.date) > now - 3 * HOUR)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, n)
        .map((game) => toCalendarGame(game, timeZone));

/** Un juego del calendario del Lite con la forma del calendario PRO (hoja «Calendario completo» de respaldo) */
export const toCalendarGame = (game: ScheduleGame, timeZone: string): CalendarGame => {
    const pro = game as ScheduleGamePro;
    const off = isNotPlayed(game.detailedState);
    return {
        gamePk: game.gamePk,
        date: game.date,
        day: dayIn(game.date, timeZone),
        gameType: game.gameType,
        phase: null,
        state: off ? (/cancel/i.test(game.detailedState) ? 'cancelled' : 'postponed') : game.state,
        detailedState: game.detailedState,
        reason: pro.reason ?? null,
        startTimeTBD: !!game.startTimeTBD,
        away: { id: game.away.id, score: game.away.score, isWinner: game.state === 'final' ? game.away.isWinner : null },
        home: { id: game.home.id, score: game.home.score, isWinner: game.state === 'final' ? game.home.isWinner : null },
        venue: game.venue,
        description: game.description,
        doubleHeader: pro.doubleHeader ?? null,
        gameNumber: pro.gameNumber ?? null,
        seriesGameNumber: pro.seriesGameNumber ?? null,
        gamesInSeries: pro.gamesInSeries ?? null,
        ifNecessary: !!pro.ifNecessary,
        dayNight: pro.dayNight ?? null
    };
};

// ---------------------------------------------------------------- Días

export interface DayInfo {
    day: string;
    total: number;
    live: number;
    /** Con un equipo elegido: si juega ese día */
    withTeam: boolean;
}

/**
 * Días de los chips en PRO: los del Lite (desde el primer juego, y hoy siempre) más la víspera del primer juego si cae
 * en el rango del calendario, que sale como «Jue 15 · Sin juegos» (como en el diseño).
 */
export const proDays = (days: string[], byDay: Record<string, ScheduleGame[]>, startDate: string | null | undefined): string[] => {
    const first = Object.keys(byDay).sort()[0];
    if (!first || !startDate) return days;
    const eve = shiftDay(first, -1);
    if (eve < startDate || days.includes(eve)) return days;
    return [...days, eve].sort();
};

/** Cada chip de día: juegos, en vivo y si juega el equipo filtrado */
export const dayInfo = (days: string[], byDay: Record<string, ScheduleGame[]>, team: number | null): DayInfo[] =>
    days.map((day) => {
        const games = byDay[day] ?? [];
        return {
            day,
            total: games.length,
            live: games.filter((game) => game.state === 'live').length,
            withTeam: team === null || games.some((game) => game.away.id === team || game.home.id === team)
        };
    });

// ---------------------------------------------------------------- Feed

const involves = (game: ScheduleGame, team: number | null) => team === null || game.away.id === team || game.home.id === team;
const isFavorite = (game: ScheduleGame, favorite: number | null) => favorite !== null && (game.away.id === favorite || game.home.id === favorite);

export interface DaySplit {
    live: ScheduleGame[];
    previews: ScheduleGame[];
    finals: ScheduleGame[];
}

/** Juegos de un día repartidos por estado: en vivo, por empezar (el favorito primero, luego por hora) y terminados */
export const splitDay = (games: ScheduleGame[], team: number | null, favorite: number | null): DaySplit => {
    const list = games.filter((game) => involves(game, team));
    const byFavoriteThenTime = (a: ScheduleGame, b: ScheduleGame) => Number(isFavorite(b, favorite)) - Number(isFavorite(a, favorite)) || a.date.localeCompare(b.date);
    return {
        live: list.filter((game) => game.state === 'live').sort(byFavoriteThenTime),
        previews: list.filter((game) => game.state === 'preview' && played(game)).sort(byFavoriteThenTime),
        finals: list.filter((game) => game.state === 'final' || !played(game)).sort((a, b) => a.date.localeCompare(b.date))
    };
};

/**
 * La tarjeta final que va completa (vaivén, jugada del juego y decisiones): la del equipo favorito si jugó;
 * si no, el juego más cerrado (menor diferencia) y, a igualdad, el más reciente.
 */
export const featuredFinal = (finals: ScheduleGame[], favorite: number | null): ScheduleGame | null => {
    const candidates = finals.filter((game) => game.state === 'final' && played(game));
    if (!candidates.length) return null;
    const fav = candidates.find((game) => isFavorite(game, favorite));
    if (fav) return fav;
    const margin = (game: ScheduleGame) => Math.abs((game.away.score ?? 0) - (game.home.score ?? 0));
    return [...candidates].sort((a, b) => margin(a) - margin(b) || b.date.localeCompare(a.date))[0];
};

export type SeriesBadge =
    | { kind: 'series'; wins: number; losses: number; leaderId: number | null; tied: boolean; game: number | null; total: number | null; over: boolean }
    | { kind: 'double'; game: number }
    | { kind: 'ifNecessary' };

/**
 * Chapas de la tarjeta: serie de verdad (de más de un juego: finales, Serie del Caribe), «Juego 2 de la doble» y
 * «Si es necesario». En la serie regular de LIDOM MLB marca cada juego como una «serie» de 1: esa no sale.
 */
export const seriesBadges = (game: ScheduleGamePro): SeriesBadge[] => {
    const badges: SeriesBadge[] = [];
    const series = game.series;
    if (series && Math.max(series.total ?? 0, game.gamesInSeries ?? 0) > 1) {
        badges.push({ kind: 'series', wins: series.wins, losses: series.losses, leaderId: series.leaderId, tied: series.tied, game: series.game, total: series.total, over: series.over });
    }
    if (game.doubleHeader && game.gameNumber) badges.push({ kind: 'double', game: game.gameNumber });
    if (game.ifNecessary) badges.push({ kind: 'ifNecessary' });
    return badges;
};

// ---------------------------------------------------------------- En vivo: cuál lectura es la más nueva

const HALF_STEP: Record<string, number> = { Top: 0, Middle: 1, Bottom: 2, End: 3 };

export interface LiveMoment {
    inning?: number | null;
    isTop?: boolean;
    inningState?: string | null;
    outs?: number;
    balls?: number;
    strikes?: number;
    runners?: { first: boolean; second: boolean; third: boolean };
    /** Carreras de los dos equipos */
    runs: number;
}

/**
 * Qué tan avanzado va un juego en vivo, para saber cuál de dos lecturas es la más nueva por lo que dicen y no por la
 * hora en que llegaron (el calendario y la fuente ligera leen MLB en momentos distintos y con cachés distintas).
 */
export const liveProgress = (moment: LiveMoment): number[] => {
    const half = moment.inningState && moment.inningState in HALF_STEP ? HALF_STEP[moment.inningState] : moment.isTop === false ? 2 : 0;
    const runners = moment.runners ? Number(moment.runners.first) + Number(moment.runners.second) + Number(moment.runners.third) : 0;
    return [moment.inning ?? 0, half, moment.outs ?? 0, moment.runs, runners, (moment.balls ?? 0) + (moment.strikes ?? 0)];
};

/** 1 si `a` va más adelante que `b`, −1 si va atrás, 0 si dicen lo mismo */
export const compareProgress = (a: number[], b: number[]) => {
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
        const x = a[index] ?? 0;
        const y = b[index] ?? 0;
        if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
};

// Mitades como índice (1.ª alta = 0, 1.ª baja = 1, 2.ª alta = 2…). Desde: donde se puede anotar después de esa lectura
// (entre mitades, la que viene). Hasta: la última mitad en que se pudo anotar antes de esa lectura.
const halfFrom = (inning: number, isTop: boolean, state: string | null | undefined) =>
    (inning - 1) * 2 + (state === 'Middle' ? 1 : state === 'End' ? 2 : state === 'Top' ? 0 : state === 'Bottom' ? 1 : isTop ? 0 : 1);
const halfTo = (inning: number, isTop: boolean, state: string | null | undefined) =>
    (inning - 1) * 2 + (state === 'Middle' ? 0 : state === 'End' ? 1 : state === 'Top' ? 0 : state === 'Bottom' ? 1 : isTop ? 0 : 1);

type InningLine = NonNullable<ScheduleGamePro['innings']>[number];
const EMPTY_HALF = { r: null, h: null, e: null, lob: null };

/**
 * Pone la mini pizarra de acuerdo con el marcador nuevo: la columna C siempre; la entrada, solo si las carreras nuevas
 * de ese equipo caben en una sola mitad entre las dos lecturas. Si no se puede saber en qué entrada fueron, las
 * entradas se quedan como estaban hasta la próxima lectura.
 */
export const patchLinescore = (game: ScheduleGamePro, away: number, home: number, to: { inning: number; isTop: boolean; inningState: string | null } | null): Pick<ScheduleGamePro, 'innings' | 'totals'> => {
    const totals = game.totals ? { away: { ...game.totals.away, r: away }, home: { ...game.totals.home, r: home } } : game.totals;
    const innings = game.innings;
    const now = game.live;
    if (!innings || !now?.inning) return { innings, totals };
    const from = halfFrom(now.inning, now.isTop, now.inningState);
    // Si la fuente ya lo da por terminado, el juego acabó en la mitad que se jugaba
    const until = to ? halfTo(to.inning, to.isTop, to.inningState) : halfTo(now.inning, now.isTop, now.inningState);
    const next = innings.map((inning) => ({ ...inning }));
    (['away', 'home'] as const).forEach((side) => {
        const delta = (side === 'away' ? away : home) - (game[side].score ?? 0);
        if (delta < 0) return;
        const halves: number[] = [];
        for (let half = Math.max(0, from); half <= until; half++) if (half % 2 === (side === 'away' ? 0 : 1)) halves.push(half);
        if (delta > 0 && halves.length !== 1) return;
        for (const half of halves) {
            const n = Math.floor(half / 2) + 1;
            let line: InningLine | undefined = next.find((item) => item.n === n);
            if (!line) {
                line = { n, away: { ...EMPTY_HALF }, home: { ...EMPTY_HALF } };
                next.push(line);
            }
            // Una mitad que ya empezó y no tiene carreras escritas lleva 0
            line[side] = { ...line[side], r: (line[side].r ?? 0) + delta };
        }
    });
    return { innings: next.sort((a, b) => a.n - b.n), totals };
};

/**
 * Tarjeta en vivo al día con la fuente ligera (/api/v2/live, cada 5 s): marcador, entrada, conteo, bases, outs y quién
 * batea, con la mini pizarra de acuerdo. Se queda con la lectura que va más adelante en el juego (liveProgress); si las
 * dos dicen lo mismo, con la que llegó después (`liveIsLater`). Así el marcador nunca vuelve atrás por una lectura vieja.
 */
export const mergeLive = (game: ScheduleGamePro, live: LiveGame | null | undefined, liveIsLater = true): ScheduleGamePro => {
    if (!live || live.gamePk !== game.gamePk || game.state !== 'live' || !game.live) return game;
    const away = live.away.score ?? game.away.score ?? 0;
    const home = live.home.score ?? game.home.score ?? 0;
    const runsBefore = (game.away.score ?? 0) + (game.home.score ?? 0);
    if (live.state === 'final') {
        if (away + home < runsBefore) return game;
        return { ...game, away: { ...game.away, score: away }, home: { ...game.home, score: home }, ...patchLinescore(game, away, home, null) };
    }
    if (live.state !== 'live') return game;
    const order = compareProgress(liveProgress({ ...live, runs: away + home }), liveProgress({ ...game.live, runs: runsBefore }));
    if (order < 0 || (order === 0 && !liveIsLater)) return game;
    const inning = live.inning ?? game.live.inning;
    const isTop = live.isTop ?? game.live.isTop;
    const inningState = live.inningState ?? game.live.inningState;
    return {
        ...game,
        away: { ...game.away, score: away },
        home: { ...game.home, score: home },
        flags: { noHitter: live.noHitter, perfectGame: live.perfectGame },
        ...patchLinescore(game, away, home, inning ? { inning, isTop, inningState } : null),
        live: {
            ...game.live,
            inning,
            isTop,
            inningState,
            balls: live.balls ?? game.live.balls,
            strikes: live.strikes ?? game.live.strikes,
            outs: live.outs ?? game.live.outs,
            runners: live.runners ?? game.live.runners,
            batter: live.batter ?? game.live.batter,
            onDeck: live.onDeck ?? game.live.onDeck,
            pitcher: live.pitcher ?? game.live.pitcher
        }
    };
};

// ---------------------------------------------------------------- Probabilidad de ganar

export interface ProbPoint {
    x: number;
    /** Probabilidad del visitante (arriba), 0-100 */
    top: number;
}

/**
 * En vivo: x por entrada (cada mitad ocupa media entrada y sus turnos se reparten dentro), así queda el sitio
 * de las entradas que faltan. 1.ª entrada = de 0 a 1.
 */
export const inningPoints = (wp: PortadaWinProb | null | undefined): ProbPoint[] => {
    if (!wp?.home.length) return [];
    const halves = new Map<string, number[]>();
    wp.home.forEach((_, index) => {
        const key = `${wp.inning[index] ?? 1}-${wp.top[index] ? 0 : 1}`;
        const list = halves.get(key) ?? [];
        list.push(index);
        halves.set(key, list);
    });
    const points: ProbPoint[] = [];
    for (const [key, indexes] of halves) {
        const [inning, half] = key.split('-').map(Number);
        indexes.forEach((index, k) => points.push({ x: inning - 1 + half * 0.5 + (0.5 * (k + 1)) / indexes.length, top: 100 - wp.home[index] }));
    }
    return points.sort((a, b) => a.x - b.x);
};

/** Terminado: un punto por turno (x = índice) */
export const playPoints = (wp: PortadaWinProb | null | undefined): ProbPoint[] => (wp?.home ?? []).map((home, index) => ({ x: index, top: 100 - home }));

/** Dónde empieza y termina cada entrada en la lista de turnos (rayas y rótulos 1-9 del vaivén) */
export const inningSpans = (wp: PortadaWinProb | null | undefined) => {
    const spans: { inning: number; from: number; to: number }[] = [];
    (wp?.inning ?? []).forEach((inning, index) => {
        if (inning === null) return;
        const last = spans[spans.length - 1];
        if (last && last.inning === inning) last.to = index;
        else spans.push({ inning, from: index, to: index });
    });
    return spans;
};

/** Cuántas entradas dibujar en vivo: 9 o las que lleve el juego */
export const inningsShown = (wp: PortadaWinProb | null | undefined, scheduled = 9) => Math.max(scheduled, ...(wp?.inning ?? []).map((inning) => inning ?? 0));

// ---------------------------------------------------------------- Jugada del juego

export type KeyPlayEffect = 'ties' | 'leads' | 'extends' | 'cuts' | 'none';

/** Qué hizo la jugada con el marcador, el marcador para escribirlo (el que va arriba primero) y a quién ayudó */
export const keyPlayEffect = (play: Pick<PortadaKeyPlay, 'top' | 'before' | 'after' | 'wpa'>) => {
    const batting: 'away' | 'home' = play.top ? 'away' : 'home';
    const other: 'away' | 'home' = play.top ? 'home' : 'away';
    const runs = play.after[batting] - play.before[batting];
    const leadBefore = play.before[batting] - play.before[other];
    const leadAfter = play.after[batting] - play.after[other];
    let effect: KeyPlayEffect = 'none';
    if (runs > 0) {
        if (leadAfter === 0) effect = 'ties';
        else if (leadAfter > 0 && leadBefore <= 0) effect = 'leads';
        else if (leadAfter > 0) effect = 'extends';
        else effect = 'cuts';
    }
    const high = Math.max(play.after.away, play.after.home);
    const low = Math.min(play.after.away, play.after.home);
    return { effect, batting, score: `${high}-${low}`, helped: play.wpa >= 0 ? ('home' as const) : ('away' as const) };
};

// ---------------------------------------------------------------- Datos del juego (gameInfo de MLB)

/** Minutos en horas y minutos */
export const hoursMinutes = (total: number) => ({ hours: Math.floor(total / 60), minutes: total % 60 });

/** Primer lanzamiento, duración y demora, lo que llegue; null si no llega nada */
export const gameInfoParts = (info: ScheduleGamePro['gameInfo']) => {
    if (!info) return null;
    const firstPitch = info.firstPitch && Number.isFinite(Date.parse(info.firstPitch)) ? info.firstPitch : null;
    const duration = typeof info.durationMin === 'number' && info.durationMin > 0 ? hoursMinutes(info.durationMin) : null;
    const delay = typeof info.delayMin === 'number' && info.delayMin > 0 ? hoursMinutes(info.delayMin) : null;
    if (!firstPitch && !duration && !delay) return null;
    return { firstPitch, duration, delay };
};

// ---------------------------------------------------------------- Línea del pelotero

export interface LinePart {
    /** Clave del texto: hits («3-4»), hr, t, d, rbi, bb, sb, ip, h, er, k */
    key: 'hits' | 'hr' | 't' | 'd' | 'rbi' | 'bb' | 'sb' | 'ip' | 'h' | 'er' | 'k';
    count: number;
    /** Lo ya escrito: «3-4», «5.0» */
    value?: string;
}

/** «3-4 · HR · 2B · 3 CI · BB» o «5.0 IP · 3 H · 1 CL · 9 K» en partes (cada idioma las escribe) */
export const lineParts = (performer: Pick<PortadaPerformer, 'hitting' | 'pitching'>): LinePart[] => {
    const parts: LinePart[] = [];
    if (performer.pitching) {
        const p = performer.pitching;
        parts.push({ key: 'ip', count: p.outs, value: p.ip }, { key: 'h', count: p.h }, { key: 'er', count: p.er }, { key: 'k', count: p.k });
        return parts;
    }
    const b = performer.hitting;
    if (!b) return parts;
    parts.push({ key: 'hits', count: b.h, value: `${b.h}-${b.ab}` });
    if (b.hr) parts.push({ key: 'hr', count: b.hr });
    if (b.t) parts.push({ key: 't', count: b.t });
    if (b.d) parts.push({ key: 'd', count: b.d });
    if (b.rbi) parts.push({ key: 'rbi', count: b.rbi });
    if (b.bb) parts.push({ key: 'bb', count: b.bb });
    if (b.sb) parts.push({ key: 'sb', count: b.sb });
    return parts;
};

/** «A, B y C» / «A, B and C» */
export const joinNames = (names: string[], lang: string) => {
    if (names.length < 2) return names.join('');
    return `${names.slice(0, -1).join(', ')} ${lang.startsWith('en') ? 'and' : 'y'} ${names[names.length - 1]}`;
};

export interface BestItem {
    performer: PortadaPerformer;
    gamePk: number | null;
}

/** Figuras de la jornada: todas las de los juegos terminados, de mayor a menor Game Score */
export const bestOfDay = (games: (PortadaGame | null | undefined)[]): BestItem[] =>
    games
        .flatMap((game) => (game?.top ?? []).map((performer) => ({ performer, gamePk: game?.gamePk ?? null })))
        .filter((item) => item.performer.gameScore !== null)
        .sort((a, b) => (b.performer.gameScore ?? 0) - (a.performer.gameScore ?? 0));

// ---------------------------------------------------------------- Hoja de ligas

export interface LeagueStatus {
    live: number;
    today: number;
    /** Hora del primer juego de hoy que falta por empezar */
    firstAt: string | null;
    stage: SeasonOverview['stage'];
    /** Fecha que se dice: fin de la fase, inicio o final de la temporada */
    date: string | null;
    daysToStart: number | null;
}

/** Estado de una liga en la hoja: en vivo, juegos de hoy y su momento de la temporada */
export const leagueStatus = (season: SeasonOverview | null | undefined, slate: LiveSlate | null | undefined, now: number): LeagueStatus => {
    // La fuente ligera ya trae solo los de hoy (y los de anoche que siguen en vivo)
    const today = (slate?.games ?? []).filter((game) => !isNotPlayed(game.detailedState));
    const pending = today.filter((game) => game.state === 'preview' && game.date && Date.parse(game.date) > now - HOUR).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    const dates = season?.dates;
    const stage = season?.stage ?? null;
    const date =
        stage === 'regular'
            ? dates?.regularEnd ?? null
            : stage === 'postseason'
              ? dates?.postEnd ?? null
              : stage === 'break'
                ? dates?.postStart ?? null
                : stage === 'preseason'
                  ? dates?.seasonStart ?? null
                  : stage === 'offseason'
                    ? dates?.seasonEnd ?? null
                    : null;
    return {
        live: today.filter((game) => game.state === 'live').length,
        today: today.length,
        firstAt: pending[0]?.date ?? null,
        stage,
        date,
        daysToStart: stage === 'preseason' ? season?.daysToStart ?? null : null
    };
};

// ---------------------------------------------------------------- Color de equipo

/**
 * Color de un equipo para texto sobre la tarjeta, legible en claro y en oscuro: se mezcla a la mitad con la tinta del
 * tema (en oscuro sale más claro, en claro más oscuro). Igual que teamText de la web (color-mix al 50 %).
 */
export const teamText = (hex: string | null | undefined, ink: string) => (hex ? mix(hex, ink, 0.5) : ink);

/**
 * Fondo con el color del equipo y su texto (blanco u oscuro, la regla de la app) con 4.5:1: si el color tal cual no
 * llega (EST #00be66 o TOR #FA4616 con blanco), se oscurece (o aclara) lo justo. Sigue siendo el color del equipo.
 */
export const teamFill = (hex: string) => {
    const ink = teamInk(hex);
    const toward = ink === '#ffffff' ? '#000000' : '#ffffff';
    let bg = hex;
    for (let step = 1; contrastRatio(bg, ink) < 4.5 && step <= 12; step++) bg = mix(hex, toward, step * 0.05);
    return { bg, ink };
};
