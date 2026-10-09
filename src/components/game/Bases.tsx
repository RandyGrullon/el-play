import React from 'react';

interface BasesProps {
    runners: { first: unknown; second: unknown; third: unknown };
    size?: number;
    color?: string;
    className?: string;
}

// Diamante con las tres bases; las ocupadas en el color del equipo al bate
export const Bases: React.FC<BasesProps> = ({ runners, size = 28, color = 'rgb(var(--accent))', className = '' }) => {
    const base = (x: number, y: number, on: boolean, key: string) => (
        <rect
            key={key}
            x={x - 5}
            y={y - 5}
            width={10}
            height={10}
            rx={1.5}
            transform={`rotate(45 ${x} ${y})`}
            fill={on ? color : 'transparent'}
            stroke={on ? color : 'rgb(var(--faint))'}
            strokeWidth={1.6}
        />
    );
    return (
        <svg width={size} height={size * 0.8} viewBox="0 0 40 32" className={className} aria-hidden="true">
            {base(20, 7, !!runners.second, 'second')}
            {base(32, 19, !!runners.first, 'first')}
            {base(8, 19, !!runners.third, 'third')}
        </svg>
    );
};

export const OutsDots: React.FC<{ outs: number; className?: string }> = ({ outs, className = '' }) => (
    <span className={`inline-flex gap-1 ${className}`} aria-label={`${outs} outs`}>
        {[0, 1, 2].map((index) => (
            <span key={index} className={`h-1.5 w-1.5 rounded-full ${index < outs ? 'bg-ink' : 'bg-line/20'}`} />
        ))}
    </span>
);
