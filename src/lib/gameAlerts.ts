// Avisos de los juegos, la parte que no depende del teléfono (igual que useGameAlerts.ts y useFantasyAlerts.ts de la
// web): qué tipos de aviso quiere el usuario, qué se programa en el teléfono (10 minutos antes y playball), qué se avisa
// al verlo con la app abierta (resultado final, juego sin hit desde la 6.ª y jugada a jugada: carreras, cambio de
// ventaja, jonrones y hits) y lo que suman los peloteros del Fantasy.
// Sin React Native: scripts/probar-jugadas.js lo prueba con node.
import type { AtBat, GameDetail, GameState, ScheduleGame } from '../types';
import { eventName, isOnHold } from './baseball';

// ---------------------------------------------------------------- qué avisos quiere

/**
 * soon: 10 min antes; start: playball; jugada a jugada: runs (cada carrera), lead (se van arriba, le dan la vuelta o
 * empatan), hr (jonrones) y hits; final: resultado; noHitter: juego sin hit en marcha; fantasy: tu equipo del Fantasy
 */
export interface AlertKinds {
    soon: boolean;
    start: boolean;
    runs: boolean;
    lead: boolean;
    hr: boolean;
    hits: boolean;
    final: boolean;
    noHitter: boolean;
    fantasy: boolean;
}
/** En el orden de Más → Avisos */
export const ALERT_KINDS: (keyof AlertKinds)[] = ['soon', 'start', 'runs', 'lead', 'hr', 'hits', 'final', 'noHitter', 'fantasy'];
/** Todos encendidos al principio (como la web) */
export const DEFAULT_ALERT_KINDS: AlertKinds = { soon: true, start: true, runs: true, lead: true, hr: true, hits: true, final: true, noHitter: true, fantasy: true };

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
export const planTeamAlerts = <G extends PlanGame>({
    games,
    current,
    bell,
    favoriteTeamId,
    kinds,
    now
}: {
    games: G[];
    current: Record<string, TeamAlert>;
    bell: number[];
    favoriteTeamId: number | null;
    kinds: AlertKinds;
    now: number;
}) => {
    const wanted = (game: G) =>
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
    const schedule: G[] = [];
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

// ---------------------------------------------------------------- avisos con la app abierta (final, juego sin hit y jugadas)

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

/** Media entrada: n y si es la alta */
export interface Half {
    n: number;
    top: boolean;
}

/** Lo que hace falta de un turno del detalle para el aviso de la jugada */
export type PlayAtBat = Pick<AtBat, 'i' | 'inning' | 'top' | 'complete' | 'scoring' | 'event' | 'eventLabel' | 'away' | 'home'> & { batter: { name: string } };

export interface WatchedGame {
    gamePk: number;
    state: GameState;
    date: string | null;
    inning: number | null;
    /** La media entrada de la última jugada (entre entradas, la que acaba de terminar) */
    half?: Half | null;
    away: WatchedSide;
    home: WatchedSide;
    /** Los turnos (solo el detalle los trae): quién bateó, qué fue y cómo quedó el marcador */
    atBats?: PlayAtBat[];
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

/** Entre entradas cuenta la media que acaba de terminar: en la mitad, la alta; al final, la baja */
const halfOf = (n: number | null | undefined, isTop: boolean | null | undefined, state: string | null | undefined): Half | null =>
    n ? { n, top: state === 'Middle' ? true : state === 'End' ? false : !!isTop } : null;

export const watchedFromSchedule = (game: ScheduleGame): WatchedGame => ({
    gamePk: game.gamePk,
    state: game.state,
    date: game.date ?? null,
    inning: game.live?.inning ?? null,
    half: halfOf(game.live?.inning, game.live?.isTop, game.live?.inningState),
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
              half: halfOf(game.inning?.n, game.inning?.isTop, game.inning?.state),
              away: side(game.away, game.away.runs, game.away.hits),
              home: side(game.home, game.home.runs, game.home.hits),
              atBats: game.atBats
          }
        : null;

/** El final se avisa hasta 6 h después de la hora del juego (como la web): al abrir la app al otro día no sale */
export const FINAL_WINDOW_MS = 6 * 3600000;

export type LiveAlert =
    | { key: string; kind: 'final'; game: WatchedGame }
    | { key: string; kind: 'noHitter'; game: WatchedGame; batting: WatchedSide; pitching: WatchedSide }
    | { key: string; kind: PlayKind; game: WatchedGame; play: PlayChange };

/** Los juegos que se avisan: con campana o de tu equipo favorito */
const isMine = (game: WatchedGame, bell: number[], favoriteTeamId: number | null) =>
    bell.includes(game.gamePk) || (favoriteTeamId !== null && (game.away.id === favoriteTeamId || game.home.id === favoriteTeamId));

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
        if (!isMine(game, bell, favoriteTeamId)) continue;
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

// ---------------------------------------------------------------- jugada a jugada (web: lib/playAlerts.ts)

/** Los avisos de cada jugada, del más importante al menos: de cada cambio sale uno, el primero que esté encendido */
export type PlayKind = 'hr' | 'lead' | 'runs' | 'hits';
/** Cómo cambió quién va ganando: se va arriba (desde el empate), le da la vuelta (iba perdiendo) o empata (iba perdiendo) */
export type LeadTurn = 'ahead' | 'comeback' | 'tie';
type Side = 'away' | 'home';

/**
 * Lo visto de un juego hasta ahora: lo más alto visto de carreras y hits de cada equipo (el calendario y el detalle
 * pueden llegar desfasados: una lectura atrasada no baja nada ni vuelve a avisar), el último turno terminado que trajo
 * el detalle y cuándo se leyó.
 */
export interface PlaySeen {
    away: number;
    home: number;
    awayHits: number | null;
    homeHits: number | null;
    lastAtBat: number | null;
    at: number;
}

/** Lo que pasó entre dos lecturas, para el texto del aviso */
export interface PlayChange {
    /** El equipo que anotó, se fue arriba, empató o dio el jonrón o el hit */
    side: Side;
    lead: LeadTurn | null;
    /** El turno de la jugada si lo trae el detalle; sin él (solo el calendario) el aviso es del equipo */
    atBat: { batter: string; event: string | null; eventLabel: string | null } | null;
    half: Half | null;
    score: { away: number; home: number };
}

/** Lo visto de hace más de esto (la app estuvo en segundo plano o dejó de leer el juego) no cuenta: la lectura nueva solo marca */
export const PLAY_STALE_MS = 5 * 60 * 1000;

const HIT_EVENTS = ['single', 'double', 'triple', 'home_run'];

/** Cómo cambió quién va ganando cuando anota un equipo (null si no cambió); como la web */
export const leadTurn = (before: { away: number; home: number }, after: { away: number; home: number }, side: Side): LeadTurn | null => {
    const other = side === 'away' ? 'home' : 'away';
    const was = before[side] - before[other];
    const is = after[side] - after[other];
    if (is === 0 && was < 0) return 'tie';
    if (is > 0 && was < 0) return 'comeback';
    if (is > 0 && was === 0) return 'ahead';
    return null;
};

const maxOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));

/**
 * Compara una lectura de un juego con lo visto antes (web: playAlertOf). Sin nada visto (o de hace más de PLAY_STALE_MS,
 * o con quiet) solo marca desde dónde se cuenta: lo que ya había pasado no se avisa. Con el juego en vivo sale a lo sumo
 * un aviso por cambio, el más importante de los encendidos: jonrón > cambio de ventaja > carreras > hit (el jonrón que
 * pone arriba a su equipo es el del jonrón). Quién bateó y si fue jonrón solo lo dice el detalle; con el calendario el
 * aviso es del equipo.
 */
export const playStep = (
    previous: PlaySeen | undefined,
    game: WatchedGame,
    kinds: Pick<AlertKinds, PlayKind>,
    now: number,
    quiet = false
): { seen: PlaySeen | undefined; alert: { kind: PlayKind; play: PlayChange } | null } => {
    const { away, home } = game;
    if (away.score === null || home.score === null) return { seen: previous, alert: null };
    const done = (game.atBats ?? []).filter((atBat) => atBat.complete);
    const lastAtBat = done.reduce<number | null>((max, atBat) => (max === null || atBat.i > max ? atBat.i : max), null);
    const before = previous && now - previous.at <= PLAY_STALE_MS ? previous : undefined;
    const seen: PlaySeen = {
        away: Math.max(away.score, before?.away ?? 0),
        home: Math.max(home.score, before?.home ?? 0),
        awayHits: before ? maxOf(before.awayHits, away.hits) : away.hits,
        homeHits: before ? maxOf(before.homeHits, home.hits) : home.hits,
        lastAtBat: before ? maxOf(before.lastAtBat, lastAtBat) : lastAtBat,
        at: now
    };
    if (!before || quiet || game.state !== 'live') return { seen, alert: null };

    // Quién anotó y quién dio hit; si fueron los dos, el que más (o el que está bateando)
    const batting: Side | null = game.half ? (game.half.top ? 'away' : 'home') : null;
    const which = (awayUp: number, homeUp: number): Side | null => {
        if (awayUp > 0 && homeUp > 0) return awayUp > homeUp ? 'away' : homeUp > awayUp ? 'home' : (batting ?? 'away');
        return awayUp > 0 ? 'away' : homeUp > 0 ? 'home' : null;
    };
    const hitsUp = (was: number | null, is: number | null) => (was !== null && is !== null ? is - was : 0);
    const scored = which(seen.away - before.away, seen.home - before.home);
    const hitter = which(hitsUp(before.awayHits, seen.awayHits), hitsUp(before.homeHits, seen.homeHits));
    if (!scored && !hitter) return { seen, alert: null };
    // Con carreras de los dos no se sabe en qué orden entraron: no se dice quién se fue arriba
    const bothScored = seen.away > before.away && seen.home > before.home;
    const lead = scored && !bothScored ? leadTurn(before, seen, scored) : null;

    // El turno de este cambio (del detalle): el que dejó a su equipo con más carreras que antes, o el que vino después
    // del último ya visto
    const sideOf = (atBat: PlayAtBat): Side => (atBat.top ? 'away' : 'home');
    const newTurn = (atBat: PlayAtBat) => (before.lastAtBat !== null ? atBat.i > before.lastAtBat : atBat.i === lastAtBat);
    const newRuns = (atBat: PlayAtBat) => {
        const post = atBat[sideOf(atBat)];
        return typeof post === 'number' ? post > before[sideOf(atBat)] : newTurn(atBat);
    };
    const latest = (test: (atBat: PlayAtBat) => boolean) => done.filter(test).reduce<PlayAtBat | null>((last, atBat) => (!last || atBat.i > last.i ? atBat : last), null);
    const homer = latest((atBat) => atBat.event === 'home_run' && newRuns(atBat));
    const scoring = scored ? latest((atBat) => sideOf(atBat) === scored && atBat.scoring && newRuns(atBat)) : null;
    const hit = hitter ? latest((atBat) => sideOf(atBat) === hitter && HIT_EVENTS.includes(atBat.event ?? '') && newTurn(atBat)) : null;

    const play = (side: Side, atBat: PlayAtBat | null, turn: LeadTurn | null = null): PlayChange => ({
        side,
        lead: turn,
        atBat: atBat ? { batter: atBat.batter.name, event: atBat.event, eventLabel: atBat.eventLabel } : null,
        half: atBat ? { n: atBat.inning, top: atBat.top } : (game.half ?? null),
        score: { away: seen.away, home: seen.home }
    });
    let alert: { kind: PlayKind; play: PlayChange } | null = null;
    if (kinds.hr && homer) alert = { kind: 'hr', play: play(sideOf(homer), homer, kinds.lead && sideOf(homer) === scored ? lead : null) };
    else if (kinds.lead && scored && lead) alert = { kind: 'lead', play: play(scored, scoring, lead) };
    else if (kinds.runs && scored) alert = { kind: 'runs', play: play(scored, scoring) };
    else if (kinds.hits && hitter) alert = { kind: 'hits', play: play(hitter, hit) };
    return { seen, alert };
};

/** Clave del aviso de una jugada: cómo quedaron el marcador y los hits (cada cambio sale una sola vez) */
export const playKey = (gamePk: number, seen: Pick<PlaySeen, 'away' | 'home' | 'awayHits' | 'homeHits'>) =>
    `play-${gamePk}-${seen.away}-${seen.home}-${seen.awayHits ?? 'x'}-${seen.homeHits ?? 'x'}`;

/**
 * Los avisos de jugada de esta lectura y lo visto actualizado (lo guarda quien llama, de una lectura a otra). Solo los
 * juegos con campana o de tu equipo favorito, como el final; de los demás se olvida lo visto (si después les ponen la
 * campana, su primera lectura solo marca). quiet: lo que ya estaba en la caché al empezar a mirar, que solo marca.
 */
export const playAlerts = (
    games: WatchedGame[],
    {
        bell,
        favoriteTeamId,
        kinds,
        now,
        notified,
        seen,
        quiet = false
    }: { bell: number[]; favoriteTeamId: number | null; kinds: AlertKinds; now: number; notified: (key: string) => boolean; seen: ReadonlyMap<number, PlaySeen>; quiet?: boolean }
) => {
    const next = new Map([...seen].filter(([, value]) => now - value.at <= PLAY_STALE_MS));
    const alerts: LiveAlert[] = [];
    for (const game of games) {
        if (!isMine(game, bell, favoriteTeamId)) {
            next.delete(game.gamePk);
            continue;
        }
        const step = playStep(next.get(game.gamePk), game, kinds, now, quiet);
        if (step.seen) next.set(game.gamePk, step.seen);
        else next.delete(game.gamePk);
        if (!step.alert || !step.seen) continue;
        const key = playKey(game.gamePk, step.seen);
        if (notified(key) || alerts.some((alert) => alert.key === key)) continue;
        alerts.push({ key, kind: step.alert.kind, game, play: step.alert.play });
    }
    return { alerts, seen: next };
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** «5.ª» / «5th» */
const ordinalOf = (n: number, lang: string) => {
    if (!lang.startsWith('en')) return `${n}.ª`;
    const tens = n % 100;
    const last = n % 10;
    return `${n}${tens >= 11 && tens <= 13 ? 'th' : last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`;
};

/** «Alta de la 5.ª» / «Top 5th» (Alta/Baja: game.half) */
const halfText = (half: Half, t: Translate, lang: string) => t('notifications.play.half', { half: t(`game.half.${half.top ? 'Top' : 'Bottom'}`), nth: ordinalOf(half.n, lang) });

/** Texto del aviso de una jugada; el marcador como «LIC 2 - 3 AGU» */
const playText = (kind: PlayKind, game: WatchedGame, play: PlayChange, t: Translate, nameOf: (team: WatchedSide) => string, lang: string) => {
    const score = `${game.away.abbrev} ${play.score.away} - ${play.score.home} ${game.home.abbrev}`;
    const team = nameOf(play.side === 'away' ? game.away : game.home);
    const batter = play.atBat?.batter ?? '';
    const name = play.atBat ? eventName(play.atBat, lang) : '';
    const half = play.half ? halfText(play.half, t, lang) : '';
    const detail = batter && name ? t('notifications.play.detail', { batter, play: name }) : '';
    const join = (...parts: string[]) => parts.filter(Boolean).join(' · ');
    const leadText = (turn: LeadTurn, withScore: string) => t(`notifications.play.${turn}`, { team, score: withScore }).trim();
    if (kind === 'hr' && batter) return { title: t('notifications.play.hr', { batter, score }), body: join(half, play.lead ? leadText(play.lead, '') : '') };
    if (kind === 'lead' && play.lead) return { title: leadText(play.lead, score), body: join(half, detail) };
    // El hit no trae el marcador en el título: va en el texto
    if (kind === 'hits') return { title: batter && name ? t('notifications.play.hitBy', { play: name, batter }) : t('notifications.play.hit', { team }), body: join(half, score) };
    return { title: t('notifications.play.runs', { team, score }), body: join(half, detail) };
};

/**
 * Título y texto del aviso (notifications.* como la web); nameOf: el nombre del equipo en el idioma de la app; lang: el
 * idioma (el nombre de la jugada y la entrada)
 */
export const liveAlertText = (alert: LiveAlert, t: Translate, nameOf: (team: WatchedSide) => string, lang = 'es') => {
    const { away, home } = alert.game;
    if (alert.kind === 'final') {
        const winner = away.isWinner ? away : home;
        return {
            title: t('notifications.final', { away: away.abbrev, awayRuns: away.score ?? 0, home: home.abbrev, homeRuns: home.score ?? 0 }),
            body: t('notifications.finalBody', { team: nameOf(winner) })
        };
    }
    if (alert.kind === 'noHitter') {
        return { title: t('notifications.noHitter', { team: alert.pitching.abbrev }), body: t('notifications.noHitterBody', { team: nameOf(alert.batting), count: alert.game.inning ?? 6 }) };
    }
    return playText(alert.kind, alert.game, alert.play, t, nameOf, lang);
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
