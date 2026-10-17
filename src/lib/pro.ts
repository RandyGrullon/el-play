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

const read = (userId: string): UiMode => {
    try {
        return localStorage.getItem(`${KEY}:${userId}`) === 'pro' ? 'pro' : 'lite';
    } catch {
        return 'lite';
    }
};

export const setUiMode = (userId: string, mode: UiMode) => {
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
