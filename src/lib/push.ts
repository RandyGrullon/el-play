// Avisos con la app cerrada (Web Push): el teléfono se suscribe con la llave del servidor y le dice qué juegos y
// qué equipo seguir. Si el servidor no tiene las llaves (todavía), no se hace nada y siguen los avisos con la app
// abierta (useGameAlerts).
import type { AlertKinds } from '../store/preferences';

export interface PushConfig {
    enabled: boolean;
    publicKey: string | null;
}

let config: Promise<PushConfig> | null = null;

/** Si el servidor puede avisar con la app cerrada (se pregunta una vez por sesión) */
export const pushConfig = () =>
    (config ??= fetch('/api/v2/push/config')
        .then((response) => (response.ok ? (response.json() as Promise<PushConfig>) : { enabled: false, publicKey: null }))
        .catch(() => ({ enabled: false, publicKey: null })));

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const keyBytes = (base64url: string) => {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

const registration = () =>
    Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))]);

export type PushStatus = 'on' | 'off' | 'unsupported' | 'blocked' | 'server-off';

export interface PushPrefs {
    games: number[];
    teams: number[];
    kinds: AlertKinds;
    lang: 'es' | 'en';
}

/**
 * Deja la suscripción al día con lo que sigue. Solo se suscribe si hay algo que avisar y ya dio permiso (el permiso
 * lo pide la campana o el botón de Más); si ya estaba suscrito, actualiza lo que sigue aunque quede vacío.
 */
export const syncPush = async (prefs: PushPrefs): Promise<PushStatus> => {
    if (!pushSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission !== 'granted') return 'off';
    const server = await pushConfig();
    if (!server.enabled || !server.publicKey) return 'server-off';
    const worker = await registration();
    if (!worker) return 'unsupported';
    let subscription = await worker.pushManager.getSubscription();
    const following = prefs.games.length > 0 || prefs.teams.length > 0;
    if (!subscription && !following) return 'off';
    if (!subscription) subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(server.publicKey) });
    const response = await fetch('/api/v2/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON(), ...prefs })
    });
    return response.ok ? 'on' : 'off';
};

/** Pide permiso (desde un toque del usuario) y suscribe */
export const enablePush = async (prefs: PushPrefs): Promise<PushStatus> => {
    if (!pushSupported()) return 'unsupported';
    const permission = Notification.permission === 'default' ? await Notification.requestPermission().catch(() => 'denied' as NotificationPermission) : Notification.permission;
    if (permission !== 'granted') return 'blocked';
    return syncPush(prefs);
};
