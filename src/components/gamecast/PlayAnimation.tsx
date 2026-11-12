import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { OutVariant, PlayEvent } from '../../lib/playEvents';
import { inkOn } from './GameHero';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { HomeRunFlight, homeRunFlightMs } from './HomeRunFlight';
import { legsOf, runnerPaths, walkPaths, type RunnerPath } from '../../lib/runners';
import { surname } from '../../lib/format';

// Animaciones de jugada en el juego en vivo: fin de entrada, ponche, hit, doble, triple, jonrón, base por bolas, robo,
// cambio de lanzador y cambio en el marcador, más la victoria (o el dejado en el terreno) al terminar el juego y el
// campeonato cuando ese juego da el título; con el logo y los colores del equipo protagonista. Se cierran solas o al
// tocarlas y no tapan la barra de abajo. Con «menos movimiento» en el sistema solo aparecen y desaparecen. La
// repetición de una jugada del historial sale encima de la hoja abierta y con la etiqueta «Repetición».

const HOLD: Record<PlayEvent['kind'], number> = {
    inning: 2800,
    k: 2300,
    single: 2120,
    double: 2340,
    triple: 2560,
    hr: 3300,
    win: 3400,
    champion: 6000,
    pinchHitter: 2800,
    pinchRunner: 2800,
    out: 2300,
    abs: 3000,
    walk: 2120,
    steal: 2700,
    pitchingChange: 3000,
    lead: 2800,
    walkoff: 4300,
    error: 2120
};

// Reto del ABS: la zona en pies (vista del receptor) dentro de un cuadro de 200×250, centrada (0,9 pies en y = 226)
const ABS_FT = 60;
const absX = (ft: number) => Math.min(188, Math.max(12, 100 + ft * ABS_FT));
const absY = (ft: number) => Math.min(232, Math.max(12, 226 - (ft - 0.9) * ABS_FT));

// Trayectoria de la bola en cada tipo de out (cuadro de 100×100, home abajo): puntos [x, y, tamaño] y dónde la atrapan
type Point = [number, number, number];
const OUT_PATHS: Record<OutVariant, { legs: Point[][]; outsAt: [number, number][]; runner?: [number, number][] }> = {
    ground: { legs: [[[50, 88, 1], [44, 76, 1], [40, 66, 1], [36, 58, 1]], [[36, 58, 1], [86, 52, 1]]], outsAt: [[86, 52]] },
    line: { legs: [[[50, 88, 1], [22, 42, 1]]], outsAt: [[22, 42]] },
    fly: { legs: [[[50, 88, 1], [50, 58, 2], [50, 28, 1.7], [50, 10, 1]]], outsAt: [[50, 10]] },
    pop: { legs: [[[50, 88, 1], [52, 72, 2.2], [56, 64, 1.7], [60, 62, 1]]], outsAt: [[60, 62]] },
    force: { legs: [[[50, 88, 1], [42, 70, 1], [36, 58, 1]], [[36, 58, 1], [50, 16, 1]]], outsAt: [[50, 16]] },
    dp: { legs: [[[50, 88, 1], [42, 70, 1], [36, 58, 1]], [[36, 58, 1], [50, 16, 1]], [[50, 16, 1], [86, 52, 1]]], outsAt: [[50, 16], [86, 52]] },
    tp: { legs: [[[50, 88, 1], [30, 66, 1], [14, 52, 1]], [[14, 52, 1], [50, 16, 1]], [[50, 16, 1], [86, 52, 1]]], outsAt: [[14, 52], [50, 16], [86, 52]] },
    sac: { legs: [[[50, 88, 1], [64, 56, 2], [74, 32, 1.6], [80, 20, 1]]], outsAt: [[80, 20]], runner: [[14, 52], [50, 88]] }
};
const LEG_MS = 340;
const BASES: [number, number][] = [
    [50, 88],
    [86, 52],
    [50, 16],
    [14, 52]
];

// El jonrón con el batazo marcado: el campo aparece, la bola sale a los 450 ms y la tarjeta espera a que caiga
const FLIGHT_DELAY = 450;

// Hits: los corredores salen a la vez (380 ms por base) cuando ya entró la tarjeta
const RUN_START = 620;
const RUN_LEG = 380;

// Robo: el corredor sale, el tiro llega a la base casi a la vez y después se sabe si fue quieto o out
const STEAL_START = 450;
const STEAL_RUN = 650;
const STEAL_THROW = 430;

/** Tamaño de la palabra grande según su renglón más largo (para que quepa al lado del diamante en un teléfono) */
const bigSize = (word: string) => {
    const longest = Math.max(...word.split('|').map((line) => line.length));
    return longest <= 4 ? 74 : longest <= 6 ? 54 : longest <= 8 ? 44 : longest <= 10 ? 32 : 28;
};

/** Puntos del diamante (cuadro de 100) que recorre un corredor; anotar es volver a home */
const routeOf = (path: Pick<RunnerPath, 'from' | 'to'>) => Array.from({ length: path.to - path.from + 1 }, (_, k) => BASES[(path.from + k) % 4]);

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const lastName = surname;

const Logo: React.FC<{ src: string; className: string }> = ({ src, className }) => (
    <img src={src} alt="" className={className} onError={(event) => (event.currentTarget.style.visibility = 'hidden')} />
);

