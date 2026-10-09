import React, { useEffect, useId, useRef, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ball, BALL, PLATE_PATH } from './Logo';

const MIN_MS = 1500; // lo que dura la animación completa
const MAX_MS = 3500; // nunca tapar la app más de esto aunque la red esté lenta
const EXIT_MS = 380;
const WORD = ['E', 'L', ' ', 'P', 'L', 'A', 'Y'];

// Pantalla de entrada: aparece el plato, la pelota cae girando como un lanzamiento, rebota con un
// destello y entra el nombre letra por letra. Se va cuando terminó la animación y cargaron los datos.
export const Splash: React.FC = () => {
    const { t } = useTranslation();
    const id = useId().replace(/:/g, '');
    const fetching = useIsFetching();
    const started = useRef(Date.now());
    const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>('show');

    useEffect(() => {
        if (phase !== 'show') return;
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const tick = () => {
            const elapsed = Date.now() - started.current;
            if ((elapsed >= (reduced ? 400 : MIN_MS) && fetching === 0) || elapsed >= MAX_MS) setPhase('leave');
        };
        tick();
        const interval = setInterval(tick, 100);
        return () => clearInterval(interval);
    }, [fetching, phase]);

    useEffect(() => {
        if (phase !== 'leave') return;
        const timeout = setTimeout(() => setPhase('gone'), EXIT_MS);
        return () => clearTimeout(timeout);
    }, [phase]);

    if (phase === 'gone') return null;

    return (
        <div
            className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg ${phase === 'leave' ? 'splash-leave' : ''}`}
            role="status"
            aria-label={t('splash.loading')}
        >
            <div className="relative">
                <svg width={132} height={132} viewBox="0 0 64 64" className="overflow-visible" aria-hidden="true">
                    <defs>
                        <linearGradient id={`splash-plate-${id}`} x1="8" y1="5" x2="56" y2="57" gradientUnits="userSpaceOnUse">
                            <stop offset="0" stopColor="#1e4fd8" />
                            <stop offset="0.55" stopColor="#1e3a8a" />
                            <stop offset="1" stopColor="#d61f3a" />
                        </linearGradient>
                    </defs>
                    <g className="splash-plate">
                        <path d={PLATE_PATH} fill={`url(#splash-plate-${id})`} />
                        <path d={PLATE_PATH} fill="none" stroke="#fff" strokeOpacity={0.18} strokeWidth={1.2} />
                    </g>
                    <circle className="splash-impact" cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill="none" stroke="#fff" strokeWidth={1.5} />
                    <g className="splash-drop">
                        <Ball className="splash-spin" />
                    </g>
                </svg>
            </div>

            <p className="display mt-5 flex text-[42px] leading-none tracking-[0.06em]" aria-hidden="true">
                {WORD.map((letter, index) => (
                    <span
                        key={index}
                        className={`splash-letter ${index >= 3 ? 'text-accent-ink' : ''}`}
                        style={{ animationDelay: `${780 + index * 45}ms`, width: letter === ' ' ? '0.35em' : undefined }}
                    >
                        {letter}
                    </span>
                ))}
            </p>
            <p className="splash-tagline mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted">{t('splash.tagline')}</p>

            <div className="splash-tagline mt-8 h-[3px] w-28 overflow-hidden rounded-full bg-line/10">
                <div className="splash-progress h-full w-1/3 rounded-full bg-accent" />
            </div>
        </div>
    );
};
