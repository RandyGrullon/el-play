// Sin zoom en ninguna parte, como una app del teléfono: ni pellizco, ni doble toque, ni el zoom de iPhone al tocar un
// campo de texto, tampoco dentro de los modales. La base es CSS (touch-action en todos los elementos y la letra de los
// campos a 16 px en pantallas táctiles, styles.css) y el viewport (maximum-scale=1, index.html); esto cubre lo que el
// navegador no respeta:
// - Safari de iPhone ignora touch-action y user-scalable para el pellizco: sus eventos gesture* se cancelan.
// - Con dos dedos se cancela el movimiento (Android viejos y navegadores que no aplican touch-action).
// - Doble toque en Safari viejos.
// - En la computadora, el pellizco del trackpad (llega como rueda con Ctrl) y Ctrl/Cmd con + − 0.
export const blockZoom = () => {
    if (typeof document === 'undefined') return;
    const cancel = (event: Event) => {
        if (event.cancelable) event.preventDefault();
    };
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(name, cancel, { passive: false });

    document.addEventListener(
        'touchmove',
        (event) => {
            if (event.touches.length > 1) cancel(event);
        },
        { passive: false }
    );

    let lastTouchEnd = 0;
    document.addEventListener(
        'touchend',
        (event) => {
            const now = Date.now();
            const target = event.target as HTMLElement | null;
            // Los controles reciben sus toques seguidos (un + que se toca rápido); el resto no amplía
            const interactive = target?.closest('a, button, input, select, textarea, label, [role="tab"]');
            if (!interactive && event.touches.length === 0 && event.changedTouches.length === 1 && now - lastTouchEnd < 300) cancel(event);
            lastTouchEnd = now;
        },
        { passive: false }
    );

    window.addEventListener(
        'wheel',
        (event) => {
            if (event.ctrlKey) cancel(event);
        },
        { passive: false }
    );
    window.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0', '_'].includes(event.key)) cancel(event);
    });
};
