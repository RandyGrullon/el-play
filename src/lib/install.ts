// Instalar El Play en la pantalla de inicio.
// Android (Chrome, Edge, Samsung) avisa con `beforeinstallprompt`: con un toque sale el diálogo del sistema y el usuario
// solo autoriza. Chrome lo lanza una vez y temprano, así que se captura al cargar este módulo (main.tsx), antes de React.
// iPhone no tiene API para instalar desde la página: solo se puede guiar por Compartir → Agregar a inicio.
import { useSyncExternalStore } from 'react';
import { readStorage, writeStorage } from '../store/storage';

interface InstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode =
    | 'installed' // ya corre como app
    | 'prompt' // un toque: el sistema pide autorizar
    | 'ios-safari'
    | 'ios-browser' // Chrome, Edge o Firefox en iPhone (desde iOS 16.4 también agregan a inicio)
    | 'in-app' // navegador de Instagram, Facebook, TikTok…: desde ahí no se puede instalar
    | 'android-menu' // Android sin el aviso (Firefox, o Chrome todavía no lo lanza): menú ⋮
    | 'unsupported'; // escritorio sin instalación

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
let sheetOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault(); // sin la barrita de Chrome: la app muestra su propio botón
        deferred = event as InstallPromptEvent;
        emit();
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        installedNow = true;
        emit();
    });
}

const ua = () => navigator.userAgent;
export const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (ua().includes('Macintosh') && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(ua());
// Las redes sociales abren los enlaces en su propio navegador; en Android cualquier WebView lleva "; wv)"
const isInApp = () => /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|BytedanceWebview|musical_ly|TikTok|Snapchat|LinkedInApp|\bLine\/|Pinterest/i.test(ua()) || (isAndroid() && /; wv\)/.test(ua()));
export const isIOSSafari = () => isIOS() && /Safari\//.test(ua()) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|GSA\//.test(ua());
export const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Safari 26 movió Compartir al botón «•••» junto a la dirección (el UA congela la versión de iOS; la de Safari sí cambia) */
export const safariVersion = () => Number(/Version\/(\d+)/.exec(ua())?.[1] ?? 0);
export const isIPad = () => /iPad/.test(ua()) || (ua().includes('Macintosh') && navigator.maxTouchPoints > 1);

export const getInstallMode = (): InstallMode => {
    if (typeof window === 'undefined') return 'unsupported';
    if (installedNow || isStandalone()) return 'installed';
    if (isInApp()) return 'in-app';
    if (deferred) return 'prompt';
    if (isIOS()) return isIOSSafari() ? 'ios-safari' : 'ios-browser';
    if (isAndroid()) return 'android-menu';
    return 'unsupported';
};

export const useInstallMode = () => useSyncExternalStore(subscribe, getInstallMode, () => 'unsupported' as InstallMode);

/** Abre el diálogo del sistema. El evento sirve una sola vez; si lo rechaza, Chrome lo vuelve a lanzar otro día */
export const promptInstall = async (): Promise<boolean> => {
    const event = deferred;
    if (!event) return false;
    deferred = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') installedNow = true;
    emit();
    return outcome === 'accepted';
};

// ---------------------------------------------------------------- hoja con la guía (una sola, en AppShell)

export const useInstallSheet = () => useSyncExternalStore(subscribe, () => sheetOpen, () => false);
export const openInstallSheet = () => {
    sheetOpen = true;
    emit();
};
export const closeInstallSheet = () => {
    sheetOpen = false;
    emit();
};

/** El botón «Instalar»: en Android va directo al diálogo del sistema; en el resto abre la guía */
export const requestInstall = async () => {
    if (getInstallMode() === 'prompt') {
        await promptInstall();
        return;
    }
    openInstallSheet();
};

/** Saca la página del navegador de Instagram/Facebook al de verdad, directo a la guía (/instalar) */
export const openInBrowserUrl = () => {
    const target = `${window.location.origin}/instalar`;
    if (isIOS()) return `x-safari-${target}`;
    return `intent://${window.location.host}/instalar#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target)};end`;
};

// ---------------------------------------------------------------- tarjeta de la portada

const BANNER_KEY = 'el-play-install-banner';
const BANNER_PAUSE_MS = 14 * 24 * 60 * 60 * 1000;

export const bannerDismissed = () => Date.now() - readStorage<number>(BANNER_KEY, 0) < BANNER_PAUSE_MS;

