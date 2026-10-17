// Almacenamiento del teléfono con lectura sincrónica: al abrir la app se cargan en memoria todas las claves de
// El Play (AsyncStorage) y la sesión (SecureStore); después se lee de memoria y se escribe en segundo plano.
// Así la lógica que en la web usa localStorage funciona igual aquí.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PREFIX = 'el-play';
/** Claves que van cifradas en el llavero del teléfono (no en AsyncStorage) */
const SECURE = new Set(['el-play-session']);
const secureKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');
const isSecure = (key: string) => SECURE.has(key) && Platform.OS !== 'web';

const cache = new Map<string, string>();
let ready = false;
const hydrated: (() => void)[] = [];

/** Para los módulos que guardan algo en memoria: se avisa cuando ya se cargó el teléfono */
export const onHydrated = (callback: () => void) => {
    if (ready) callback();
    else hydrated.push(callback);
};

export const hydrateStorage = async () => {
    if (ready) return;
    try {
        const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
        const pairs = await AsyncStorage.multiGet(keys);
        for (const [key, value] of pairs) if (value !== null) cache.set(key, value);
    } catch {
        /* sin almacenamiento: la app arranca vacía */
    }
    for (const key of SECURE) {
        if (Platform.OS === 'web') continue;
        try {
            const value = await SecureStore.getItemAsync(secureKey(key));
            if (value !== null) cache.set(key, value);
        } catch {
            /* llavero no disponible */
        }
    }
    ready = true;
    hydrated.splice(0).forEach((callback) => callback());
};

export const getItem = (key: string): string | null => cache.get(key) ?? null;

export const setItem = (key: string, value: string) => {
    cache.set(key, value);
    const write = isSecure(key) ? SecureStore.setItemAsync(secureKey(key), value) : AsyncStorage.setItem(key, value);
    write.catch(() => undefined);
};

export const removeItem = (key: string) => {
    cache.delete(key);
    const remove = isSecure(key) ? SecureStore.deleteItemAsync(secureKey(key)) : AsyncStorage.removeItem(key);
    remove.catch(() => undefined);
};

export const readJson = <T>(key: string, fallback: T): T => {
    const raw = getItem(key);
    if (raw === null) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
};

export const writeJson = (key: string, value: unknown) => setItem(key, JSON.stringify(value));
