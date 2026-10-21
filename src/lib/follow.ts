// Seguir un juego en segundo plano: Live Activity en el iPhone (pantalla bloqueada e isla dinámica) y notificación
// fija en Android. Se actualiza con cada lectura nueva del juego mientras la app está abierta; al salir queda la última
// jugada (y se marca como desactualizada). Para que siga sola con la app cerrada hace falta push (docs/SEGUNDO-PLANO.md).
// expo-widgets no existe en la web ni en Expo Go: ahí no se hace nada y el botón no sale.
//
// En PRO (cuenta abierta + modo PRO) además: logos, duelo, últimas jugadas y probabilidad de ganar en la actividad;
// la fuente ligera /api/v2/live entre lecturas del detalle (si el servidor la tiene); alertas opcionales (jonrón de tu
// equipo, empate o cambio de ventaja, no-hitter, final); y seguir solo el juego de tu equipo («Seguir en la pantalla de
// bloqueo»: automático / preguntar / nunca). El Lite sigue exactamente igual.
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import { requireOptionalNativeModule } from 'expo';
import type { GameDetail, LeagueId, Schedule } from '../types';
import type { LiveGameProps, LiveSurface } from '../live/types';
import { liveGameKey, liveGameProps, withCount, type LiveExtras } from '../live/props';
import { alertBaseline, DEFAULT_ALERTS, detectAlerts, ensureAlertPermission, postAlert, type AlertKind, type AlertMemory, type AlertPrefs } from '../live/alerts';
import i18n from '../i18n';
import { api } from './api';
import { gameInterval } from './polling';
import { keys, queryClient } from './queries';
import { proJuegoApi, proKeys, type LiveGame, type LiveSlate, type WinProb } from './pro/juego';
import { getItem, onHydrated, readJson, removeItem, writeJson } from './storage';
import { showToast } from './toast';

const load = (): LiveSurface | null => {
    try {
        // Web: solo la superficie de prueba de la web de desarrollo (src/live/surface.ts; null si no está encendida)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        if (Platform.OS === 'web') return (require('../live/surface') as typeof import('../live/surface')).surface;
        if (!requireOptionalNativeModule('ExpoWidgets')) return null;
        // Se carga tarde a propósito: importar expo-widgets sin su módulo nativo (Expo Go) rompe la pantalla.
        // Metro escoge surface.ios.ts o surface.android.ts.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return (require('../live/surface') as typeof import('../live/surface')).surface;
    } catch {
        return null;
    }
};

const surface = load();

/** Hay development build con expo-widgets (iPhone o Android) */
export const followSupported = surface !== null;

export type FollowResult = 'on' | 'off' | 'blocked' | 'error';

/** El juego que se sigue y el id de su actividad/notificación (sobrevive a cerrar la app) */
interface Followed {
    gamePk: number;
    id: string;
    /** Liga del juego (para la fuente ligera); los guardados antes no la traen */
    league?: LeagueId;
}

const KEY = 'el-play-follow';
/** Aunque nada cambie, cada tanto se manda la lectura para que no se marque como desactualizada */
const HEARTBEAT_MS = 2 * 60 * 1000;

let followed: Followed | null = null;
let busy = false;
let snapshot = { gamePk: null as number | null, busy: false };
const listeners = new Set<() => void>();

let lastKey = '';
let lastPush = 0;
/** Cuándo se leyó (dataUpdatedAt) lo último que se mandó: una lectura más vieja no la pisa */
let lastRead = 0;
let lastGame: GameDetail | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

// ---------------------------------------------------------------- PRO: modo, preferencias y lo que no se repite

/** PRO = cuenta abierta + modo PRO (lo mismo que useIsPro de pro.ts, leído sin hooks: aquí no hay componente) */
const isPro = () => {
    try {
        const session = JSON.parse(getItem('el-play-session') || 'null') as { user?: { id?: string } } | null;
        return !!session?.user?.id && getItem(`el-play-ui-mode:${session.user.id}`) === 'pro';
    } catch {
        return false;
    }
};

