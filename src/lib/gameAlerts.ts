// Avisos de los juegos, la parte que no depende del teléfono (igual que useGameAlerts.ts y useFantasyAlerts.ts de la
// web): qué tipos de aviso quiere el usuario, qué se programa en el teléfono (10 minutos antes y playball), qué se avisa
// al verlo con la app abierta (resultado final y juego sin hit desde la 6.ª) y lo que suman los peloteros del Fantasy.
// Sin React Native: scripts/probar-jugadas.js lo prueba con node.
import type { GameDetail, GameState, ScheduleGame } from '../types';
import { isOnHold } from './baseball';

// ---------------------------------------------------------------- qué avisos quiere

/** soon: 10 min antes; start: playball; final: resultado; noHitter: juego sin hit en marcha; fantasy: tu equipo del Fantasy */
export interface AlertKinds {
    soon: boolean;
    start: boolean;
    final: boolean;
    noHitter: boolean;
    fantasy: boolean;
}
export const ALERT_KINDS: (keyof AlertKinds)[] = ['soon', 'start', 'final', 'noHitter', 'fantasy'];
/** Todos encendidos al principio (como la web) */
export const DEFAULT_ALERT_KINDS: AlertKinds = { soon: true, start: true, final: true, noHitter: true, fantasy: true };

/** Lo guardado (completo, a medias o roto): lo que no sea sí/no queda como viene de fábrica */
export const readAlertKinds = (saved: unknown): AlertKinds => {
    const value = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
    const kinds = { ...DEFAULT_ALERT_KINDS };
    for (const kind of ALERT_KINDS) {
        if (typeof value[kind] === 'boolean') kinds[kind] = value[kind] as boolean;
    }
    return kinds;
};

// ---------------------------------------------------------------- avisos programados en el teléfono

/** El primer aviso: el texto dice «empieza en 10 minutos» */
export const BEFORE_MS = 10 * 60 * 1000;
export type ScheduledKind = 'soon' | 'start';

/** Los avisos que se programan para un juego: 10 min antes solo con campana; playball con campana o si juega tu equipo */
export const scheduledKinds = ({ bell, favorite, kinds, start, now }: { bell: boolean; favorite: boolean; kinds: AlertKinds; start: number; now: number }): ScheduledKind[] => {
    const list: ScheduledKind[] = [];
    if (bell && kinds.soon && start - BEFORE_MS > now) list.push('soon');
    if ((bell || favorite) && kinds.start && start > now) list.push('start');
    return list;
};

export const sameKinds = (a: ScheduledKind[] | undefined, b: ScheduledKind[]) => !!a && a.length === b.length && a.every((kind) => b.includes(kind));

/** La campana de un juego se guarda hasta 12 h después de su hora: el aviso del final llega hasta 6 h después */
export const BELL_KEEP_MS = 12 * 3600000;

/**
 * Al abrir: si la campana de un juego ya no hace falta. Se va 12 h después de la hora del juego, o antes si es un juego
 * por empezar cuyos avisos el teléfono ya no tiene; las guardadas sin hora (versión vieja), cuando sonaron sus avisos.
 */
export const bellExpired = (alert: { ids: string[]; date: string | null }, pending: Set<string>, now: number) => {
    const start = alert.date ? Date.parse(alert.date) : NaN;
    const lost = alert.ids.length > 0 && !alert.ids.some((id) => pending.has(id));
    if (!Number.isFinite(start)) return lost || !alert.ids.length;
    if (start > now) return lost;
    return now - start > BELL_KEEP_MS;
};

/** El playball programado de un juego de tu equipo (sin campana) */
export interface TeamAlert {
    ids: string[];
    date: string;
    teamId: number;
}

/** Lo que hace falta de un juego del calendario para programarle el playball */
export type PlanGame = Pick<ScheduleGame, 'gamePk' | 'date' | 'state' | 'detailedState' | 'startTimeTBD'> & { away: { id: number }; home: { id: number } };

/**
 * Los playball de tu equipo favorito en los juegos sin campana: cuáles programar (o reprogramar a la hora nueva) y
 * cuáles quitar (otro favorito, playball apagado, el juego ahora tiene campana, se pospuso o ya pasó). Un juego que ya no
 * sale en el calendario guardado no se toca: su aviso sigue programado.
 */
