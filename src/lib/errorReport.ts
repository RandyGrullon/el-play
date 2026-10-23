// Errores de la app en los teléfonos: van al servidor (/api/v2/client-error) y quedan en los logs de Vercel, sin
// servicios de terceros. Máximo 5 por sesión y cada mensaje una sola vez.
import { APP_VERSION } from './appUpdate';

const MAX_REPORTS = 5;
const sent = new Set<string>();

export const reportError = (message: string, stack?: string) => {
    if (import.meta.env.DEV || !message || sent.size >= MAX_REPORTS || sent.has(message)) return;
    // Los de extensiones del navegador y de scripts de otros sitios no dicen nada útil
    if (/^Script error\.?$|ResizeObserver loop|chrome-extension:|moz-extension:/.test(message)) return;
    sent.add(message);
    try {
        fetch('/api/v2/client-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message.slice(0, 300), stack: (stack || '').slice(0, 1500), url: location.pathname, version: APP_VERSION }),
            keepalive: true
        }).catch(() => undefined);
    } catch {
        /* sin red: no pasa nada */
    }
};

export const installErrorReporting = () => {
    window.addEventListener('error', (event) => reportError(event.message, event.error?.stack));
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason as { message?: string; stack?: string; name?: string } | string | undefined;
        // Cancelar una petición al cambiar de pantalla no es un error
        if (typeof reason === 'object' && reason?.name === 'AbortError') return;
        reportError(typeof reason === 'string' ? reason : reason?.message || String(reason), typeof reason === 'object' ? reason?.stack : undefined);
    });
};