/** «Seguir en la pantalla de bloqueo» para el juego de tu equipo */
export type LockMode = 'auto' | 'ask' | 'never';
export interface FollowPrefs {
    mode: LockMode;
    alerts: AlertPrefs;
}
export type { AlertKind };

const PREFS_KEY = 'el-play-follow-prefs';
const DISMISSED_KEY = 'el-play-follow-dismissed';
const FAVORITE_KEY = 'el-play-favorite-team';
const DEFAULT_PREFS: FollowPrefs = { mode: 'auto', alerts: { ...DEFAULT_ALERTS } };

let prefs: FollowPrefs = DEFAULT_PREFS;
const prefListeners = new Set<() => void>();
const readPrefs = (): FollowPrefs => {
    const saved = readJson<Partial<FollowPrefs> | null>(PREFS_KEY, null);
    const mode = saved?.mode === 'ask' || saved?.mode === 'never' ? saved.mode : 'auto';
    return { mode, alerts: { ...DEFAULT_ALERTS, ...(saved?.alerts ?? {}) } };
};
const savePrefs = (next: FollowPrefs) => {
    prefs = next;
    writeJson(PREFS_KEY, next);
    prefListeners.forEach((listener) => listener());
};

/** Juegos que el usuario dejó de seguir: no se vuelven a seguir solos */
let dismissed: number[] = [];
const dismiss = (gamePk: number) => {
    if (dismissed.includes(gamePk)) return;
    dismissed = [...dismissed, gamePk].slice(-30);
    writeJson(DISMISSED_KEY, dismissed);
};
/** Juegos de tu equipo ya preguntados o empezados solos en esta sesión */
const asked = new Set<number>();

/** Logos ya bajados (id del equipo → file://) */
let logos: Record<number, string> = {};
/** Lo visto del juego para las alertas */
let memory: AlertMemory | null = null;

const emit = () => {
    snapshot = { gamePk: followed?.gamePk ?? null, busy };
    listeners.forEach((listener) => listener());
};

const save = (next: Followed | null) => {
    followed = next;
    if (next) writeJson(KEY, next);
    else removeItem(KEY);
    lastKey = '';
    lastPush = 0;
    if (!next) {
        lastGame = null;
        memory = null;
    }
    emit();
    schedule();
};

// Una cosa a la vez: empezar, actualizar y terminar no se pisan
let queue: Promise<unknown> = Promise.resolve();
const run = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task);
    queue = next.catch(() => undefined);
    return next;
};

/** PRO: probabilidad de ganar (la más nueva entre /winprob y /live, si el servidor las tiene) y logos */
const extrasFor = (game: GameDetail): LiveExtras | undefined => {
    if (!isPro()) return undefined;
    const gamePk = game.gamePk ?? 0;
    const winProb = queryClient.getQueryState<WinProb>(proKeys.winProb(gamePk));
    const slate = queryClient.getQueryState<LiveSlate>(proKeys.live(game.league));
    const plays = winProb?.data?.plays ?? [];
    const fromWinProb = plays.length ? 100 - plays[plays.length - 1].home : null;
    const liveWp = slate?.data?.games.find((item) => item.gamePk === gamePk)?.wp;
    const fromLive = liveWp && typeof liveWp.away === 'number' ? liveWp.away : null;
    const wpAway = fromLive !== null && (fromWinProb === null || (slate?.dataUpdatedAt ?? 0) > (winProb?.dataUpdatedAt ?? 0)) ? fromLive : fromWinProb;
    return { pro: true, logos, wpAway, wpSeries: plays.map((play) => 100 - play.home) };
};

/** PRO: baja los logos que falten; cuando llegan se vuelve a mandar la última lectura */
const fetchLogos = async (game: GameDetail) => {
    if (!surface?.logos || !isPro()) return false;
    const missing = [game.away, game.home].filter((team) => !logos[team.id]);
    if (!missing.length) return false;
    const found = await surface.logos(missing.map(({ id, logo }) => ({ id, logo }))).catch(() => ({}) as Record<number, string>);
    if (!Object.keys(found).length) return false;
    logos = { ...logos, ...found };
    return true;
};

