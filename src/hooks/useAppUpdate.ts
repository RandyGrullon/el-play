// Actualizar la app sin reinstalarla (expo-updates + EAS Update, ver «Actualizar sin reinstalar» en el README). El
// teléfono busca solo al abrir la app (`updates.checkAutomatically` en app.json) y la baja sin esperar; aquí además se
// busca al volver a la app, como mucho cada 15 minutos (lib/appUpdate.ts), y se baja en silencio. Con la versión nueva
// ya bajada, components/UpdateBanner.tsx avisa «Hay una versión nueva» y solo recarga si se toca «Actualizar»; si no,
// queda puesta la próxima vez que se abra la app.
// En la web, en desarrollo, en Expo Go, en un build de antes de instalar expo-updates o sin configurar (sin
// `updates.url`, hasta correr `eas update:configure`) no se hace nada.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { ReloadScreenOptions } from 'expo-updates';
import { canUseUpdates, lastCheckOf, shouldCheck } from '../lib/appUpdate';

type UpdatesModule = typeof import('expo-updates');

const load = (): UpdatesModule | null => {
    try {
        const host = {
            os: Platform.OS,
            dev: __DEV__,
            expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
            native: Platform.OS !== 'web' && !!requireOptionalNativeModule('ExpoUpdates')
        };
        if (!canUseUpdates(host)) return null;
        // Se carga tarde a propósito: importar expo-updates sin su módulo nativo (un build de antes) rompe la app
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const updates = require('expo-updates') as UpdatesModule;
        // Sin `updates.url` o con `updates.enabled: false` corre siempre lo que trae el build
        return updates.isEnabled ? updates : null;
    } catch {
        return null;
    }
};

const updates = load();

/** Hay actualizaciones sin reinstalar en este teléfono (build de iPhone o Android conectado a EAS Update) */
export const updatesOn = updates !== null;

// ---------------------------------------------------------------- animaciones de jugada en pantalla

let holds = 0;
const holdListeners = new Set<() => void>();
const emitHolds = () => holdListeners.forEach((listener) => listener());
const subscribeHolds = (listener: () => void) => {
    holdListeners.add(listener);
    return () => {
        holdListeners.delete(listener);
    };
};

/** La pantalla del juego lo enciende mientras sale una animación de jugada o una repetición: el aviso espera */
export const useHoldUpdateBanner = (playing: boolean) => {
    useEffect(() => {
        if (!playing || !updatesOn) return;
        holds += 1;
        emitHolds();
        return () => {
            holds -= 1;
            emitHolds();
        };
    }, [playing]);
};

/** Sale alguna animación de jugada */
export const useAnimating = () => useSyncExternalStore(subscribeHolds, () => holds > 0, () => false);

// ---------------------------------------------------------------- buscar, bajar y recargar

/** Solo donde `updatesOn` (components/UpdateBanner.tsx no lo monta en los demás casos) */
export const useAppUpdate = () => {
    const api = updates as UpdatesModule;
    const { isStartupProcedureRunning, isChecking, isDownloading, isRestarting, isUpdatePending, lastCheckForUpdateTimeSinceRestart } = api.useUpdates();
    // Ocupado: lo del arranque (el teléfono buscando y bajando solo), una búsqueda, una descarga o la recarga
    const busy = isStartupProcedureRunning || isChecking || isDownloading || isRestarting;
    const nativeLast = lastCheckForUpdateTimeSinceRestart?.getTime() ?? null;
    const [dismissed, setDismissed] = useState(false);
    const [reloading, setReloading] = useState(false);
    const lastCheck = useRef<number | null>(null);
    // Lo de la última lectura, para las búsquedas (se mira al momento, no en el render)
    const latest = useRef({ busy, ready: isUpdatePending, nativeLast });
    useEffect(() => {
        latest.current = { busy, ready: isUpdatePending, nativeLast };
    });

    const check = useCallback(async () => {
        const now = Date.now();
        const { busy: working, ready, nativeLast: phoneLast } = latest.current;
        if (!shouldCheck({ now, lastCheck: lastCheckOf(lastCheck.current, phoneLast), busy: working, ready })) return;
        lastCheck.current = now;
        try {
            const result = await api.checkForUpdateAsync();
            // Se baja en silencio; al terminar, isUpdatePending pasa a true y sale el aviso
            if (result.isAvailable || result.isRollBackToEmbedded) await api.fetchUpdateAsync();
        } catch {
            /* sin señal o sin servidor: se intenta otra vez al volver a la app, pasados los 15 minutos */
        }
    }, [api]);

    // Al abrir: cuando el teléfono termina lo suyo del arranque (si ya buscó, no se repite antes de los 15 minutos)
    useEffect(() => {
        if (!busy) check();
    }, [busy, check]);

    // Al volver a la app: se busca otra vez si toca y el aviso cerrado vuelve a salir
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (status) => {
            if (status !== 'active') return;
            setDismissed(false);
            check();
        });
        return () => subscription.remove();
    }, [check]);

    const dismiss = useCallback(() => setDismissed(true), []);

    /** Recarga con la versión nueva (solo cuando se toca «Actualizar») */
    const reload = useCallback(
        (reloadScreenOptions: ReloadScreenOptions) => {
            setReloading(true);
            api.reloadAsync({ reloadScreenOptions }).catch(() => setReloading(false));
        },
        [api]
    );

    return { ready: isUpdatePending, dismissed, dismiss, reloading, reload };
};
