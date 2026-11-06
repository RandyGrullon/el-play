import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
// Los enums con import propio: el plugin import/namespace de ESLint no los ve dentro de Notifications
import { IosAuthorizationStatus } from 'expo-notifications';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { onHydrated, readJson, writeJson } from '../lib/storage';
import { BEFORE_MS, bellExpired, planTeamAlerts, readAlertKinds, sameKinds, scheduledKinds, type AlertKinds, type ScheduledKind, type TeamAlert } from '../lib/gameAlerts';
import { CHANNEL, alertsAllowed, ensureChannel } from '../lib/notify';
import { findScheduledGame, keys } from '../lib/queries';
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
    /** «Texto grande» de Más → Apariencia: toda la letra un 12 % más grande */
    largeText: boolean;
    setLargeText: (on: boolean) => void;
    /** Qué avisos quiere (Más → Avisos; todos encendidos al principio, como la web) */
    alertKinds: AlertKinds;
    setAlertKind: (kind: keyof AlertKinds, on: boolean) => void;
    /** Vuelve a mirar los avisos programados (p. ej. al dar el permiso desde Más) */
    syncAlerts: () => void;
}
export type { AlertKinds };

/** Lo que hace falta de un equipo para el texto del aviso */
interface AlertTeam {
    name: string;
    abbrev: string;
    flag?: string | null;
}

/** Avisos programados de un juego con campana y la hora para la que se programaron */
interface GameAlert {
    ids: string[];
    date: string | null;
    /** Qué avisos se programaron (los guardados antes no lo traen) */
    kinds?: ScheduledKind[];
    /** Los dos equipos: para reprogramar al cambiar los avisos en Más sin volver a pedir el juego */
    teams?: { away: AlertTeam; home: AlertTeam };
}
type Alerts = Record<string, GameAlert>;
/** Playball programado de los juegos de tu equipo favorito que no tienen campana */
type TeamAlerts = Record<string, TeamAlert>;

const PreferencesContext = createContext<Preferences | null>(null);
const FAVORITE_KEY = 'el-play-favorite-team';
const ALERTS_KEY = 'el-play-alerts';
const TEAM_ALERTS_KEY = 'el-play-team-alerts';
// La misma clave que la web
const ALERT_KINDS_KEY = 'el-play-alert-kinds';
const ANIMATION_KEY = 'el-play-animation-mode';
const LARGE_TEXT_KEY = 'el-play-large-text';

// ---------------------------------------------------------------- texto grande

/** Cuánto crece la letra con «Texto grande» (igual que la web) */
export const LARGE_TEXT_SCALE = 1.12;
// Fuera del contexto: Txt la lee en todas partes, también en lo que se pinta antes o fuera de PreferencesProvider
let largeText = false;
const textListeners = new Set<() => void>();
const setLargeTextValue = (on: boolean) => {
    if (largeText === on) return;
    largeText = on;
    textListeners.forEach((listener) => listener());
};
const subscribeText = (listener: () => void) => {
    textListeners.add(listener);
    return () => {
        textListeners.delete(listener);
    };
};
// Lo guardado se lee cuando termina de cargar el teléfono (antes de pintar la app)
onHydrated(() => setLargeTextValue(readJson<unknown>(LARGE_TEXT_KEY, false) === true));

const useLargeText = () => useSyncExternalStore(subscribeText, () => largeText, () => false);

/** 1 o 1,12: las piezas de texto de ui.tsx multiplican por esto el tamaño de la letra y el alto de línea */
export const useTextScale = () => (useLargeText() ? LARGE_TEXT_SCALE : 1);

// En la web no hay avisos programados (y la librería avisa en la consola que no lo soporta)
if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
    });
}

