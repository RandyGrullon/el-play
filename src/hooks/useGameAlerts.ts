import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduleGame } from '../types';
import { usePreferences } from '../store/preferences';
import { inningName } from '../lib/baseball';
import { playAlertOf, type ScoreSnap } from '../lib/playAlerts';

/** Hora de inicio del juego en ms */
const startsInBase = (game: ScheduleGame) => new Date(game.date).getTime();

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

// Última lectura de carreras y hits de cada juego en vivo (para avisar lo que cambió entre una y otra)
const snaps = new Map<number, ScoreSnap>();

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
    const { t, i18n } = useTranslation();
    const { subscribedGames, favoriteTeamId, alertKinds } = usePreferences();

    useEffect(() => {
        const following = subscribedGames.length > 0 || favoriteTeamId !== null;
        if (!games?.length || !following || !('Notification' in window) || Notification.permission !== 'granted') return;

        const check = () => {
            const now = Date.now();
            for (const game of games) {
                // La campana avisa todo; el equipo favorito, desde el playball (como los avisos con la app cerrada)
                const bell = subscribedGames.includes(game.gamePk);
                const favorite = favoriteTeamId !== null && (game.away.id === favoriteTeamId || game.home.id === favoriteTeamId);
                if (!bell && !favorite) continue;
                const startsIn = new Date(game.date).getTime() - now;
                const names = { away: game.away.name, home: game.home.name };
                const notify = (kind: string, title: string, body: string) => notifyKey(`${kind}-${game.gamePk}`, title, body);
                const notifyKey = (id: string, title: string, body: string) => {
                    const key = `el-play-notified-${id}`;
                    if (alreadyNotified(key) || sending.has(key)) return;
                    sending.add(key);
                    showAlert(title, { body, icon: '/icons/icon-192-v2.png', tag: key, data: { url: `/juego/${game.gamePk}` } })
                        // Si no salió no se marca: se vuelve a intentar en la próxima revisión
                        .then((shown) => shown && markNotified(key))
                        .finally(() => sending.delete(key));
                };
                if (bell && alertKinds.soon && game.state === 'preview' && startsIn > 0 && startsIn <= 10 * 60 * 1000) {
                    notify('pre', t('notifications.gameStarting'), t('notifications.gameStartingBody', names));
                }
                // Playball solo en la 1.ª: si la app se abre con el juego en la 7.ª no se canta (ni se repite)
                if (alertKinds.start && game.state === 'live' && (game.live?.inning ?? 1) <= 1) {
                    notify('start', t('notifications.playball'), t('notifications.playballBody', names));
                }
                if (alertKinds.final && game.state === 'final' && now - startsInBase(game) < 6 * 3600000 && (game.away.isWinner || game.home.isWinner)) {
                    const winner = game.away.isWinner ? game.away : game.home;
                    notify('final', t('notifications.final', { away: game.away.abbrev, awayRuns: game.away.score ?? 0, home: game.home.abbrev, homeRuns: game.home.score ?? 0 }), t('notifications.finalBody', { team: winner.name }));
                }
                // Jugada a jugada: cambio de ventaja, carreras y hits (uno por lectura, el más importante)
                if (game.state === 'live') {
                    const snap: ScoreSnap = { away: game.away.score ?? 0, home: game.home.score ?? 0, awayHits: game.away.hits ?? 0, homeHits: game.home.hits ?? 0 };
                    const alert = playAlertOf(snaps.get(game.gamePk), snap, alertKinds);
                    snaps.set(game.gamePk, snap);
                    if (alert) {
                        const team = game[alert.side].name;
                        const score = `${game.away.abbrev} ${snap.away} - ${snap.home} ${game.home.abbrev}`;
                        const half = game.live ? inningName({ n: game.live.inning, isTop: game.live.isTop }, i18n.language) : '';
                        const title = alert.kind === 'lead' ? t(`notifications.lead_${alert.lead}`, { team, score }) : alert.kind === 'runs' ? t('notifications.runs', { team, score }) : t('notifications.hit', { team });
                        const body = alert.kind === 'hits' ? [score, half].filter(Boolean).join(' · ') : half;
                        notifyKey(`play-${game.gamePk}-${snap.away}-${snap.home}-${snap.awayHits}-${snap.homeHits}`, title, body);
                    }
                }
                if (alertKinds.noHitter && game.state === 'live' && (game.live?.inning ?? 0) >= 6) {
                    for (const [batting, pitching] of [
                        [game.away, game.home],
                        [game.home, game.away]
                    ] as const) {
                        if (batting.hits !== 0) continue;
                        const key = `${game.gamePk}-${batting.id}`;
                        notifyKey(`noHitter-${key}`, t('notifications.noHitter', { team: pitching.abbrev }), t('notifications.noHitterBody', { team: batting.name, count: game.live?.inning ?? 6 }));
                    }
                }
            }
        };

        check();
        const interval = setInterval(check, 60 * 1000);
        return () => clearInterval(interval);
    }, [games, subscribedGames, favoriteTeamId, alertKinds, t, i18n.language]);
};
