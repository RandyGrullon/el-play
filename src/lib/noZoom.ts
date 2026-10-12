// Bloquea el zoom en el teléfono. La etiqueta viewport (user-scalable=no) basta en Android, pero
// Safari de iOS la ignora desde iOS 10: ahí se cancelan sus gestos de pellizco y el doble toque.
export const blockZoom = () => {
    if (typeof document === 'undefined') return;

    const cancel = (event: Event) => event.preventDefault();
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
        document.addEventListener(name, cancel, { passive: false });
    }

    // Dos dedos moviéndose = pellizco
    document.addEventListener(
        'touchmove',
        (event) => {
            if (event.touches.length > 1) event.preventDefault();
        },
        { passive: false }
    );

    // Doble toque rápido fuera de controles = zoom en iOS
    let lastTouchEnd = 0;
    document.addEventListener(
        'touchend',
        (event) => {
            const now = Date.now();
            const target = event.target as HTMLElement | null;
            const interactive = target?.closest('a, button, input, select, textarea, label, [role="tab"]');
            if (!interactive && now - lastTouchEnd < 300) event.preventDefault();
            lastTouchEnd = now;
        },
        { passive: false }
    );
};
