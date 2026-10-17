import React, { useId } from 'react';

// Bateador en su caja, visto desde el receptor: silueta de cuerpo entero como la de MLB Gameday, con el estilo de
// El Play (camiseta y casco del equipo, pantalón de casa o de visitante, borde claro tipo sticker y sombra suave).
// El cuerpo se arma en pies a partir de la zona de strike de ese turno: el fondo de la zona es la rodilla y el tope
// es el punto medio entre hombros y cinturón (reglamento), así un bateador bajo o agachado se ve como es.

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

const ANCHOR = 1.5; // pies desde el centro del plato hasta el eje del cuerpo (el spike de atrás cabe en la vista)
// Borde de la silueta: color de la tarjeta, para que el cuerpo se despegue de la zona en claro y en oscuro
const OUTLINE = 'rgb(var(--surface))';
const DARK = '#2a2f39'; // cara en sombra, spikes y mango
const WOOD = '#c99a5b';

export const BatterFigure: React.FC<BatterFigureProps> = ({ side, top, bot, colors, sx, sy, unit }) => {
    const id = useId().replace(/:/g, '');
    const knee = bot;
    const belt = bot + (top - bot) * 0.55;
    const shoulder = 2 * top - belt;
    const headZ = shoulder + 0.4;

    // x local: positivo = hacia el plato. Un derecho se para del lado de tercera: a la izquierda en la vista del receptor.
    const toX = (x: number) => (side === 'R' ? sx(-ANCHOR + x) : sx(ANCHOR - x));
    const P = ([x, z]: Point): Point => [toX(x), sy(z)];
    const w = (feet: number) => feet * unit;
    const xy = (point: Point) => `${point[0].toFixed(1)} ${point[1].toFixed(1)}`;

    /** Miembro con grosor que se afina (muslo → rodilla, antebrazo → mano): trapecio con las puntas redondas */
    const limb = (a: Point, ra: number, b: Point, rb: number) => {
        const [ax, ay] = P(a);
        const [bx, by] = P(b);
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

    /** Contorno suave que pasa por los puntos (Catmull-Rom → curvas de Bézier) */
    const smooth = (points: Point[]) => {
        const pts = points.map(P);
        let d = `M ${xy(pts[0])}`;
        for (let i = 0; i < pts.length; i++) {
            const p0 = pts[(i - 1 + pts.length) % pts.length];
            const p1 = pts[i];
            const p2 = pts[(i + 1) % pts.length];
            const p3 = pts[(i + 2) % pts.length];
            const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
            const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
            d += ` C ${xy(c1)} ${xy(c2)} ${xy(p2)}`;
        }
        return `${d} Z`;
    };

    // ---- Postura: piernas abiertas y flexionadas, peso atrás, torso un poco hacia el plato, manos arriba atrás
    const backHip: Point = [-0.12, belt - 0.16];
    const frontHip: Point = [0.15, belt - 0.16];
    const backKnee: Point = [-0.4, knee + 0.04];
    const frontKnee: Point = [0.46, knee];
    const backAnkle: Point = [-0.56, 0.3];
    const frontAnkle: Point = [0.66, 0.28];
    const hands: Point = [-0.2, shoulder + 0.26];
    const backShoulder: Point = [-0.16, shoulder - 0.06];
    const frontShoulder: Point = [0.27, shoulder - 0.08];
    const backElbow: Point = [-0.52, shoulder - 0.02];
    const frontElbow: Point = [0.12, shoulder - 0.38];

    // Torso en V: cintura fina, pecho hacia el plato, espalda un poco curva
    const torso = smooth([
        [-0.22, belt],
        [0.04, belt - 0.05],
        [0.25, belt + 0.02],
        [0.36, belt + 0.45],
        [0.37, shoulder - 0.2],
        [0.26, shoulder + 0.04],
        [0.06, shoulder + 0.08],
        [-0.16, shoulder + 0.02],
        [-0.31, shoulder - 0.22],
        [-0.27, belt + 0.45]
    ]);
    const hips = smooth([
        [-0.3, belt - 0.06],
        [0.0, belt + 0.02],
        [0.27, belt - 0.04],
        [0.3, belt - 0.24],
        [0.02, belt - 0.32],
        [-0.3, belt - 0.27]
    ]);

    // Bate: mango en las manos, barril arriba y hacia atrás (como MLB: casi vertical sobre el hombro)
    const batEnd: Point = [-0.52, shoulder + 1.02];
    const barrel = limb(hands, 0.033, batEnd, 0.09);
    const handle = limb([hands[0] + 0.03, hands[1] - 0.12], 0.04, hands, 0.035);

    // Casco que cubre la cabeza (desde el receptor se ve la nuca y la orejera), visera hacia el plato
    const helmet = smooth([
        [-0.17, headZ - 0.02],
        [-0.12, headZ + 0.2],
        [0.08, headZ + 0.3],
        [0.27, headZ + 0.19],
        [0.42, headZ + 0.03],
        [0.26, headZ - 0.01],
        [0.2, headZ - 0.16],
        [0.0, headZ - 0.24],
        [-0.14, headZ - 0.18]
    ]);

    // Todo lo que forma la silueta, en orden de atrás hacia adelante
    const parts: { d: string; fill: string }[] = [
        // brazo de atrás (detrás del cuerpo)
        { d: limb(backShoulder, 0.15, backElbow, 0.12), fill: `url(#bf-sleeve-${id})` },
        { d: limb(backElbow, 0.11, hands, 0.09), fill: `url(#bf-sleeve-${id})` },
        // pierna de atrás
        { d: limb(backHip, 0.26, backKnee, 0.18), fill: `url(#bf-pants-${id})` },
        { d: limb(backKnee, 0.17, backAnkle, 0.11), fill: `url(#bf-pants-${id})` },
        { d: limb([backKnee[0] - 0.08, knee * 0.55], 0.12, backAnkle, 0.1), fill: colors.trim },
        { d: limb([backAnkle[0] - 0.12, 0.11], 0.09, [backAnkle[0] + 0.18, 0.09], 0.08), fill: DARK },
        // pierna de adelante
        { d: limb(frontHip, 0.25, frontKnee, 0.18), fill: `url(#bf-pants-${id})` },
        { d: limb(frontKnee, 0.17, frontAnkle, 0.11), fill: `url(#bf-pants-${id})` },
        { d: limb([frontKnee[0] + 0.07, knee * 0.55], 0.12, frontAnkle, 0.1), fill: colors.trim },
        { d: limb([frontAnkle[0] - 0.12, 0.09], 0.08, [frontAnkle[0] + 0.25, 0.09], 0.08), fill: DARK },
        // cadera, torso y cinturón
        { d: hips, fill: `url(#bf-pants-${id})` },
        { d: torso, fill: `url(#bf-jersey-${id})` },
        { d: limb([-0.33, belt - 0.03], 0.045, [0.32, belt - 0.01], 0.045), fill: DARK },
        // cuello (la cabeza va dentro del casco)
        { d: limb([0.05, shoulder + 0.02], 0.09, [0.06, headZ - 0.16], 0.09), fill: DARK },
        // bate (detrás del brazo de adelante)
        { d: handle, fill: DARK },
        { d: barrel, fill: WOOD },
        // brazo de adelante cruzando el pecho, un tono más oscuro para que se lea sobre la camiseta
        { d: limb(frontShoulder, 0.15, frontElbow, 0.12), fill: `url(#bf-front-${id})` },
        { d: limb(frontElbow, 0.11, hands, 0.09), fill: `url(#bf-front-${id})` },
        // guantes de bateo
        { d: limb([hands[0] + 0.02, hands[1] - 0.08], 0.11, hands, 0.11), fill: colors.trim },
        // casco
        { d: helmet, fill: `url(#bf-helmet-${id})` }
    ];

    const flip = side === 'R' ? 1 : -1; // el brillo cae del lado de la luz (arriba, hacia el plato)
    const jersey = colors.jersey;

    return (
        <g aria-hidden="true">
            <defs>
                <linearGradient id={`bf-jersey-${id}`} x1={flip > 0 ? '1' : '0'} y1="0" x2={flip > 0 ? '0' : '1'} y2="1">
                    <stop offset="0" stopColor={shade(jersey, 0.18)} />
                    <stop offset="0.55" stopColor={jersey} />
                    <stop offset="1" stopColor={shade(jersey, -0.22)} />
                </linearGradient>
                <linearGradient id={`bf-sleeve-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={shade(jersey, -0.2)} />
                    <stop offset="1" stopColor={shade(jersey, -0.35)} />
                </linearGradient>
                <linearGradient id={`bf-front-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={shade(jersey, -0.08)} />
                    <stop offset="1" stopColor={shade(jersey, -0.28)} />
                </linearGradient>
                <linearGradient id={`bf-pants-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={colors.pants} />
                    <stop offset="1" stopColor={shade(colors.pants, -0.14)} />
                </linearGradient>
                <radialGradient id={`bf-helmet-${id}`} cx={flip > 0 ? '0.65' : '0.35'} cy="0.3" r="0.8">
                    <stop offset="0" stopColor={shade(jersey, 0.35)} />
                    <stop offset="0.5" stopColor={shade(jersey, -0.05)} />
                    <stop offset="1" stopColor={shade(jersey, -0.4)} />
                </radialGradient>
            </defs>

            {/* Sombra en la tierra */}
            <ellipse cx={toX(0.03)} cy={sy(0.06)} rx={w(1.0)} ry={w(0.1)} fill="rgb(var(--ink))" opacity={0.12} />

            {/* Borde tipo sticker: la misma silueta un poco más gruesa, detrás */}
            <g fill={OUTLINE} stroke={OUTLINE} strokeWidth={w(0.07)} strokeLinejoin="round">
                {parts.map((part, index) => (
                    <path key={index} d={part.d} />
                ))}
            </g>
            {parts.map((part, index) => (
                <path key={index} d={part.d} fill={part.fill} />
            ))}

            {/* Detalles del uniforme: ribete de la camiseta, rayita del pantalón y brillo del casco */}
            <path
                d={`M ${xy(P([0.41, shoulder - 0.34]))} Q ${xy(P([0.36, belt + 0.4]))} ${xy(P([0.31, belt + 0.03]))}`}
                fill="none"
                stroke={colors.trim}
                strokeWidth={w(0.04)}
                strokeLinecap="round"
                opacity={0.85}
            />
            <path d={limb([frontHip[0] + 0.1, belt - 0.22], 0.015, [frontKnee[0] + 0.12, knee + 0.05], 0.015)} fill={colors.trim} opacity={0.7} />
            <ellipse cx={toX(0.14)} cy={sy(headZ + 0.18)} rx={w(0.08)} ry={w(0.04)} fill="#fff" opacity={0.4} />
            {/* Orejera del casco hacia el receptor */}
            <path d={limb([-0.02, headZ - 0.04], 0.1, [-0.04, headZ - 0.16], 0.08)} fill={shade(jersey, -0.3)} />
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
    if (!color.startsWith('#')) return color;
    const value = parseInt(color.slice(1), 16);
    const channel = (shift: number) => {
        const c = (value >> shift) & 255;
        return Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
    };
    return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
};
