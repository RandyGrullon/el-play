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

/**
 * Liga privada de prueba (Fantasy v3): para ver la semana y las herramientas del dueño sin cuenta. Los nombres y las
 * cuentas son inventados; la primera cuenta es la de quien prueba (el dueño).
 */
export const DEMO_USER = '00000000-0000-4000-8000-000000000000';
export const DEMO_LEAGUE = {
    id: 'demo-liga',
    name: 'Liga de los panas',
    code: 'PANA26',
    owner: DEMO_USER,
    members: [DEMO_USER, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004']
};
export const DEMO_NAMES: Record<string, string> = {
    '00000000-0000-4000-8000-000000000001': 'Ana Prueba',
    '00000000-0000-4000-8000-000000000002': 'Beto Prueba',
    '00000000-0000-4000-8000-000000000003': 'Carla Prueba',
    '00000000-0000-4000-8000-000000000004': 'Dani Prueba'
};

/** Guardado simulado: tarda un poco y, sin red (DevTools u «offline» de Playwright), falla como sin conexión */
export const demoPush = (): Promise<EntryHistory | null> =>
    new Promise((resolve, reject) => {
        setTimeout(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? reject(new AccountError('network')) : resolve(null)), 700);
    });
