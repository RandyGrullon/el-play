// Avisos del teléfono que salen ya (resultado final, juego sin hit, lo que suma tu equipo del Fantasy) y la memoria de
// lo ya avisado: cada aviso sale una sola vez aunque lo vean dos partes de la app (los avisos de Más y el «Seguir en
// segundo plano» PRO) o se vuelva a abrir la app. Si no salió (sin permiso), no se marca y se intenta en la próxima
// lectura, como en la web.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
// Los enums con import propio: el plugin import/namespace de ESLint no los ve dentro de Notifications
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import i18n from '../i18n';
import { pruneNotified } from './gameAlerts';
import { onHydrated, readJson, writeJson } from './storage';

/** El canal de Android de los avisos de juegos (el mismo de los programados; app.json lo pone de canal por defecto) */
export const CHANNEL = 'juegos';
const NOTIFIED_KEY = 'el-play-notified';

let notified: Record<string, number> = {};
const sending = new Set<string>();
onHydrated(() => {
    notified = pruneNotified(readJson<unknown>(NOTIFIED_KEY, {}), Date.now());
});

/** Ya salió (o está saliendo) el aviso con esta clave */
export const wasNotified = (key: string) => key in notified || sending.has(key);

const markNotified = (key: string) => {
    notified = { ...pruneNotified(notified, Date.now()), [key]: Date.now() };
    writeJson(NOTIFIED_KEY, notified);
};

/** Crea (o renombra con el idioma de ahora) el canal de Android: sin canal, Android 13+ no pide el permiso */
export const ensureChannel = async () => {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: i18n.t('notifications.channel', { defaultValue: 'Juegos' }), importance: AndroidImportance.HIGH }).catch(() => undefined);
};

/** El permiso de avisos ya está dado (no lo pide) */
export const alertsAllowed = async () => {
    if (Platform.OS === 'web') return false;
    try {
        const permission = await Notifications.getPermissionsAsync();
        return permission.granted || permission.ios?.status === IosAuthorizationStatus.PROVISIONAL;
    } catch {
        return false;
    }
};

/** Aviso inmediato; data: lo que abre al tocarlo ({ gamePk } o { screen: 'fantasy' }, ver useAlertTaps). Devuelve si salió */
export const postNow = async (title: string, body: string, data: Record<string, string | number>) => {
    if (!(await alertsAllowed())) return false;
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null });
    return true;
};

/** Manda el aviso con esta clave si todavía no salió; post devuelve si salió */
export const notifyOnce = async (key: string, post: () => Promise<boolean>) => {
    if (wasNotified(key)) return false;
    sending.add(key);
    try {
        const shown = await post();
        if (shown) markNotified(key);
        return shown;
    } catch {
        return false;
    } finally {
        sending.delete(key);
    }
};
