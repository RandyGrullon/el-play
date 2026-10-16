import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Pitch } from '../../types';
import { RESULT_COLORS, pitchCallName, pitchTypeColor, pitchTypeName } from '../../lib/baseball';
import { BatterFigure, type UniformColors } from './BatterFigure';

// Zona de strike en pies reales, vista del receptor (pX > 0 = lado de primera base).
// 1 pie = 100 unidades del viewBox; el suelo (pZ = 0) está en y = 520.
const UNIT = 100;
const HALF_WIDTH = 2.35; // pies visibles a cada lado del centro del plato (cabe el bateador en su caja)
const TOP_FT = 5.45; // hasta el casco del bateador
const GROUND = TOP_FT * UNIT + 20;
const VIEW_W = HALF_WIDTH * 2 * UNIT;
const VIEW_H = GROUND + 40;
const HALF_PLATE = 17 / 12 / 2; // 8.5 pulgadas
const BALL_R = 0.145 * UNIT; // un poco mayor que la bola real (0.121 ft) para que se lea el número
const STD_TOP = 3.4;
const STD_BOT = 1.6;

const sx = (pX: number) => VIEW_W / 2 + pX * UNIT;
const sy = (pZ: number) => GROUND - pZ * UNIT;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface StrikeZoneProps {
    pitches: Pitch[];
    /** 'sequence': numerados y por resultado; 'types': todos los del lanzador por tipo */
    mode?: 'sequence' | 'types';
    batterSide?: string | null;
    /** Colores del uniforme del bateador; sin ellos se dibuja en gris */
    uniform?: UniformColors;
    selected?: number | null;
    onSelect?: (index: number | null) => void;
    className?: string;
    showLegend?: boolean;
}

const median = (values: number[], fallback: number) => {
    const list = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    return list.length ? list[Math.floor(list.length / 2)] : fallback;
};