export const planTeamAlerts = ({
    games,
    current,
    bell,
    favoriteTeamId,
    kinds,
    now
}: {
    games: PlanGame[];
    current: Record<string, TeamAlert>;
    bell: number[];
    favoriteTeamId: number | null;
    kinds: AlertKinds;
    now: number;
}) => {
    const wanted = (game: PlanGame) =>
        favoriteTeamId !== null &&
        kinds.start &&
        (game.away.id === favoriteTeamId || game.home.id === favoriteTeamId) &&
        !bell.includes(game.gamePk) &&
        game.state === 'preview' &&
        // Hora por definir: la del calendario es de relleno
        !game.startTimeTBD &&
        !isOnHold(game, now) &&
        Date.parse(game.date) > now;
    const byPk = new Map(games.map((game) => [String(game.gamePk), game]));
    const cancel: string[] = [];
    const schedule: PlanGame[] = [];
    for (const [key, alert] of Object.entries(current)) {
        const game = byPk.get(key);
        if (favoriteTeamId === null || alert.teamId !== favoriteTeamId || !kinds.start || bell.includes(Number(key))) cancel.push(key);
        else if (game) {
            if (!wanted(game)) cancel.push(key);
            else if (Date.parse(game.date) !== Date.parse(alert.date)) {
                cancel.push(key);
                schedule.push(game);
            }
        } else if (!(Date.parse(alert.date) > now)) cancel.push(key);
    }
    for (const [key, game] of byPk) {
        if (!current[key] && wanted(game)) schedule.push(game);
    }
    return { cancel, schedule };
};

// ---------------------------------------------------------------- avisos con la app abierta (final y juego sin hit)

/** Un equipo del juego como lo traen el calendario y el detalle */
export interface WatchedSide {
    id: number;
    name: string;
    abbrev: string;
    flag?: string | null;
    score: number | null;
    hits: number | null;
    isWinner: boolean;
}

export interface WatchedGame {
    gamePk: number;
    state: GameState;
    date: string | null;
    inning: number | null;
    away: WatchedSide;
    home: WatchedSide;
}

const side = (team: { id: number; name: string; abbrev: string; flag?: string | null; isWinner: boolean }, score: number | null | undefined, hits: number | null | undefined): WatchedSide => ({
    id: team.id,
    name: team.name,
    abbrev: team.abbrev,
    flag: team.flag ?? null,
    score: score ?? null,
    hits: hits ?? null,
    isWinner: !!team.isWinner
});

export const watchedFromSchedule = (game: ScheduleGame): WatchedGame => ({
    gamePk: game.gamePk,
    state: game.state,
    date: game.date ?? null,
    inning: game.live?.inning ?? null,
    away: side(game.away, game.away.score, game.away.hits),
    home: side(game.home, game.home.score, game.home.hits)
});

export const watchedFromDetail = (game: GameDetail): WatchedGame | null =>
    game.gamePk
        ? {
              gamePk: game.gamePk,
              state: game.state,
              date: game.date,
              inning: game.inning?.n ?? null,
              away: side(game.away, game.away.runs, game.away.hits),
              home: side(game.home, game.home.runs, game.home.hits)
          }
        : null;

/** El final se avisa hasta 6 h después de la hora del juego (como la web): al abrir la app al otro día no sale */
export const FINAL_WINDOW_MS = 6 * 3600000;

export type LiveAlert =
    | { key: string; kind: 'final'; game: WatchedGame }
    | { key: string; kind: 'noHitter'; game: WatchedGame; batting: WatchedSide; pitching: WatchedSide };

/**
 * Lo que toca avisar con esta lectura (web: useGameAlerts.ts). La campana avisa todo; el equipo favorito, sin campana,
 * el final y el juego sin hit. Cada aviso tiene su clave para salir una sola vez (notified dice si ya salió).
 */
export const liveAlerts = (
    games: WatchedGame[],
    { bell, favoriteTeamId, kinds, now, notified }: { bell: number[]; favoriteTeamId: number | null; kinds: AlertKinds; now: number; notified: (key: string) => boolean }
): LiveAlert[] => {
    const alerts: LiveAlert[] = [];
    const keys = new Set<string>();
    const add = (alert: LiveAlert) => {
        if (keys.has(alert.key) || notified(alert.key)) return;
        keys.add(alert.key);
        alerts.push(alert);
    };
    for (const game of games) {
        const mine = bell.includes(game.gamePk) || (favoriteTeamId !== null && (game.away.id === favoriteTeamId || game.home.id === favoriteTeamId));
        if (!mine) continue;
        const start = game.date ? Date.parse(game.date) : NaN;
        if (kinds.final && game.state === 'final' && now - start < FINAL_WINDOW_MS && (game.away.isWinner || game.home.isWinner)) {
            add({ key: `final-${game.gamePk}`, kind: 'final', game });
        }
        if (kinds.noHitter && game.state === 'live' && (game.inning ?? 0) >= 6) {
            for (const [batting, pitching] of [
                [game.away, game.home],
                [game.home, game.away]
            ] as const) {
                if (batting.hits !== 0) continue;
                add({ key: noHitterKey(game.gamePk, batting.id), kind: 'noHitter', game, batting, pitching });
            }
        }
    }
    return alerts;
};

