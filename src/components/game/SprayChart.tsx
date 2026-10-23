import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { battedBalls, eventName, inningName, type BattedKind } from '../../lib/baseball';
import { Segmented } from '../ui/Segmented';

// Mapa de batazos: dónde cayó cada bola puesta en juego. Las coordenadas son las del cuadro de Gameday (250×250,
// home en ≈125,198, ~2,5 pies por unidad); el anotador las marca en todos los estadios, también en los que no
// tienen rastreo de lanzamientos (Francisco Micheli y Julián Javier).
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

export const SPRAY_COLORS: Record<BattedKind, string> = {
    hr: 'rgb(var(--live))',
    hit: 'rgb(var(--accent))',
    out: 'rgb(var(--muted))'
};

const COLORS = SPRAY_COLORS;

/** Del cuadro de Gameday al dibujo (home en 0,0) */
export const fieldPoint = (x: number, y: number) => [x - HOME_X, y - HOME_Y] as const;
export const FIELD_VIEWBOX = '-112 -182 224 198';

/** El terreno (jardín, tierra, cuadro, bases y home) para poner encima los batazos */
export const FieldBackdrop: React.FC = () => (
    <>
        <path d={FENCE} fill="#3f9b63" fillOpacity={0.2} stroke="#3f9b63" strokeOpacity={0.55} strokeWidth={1.2} />
        <path d={DIRT} fill="#c08a52" fillOpacity={0.3} />
        <path d={INFIELD} fill="#3f9b63" fillOpacity={0.28} />
        <g stroke="#ffffff" strokeOpacity={0.9} strokeWidth={0.8}>
            <line x1={0} y1={0} x2={-POLE} y2={-POLE} />
            <line x1={0} y1={0} x2={POLE} y2={-POLE} />
        </g>
        {BASES.map(([x, y]) => (
            <rect key={`${x}${y}`} x={x - 1.8} y={y - 1.8} width={3.6} height={3.6} fill="#ffffff" transform={`rotate(45 ${x} ${y})`} />
        ))}
        <path d="M-2 0.6 L2 0.6 L2 2.4 L0 4 L-2 2.4 Z" fill="#ffffff" />
    </>
);

type Filter = 'all' | 'away' | 'home';

export const SprayChart: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const [filter, setFilter] = useState<Filter>('all');
    const [selected, setSelected] = useState<number | null>(null);
    const all = useMemo(() => battedBalls(game.atBats), [game.atBats]);
    const balls = filter === 'all' ? all : all.filter((ball) => ball.side === filter);
    const current = balls.find((ball) => ball.atBat.i === selected) ?? null;
    const count = (kind: BattedKind) => balls.filter((ball) => ball.kind === kind).length;

    if (!all.length) return null;

    const pick = (value: Filter) => {
        setFilter(value);
        setSelected(null);
    };

    return (
        <section className="card overflow-hidden" aria-labelledby="spray-title">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/10 px-4 py-3">
                <h2 id="spray-title" className="eyebrow">{t('spray.title')}</h2>
                <Segmented<Filter>
                    size="sm"
                    label={t('spray.filter')}
                    value={filter}
                    onChange={pick}
                    options={[
                        { value: 'all', label: t('spray.both') },
                        { value: 'away', label: game.away.abbrev },
                        { value: 'home', label: game.home.abbrev }
                    ]}
                />
            </header>

            <div className="px-3 pt-2">
                <svg viewBox={FIELD_VIEWBOX} className="mx-auto h-auto w-full max-w-[420px] select-none" role="img" aria-label={t('spray.aria', { count: balls.length })}>
                    <FieldBackdrop />

                    {balls.map((ball) => {
                        const active = ball.atBat.i === selected;
                        const cx = ball.x - HOME_X;
                        const cy = ball.y - HOME_Y;
                        return (
                            <g key={ball.atBat.i} onClick={() => setSelected(active ? null : ball.atBat.i)} style={{ cursor: 'pointer' }} opacity={selected !== null && !active ? 0.35 : 1}>
                                <title>{`${ball.atBat.batter.name} · ${eventName(ball.atBat, i18n.language)}`}</title>
                                {active && <circle cx={cx} cy={cy} r={8} fill="none" stroke={COLORS[ball.kind]} strokeWidth={1.5} />}
                                {/* Área para tocar más grande que el punto */}
                                <circle cx={cx} cy={cy} r={7} fill="transparent" />
                                <circle cx={cx} cy={cy} r={ball.kind === 'hr' ? 4.6 : 3.8} fill={COLORS[ball.kind]} stroke="rgb(var(--surface))" strokeWidth={1.1} />
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div className="px-4 pb-4">
                {current ? (
                    <div className="rounded-2xl bg-raised p-3 text-sm">
                        <p className="font-extrabold">
                            {current.atBat.batter.name} · <span style={{ color: COLORS[current.kind] }}>{eventName(current.atBat, i18n.language)}</span>
                        </p>
                        <p className="mt-0.5 text-muted">
                            {[
                                inningName({ n: current.atBat.inning, isTop: current.atBat.top }, i18n.language),
                                current.pitch.hit?.traj ? t(`spray.traj.${current.pitch.hit.traj}`, { defaultValue: current.pitch.hit.traj.replace(/_/g, ' ') }) : '',
                                current.pitch.hit?.hard ? t(`spray.hard.${current.pitch.hit.hard}`, { defaultValue: current.pitch.hit.hard }) : '',
                                current.pitch.hit?.ev ? t('zone.exitVelo', { mph: current.pitch.hit.ev }) : '',
                                current.pitch.hit?.dist && current.pitch.hit.dist > 30 ? t('spray.feet', { ft: current.pitch.hit.dist }) : ''
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    </div>
                ) : (
                    <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-muted">
                        <Legend color={COLORS.hit} label={t('spray.hits', { count: count('hit') })} />
                        <Legend color={COLORS.hr} label={t('spray.homeRuns', { count: count('hr') })} />
                        <Legend color={COLORS.out} label={t('spray.outs', { count: count('out') })} />
                        <span className="text-faint">{t('spray.tap')}</span>
                    </p>
                )}
            </div>
        </section>
    );
};

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
    </span>
);
