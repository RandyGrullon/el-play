import React from 'react';
import { Pitch } from '../../types';

interface StrikeZoneProps {
    pitches?: Pitch[];
}

export const StrikeZone: React.FC<StrikeZoneProps> = ({ pitches = [] }) => {
    // Constants for scaling (in feet)
    const SCALE = 60; // pixels per foot
    const WIDTH = 200; // SVG width
    const HEIGHT = 300; // SVG height

    // Center of the SVG horizontally
    const CX = WIDTH / 2;
    // Ground level in SVG coordinates (bottom of SVG)
    const GROUND_Y = HEIGHT;

    // Plate width in feet (17 inches)
    const PLATE_WIDTH = 17 / 12;
    const HALF_PLATE = PLATE_WIDTH / 2;

    // Use the last pitch to determine the strike zone limits (usually consistent per batter)
    const lastPitch = pitches.length > 0 ? pitches[pitches.length - 1] : null;
    const szTop = lastPitch?.strikeZoneTop || 3.5;
    const szBottom = lastPitch?.strikeZoneBottom || 1.5;

    // Calculate zone rectangle in SVG coordinates
    const zoneX = CX - (HALF_PLATE * SCALE);
    const zoneY = GROUND_Y - (szTop * SCALE);
    const zoneWidth = PLATE_WIDTH * SCALE;
    const zoneHeight = (szTop - szBottom) * SCALE;

    const getPitchColor = (code: string) => {
        if (['S', 'C', 'W'].includes(code)) { // Strike, Called Strike, Whiff
            return 'fill-red-600';
        } else if (['B'].includes(code)) { // Ball
            return 'fill-green-500';
        } else if (['X', 'D', 'E'].includes(code)) { // In Play
            return 'fill-blue-500';
        }
        return 'fill-zinc-400';
    };

    return (
        <div className="flex flex-col items-center">
            <div className="relative border border-zinc-800 bg-zinc-900/50 rounded-xl p-4 shadow-inner">
                <svg width={WIDTH} height={HEIGHT} className="overflow-visible">
                    {/* Home Plate (Visual reference at bottom) */}
                    <path
                        d={`
                            M ${CX - (HALF_PLATE * SCALE)} ${GROUND_Y} 
                            L ${CX + (HALF_PLATE * SCALE)} ${GROUND_Y} 
                            L ${CX + (HALF_PLATE * SCALE)} ${GROUND_Y - 10} 
                            L ${CX} ${GROUND_Y - 20} 
                            L ${CX - (HALF_PLATE * SCALE)} ${GROUND_Y - 10} 
                            Z
                        `}
                        fill="#fff"
                        opacity="0.2"
                    />

                    {/* Strike Zone Box */}
                    <rect
                        x={zoneX}
                        y={zoneY}
                        width={zoneWidth}
                        height={zoneHeight}
                        fill="rgba(255, 255, 255, 0.05)"
                        stroke="rgba(255, 255, 255, 0.3)"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                    />

                    {/* Inner Grid Lines (3x3) */}
                    <line x1={zoneX + zoneWidth / 3} y1={zoneY} x2={zoneX + zoneWidth / 3} y2={zoneY + zoneHeight} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <line x1={zoneX + 2 * zoneWidth / 3} y1={zoneY} x2={zoneX + 2 * zoneWidth / 3} y2={zoneY + zoneHeight} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <line x1={zoneX} y1={zoneY + zoneHeight / 3} x2={zoneX + zoneWidth} y2={zoneY + zoneHeight / 3} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    <line x1={zoneX} y1={zoneY + 2 * zoneHeight / 3} x2={zoneX + zoneWidth} y2={zoneY + 2 * zoneHeight / 3} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

                    {/* Pitches */}
                    {pitches.map((pitch, index) => {
                        const pitchCx = CX + (pitch.coordinates.pX * SCALE);
                        const pitchCy = GROUND_Y - (pitch.coordinates.pZ * SCALE);
                        const isLast = index === pitches.length - 1;
                        const colorClass = getPitchColor(pitch.code);

                        return (
                            <g key={index}>
                                {/* Pitch Circle */}
                                <circle
                                    cx={pitchCx}
                                    cy={pitchCy}
                                    r="10"
                                    className={`${colorClass} stroke-white stroke-2`}
                                />
                                {/* Pitch Number */}
                                <text
                                    x={pitchCx}
                                    y={pitchCy}
                                    dy="0.3em"
                                    textAnchor="middle"
                                    className="text-[10px] font-bold fill-white pointer-events-none"
                                >
                                    {pitch.id}
                                </text>

                                {/* Halo for last pitch */}
                                {isLast && (
                                    <circle
                                        cx={pitchCx}
                                        cy={pitchCy}
                                        r="14"
                                        fill="none"
                                        stroke="white"
                                        strokeOpacity="0.5"
                                        className="animate-pulse"
                                    />
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* Info Overlay for Last Pitch */}
                {lastPitch && (
                    <div className="absolute top-2 left-2 right-2 flex justify-between items-start text-[10px] uppercase font-bold tracking-wider">
                        <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-white">
                            {lastPitch.speed ? `${lastPitch.speed.toFixed(1)} MPH` : ''}
                        </div>
                        <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-cyan-400">
                            {lastPitch.type || ''}
                        </div>
                    </div>
                )}

                {lastPitch && (
                    <div className="absolute bottom-2 left-0 right-0 text-center">
                        <span className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white">
                            {lastPitch.call}
                        </span>
                    </div>
                )}
            </div>
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-3">Zona de Strike</h3>
        </div>
    );
};
