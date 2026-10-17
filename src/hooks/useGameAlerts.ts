import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduleGame } from '../types';
import { usePreferences } from '../store/preferences';

const notifiedKey = (kind: string, gamePk: number) => `el-play-notified-${kind}-${gamePk}`;

const alreadyNotified = (key: string) => {
    try {
        return sessionStorage.getItem(key) === '1';
    } catch {
        return false;
    }
};

const markNotified = (key: string) => {
    try {
        sessionStorage.setItem(key, '1');
    } catch {
        /* sin almacenamiento */
    }
};

// Avisos que se están mandando (para no repetirlos mientras el service worker responde)
const sending = new Set<string>();

/** El service worker de la app (vite-plugin-pwa), si hay uno; no se queda esperando si nunca se activa */
const workerRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return null;
    if (registration.active) return registration;
    return Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))]);
};

/**
 * Chrome de Android no deja usar `new Notification` («Illegal constructor»): ahí solo se puede avisar desde el
 * service worker. `new Notification` queda de respaldo (escritorio sin service worker, p. ej. en desarrollo).
 * Devuelve si el aviso salió.
 */
export const showAlert = async (title: string, options: NotificationOptions): Promise<boolean> => {
    try {
        const registration = await workerRegistration();
        if (registration) {
            await registration.showNotification(title, options);
            return true;
        }
    } catch {
        /* se prueba con el aviso de escritorio */
    }
    try {
        new Notification(title, options);
        return true;
    } catch {
        return false;
    }
};

// Avisos locales para los juegos con campana: 10 min antes y al cantar playball
export const useGameAlerts = (games: ScheduleGame[] | undefined) => {
    const { t } = useTranslation();
    const { subscribedGames } = usePreferences();

    useEffect(() => {
        if (!games?.length || !subscribedGames.length || !('Notification' in window) || Notification.permission !== 'granted') return;

        const check = () => {
            const now = Date.now();
            for (const game of games) {
                if (!subscribedGames.includes(game.gamePk)) continue;
                const startsIn = new Date(game.date).getTime() - now;
                const names = { away: game.away.name, home: game.home.name };
                const notify = (kind: string, title: string, body: string) => {
                    const key = notifiedKey(kind, game.gamePk);
                    if (alreadyNotified(key) || sending.has(key)) return;
                    sending.add(key);
                    showAlert(title, { body, icon: '/icons/icon-192-v2.png', tag: key, data: { url: `/juego/${game.gamePk}` } })
                        // Si no salió no se marca: se vuelve a intentar en la próxima revisión
                        .then((shown) => shown && markNotified(key))
                        .finally(() => sending.delete(key));
                };
                if (game.state === 'preview' && startsIn > 0 && startsIn <= 10 * 60 * 1000) {
                    notify('pre', t('notifications.gameStarting'), t('notifications.gameStartingBody', names));
                }
                if (game.state === 'live') {
                    notify('start', t('notifications.playball'), t('notifications.playballBody', names));
                }
            }
        };

        check();
        const interval = setInterval(check, 60 * 1000);
        return () => clearInterval(interval);
    }, [games, subscribedGames, t]);
};