export const PlayAnimation: React.FC<{ event: PlayEvent; onDone: () => void }> = ({ event, onDone }) => {
    const { t } = useTranslation();
    const root = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const doneRef = useRef(onDone);
    doneRef.current = onDone;

    const { kind, team, rival, atBat } = event;
    const on = inkOn(team.color);
    const second = team.color2 || on;
    const style = { '--pa-c': team.color, '--pa-on': on, '--pa-c-rival': rival.color } as React.CSSProperties;
    // Jonrón: cuánto vuela la bola (null si MLB no marcó dónde cayó: entonces va la curva de siempre)
    const flight = kind === 'hr' ? homeRunFlightMs(atBat) : null;
    const landAt = flight !== null ? FLIGHT_DELAY + flight : 0;
    // Hits y bases por bolas: quién corre y cuántas entran (del marcador; si no se sabe, las impulsadas)
    const rbi = atBat?.rbi ?? 0;
    const scored = event.runs ? event.runs.after - event.runs.before : rbi;
    const runner = kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'walk' || kind === 'error';
    // En la base por bolas solo entra carrera con las bases llenas; en el error corren como en un sencillo
    const hitPaths =
        kind === 'walk'
            ? walkPaths(event.bases ?? (scored > 0 ? { first: true, second: true, third: true } : null))
            : kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'error'
              ? runnerPaths(kind === 'error' ? 'single' : kind, event.bases ?? null, scored)
              : [];
    const runLegs = Math.max(0, ...hitPaths.map(legsOf));
    // Cambio en el marcador: de qué lado anotaron
    const leadSide = event.team.id === event.home.id ? 'home' : 'away';

    useEffect(() => {
        const node = root.current;
        if (!node) return;
        const reduce = reducedMotion();
        const q = (selector: string) => node.querySelector<HTMLElement | SVGElement>(selector);
        const all = (selector: string) => Array.from(node.querySelectorAll<HTMLElement>(selector));
        const anim = (el: Element | null, frames: Keyframe[], options: KeyframeAnimationOptions) => {
            if (!el) return;
            const used = reduce ? frames.map((frame) => ({ opacity: frame.opacity ?? 1, offset: frame.offset })) : frames;
            el.animate(used, { fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)', ...options });
        };
        const timers: number[] = [];
        let raf = 0;
        let closed = false;

        // Repetición: la etiqueta baja un poco después de que entra la jugada
        anim(q('.pa-replay'), [{ transform: 'translateY(-8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: 180 });

        if (runner) {
            const card = q('.pa-hitcard');
            anim(card, [{ transform: 'translateX(115%) skewX(-8deg)', opacity: 0 }, { transform: 'translateX(-3%) skewX(2deg)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 480 });
            anim(q('.pa-logo'), [{ transform: 'scale(0) rotate(-30deg)' }, { transform: 'scale(1.18) rotate(6deg)', offset: 0.7 }, { transform: 'none' }], { duration: 520, delay: 220 });
            all('.pa-big .pa-l').forEach((span, index) => anim(span, [{ transform: 'translateY(60%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: 300 + index * 60 }));
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 300, delay: 650 });
            // Todos corren a la vez: el bateador a su base, los que anotan cruzan home (+1 y sube el marcador) y el resto avanza
            let runs = 0;
            const score = () => {
                runs += 1;
                const total = q('.pa-rbi-n');
                if (total) total.textContent = `+${runs}`;
                anim(total, [{ opacity: 0.6, transform: 'scale(1.6)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.3,1.6,.5,1)' });
                anim(q('.pa-plus'), [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(-6px)', offset: 0.3 }, { opacity: 0, transform: 'translateY(-16px)' }], { duration: 700, easing: 'ease-out' });
                const scoreNode = q('.pa-score-n');
                if (scoreNode && event.runs) scoreNode.textContent = String(Math.min(event.runs.after, event.runs.before + runs));
                anim(scoreNode, [{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,1.6,.5,1)' });
            };
            hitPaths.forEach((path, index) => {
                const route = routeOf(path);
                const [x0, y0] = route[0];
                const node = q(`.pa-run-${index}`);
                const legs = legsOf(path);
                if (reduce) {
                    // Sin movimiento: cada uno ya en su base (los que anotaron no se ven)
                    const [x, y] = route[route.length - 1];
                    node?.setAttribute('transform', `translate(${x - x0} ${y - y0})`);
                    if (path.to === 4) node?.setAttribute('opacity', '0');
                } else {
                    anim(node, route.map(([x, y], k) => ({ transform: `translate(${x - x0}px, ${y - y0}px)`, offset: legs ? k / legs : 1 })), { duration: Math.max(1, RUN_LEG * legs), delay: RUN_START, easing: 'linear' });
                    if (path.to === 4) anim(node, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: RUN_START + RUN_LEG * legs });
                }
                if (path.to === 4) timers.push(window.setTimeout(score, reduce ? 0 : RUN_START + RUN_LEG * legs));
                else anim(q(`.pa-base-${path.to}`), [{ fillOpacity: 0.25 }, { fillOpacity: 1 }], { duration: 120, delay: RUN_START + RUN_LEG * legs });
            });
        } else if (kind === 'steal' && event.steal) {
            const { base, caught } = event.steal;
            const [x0, y0] = BASES[base - 1];
            const [x1, y1] = BASES[base % 4];
            // El tiro sale del receptor (o del lanzador, si se roban el home)
            const [bx, by] = base === 4 ? [50, 52] : BASES[0];
            const arrive = STEAL_START + STEAL_RUN;
            anim(q('.pa-hitcard'), [{ transform: 'translateX(115%) skewX(-8deg)', opacity: 0 }, { transform: 'translateX(-3%) skewX(2deg)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 480 });
            anim(q('.pa-logo'), [{ transform: 'scale(0) rotate(-30deg)' }, { transform: 'scale(1.18) rotate(6deg)', offset: 0.7 }, { transform: 'none' }], { duration: 520, delay: 220 });
            anim(q('.pa-kicker'), [{ opacity: 0 }, { opacity: 0.85 }], { duration: 260, delay: 260 });
            // Se barre al final: sale rápido y frena llegando a la base
            anim(q('.pa-runner'), [{ transform: 'none' }, { transform: `translate(${x1 - x0}px, ${y1 - y0}px)` }], { duration: STEAL_RUN, delay: STEAL_START, easing: 'cubic-bezier(.3,.1,.3,1)' });
            anim(q('.pa-ball'), [{ transform: 'none', opacity: 1 }, { transform: `translate(${x1 - bx}px, ${y1 - by}px)`, opacity: 1 }], { duration: STEAL_THROW, delay: arrive - STEAL_THROW - (caught ? 80 : -60), easing: 'linear' });
            if (caught) anim(q('.pa-mark-0'), [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.3)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: arrive + 40 });
            else if (base < 4) anim(q(`.pa-base-${base}`), [{ fillOpacity: 0.25 }, { fillOpacity: 1 }], { duration: 160, delay: arrive });
            else anim(q('.pa-score-n'), [{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 320, delay: arrive, easing: 'cubic-bezier(.3,1.6,.5,1)' });
            all('.pa-big .pa-l').forEach((span, index) => anim(span, [{ transform: 'scale(2)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, delay: arrive + 120 + index * 45, easing: 'cubic-bezier(.3,1.5,.5,1)' }));
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 260, delay: arrive + 380 });
        } else if (kind === 'hr' && flight !== null) {
            // El batazo de verdad: primero el vuelo sobre el parque y, al caer, el logo, «¡JONRÓN!» y el confeti
            anim(q('.pa-hr'), [{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
            if (!reduce) anim(q('.pa-rays'), [{ transform: 'rotate(0deg) scale(.6)' }, { transform: 'rotate(40deg) scale(1)' }], { duration: landAt + 2600, easing: 'ease-out' });
            anim(q('.hrf'), [{ opacity: 0, transform: 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 60 });
            anim(q('.pa-kicker'), [{ opacity: 0 }, { opacity: 0.85 }], { duration: 300, delay: 120 });
            anim(q('.pa-logo'), [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.6 }, { transform: 'scale(.95)', offset: 0.8 }, { transform: 'none', opacity: 1 }], { duration: 650, delay: landAt + 80 });
            all('.pa-big span').forEach((span, index) =>
                anim(span, [{ transform: 'translateY(-120%) scale(1.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, delay: landAt + 300 + index * 55, easing: 'cubic-bezier(.3,1.6,.5,1)' })
            );
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 300, delay: landAt + 800 });
            if (!reduce) timers.push(window.setTimeout(() => confetti(canvas.current, [team.color, second, '#ffffff'], () => closed), landAt + 250));
        } else if (kind === 'hr') {
            anim(q('.pa-hr'), [{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
            if (!reduce) anim(q('.pa-rays'), [{ transform: 'rotate(0deg) scale(.6)' }, { transform: 'rotate(40deg) scale(1)' }], { duration: 3600, easing: 'ease-out' });
            const trail = q('.pa-trail') as SVGPathElement | null;
            const ball = q('.pa-ball');
            if (trail && ball) {
                const length = trail.getTotalLength();
                anim(trail, [{ strokeDashoffset: length, opacity: 0 }, { strokeDashoffset: 0, opacity: 0.6 }], { duration: 900, delay: 100, easing: 'ease-in' });
                timers.push(window.setTimeout(() => anim(trail, [{ opacity: 0.6 }, { opacity: 0 }], { duration: 300 }), 1150));
                const start = performance.now() + 100;
                const fly = (now: number) => {
                    const p = Math.min(1, Math.max(0, (now - start) / 900));
                    const point = trail.getPointAtLength(length * (reduce ? 1 : p * p * (3 - 2 * p)));
                    ball.setAttribute('cx', String(point.x));
                    ball.setAttribute('cy', String(point.y));
                    if (p < 1 && !closed) raf = requestAnimationFrame(fly);
                };
                raf = requestAnimationFrame(fly);
            }
            anim(q('.pa-logo'), [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.6 }, { transform: 'scale(.95)', offset: 0.8 }, { transform: 'none', opacity: 1 }], { duration: 700, delay: 850 });
            all('.pa-big span').forEach((span, index) =>
                anim(span, [{ transform: 'translateY(-120%) scale(1.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, delay: 1150 + index * 55, easing: 'cubic-bezier(.3,1.6,.5,1)' })
            );
            anim(q('.pa-kicker'), [{ opacity: 0 }, { opacity: 0.85 }], { duration: 300, delay: 1000 });
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 300, delay: 1700 });
            if (!reduce) timers.push(window.setTimeout(() => confetti(canvas.current, [team.color, second, '#ffffff'], () => closed), 1150));
        } else if (kind === 'k') {
            anim(q('.pa-k-wrap'), [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
            anim(q('.pa-zone'), [{ opacity: 0, transform: 'scale(1.3)' }, { opacity: 0.9, transform: 'none', offset: 0.5 }, { opacity: 0.35, transform: 'none' }], { duration: 700, delay: 380 });
            anim(q('.pa-k'), [{ transform: 'scale(3.2) rotate(-14deg)', opacity: 0 }, { transform: 'scale(.92) rotate(2deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 150, easing: 'cubic-bezier(.5,0,.75,0)' });
            if (!reduce) {
                timers.push(
                    window.setTimeout(
                        () => q('.pa-k-wrap')?.animate([{ transform: 'none' }, { transform: 'translate(-6px,3px)' }, { transform: 'translate(5px,-3px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'none' }], { duration: 280 }),
                        440
                    )
                );
            }
            anim(q('.pa-logo'), [{ transform: 'translateX(-140%)' }, { transform: 'none' }], { duration: 420, delay: 600 });
            anim(q('.pa-label'), [{ opacity: 0, letterSpacing: '0.5em' }, { opacity: 1, letterSpacing: '0.08em' }], { duration: 420, delay: 700 });
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.85 }], { duration: 300, delay: 950 });
        } else if (kind === 'out' && event.out) {
            const path = OUT_PATHS[event.out.variant];
            anim(q('.pa-outcard'), [{ transform: 'translateX(-115%) skewX(8deg)', opacity: 0 }, { transform: 'translateX(3%) skewX(-2deg)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 420 });
            anim(q('.pa-logo'), [{ transform: 'scale(0)' }, { transform: 'scale(1.15)', offset: 0.7 }, { transform: 'none' }], { duration: 460, delay: 180 });
            // La bola recorre su camino tramo por tramo (un tramo por cada tiro)
            const frames = path.legs.flatMap((leg, legIndex) => leg.slice(legIndex ? 1 : 0)).map(([x, y, size]) => ({ transform: `translate(${x - 50}px, ${y - 88}px) scale(${size})` }));
            const total = path.legs.length * LEG_MS + (event.out.variant === 'fly' || event.out.variant === 'sac' ? 260 : 0);
            anim(q('.pa-ball'), frames, { duration: total, delay: 320, easing: 'linear' });
            // Cada out marcado en su base, en orden
            path.outsAt.forEach((_, index) => {
                const at = 320 + Math.round(((index + path.legs.length - path.outsAt.length + 1) / path.legs.length) * total);
                anim(q(`.pa-mark-${index}`), [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.3)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: at });
            });
            if (path.runner) anim(q('.pa-runner'), [{ transform: 'none' }, { transform: `translate(${path.runner[1][0] - path.runner[0][0]}px, ${path.runner[1][1] - path.runner[0][1]}px)` }], { duration: 420, delay: 320 + total });
            all('.pa-big span span').forEach((span, index) => anim(span, [{ transform: 'scale(2)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, delay: 320 + total + index * 50, easing: 'cubic-bezier(.3,1.5,.5,1)' }));
            all('.pa-out-dot.on').forEach((dot, index) => anim(dot, [{ transform: 'scale(.3)' }, { transform: 'scale(1.3)', offset: 0.6 }, { transform: 'none' }], { duration: 320, delay: 380 + total + index * 80 }));
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 260, delay: 420 + total });
        } else if (kind === 'pinchHitter' || kind === 'pinchRunner' || kind === 'pitchingChange') {
            anim(q('.pa-subcard'), [{ transform: 'translateY(-130%)', opacity: 0 }, { transform: 'translateY(4%)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 460 });
            all('.pa-big span').forEach((span, index) => anim(span, [{ transform: 'translateY(60%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, delay: 260 + index * 50 }));
            anim(q('.pa-out'), [{ transform: 'none', opacity: 1, filter: 'grayscale(0)' }, { transform: 'translateX(-6px) scale(.9)', opacity: 0.5, filter: 'grayscale(1)' }], { duration: 500, delay: 800 });
            anim(q('.pa-arrows'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' }], { duration: 600, delay: 700, easing: 'cubic-bezier(.6,0,.2,1)' });
            anim(q('.pa-in'), [{ transform: 'translateX(70px) scale(.6)', opacity: 0 }, { transform: 'translateX(-4px) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 560, delay: 950 });
        } else if (kind === 'win' || kind === 'walkoff') {
            const walkoff = kind === 'walkoff';
            anim(q('.pa-win'), [{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }, { clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }], { duration: 520, easing: 'cubic-bezier(.7,0,.2,1)' });
            anim(q('.pa-logo'), [{ transform: 'scale(0) rotate(-20deg)', opacity: 0 }, { transform: 'scale(1.2) rotate(4deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 600, delay: 380 });
            if (walkoff) {
                // En el terreno: las letras caen de golpe, la pantalla tiembla y salen dos ráfagas de papelitos
                anim(q('.pa-kicker'), [{ opacity: 0, letterSpacing: '0.5em' }, { opacity: 0.9, letterSpacing: '0.14em' }], { duration: 420, delay: 300 });
                all('.pa-big .pa-l').forEach((span, index) =>
                    anim(span, [{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(.94)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 360, delay: 640 + index * 35, easing: 'cubic-bezier(.5,0,.75,0)' })
                );
                if (!reduce) {
                    timers.push(
                        window.setTimeout(
                            () => q('.pa-win')?.animate([{ transform: 'none' }, { transform: 'translate(-7px,4px)' }, { transform: 'translate(6px,-4px)' }, { transform: 'translate(-4px,2px)' }, { transform: 'none' }], { duration: 300 }),
                            1000
                        )
                    );
                    timers.push(window.setTimeout(() => confetti(canvas.current, [team.color, second, '#ffffff'], () => closed, 90), 1000));
                    timers.push(window.setTimeout(() => confetti(canvas.current, [team.color, second, '#ffffff'], () => closed, 70), 2200));
                }
            } else {
                all('.pa-big .pa-l').forEach((span, index) => anim(span, [{ transform: 'translateY(80%) rotate(6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, delay: 620 + index * 50, easing: 'cubic-bezier(.3,1.5,.5,1)' }));
                if (!reduce) timers.push(window.setTimeout(() => confetti(canvas.current, [team.color, second, '#ffffff'], () => closed, 70), 700));
            }
            anim(q('.pa-scoreline'), [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: walkoff ? 1300 : 1100 });
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 300, delay: walkoff ? 1600 : 1350 });
        } else if (kind === 'lead' && event.lead) {
            // Las dos mitades entran, el número del que anotó cambia y su mitad crece (en el empate quedan iguales)
            anim(q('.pa-lead-away'), [{ transform: 'translateX(-100%)' }, { transform: 'none' }], { duration: 380 });
            anim(q('.pa-lead-home'), [{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 380 });
            anim(q('.pa-lead-panel'), [{ transform: 'translateY(-24px) scale(.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: 300 });
            all('.pa-big .pa-l').forEach((span, index) =>
                anim(span, [{ transform: 'translateY(-90%) scale(1.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, delay: 520 + index * 40, easing: 'cubic-bezier(.3,1.6,.5,1)' })
            );
            const scoredNode = q('.pa-lead-scored');
            timers.push(
                window.setTimeout(() => {
                    if (scoredNode) scoredNode.textContent = String(event[leadSide].runs);
                }, reduce ? 0 : 760)
            );
            anim(scoredNode, [{ transform: 'none' }, { transform: 'scale(1.6)', offset: 0.45 }, { transform: 'none' }], { duration: 560, delay: 560, easing: 'cubic-bezier(.3,1.6,.5,1)' });
            if (event.lead.change !== 'tie') anim(q(`.pa-lead-${leadSide}`), [{ flexGrow: 1 }, { flexGrow: 1.7 }], { duration: 700, delay: 820 });
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 300, delay: 1100 });
        } else if (kind === 'abs' && event.abs) {
            anim(q('.pa-abs'), [{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
            anim(q('.pa-abs-head'), [{ transform: 'translateX(-30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: 120 });
            anim(q('.pa-abs-zone'), [{ transform: 'scale(1.25)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 160 });
            anim(q('.pa-abs-ball'), [{ transform: 'scale(0)' }, { transform: 'scale(1.5)', offset: 0.6 }, { transform: 'none' }], { duration: 420, delay: 420, easing: 'cubic-bezier(.3,1.6,.5,1)' });
            if (event.abs.phase === 'checking') {
                all('.pa-abs-title span').forEach((span, index) => anim(span, [{ transform: 'translateY(50%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, delay: 520 + index * 45 }));
            } else {
                // La zona destella en el color de la decisión y la palabra cae letra por letra
                anim(q('.pa-abs-box'), [{ strokeWidth: 2 }, { strokeWidth: 6, offset: 0.4 }, { strokeWidth: 2.5 }], { duration: 620, delay: 600 });
                anim(q('.pa-abs-verdict'), [{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'scale(.94)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 640, easing: 'cubic-bezier(.5,0,.75,0)' });
                all('.pa-abs-call span').forEach((span, index) => anim(span, [{ transform: 'translateY(-110%) scale(1.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, delay: 900 + index * 55, easing: 'cubic-bezier(.3,1.6,.5,1)' }));
            }
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 300, delay: event.abs.phase === 'checking' ? 900 : 1300 });
        } else if (kind === 'champion') {
            anim(q('.pa-champ'), [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
            if (!reduce) anim(q('.pa-glow'), [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 0.9, offset: 0.5 }, { transform: 'scale(1)', opacity: 0.7 }], { duration: 1600, delay: 200 });
            anim(q('.pa-trophy'), [{ transform: 'translateY(90px) scale(.6)', opacity: 0 }, { transform: 'translateY(-6px) scale(1.04)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 900, delay: 300, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
            anim(q('.pa-logo'), [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.3)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 600, delay: 1050 });
            all('.pa-big span').forEach((span, index) => anim(span, [{ transform: 'translateY(-90%) scale(1.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: 1300 + index * 60, easing: 'cubic-bezier(.3,1.6,.5,1)' }));
            anim(q('.pa-kicker'), [{ opacity: 0, letterSpacing: '0.5em' }, { opacity: 0.9, letterSpacing: '0.14em' }], { duration: 500, delay: 1900 });
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 400, delay: 2200 });
            if (!reduce) {
                const colors = [team.color, second, '#f2c14e', '#ffe08a', '#ffffff'];
                timers.push(window.setTimeout(() => confetti(canvas.current, colors, () => closed, 140, true), 1250));
                timers.push(window.setTimeout(() => confetti(canvas.current, colors, () => closed, 120, true), 2700));
                timers.push(window.setTimeout(() => confetti(canvas.current, colors, () => closed, 120, true), 4100));
            }
        } else {
            anim(q('.pa-shutter-l'), [{ transform: 'translateX(-100%)' }, { transform: 'none' }], { duration: 380 });
            anim(q('.pa-shutter-r'), [{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 380 });
            anim(q('.pa-panel'), [{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, delay: 360 });
            anim(q('.pa-next-logo'), [{ transform: 'translateY(30px) scale(.4)', opacity: 0 }, { transform: 'translateY(-8px) scale(1.1)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 560, delay: 900 });
        }

        // Salida (sola al terminar o al tocar)
        const close = () => {
            if (closed) return;
            closed = true;
            const out = 380;
            anim(q('.pa-replay'), [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
            if (runner || kind === 'steal') {
                anim(q('.pa-hitcard'), [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-115%) skewX(8deg)', opacity: 0 }], { duration: out });
            } else if (kind === 'pinchHitter' || kind === 'pinchRunner' || kind === 'pitchingChange') {
                anim(q('.pa-subcard'), [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-130%)', opacity: 0 }], { duration: out });
            } else if (kind === 'lead') {
                anim(q('.pa-lead-panel'), [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
                anim(q('.pa-lead-away'), [{ transform: 'none' }, { transform: 'translateX(-100%)' }], { duration: out, delay: 120 });
                anim(q('.pa-lead-home'), [{ transform: 'none' }, { transform: 'translateX(100%)' }], { duration: out, delay: 120 });
            } else if (kind === 'out') {
                anim(q('.pa-outcard'), [{ transform: 'none', opacity: 1 }, { transform: 'translateX(115%) skewX(-8deg)', opacity: 0 }], { duration: out });
            } else if (kind === 'inning') {
                anim(q('.pa-panel'), [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
                anim(q('.pa-shutter-l'), [{ transform: 'none' }, { transform: 'translateX(-100%)' }], { duration: out, delay: 120 });
                anim(q('.pa-shutter-r'), [{ transform: 'none' }, { transform: 'translateX(100%)' }], { duration: out, delay: 120 });
            } else {
                anim(node.firstElementChild, [{ opacity: 1 }, { opacity: 0 }], { duration: out });
            }
            timers.push(window.setTimeout(() => doneRef.current(), out + 160));
        };
        node.addEventListener('click', close);
        const hold =
            kind === 'out' && event.out
                ? HOLD.out + (OUT_PATHS[event.out.variant].legs.length - 1) * LEG_MS
                : flight !== null
                  ? landAt + 2900
                  : hitPaths.length
                    ? Math.max(HOLD[kind], RUN_START + runLegs * RUN_LEG + 1300)
                    : kind === 'abs' && event.abs?.phase === 'checking'
                      ? 2600
                      : HOLD[kind];
        // Con menos movimiento el jonrón sale ya caído: un poco más de tiempo para leer la distancia
        timers.push(window.setTimeout(close, reduce ? Math.min(hold, flight !== null ? 3200 : 1600) : hold));

        return () => {
            closed = true;
            node.removeEventListener('click', close);
            timers.forEach((timer) => window.clearTimeout(timer));
            cancelAnimationFrame(raf);
        };
    }, [kind, team.color, second]);

    const letters = (word: string) =>
        [...word].map((char, index) => (
            <span key={index} className="pa-l inline-block">
                {char === ' ' ?' ' : char}
            </span>
        ));

    /** La palabra grande en uno o dos renglones («BASE|POR BOLAS») */
    const big = (word: string, size = bigSize(word)) => (
        <div className="pa-big flex flex-col" style={{ fontSize: size }}>
            {word.split('|').map((line, index) => (
                <span key={index} className="flex">
                    {letters(line)}
                </span>
            ))}
        </div>
    );

    let body: React.ReactNode;
    if (runner) {
        const word = kind === 'walk' ? t(`anim.walk_${event.walk ?? 'bb'}`) : t(`anim.${kind}`);
        body = (
            <div className="pa-hitcard" style={style}>
                <div className="pa-stripes" />
                <Logo src={team.logo} className="pa-logo" />
                <div className="relative min-w-0">
                    <div className="pa-kicker">
                        {team.abbrev} · {atBat?.batter.name}
                    </div>
                    {kind === 'walk' ? big(word) : <div className="pa-big flex text-[74px]">{letters(word)}</div>}
                    <div className="pa-sub flex flex-wrap items-center gap-x-2">
                        <span>
                            {rbi > 0
                                ? t('anim.drivesIn', { count: rbi })
                                : kind === 'error'
                                  ? t(event.reach === 'interference' ? 'anim.reachInterference' : 'anim.reachError')
                                  : t('anim.vs', { pitcher: atBat?.pitcher.name ?? '' })}
                        </span>
                        {event.runs && event.runs.after > event.runs.before && (
                            <span className="pa-score">
                                {team.abbrev} <b className="pa-score-n">{event.runs.before}</b>
                            </span>
                        )}
                    </div>
                </div>
                <svg viewBox="0 0 100 100" className="relative h-[92px] w-[92px] overflow-visible" aria-label={rbi > 0 ? t('anim.drivesIn', { count: rbi }) : undefined} role={rbi > 0 ? 'img' : undefined} aria-hidden={rbi > 0 ? undefined : true}>
                    <path d="M50 88 L86 52 L50 16 L14 52 Z" fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={3} />
                    {BASES.slice(1).map(([x, y], index) => (
                        <rect key={index} className={`pa-base-${index + 1}`} x={x - 8} y={y - 8} width={16} height={16} transform={`rotate(45 ${x} ${y})`} fill="currentColor" fillOpacity={0.25} />
                    ))}
                    {/* Carreras que entran: el total en el centro del diamante y un «+1» que salta en home */}
                    <text className="pa-rbi-n" x={50} y={60} textAnchor="middle" fontSize={26} fontWeight={800} fill="currentColor" opacity={scored > 0 ? 1 : 0} style={{ fontFamily: "'Barlow Condensed', 'Outfit', sans-serif", transformBox: 'fill-box', transformOrigin: 'center' }}>
                        {scored > 0 ? '+0' : ''}
                    </text>
                    <text className="pa-plus" x={50} y={80} textAnchor="middle" fontSize={15} fontWeight={900} fill="currentColor" opacity={0}>
                        +1
                    </text>
                    {hitPaths.map((path, index) => (
                        <circle key={index} className={`pa-run-${index}`} cx={BASES[path.from][0]} cy={BASES[path.from][1]} r={path.batter ? 7 : 6} fill="#fff" stroke={second} strokeWidth={2} />
                    ))}
                </svg>
            </div>
        );
    } else if (kind === 'steal' && event.steal) {
        const { base, caught, runner: who } = event.steal;
        const [x0, y0] = BASES[base - 1];
        const [x1, y1] = BASES[base % 4];
        const [bx, by] = base === 4 ? [50, 52] : BASES[0];
        const home = base === 4 && !caught;
        body = (
            <div className="pa-hitcard" style={style}>
                <div className="pa-stripes" />
                <Logo src={team.logo} className="pa-logo" />
                <div className="relative min-w-0">
                    <div className="pa-kicker">
                        {team.abbrev} · {t(caught ? `anim.caughtTo_${base}` : `anim.stealTo_${base}`)}
                    </div>
                    {big(t(caught ? 'anim.caught' : 'anim.steal'))}
                    <div className="pa-sub flex flex-wrap items-center gap-x-2">
                        <span className="truncate">{who?.name ?? ''}</span>
                        {home && (
                            <span className="pa-score">
                                {t('anim.runScores')} <b className="pa-score-n">+1</b>
                            </span>
                        )}
                    </div>
                </div>
                <svg viewBox="0 0 100 100" className="relative h-[92px] w-[92px] overflow-visible" aria-hidden="true">
                    <path d="M50 88 L86 52 L50 16 L14 52 Z" fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={3} />
                    {BASES.slice(1).map(([x, y], index) => (
                        <rect key={index} className={`pa-base-${index + 1}`} x={x - 8} y={y - 8} width={16} height={16} transform={`rotate(45 ${x} ${y})`} fill="currentColor" fillOpacity={0.25} />
                    ))}
                    <circle className="pa-runner" cx={x0} cy={y0} r={7} fill="#fff" stroke={caught ? rival.color : second} strokeWidth={2.5} />
                    <circle className="pa-ball" cx={bx} cy={by} r={4} fill="#fff" stroke={on} strokeWidth={1.5} />
                    {caught && (
                        <g className="pa-mark-0" style={{ transformOrigin: `${x1}px ${y1}px` }} opacity={0}>
                            <circle cx={x1} cy={y1} r={13} fill="#fff" />
                            <path d={`M${x1 - 6} ${y1 - 6} L${x1 + 6} ${y1 + 6} M${x1 + 6} ${y1 - 6} L${x1 - 6} ${y1 + 6}`} stroke={team.color} strokeWidth={4.5} strokeLinecap="round" />
                        </g>
                    )}
                </svg>
            </div>
        );
    } else if (kind === 'hr') {
        const dist = atBat?.pitches.find((pitch) => pitch.hit?.dist)?.hit?.dist ?? null;
        const runsIn = Math.max(1, rbi);
        const what = runsIn >= 4 ? t('anim.grandSlam') : runsIn <= 1 ? t('anim.solo') : t('anim.hrRuns', { count: runsIn });
        body = (
            <div className={`pa-hr${flight !== null ? ' pa-hr-flight' : ''}`} style={style}>
                <div className="pa-rays" />
                {flight === null && (
                    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 340 430" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                        <path className="pa-trail" d="M30 400 Q 150 -60 330 70" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeDasharray="6 10" />
                        <circle className="pa-ball" r={11} cx={30} cy={400} fill="#fff" stroke={second} strokeWidth={2} />
                    </svg>
                )}
                <span className="pa-kicker relative">
                    {team.abbrev} · {atBat?.batter.name}
                </span>
                {flight !== null && (
                    <HomeRunFlight atBat={atBat} venue={event.venue} color={team.color} ink={on} accent={second} delay={FLIGHT_DELAY} reduce={reducedMotion()} bases={event.bases ?? null} scored={event.runs ? event.runs.after - event.runs.before : rbi} />
                )}
                <Logo src={team.logo} className="pa-logo" />
                <div className="pa-big relative flex text-[78px]">{letters(t('anim.hr'))}</div>
                <div className="pa-sub relative">{dist && dist > 200 ? `${what} · ${t('anim.feet', { ft: dist })}` : what}</div>
                <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
        );
    } else if (kind === 'k') {
        const lastPitch = atBat?.pitches[atBat.pitches.length - 1];
        const looking = lastPitch?.code === 'C';
        body = (
            <div className="pa-k-wrap" style={style}>
                <div className="pa-zone" />
                <Logo src={team.logo} className="pa-logo" />
                {/* Ponche cantado: la K al revés, como en la libreta de anotación */}
                <div style={looking ? { transform: 'scaleX(-1)' } : undefined}>
                    <div className="pa-k">K</div>
                </div>
                <div className="pa-label">{looking ? t('anim.kLooking') : t('anim.k')}</div>
                <div className="pa-sub relative px-6">
                    {t('anim.kSub', { pitcher: atBat?.pitcher.name ?? '', batter: lastName(atBat?.batter.name ?? ''), count: event.strikeouts ?? 1 })}
                </div>
            </div>
        );
    } else if (kind === 'out' && event.out) {
        const { variant, outs } = event.out;
        const path = OUT_PATHS[variant];
        const word = variant === 'dp' ? t('anim.doublePlay') : variant === 'tp' ? t('anim.triplePlay') : t('anim.outWord');
        body = (
            <div className="pa-outcard" style={style}>
                <div className="pa-stripes" />
                <Logo src={team.logo} className="pa-logo" />
                <div className="relative min-w-0">
                    <div className="pa-kicker">
                        {team.abbrev} · {t(`anim.outType.${variant}`)}
                    </div>
                    {/* «DOBLE PLAY» y «TRIPLE PLAY» en dos renglones para no tapar el cuadro */}
                    <div className={`pa-big flex flex-col ${variant === 'dp' || variant === 'tp' ? 'text-[40px]' : 'text-[74px]'}`}>
                        {word.split(' ').map((line, index) => (
                            <span key={index} className="flex">
                                {letters(line)}
                            </span>
                        ))}
                    </div>
                    <div className="pa-sub flex items-center gap-2">
                        <span className="truncate">{atBat?.batter.name}</span>
                        <span className="flex shrink-0 gap-1" aria-label={t('anim.outsCount', { count: outs })}>
                            {[1, 2, 3].map((n) => (
                                <span key={n} className={`pa-out-dot ${n <= outs ? 'on' : ''}`} />
                            ))}
                        </span>
                    </div>
                </div>
                <svg viewBox="0 0 100 100" className="relative h-[92px] w-[92px] overflow-visible" aria-hidden="true">
                    <path d="M50 88 L86 52 L50 16 L14 52 Z" fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={3} />
                    {[
                        [86, 52],
                        [50, 16],
                        [14, 52]
                    ].map(([x, y]) => (
                        <rect key={`${x}${y}`} x={x - 7} y={y - 7} width={14} height={14} transform={`rotate(45 ${x} ${y})`} fill="currentColor" fillOpacity={0.3} />
                    ))}
                    {path.runner && <circle className="pa-runner" cx={path.runner[0][0]} cy={path.runner[0][1]} r={6} fill="currentColor" />}
                    {path.outsAt.map(([x, y], index) => (
                        <g key={index} className={`pa-mark-${index}`} style={{ transformOrigin: `${x}px ${y}px` }} opacity={0}>
                            <circle cx={x} cy={y} r={13} fill="#fff" />
                            <path d={`M${x - 6} ${y - 6} L${x + 6} ${y + 6} M${x + 6} ${y - 6} L${x - 6} ${y + 6}`} stroke={team.color} strokeWidth={4.5} strokeLinecap="round" />
                        </g>
                    ))}
                    <circle className="pa-ball" cx={50} cy={88} r={5} fill="#fff" stroke={second} strokeWidth={1.5} style={{ transformOrigin: '50px 88px', transformBox: 'view-box' }} />
                </svg>
            </div>
        );
    } else if (kind === 'pinchHitter' || kind === 'pinchRunner' || kind === 'pitchingChange') {
        const pitching = kind === 'pitchingChange';
        const person = (who: { id: number | null; name: string } | null, label: string, cls: string, detail?: string | null) =>
            who && (
                <div className={`${cls} flex min-w-0 flex-col items-center gap-1 text-center`}>
                    <PlayerPhoto personId={who.id} name={who.name} size={64} background="rgba(255,255,255,0.9)" team={{ id: team.id, logo: team.logo, color: team.color }} />
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] opacity-80">{label}</span>
                    <span className="max-w-[120px] truncate text-sm font-bold leading-tight">{who.name}</span>
                    {detail && <span className="text-[11px] font-semibold tabular-nums opacity-80">{detail}</span>}
                </div>
            );
        // Lo que hizo en el juego el lanzador que sale
        const line = event.change?.line;
        const detail = line ? t(line.np ? 'anim.pitcherLineNp' : 'anim.pitcherLine', { ip: line.ip, k: line.k, np: line.np }) : null;
        const outgoing = pitching ? event.change?.out ?? null : event.sub?.out ?? null;
        const incoming = pitching ? event.change?.in ?? null : event.sub?.in ?? null;
        body = (
            <div className="pa-subcard" style={style}>
                <div className="pa-stripes" />
                <div className="relative flex items-end justify-between gap-2">
                    <div className="min-w-0">
                        <div className="pa-kicker">
                            {team.abbrev} · {t(pitching ? 'anim.pitchingChange' : kind === 'pinchHitter' ? 'anim.pinchHitter' : 'anim.pinchRunner')}
                        </div>
                        <div className="pa-big flex text-[54px]">{letters(t(pitching ? 'anim.reliever' : 'anim.sub'))}</div>
                    </div>
                    <Logo src={team.logo} className="pa-logo h-12 w-12 p-1.5" />
                </div>
                <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    {person(outgoing, t('anim.out'), 'pa-out', pitching ? detail : null)}
                    <svg viewBox="0 0 24 24" className="pa-arrows h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 9h14l-4-4M20 15H6l4 4" />
                    </svg>
                    {person(incoming, t('anim.in'), 'pa-in')}
                </div>
            </div>
        );
    } else if (kind === 'lead' && event.lead) {
        const { change, before } = event.lead;
        const half = (side: 'away' | 'home') => {
            const club = event[side];
            return (
                <div className={`pa-lead-half pa-lead-${side}`} style={{ background: club.color, color: inkOn(club.color) }}>
                    <Logo src={club.logo} className="pa-logo" />
                    <span className={`pa-lead-n ${side === leadSide ? 'pa-lead-scored' : ''}`}>{side === leadSide ? before[side] : club.runs}</span>
                    <span className="text-sm font-extrabold tracking-[0.12em]">{club.abbrev}</span>
                </div>
            );
        };
        body = (
            <div className="pa-lead" style={style}>
                {half('away')}
                {half('home')}
                <div className="pa-lead-panel">
                    <span className="pa-kicker">{team.name}</span>
                    {big(t(`anim.lead_${change}`), 50)}
                    <span className="pa-sub">{t(change === 'tie' ? 'anim.leadTie' : 'anim.leadAhead', { team: team.abbrev, runs: event[leadSide].runs, rival: rival.abbrev, rivalRuns: rival.runs })}</span>
                </div>
            </div>
        );
    } else if (kind === 'win' || kind === 'walkoff') {
        const walkoff = kind === 'walkoff';
        const inning = atBat?.inning ?? null;
        body = (
            <div className="pa-win" style={style}>
                <div className="pa-stripes" />
                <span className="pa-kicker relative">{walkoff && inning ? t('anim.walkoffKicker', { n: inning }) : t('anim.final')}</span>
                <Logo src={team.logo} className="pa-logo" />
                {walkoff ? <div className="relative">{big(t('anim.walkoff'), 64)}</div> : <div className="pa-big relative flex text-[76px]">{letters(t('anim.win'))}</div>}
                <div className="pa-scoreline relative">
                    <Logo src={event.away.logo} className="pa-mini-logo" />
                    <span>
                        {event.away.runs} – {event.home.runs}
                    </span>
                    <Logo src={event.home.logo} className="pa-mini-logo" />
                </div>
                <div className="pa-sub relative px-6">
                    {walkoff && atBat
                        ? t('anim.walkoffSub', { batter: atBat.batter.name, rival: rival.name })
                        : event.seriesRecord
                          ? t('anim.seriesLead', { team: team.name, wins: event.seriesRecord.wins, losses: event.seriesRecord.losses })
                          : team.name}
                </div>
                <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
        );
    } else if (kind === 'abs' && event.abs) {
        const { phase, overturned, call, original, by, player, remaining, pitch } = event.abs;
        const callName = (value: 'ball' | 'strike') => t(value === 'ball' ? 'anim.absBall' : 'anim.absStrike');
        const who = by && player ? t(`anim.absBy_${by}`, { name: player }) : t('anim.absByTeam', { team: team.name });
        // Dónde pasó el lanzamiento (si MLB no lo ubicó, al centro de la zona)
        const top = pitch.top ?? 3.4;
        const bot = pitch.bot ?? 1.6;
        const ball = { x: absX(pitch.x ?? 0), y: absY(pitch.z ?? (top + bot) / 2) };
        const zone = { x: absX(-17 / 24), y: absY(top), w: (17 / 12) * ABS_FT, h: (top - bot) * ABS_FT };
        const decided = phase === 'result' ? call : null;
        const stroke = decided === 'strike' ? '#ff5a5f' : decided === 'ball' ? '#34c778' : '#ffffff';
        body = (
            <div className={`pa-abs pa-abs-${phase}`} style={{ ...style, ['--scan' as string]: `${zone.h}px` }}>
                <div className="pa-abs-grid" />
                <div className="pa-abs-head">
                    <Logo src={team.logo} className="pa-logo" />
                    <span className="grid text-left">
                        <span className="pa-kicker">{t('anim.absKicker', { team: team.abbrev })}</span>
                        <span className="text-xs font-semibold opacity-80">{who}</span>
                    </span>
                </div>
                <svg className="pa-abs-zone" viewBox="0 0 200 250" aria-hidden="true">
                    {/* Esquinas de visor alrededor de la zona */}
                    {[
                        [zone.x - 10, zone.y - 10, 1, 1],
                        [zone.x + zone.w + 10, zone.y - 10, -1, 1],
                        [zone.x - 10, zone.y + zone.h + 10, 1, -1],
                        [zone.x + zone.w + 10, zone.y + zone.h + 10, -1, -1]
                    ].map(([x, y, sx, sy], index) => (
                        <path key={index} d={`M${x} ${y + 14 * sy}V${y}H${x + 14 * sx}`} fill="none" stroke="var(--pa-c)" strokeWidth={3} strokeLinecap="round" />
                    ))}
                    <rect className="pa-abs-box" x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx={3} fill="rgb(255 255 255 / 0.04)" stroke={stroke} strokeWidth={2.5} />
                    {[1, 2].map((k) => (
                        <g key={k} stroke="rgb(255 255 255 / 0.22)" strokeWidth={1}>
                            <line x1={zone.x + (zone.w * k) / 3} y1={zone.y} x2={zone.x + (zone.w * k) / 3} y2={zone.y + zone.h} />
                            <line x1={zone.x} y1={zone.y + (zone.h * k) / 3} x2={zone.x + zone.w} y2={zone.y + (zone.h * k) / 3} />
                        </g>
                    ))}
                    {phase === 'checking' && <line className="pa-abs-scan" x1={zone.x - 18} y1={zone.y} x2={zone.x + zone.w + 18} y2={zone.y} stroke="var(--pa-c)" strokeWidth={3} strokeLinecap="round" />}
                    <path d="M83 238h34v6l-17 6-17-6z" fill="rgb(255 255 255 / 0.5)" />
                    {phase === 'checking' && <circle className="pa-abs-ring" cx={ball.x} cy={ball.y} r={8} fill="none" stroke="#fff" strokeWidth={2} />}
                    <circle className="pa-abs-ball" cx={ball.x} cy={ball.y} r={8} fill="#fff" stroke={phase === 'result' ? stroke : 'var(--pa-c)'} strokeWidth={3} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                </svg>
                {phase === 'checking' ? (
                    <>
                        <div className="pa-abs-title">
                            <span className="flex">{letters(t('anim.absChecking'))}</span>
                            <span className="pa-abs-dots" aria-hidden="true">
                                <i />
                                <i style={{ animationDelay: '0.18s' }} />
                                <i style={{ animationDelay: '0.36s' }} />
                            </span>
                        </div>
                        <div className="pa-sub relative px-6">{t('anim.absCalled', { call: callName(original) })}</div>
                    </>
                ) : (
                    <>
                        <span className={`pa-abs-verdict ${overturned ? 'won' : ''}`}>{overturned ? t('anim.absOverturned') : t('anim.absConfirmed')}</span>
                        <div className={`pa-abs-call ${call} flex`}>{letters(callName(call).toUpperCase())}</div>
                        <div className="pa-sub relative px-6">
                            {overturned ? t('anim.absChange', { from: callName(original), to: callName(call) }) : t('anim.absStays', { call: callName(call) })}
                            {remaining !== null ? ` · ${t(overturned ? 'anim.absWon' : 'anim.absLost', { count: remaining, team: team.abbrev })}` : ''}
                        </div>
                    </>
                )}
            </div>
        );
    } else if (kind === 'champion') {
        body = (
            <div className="pa-champ" style={style}>
                <div className="pa-glow" />
                <div className="pa-trophy">
                    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
                        <defs>
                            <linearGradient id="pa-gold" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stopColor="#ffe08a" />
                                <stop offset="0.5" stopColor="#f2c14e" />
                                <stop offset="1" stopColor="#c8901f" />
                            </linearGradient>
                        </defs>
                        <path d="M32 14 L32 20 Q12 20 14 38 Q16 52 34 54" fill="none" stroke="url(#pa-gold)" strokeWidth={6} strokeLinecap="round" />
                        <path d="M88 14 L88 20 Q108 20 106 38 Q104 52 86 54" fill="none" stroke="url(#pa-gold)" strokeWidth={6} strokeLinecap="round" />
                        <path d="M28 10 H92 V38 Q92 70 60 74 Q28 70 28 38 Z" fill="url(#pa-gold)" />
                        <rect x={53} y={73} width={14} height={16} fill="url(#pa-gold)" />
                        <rect x={38} y={88} width={44} height={9} rx={3} fill="url(#pa-gold)" />
                        <rect x={30} y={97} width={60} height={13} rx={4} fill="#c8901f" />
                    </svg>
                    <Logo src={team.logo} className="pa-logo" />
                </div>
                <div className="pa-big pa-gold relative flex text-[68px]">{letters(t('anim.champions'))}</div>
                <span className="pa-kicker relative">{t(`anim.championOf.${event.league ?? 'lidom'}`)}</span>
                <div className="pa-sub relative">
                    {event.seriesRecord ? t('anim.seriesWon', { team: team.name, wins: event.seriesRecord.wins, losses: event.seriesRecord.losses }) : team.name}
                </div>
                <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
        );
    } else {
        const half = event.inning?.isTop ? 'top' : 'bottom';
        body = (
            <div className="pa-inning" style={style}>
                <div className="pa-shutter-l" />
                <div className="pa-shutter-r" />
                <div className="absolute inset-0 grid content-center justify-items-center text-center">
                    <div className="pa-panel">
                        <span className="pa-kicker">{t(`anim.inningEnd_${half}`, { n: event.inning?.n ?? '' })}</span>
                        <div className="pa-scoreline">
                            <Logo src={event.away.logo} className="pa-mini-logo" />
                            <span>
                                {event.away.runs} – {event.home.runs}
                            </span>
                            <Logo src={event.home.logo} className="pa-mini-logo" />
                        </div>
                        <span className="pa-kicker">{t('anim.nowBatting')}</span>
                        <Logo src={team.logo} className="pa-next-logo" />
                        <span className="text-lg font-extrabold">{team.name}</span>
                    </div>
                </div>
            </div>
        );
    }

    return createPortal(
        <div className={`pa-root${event.replay ? ' pa-root-replay' : ''}`} aria-live="polite">
            <div ref={root} className={`pa-stage${flight !== null ? ' pa-stage-tall' : ''}`} role="button" tabIndex={-1} aria-label={t('anim.close')}>
                {body}
                {event.replay && (
                    <span className="pa-replay">
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        {t('anim.replay')}
                    </span>
                )}
            </div>
        </div>,
        document.body
    );
};

/** Papelitos: de un estallido en el centro o, en el campeonato, lloviendo desde arriba para no tapar el trofeo.
 *  Varias ráfagas comparten un solo dibujo por lienzo (si cada una borrara el lienzo, parpadearían). */
interface Bit { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; g: number; until: number }
const systems = new WeakMap<HTMLCanvasElement, { bits: Bit[]; running: boolean }>();

const confetti = (canvas: HTMLCanvasElement | null, colors: string[], stopped: () => boolean, count = 110, rain = false) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx.scale(dpr, dpr);
    }
    const now = performance.now();
    const system = systems.get(canvas) ?? { bits: [], running: false };
    systems.set(canvas, system);
    for (let i = 0; i < count; i++) {
        system.bits.push({
            x: rain ? Math.random() * rect.width : rect.width / 2 + (Math.random() - 0.5) * 80,
            y: rain ? -20 - Math.random() * 120 : rect.height * 0.4,
            vx: rain ? (Math.random() - 0.5) * 2 : (Math.random() - 0.5) * 9,
            vy: rain ? 1 + Math.random() * 2 : -Math.random() * 9 - 3,
            r: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.3,
            w: 6 + Math.random() * 6,
            h: 4 + Math.random() * 4,
            c: colors[Math.floor(Math.random() * colors.length)],
            g: rain ? 0.05 : 0.22,
            until: now + (rain ? 3200 : 2200)
        });
    }
    if (system.running) return;
    system.running = true;
    // Las velocidades son por cuadro de 60 Hz: en una pantalla de 120 Hz (o un teléfono lento) se escalan con el tiempo
    let last = now;
    const frame = (time: number) => {
        const step = Math.min(3, Math.max(0, time - last) / (1000 / 60));
        last = time;
        ctx.clearRect(0, 0, rect.width, rect.height);
        system.bits = system.bits.filter((bit) => bit.until > time && bit.y < rect.height + 40);
        for (const bit of system.bits) {
            bit.vy += bit.g * step;
            bit.x += bit.vx * step;
            bit.y += bit.vy * step;
            bit.r += bit.vr * step;
            ctx.save();
            ctx.translate(bit.x, bit.y);
            ctx.rotate(bit.r);
            ctx.fillStyle = bit.c;
            ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
            ctx.restore();
        }
        if (system.bits.length && !stopped()) requestAnimationFrame(frame);
        else {
            ctx.clearRect(0, 0, rect.width, rect.height);
            system.bits = [];
            system.running = false;
        }
    };
    requestAnimationFrame(frame);
};
