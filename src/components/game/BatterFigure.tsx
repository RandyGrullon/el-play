import React, { useId } from 'react';
import { Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from '../../theme/theme';

// Bateador en su caja, visto desde el receptor (calcado de la web, que a su vez calca el de MLB Gameday): casco,
// codo de atrás arriba, manos a la altura de la barbilla, rodilla de adelante doblada hacia el plato. Camiseta y casco
// del equipo, mangas oscuras, pantalón de casa o de visitante y borde claro tipo sticker. La silueta se escala entera
// para que su rodilla y el medio del torso caigan en el fondo y el tope de la zona de ese turno.

export interface UniformColors {
    jersey: string;
    trim: string;
    pants: string;
}

interface BatterFigureProps {
    side: 'L' | 'R';
    /** Tope y fondo de la zona del bateador (pies) */
    top: number;
    bot: number;
    colors: UniformColors;
    /** Proyección de pies a coordenadas del SVG de la zona */
    sx: (feet: number) => number;
    sy: (feet: number) => number;
    unit: number;
}

type Point = [number, number];

const ANCHOR = 1.4; // pies desde el centro del plato hasta el eje del cuerpo
const DARK = '#232833'; // spikes, cinturón, cuello
const WOOD = '#d0a265';

// ---- Calco (píxeles del recorte de MLB Gameday, bateador derecho; el plato queda a la derecha)
const MLB = { axis: 255, ground: 900, height: 685, knee: 0.292, zoneTop: (0.591 + 0.861) / 2 };

const PANTS: Point[] = [
    [178, 490], [170, 520], [164, 548], [172, 590], [188, 640], [200, 690], [203, 722], [196, 780], [188, 840], [184, 882],
    [231, 882], [233, 845], [240, 790], [248, 730], [252, 670], [258, 612], [268, 640], [285, 690], [292, 730], [282, 765],
    [272, 792], [306, 794], [316, 760], [334, 716], [341, 690], [333, 640], [318, 585], [305, 545], [296, 512]
];
const TORSO: Point[] = [
    [184, 498], [185, 452], [190, 405], [197, 365], [214, 331], [250, 306], [290, 300], [325, 311], [342, 337], [346, 370], [342, 410], [330, 455], [313, 496], [298, 510]
];
const BELT: Point[] = [[180, 481], [297, 499], [297, 517], [178, 498]];
const HELMET: Point[] = [[285, 241], [292, 219], [318, 207], [346, 214], [362, 232], [374, 252], [352, 258], [345, 280], [318, 291], [297, 282]];
const BACK_SHOE: Point[] = [[178, 878], [232, 876], [264, 880], [302, 884], [310, 895], [290, 903], [186, 902], [175, 893]];
const FRONT_SHOE: Point[] = [[269, 790], [306, 790], [346, 795], [374, 801], [371, 811], [328, 815], [272, 809], [265, 800]];
// Brazos: [hombro, codo, manos]
const BACK_ARM: Point[] = [[220, 334], [181, 340], [300, 292]];
const FRONT_ARM: Point[] = [[333, 336], [392, 392], [336, 306]];
const GLOVES: [Point, Point] = [[304, 292], [344, 312]];

export const BatterFigure: React.FC<BatterFigureProps> = ({ side, top, bot, colors, sx, sy, unit }) => {
    const palette = useColors();
    const id = useId().replace(/[^a-zA-Z0-9]/g, '');
    // Alto de la silueta (pies) que mejor pone su rodilla en el fondo de la zona y su medio torso en el tope
    const height = (MLB.knee * bot + MLB.zoneTop * top) / (MLB.knee ** 2 + MLB.zoneTop ** 2);
    const pxPerFoot = MLB.height / height;

    const feet = ([px, py]: Point): Point => [(px - MLB.axis) / pxPerFoot, (MLB.ground - py) / pxPerFoot];
    // x local: positivo = hacia el plato. Un derecho se para del lado de tercera: a la izquierda en la vista del receptor.
    const toX = (x: number) => (side === 'R' ? sx(-ANCHOR + x) : sx(ANCHOR - x));
    const screen = (point: Point): Point => {
        const [x, z] = feet(point);
        return [toX(x), sy(z)];
    };
    const screenFeet = ([x, z]: Point): Point => [toX(x), sy(z)];
    const w = (ft: number) => ft * unit;
    const xy = (point: Point) => `${point[0].toFixed(1)} ${point[1].toFixed(1)}`;

    /** Contorno suave por los puntos del calco (Catmull-Rom → Bézier) */
    const smooth = (points: Point[], tension = 6) => {
        const pts = points.map(screen);
        let d = `M ${xy(pts[0])}`;
        for (let i = 0; i < pts.length; i++) {
            const p0 = pts[(i - 1 + pts.length) % pts.length];
            const p1 = pts[i];
            const p2 = pts[(i + 1) % pts.length];
            const p3 = pts[(i + 2) % pts.length];
            d += ` C ${xy([p1[0] + (p2[0] - p0[0]) / tension, p1[1] + (p2[1] - p0[1]) / tension])} ${xy([p2[0] - (p3[0] - p1[0]) / tension, p2[1] - (p3[1] - p1[1]) / tension])} ${xy(p2)}`;
        }
        return `${d} Z`;
    };

    /** Miembro que se afina (brazo, bate): trapecio con las puntas redondas */
    const limb = (a: Point, ra: number, b: Point, rb: number) => {
        const [ax, ay] = a;
        const [bx, by] = b;
        const length = Math.hypot(bx - ax, by - ay) || 1;
        const nx = -(by - ay) / length;
        const ny = (bx - ax) / length;
        const r1 = w(ra);
        const r2 = w(rb);
        return (
            `M ${xy([ax + nx * r1, ay + ny * r1])} L ${xy([bx + nx * r2, by + ny * r2])} ` +
            `A ${r2.toFixed(1)} ${r2.toFixed(1)} 0 0 0 ${xy([bx - nx * r2, by - ny * r2])} L ${xy([ax - nx * r1, ay - ny * r1])} ` +
            `A ${r1.toFixed(1)} ${r1.toFixed(1)} 0 0 0 ${xy([ax + nx * r1, ay + ny * r1])} Z`
        );
    };
    const arm = ([shoulderPx, elbowPx, handsPx]: Point[]) => [limb(screen(shoulderPx), 0.11, screen(elbowPx), 0.085), limb(screen(elbowPx), 0.08, screen(handsPx), 0.07)];

    // Bate: sale de las manos hacia atrás y arriba (≈48° para que el barril quepa en la tarjeta)
    const hands = feet(GLOVES[0]);
    const angle = (48 * Math.PI) / 180;
    const batEnd: Point = [hands[0] - Math.cos(angle) * 1.55, hands[1] + Math.sin(angle) * 1.55];
    const bat = limb(screenFeet([hands[0] + 0.05, hands[1] - 0.06]), 0.03, screenFeet(batEnd), 0.085);

    const flip = side === 'R';
    const jersey = colors.jersey;
    const sleeve = shade(jersey, -0.5);
    const outline = palette.surface;

    // Orden de atrás hacia adelante; todas las piezas forman la silueta (y su borde)
    const parts: { d: string; fill: string }[] = [
        ...arm(BACK_ARM).map((d) => ({ d, fill: `url(#bfs${id})` })),
        { d: bat, fill: `url(#bfb${id})` },
        { d: smooth(PANTS), fill: `url(#bfp${id})` },
        { d: smooth(BACK_SHOE, 8), fill: DARK },
        { d: smooth(FRONT_SHOE, 8), fill: DARK },
        { d: smooth(TORSO), fill: `url(#bfj${id})` },
        { d: smooth(BELT, 10), fill: DARK },
        { d: limb(screen([300, 284]), 0.07, screen([304, 304]), 0.07), fill: DARK },
        ...arm(FRONT_ARM).map((d) => ({ d, fill: `url(#bff${id})` })),
        { d: limb(screen(GLOVES[0]), 0.1, screen(GLOVES[1]), 0.1), fill: colors.trim },
        { d: smooth(HELMET), fill: `url(#bfh${id})` }
    ];
    const shine = screen([330, 222]);

    return (
        <G>
            <Defs>
                <LinearGradient id={`bfj${id}`} x1={flip ? '1' : '0'} y1="0" x2={flip ? '0' : '1'} y2="1">
                    <Stop offset="0" stopColor={shade(jersey, 0.2)} />
                    <Stop offset="0.5" stopColor={jersey} />
                    <Stop offset="1" stopColor={shade(jersey, -0.25)} />
                </LinearGradient>
                <LinearGradient id={`bfs${id}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={shade(sleeve, 0.12)} />
                    <Stop offset="1" stopColor={sleeve} />
                </LinearGradient>
                <LinearGradient id={`bff${id}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={shade(sleeve, 0.25)} />
                    <Stop offset="1" stopColor={shade(sleeve, 0.05)} />
                </LinearGradient>
                <LinearGradient id={`bfp${id}`} x1={flip ? '0' : '1'} y1="0" x2={flip ? '1' : '0'} y2="1">
                    <Stop offset="0" stopColor={shade(colors.pants, -0.12)} />
                    <Stop offset="0.45" stopColor={colors.pants} />
                    <Stop offset="1" stopColor={shade(colors.pants, -0.18)} />
                </LinearGradient>
                <RadialGradient id={`bfh${id}`} cx={flip ? '0.62' : '0.38'} cy="0.28" r="0.85">
                    <Stop offset="0" stopColor={shade(jersey, 0.35)} />
                    <Stop offset="0.45" stopColor={shade(jersey, -0.1)} />
                    <Stop offset="1" stopColor={shade(jersey, -0.5)} />
                </RadialGradient>
                <LinearGradient id={`bfb${id}`} x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={shade(WOOD, -0.18)} />
                    <Stop offset="1" stopColor={WOOD} />
                </LinearGradient>
            </Defs>

            {/* Sombra en la tierra */}
            <Ellipse cx={toX(0.15)} cy={sy(0.05)} rx={w(1.05)} ry={w(0.1)} fill={palette.ink} opacity={0.12} />

            {/* Borde tipo sticker: la misma silueta un poco más gruesa, detrás */}
            <G fill={outline} stroke={outline} strokeWidth={w(0.07)} strokeLinejoin="round">
                {parts.map((part, index) => (
                    <Path key={index} d={part.d} />
                ))}
            </G>
            {parts.map((part, index) => (
                <Path key={index} d={part.d} fill={part.fill} />
            ))}

            {/* Ribete de la camiseta, raya del pantalón y brillo del casco */}
            <Path d={`M ${xy(screen([318, 318]))} Q ${xy(screen([330, 410]))} ${xy(screen([300, 500]))}`} fill="none" stroke={colors.trim} strokeWidth={w(0.035)} strokeLinecap="round" opacity={0.8} />
            <Path d={`M ${xy(screen([312, 540]))} Q ${xy(screen([330, 620]))} ${xy(screen([336, 690]))}`} fill="none" stroke={colors.trim} strokeWidth={w(0.03)} strokeLinecap="round" opacity={0.6} />
            <Ellipse cx={shine[0]} cy={shine[1]} rx={w(0.08)} ry={w(0.04)} fill="#fff" opacity={0.45} />
        </G>
    );
};

/** Colores del uniforme: camiseta del color del equipo; pantalón blanco en casa y gris de visitante */
export const uniformColors = (team: { color: string; color2?: string | null }, isHome: boolean): UniformColors => ({
    jersey: team.color,
    trim: team.color2 || shade(team.color, -0.45),
    pants: isHome ? '#eef1f4' : '#aab2bd'
});

/** Aclara (amount > 0) u oscurece (amount < 0) un color hex o rgb() */
export const shade = (color: string, amount: number) => {
    let hex = color;
    if (color.startsWith('rgb')) {
        const [r, g, b] = color
            .slice(color.indexOf('(') + 1, -1)
            .split(/[\s,/]+/)
            .map(Number);
        hex = `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
    }
    if (!hex.startsWith('#')) return color;
    const value = parseInt(hex.slice(1, 7), 16);
    const channel = (shift: number) => {
        const c = (value >> shift) & 255;
        return Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
    };
    return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
};
