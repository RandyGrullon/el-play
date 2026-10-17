import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { PlayEvent } from '../../lib/playEvents';
import { inkOn } from './GameHero';

// Animaciones de jugada en el juego en vivo (aprobadas en la vista previa): fin de entrada, ponche, hit, doble,
// triple y jonrón, con el logo y los colores del equipo protagonista. Se cierran solas o al tocarlas y no tapan
// la barra de abajo. Con «menos movimiento» en el sistema solo aparecen y desaparecen.

const HOLD: Record<PlayEvent['kind'], number> = { inning: 2800, k: 2300, single: 2120, double: 2340, triple: 2560, hr: 3300 };
const BASES: [number, number][] = [
    [50, 88],
    [86, 52],
    [50, 16],
    [14, 52]
];

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const lastName = (name: string) => name.split(' ').slice(-1)[0];

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

        if (kind === 'single' || kind === 'double' || kind === 'triple') {
            const bases = kind === 'single' ? 1 : kind === 'double' ? 2 : 3;
            const card = q('.pa-hitcard');
            anim(card, [{ transform: 'translateX(115%) skewX(-8deg)', opacity: 0 }, { transform: 'translateX(-3%) skewX(2deg)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 480 });
            anim(q('.pa-logo'), [{ transform: 'scale(0) rotate(-30deg)' }, { transform: 'scale(1.18) rotate(6deg)', offset: 0.7 }, { transform: 'none' }], { duration: 520, delay: 220 });
            all('.pa-big span').forEach((span, index) => anim(span, [{ transform: 'translateY(60%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: 300 + index * 60 }));
            anim(q('.pa-sub'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 300, delay: 650 });
            const path = BASES.slice(0, bases + 1);
            anim(
                q('.pa-runner'),
                path.map(([x, y], index) => ({ transform: `translate(${x - 50}px, ${y - 88}px)`, offset: index / bases })),
                { duration: 380 * bases, delay: 600, easing: 'linear' }
            );
            path.slice(1).forEach((_, index) => anim(q(`.pa-base-${index + 1}`), [{ fillOpacity: 0.25 }, { fillOpacity: 1 }], { duration: 120, delay: 600 + 380 * (index + 1) }));
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
            if (kind === 'single' || kind === 'double' || kind === 'triple') {
                anim(q('.pa-hitcard'), [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-115%) skewX(8deg)', opacity: 0 }], { duration: out });
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
        timers.push(window.setTimeout(close, reduce ? Math.min(HOLD[kind], 1600) : HOLD[kind]));

        return () => {
            closed = true;
            node.removeEventListener('click', close);
            timers.forEach((timer) => window.clearTimeout(timer));
            cancelAnimationFrame(raf);
        };
    }, [kind, team.color, second]);

    const letters = (word: string) =>
        [...word].map((char, index) => (
            <span key={index} className="inline-block">
                {char === ' ' ? ' ' : char}
            </span>
        ));

    let body: React.ReactNode;
    if (kind === 'single' || kind === 'double' || kind === 'triple') {
        const rbi = atBat?.rbi ?? 0;
        body = (
            <div className="pa-hitcard" style={style}>
                <div className="pa-stripes" />
                <Logo src={team.logo} className="pa-logo" />
                <div className="relative min-w-0">
                    <div className="pa-kicker">
                        {team.abbrev} · {atBat?.batter.name}
                    </div>
                    <div className="pa-big flex text-[74px]">{letters(t(`anim.${kind}`))}</div>
                    <div className="pa-sub">{rbi > 0 ? t('anim.rbi', { count: rbi }) : t('anim.vs', { pitcher: atBat?.pitcher.name ?? '' })}</div>
                </div>
                <svg viewBox="0 0 100 100" className="relative h-[92px] w-[92px]" aria-hidden="true">
                    <path d="M50 88 L86 52 L50 16 L14 52 Z" fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={3} />
                    {BASES.slice(1).map(([x, y], index) => (
                        <rect key={index} className={`pa-base-${index + 1}`} x={x - 8} y={y - 8} width={16} height={16} transform={`rotate(45 ${x} ${y})`} fill="currentColor" fillOpacity={0.25} />
                    ))}
                    <circle className="pa-runner" cx={50} cy={88} r={7} fill="#fff" stroke={second} strokeWidth={2} />
                </svg>
            </div>
        );
    } else if (kind === 'hr') {
        const rbi = atBat?.rbi ?? 1;
        const dist = atBat?.pitches.find((pitch) => pitch.hit?.dist)?.hit?.dist ?? null;
        const what = rbi >= 4 ? t('anim.grandSlam') : rbi <= 1 ? t('anim.solo') : t('anim.hrRuns', { count: rbi });
        body = (
            <div className="pa-hr" style={style}>
                <div className="pa-rays" />
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 340 430" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                    <path className="pa-trail" d="M30 400 Q 150 -60 330 70" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeDasharray="6 10" />
                    <circle className="pa-ball" r={11} cx={30} cy={400} fill="#fff" stroke={second} strokeWidth={2} />
                </svg>
                <span className="pa-kicker relative">
                    {team.abbrev} · {atBat?.batter.name}
                </span>
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
        <div className="pa-root" aria-live="polite">
            <div ref={root} className="pa-stage" role="button" tabIndex={-1} aria-label={t('anim.close')}>
                {body}
            </div>
        </div>,
        document.body
    );
};

/** Papelitos con los colores del equipo (solo en jonrón) */
const confetti = (canvas: HTMLCanvasElement | null, colors: string[], stopped: () => boolean) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const bits = Array.from({ length: 110 }, () => ({
        x: rect.width / 2 + (Math.random() - 0.5) * 80,
        y: rect.height * 0.4,
        vx: (Math.random() - 0.5) * 9,
        vy: -Math.random() * 9 - 3,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 4,
        c: colors[Math.floor(Math.random() * colors.length)]
    }));
    const t0 = performance.now();
    const frame = (now: number) => {
        ctx.clearRect(0, 0, rect.width, rect.height);
        for (const bit of bits) {
            bit.vy += 0.22;
            bit.x += bit.vx;
            bit.y += bit.vy;
            bit.r += bit.vr;
            ctx.save();
            ctx.translate(bit.x, bit.y);
            ctx.rotate(bit.r);
            ctx.fillStyle = bit.c;
            ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
            ctx.restore();
        }
        if (now - t0 < 2200 && !stopped()) requestAnimationFrame(frame);
        else ctx.clearRect(0, 0, rect.width, rect.height);
    };
    requestAnimationFrame(frame);
};
