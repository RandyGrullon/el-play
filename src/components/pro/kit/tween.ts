// Curvas y pasos de las animaciones por tiempo (no por cuadros): se ven igual a 60 y a 120 Hz.

/** Salida suave: rápido al principio, se posa al final */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Valor entre `from` y `to` en el instante `elapsed` de una animación de `duration` ms */
export const tween = (from: number, to: number, elapsed: number, duration: number, ease: (t: number) => number = easeOutCubic) => {
    if (duration <= 0 || elapsed >= duration) return to;
    return from + (to - from) * ease(elapsed / duration);
};

/** Decimales que trae un número para contar con los mismos (0.316 → 3, 12 → 0) */
export const decimalsOf = (value: number) => {
    if (!Number.isFinite(value) || Number.isInteger(value)) return 0;
    const text = String(value);
    const exp = text.match(/e-(\d+)$/);
    if (exp) return Number(exp[1]);
    return (text.split('.')[1] ?? '').length;
};
