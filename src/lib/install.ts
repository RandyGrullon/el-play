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
const isAndroid = () => /Android/i.test(ua());
// Las redes sociales abren los enlaces en su propio navegador; en Android cualquier WebView lleva "; wv)"
const isInApp = () => /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|BytedanceWebview|musical_ly|TikTok|Snapchat|LinkedInApp|\bLine\/|Pinterest/i.test(ua()) || (isAndroid() && /; wv\)/.test(ua()));
const isIOSSafari = () => isIOS() && /Safari\//.test(ua()) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|GSA\//.test(ua());
const isStandalone = () =>
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
export const dismissBanner = () => writeStorage(BANNER_KEY, Date.now());