/** PRO: alertas de esta lectura (la primera solo marca lo ya visto) */
const checkAlerts = (game: GameDetail) => {
    if (!memory || memory.gamePk !== game.gamePk) {
        memory = alertBaseline(game);
        return;
    }
    const result = detectAlerts(memory, game, prefs.alerts, readJson<number | null>(FAVORITE_KEY, null));
    memory = result.memory;
    result.alerts.forEach((alert) => {
        postAlert(alert, game.gamePk ?? 0).catch(() => undefined);
    });
};

/** Manda las props si cambiaron (o si toca el latido); si la actividad ya no existe se deja de seguir */
const send = async (current: Followed, props: LiveGameProps) => {
    if (!surface) return;
    const key = liveGameKey(props);
    if (key === lastKey && Date.now() - lastPush < HEARTBEAT_MS) return;
    const alive = await surface.update(current.id, props);
    if (followed !== current) return;
    // El usuario la quitó (deslizó la actividad o la notificación) o el sistema la terminó (8 h en iOS)
    if (!alive) {
        dismiss(current.gamePk);
        save(null);
        return;
    }
    lastKey = key;
    lastPush = Date.now();
};

const push = async (game: GameDetail) => {
    const current = followed;
    if (!surface || !current || game.gamePk !== current.gamePk) return;
    const extras = extrasFor(game);
    if (extras) checkAlerts(game);
    else memory = null;
    const props = liveGameProps(game, i18n.language, Date.now(), undefined, extras);
    // Terminó: queda el marcador final un rato y se deja de seguir
    if (game.state === 'final') {
        await surface.end(current.id, props);
        if (followed === current) save(null);
        return;
    }
    await send(current, props);
    // Los logos llegan después de la primera lectura: se repite con ellos
    if (extras && followed === current && (await fetchLogos(game))) {
        lastKey = '';
        await send(current, liveGameProps(game, i18n.language, Date.now(), undefined, extrasFor(game)));
    }
};

/** Cada lectura nueva del juego que se sigue va a la actividad (desde la pantalla o desde el sondeo de abajo) */
export const syncFollow = (game: GameDetail, readAt: number) => {
    if (!surface || !followed || game.gamePk !== followed.gamePk) return;
    // Al volver a la pantalla, React Query primero da lo que tenía guardado: si es más viejo que lo mandado, no va
    if (readAt <= lastRead) return;
    lastRead = readAt;
    lastGame = game;
    run(() => push(game)).catch(() => undefined);
};

// Sondeo propio: sigue actualizando aunque la pantalla del juego no esté abierta (otra pestaña). En segundo plano el
// sistema congela los temporizadores y sigue al volver. Va por la caché de React Query: con la pantalla del juego abierta
// y la app a la vista no se pide (useGame ya lo pide), si se leyó hace poco se usa eso y lo leído aquí lo ve la pantalla.
const intervalOf = () => (lastGame ? gameInterval(lastGame) : false) || 15 * 1000;

function schedule() {
    clearTimeout(timer);
    if (!surface || !followed) return;
    timer = setTimeout(tick, intervalOf());
}

/** Con la fuente ligera, ¿cambió algo que pide el detalle? (carrera, out, entrada, bateador, lanzador, corredores) */
const needsDetail = (game: GameDetail, live: LiveGame) => {
    if (live.state !== game.state || live.detailedState !== game.detailedState) return true;
    if ((live.away.score ?? 0) !== (game.away.runs ?? 0) || (live.home.score ?? 0) !== (game.home.runs ?? 0)) return true;
    if (live.state !== 'live') return false;
    if ((live.outs ?? 0) !== game.count.outs) return true;
    if ((live.inning ?? null) !== (game.inning?.n ?? null) || (live.isTop ?? null) !== (game.inning?.isTop ?? null) || (live.inningState ?? null) !== (game.inning?.state ?? null)) return true;
    if ((live.batter?.id ?? null) !== (game.matchup?.batter.id ?? null) || (live.pitcher?.id ?? null) !== (game.matchup?.pitcher.id ?? null)) return true;
    const runners = live.runners ?? { first: false, second: false, third: false };
    return runners.first !== !!game.runners.first || runners.second !== !!game.runners.second || runners.third !== !!game.runners.third;
};

