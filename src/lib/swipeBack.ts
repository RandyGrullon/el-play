// Deslizar a la derecha para volver (components/SwipeBack.tsx): umbrales y qué hacer al soltar. Lógica pura; corre
// dentro de los worklets del gesto (hilo de la interfaz), por eso cada función lleva 'worklet'.

export const SWIPE_BACK = {
    /** Puntos a la derecha que tiene que correr el dedo para que empiece */
    start: 20,
    /** Si antes sube o baja esto, era scroll: no cuenta */
    failY: 15,
    /** Fracción del ancho a partir de la cual soltar vuelve (y vibra al cruzarla) */
    distance: 0.35,
    /** Velocidad a la derecha (puntos/s) con la que vuelve aunque no llegue a la raya */
    velocity: 800,
    /** Lo que tarda en terminar de irse: entre estos dos (ms) */
    outMinMs: 120,
    outMaxMs: 280,
    /** Velocidad mínima con la que termina de irse si se soltó despacio (puntos/s) */
    outMinSpeed: 1500
} as const;

/** Cuánto se corre la pantalla con el dedo: nunca a la izquierda ni más allá del ancho */
export const swipeOffset = (translationX: number, width: number): number => {
    'worklet';
    if (!(width > 0)) return 0;
    return Math.min(Math.max(0, translationX), width);
};

/** De 0 (en su sitio) a 1 (fuera de la pantalla) */
export const swipeProgress = (offset: number, width: number): number => {
    'worklet';
    if (!(width > 0)) return 0;
    return Math.min(1, Math.max(0, offset / width));
};

/** Ya pasó la raya del 35 %: soltar aquí vuelve */
export const pastSwipeThreshold = (offset: number, width: number): boolean => {
    'worklet';
    return width > 0 && offset >= width * SWIPE_BACK.distance;
};

/** Al soltar: true vuelve, false regresa la pantalla a su sitio */
export const shouldSwipeBack = (translationX: number, velocityX: number, width: number): boolean => {
    'worklet';
    if (!(width > 0) || translationX <= 0) return false;
    return translationX >= width * SWIPE_BACK.distance || velocityX > SWIPE_BACK.velocity;
};

/** Cuánto tarda en terminar de irse lo que falta: más rápido si se soltó con impulso */
export const swipeOutMs = (remaining: number, velocityX: number): number => {
    'worklet';
    const speed = Math.max(velocityX, SWIPE_BACK.outMinSpeed);
    const ms = (Math.max(0, remaining) / speed) * 1000;
    return Math.round(Math.min(SWIPE_BACK.outMaxMs, Math.max(SWIPE_BACK.outMinMs, ms)));
};
