import React, { useId } from 'react';

// Bateador en su caja, visto desde el receptor. La silueta está calcada del bateador de MLB Gameday (casco,
// codo de atrás arriba, manos a la altura de la barbilla, rodilla de adelante doblada hacia el plato) y pintada
// con el estilo de El Play: camiseta y casco del equipo, mangas oscuras, pantalón de casa o de visitante, borde
// claro tipo sticker. Las alturas se ajustan a la zona de strike de ese turno: el fondo de la zona es la rodilla y
// el tope es el punto medio entre hombros y cinturón (reglamento). La silueta se escala entera (sin deformarla)
// para que su rodilla y ese punto medio caigan lo más cerca posible de la zona del bateador.

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

const ANCHOR = 1.4; // pies desde el centro del plato hasta el eje del cuerpo (codo y bate caben en la tarjeta)
const OUTLINE = 'rgb(var(--surface))'; // borde de la silueta: se despega de la zona en claro y en oscuro
const DARK = '#232833'; // spikes, cinturón, cuello
const WOOD = '#d0a265';

// ---- Calco (píxeles del recorte de MLB Gameday, bateador derecho; el plato queda a la derecha)
// Suelo en y = 900, tope del casco en y = 215; marcas del cuerpo para ajustar a la zona de cada turno:
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
    const id = useId().replace(/:/g, '');
    // Alto de la silueta (pies) que mejor pone su rodilla en el fondo de la zona y su medio torso en el tope
    const height = (MLB.knee * bot + MLB.zoneTop * top) / (MLB.knee ** 2 + MLB.zoneTop ** 2);
    const pxPerFoot = MLB.height / height;

    // Píxeles del calco → pies (misma escala a lo alto y a lo ancho, con los pies en el suelo)
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

    /** Miembro que se afina (brazo, bate): trapecio con las puntas redondas, en coordenadas de pantalla */
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
    const arm = ([shoulderPx, elbowPx, handsPx]: Point[]) => [
        limb(screen(shoulderPx), 0.11, screen(elbowPx), 0.085),
        limb(screen(elbowPx), 0.08, screen(handsPx), 0.07)
    ];

    // Bate: sale de las manos hacia atrás y arriba. MLB lo pone más acostado; aquí se para un poco (≈48°) para que el
    // barril quepa en la tarjeta de la zona.
    const hands = feet(GLOVES[0]);
    const angle = (48 * Math.PI) / 180;
    const batEnd: Point = [hands[0] - Math.cos(angle) * 1.55, hands[1] + Math.sin(angle) * 1.55];
    const bat = limb(screenFeet([hands[0] + 0.05, hands[1] - 0.06]), 0.03, screenFeet(batEnd), 0.085);

    const flip = side === 'R';
    const jersey = colors.jersey;
    const sleeve = shade(jersey, -0.5);

    // Orden de atrás hacia adelante; todas las piezas forman la silueta (y su borde)
    const parts: { d: string; fill: string }[] = [
        ...arm(BACK_ARM).map((d) => ({ d, fill: `url(#bf-sleeve-${id})` })),
        { d: bat, fill: `url(#bf-bat-${id})` },
        { d: smooth(PANTS), fill: `url(#bf-pants-${id})` },
        { d: smooth(BACK_SHOE, 8), fill: DARK },
        { d: smooth(FRONT_SHOE, 8), fill: DARK },
        { d: smooth(TORSO), fill: `url(#bf-jersey-${id})` },
        { d: smooth(BELT, 10), fill: DARK },
        { d: limb(screen([300, 284]), 0.07, screen([304, 304]), 0.07), fill: DARK },
        ...arm(FRONT_ARM).map((d) => ({ d, fill: `url(#bf-sleeve-front-${id})` })),
        { d: limb(screen(GLOVES[0]), 0.1, screen(GLOVES[1]), 0.1), fill: colors.trim },
        { d: smooth(HELMET), fill: `url(#bf-helmet-${id})` }
    ];

    return (
        <g aria-hidden="true">
            <defs>
                <linearGradient id={`bf-jersey-${id}`} x1={flip ? '1' : '0'} y1="0" x2={flip ? '0' : '1'} y2="1">
                    <stop offset="0" stopColor={shade(jersey, 0.2)} />
                    <stop offset="0.5" stopColor={jersey} />
                    <stop offset="1" stopColor={shade(jersey, -0.25)} />
                </linearGradient>
                <linearGradient id={`bf-sleeve-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={shade(sleeve, 0.12)} />
                    <stop offset="1" stopColor={sleeve} />
                </linearGradient>
                <linearGradient id={`bf-sleeve-front-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={shade(sleeve, 0.25)} />
                    <stop offset="1" stopColor={shade(sleeve, 0.05)} />
                </linearGradient>
                <linearGradient id={`bf-pants-${id}`} x1={flip ? '0' : '1'} y1="0" x2={flip ? '1' : '0'} y2="1">
                    <stop offset="0" stopColor={shade(colors.pants, -0.12)} />
                    <stop offset="0.45" stopColor={colors.pants} />
                    <stop offset="1" stopColor={shade(colors.pants, -0.18)} />
                </linearGradient>
                <radialGradient id={`bf-helmet-${id}`} cx={flip ? '0.62' : '0.38'} cy="0.28" r="0.85">
                    <stop offset="0" stopColor={shade(jersey, 0.35)} />
                    <stop offset="0.45" stopColor={shade(jersey, -0.1)} />
                    <stop offset="1" stopColor={shade(jersey, -0.5)} />
                </radialGradient>
                <linearGradient id={`bf-bat-${id}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor={shade(WOOD, -0.18)} />
                    <stop offset="1" stopColor={WOOD} />
                </linearGradient>
            </defs>

            {/* Sombra en la tierra */}
            <ellipse cx={toX(0.15)} cy={sy(0.05)} rx={w(1.05)} ry={w(0.1)} fill="rgb(var(--ink))" opacity={0.12} />

            {/* Borde tipo sticker: la misma silueta un poco más gruesa, detrás */}
            <g fill={OUTLINE} stroke={OUTLINE} strokeWidth={w(0.07)} strokeLinejoin="round">
                {parts.map((part, index) => (
                    <path key={index} d={part.d} />
                ))}
            </g>
            {parts.map((part, index) => (
                <path key={index} d={part.d} fill={part.fill} />
            ))}

            {/* Detalles: ribete de la camiseta, raya del pantalón y brillo del casco */}
            <path d={`M ${xy(screen([318, 318]))} Q ${xy(screen([330, 410]))} ${xy(screen([300, 500]))}`} fill="none" stroke={colors.trim} strokeWidth={w(0.035)} strokeLinecap="round" opacity={0.8} />
            <path d={`M ${xy(screen([312, 540]))} Q ${xy(screen([330, 620]))} ${xy(screen([336, 690]))}`} fill="none" stroke={colors.trim} strokeWidth={w(0.03)} strokeLinecap="round" opacity={0.6} />
            <ellipse cx={screen([330, 222])[0]} cy={screen([330, 222])[1]} rx={w(0.08)} ry={w(0.04)} fill="#fff" opacity={0.45} />
        </g>
    );
};

/** Colores del uniforme: camiseta del color del equipo; pantalón blanco en casa y gris de visitante */
export const uniformColors = (team: { color: string; color2?: string | null }, isHome: boolean): UniformColors => ({
    jersey: team.color,
    trim: team.color2 || shade(team.color, -0.45),
    pants: isHome ? '#eef1f4' : '#aab2bd'
});

const shade = (color: string, amount: number) => {
    let hex = color;
    if (color.startsWith('rgb(')) {
        const [r, g, b] = color.slice(4, -1).split(/[\s,]+/).map(Number);
        hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    }
    if (!hex.startsWith('#')) return color;
    const value = parseInt(hex.slice(1), 16);
    const channel = (shift: number) => {
        const c = (value >> shift) & 255;
        return Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
    };
    return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
};
