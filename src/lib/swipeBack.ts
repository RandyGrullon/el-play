// Deslizar a la derecha para volver (como en iPhone), desde cualquier parte de la página: las reglas y las cuentas, sin
// tocar la página. El gesto (los toques, el arrastre y la animación) está en hooks/useSwipeBack.ts.

/** Las páginas de la barra de abajo: de ahí no se vuelve deslizando */
export const TAB_ROOTS = ['/', '/posiciones', '/fantasy', '/mas'];
/** Pestañas de Posiciones: se cambian entre sí sin dejar historial (StatsTabs) */
export const STANDINGS_TABS = ['/lideres', '/estadisticas'];

export const SWIPE = {
    /** Lo que se mueve el dedo antes de decidir si es para volver o para desplazar la página (px) */
    lock: 10,
    /** De lado si |dx| > ratio · |dy| */
    ratio: 1.5,
    /** Soltar pasado este tanto del ancho vuelve */
    distance: 0.35,
    /** …o soltar más rápido que esto (px/ms) */
    velocity: 0.5,
    /** Safari de iPhone (fuera de la app instalada) ya vuelve desde el borde: esos px son suyos */
    iosEdge: 20,
    /** Salida y regreso de la página (ms) */
    outMs: 200,
    backMs: 220,
    /** La velocidad al soltar se mide con lo último que se movió el dedo (ms) */
    sampleMs: 100
} as const;

const clean = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

export const isStandingsTab = (pathname: string) => STANDINGS_TABS.includes(clean(pathname));

/** A dónde ir si no hay a dónde volver; null en las páginas de la barra (ahí no hay gesto) */
export const backFallback = (pathname: string): string | null => {
    const path = clean(pathname);
    if (TAB_ROOTS.includes(path)) return null;
    if (isStandingsTab(path) || path.startsWith('/equipo/')) return '/posiciones';
    if (path.startsWith('/jugador/')) return '/estadisticas';
    if (path === '/privacidad') return '/mas';
    return '/';
};

/**
 * Hay una página de la app detrás en el historial. BrowserRouter guarda la posición de cada entrada en
 * `history.state.idx` (0 = la primera, aunque se haya reemplazado por una redirección); sin eso, la llave de la entrada.
 */
export const canGoBack = (key: string, historyState: unknown) => {
    const idx = (historyState as { idx?: unknown } | null | undefined)?.idx;
    return typeof idx === 'number' ? idx > 0 : key !== 'default';
};

export type BackAction = { kind: 'pop' } | { kind: 'replace'; to: string };

/**
 * Qué hace volver: atrás en el historial o, si no hay, la página de `backFallback`. Líderes y Estadísticas son
 * pestañas de Posiciones: vuelven a Posiciones, salvo que se abrieran con un enlace desde otra página (Fantasy →
 * Estadísticas), que vuelven a esa página.
 */
export const backAction = (pathname: string, hasHistory: boolean, openedByLink = false): BackAction | null => {
    const fallback = backFallback(pathname);
    if (!fallback) return null;
    if (isStandingsTab(pathname) && !openedByLink) return { kind: 'replace', to: fallback };
    return hasHistory ? { kind: 'pop' } : { kind: 'replace', to: fallback };
};

/**
 * Si la entrada del historial a la que se acaba de llegar es una pestaña de Posiciones abierta con un enlace. Abrirla
 * directo la marca; cambiar de pestaña (reemplaza la entrada) hereda la marca de la anterior; volver o avanzar (POP)
 * no cambia nada (undefined: se queda lo que ya se sabía de esa entrada).
 */
export const openedByLinkEntry = (navigationType: 'PUSH' | 'REPLACE' | 'POP', pathname: string, replaced?: boolean): boolean | undefined => {
    if (navigationType === 'PUSH') return isStandingsTab(pathname);
    if (navigationType === 'REPLACE') return replaced === true && isStandingsTab(pathname);
    return undefined;
};

/** null mientras el dedo no se haya movido lo suficiente; luego, si es para volver (de lado, a la derecha) o no */
export const lockDirection = (dx: number, dy: number): 'back' | 'other' | null => {
    if (Math.hypot(dx, dy) < SWIPE.lock) return null;
    return dx > 0 && Math.abs(dx) > SWIPE.ratio * Math.abs(dy) ? 'back' : 'other';
};

export interface Sample {
    x: number;
    t: number;
}

/** Velocidad de lado al soltar (px/ms, + hacia la derecha) con lo que se movió el dedo en el último `sampleMs` */
export const releaseVelocity = (samples: Sample[], now: number) => {
    const recent = samples.filter((sample) => now - sample.t <= SWIPE.sampleMs);
    if (recent.length < 2) return 0;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const elapsed = last.t - first.t;
    return elapsed > 0 ? (last.x - first.x) / elapsed : 0;
};

/** Al soltar: vuelve si pasó el tanto del ancho o se soltó rápido hacia la derecha */
export const shouldGoBack = (dx: number, velocity: number, width: number) => dx > 0 && (dx >= width * SWIPE.distance || velocity > SWIPE.velocity);

/** El toque empezó en el borde que Safari de iPhone usa para su propio «atrás» (no en la app instalada) */
export const startsInSystemEdge = (x: number, ios: boolean, standalone: boolean) => ios && !standalone && x <= SWIPE.iosEdge;

// Campos y controles que se arrastran; lo marcado con data-no-swipe; el terreno y el mapa de batazos (clase `fld`);
// y las hojas y diálogos
const BLOCKERS = [
    'input',
    'textarea',
    'select',
    '[contenteditable]:not([contenteditable="false"])',
    '[role="slider"]',
    '[data-no-swipe]',
    '.fld',
    '[role="dialog"]',
    '[aria-modal="true"]',
    'dialog'
].join(', ');

/** Se desplaza de lado (overflow-x auto o scroll, y su contenido no cabe) */
export const scrollsSideways = (element: Element) => {
    if (element.scrollWidth <= element.clientWidth) return false;
    const overflow = getComputedStyle(element).overflowX;
    return overflow === 'auto' || overflow === 'scroll';
};

/** El dedo empezó en algo con su propio gesto de lado (o que no es la página): ahí no se vuelve deslizando */
export const blocksSwipe = (target: EventTarget | null, container: Element) => {
    const start = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    if (!start || !container.contains(start)) return true;
    if (start.closest(BLOCKERS)) return true;
    for (let element: Element | null = start; element && element !== container; element = element.parentElement) {
        if (scrollsSideways(element)) return true;
    }
    return false;
};

/** Hay una hoja o un diálogo abierto (encima de la página) */
export const hasOpenDialog = (doc: Document) => doc.querySelector('[aria-modal="true"], dialog[open]') !== null;

/** Hay texto seleccionado (arrastrar es para la selección) */
export const hasTextSelection = (selection: Selection | null) => !!selection && !selection.isCollapsed && selection.toString().length > 0;