/**
 * PRO: lee /api/v2/live (1-2 KB) en vez del detalle (~100 KB). Si solo cambiaron bolas y strikes del mismo turno, con
 * eso alcanza; si pasó algo más (o el servidor no tiene la ruta: 404), devuelve false y se pide el detalle.
 */
const tickLight = async (current: Followed) => {
    const game = lastGame;
    const league = current.league ?? game?.league;
    if (!game || !league || game.state !== 'live') return false;
    let slate: LiveSlate;
    try {
        slate = await queryClient.fetchQuery({ queryKey: proKeys.live(league), queryFn: ({ signal }) => proJuegoApi.live(league, signal), staleTime: intervalOf() - 1000, retry: false });
    } catch {
        return false;
    }
    const live = slate.games.find((item) => item.gamePk === current.gamePk);
    if (!live || followed !== current || lastGame !== game || needsDetail(game, live)) return false;
    const props = withCount(liveGameProps(game, i18n.language, Date.now(), undefined, extrasFor(game)), live.balls ?? 0, live.strikes ?? 0);
    await run(() => (followed === current ? send(current, props) : Promise.resolve()));
    return true;
};

async function tick() {
    const current = followed;
    if (!current) return;
    const key = keys.game(current.gamePk);
    // Sin foco (app en segundo plano y aún viva en Android) useGame no sondea: entonces se pide aquí
    const watched = focusManager.isFocused() && (queryClient.getQueryCache().find({ queryKey: key })?.getObserversCount() ?? 0) > 0;
    if (!watched) {
        try {
            const pro = isPro();
            if (!(pro && (await tickLight(current)))) {
                // Android (gráfica turno a turno): la probabilidad se relee junto con el detalle
                if (pro && Platform.OS === 'android') {
                    await queryClient
                        .fetchQuery({ queryKey: proKeys.winProb(current.gamePk), queryFn: ({ signal }) => proJuegoApi.winProb(current.gamePk, signal), staleTime: 9000, retry: false })
                        .catch(() => undefined);
                }
                const game = await queryClient.fetchQuery({ queryKey: key, queryFn: ({ signal }) => api.game(current.gamePk, signal), staleTime: intervalOf() - 1000, retry: false });
                syncFollow(game, queryClient.getQueryState(key)?.dataUpdatedAt ?? Date.now());
            }
        } catch {
            /* sin red: se intenta en la próxima vuelta */
        }
    }
    schedule();
}

const start = async (game: GameDetail, ask = true): Promise<FollowResult> => {
    if (!surface || !game.gamePk) return 'error';
    // Un juego a la vez: el anterior se quita
    if (followed) {
        const previous = followed;
        save(null);
        await surface.end(previous.id, null);
    }
    // PRO: con los logos desde el principio (si tardan, salen en la próxima lectura)
    if (isPro()) await Promise.race([fetchLogos(game), new Promise((resolve) => setTimeout(resolve, 2500))]);
    const extras = extrasFor(game);
    const props = liveGameProps(game, i18n.language, Date.now(), undefined, extras);
    const result = await surface.start(props, { ask });
    if (!result.ok) return result.reason;
    save({ gamePk: game.gamePk, id: result.id, league: game.league });
    lastKey = liveGameKey(props);
    lastPush = Date.now();
    lastRead = queryClient.getQueryState(keys.game(game.gamePk))?.dataUpdatedAt ?? 0;
    lastGame = game;
    memory = extras ? alertBaseline(game) : null;
    return 'on';
};

