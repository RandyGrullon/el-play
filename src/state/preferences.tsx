import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
// Los enums con import propio: el plugin import/namespace de ESLint no los ve dentro de Notifications
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { readJson, writeJson } from '../lib/storage';
import { teamDisplayName } from '../lib/teams';
import { nationalTeamName } from '../lib/nationalTeams';
import { isNotPlayed } from '../lib/baseball';
import i18n from '../i18n';
import type { GameDetail, Schedule, ScheduleGame, TeamBase } from '../types';

/** all: todas; smart: todas en los juegos de tu equipo y solo las grandes en los demás; off: ninguna; cine (PRO): todas, más largas y con sus datos */
export type AnimationMode = 'all' | 'smart' | 'off' | 'cine';
const ANIMATION_MODES: AnimationMode[] = ['all', 'smart', 'off', 'cine'];
/** Lo guardado antes sigue valiendo; algo que no se reconoce vuelve a «Grandes» */
const readAnimationMode = (saved: unknown): AnimationMode => (ANIMATION_MODES.includes(saved as AnimationMode) ? (saved as AnimationMode) : 'smart');
export type AlertResult = 'on' | 'off' | 'blocked' | 'past';
type AlertGame = Pick<ScheduleGame, 'gamePk' | 'date' | 'away' | 'home'>;

interface Preferences {
    favoriteTeamId: number | null;
    toggleFavoriteTeam: (teamId: number) => void;
    subscribedGames: number[];
    /** En el teléfono los avisos se programan: llegan aunque la app esté cerrada */
    toggleGameSubscription: (game: AlertGame) => Promise<AlertResult>;
    animationMode: AnimationMode;
    setAnimationMode: (mode: AnimationMode) => void;
}

/** Avisos programados de un juego y la hora para la que se programaron */
interface GameAlert {
    ids: string[];
    date: string | null;
}
type Alerts = Record<string, GameAlert>;

const PreferencesContext = createContext<Preferences | null>(null);
const FAVORITE_KEY = 'el-play-favorite-team';
const ALERTS_KEY = 'el-play-alerts';
const ANIMATION_KEY = 'el-play-animation-mode';
const CHANNEL = 'juegos';
/** El primer aviso: el texto dice «empieza en 10 minutos» (igual que en la web) */
const BEFORE = 10 * 60 * 1000;

// En la web no hay avisos programados (y la librería avisa en la consola que no lo soporta)
if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
    });
}

const ensurePermission = async () => {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: i18n.t('notifications.channel', { defaultValue: 'Juegos' }), importance: AndroidImportance.HIGH });
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.ios?.status === IosAuthorizationStatus.PROVISIONAL) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted || asked.ios?.status === IosAuthorizationStatus.PROVISIONAL;
};

// Antes se guardaba solo la lista de avisos de cada juego (sin la hora)
const readAlerts = (): Alerts => {
    const saved = readJson<Record<string, string[] | GameAlert>>(ALERTS_KEY, {});
    return Object.fromEntries(Object.entries(saved).map(([key, alert]) => [key, Array.isArray(alert) ? { ids: alert, date: null } : alert]));
};

const cancelAlerts = (ids: string[]) => Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));

/** Las selecciones con el nombre en el idioma de la app («República Dominicana», no «Dominican Republic») */
const alertName = (team: TeamBase, lang: string) => {
    const name = teamDisplayName(team, lang);
    // Hermes no trae Intl.DisplayNames: ahí teamDisplayName deja el nombre de MLB, en inglés
    return (name === team.name && team.flag && nationalTeamName(team.abbrev, lang)) || name;
};