// La tarjeta grande solo en la primera visita; después queda solo el ícono de arriba (antes salían los dos)
const VISITS_KEY = 'el-play-visits';
let visits = 1;
if (typeof window !== 'undefined') {
    try {
        if (!sessionStorage.getItem(VISITS_KEY)) {
            sessionStorage.setItem(VISITS_KEY, '1');
            visits = readStorage<number>(VISITS_KEY, 0) + 1;
            writeStorage(VISITS_KEY, visits);
        } else visits = Math.max(1, readStorage<number>(VISITS_KEY, 1));
    } catch {
        visits = 1;
    }
}
const bannerVisible = () => visits <= 1 && !bannerDismissed();
export const useBannerVisible = () => useSyncExternalStore(subscribe, bannerVisible, () => false);

/** Navegador de Android, para dar los pasos de su menú (Chrome, Samsung Internet o Firefox) */
export const androidBrowser = (): 'chrome' | 'samsung' | 'firefox' => (/SamsungBrowser/i.test(ua()) ? 'samsung' : /Firefox\//i.test(ua()) ? 'firefox' : 'chrome');

// ---------------------------------------------------------------- navegador para la guía (cada uno instala distinto)

export type InstallPlatform = 'ios' | 'android' | 'desktop';
export type InstallBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'opera' | 'other' | 'inapp';

/** Los navegadores de cada sistema que tienen su propia guía, en el orden en que salen */
export const BROWSERS: Record<InstallPlatform, InstallBrowser[]> = {
    ios: ['safari', 'chrome', 'firefox', 'edge', 'other', 'inapp'],
    android: ['chrome', 'samsung', 'firefox', 'edge', 'opera', 'other', 'inapp'],
    desktop: ['chrome', 'edge', 'safari', 'firefox', 'other']
};

/**
 * Sistema y navegador de quien abre la guía, por su user agent. Brave y DuckDuckGo se hacen pasar por Chrome o Safari:
 * Brave se reconoce por navigator.brave; los que no se reconocen van a «otro» con pasos generales.
 */
export const detectBrowser = (agent = typeof navigator !== 'undefined' ? navigator.userAgent : '', touch = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0, brave = typeof navigator !== 'undefined' && 'brave' in navigator): { platform: InstallPlatform; browser: InstallBrowser } => {
    const ios = /iPhone|iPad|iPod/.test(agent) || (agent.includes('Macintosh') && touch > 1);
    const android = /Android/i.test(agent);
    const inApp = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|BytedanceWebview|musical_ly|TikTok|Snapchat|LinkedInApp|\bLine\/|Pinterest/i.test(agent) || (android && /; wv\)/.test(agent));
    if (ios) {
        if (inApp) return { platform: 'ios', browser: 'inapp' };
        if (/CriOS/.test(agent)) return { platform: 'ios', browser: 'chrome' };
        if (/FxiOS/.test(agent)) return { platform: 'ios', browser: 'firefox' };
        if (/EdgiOS/.test(agent)) return { platform: 'ios', browser: 'edge' };
        if (/OPiOS|OPT\/|YaBrowser|GSA\/|DuckDuckGo|Ddg\//.test(agent) || brave) return { platform: 'ios', browser: 'other' };
        return { platform: 'ios', browser: /Safari\//.test(agent) ? 'safari' : 'other' };
    }
    if (android) {
        if (inApp) return { platform: 'android', browser: 'inapp' };
        if (/SamsungBrowser/i.test(agent)) return { platform: 'android', browser: 'samsung' };
        if (/Firefox\//i.test(agent)) return { platform: 'android', browser: 'firefox' };
        if (/EdgA\//.test(agent)) return { platform: 'android', browser: 'edge' };
        if (/OPR\/|Opera/.test(agent)) return { platform: 'android', browser: 'opera' };
        if (brave || /MiuiBrowser|XiaoMi|HuaweiBrowser|HeyTapBrowser|YaBrowser|UCBrowser|DuckDuckGo/i.test(agent)) return { platform: 'android', browser: 'other' };
        return { platform: 'android', browser: /Chrome\//.test(agent) ? 'chrome' : 'other' };
    }
    if (/Edg\//.test(agent)) return { platform: 'desktop', browser: 'edge' };
    if (/OPR\/|Opera/.test(agent) || brave) return { platform: 'desktop', browser: 'other' };
    if (/Firefox\//.test(agent)) return { platform: 'desktop', browser: 'firefox' };
    if (/Chrome\//.test(agent)) return { platform: 'desktop', browser: 'chrome' };
    if (/Macintosh/.test(agent) && /Safari\//.test(agent)) return { platform: 'desktop', browser: 'safari' };
    return { platform: 'desktop', browser: 'other' };
};
export const dismissBanner = () => {
    writeStorage(BANNER_KEY, Date.now());
    emit();
};
