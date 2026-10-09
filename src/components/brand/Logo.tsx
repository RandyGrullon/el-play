import React, { useId } from 'react';

// Marca de El Play: un home plate con los colores de la bandera dominicana y una pelota con sus costuras.
// Las mismas formas están en public/logo.svg y en scripts/make-icons.py (íconos de la PWA).

export const PLATE_PATH = 'M14 5h36a6 6 0 0 1 6 6v21.6a6 6 0 0 1-1.76 4.24L36.24 54.84a6 6 0 0 1-8.48 0L9.76 36.84A6 6 0 0 1 8 32.6V11a6 6 0 0 1 6-6z';
export const SEAM_LEFT = 'M23.4 17.4c3.1 2.6 4.8 5.8 4.8 9.3s-1.7 6.7-4.8 9.3';
export const SEAM_RIGHT = 'M40.6 17.4c-3.1 2.6-4.8 5.8-4.8 9.3s1.7 6.7 4.8 9.3';
export const BALL = { cx: 32, cy: 26.7, r: 13 };

export const Ball: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
    <g className={className} style={style}>
        <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill="#fff" />
        <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill="none" stroke="#0b1220" strokeOpacity={0.12} strokeWidth={1} />
        {[SEAM_LEFT, SEAM_RIGHT].map((d) => (
            <g key={d} fill="none" stroke="#e11d2e" strokeLinecap="round">
                <path d={d} strokeWidth={1.3} />
                <path d={d} strokeWidth={1.7} strokeDasharray="0.01 2.3" transform={`translate(${d === SEAM_LEFT ? -1.1 : 1.1} 0)`} />
            </g>
        ))}
    </g>
);

export const LogoMark: React.FC<{ size?: number; className?: string; withBall?: boolean; children?: React.ReactNode }> = ({ size = 28, className = '', withBall = true, children }) => {
    const id = useId().replace(/:/g, '');
    return (
        <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
            <defs>
                <linearGradient id={`plate-${id}`} x1="8" y1="5" x2="56" y2="57" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#1e4fd8" />
                    <stop offset="0.55" stopColor="#1e3a8a" />
                    <stop offset="1" stopColor="#d61f3a" />
                </linearGradient>
            </defs>
            <path d={PLATE_PATH} fill={`url(#plate-${id})`} />
            <path d={PLATE_PATH} fill="none" stroke="#fff" strokeOpacity={0.18} strokeWidth={1.2} />
            {withBall && <Ball />}
            {children}
        </svg>
    );
};

export const Logo: React.FC<{ size?: number }> = ({ size = 28 }) => (
    <span className="flex items-center gap-2">
        <LogoMark size={size} />
        <span className="display text-[22px] leading-none tracking-wide">
            EL <span className="text-accent-ink">PLAY</span>
        </span>
    </span>
);
