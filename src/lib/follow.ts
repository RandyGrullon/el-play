// Seguir un juego en segundo plano: Live Activity en el iPhone (pantalla bloqueada e isla dinámica) y notificación
// fija en Android. Se actualiza con cada lectura nueva del juego mientras la app está abierta; al salir queda la última
// jugada (y se marca como desactualizada). Para que siga sola con la app cerrada hace falta push (docs/SEGUNDO-PLANO.md).
// expo-widgets no existe en la web ni en Expo Go: ahí no se hace nada y el botón no sale.
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import { requireOptionalNativeModule } from 'expo';
import type { GameDetail } from '../types';
import type { LiveSurface } from '../live/types';
import { liveGameKey, liveGameProps } from '../live/props';
import i18n from '../i18n';
import { api } from './api';
import { gameInterval } from './polling';
import { keys, queryClient } from './queries';
import { onHydrated, readJson, removeItem, writeJson } from './storage';

const load = (): LiveSurface | null => {
    if (Platform.OS === 'web' || !requireOptionalNativeModule('ExpoWidgets')) return null;
    try {
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
    if (!next) lastGame = null;
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

const push = async (game: GameDetail) => {
    const current = followed;
    if (!surface || !current || game.gamePk !== current.gamePk) return;
    const props = liveGameProps(game, i18n.language);
    // Terminó: queda el marcador final un rato y se deja de seguir
    if (game.state === 'final') {
        await surface.end(current.id, props);
        if (followed === current) save(null);
        return;
    }
    const key = liveGameKey(props);
    if (key === lastKey && Date.now() - lastPush < HEARTBEAT_MS) return;
    const alive = await surface.update(current.id, props);
    if (followed !== current) return;
    // El usuario la quitó (deslizó la actividad o la notificación) o el sistema la terminó (8 h en iOS)
    if (!alive) {
        save(null);
        return;
    }
    lastKey = key;
    lastPush = Date.now();
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

async function tick() {
    const current = followed;
    if (!current) return;
    const key = keys.game(current.gamePk);
    // Sin foco (app en segundo plano y aún viva en Android) useGame no sondea: entonces se pide aquí
    const watched = focusManager.isFocused() && (queryClient.getQueryCache().find({ queryKey: key })?.getObserversCount() ?? 0) > 0;
    if (!watched) {
        try {
            const game = await queryClient.fetchQuery({ queryKey: key, queryFn: ({ signal }) => api.game(current.gamePk, signal), staleTime: intervalOf() - 1000, retry: false });
            syncFollow(game, queryClient.getQueryState(key)?.dataUpdatedAt ?? Date.now());
        } catch {
            /* sin red: se intenta en la próxima vuelta */
        }
    }
    schedule();
}

const start = async (game: GameDetail): Promise<FollowResult> => {
    if (!surface || !game.gamePk) return 'error';
    // Un juego a la vez: el anterior se quita
    if (followed) {
        const previous = followed;
        save(null);
        await surface.end(previous.id, null);
    }
    const props = liveGameProps(game, i18n.language);
    const result = await surface.start(props);
    if (!result.ok) return result.reason;
    save({ gamePk: game.gamePk, id: result.id });
    lastKey = liveGameKey(props);
    lastPush = Date.now();
    lastRead = queryClient.getQueryState(keys.game(game.gamePk))?.dataUpdatedAt ?? 0;
    lastGame = game;
    return 'on';
};

const stop = async (): Promise<FollowResult> => {
    const current = followed;
    if (!surface || !current) return 'off';
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
    }
    save(keep);
    if (keep) tick().catch(() => undefined);
};

if (surface) {
    onHydrated(() => {
        run(restore).catch(() => undefined);
    });
    // Android: «Dejar de seguir» desde la notificación con la app viva
    surface.onStop((id) => {
        run(async () => {
            if (followed?.id === id) await stop();
            else await surface.end(id, null);
        }).catch(() => undefined);
    });
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

/**
 * En la pantalla del juego: cada lectura de useGame actualiza la actividad si es el juego que se sigue.
 * readAt (dataUpdatedAt) cuenta las lecturas aunque React Query devuelva el mismo objeto porque nada cambió.
 */
export const useFollowSync = (game: GameDetail | undefined, readAt: number) => {
    useEffect(() => {
        if (game) syncFollow(game, readAt);
    }, [game, readAt]);
};