const stop = async (): Promise<FollowResult> => {
    const current = followed;
    if (!surface || !current) return 'off';
    dismiss(current.gamePk);
    save(null);
    await surface.end(current.id, null);
    return 'off';
};

/** Botón «Seguir en segundo plano» / «Dejar de seguir» */
export const toggleFollow = async (game: GameDetail): Promise<FollowResult> => {
    if (!surface || busy) return 'error';
    busy = true;
    emit();
    try {
        return await run(() => (followed?.gamePk === game.gamePk ? stop() : start(game)));
    } catch {
        return 'error';
    } finally {
        busy = false;
        emit();
    }
};

// Al abrir la app: se recupera la actividad del juego que se seguía (getInstances / getActive) y se quitan las que
// sobran (de otro juego, o con «Dejar de seguir» tocado en Android con la app cerrada). El marcador final de Android
// se deja: se va solo a los 20 minutos.
const restore = async () => {
    if (!surface) return;
    const stored = readJson<Followed | null>(KEY, null);
    const active = await surface.active().catch(() => []);
    let keep: Followed | null = null;
    for (const handle of active) {
        if (stored && handle.id === stored.id && !handle.stopped) keep = stored;
        else if (!handle.final || handle.stopped) await surface.end(handle.id, null);
        if (stored && handle.id === stored.id && handle.stopped) dismiss(stored.gamePk);
    }
    save(keep);
    if (keep) tick().catch(() => undefined);
};

// ---------------------------------------------------------------- PRO: el juego de tu equipo

const toastTexts = (away: string, home: string) => {
    const where = i18n.t(`pro.segundo-plano.toast.${Platform.OS === 'ios' ? 'whereIos' : Platform.OS === 'android' ? 'whereAndroid' : 'whereWeb'}`);
    return {
        ask: i18n.t('pro.segundo-plano.toast.ask', { away, home, where }),
        auto: i18n.t('pro.segundo-plano.toast.auto', { away, home, where }),
        follow: i18n.t('pro.segundo-plano.toast.follow'),
        undo: i18n.t('pro.segundo-plano.toast.undo')
    };
};

/** Empieza a seguir un juego por su número (lee el detalle); ask: puede pedir permisos (lo tocó el usuario) */
const startByPk = async (gamePk: number, ask: boolean): Promise<FollowResult> => {
    if (!surface || busy) return 'error';
    busy = true;
    emit();
    try {
        const game = await queryClient.fetchQuery({ queryKey: keys.game(gamePk), queryFn: ({ signal }) => api.game(gamePk, signal), staleTime: 5000, retry: false });
        if (game.state !== 'live' || followed?.gamePk === gamePk) return 'off';
        return await run(() => start(game, ask));
    } catch {
        return 'error';
    } finally {
        busy = false;
        emit();
    }
};

/** El juego de tu equipo está en vivo: según el ajuste, se sigue solo o se pregunta con un aviso */
const onTeamLive = (gamePk: number, away: string, home: string) => {
    asked.add(gamePk);
    const words = toastTexts(away, home);
    const askNow = () => showToast(words.ask, { label: words.follow, run: () => void startByPk(gamePk, true) }, 10000);
    if (prefs.mode === 'ask') {
        askNow();
        return;
    }
    startByPk(gamePk, false)
        .then((result) => {
            if (result === 'on') showToast(words.auto, { label: words.undo, run: () => void run(stop) }, 6000);
            // Sin permiso (Android) no se pide solo: se pregunta y el toque lo pide
            else if (result === 'blocked') askNow();
        })
        .catch(() => undefined);
};

interface TeamGame {
    gamePk: number;
    state: string;
    awayId: number | null;
    homeId: number | null;
    away: string;
    home: string;
}