/** Clave del aviso de juego sin hit: por juego y por el equipo que no ha conectado (la misma en el PRO) */
export const noHitterKey = (gamePk: number, battingTeamId: number) => `noHitter-${gamePk}-${battingTeamId}`;
export const finalKey = (gamePk: number) => `final-${gamePk}`;

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Título y texto del aviso (notifications.* como la web); nameOf: el nombre del equipo en el idioma de la app */
export const liveAlertText = (alert: LiveAlert, t: Translate, nameOf: (team: WatchedSide) => string) => {
    const { away, home } = alert.game;
    if (alert.kind === 'final') {
        const winner = away.isWinner ? away : home;
        return {
            title: t('notifications.final', { away: away.abbrev, awayRuns: away.score ?? 0, home: home.abbrev, homeRuns: home.score ?? 0 }),
            body: t('notifications.finalBody', { team: nameOf(winner) })
        };
    }
    return { title: t('notifications.noHitter', { team: alert.pitching.abbrev }), body: t('notifications.noHitterBody', { team: nameOf(alert.batting), count: alert.game.inning ?? 6 }) };
};

const MINUTE = 60 * 1000;

/**
 * Cada cuánto mirar el calendario por esos avisos cuando ninguna pantalla lo está mirando: cada minuto con un juego
 * tuyo en vivo (o ya en su hora y sin empezar); si falta, se despierta un minuto antes (sin pasar de 10 min entre
 * vueltas); sin juegos tuyos por delante, no se mira.
 */
export const watchInterval = (games: WatchedGame[] | undefined, isMine: (game: WatchedGame) => boolean, now: number): number | false => {
    if (!games) return false;
    const mine = games.filter(isMine);
    if (mine.some((game) => game.state === 'live')) return MINUTE;
    const pending = mine.filter((game) => game.state === 'preview' && game.date).map((game) => Date.parse(game.date!) - now);
    if (!pending.length) return false;
    const next = Math.min(...pending);
    if (next <= MINUTE) return MINUTE;
    return Math.min(10 * MINUTE, next - MINUTE);
};

/** Lo ya avisado se recuerda 3 días (así no se repite al abrir la app otra vez) */
export const NOTIFIED_KEEP_MS = 3 * 86400000;

export const pruneNotified = (saved: unknown, now: number): Record<string, number> => {
    if (!saved || typeof saved !== 'object') return {};
    return Object.fromEntries(Object.entries(saved as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && now - entry[1] < NOTIFIED_KEEP_MS));
};

// ---------------------------------------------------------------- Fantasy (web: useFantasyAlerts.ts)

/** Los puntos de cada pelotero de tu equipo en la última lectura del día */
export interface FantasySeen {
    date: string;
    points: Map<number, number>;
}

/**
 * Compara con la lectura anterior: lo que sumó cada pelotero de tu equipo (1 punto o más). La primera lectura (o un día
 * nuevo) solo marca desde dónde se cuenta. scoreOf: sus puntos (con el capitán) o null si no está en el día.
 */
export const fantasyStep = (previous: FantasySeen | null, date: string, lineup: number[], scoreOf: (id: number) => number | null) => {
    const points = new Map(lineup.map((id) => [id, scoreOf(id) ?? 0]));
    const seen: FantasySeen = { date, points };
    if (!previous || previous.date !== date) return { seen, gains: [] as { id: number; gain: number }[] };
    const gains = lineup
        .filter((id) => scoreOf(id) !== null)
        .map((id) => ({ id, gain: (points.get(id) ?? 0) - (previous.points.get(id) ?? 0) }))
        .filter((item) => item.gain >= 1);
    return { seen, gains };
};

/** «Fulano +3 · Mengano +2 · tu equipo va con 15» */
export const fantasyText = (gains: { name: string; gain: number }[], total: number, t: Translate) =>
    `${gains.map(({ name, gain }) => t('fantasyAlerts.gain', { name, pts: Math.round(gain * 10) / 10 })).join(' · ')} · ${t('fantasyAlerts.total', { pts: total })}`;