/** Pide el permiso de avisos si falta (desde un toque: la campana o «Activar avisos» de Más) */
export const ensurePermission = async () => {
    await ensureChannel();
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
export const alertName = (team: AlertTeam, lang: string) => {
    const name = teamDisplayName(team, lang);
    // Hermes no trae Intl.DisplayNames: ahí teamDisplayName deja el nombre en inglés
    return (name === team.name && team.flag && nationalTeamName(team.abbrev, lang)) || name;
};

const alertTeam = (team: Pick<TeamBase, 'name' | 'abbrev' | 'flag'>): AlertTeam => ({ name: team.name, abbrev: team.abbrev ?? '', flag: team.flag ?? null });
const teamsOf = (game: { away: Pick<TeamBase, 'name' | 'abbrev' | 'flag'>; home: Pick<TeamBase, 'name' | 'abbrev' | 'flag'> }) => ({ away: alertTeam(game.away), home: alertTeam(game.home) });

/** Los equipos de un juego que ya está en la caché (calendario o detalle), para los guardados sin ellos */
const cachedTeams = (client: QueryClient, key: string) => {
    const game = findScheduledGame(client, key) ?? client.getQueryData<GameDetail>(keys.game(key));
    return game ? teamsOf(game) : null;
};

/** Programa los avisos pedidos: el de 10 minutos antes (si todavía da tiempo) y el de playball */
const scheduleAlerts = async (game: { gamePk: number; away: AlertTeam; home: AlertTeam }, start: number, kinds: ScheduledKind[]) => {
    const lang = i18n.language;
    const names = { away: alertName(game.away, lang), home: alertName(game.home, lang) };
    const data = { gamePk: game.gamePk };
    const trigger = (date: number) => ({ type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(date), channelId: CHANNEL }) as const;
    const ids: string[] = [];
    const scheduled: ScheduledKind[] = [];
    if (!kinds.length) return { ids, kinds: scheduled };
    await ensureChannel();
    try {
        if (kinds.includes('soon') && start - BEFORE_MS > Date.now()) {
            ids.push(await Notifications.scheduleNotificationAsync({ content: { title: i18n.t('notifications.gameStarting'), body: i18n.t('notifications.gameStartingBody', names), data }, trigger: trigger(start - BEFORE_MS) }));
            scheduled.push('soon');
        }
        if (kinds.includes('start')) {
            ids.push(await Notifications.scheduleNotificationAsync({ content: { title: i18n.t('notifications.playball'), body: i18n.t('notifications.playballBody', names), data }, trigger: trigger(start) }));
            scheduled.push('start');
        }
    } catch (error) {
        // Sin avisos a medias que después nadie puede quitar
        await cancelAlerts(ids);
        throw error;
    }
    return { ids, kinds: scheduled };
};

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const client = useQueryClient();
    const [favoriteTeamId, setFavorite] = useState<number | null>(() => readJson<number | null>(FAVORITE_KEY, null));
    const [alerts, setAlerts] = useState<Alerts>(readAlerts);
    const [alertKinds, setKinds] = useState<AlertKinds>(() => readAlertKinds(readJson<unknown>(ALERT_KINDS_KEY, {})));
    const [animationMode, setMode] = useState<AnimationMode>(() => readAnimationMode(readJson<unknown>(ANIMATION_KEY, 'smart')));
    const [savedTeam] = useState<TeamAlerts>(() => readJson<TeamAlerts>(TEAM_ALERTS_KEY, {}));
    const largeTextOn = useLargeText();
    // Copias al día para las tareas asíncronas (dos toques seguidos no deben leer un estado viejo)
    const alertsRef = useRef(alerts);
    const teamRef = useRef(savedTeam);
    const favoriteRef = useRef(favoriteTeamId);
    const kindsRef = useRef(alertKinds);
    // Última tarea en la fila de cada juego con un cambio de avisos en curso
    const queue = useRef(new Map<string, Promise<unknown>>());
    // Toque de la campana que todavía no termina, por juego
    const taps = useRef(new Map<string, { wantsOn: boolean; promise: Promise<AlertResult> }>());
    // Juegos con una revisión del playball de tu equipo esperando en la fila (no se encola otra igual)
    const teamWaiting = useRef(new Set<string>());
    // Calendarios ya revisados (React Query da el mismo objeto si nada cambió)
    const seenSchedules = useRef(new WeakSet<object>());

    const saveAlerts = useCallback((next: Alerts) => {
        alertsRef.current = next;
        setAlerts(next);
        writeJson(ALERTS_KEY, next);
    }, []);

    const saveTeam = useCallback((next: TeamAlerts) => {
        teamRef.current = next;
        writeJson(TEAM_ALERTS_KEY, next);
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

    /** El plan de los playball de tu equipo con lo que hay ahora en la caché (los calendarios de todas las ligas) */
    const teamPlan = useCallback(
        () =>
            planTeamAlerts({
                games: client.getQueriesData<Schedule>({ queryKey: ['schedule'] }).flatMap(([, schedule]) => schedule?.games ?? []),
                current: teamRef.current,
                bell: Object.keys(alertsRef.current).map(Number),
                favoriteTeamId: favoriteRef.current,
                kinds: kindsRef.current,
                now: Date.now()
            }),
        [client]
    );

    /**
     * El playball de los juegos de tu equipo favorito sin campana (como la web). Cada juego se revisa en su fila con el
     * plan del momento; no pide el permiso: si no está dado, no se programa (lo piden la campana y Más).
     */
    const syncTeam = useCallback(() => {
        if (Platform.OS === 'web') return;
        const plan = teamPlan();
        const touched = new Set([...plan.cancel, ...plan.schedule.map((game) => String(game.gamePk))]);
        for (const key of touched) {
            if (teamWaiting.current.has(key)) continue;
            teamWaiting.current.add(key);
            enqueue(key, async () => {
                teamWaiting.current.delete(key);
                const fresh = teamPlan();
                const current = teamRef.current[key];
                if (current && fresh.cancel.includes(key)) {
                    await cancelAlerts(current.ids);
                    const { [key]: _removed, ...rest } = teamRef.current;
                    saveTeam(rest);
                }
                const game = fresh.schedule.find((item) => String(item.gamePk) === key);
                const teamId = favoriteRef.current;
                if (!game || teamId === null || !(await alertsAllowed())) return;
                const scheduled = await scheduleAlerts({ gamePk: game.gamePk, ...teamsOf(game) }, Date.parse(game.date), ['start']);
                if (scheduled.ids.length) saveTeam({ ...teamRef.current, [key]: { ids: scheduled.ids, date: game.date, teamId } });
            }).catch(() => {
                teamWaiting.current.delete(key);
            });
        }
    }, [enqueue, saveTeam, teamPlan]);

    /** Al cambiar «10 minutos antes» o «Playball» en Más: los juegos con campana por empezar se reprograman */
    const rescheduleBells = useCallback(() => {
        if (Platform.OS === 'web') return;
        for (const [key, alert] of Object.entries(alertsRef.current)) {
            const start = alert.date ? Date.parse(alert.date) : NaN;
            if (!(start > Date.now()) || sameKinds(alert.kinds, scheduledKinds({ bell: true, favorite: false, kinds: kindsRef.current, start, now: Date.now() }))) continue;
            enqueue(key, async () => {
                const current = alertsRef.current[key];
                // Quitado o reprogramado a otra hora mientras esperaba
                if (!current || current.date !== alert.date || !(start > Date.now())) return;
                const wanted = scheduledKinds({ bell: true, favorite: false, kinds: kindsRef.current, start, now: Date.now() });
                if (sameKinds(current.kinds, wanted)) return;
                // Sin los equipos (guardado antes) ni el juego en la caché: se quedan los avisos que tenía
                const teams = current.teams ?? cachedTeams(client, key);
                if (!teams) return;
                await cancelAlerts(current.ids);
                const scheduled = await scheduleAlerts({ gamePk: Number(key), ...teams }, start, wanted).catch(() => ({ ids: [] as string[], kinds: [] as ScheduledKind[] }));
                // La campana sigue aunque no quede nada programado: avisa el final y el juego sin hit
                if (alertsRef.current[key]) saveAlerts({ ...alertsRef.current, [key]: { ...current, ids: scheduled.ids, kinds: scheduled.kinds, teams } });
            }).catch(() => undefined);
        }
    }, [client, enqueue, saveAlerts]);

    const toggleFavoriteTeam = useCallback(
        (teamId: number) => {
            const next = favoriteRef.current === teamId ? null : teamId;
            favoriteRef.current = next;
            setFavorite(next);
            writeJson(FAVORITE_KEY, next);
            syncTeam();
        },
        [syncTeam]
    );

    const setAlertKind = useCallback(
        (kind: keyof AlertKinds, on: boolean) => {
            const next = { ...kindsRef.current, [kind]: on };
            kindsRef.current = next;
            setKinds(next);
            writeJson(ALERT_KINDS_KEY, next);
            if (kind === 'soon' || kind === 'start') {
                rescheduleBells();
                syncTeam();
            }
        },
        [rescheduleBells, syncTeam]
    );

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
                const teams = teamsOf(game);
                const scheduled = await scheduleAlerts({ gamePk: game.gamePk, ...teams }, start, scheduledKinds({ bell: true, favorite: false, kinds: kindsRef.current, start, now: Date.now() }));
                // Si era de tu equipo, su playball ya lo da la campana
                const team = teamRef.current[key];
                if (team) {
                    await cancelAlerts(team.ids);
                    const { [key]: _removed, ...rest } = teamRef.current;
                    saveTeam(rest);
                }
                saveAlerts({ ...alertsRef.current, [key]: { ids: scheduled.ids, kinds: scheduled.kinds, date: game.date, teams } });
                return 'on';
            });
            taps.current.set(key, { wantsOn, promise });
            const clear = () => {
                if (taps.current.get(key)?.promise === promise) taps.current.delete(key);
                // Sin la campana, el juego de tu equipo vuelve a tener su playball
                syncTeam();
            };
            promise.then(clear, clear);
            return promise;
        },
        [enqueue, removeAlerts, saveAlerts, saveTeam, syncTeam]
    );

    // Al abrir: se olvidan las campanas que ya no hacen falta (12 h después del juego, o avisos que el teléfono ya no
    // tiene) y los playball de tu equipo que ya sonaron; después se revisan los de tu equipo. También al volver a la app
    // (p. ej. de dar el permiso en los ajustes del teléfono).
    useEffect(() => {
        if (Platform.OS === 'web') return;
        const before = alertsRef.current;
        const beforeTeam = teamRef.current;
        Notifications.getAllScheduledNotificationsAsync()
            .then((scheduled) => {
                const pending = new Set(scheduled.map((request) => request.identifier));
                const now = Date.now();
                // Solo los que no cambiaron mientras tanto (un toque durante la consulta)
                const gone = Object.keys(before).filter((key) => alertsRef.current[key] === before[key] && bellExpired(before[key], pending, now));
                if (gone.length) saveAlerts(Object.fromEntries(Object.entries(alertsRef.current).filter(([key]) => !gone.includes(key))));
                const teamGone = Object.keys(beforeTeam).filter((key) => teamRef.current[key] === beforeTeam[key] && bellExpired(beforeTeam[key], pending, now));
                if (teamGone.length) saveTeam(Object.fromEntries(Object.entries(teamRef.current).filter(([key]) => !teamGone.includes(key))));
            })
            .catch(() => undefined)
            .finally(syncTeam);
        const subscription = AppState.addEventListener('change', (status) => {
            if (status === 'active') syncTeam();
        });
        return () => subscription.remove();
    }, [saveAlerts, saveTeam, syncTeam]);

    // Lo que llega del juego (en el calendario o en el detalle): si cambió la hora se reprograma; si se pospuso o se
    // canceló, se quitan los avisos y la campana. Con cada calendario nuevo se revisa el playball de tu equipo.
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
                    const teams = teamsOf(game);
                    const wanted = scheduledKinds({ bell: true, favorite: false, kinds: kindsRef.current, start, now: Date.now() });
                    const scheduled = await scheduleAlerts({ gamePk: Number(key), ...teams }, start, wanted).catch(() => null);
                    const { [key]: _removed, ...rest } = alertsRef.current;
                    saveAlerts(scheduled ? { ...rest, [key]: { ids: scheduled.ids, kinds: scheduled.kinds, date, teams } } : rest);
                }).catch(() => undefined);
            }
            if (kind === 'schedule' && data && !seenSchedules.current.has(data)) {
                seenSchedules.current.add(data);
                syncTeam();
            }
        });
    }, [client, enqueue, removeAlerts, saveAlerts, syncTeam]);

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
            },
            largeText: largeTextOn,
            setLargeText: (on) => {
                setLargeTextValue(on);
                writeJson(LARGE_TEXT_KEY, on);
            },
            alertKinds,
            setAlertKind,
            syncAlerts: syncTeam
        }),
        [favoriteTeamId, toggleFavoriteTeam, alerts, toggleGameSubscription, animationMode, largeTextOn, alertKinds, setAlertKind, syncTeam]
    );
    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
    const value = useContext(PreferencesContext);
    if (!value) throw new Error('usePreferences fuera de PreferencesProvider');
    return value;
};

/**
 * Tocar un aviso de juego abre ese juego (el del Fantasy, el Fantasy): con la app abierta y cuando el aviso la abre
 * desde cerrada. Va en el layout raíz, dentro del navegador (como en la guía de expo-notifications con Expo Router).
 */
export const useAlertTaps = () => {
    useEffect(() => {
        if (Platform.OS === 'web') return;
        const open = (response: Notifications.NotificationResponse | null) => {
            if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
            if (response.notification.request.content.data?.screen === 'fantasy') {
                router.navigate('/fantasy');
                Notifications.clearLastNotificationResponse();
                return;
            }
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
