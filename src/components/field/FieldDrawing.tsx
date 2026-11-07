import React, { useId } from 'react';
import { BASE_POINTS, FENCE_CENTER, FENCE_RADIUS, FIELD_H, FIELD_W, HOME, MOUND, ON_DECK_CIRCLES, POLES } from '../../lib/field';

// El terreno visto desde arriba: grama con franjas de podado, pista de advertencia, la tierra del cuadro, las bases,
// el montículo y las líneas de foul. Los colores salen de las variables --fld-* (styles.css), con su versión oscura.

const fill = (token: string) => ({ fill: `var(--fld-${token})` });

const FENCE = `M ${HOME.x} ${HOME.y} L ${POLES.left.x} ${POLES.left.y} A ${FENCE_RADIUS} ${FENCE_RADIUS} 0 0 1 ${POLES.right.x} ${POLES.right.y} Z`;
const WALL = `M ${POLES.left.x} ${POLES.left.y} A ${FENCE_RADIUS} ${FENCE_RADIUS} 0 0 1 ${POLES.right.x} ${POLES.right.y}`;
// La tierra del cuadro: un arco de 120 desde el montículo, de línea de foul a línea de foul
const INFIELD_DIRT = `M ${HOME.x} ${HOME.y} L 85.2 265.2 A 120 120 0 0 1 314.8 265.2 Z`;
// La grama del cuadro, un poco por dentro de las bases (lo que queda alrededor es el camino de tierra)
const INFIELD_GRASS = 'M 200 362 L 268 295 L 200 228 L 132 295 Z';
const PLATE = 'M 193.5 375 L 206.5 375 L 206.5 381 L 200 387 L 193.5 381 Z';

export const FieldDrawing: React.FC<{ className?: string }> = ({ className = '' }) => {
    const id = useId().replace(/:/g, '');
    const mow = `${id}-mow`;
    const fair = `${id}-fair`;
    const bases = [BASE_POINTS.first, BASE_POINTS.second, BASE_POINTS.third];
    return (
        <svg viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} className={className} aria-hidden="true" focusable="false">
            <defs>
                <pattern id={mow} width={44} height={FIELD_H} patternUnits="userSpaceOnUse">
                    <rect width={22} height={FIELD_H} style={fill('g1')} />
                    <rect x={22} width={22} height={FIELD_H} style={fill('g2')} />
                </pattern>
                <clipPath id={fair}>
                    <path d={FENCE} />
                </clipPath>
            </defs>

            {/* Territorio de foul y la pista de advertencia (la banda de tierra junto a la cerca) */}
            <rect width={FIELD_W} height={FIELD_H} rx={26} style={fill('foul')} />
            <path d={FENCE} style={fill('track')} />
            <g clipPath={`url(#${fair})`}>
                <circle cx={FENCE_CENTER.x} cy={FENCE_CENTER.y} r={FENCE_RADIUS - 12} fill={`url(#${mow})`} />
            </g>
            <path d={WALL} fill="none" style={{ stroke: 'var(--fld-wall)' }} strokeWidth={5} strokeLinecap="round" />

            {/* Cuadro */}
            <path d={INFIELD_DIRT} style={fill('dirt')} />
            <path d={INFIELD_GRASS} fill={`url(#${mow})`} />
            <circle cx={HOME.x} cy={HOME.y} r={24} style={fill('dirt')} />
            {bases.map((base) => (
                <circle key={`${base.x}-${base.y}`} cx={base.x} cy={base.y} r={11} style={fill('dirt')} />
            ))}
            <circle cx={MOUND.x} cy={MOUND.y} r={13} style={fill('dirt')} />
            <circle cx={MOUND.x} cy={MOUND.y} r={13} fill="none" stroke="#000" strokeOpacity={0.08} strokeWidth={1.5} />

            {/* Líneas de foul, cajas de bateo y círculos de espera */}
            <g style={{ stroke: 'var(--fld-line)' }} strokeWidth={1.6} fill="none">
                <line x1={HOME.x} y1={HOME.y} x2={POLES.left.x} y2={POLES.left.y} />
                <line x1={HOME.x} y1={HOME.y} x2={POLES.right.x} y2={POLES.right.y} />
                <rect x={177} y={368} width={14} height={24} rx={1.5} strokeWidth={1.2} />
                <rect x={209} y={368} width={14} height={24} rx={1.5} strokeWidth={1.2} />
                <circle cx={ON_DECK_CIRCLES.left.x} cy={ON_DECK_CIRCLES.left.y} r={14} strokeOpacity={0.6} style={fill('dirt')} />
                <circle cx={ON_DECK_CIRCLES.right.x} cy={ON_DECK_CIRCLES.right.y} r={14} strokeOpacity={0.6} style={fill('dirt')} />
            </g>

            {/* Bases, home y la goma del lanzador */}
            {bases.map((base) => (
                <rect key={`b${base.x}-${base.y}`} x={base.x - 5} y={base.y - 5} width={10} height={10} rx={1} fill="#ffffff" transform={`rotate(45 ${base.x} ${base.y})`} />
            ))}
            <path d={PLATE} fill="#ffffff" />
            <rect x={MOUND.x - 5} y={MOUND.y - 1.3} width={10} height={2.6} rx={0.6} fill="#ffffff" />
        </svg>
    );
};