/** Programa el aviso de 10 minutos antes (si todavía da tiempo) y el de playball */
const scheduleAlerts = async (game: { gamePk: number; away: TeamBase; home: TeamBase }, start: number) => {
    const lang = i18n.language;
    const names = { away: alertName(game.away, lang), home: alertName(game.home, lang) };
    const data = { gamePk: game.gamePk };
    const trigger = (date: number) => ({ type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(date), channelId: CHANNEL }) as const;
    const ids: string[] = [];
    try {
        if (start - BEFORE > Date.now()) {
            ids.push(await Notifications.scheduleNotificationAsync({ content: { title: i18n.t('notifications.gameStarting'), body: i18n.t('notifications.gameStartingBody', names), data }, trigger: trigger(start - BEFORE) }));
        }
        ids.push(await Notifications.scheduleNotificationAsync({ content: { title: i18n.t('notifications.playball'), body: i18n.t('notifications.playballBody', names), data }, trigger: trigger(start) }));
    } catch (error) {
        // Sin avisos a medias que después nadie puede quitar
        await cancelAlerts(ids);
        throw error;
    }
    return ids;
};

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const client = useQueryClient();
    const [favoriteTeamId, setFavorite] = useState<number | null>(() => readJson<number | null>(FAVORITE_KEY, null));
    const [alerts, setAlerts] = useState<Alerts>(readAlerts);
    const [animationMode, setMode] = useState<AnimationMode>(() => readAnimationMode(readJson<unknown>(ANIMATION_KEY, 'smart')));
    // Copia al día para las tareas asíncronas (dos toques seguidos no deben leer un estado viejo)
    const alertsRef = useRef(alerts);
    // Última tarea en la fila de cada juego con un cambio de avisos en curso
    const queue = useRef(new Map<string, Promise<unknown>>());
    // Toque de la campana que todavía no termina, por juego
    const taps = useRef(new Map<string, { wantsOn: boolean; promise: Promise<AlertResult> }>());

    const toggleFavoriteTeam = useCallback((teamId: number) => {
        setFavorite((current) => {
            const next = current === teamId ? null : teamId;
            writeJson(FAVORITE_KEY, next);
            return next;
        });
    }, []);

    const saveAlerts = useCallback((next: Alerts) => {
        alertsRef.current = next;
        setAlerts(next);
        writeJson(ALERTS_KEY, next);
    }, []);

    /** Las tareas de un juego van en fila, una a la vez: cada una lee los avisos como los dejó la anterior */
    const enqueue = useCallback(<T,>(key: string, task: () => Promise<T>) => {
        const result = (queue.current.get(key) ?? Promise.resolve()).then(task);
        const done = result.catch(() => undefined);
        queue.current.set(key, done);
        done.then(() => {
            if (queue.current.get(key) === done) queue.current.delete(key);
        });
        return result;
    }, []);

    const removeAlerts = useCallback(
        async (key: string, current: GameAlert) => {
            await cancelAlerts(current.ids);
            const { [key]: _removed, ...rest } = alertsRef.current;
            saveAlerts(rest);
        },
        [saveAlerts]
    );

    const toggleGameSubscription = useCallback<Preferences['toggleGameSubscription']>(
        (game) => {
            const key = String(game.gamePk);
            // Lo que pide el toque sale de la campana que se ve al tocar; si hay una reprogramación en curso,
            // el toque espera en la fila y después se cumple (no se pierde)
            const wantsOn = !alertsRef.current[key];
            // Doble toque: el segundo recibe la respuesta del primero (no programa ni pide permiso dos veces)
            const pending = taps.current.get(key);
            if (pending?.wantsOn === wantsOn) return pending.promise;
            const promise = enqueue(key, async (): Promise<AlertResult> => {
                const current = alertsRef.current[key];
                if (!wantsOn) {
                    if (current) await removeAlerts(key, current);
                    return 'off';
                }
                if (current) return 'on';
                const start = new Date(game.date).getTime();
                if (!(start > Date.now())) return 'past';
                if (Platform.OS === 'web' || !(await ensurePermission())) return 'blocked';
                const ids = await scheduleAlerts(game, start);
                saveAlerts({ ...alertsRef.current, [key]: { ids, date: game.date } });
                return 'on';
            });
            taps.current.set(key, { wantsOn, promise });
            const clear = () => {
                if (taps.current.get(key)?.promise === promise) taps.current.delete(key);
            };
            promise.then(clear, clear);
            return promise;
        },
        [enqueue, removeAlerts, saveAlerts]
    );

    // Al abrir: se olvidan los juegos cuyos avisos ya sonaron (o el teléfono ya no tiene programados)
    useEffect(() => {
        if (Platform.OS === 'web') return;
        const before = alertsRef.current;
        Notifications.getAllScheduledNotificationsAsync()
            .then((scheduled) => {
                const pending = new Set(scheduled.map((request) => request.identifier));
                // Solo los que no cambiaron mientras tanto (un toque durante la consulta)
                const gone = Object.keys(before).filter((key) => alertsRef.current[key] === before[key] && !before[key].ids.some((id) => pending.has(id)));
                if (gone.length) saveAlerts(Object.fromEntries(Object.entries(alertsRef.current).filter(([key]) => !gone.includes(key))));
            })
            .catch(() => undefined);
    }, [saveAlerts]);

    // Lo que llega del juego (en el calendario o en el detalle): si cambió la hora se reprograma;
    // si se pospuso o se canceló, se quitan los avisos y la campana
    useEffect(() => {
        if (Platform.OS === 'web') return;
        return client.getQueryCache().subscribe((event) => {
            if (event.type !== 'updated' || event.action.type !== 'success') return;
            const kind = event.query.queryKey[0];
            const data = event.action.data as Schedule | GameDetail | undefined;
            const games = kind === 'schedule' ? ((data as Schedule | undefined)?.games ?? []) : kind === 'game' && data ? [data as GameDetail] : [];
            for (const game of games) {
                const key = String(game.gamePk);
                const alert = alertsRef.current[key];
                if (!alert || !game.date) continue;
                const start = new Date(game.date).getTime();
                const sameTime = (saved: GameAlert) => saved.date !== null && new Date(saved.date).getTime() === start;
                if (isNotPlayed(game.detailedState)) {
                    // Un juego reprogramado sale también en su fecha vieja como pospuesto: solo cuenta si es la hora
                    // de los avisos (o si no se sabe, en el formato viejo)
                    if (alert.date !== null && !sameTime(alert)) continue;
                    enqueue(key, async () => {
                        const current = alertsRef.current[key];
                        if (current && (current.date === null || sameTime(current))) await removeAlerts(key, current);
                    }).catch(() => undefined);
                    continue;
                }
                // Solo juegos por empezar
                if (game.state !== 'preview' || !(start > Date.now()) || sameTime(alert)) continue;
                const date = game.date;
                enqueue(key, async () => {
                    const current = alertsRef.current[key];
                    // Ya quitado, o ya reprogramado a esa hora por la tarea anterior de la fila
                    if (!current || sameTime(current)) return;
                    await cancelAlerts(current.ids);
                    // Si ya no se puede programar (avisos bloqueados después), se quita la campana
                    const ids = await scheduleAlerts({ gamePk: Number(key), away: game.away, home: game.home }, start).catch(() => null);
                    const { [key]: _removed, ...rest } = alertsRef.current;
                    saveAlerts(ids ? { ...rest, [key]: { ids, date } } : rest);
                }).catch(() => undefined);
            }
        });
    }, [client, enqueue, removeAlerts, saveAlerts]);

    const value = useMemo<Preferences>(
        () => ({
            favoriteTeamId,
            toggleFavoriteTeam,
            subscribedGames: Object.keys(alerts).map(Number),
            toggleGameSubscription,
            animationMode,
            setAnimationMode: (mode) => {
                setMode(mode);
                writeJson(ANIMATION_KEY, mode);
            }
        }),
        [favoriteTeamId, toggleFavoriteTeam, alerts, toggleGameSubscription, animationMode]
    );
    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
    const value = useContext(PreferencesContext);
    if (!value) throw new Error('usePreferences fuera de PreferencesProvider');
    return value;
};

/**
 * Tocar un aviso de juego abre ese juego: con la app abierta y cuando el aviso la abre desde cerrada.
 * Va en el layout raíz, dentro del navegador (como en la guía de expo-notifications con Expo Router).
 */
export const useAlertTaps = () => {
    useEffect(() => {
        if (Platform.OS === 'web') return;
        const open = (response: Notifications.NotificationResponse | null) => {
            if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
            const gamePk = String(response.notification.request.content.data?.gamePk ?? '');
            if (!/^\d+$/.test(gamePk)) return;
            // navigate y no push: si ya está en ese juego (banner con la app abierta) no lo apila otra vez
            router.navigate({ pathname: '/juego/[gamePk]', params: { gamePk } });
            // Para no volver a abrir el juego con el mismo toque
            Notifications.clearLastNotificationResponse();
        };
        open(Notifications.getLastNotificationResponse());
        const subscription = Notifications.addNotificationResponseReceivedListener(open);
        return () => subscription.remove();
    }, []);
};
