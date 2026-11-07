import React, { useId } from 'react';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import { BASE_POINTS, FIELD_H, FIELD_W, MOUND, ON_DECK, PLATE } from '../../../lib/field';

// El terreno visto desde arriba (100 × 112, home abajo): grama con franjas de corte en dos verdes, pista de
// advertencia junto a la cerca, el arco de tierra del cuadro, las líneas de foul, las tres bases, el home, el
// montículo, las cajas de bateo y los círculos de espera. Solo dibujo: las caras van encima (FieldView).

const PALETTE = {
    light: { foul: '#2f8049', grassA: '#3c9a5a', grassB: '#4aab69', infield: '#47a666', track: '#c48d5a', dirt: '#d3a271', dirtEdge: '#b98756', line: 'rgba(255,255,255,0.94)', frame: '#246b3c' },
    dark: { foul: '#1f5233', grassA: '#28683f', grassB: '#2f7649', infield: '#2e7348', track: '#94663f', dirt: '#a5784d', dirtEdge: '#8a613b', line: 'rgba(240,244,248,0.86)', frame: '#173f27' }
};

// Esquinas de la cerca sobre las líneas de foul y el fondo del jardín central
const CORNER = 43.84;
const LEFT = { x: PLATE.x - CORNER, y: PLATE.y - CORNER };
const RIGHT = { x: PLATE.x + CORNER, y: PLATE.y - CORNER };
const FENCE_TOP = 4;
// Curva cuadrática que pasa por el fondo del center (su punto medio queda en FENCE_TOP)
const CONTROL_Y = 2 * FENCE_TOP - LEFT.y;
// El territorio bueno; con `k` < 1, el mismo achicado hacia home (la grama, por dentro de la pista de advertencia)
const fair = (k = 1) => {
    const at = (x: number, y: number) => `${PLATE.x + (x - PLATE.x) * k} ${PLATE.y + (y - PLATE.y) * k}`;
    return `M${PLATE.x} ${PLATE.y} L${at(LEFT.x, LEFT.y)} Q${at(PLATE.x, CONTROL_Y)} ${at(RIGHT.x, RIGHT.y)} Z`;
};
const FAIR = fair();
const GRASS = fair(0.93);

// La grama del cuadro: el diamante un poco adentro de las bases (la tierra que queda son los caminos)
const CENTER_Y = BASE_POINTS.first.y;
const shrink = (x: number, y: number, k: number) => `${PLATE.x + (x - PLATE.x) * k},${CENTER_Y + (y - CENTER_Y) * k}`;
const INFIELD_GRASS = [shrink(PLATE.x, PLATE.y, 0.84), shrink(BASE_POINTS.first.x, BASE_POINTS.first.y, 0.84), shrink(BASE_POINTS.second.x, BASE_POINTS.second.y, 0.84), shrink(BASE_POINTS.third.x, BASE_POINTS.third.y, 0.84)].join(' ');

const STRIPE = 7;
// Solo las que caen sobre la grama (a menos de ~95 de home en cualquier dirección)
const STRIPES = Array.from({ length: 15 }, (_, index) => -50 + index * STRIPE * 2);

const Base: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => <Rect x={x - 1.4} y={y - 1.4} width={2.8} height={2.8} rx={0.3} transform={`rotate(45 ${x} ${y})`} fill={color} />;

