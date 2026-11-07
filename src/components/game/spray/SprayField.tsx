import React, { useId } from 'react';
import { Circle, ClipPath, Defs, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { polar, wallAt, type Feet, type Park } from '../../../lib/flight';
import { INFIELD_FT, ZONES, type SprayZone } from '../../../lib/spray';
import { fonts } from '../../../theme/tokens';
import { FIELD_PALETTE } from '../field/FieldDrawing';

// El parque del juego visto desde arriba, en pies (x = pies, y = −pies hacia el center): cerca con sus medidas, pista
// de advertencia, franjas de corte, tierra del cuadro, caminos, bases, montículo, líneas de foul con sus postes y los
// anillos de 200/300/400 pies. Los colores son los de la vista del terreno (FieldDrawing).

export interface SprayView {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Pies (home en 0,0; +y al center) al dibujo (y hacia abajo) */
export const toSvg = (p: Feet) => ({ x: p.x, y: -p.y });

/** Caja del dibujo: de poste a poste y hasta detrás de la cerca (los jonrones caen ahí) */
export const sprayViewOf = (park: Park): SprayView => {
    const deep = Math.max(park.center, park.leftCenter, park.rightCenter);
    const left = park.left * Math.SQRT1_2 + 40;
    const right = park.right * Math.SQRT1_2 + 40;
    return { x: -left, y: -(deep + 62), w: left + right, h: deep + 62 + 28 };
};

const angles = (from: number, to: number, step = 1.5) => {
    const list: number[] = [];
    for (let a = from; a <= to + 0.001; a += step) list.push(Math.min(a, to));
    return list;
};

const pts = (list: Feet[]) => list.map((p) => `${p.x.toFixed(1)},${(-p.y).toFixed(1)}`).join(' ');

/** Contorno del territorio bueno a una distancia de la cerca (`inset` pies hacia adentro) */
export const fairPoints = (park: Park, inset = 0) => [{ x: 0, y: 0 }, ...angles(-45, 45).map((a) => polar(a, wallAt(park, a) - inset))];

/** Polígono de una zona: el cuadro (hasta 150 pies) o una tajada del jardín hasta la cerca */
export const zonePoints = (park: Park, zone: SprayZone) => {
    if (zone === 'IF') return [{ x: 0, y: 0 }, ...angles(-45, 45).map((a) => polar(a, INFIELD_FT))];
    const index = ZONES.indexOf(zone);
    const from = -45 + index * 18;
    const to = from + 18;
    const outer = angles(from, to, 1).map((a) => polar(a, wallAt(park, a)));
    const inner = angles(from, to, 1)
        .reverse()
        .map((a) => polar(a, INFIELD_FT));
    return [...outer, ...inner];
};

/** Dónde va la etiqueta de la zona */
export const zoneLabelAt = (park: Park, zone: SprayZone) => {
    if (zone === 'IF') return polar(0, 100);
    const mid = -45 + ZONES.indexOf(zone) * 18 + 9;
    return polar(mid, (INFIELD_FT + wallAt(park, mid)) / 2 + 10);
};

const MARKS: { a: number; key: 'left' | 'leftCenter' | 'center' | 'rightCenter' | 'right' }[] = [
    { a: -45, key: 'left' },
    { a: -22.5, key: 'leftCenter' },
    { a: 0, key: 'center' },
    { a: 22.5, key: 'rightCenter' },
    { a: 45, key: 'right' }
];

/** El dibujo del parque; `u` son pies por píxel (para que letras y rayas midan lo mismo en cualquier tamaño) */
export const SprayField: React.FC<{ park: Park; view: SprayView; dark: boolean; u: number }> = React.memo(function SprayField({ park, view, dark, u }) {
    const c = dark ? FIELD_PALETTE.dark : FIELD_PALETTE.light;
    const clip = `el-play-spray-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const grass = fairPoints(park, 14);
    const dirt = [{ x: 0, y: 0 }, polar(-45, 90 * Math.SQRT2 * 0.75), ...angles(18.2, 161.8, 4).map((phi) => ({ x: -95 * Math.cos((phi * Math.PI) / 180), y: 60.5 + 95 * Math.sin((phi * Math.PI) / 180) })), polar(45, 90 * Math.SQRT2 * 0.75)];
    const bases = [polar(45, 90), polar(0, 127.3), polar(-45, 90)];
    const infieldGrass = [polar(0, 10), polar(45, 78), polar(0, 116), polar(-45, 78)];
    const poleL = polar(-45, park.left);
    const poleR = polar(45, park.right);
    const font = 10 * u;
    const stripes = angles(-45, 45, 7.5).slice(0, -1);
    return (
        <G>
            <Defs>
                <ClipPath id={clip}>
                    <Polygon points={pts(grass)} />
                </ClipPath>
            </Defs>
            <Rect x={view.x} y={view.y} width={view.w} height={view.h} fill={c.foul} />
            {/* Pista de advertencia y la grama por dentro, con franjas de corte */}
            <Polygon points={pts(fairPoints(park))} fill={c.track} />
            <G clipPath={`url(#${clip})`}>
                <Polygon points={pts(grass)} fill={c.grassA} />
                {stripes.map((a, index) =>
                    index % 2 === 0 ? <Polygon key={a} points={pts([{ x: 0, y: 0 }, polar(a, 520), polar(a + 7.5, 520)])} fill={c.grassB} opacity={0.75} /> : null
                )}
                <Polygon points={pts(dirt)} fill={c.dirt} />
            </G>
            {/* Anillos de 200, 300 y 400 pies (solo dentro de la cerca) */}
            {[200, 300, 400].map((ring) => {
                const inside = angles(-45, 45, 1).filter((a) => wallAt(park, a) > ring + 4);
                if (inside.length < 2) return null;
                const arc = inside.map((a) => polar(a, ring));
                const label = polar(inside[inside.length - 1] - 3, ring);
                return (
                    <G key={ring}>
                        <Path d={`M${arc.map((p) => `${p.x.toFixed(1)} ${(-p.y).toFixed(1)}`).join(' L')}`} fill="none" stroke={c.line} strokeOpacity={0.22} strokeWidth={u} strokeDasharray={[4 * u, 4 * u]} />
                        <SvgText x={label.x} y={-label.y - 2 * u} fontSize={font * 0.8} fontFamily={fonts.bold} fill={c.line} fillOpacity={0.55} textAnchor="end">
                            {String(ring)}
                        </SvgText>
                    </G>
                );
            })}
            <Polygon points={pts(infieldGrass)} fill={c.infield} />
            <Circle cx={0} cy={-60.5} r={9} fill={c.dirt} stroke={c.dirtEdge} strokeWidth={u * 0.8} />
            <Circle cx={0} cy={0} r={13} fill={c.dirt} />
            {/* Líneas de foul hasta los postes */}
            <Line x1={0} y1={0} x2={poleL.x} y2={-poleL.y} stroke={c.line} strokeWidth={1.4 * u} />
            <Line x1={0} y1={0} x2={poleR.x} y2={-poleR.y} stroke={c.line} strokeWidth={1.4 * u} />
            {/* La cerca y los postes */}
            <Path d={`M${fairPoints(park).slice(1).map((p) => `${p.x.toFixed(1)} ${(-p.y).toFixed(1)}`).join(' L')}`} fill="none" stroke={c.frame} strokeWidth={4 * u} strokeLinejoin="round" />
            <Circle cx={poleL.x} cy={-poleL.y} r={3 * u} fill="#facc15" />
            <Circle cx={poleR.x} cy={-poleR.y} r={3 * u} fill="#facc15" />
            {bases.map((b, index) => (
                <Rect key={index} x={b.x - 3} y={-b.y - 3} width={6} height={6} fill={c.line} transform={`rotate(45 ${b.x} ${-b.y})`} />
            ))}
            <Polygon points="-3,-1 3,-1 3,1.5 0,4 -3,1.5" fill={c.line} />
            {/* Medidas de la cerca */}
            {MARKS.map(({ a, key }) => {
                const p = polar(a, wallAt(park, a) + 14 * u + 8);
                return (
                    <SvgText key={key} x={p.x} y={-p.y + font * 0.35} fontSize={font} fontFamily={fonts.extrabold} fill={c.line} textAnchor="middle">
                        {String(park[key])}
                    </SvgText>
                );
            })}
        </G>
    );
});
