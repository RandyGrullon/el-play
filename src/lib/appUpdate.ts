// Actualización de la app instalada: compara la versión de este build con la del servidor (public/version.json)
// y, si quedó vieja, baja el service worker nuevo antes de recargar para que la recarga no salga de la caché vieja.

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const known = (version: string | null | undefined) => !!version && version !== 'dev' && version !== 'unknown';

export const fetchServerVersion = async (): Promise<string | null> => {
    try {
        // `app=2` distingue esta versión de la primera, que el service worker recarga (public/sw-legacy.js)
        const response = await fetch(`/version.json?app=2&t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return null;
        const { version } = (await response.json()) as { version?: string };
        return version ?? null;
    } catch {
        return null;
    }
};

export const isOutdated = (serverVersion: string | null) => known(serverVersion) && known(APP_VERSION) && serverVersion !== APP_VERSION;

export const applyUpdate = async () => {
    try {
        const registration = await navigator.serviceWorker?.getRegistration();
        if (registration) {
            const controlled = new Promise<void>((resolve) => {
                navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
                setTimeout(resolve, 6000);
            });
            await registration.update();
            // El service worker nuevo se activa solo (autoUpdate); se espera a que tome la página
            if (registration.installing || registration.waiting) await controlled;
        }
    } catch {
        /* sin service worker: basta con recargar */
    }
    window.location.reload();
};

// ---------------------------------------------------------------- ícono en iPhone

const ICON_KEY = 'el-play-icon';
const ICON_VERSION = 'v2';

// Se evalúa al cargar el módulo (main.tsx lo importa antes que nada): si ya había datos guardados, la app se
// instaló antes de este logo.
const installedBefore = (() => {
    try {
        return localStorage.length > 0 && localStorage.getItem(ICON_KEY) !== ICON_VERSION;
    } catch {
        return false;
    }
})();

const isIosHomeScreen = () => {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
    return standalone && ios;
};

export const markIconSeen = () => {
    try {
        localStorage.setItem(ICON_KEY, ICON_VERSION);
    } catch {
        /* sin almacenamiento */
    }
};

/** iPhone no cambia el ícono de una app ya agregada a la pantalla de inicio: hay que avisarle a quien la tenía */
export const shouldShowIconNotice = () => {
    if (installedBefore && isIosHomeScreen()) return true;
    markIconSeen(); // Android y escritorio cambian el ícono solos
    return false;
};