// Memo: el juego se relee cada ~5 s y el dibujo no cambia
export const FieldDrawing: React.FC<{ width: number; height: number; dark: boolean }> = React.memo(function FieldDrawing({ width, height, dark }) {
    const c = dark ? PALETTE.dark : PALETTE.light;
    // En la web el id del recorte es del documento entero: uno por dibujo
    const clip = `el-play-grass-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
        <Svg width={width} height={height} viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}>
            <Defs>
                <ClipPath id={clip}>
                    <Path d={GRASS} />
                </ClipPath>
            </Defs>
            {/* Territorio de foul y el marco */}
            <Rect x={0} y={0} width={FIELD_W} height={FIELD_H} rx={6} fill={c.foul} />
            <Rect x={0.4} y={0.4} width={FIELD_W - 0.8} height={FIELD_H - 0.8} rx={5.8} fill="none" stroke={c.frame} strokeWidth={0.8} />
            {/* Pista de advertencia: todo el territorio bueno; encima la grama, un poco más adentro */}
            <Path d={FAIR} fill={c.track} />
            <G clipPath={`url(#${clip})`}>
                <Rect x={0} y={0} width={FIELD_W} height={FIELD_H} fill={c.grassA} />
                {/* Franjas de corte cruzadas: un juego a 45° y el otro a −45° más suave */}
                <G transform={`rotate(45 ${PLATE.x} ${PLATE.y})`}>
                    {STRIPES.map((x) => (
                        <Rect key={`a${x}`} x={x} y={-120} width={STRIPE} height={340} fill={c.grassB} opacity={0.75} />
                    ))}
                </G>
                <G transform={`rotate(-45 ${PLATE.x} ${PLATE.y})`}>
                    {STRIPES.map((x) => (
                        <Rect key={`b${x}`} x={x} y={-120} width={STRIPE} height={340} fill={c.grassB} opacity={0.35} />
                    ))}
                </G>
                {/* Arco de tierra del cuadro (95 pies desde el montículo) */}
                <Circle cx={MOUND.x} cy={MOUND.y} r={27} fill={c.dirt} />
            </G>
            {/* Grama del cuadro, los caminos de tierra alrededor */}
            <Polygon points={INFIELD_GRASS} fill={c.infield} />
            {/* Tierra del home y montículo */}
            <Circle cx={PLATE.x} cy={PLATE.y} r={5} fill={c.dirt} />
            <Circle cx={MOUND.x} cy={MOUND.y} r={3} fill={c.dirt} stroke={c.dirtEdge} strokeWidth={0.3} />
            <Rect x={MOUND.x - 0.9} y={MOUND.y - 0.25} width={1.8} height={0.5} fill={c.line} />
            {/* Líneas de foul hasta la cerca */}
            <Line x1={PLATE.x} y1={PLATE.y} x2={LEFT.x} y2={LEFT.y} stroke={c.line} strokeWidth={0.5} />
            <Line x1={PLATE.x} y1={PLATE.y} x2={RIGHT.x} y2={RIGHT.y} stroke={c.line} strokeWidth={0.5} />
            {/* Cajas de bateo y del receptor */}
            <Rect x={PLATE.x - 4.6} y={PLATE.y - 2.4} width={3} height={5} fill="none" stroke={c.line} strokeWidth={0.3} />
            <Rect x={PLATE.x + 1.6} y={PLATE.y - 2.4} width={3} height={5} fill="none" stroke={c.line} strokeWidth={0.3} />
            {/* Círculos de espera de cada lado */}
            {[ON_DECK.left, ON_DECK.right].map((circle) => (
                <Circle key={circle.x} cx={circle.x} cy={circle.y} r={3} fill={c.dirt} stroke={c.line} strokeWidth={0.3} opacity={0.9} />
            ))}
            {/* Bases y home */}
            <Base x={BASE_POINTS.first.x} y={BASE_POINTS.first.y} color={c.line} />
            <Base x={BASE_POINTS.second.x} y={BASE_POINTS.second.y} color={c.line} />
            <Base x={BASE_POINTS.third.x} y={BASE_POINTS.third.y} color={c.line} />
            <Polygon points={`${PLATE.x - 1.3},${PLATE.y - 1.2} ${PLATE.x + 1.3},${PLATE.y - 1.2} ${PLATE.x + 1.3},${PLATE.y} ${PLATE.x},${PLATE.y + 1.3} ${PLATE.x - 1.3},${PLATE.y}`} fill={c.line} />
        </Svg>
    );
});
