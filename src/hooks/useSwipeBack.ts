import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { usePreferences } from '../store/preferences';
import { prefersReducedMotion } from './useReducedMotion';
import { isIOS, isStandalone } from '../lib/install';
import {
    SWIPE,
    backAction,
    backFallback,
    blocksSwipe,
    canGoBack,
    hasOpenDialog,
    hasTextSelection,
    lockDirection,
    openedByLinkEntry,
    releaseVelocity,
    shouldGoBack,
    startsInSystemEdge,
    type Sample
} from '../lib/swipeBack';

// Por la llave de cada entrada del historial: si es una pestaña de Posiciones abierta con un enlace (lib/swipeBack.ts)
const openedByLink = new Map<string, boolean>();

const easeOut = (progress: number) => 1 - Math.pow(1 - progress, 3);

/**
 * Deslizar a la derecha desde cualquier parte de la página vuelve (fuera de las páginas de la barra). La página
 * (`page`, el contenido de la ruta, sin la barra de abajo) sigue al dedo con transform y `backdrop` oscurece lo que
 * queda a su izquierda, con la sombra de su borde. Todo con estilos y requestAnimationFrame, sin estado de React por
 * cuadro. Solo con el dedo (eventos touch): con el ratón nada cambia. Sin animaciones (las del sistema o las de Más),
 * soltar pasado el umbral solo vuelve.
 */
