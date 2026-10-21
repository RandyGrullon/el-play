// Modo de la app: Lite (el de siempre, por defecto) o PRO (más estadísticas, mismo estilo).
// PRO se activa en «Más» y solo con la cuenta abierta; se recuerda por cuenta en este teléfono y, si la base ya tiene
// la columna profiles.ui_mode (supabase/2026-10-17-pro-modo.sql de la web), también en la cuenta: así lo sigue la web
// u otro teléfono. Sin esa columna (o sin red) todo funciona igual que antes, solo en este teléfono.
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { AccountError, accountEnabled, rest, useSession, type Session } from './account';
import { getItem, setItem } from './storage';

export type UiMode = 'lite' | 'pro';

const KEY = 'el-play-ui-mode';
// Cuándo se eligió el modo aquí (ms): gana lo último que se eligió, aquí o en otro dispositivo
const AT_KEY = 'el-play-ui-mode-at';
// La base no tiene la columna: no se vuelve a preguntar en un día
const OFF_KEY = 'el-play-ui-mode-sync-off';
const OFF_MS = 24 * 60 * 60 * 1000;
// Al volver a la app se revisa la cuenta, como mucho cada 5 minutos
const PULL_EVERY_MS = 5 * 60 * 1000;
// La sesión guardada (la misma clave de account.ts): para saber el modo fuera de React
const SESSION_KEY = 'el-play-session';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const read = (userId: string): UiMode => {
    try {
        return getItem(`${KEY}:${userId}`) === 'pro' ? 'pro' : 'lite';
    } catch {
        return 'lite';
    }
};

const readAt = (userId: string) => {
    try {
        return Number(getItem(`${AT_KEY}:${userId}`)) || 0;
    } catch {
        return 0;
    }
};

const store = (userId: string, mode: UiMode, at: number) => {
    try {
        setItem(`${KEY}:${userId}`, mode);
        setItem(`${AT_KEY}:${userId}`, String(at));
    } catch {
        /* sin almacenamiento: dura mientras la app esté abierta */
    }
};

// Cuándo se pasó a PRO en esta sesión de la app (el Centro PRO hace el barrido una vez)
let activatedAt = 0;

/** Se acaba de activar PRO aquí (en los últimos `windowMs`) */
export const justActivatedPro = (windowMs = 2500) => Date.now() - activatedAt < windowMs;

export const setUiMode = (userId: string, mode: UiMode) => {
    if (mode === 'pro' && read(userId) !== 'pro') activatedAt = Date.now();
    const at = Date.now();
    store(userId, mode, at);
    emit();
    void pushUiMode(userId, mode, at);
};

/** El modo elegido por la cuenta abierta; sin cuenta siempre es Lite */
export const useUiMode = (): UiMode => {
    const session = useSession();
    const userId = session?.user.id ?? null;
    return useSyncExternalStore(subscribe, () => (userId ? read(userId) : 'lite'), () => 'lite');
};

export const useIsPro = () => useUiMode() === 'pro';

/**
 * PRO ahora mismo, fuera de React (lógica pura que no recibe el modo, como las jugadas animadas de playEvents.ts).
 * Lee la misma sesión guardada que useSession; en los componentes usa useIsPro.
 */
export const proActive = () => {
    try {
        const session = JSON.parse(getItem(SESSION_KEY) || 'null') as Pick<Session, 'user'> | null;
        return session?.user?.id ? read(session.user.id) === 'pro' : false;
    } catch {
        return false;
    }
};

// ---------------------------------------------------------------- el modo en la cuenta (web y teléfono)

/** account: se guarda en la cuenta; device: solo en este teléfono (sin la columna, sin red o sin cuentas) */
export type UiModeSync = 'unknown' | 'account' | 'device';
let syncState: UiModeSync = 'unknown';
const setSync = (next: UiModeSync) => {
    if (syncState === next) return;
    syncState = next;
    emit();
};

export const useUiModeSyncState = () => useSyncExternalStore(subscribe, () => syncState, () => 'unknown' as UiModeSync);

const syncOff = () => {
    try {
        return Date.now() - Number(getItem(OFF_KEY) || 0) < OFF_MS;
    } catch {
        return false;
    }
};

const markSyncOff = () => {
    try {
        setItem(OFF_KEY, String(Date.now()));
    } catch {
        /* sin almacenamiento */
    }
};

// 400 de PostgREST = la columna no existe todavía (falta correr el SQL)
const failed = (error: unknown) => {
    if (error instanceof AccountError && error.message === '400') markSyncOff();
    setSync('device');
};

// Solo con la sesión vigente: no se renueva la sesión solo para esto (la próxima revisión sube lo que falte)
let tokenFresh = false;
const freshSession = (session: Pick<Session, 'expiresAt'> | null) => !!session && session.expiresAt > Date.now();

const pushUiMode = async (userId: string, mode: UiMode, at: number) => {
    if (!accountEnabled() || syncOff()) return setSync('device');
    if (!tokenFresh) return;
    try {
        await rest(`profiles?id=eq.${userId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ui_mode: mode, ui_mode_at: at }) });
        setSync('account');
    } catch (error) {
        failed(error);
    }
};

interface ModeRow {
    ui_mode: string | null;
    ui_mode_at: number | string | null;
}

/** Trae el modo de la cuenta: si se eligió después en otro dispositivo, se usa aquí; si lo de aquí es más nuevo, se sube */
export const pullUiMode = async (userId: string) => {
    if (!accountEnabled() || syncOff()) return setSync('device');
    try {
        const rows = await rest<ModeRow[]>(`profiles?id=eq.${userId}&select=ui_mode,ui_mode_at`);
        setSync('account');
        const row = rows?.[0];
        const remote: UiMode | null = row?.ui_mode === 'pro' || row?.ui_mode === 'lite' ? row.ui_mode : null;
        const remoteAt = Number(row?.ui_mode_at) || 0;
        const localAt = readAt(userId);
        if (remote && remoteAt > localAt) {
            if (remote !== read(userId)) {
                store(userId, remote, remoteAt);
                emit();
            }
        } else if (localAt > remoteAt || (!remote && read(userId) === 'pro')) {
            // PRO elegido antes de que existiera la sincronización: se sube con hora 1 para que cualquier cambio nuevo gane
            await pushUiMode(userId, read(userId), localAt || 1);
        }
    } catch (error) {
        failed(error);
    }
};

/** Revisa el modo de la cuenta al abrir la app, al entrar con otra cuenta y al volver a la app (cada 5 min como mucho) */
export const useUiModeSync = () => {
    const session = useSession();
    const userId = session?.user.id ?? null;
    const expiresAt = session?.expiresAt ?? 0;
    useEffect(() => {
        const fresh = freshSession(userId ? { expiresAt } : null);
        tokenFresh = fresh;
        if (!userId || !fresh) return;
        let last = Date.now();
        void pullUiMode(userId);
        const subscription = AppState.addEventListener('change', (status) => {
            if (status !== 'active' || Date.now() - last < PULL_EVERY_MS) return;
            last = Date.now();
            void pullUiMode(userId);
        });
        return () => subscription?.remove();
    }, [userId, expiresAt]);
};