// Mira el calendario, la fuente ligera y el detalle que ya lee la app (no pide nada por su cuenta)
const watchFavorite = () =>
    queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return;
        if (followed || busy || prefs.mode === 'never' || !isPro()) return;
        const favorite = readJson<number | null>(FAVORITE_KEY, null);
        if (favorite === null) return;
        const [kind, sub] = event.query.queryKey as unknown[];
        const data = event.action.data;
        let games: TeamGame[] = [];
        if (kind === 'schedule') {
            games = ((data as Schedule | undefined)?.games ?? []).map((game) => ({ gamePk: game.gamePk, state: game.state, awayId: game.away.id, homeId: game.home.id, away: game.away.abbrev, home: game.home.abbrev }));
        } else if (kind === 'pro' && sub === 'live') {
            games = ((data as LiveSlate | undefined)?.games ?? []).map((game) => ({ gamePk: game.gamePk, state: game.state, awayId: game.away.id, homeId: game.home.id, away: game.away.abbrev, home: game.home.abbrev }));
        } else if (kind === 'game' && data) {
            const game = data as GameDetail;
            if (game.gamePk) games = [{ gamePk: game.gamePk, state: game.state, awayId: game.away.id, homeId: game.home.id, away: game.away.abbrev, home: game.home.abbrev }];
        }
        const mine = games.find((game) => game.state === 'live' && (game.awayId === favorite || game.homeId === favorite));
        if (!mine || dismissed.includes(mine.gamePk) || asked.has(mine.gamePk)) return;
        // El iPhone solo deja empezar una Live Activity con la app a la vista
        if (Platform.OS !== 'web' && AppState.currentState !== 'active') return;
        onTeamLive(mine.gamePk, mine.away, mine.home);
    });

if (surface) {
    onHydrated(() => {
        prefs = readPrefs();
        dismissed = readJson<number[]>(DISMISSED_KEY, []);
        prefListeners.forEach((listener) => listener());
        run(restore).catch(() => undefined);
    });
    // Android: «Dejar de seguir» desde la notificación con la app viva
    surface.onStop((id) => {
        run(async () => {
            if (followed?.id === id) await stop();
            else await surface.end(id, null);
        }).catch(() => undefined);
    });
    watchFavorite();
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
const getSnapshot = () => snapshot;

/** Si este juego es el que se sigue (y si se está empezando o quitando) */
export const useFollow = (gamePk: number | null | undefined) => {
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return { supported: followSupported, following: !!gamePk && state.gamePk === gamePk, busy: state.busy };
};

/** El juego que se sigue ahora (null si ninguno) */
export const useFollowedGame = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot).gamePk;

/**
 * En la pantalla del juego: cada lectura de useGame actualiza la actividad si es el juego que se sigue.
 * readAt (dataUpdatedAt) cuenta las lecturas aunque React Query devuelva el mismo objeto porque nada cambió.
 */
export const useFollowSync = (game: GameDetail | undefined, readAt: number) => {
    useEffect(() => {
        if (game) syncFollow(game, readAt);
    }, [game, readAt]);
};

// ---------------------------------------------------------------- PRO: ajustes (la tarjeta del juego y Más)

const subscribePrefs = (listener: () => void) => {
    prefListeners.add(listener);
    return () => {
        prefListeners.delete(listener);
    };
};
const getPrefs = () => prefs;

/** Alertas del juego y «Seguir en la pantalla de bloqueo» (se guardan en el teléfono) */
export const useFollowPrefs = () => useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);

export const setLockMode = (mode: LockMode) => savePrefs({ ...prefs, mode });

/**
 * Prende o apaga una alerta. Al prender una en el teléfono pide el permiso de avisos si falta; devuelve false si los
 * avisos están bloqueados (la alerta queda prendida y sonará cuando se permitan).
 */
export const setAlertPref = async (kind: AlertKind, on: boolean) => {
    savePrefs({ ...prefs, alerts: { ...prefs.alerts, [kind]: on } });
    if (!on || Platform.OS === 'web') return true;
    return ensureAlertPermission(true);
};
