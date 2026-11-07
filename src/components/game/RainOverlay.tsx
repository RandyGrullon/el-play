import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Lluvia a pantalla completa mientras el juego está detenido por lluvia: gotas inclinadas en tres capas (lejos:
// lentas, cortas y tenues; cerca: rápidas, largas y marcadas), salpicaduras abajo y un velo azul frío. No se toca
// (pointer-events: none): la página sigue usable debajo. Se pausa con la pestaña oculta.

interface Drop {
    x: number;
    y: number;
    layer: number;
    speed: number;
    len: number;
    /** Dónde revienta (las de las capas cercanas, abajo) */
    floor: number;
}

interface Splash {
    x: number;
    y: number;
    age: number;
    size: number;
}

// share: qué parte de las gotas; speed/len en px por cuadro de 60 Hz
const LAYERS = [
    { share: 0.45, speed: [7, 9], len: [7, 11], width: 0.8, alpha: 0.3 },
    { share: 0.35, speed: [11, 14], len: [13, 18], width: 1.1, alpha: 0.45 },
    { share: 0.2, speed: [16, 20], len: [20, 28], width: 1.6, alpha: 0.62 }
];
/** Cuánto se corre de lado por cada px que cae (el viento) */
const SLANT = 0.24;
const SPLASH_FRAMES = 24;
export const RAIN_FADE_MS = 600;

const between = (min: number, max: number) => min + Math.random() * (max - min);
const dropCount = (width: number, height: number) => Math.round(Math.min(180, Math.max(120, (width * height) / 6000)));

const layerFor = (index: number, total: number) => {
    const at = index / total;
    return at < LAYERS[0].share ? 0 : at < LAYERS[0].share + LAYERS[1].share ? 1 : 2;
};

const makeDrop = (layer: number, width: number, height: number, anywhere: boolean): Drop => {
    const spec = LAYERS[layer];
    const len = between(spec.len[0], spec.len[1]);
    return {
        layer,
        len,
        speed: between(spec.speed[0], spec.speed[1]),
        // Caen hacia la derecha: nacen también un poco a la izquierda de la pantalla
        x: between(-height * SLANT, width),
        y: anywhere ? between(-len, height) : between(-height * 0.25, 0) - len,
        floor: layer === 0 ? height + len : height - between(4, 90)
    };
};

/** «r g b» de la variable --rain-drop (cambia con el tema) */
const dropColor = (node: Element) => (getComputedStyle(node).getPropertyValue('--rain-drop').trim() || '70 110 160').split(/[\s,]+/).map(Number);

const RainCanvas: React.FC = () => {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext?.('2d');
        if (!canvas || !ctx) return;
        let width = 0;
        let height = 0;
        let drops: Drop[] = [];
        let splashes: Splash[] = [];
        let rgb = dropColor(canvas);
        let raf = 0;
        let last = 0;
        let frames = 0;

        const resize = () => {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const count = dropCount(width, height);
            drops = Array.from({ length: count }, (_, index) => makeDrop(layerFor(index, count), width, height, true));
            splashes = [];
        };

        const frame = (time: number) => {
            // Las velocidades son por cuadro de 60 Hz: en una pantalla de 120 Hz (o un teléfono lento) se escalan con el tiempo
            const step = last ? Math.min(3, Math.max(0, time - last) / (1000 / 60)) : 1;
            last = time;
            frames += 1;
            if (frames % 60 === 0) rgb = dropColor(canvas);
            ctx.clearRect(0, 0, width, height);
            ctx.lineCap = 'round';
            for (let layer = 0; layer < LAYERS.length; layer++) {
                const spec = LAYERS[layer];
                ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${spec.alpha})`;
                ctx.lineWidth = spec.width;
                ctx.beginPath();
                for (let index = 0; index < drops.length; index++) {
                    const drop = drops[index];
                    if (drop.layer !== layer) continue;
                    drop.y += drop.speed * step;
                    drop.x += drop.speed * SLANT * step;
                    if (drop.y >= drop.floor) {
                        // Las de cerca revientan contra el piso (no todas, para que no sea un tapiz de anillos)
                        if (layer > 0 && Math.random() < (layer === 2 ? 0.5 : 0.22)) splashes.push({ x: drop.x, y: drop.floor, age: 0, size: layer === 2 ? between(7, 12) : between(4, 7) });
                        drops[index] = makeDrop(layer, width, height, false);
                        continue;
                    }
                    ctx.moveTo(drop.x, drop.y);
                    ctx.lineTo(drop.x - drop.len * SLANT, drop.y - drop.len);
                }
                ctx.stroke();
            }
            // Salpicaduras: un anillo aplastado que se abre y se apaga
            ctx.lineWidth = 1;
            splashes = splashes.filter((splash) => splash.age < SPLASH_FRAMES);
            for (const splash of splashes) {
                splash.age += step;
                const progress = Math.min(1, splash.age / SPLASH_FRAMES);
                const radius = 1 + splash.size * progress;
                ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${0.45 * (1 - progress)})`;
                ctx.beginPath();
                ctx.ellipse(splash.x, splash.y, radius, radius * 0.32, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            raf = requestAnimationFrame(frame);
        };

        const start = () => {
            cancelAnimationFrame(raf);
            last = 0;
            raf = requestAnimationFrame(frame);
        };
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') cancelAnimationFrame(raf);
            else start();
        };

        resize();
        if (document.visibilityState !== 'hidden') start();
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
};

/**
 * Con `active` aparece en ~600 ms; al apagarse (la quitan o el juego se reanuda) se desvanece igual y se desmonta
 * (el lienzo deja de dibujar).
 */
export const RainOverlay: React.FC<{ active: boolean }> = ({ active }) => {
    const [mounted, setMounted] = useState(active);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (active) {
            setMounted(true);
            // Un cuadro después de montarse, para que la transición arranque desde 0
            const timer = window.setTimeout(() => setVisible(true), 30);
            return () => window.clearTimeout(timer);
        }
        setVisible(false);
        const timer = window.setTimeout(() => setMounted(false), RAIN_FADE_MS + 50);
        return () => window.clearTimeout(timer);
    }, [active]);

    if (!mounted) return null;
    return createPortal(
        <div className="rain-overlay" style={{ opacity: visible ? 1 : 0 }} aria-hidden="true" data-testid="rain-overlay">
            <RainCanvas />
        </div>,
        document.body
    );
};
