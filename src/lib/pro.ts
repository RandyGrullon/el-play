// Modo de la app: Lite (el de siempre, por defecto) o PRO (más estadísticas, mismo estilo).
// PRO se activa en «Más» y solo con la cuenta abierta; se recuerda por cuenta en este teléfono.
import { useSyncExternalStore } from 'react';
import { useSession } from './account';

export type UiMode = 'lite' | 'pro';

const KEY = 'el-play-ui-mode';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

// Lo elegido en esta sesión manda (si el teléfono no deja guardar, el PRO igual se activa mientras la app esté abierta)
const memory = new Map<string, UiMode>();

const read = (userId: string): UiMode => {
    const chosen = memory.get(userId);
    if (chosen) return chosen;
    try {
        return localStorage.getItem(`${KEY}:${userId}`) === 'pro' ? 'pro' : 'lite';
    } catch {
        return 'lite';
    }
};

export const setUiMode = (userId: string, mode: UiMode) => {
    memory.set(userId, mode);
    try {
        localStorage.setItem(`${KEY}:${userId}`, mode);
    } catch {
        /* sin almacenamiento: dura mientras la app esté abierta */
    }
    emit();
};

/** El modo elegido por la cuenta abierta; sin cuenta siempre es Lite */
export const useUiMode = (): UiMode => {
    const session = useSession();
    const userId = session?.user.id ?? null;
    return useSyncExternalStore(subscribe, () => (userId ? read(userId) : 'lite'), () => 'lite');
};

export const useIsPro = () => useUiMode() === 'pro';