export const useSwipeBack = (shellRef: RefObject<HTMLElement | null>, pageRef: RefObject<HTMLElement | null>, backdropRef: RefObject<HTMLElement | null>) => {
    const navigate = useNavigate();
    const location = useLocation();
    const navigationType = useNavigationType();
    const { playAnimations } = usePreferences();
    const live = useRef({ pathname: location.pathname, key: location.key, navigate, playAnimations });
    live.current = { pathname: location.pathname, key: location.key, navigate, playAnimations };
    // Al cambiar de página, la nueva queda en su sitio (sin la página de antes fuera de la pantalla)
    const settle = useRef<() => void>(() => undefined);

    const previousKey = useRef<string | null>(null);
    useLayoutEffect(() => {
        const replaced = previousKey.current === null ? undefined : openedByLink.get(previousKey.current);
        const opened = openedByLinkEntry(navigationType, location.pathname, replaced);
        if (opened !== undefined) openedByLink.set(location.key, opened);
        previousKey.current = location.key;
        settle.current();
    }, [location, navigationType]);

    useEffect(() => {
        const shell = shellRef.current;
        if (!shell) return;
        // Safari de iPhone en el navegador ya vuelve desde el borde (en la app instalada no)
        const ios = isIOS();
        const standalone = isStandalone();

        // idle: nada · pending: dedo puesto, sin decidir · drag: volviendo · ignore: este toque no es · busy: animando o
        // esperando la página de atrás
        let phase: 'idle' | 'pending' | 'drag' | 'ignore' | 'busy' = 'idle';
        let startX = 0;
        let startY = 0;
        let dx = 0;
        let width = 1;
        let pageLeft = 0;
        let motion = true;
        let samples: Sample[] = [];
        let frame = 0;
        let timer = 0;

        const paint = (x: number) => {
            const page = pageRef.current;
            const backdrop = backdropRef.current;
            if (page) page.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
            if (backdrop) {
                // Su borde derecho va pegado al borde izquierdo de la página; se aclara mientras más se descubre
                backdrop.style.transform = `translate3d(${pageLeft + x - window.innerWidth}px, 0, 0)`;
                backdrop.style.opacity = String(Math.max(0, 1 - x / width));
            }
        };

        const clear = () => {
            cancelAnimationFrame(frame);
            window.clearTimeout(timer);
            frame = 0;
            const page = pageRef.current;
            const backdrop = backdropRef.current;
            if (page) {
                page.style.transform = '';
                page.style.willChange = '';
            }
            if (backdrop) {
                backdrop.style.display = '';
                backdrop.style.transform = '';
                backdrop.style.opacity = '';
            }
            phase = 'idle';
            dx = 0;
        };
        settle.current = () => {
            if (phase !== 'idle') clear();
        };

        const begin = () => {
            const page = pageRef.current;
            pageLeft = page ? page.getBoundingClientRect().left : 0;
            if (!motion) return;
            if (page) page.style.willChange = 'transform';
            // Fuera de la pantalla antes de mostrarse (paint con 0 la deja a la izquierda de la página)
            paint(0);
            if (backdropRef.current) backdropRef.current.style.display = 'block';
        };

        const animate = (from: number, to: number, ms: number, done: () => void) => {
            const start = performance.now();
            // Con el mismo reloj que `start` (el de requestAnimationFrame puede no serlo)
            const step = () => {
                const progress = Math.min(1, Math.max(0, (performance.now() - start) / ms));
                paint(from + (to - from) * easeOut(progress));
                if (progress < 1) frame = requestAnimationFrame(step);
                else {
                    frame = 0;
                    done();
                }
            };
            frame = requestAnimationFrame(step);
        };

        // Espera la página de atrás (la limpia `settle`); si la dirección no cambió, no se fue a ningún lado
        const waitForPage = (from: string, since: number) => {
            timer = window.setTimeout(() => {
                if (window.location.href === from || performance.now() - since > 4000) clear();
                else waitForPage(from, since);
            }, 400);
        };

        const goBack = () => {
            const { pathname, key, navigate: go } = live.current;
            const action = backAction(pathname, canGoBack(key, window.history.state), openedByLink.get(key) === true);
            if (!action) return clear();
            // Antes de navegar: si la página nueva llega enseguida, `settle` ya encuentra la espera y la quita
            waitForPage(window.location.href, performance.now());
            if (action.kind === 'pop') go(-1);
            else go(action.to, { replace: true });
        };

        const leave = () => {
            cancelAnimationFrame(frame);
            phase = 'busy';
            if (motion) animate(dx, window.innerWidth - pageLeft, SWIPE.outMs, goBack);
            else goBack();
        };

        const restore = () => {
            cancelAnimationFrame(frame);
            if (!motion || !dx) return clear();
            phase = 'busy';
            animate(dx, 0, SWIPE.backMs, clear);
        };

        const onStart = (event: TouchEvent) => {
            if (phase === 'busy') return;
            // Otro dedo: ya no es para volver
            if (phase === 'drag') return restore();
            if (event.touches.length !== 1) {
                phase = 'ignore';
                return;
            }
            const touch = event.touches[0];
            if (
                !backFallback(live.current.pathname) ||
                startsInSystemEdge(touch.clientX, ios, standalone) ||
                hasOpenDialog(document) ||
                hasTextSelection(window.getSelection()) ||
                blocksSwipe(event.target, shell)
            ) {
                phase = 'ignore';
                return;
            }
            phase = 'pending';
            startX = touch.clientX;
            startY = touch.clientY;
            dx = 0;
            width = window.innerWidth || 1;
            motion = live.current.playAnimations && !prefersReducedMotion();
            samples = [{ x: startX, t: event.timeStamp }];
        };

        const onMove = (event: TouchEvent) => {
            if (phase !== 'pending' && phase !== 'drag') return;
            const touch = event.touches[0];
            if (!touch) return;
            const moved = touch.clientX - startX;
            if (phase === 'pending') {
                const lock = lockDirection(moved, touch.clientY - startY);
                if (!lock) return;
                if (lock === 'other') {
                    phase = 'ignore';
                    return;
                }
                phase = 'drag';
                begin();
            }
            // Ya es para volver: la página no se desplaza y lo de adentro (jalar para recargar) no lo ve
            if (event.cancelable) event.preventDefault();
            event.stopPropagation();
            dx = Math.max(0, moved);
            samples.push({ x: touch.clientX, t: event.timeStamp });
            if (samples.length > 12) samples.shift();
            if (motion && !frame)
                frame = requestAnimationFrame(() => {
                    frame = 0;
                    paint(dx);
                });
        };

        const onEnd = (event: TouchEvent) => {
            if (phase === 'drag') {
                // Sin el toque (el enlace de abajo no se abre al soltar)
                if (event.cancelable) event.preventDefault();
                const touch = event.changedTouches[0];
                if (touch) {
                    dx = Math.max(0, touch.clientX - startX);
                    samples.push({ x: touch.clientX, t: event.timeStamp });
                }
                if (event.type === 'touchend' && shouldGoBack(dx, releaseVelocity(samples, event.timeStamp), width)) leave();
                else restore();
                return;
            }
            if (phase !== 'busy' && !event.touches.length) phase = 'idle';
        };

        // touchmove sin passive (se cancela solo cuando ya es para volver) y en captura, antes que lo de adentro
        const options = { capture: true, passive: true };
        const active = { capture: true, passive: false };
        shell.addEventListener('touchstart', onStart, options);
        shell.addEventListener('touchmove', onMove, active);
        shell.addEventListener('touchend', onEnd, active);
        shell.addEventListener('touchcancel', onEnd, options);
        return () => {
            shell.removeEventListener('touchstart', onStart, options);
            shell.removeEventListener('touchmove', onMove, active);
            shell.removeEventListener('touchend', onEnd, active);
            shell.removeEventListener('touchcancel', onEnd, options);
            settle.current = () => undefined;
            clear();
        };
    }, [shellRef, pageRef, backdropRef]);
};
