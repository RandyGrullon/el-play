import React from 'react';
import { G, Line, Path, Rect } from 'react-native-svg';

export { SprayChart } from './spray/SprayMap';

// Mapa de batazos: dónde cayó cada bola puesta en juego. Coordenadas del cuadro de Gameday (250×250, home en
// ≈125,198, ~2,5 pies por unidad); el anotador las marca en todos los estadios, también en los que no tienen rastreo.
const HOME_X = 125.42;
const HOME_Y = 198.27;
// Jardín genérico: líneas de foul de ~330 pies, central de ~400
const POLE = 92;
const FENCE = `M0 0 L${-POLE} ${-POLE} Q0 -228 ${POLE} ${-POLE} Z`;
const DIRT = 'M0 0 L-38 -38 Q0 -84 38 -38 Z';
const INFIELD = 'M0 -5 L-21 -26 L0 -47 L21 -26 Z';
const BASES = [
    [25.5, -25.5],
    [0, -51],
    [-25.5, -25.5]
];
const VIEW = { x: -112, y: -182, w: 224, h: 198 };
/** viewBox del terreno (lo usa también la ficha del pelotero) */
export const FIELD_VIEW = VIEW;
export const FIELD_VIEWBOX = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`;
/** Punto del cuadro de Gameday dentro del dibujo (home en 0,0) */
export const fieldPoint = (x: number, y: number) => [x - HOME_X, y - HOME_Y] as const;

/** El terreno: jardín, tierra, cuadro, rayas de foul y bases */
export const FieldBackdrop: React.FC = () => (
    <>
        <Path d={FENCE} fill="#3f9b63" fillOpacity={0.2} stroke="#3f9b63" strokeOpacity={0.55} strokeWidth={1.2} />
        <Path d={DIRT} fill="#c08a52" fillOpacity={0.3} />
        <Path d={INFIELD} fill="#3f9b63" fillOpacity={0.28} />
        <G stroke="#ffffff" strokeOpacity={0.9} strokeWidth={0.8}>
            <Line x1={0} y1={0} x2={-POLE} y2={-POLE} />
            <Line x1={0} y1={0} x2={POLE} y2={-POLE} />
        </G>
        {BASES.map(([x, y]) => (
            <Rect key={`${x}${y}`} x={x - 1.8} y={y - 1.8} width={3.6} height={3.6} fill="#ffffff" transform={`rotate(45 ${x} ${y})`} />
        ))}
        <Path d="M-2 0.6 L2 0.6 L2 2.4 L0 4 L-2 2.4 Z" fill="#ffffff" />
    </>
);

