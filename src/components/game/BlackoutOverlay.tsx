import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Juego detenido por falla eléctrica: las luces del play bajan del techo de la app, se balancean y parpadean al azar
// (cada foco por su cuenta, calculado en vivo: nunca se repite igual) y la app se queda a oscuras salvo la luz sobre el juego. No se toca (pointer-events: none). Estilos: .blackout en
// styles.css. Aparece y se va con un fundido, como la lluvia.

const FADE_MS = 600;
/** Cuando termina de bajar la torre empiezan a prender */
const LIGHTS_ON_MS = 1000;
/** Los primeros segundos: chispazos (fallan mucho más) */
const SPARKS_MS = 2200;

type Health = 'good' | 'bad' | 'dead';
/** Qué tan seguido falla cada foco en cada pasada (chispazo al prender / después) */
const FAIL: Record<Health, [number, number]> = { good: [0.45, 0.05], bad: [0.6, 0.28], dead: [0.5, 0.1] };

const between = (min: number, max: number) => min + Math.random() * (max - min);

/** Brillo de un foco en esta pasada */
const brightness = (health: Health, sparking: boolean) => {
    const fails = Math.random() < FAIL[health][sparking ? 0 : 1];
    if (health === 'dead') return fails ? between(0.4, 0.9) : between(0.04, 0.14);
    if (fails) return between(0, 0.35);
    return health === 'bad' ? between(0.7, 1) : between(0.9, 1);
};

/** Parpadeo al azar: cada 40–280 ms se decide de nuevo el brillo de cada foco; el cono de luz sigue al promedio */
const useRandomFlicker = (root: React.RefObject<HTMLDivElement | null>, on: boolean) => {
    useEffect(() => {
        const node = root.current;
        if (!on || !node) return;
        const bulbs = Array.from(node.querySelectorAll<SVGElement>('[data-bulb]'));
        const cone = node.querySelector<HTMLElement>('.blackout-cone');
        let timer = 0;
        let started = 0;
        const tick = () => {
            const sparking = Date.now() - started < SPARKS_MS;
            // De vez en cuando la planta no da: se cae todo un instante
            const dip = Math.random() < (sparking ? 0.12 : 0.03);
            let total = 0;
            for (const bulb of bulbs) {
                const level = dip ? between(0, 0.1) : brightness((bulb.dataset.bulb as Health) ?? 'good', sparking);
                bulb.setAttribute('opacity', level.toFixed(2));
                total += level;
            }
            if (cone) cone.style.opacity = (bulbs.length ? total / bulbs.length : 0).toFixed(2);
            timer = window.setTimeout(tick, dip ? between(60, 180) : between(40, 280));
        };
        const start = window.setTimeout(() => {
            started = Date.now();
            tick();
        }, LIGHTS_ON_MS);
        return () => {
            window.clearTimeout(start);
            window.clearTimeout(timer);
        };
    }, [root, on]);
};

// Banco de luces del play: una torre que baja del techo con dos filas de focos redondos; dos de ellos fallan más
// que los demás (uno casi apagado), como cuando la planta no da abasto
const Fixture: React.FC<{ x: number; y: number; state?: 'bad' | 'dead' }> = ({ x, y, state }) => (
    <g>
        <circle cx={x} cy={y} r="13" fill="#2b2f38" stroke="#14161b" strokeWidth="1.5" />
        <circle cx={x} cy={y} r="10" data-bulb={state ?? 'good'} fill="#f3f7ff" opacity="0" />
        <circle cx={x} cy={y} r="10" fill="none" stroke="#4a5060" strokeWidth="1" />
    </g>
);

const Lamp: React.FC = () => (
    <svg viewBox="0 0 120 104" width="150" height="130" aria-hidden="true">
        <rect x="56" y="0" width="8" height="40" fill="#2a2d36" />
        <rect x="8" y="36" width="104" height="6" rx="2" fill="#3a3e4b" />
        <rect x="8" y="68" width="104" height="6" rx="2" fill="#3a3e4b" />
        <rect x="56" y="36" width="8" height="40" fill="#2a2d36" />
        <Fixture x={24} y={50} />
        <Fixture x={60} y={50} state="bad" />
        <Fixture x={96} y={50} />
        <Fixture x={24} y={84} state="dead" />
        <Fixture x={60} y={84} />
        <Fixture x={96} y={84} state="bad" />
    </svg>
);

export const BlackoutOverlay: React.FC<{ active: boolean }> = ({ active }) => {
    const [mounted, setMounted] = useState(active);
    const [visible, setVisible] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    useRandomFlicker(root, mounted);

    useEffect(() => {
        if (active) {
            setMounted(true);
            const timer = window.setTimeout(() => setVisible(true), 30);
            return () => window.clearTimeout(timer);
        }
        setVisible(false);
        const timer = window.setTimeout(() => setMounted(false), FADE_MS + 50);
        return () => window.clearTimeout(timer);
    }, [active]);

    if (!mounted) return null;
    return createPortal(
        <div ref={root} className="blackout" style={{ opacity: visible ? 1 : 0 }} aria-hidden="true" data-testid="blackout-overlay">
            <div className="blackout-dark" />
            <div className="blackout-cone" />
            <div className="blackout-drop">
                <div className="blackout-sway">
                    <Lamp />
                </div>
            </div>
        </div>,
        document.body
    );
};
