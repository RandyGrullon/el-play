// El zoom con dos dedos está permitido (accesibilidad: ampliar el box score o las jugadas). Solo se evita el
// zoom por doble toque, que en un marcador en vivo se dispara sin querer al tocar rápido. En navegadores nuevos
// lo hace `touch-action: manipulation` (index.html); esto cubre Safari viejos de iOS.
export const blockDoubleTapZoom = () => {
    if (typeof document === 'undefined') return;
    let lastTouchEnd = 0;
    document.addEventListener(
        'touchend',
        (event) => {
            const now = Date.now();
            const target = event.target as HTMLElement | null;
            const interactive = target?.closest('a, button, input, select, textarea, label, [role="tab"]');
            // Solo un dedo: con dos es un pellizco y se deja pasar
            if (!interactive && event.touches.length === 0 && event.changedTouches.length === 1 && now - lastTouchEnd < 300) event.preventDefault();
            lastTouchEnd = now;
        },
        { passive: false }
    );
};
