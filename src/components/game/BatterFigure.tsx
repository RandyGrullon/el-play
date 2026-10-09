import React from 'react';

// Bateador en su caja, visto desde el receptor, con los colores del uniforme de su equipo.
// La figura se arma con puntos del cuerpo en pies a partir de la zona de strike de ese turno:
// el fondo de la zona es la rodilla y el tope es el punto medio entre hombros y cinturón (reglamento).

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

const ANCHOR = 1.55; // pies desde el centro del plato hasta el eje del cuerpo
// Separa brazos del torso (hueco del color del fondo) y marca el contorno de piernas claras en ambos temas
const OUTLINE = 'rgb(var(--surface))';
const EDGE = 'rgb(var(--ink) / 0.28)';

export const BatterFigure: React.FC<BatterFigureProps> = ({ side, top, bot, colors, sx, sy, unit }) => {
    const knee = bot;
    const belt = bot + (top - bot) * 0.55;
    const shoulder = 2 * top - belt;
    const head = shoulder + 0.47;
    const sleeve = shade(colors.jersey, -0.18);

    // x local: positivo = hacia el plato. Un derecho se para del lado de tercera: a la izquierda en la vista del receptor.
    const toX = (x: number) => (side === 'R' ? sx(-ANCHOR + x) : sx(ANCHOR - x));
    const p = ([x, z]: Point) => `${toX(x).toFixed(1)} ${sy(z).toFixed(1)}`;
    const line = (points: Point[]) => `M ${points.map(p).join(' L ')}`;
    const w = (feet: number) => feet * unit;
    const round = { fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

    // Postura: rodillas flexionadas hacia el plato, torso un poco inclinado, manos arriba junto al hombro de atrás
    const hands: Point = [-0.16, shoulder + 0.3];
    const legs: Point[][] = [
        [[-0.15, belt - 0.12], [-0.27, knee], [-0.6, 0.24]],
        [[0.16, belt - 0.12], [0.5, knee + 0.04], [0.62, 0.24]]
    ];
    const torso: Point[] = [
        [-0.31, belt - 0.16], [0.31, belt - 0.16], [0.45, shoulder - 0.16], [0.3, shoulder + 0.09], [-0.2, shoulder + 0.09], [-0.36, shoulder - 0.2]
    ];
    const backArm: Point[] = [[-0.2, shoulder - 0.02], [-0.56, shoulder - 0.06], hands];
    const frontArm: Point[] = [[0.3, shoulder - 0.05], [0.2, shoulder - 0.4], hands];

    // Bate casi vertical, un poco hacia atrás: mango fino en las manos, barril arriba
    const batEnd: Point = [-0.5, shoulder + 1.13];
    const dx = batEnd[0] - hands[0];
    const dz = batEnd[1] - hands[1];
    const length = Math.hypot(dx, dz);
    const nx = -dz / length;
    const nz = dx / length;
    const at = (t: number, half: number, sign: number): Point => [hands[0] + dx * t + nx * half * sign, hands[1] + dz * t + nz * half * sign];
    const bat = [at(-0.08, 0.04, 1), at(0.4, 0.045, 1), at(0.97, 0.105, 1), at(1, 0.07, 1), at(1, -0.07, 1), at(0.97, 0.105, -1), at(0.4, 0.045, -1), at(-0.08, 0.04, -1)];

    const arm = (points: Point[], key: string) => (
        <g key={key}>
            <path d={line(points)} stroke={OUTLINE} strokeWidth={w(0.27)} {...round} />
            <path d={line(points)} stroke={sleeve} strokeWidth={w(0.2)} {...round} />
        </g>
    );

    return (
        <g aria-hidden="true">
            <ellipse cx={toX(0)} cy={sy(0.08)} rx={w(0.95)} ry={w(0.09)} fill="rgb(var(--ink))" opacity={0.1} />

            {/* Brazo de atrás detrás del cuerpo */}
            {arm(backArm, 'back')}

            {/* Piernas: pantalón, medias del color secundario y spikes */}
            {legs.map((leg, index) => {
                const sockTop: Point = [leg[1][0] + (leg[2][0] - leg[1][0]) * 0.5, knee * 0.5];
                return (
                    <g key={index}>
                        <path d={line(leg)} stroke={EDGE} strokeWidth={w(0.4)} {...round} />
                        <path d={line(leg)} stroke={colors.pants} strokeWidth={w(0.36)} {...round} />
                        <path d={line([sockTop, leg[2]])} stroke={EDGE} strokeWidth={w(0.31)} {...round} />
                        <path d={line([sockTop, leg[2]])} stroke={colors.trim} strokeWidth={w(0.27)} {...round} />
                        <path d={`M ${p([leg[2][0] - 0.18, 0.1])} L ${p([leg[2][0] + 0.24, 0.1])}`} stroke="#1c222b" strokeWidth={w(0.17)} {...round} />
                    </g>
                );
            })}

            {/* Torso: camiseta del equipo con ribete y cinturón */}
            <path d={`${line(torso)} Z`} fill={colors.jersey} stroke={colors.jersey} strokeWidth={w(0.14)} strokeLinejoin="round" />
            <path d={line([[0.42, shoulder - 0.2], [0.3, belt - 0.1]])} stroke={colors.trim} strokeWidth={w(0.05)} opacity={0.85} {...round} />
            <path d={line([[-0.37, belt - 0.05], [0.37, belt - 0.05]])} stroke="#1c222b" strokeWidth={w(0.08)} {...round} />

            {/* Bate */}
            <path d={`M ${bat.map(p).join(' L ')} Z`} fill="#d2ab70" stroke="#7d5a2c" strokeWidth={w(0.025)} strokeLinejoin="round" />

            {/* Brazo de adelante cruzando el pecho y guantes de bateo */}
            {arm(frontArm, 'front')}
            <circle cx={toX(hands[0])} cy={sy(hands[1])} r={w(0.13)} fill={colors.trim} stroke={EDGE} strokeWidth={w(0.03)} />

            {/* Casco del color del equipo: visera hacia el plato, orejera y brillo */}
            <circle cx={toX(0.1)} cy={sy(head)} r={w(0.32)} fill={colors.jersey} stroke={OUTLINE} strokeWidth={w(0.03)} />
            <path d={`M ${p([0.28, head - 0.06])} L ${p([0.56, head - 0.13])}`} stroke={colors.jersey} strokeWidth={w(0.09)} {...round} />
            <circle cx={toX(-0.02)} cy={sy(head - 0.07)} r={w(0.12)} fill={shade(colors.jersey, -0.3)} />
            <circle cx={toX(0.18)} cy={sy(head + 0.13)} r={w(0.07)} fill="#fff" opacity={0.35} />
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
