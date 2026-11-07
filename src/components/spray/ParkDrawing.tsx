import React, { useId, useMemo } from 'react';
import { polar, wallAt, type Park } from '../../lib/flight';
import { SPRAY_RESULT_COLORS, svgPoint, wallPoints, type SprayResult } from '../../lib/spray';

// El parque del juego visto desde arriba y a escala (pies): cerca con sus medidas, pista de advertencia, grama con
// franjas, tierra del cuadro, bases, montículo, líneas y postes de foul, y anillos de 200/300/400 pies. Mismos colores
// que la vista del terreno (--fld-*): va dentro de un elemento con la clase `fld`.

const fill = (token: string) => ({ fill: `var(--fld-${token})` });
const poly = (points: { x: number; y: number }[]) => points.map((p) => `${svgPoint(p).x.toFixed(1)} ${svgPoint(p).y.toFixed(1)}`).join(' L');

const BASES = [polar(45, 90), polar(0, 127.3), polar(-45, 90)];

export const ParkDrawing: React.FC<{ park: Park }> = ({ park }) => {
    const id = useId().replace(/:/g, '');
    const geometry = useMemo(() => {
        const wall = wallPoints(park);
        const grass = wallPoints(park, 15);
        const fair = `M0 0 L${poly(wall)} Z`;
        const lawn = `M0 0 L${poly(grass)} Z`;
        const fence = `M${poly(wall)}`;
        const marks = ([-42, -22.5, 0, 22.5, 42] as const).map((deg, index) => {
            const value = [park.left, park.leftCenter, park.center, park.rightCenter, park.right][index];
            const at = svgPoint(polar(deg, wallAt(park, deg) - 27));
            return { deg, value, ...at };
        });
        return { fair, lawn, fence, marks, left: svgPoint(polar(-45, park.left)), right: svgPoint(polar(45, park.right)) };
    }, [park]);
    const mow = `${id}-mow`;
    const clip = `${id}-fair`;
    const dirt = svgPoint({ x: 0, y: 60.5 });
    return (
        <g aria-hidden="true">
            <defs>
                <pattern id={mow} width={48} height={48} patternUnits="userSpaceOnUse">
                    <rect width={24} height={48} style={fill('g1')} />
                    <rect x={24} width={24} height={48} style={fill('g2')} />
                </pattern>
                <clipPath id={clip}>
                    <path d={geometry.fair} />
                </clipPath>
            </defs>
            <path d={geometry.fair} style={fill('track')} />
            <path d={geometry.lawn} fill={`url(#${mow})`} />
            <path d={geometry.fence} fill="none" style={{ stroke: 'var(--fld-wall)' }} strokeWidth={6} strokeLinecap="round" />
            {/* Anillos de distancia */}
            <g fill="none" stroke="#ffffff" strokeOpacity={0.22} strokeWidth={1.4} strokeDasharray="5 6">
                {[200, 300, 400].map((r) => {
                    const a = svgPoint(polar(-45, r));
                    const b = svgPoint(polar(45, r));
                    return <path key={r} d={`M${a.x} ${a.y} A${r} ${r} 0 0 1 ${b.x} ${b.y}`} />;
                })}
            </g>
            <g fill="#ffffff" fillOpacity={0.5} fontSize={11} fontWeight={700} textAnchor="middle">
                {[200, 300, 400].map((r) => {
                    const p = svgPoint(polar(38, r));
                    return (
                        <text key={r} x={p.x} y={p.y - 3}>
                            {r}
                        </text>
                    );
                })}
            </g>
            {/* Cuadro: la tierra, la grama de adentro, home, bases y montículo */}
            <g clipPath={`url(#${clip})`}>
                <circle cx={dirt.x} cy={dirt.y} r={95} style={fill('dirt')} />
            </g>
            <path d="M0 -8.9 L54.7 -63.6 L0 -118.4 L-54.7 -63.6 Z" fill={`url(#${mow})`} />
            <circle cx={0} cy={0} r={13} style={fill('dirt')} />
            <circle cx={dirt.x} cy={dirt.y} r={9} style={fill('dirt')} />
            <g style={{ stroke: 'var(--fld-line)' }} strokeWidth={2} fill="none">
                <line x1={0} y1={0} x2={geometry.left.x} y2={geometry.left.y} />
                <line x1={0} y1={0} x2={geometry.right.x} y2={geometry.right.y} />
            </g>
            {/* Postes de foul */}
            <circle cx={geometry.left.x} cy={geometry.left.y} r={4} fill="#facc15" stroke="#ffffff" strokeWidth={1} />
            <circle cx={geometry.right.x} cy={geometry.right.y} r={4} fill="#facc15" stroke="#ffffff" strokeWidth={1} />
            {BASES.map((base) => {
                const p = svgPoint(base);
                return <rect key={`${p.x}${p.y}`} x={p.x - 3.6} y={p.y - 3.6} width={7.2} height={7.2} fill="#ffffff" transform={`rotate(45 ${p.x} ${p.y})`} />;
            })}
            <path d="M-3.6 -1 L3.6 -1 L3.6 2.6 L0 5.4 L-3.6 2.6 Z" fill="#ffffff" />
            <rect x={-4} y={-61.5} width={8} height={2} fill="#ffffff" />
            {/* Medidas de la cerca */}
            <g fill="#ffffff" fillOpacity={0.9} fontSize={15} fontWeight={800} textAnchor="middle" dominantBaseline="middle">
                {geometry.marks.map((mark) => (
                    <text key={mark.deg} x={mark.x} y={mark.y}>
                        {mark.value}
                    </text>
                ))}
            </g>
        </g>
    );
};

/** Dónde cayó: color por resultado (el out es un aro hueco) y un halo suave en el jonrón */
export const ResultMarker: React.FC<{ result: SprayResult; x: number; y: number; r: number; glowId?: string }> = ({ result, x, y, r, glowId }) => (
    <>
        {result === 'hr' && glowId && <circle cx={x} cy={y} r={r * 3} fill={`url(#${glowId})`} />}
        {result === 'out' ? (
            <circle cx={x} cy={y} r={r - 1} fill="rgb(0 0 0 / 0.18)" stroke={SPRAY_RESULT_COLORS.out} strokeWidth={2.4} />
        ) : (
            <circle cx={x} cy={y} r={r} fill={SPRAY_RESULT_COLORS[result]} stroke="#ffffff" strokeWidth={1.6} />
        )}
    </>
);

/** El degradado del halo del jonrón (va una vez dentro del <svg>) */
export const GlowDef: React.FC<{ id: string }> = ({ id }) => (
    <defs>
        <radialGradient id={id}>
            <stop offset="0%" stopColor={SPRAY_RESULT_COLORS.hr} stopOpacity={0.55} />
            <stop offset="100%" stopColor={SPRAY_RESULT_COLORS.hr} stopOpacity={0} />
        </radialGradient>
    </defs>
);
