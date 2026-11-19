// Marcador flotante: una ventanita encima de todo que sigue el juego aunque cambies de app.
// - window: Chrome y Edge de computadora (también con la app instalada) abren una ventana flotante con cualquier
//   contenido (Document Picture-in-Picture): ahí va el marcador hecho con la misma página.
// - video: donde el navegador solo deja flotar videos, el marcador se dibuja en un lienzo y se manda como video.
// - null: no se puede (iPhone pausa la página al salir del navegador y el marcador se quedaría congelado;
//   Firefox no deja abrirla desde la página). Ahí el botón no sale.
import { isIOS } from './install';

export type FloatMode = 'window' | 'video';

interface DocumentPip {
    requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
    window: Window | null;
}

export const documentPip = (): DocumentPip | null =>
    typeof window !== 'undefined' ? ((window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture ?? null) : null;

/** El navegador deja flotar un video hecho con un lienzo (no en iPhone: ahí se congelaría al salir) */
export const videoFloats = () => {
    if (typeof document === 'undefined' || isIOS()) return false;
    const video = typeof HTMLVideoElement !== 'undefined' ? HTMLVideoElement.prototype : null;
    const canvas = typeof HTMLCanvasElement !== 'undefined' ? HTMLCanvasElement.prototype : null;
    return !!document.pictureInPictureEnabled && typeof video?.requestPictureInPicture === 'function' && typeof canvas?.captureStream === 'function';
};

export const floatMode = (): FloatMode | null => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    if (documentPip()) return 'window';
    return videoFloats() ? 'video' : null;
};

/**
 * La ventana flotante empieza en blanco: se le copian los estilos de la página (las hojas de otro sitio, como las
 * letras de Google, van por enlace) y el tema claro/oscuro, que se sigue copiando si cambia mientras está abierta
 */
export const prepareFloatingWindow = (pip: Window, title: string): (() => void) => {
    const head = pip.document.head;
    for (const sheet of Array.from(document.styleSheets)) {
        try {
            const style = pip.document.createElement('style');
            style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n');
            head.appendChild(style);
        } catch {
            if (!sheet.href) continue;
            const link = pip.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = sheet.href;
            head.appendChild(link);
        }
    }
    pip.document.title = title;
    const mirror = () => {
        const root = document.documentElement;
        const theme = root.getAttribute('data-theme');
        if (theme) pip.document.documentElement.setAttribute('data-theme', theme);
        else pip.document.documentElement.removeAttribute('data-theme');
        pip.document.documentElement.lang = root.lang;
    };
    mirror();
    const observer = new MutationObserver(mirror);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'lang'] });
    return () => observer.disconnect();
};
