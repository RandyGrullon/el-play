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
                    if (alreadyNotified(key)) return;
                    try {
                        new Notification(title, { body, icon: '/pwa-192x192.png', tag: key });
                    } catch {
                        /* algunos móviles solo permiten notificar desde el service worker */
                    }
                    markNotified(key);
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