export const StrikeZone: React.FC<StrikeZoneProps> = ({ pitches, mode = 'sequence', batterSide, uniform, selected = null, onSelect, className = '', showLegend = true }) => {
    const { t, i18n } = useTranslation();
    const byType = mode === 'types';

    // En "sequence" es un solo bateador: su zona. En "types" hay muchos bateadores: se normaliza cada
    // pitcheo a una zona estándar (como los mapas de Statcast) para que sean comparables.
    const top = byType ? STD_TOP : median(pitches.map((p) => p.top ?? NaN), STD_TOP);
    const bot = byType ? STD_BOT : median(pitches.map((p) => p.bot ?? NaN), STD_BOT);
    const zoneLeft = sx(-HALF_PLATE);
    const zoneWidth = HALF_PLATE * 2 * UNIT;
    const zoneTop = sy(top);
    const zoneHeight = (top - bot) * UNIT;

    const located = pitches
        .map((pitch, index) => ({ pitch, index }))
        .filter(({ pitch }) => pitch.x !== null && pitch.z !== null)
        .map(({ pitch, index }) => {
            let z = pitch.z as number;
            if (byType && pitch.top && pitch.bot && pitch.top > pitch.bot) {
                z = STD_BOT + ((z - pitch.bot) / (pitch.top - pitch.bot)) * (STD_TOP - STD_BOT);
            }
            const x = pitch.x as number;
            const outside = Math.abs(x) > HALF_WIDTH - 0.15 || z < 0.15 || z > TOP_FT - 0.15;
            return {
                pitch,
                index,
                cx: sx(clamp(x, -HALF_WIDTH + 0.15, HALF_WIDTH - 0.15)),
                cy: sy(clamp(z, 0.15, TOP_FT - 0.15)),
                outside
            };
        });

    const lastIndex = located.length ? located[located.length - 1].index : -1;
    const missing = pitches.length - located.length;
    const side = batterSide === 'L' ? 'L' : batterSide === 'R' ? 'R' : null;

    const label = (pitch: Pitch) =>
        `${pitch.n ?? ''} ${pitchTypeName(pitch, i18n.language)} ${pitch.mph ? `${pitch.mph} mph` : ''} — ${pitchCallName(pitch, i18n.language)}`;

    // Estadios sin rastreo (en LIDOM: Francisco Micheli y Julián Javier): MLB no trae ubicación, velocidad ni tipo.
    // En vez de una zona vacía se muestra la secuencia del turno con el resultado y el conteo de cada pitcheo.
    if (!byType && pitches.length > 0 && located.length === 0) {
        return (
            <figure className={`flex flex-col items-center ${className}`}>
                <ol className="flex flex-wrap justify-center gap-x-2 gap-y-3 py-4" aria-label={t('zone.sequence')}>
                    {pitches.map((pitch, index) => {
                        const isSelected = selected === index;
                        const color = RESULT_COLORS[pitch.r];
                        return (
                            <li key={`${index}-${pitch.n}`} className="flex flex-col items-center gap-1">
                                <button
                                    type="button"
                                    title={label(pitch)}
                                    onClick={onSelect ? () => onSelect(isSelected ? null : index) : undefined}
                                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${index === pitches.length - 1 ? 'animate-pitch-in' : ''}`}
                                    style={{ backgroundColor: color, boxShadow: isSelected ? `0 0 0 3px rgb(var(--surface)), 0 0 0 6px ${color}` : undefined, opacity: selected !== null && !isSelected ? 0.4 : 1 }}
                                >
                                    {pitch.n ?? index + 1}
                                </button>
                                <span className="num text-[11px] text-muted">{pitch.b !== null && pitch.s !== null && pitch.r !== 'inplay' ? `${pitch.b}-${pitch.s}` : '·'}</span>
                            </li>
                        );
                    })}
                </ol>
                {showLegend && (
                    <figcaption className="flex flex-col items-center gap-1.5 text-center text-[11px] text-muted">
                        <span className="flex flex-wrap justify-center gap-x-3">
                            <Legend color={RESULT_COLORS.ball} label={t('zone.ball')} />
                            <Legend color={RESULT_COLORS.strike} label={t('zone.strike')} />
                            <Legend color={RESULT_COLORS.inplay} label={t('zone.inPlay')} />
                        </span>
                        <span className="max-w-[300px] text-faint">{t('zone.untracked')}</span>
                    </figcaption>
                )}
            </figure>
        );
    }

    return (
        <figure className={`flex flex-col items-center ${className}`}>
            <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="h-auto w-full max-w-[340px] select-none"
                role="img"
                aria-label={t('zone.aria', { count: pitches.length })}
            >
                {/* Bateador en su caja con el uniforme de su equipo (no en la vista por lanzador: son varios bateadores) */}
                {side && !byType && (
                    <BatterFigure
                        side={side}
                        top={top}
                        bot={bot}
                        colors={uniform ?? { jersey: 'rgb(var(--faint))', trim: 'rgb(var(--muted))', pants: 'rgb(var(--raised))' }}
                        sx={sx}
                        sy={sy}
                        unit={UNIT}
                    />
                )}

                {/* Borde de la zona (una bola por fuera) */}
                <rect
                    x={zoneLeft - BALL_R}
                    y={zoneTop - BALL_R}
                    width={zoneWidth + BALL_R * 2}
                    height={zoneHeight + BALL_R * 2}
                    rx={10}
                    fill="rgb(var(--zone-bg) / 0.03)"
                    stroke="rgb(var(--zone-bg) / 0.12)"
                    strokeDasharray="6 6"
                />
                {/* Zona reglamentaria 3x3 */}
                <rect x={zoneLeft} y={zoneTop} width={zoneWidth} height={zoneHeight} fill="rgb(var(--zone-bg) / 0.05)" stroke="rgb(var(--zone-bg) / 0.55)" strokeWidth={3} />
                {[1, 2].map((step) => (
                    <g key={step} stroke="rgb(var(--zone-bg) / 0.18)" strokeWidth={1.5}>
                        <line x1={zoneLeft + (zoneWidth * step) / 3} y1={zoneTop} x2={zoneLeft + (zoneWidth * step) / 3} y2={zoneTop + zoneHeight} />
                        <line x1={zoneLeft} y1={zoneTop + (zoneHeight * step) / 3} x2={zoneLeft + zoneWidth} y2={zoneTop + (zoneHeight * step) / 3} />
                    </g>
                ))}

                {/* Plato */}
                <path
                    d={`M ${sx(-HALF_PLATE)} ${GROUND + 6} L ${sx(HALF_PLATE)} ${GROUND + 6} L ${sx(HALF_PLATE)} ${GROUND + 16} L ${sx(0)} ${GROUND + 28} L ${sx(-HALF_PLATE)} ${GROUND + 16} Z`}
                    fill="rgb(var(--zone-bg) / 0.18)"
                />

                {/* Pitcheos: el más reciente encima */}
                {located.map(({ pitch, index, cx, cy, outside }) => {
                    const isLast = index === lastIndex && !byType;
                    const isSelected = selected === index;
                    const color = byType ? pitchTypeColor(pitch.type) : RESULT_COLORS[pitch.r];
                    const radius = byType ? BALL_R * 0.72 : BALL_R;
                    return (
                        <g
                            key={`${index}-${pitch.n}-${pitch.mph}`}
                            className={isLast ? 'animate-pitch-in' : undefined}
                            style={{ transformOrigin: `${cx}px ${cy}px`, cursor: onSelect ? 'pointer' : undefined }}
                            onClick={onSelect ? () => onSelect(isSelected ? null : index) : undefined}
                            opacity={selected !== null && !isSelected ? 0.35 : outside ? 0.7 : byType ? 0.85 : 1}
                        >
                            <title>{label(pitch)}</title>
                            {(isLast || isSelected) && <circle cx={cx} cy={cy} r={radius + 9} fill="none" stroke={color} strokeWidth={3} opacity={0.55} />}
                            <circle cx={cx} cy={cy} r={radius} fill={color} stroke="rgb(var(--surface))" strokeWidth={3} />
                            {!byType && (
                                <text x={cx} y={cy} dy="0.36em" textAnchor="middle" fontSize={radius * 1.15} fontWeight={700} fill="#fff" fontFamily="Inter, system-ui">
                                    {pitch.n ?? index + 1}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {showLegend && (
                <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
                    {!byType && (
                        <>
                            <Legend color={RESULT_COLORS.ball} label={t('zone.ball')} />
                            <Legend color={RESULT_COLORS.strike} label={t('zone.strike')} />
                            <Legend color={RESULT_COLORS.inplay} label={t('zone.inPlay')} />
                        </>
                    )}
                    <span className="text-faint">{t('zone.catcherView')}</span>
                    {missing > 0 && <span className="text-faint">· {t('zone.noTracking', { count: missing })}</span>}
                </figcaption>
            )}
        </figure>
    );
};

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
    </span>
);
