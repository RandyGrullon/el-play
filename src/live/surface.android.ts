// Android: notificación fija con el marcador (CustomNotificationFactory de expo-widgets)
import { AndroidImportance, AndroidNotificationVisibility, getPermissionsAsync, requestPermissionsAsync, setNotificationChannelAsync } from 'expo-notifications';
import { addUserInteractionListener } from 'expo-widgets';
import i18n from '../i18n';
import { gameNotification } from './GameNotification';
import type { LiveGameProps, LiveSurface } from './types';

const CHANNEL = 'segundo-plano';
/** Si la app deja de actualizarla (Android la cerró), la notificación se va sola pasado este tiempo */
const TIMEOUT_MS = 30 * 60 * 1000;
/** Al terminar, el marcador final queda un rato */
const FINAL_MS = 20 * 60 * 1000;

const idOf = (gamePk: number) => `juego-${gamePk}`;
const gamePkOf = (id: string) => (/^juego-(\d+)$/.test(id) ? Number(id.slice(6)) : null);

// Canal propio de importancia baja: no suena ni vibra en cada jugada; visible en la pantalla bloqueada
const ensureChannel = async () => {
    const es = !i18n.language.startsWith('en');
    await setNotificationChannelAsync(CHANNEL, {
        name: es ? 'Juego en segundo plano' : 'Game in the background',
        importance: AndroidImportance.LOW,
        showBadge: false,
        enableVibrate: false,
        sound: null,
        lockscreenVisibility: AndroidNotificationVisibility.PUBLIC
    });
    const current = await getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await requestPermissionsAsync()).granted;
};

const texts = (props: LiveGameProps) => ({
    title: `${props.away.abbrev} ${props.away.runs} – ${props.home.runs} ${props.home.abbrev}`,
    text: [props.inning, props.outsText, props.lastText].filter(Boolean).join(' · ')
});

export const surface: LiveSurface = {
    start: async (props) => {
        try {
            if (!(await ensureChannel())) return { ok: false, reason: 'blocked' };
            const notification = await gameNotification.post(props, {
                id: idOf(props.gamePk),
                channelId: CHANNEL,
                ongoing: true,
                url: `elplay://juego/${props.gamePk}`,
                timeoutAfter: TIMEOUT_MS,
                ...texts(props)
            });
            return { ok: true, id: notification.id };
        } catch (error) {
            const message = String((error as Error)?.message ?? error);
            return { ok: false, reason: /disabled|permission|blocked/i.test(message) ? 'blocked' : 'error' };
        }
    },
    // Si el usuario la deslizó (Android 14+ deja quitar las fijas), update falla: se deja de seguir
    update: async (id, props) => {
        try {
            const notification = await gameNotification.get(id);
            if (!notification) return false;
            await notification.update(props, { timeoutAfter: TIMEOUT_MS, ...texts(props) });
            return true;
        } catch {
            return false;
        }
    },
    end: async (id, props) => {
        const notification = await gameNotification.get(id).catch(() => null);
        if (!notification) return;
        if (!props) {
            await notification.cancel().catch(() => undefined);
            return;
        }
        // Final: deja de ser fija, se quita al tocarla o sola en un rato
        await notification.update(props, { ongoing: false, timeoutAfter: FINAL_MS, ...texts(props) }).catch(() => undefined);
    },
    active: async () => {
        const list = await gameNotification.getActive().catch(() => []);
        return Promise.all(
            list.map(async (notification) => {
                const props = (await notification.getProps().catch(() => null)) as Partial<LiveGameProps> | null;
                return { id: notification.id, gamePk: gamePkOf(notification.id), stopped: props?.stopped === true, final: props?.live === false };
            })
        );
    },
    // El botón de la notificación ya la redibujó con { stopped: true }; si la app está viva, se quita ya
    onStop: (listener) => {
        const subscription = addUserInteractionListener((event) => {
            if (event.source === gameNotification.name && event.notificationId) listener(event.notificationId);
        });
        return () => subscription.remove();
    }
};
