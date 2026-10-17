import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
// Los enums con import propio: el plugin import/namespace de ESLint no los ve dentro de Notifications
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { readJson, writeJson } from '../lib/storage';
import i18n from '../i18n';
import type { ScheduleGame } from '../types';

/** all: todas; smart: todas en los juegos de tu equipo y solo las grandes en los demás; off: ninguna */
export type AnimationMode = 'all' | 'smart' | 'off';
export type AlertResult = 'on' | 'off' | 'blocked' | 'past';

interface Preferences {
    favoriteTeamId: number | null;
    toggleFavoriteTeam: (teamId: number) => void;
    subscribedGames: number[];
    /** En el teléfono los avisos se programan: llegan aunque la app esté cerrada */
    toggleGameSubscription: (game: Pick<ScheduleGame, 'gamePk' | 'date' | 'away' | 'home'>) => Promise<AlertResult>;
    animationMode: AnimationMode;
    setAnimationMode: (mode: AnimationMode) => void;
}

const PreferencesContext = createContext<Preferences | null>(null);
const FAVORITE_KEY = 'el-play-favorite-team';
const ALERTS_KEY = 'el-play-alerts';
const ANIMATION_KEY = 'el-play-animation-mode';
const CHANNEL = 'juegos';

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

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [favoriteTeamId, setFavorite] = useState<number | null>(() => readJson<number | null>(FAVORITE_KEY, null));
    const [alerts, setAlerts] = useState<Record<string, string[]>>(() => readJson<Record<string, string[]>>(ALERTS_KEY, {}));
    const [animationMode, setMode] = useState<AnimationMode>(() => readJson<AnimationMode>(ANIMATION_KEY, 'smart'));

    const toggleFavoriteTeam = useCallback((teamId: number) => {
        setFavorite((current) => {
            const next = current === teamId ? null : teamId;
            writeJson(FAVORITE_KEY, next);
            return next;
        });
    }, []);

    const saveAlerts = (next: Record<string, string[]>) => {
        setAlerts(next);
        writeJson(ALERTS_KEY, next);
    };

    const toggleGameSubscription = useCallback<Preferences['toggleGameSubscription']>(
        async (game) => {
            const key = String(game.gamePk);
            if (alerts[key]) {
                await Promise.all(alerts[key].map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
                const { [key]: _removed, ...rest } = alerts;
                saveAlerts(rest);
                return 'off';
            }
            const start = new Date(game.date).getTime();
            if (start <= Date.now()) return 'past';
            if (Platform.OS === 'web' || !(await ensurePermission())) return 'blocked';
            const names = { away: game.away.name, home: game.home.name };
            const ids: string[] = [];
            const before = start - 15 * 60 * 1000;
            const trigger = (date: number) => ({ type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(date), channelId: CHANNEL }) as const;
            if (before > Date.now()) {
                ids.push(await Notifications.scheduleNotificationAsync({ content: { title: i18n.t('notifications.gameStarting'), body: i18n.t('notifications.gameStartingBody', names), data: { gamePk: game.gamePk } }, trigger: trigger(before) }));
            }
            ids.push(await Notifications.scheduleNotificationAsync({ content: { title: i18n.t('notifications.playball'), body: i18n.t('notifications.playballBody', names), data: { gamePk: game.gamePk } }, trigger: trigger(start) }));
            saveAlerts({ ...alerts, [key]: ids });
            return 'on';
        },
        [alerts]
    );

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
