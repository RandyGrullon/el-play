// Permiso de avisos del teléfono (expo-notifications), al día: se lee al abrir «Más», al volver a la app y con
// «Revisar permiso». En la web de la app no hay avisos programados: ahí es «unsupported».
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { IosAuthorizationStatus } from 'expo-notifications';
import i18n from '../../../i18n';

/** granted: permitidos; denied: bloqueados; default: todavía sin decidir; unsupported: sin avisos (la web) */
export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

let current: PermissionState = Platform.OS === 'web' ? 'unsupported' : 'default';
const listeners = new Set<() => void>();
const set = (next: PermissionState) => {
    if (next === current) return;
    current = next;
    listeners.forEach((listener) => listener());
};

const fromResponse = (response: Notifications.NotificationPermissionsStatus): PermissionState => {
    if (response.granted || response.ios?.status === IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return response.canAskAgain ? 'default' : 'denied';
};

/** Vuelve a preguntar al teléfono (devuelve lo que dice ahora) */
export const recheckPermission = async (): Promise<PermissionState> => {
    if (Platform.OS === 'web') return 'unsupported';
    try {
        set(fromResponse(await Notifications.getPermissionsAsync()));
    } catch {
        /* sin respuesta: se queda lo que había */
    }
    return current;
};

/** Pide el permiso (solo si todavía no se ha decidido) */
export const askPermission = async (): Promise<PermissionState> => {
    if (Platform.OS === 'web') return 'unsupported';
    if ((await recheckPermission()) !== 'default') return current;
    try {
        set(fromResponse(await Notifications.requestPermissionsAsync()));
    } catch {
        /* sin respuesta */
    }
    return current;
};

/** Manda ya un aviso de prueba (el mismo texto que el de 10 minutos antes) */
export const sendTestAlert = async (body: string) => {
    if (Platform.OS === 'web') return false;
    try {
        await Notifications.scheduleNotificationAsync({ content: { title: i18n.t('notifications.gameStarting'), body }, trigger: null });
        return true;
    } catch {
        return false;
    }
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const useNotificationPermission = () => {
    useEffect(() => {
        void recheckPermission();
        const subscription = AppState.addEventListener('change', (status) => {
            if (status === 'active') void recheckPermission();
        });
        return () => subscription?.remove();
    }, []);
    return useSyncExternalStore(subscribe, () => current, () => current);
};
