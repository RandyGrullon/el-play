// Modo de prueba del Fantasy SOLO en desarrollo (npm run dev / dev:mock): con /fantasy?demo=1 se juega sin cuenta, el
// equipo se guarda en este navegador (aparte del de cualquier cuenta) y el guardado se simula, para probar y grabar
// el selector y el equipo sin Supabase. ?demo=0 lo apaga. En producción import.meta.env.DEV es false y nada de esto existe.
import { AccountError } from './account';
import type { EntryHistory } from './fantasy';

const KEY = 'el-play-fantasy-demo';
/** Dueño de la copia del navegador en modo de prueba (setStoreOwner) */
export const DEMO_OWNER = 'demo';

const readFlag = () => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return false;
    try {
        const value = new URLSearchParams(window.location.search).get('demo');
        if (value === '0') sessionStorage.removeItem(KEY);
        else if (value !== null) sessionStorage.setItem(KEY, '1');
        return sessionStorage.getItem(KEY) === '1';
    } catch {
        return false;
    }
};

/** En modo de prueba y sin cuenta abierta (con cuenta se juega de verdad) */
export const fantasyDemo = (hasSession: boolean) => !hasSession && readFlag();

/** Guardado simulado: tarda un poco y, sin red (DevTools u «offline» de Playwright), falla como sin conexión */
export const demoPush = (): Promise<EntryHistory | null> =>
    new Promise((resolve, reject) => {
        setTimeout(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? reject(new AccountError('network')) : resolve(null)), 700);
    });
