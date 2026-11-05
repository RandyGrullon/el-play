// Errores de la app en el teléfono: van al servidor (/api/v2/client-error) y quedan en los logs de Vercel, sin
// servicios de terceros (igual que errorReport.ts de la web). Máximo 5 por sesión y cada mensaje una sola vez. Sin
// datos de la persona: el mensaje y la pila (sin correos, ids de cuenta ni tokens), la pantalla como patrón de la ruta
// («/jugador/[id]», sin el id), la versión y el sistema. Nada de esto puede tumbar la app ni repetirse en bucle.
import { useEffect } from 'react';
import { Platform, type ErrorUtils } from 'react-native';
import Constants from 'expo-constants';
import { useSegments } from 'expo-router';
import { API_BASE } from './config';
import { getItem, onHydrated, removeItem, setItem } from './storage';

const MAX_REPORTS = 5;
/** Límites del servidor (pushController.clientError) */
const LIMITS = { message: 300, stack: 1500, url: 200, version: 40 };
/** Un error que cerró la app: se guarda antes de mandarlo y, si no llegó, se manda al volver a abrirla */
const PENDING_KEY = 'el-play-pending-error';

interface Report {
    message: string;
    stack: string;
    url: string;
    version: string;
    platform: string;
}

const sent = new Set<string>();
let count = 0;
let screen = '';
let busy = false;

// El servidor solo guarda message, stack, url y version: el sistema va también dentro de version
const VERSION = `${Constants.expoConfig?.version ?? '?'} ${Platform.OS} ${String(Platform.Version ?? '')}`.trim().slice(0, LIMITS.version);

/** Sin correos, tokens, ids de cuenta ni lo que va después de «?» en una dirección */
const scrub = (text: string) =>
    text
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [token]')
        .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[token]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
        .replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'")]*/g, '$1');

/** Lo que se puede leer de cualquier cosa que se lanzó (Error, texto u otra cosa) */
const describe = (error: unknown): { name: string; message: string; stack: string } => {
    if (error instanceof Error) return { name: error.name, message: error.message || error.name, stack: error.stack ?? '' };
    if (typeof error === 'string') return { name: '', message: error, stack: '' };
    if (error && typeof error === 'object') {
        const item = error as { name?: unknown; message?: unknown; stack?: unknown };
        let message = typeof item.message === 'string' ? item.message : '';
        if (!message) {
            try {
                message = JSON.stringify(error) ?? '';
            } catch {
                message = '[object]';
            }
        }
        return { name: typeof item.name === 'string' ? item.name : '', message, stack: typeof item.stack === 'string' ? item.stack : '' };
    }
    return { name: '', message: String(error), stack: '' };
};

const send = (report: Report, pending: boolean) => {
    fetch(`${API_BASE}/api/v2/client-error`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) })
        .then((response) => {
            if (pending && response.ok) removeItem(PENDING_KEY);
        })
        .catch(() => undefined);
};

/**
 * Manda un error al servidor. `fatal`: el que cierra la app (se guarda por si no alcanza a salir). En desarrollo no se
 * manda (ya se ve en la pantalla roja).
 */
export const reportError = (error: unknown, fatal = false) => {
    if (__DEV__ || busy || count >= MAX_REPORTS) return;
    busy = true;
    try {
        const { name, message: raw, stack } = describe(error);
        // Cancelar una petición al cambiar de pantalla o quedarse sin red no son errores de la app
        if (name === 'AbortError' || /^(Aborted|Network request failed)$/.test(raw)) return;
        const message = scrub(raw).slice(0, LIMITS.message);
        if (!message || sent.has(message)) return;
        sent.add(message);
        count += 1;
        const report: Report = { message, stack: scrub(stack).slice(0, LIMITS.stack), url: (screen || '/').slice(0, LIMITS.url), version: VERSION, platform: Platform.OS };
        if (fatal) {
            try {
                setItem(PENDING_KEY, JSON.stringify(report));
            } catch {
                /* sin almacenamiento: se manda igual */
            }
        }
        send(report, fatal);
    } catch {
        /* nunca se cae por avisar de un error */
    } finally {
        busy = false;
    }
};

// Al volver a abrir: el error que cerró la app la vez pasada (se borra antes de mandarlo para no repetirlo nunca)
onHydrated(() => {
    try {
        const saved = getItem(PENDING_KEY);
        if (!saved) return;
        removeItem(PENDING_KEY);
        const report = JSON.parse(saved) as Partial<Report>;
        if (__DEV__ || typeof report.message !== 'string' || !report.message) return;
        count += 1;
        sent.add(report.message);
        send({ message: report.message.slice(0, LIMITS.message), stack: String(report.stack ?? '').slice(0, LIMITS.stack), url: String(report.url ?? '/').slice(0, LIMITS.url), version: String(report.version ?? VERSION).slice(0, LIMITS.version), platform: String(report.platform ?? Platform.OS) }, false);
    } catch {
        /* lo guardado no se entiende: se olvida */
    }
});

let installed = false;

/** Errores sin atrapar (el manejador de siempre sigue después) y promesas rechazadas sin catch */
export const installErrorReporting = () => {
    if (installed) return;
    installed = true;
    try {
        const utils = (globalThis as { ErrorUtils?: ErrorUtils }).ErrorUtils;
        const previous = utils?.getGlobalHandler?.();
        utils?.setGlobalHandler?.((error, isFatal) => {
            reportError(error, isFatal);
            previous?.(error, isFatal);
        });
        // Hermes avisa de las promesas sin catch solo si se le pide (en desarrollo ya lo hace React Native)
        const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (options: { allRejections: boolean; onUnhandled: (id: number, rejection: unknown) => void; onHandled: () => void }) => void } }).HermesInternal;
        if (!__DEV__ && Platform.OS !== 'web') {
            hermes?.enablePromiseRejectionTracker?.({ allRejections: true, onUnhandled: (_id, rejection) => reportError(rejection), onHandled: () => undefined });
        }
        // La versión web de la app (Expo web) no tiene ErrorUtils
        if (Platform.OS === 'web' && typeof window !== 'undefined' && !utils) {
            window.addEventListener('error', (event) => reportError(event.error ?? event.message));
            window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
        }
    } catch {
        /* sin reporte de errores la app sigue igual */
    }
};

/** Sigue la pantalla que se ve como patrón de la ruta (sin ids): va en el reporte */
export const useErrorScreen = () => {
    const segments = useSegments();
    const route = `/${segments.join('/')}`;
    useEffect(() => {
        screen = route;
    }, [route]);
};
