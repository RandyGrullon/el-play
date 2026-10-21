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
/**
 * El llavero puede rechazar valores grandes (algunos iPhone, desde ~2048 B) y la sesión con Google ronda 1,7 KB:
 * se guarda en trozos de 600 caracteres (≤ 1800 B aunque todo fueran acentos). Los trozos 1.. van en «<clave>_1»…
 * y la cuenta en «<clave>_n»; sin «_n» es un solo trozo (así también se lee lo guardado antes de los trozos).
 */
const PIECE = 600;
/** Trozos con que quedó guardada cada clave cifrada, para borrar los que sobren */
const pieces = new Map<string, number>();

const splitPieces = (value: string) => {
    const parts: string[] = [];
    let part = '';
    // Por caracteres completos: un emoji del nombre no se parte en dos trozos
    for (const char of value) {
        if (part.length + char.length > PIECE) {
            parts.push(part);
            part = '';
        }
        part += char;
    }
    parts.push(part);
    return parts;
};

const readSecure = async (key: string) => {
    const base = secureKey(key);
    const first = await SecureStore.getItemAsync(base);
    if (first === null) return null;
    const count = Number(await SecureStore.getItemAsync(`${base}_n`)) || 1;
    pieces.set(key, count);
    let value = first;
    for (let n = 1; n < count; n++) {
        const piece = await SecureStore.getItemAsync(`${base}_${n}`);
        // Incompleta no sirve: mejor sin sesión que con una rota
        if (piece === null) return null;
        value += piece;
    }
    return value;
};

const writeSecure = async (key: string, value: string | null) => {
    const base = secureKey(key);
    const parts = value === null ? [] : splitPieces(value);
    const before = pieces.get(key) ?? 1;
    // Si falla a mitad, la próxima escritura también borra los trozos que alcanzó a dejar
    pieces.set(key, Math.max(before, parts.length));
    for (let n = 1; n < parts.length; n++) await SecureStore.setItemAsync(`${base}_${n}`, parts[n]);
    if (parts.length) await SecureStore.setItemAsync(base, parts[0]);
    else await SecureStore.deleteItemAsync(base);
    if (parts.length > 1) await SecureStore.setItemAsync(`${base}_n`, String(parts.length));
    else await SecureStore.deleteItemAsync(`${base}_n`);
    for (let n = Math.max(parts.length, 1); n < before; n++) await SecureStore.deleteItemAsync(`${base}_${n}`);
    pieces.set(key, Math.max(parts.length, 1));
};

// Una escritura cifrada a la vez (al renovar la sesión llegan dos seguidas y los trozos no se pueden mezclar)
let secureWrites = Promise.resolve();
const queueSecure = (key: string, value: string | null) => {
    secureWrites = secureWrites
        .then(() => writeSecure(key, value))
        .catch((error) => {
            // No en silencio: la sesión sigue en memoria, pero al cerrar la app habría que volver a entrar
            if (__DEV__) console.warn(`El Play: no se pudo guardar ${key} en el llavero`, error);
        });
};

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
            const value = await readSecure(key);
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
    if (isSecure(key)) queueSecure(key, value);
    else AsyncStorage.setItem(key, value).catch(() => undefined);
};

export const removeItem = (key: string) => {
    cache.delete(key);
    if (isSecure(key)) queueSecure(key, null);
    else AsyncStorage.removeItem(key).catch(() => undefined);
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
