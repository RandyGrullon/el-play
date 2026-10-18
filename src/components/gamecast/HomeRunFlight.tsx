import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AtBat } from '../../types';
import { camera, flightMs, flightOf, groundAt, heightAt, parkFor, polar, wallAt, wallCrossing } from '../../lib/flight';

// El jonrón visto desde detrás de home, como en la transmisión: el parque a escala (con sus medidas cuando MLB las da),
// la bola que sale hacia donde la sacó el bateador, sube según el ángulo de salida, pasa la cerca y cae en el punto que
// marcó MLB, con la estela, la sombra en el piso y la velocidad, el ángulo y la distancia contando.

const W = 360;
const H = 250;
const STEP = 1.5;

interface Props {
    atBat: AtBat | null;
    venue?: string;
    /** Color del equipo, tinta sobre ese color y acento (estela, cerca) */
    color: string;
    ink: string;
    accent: string;
    /** Cuándo sale el batazo (ms desde que aparece) */
    delay: number;
    reduce: boolean;
}

const pts = (list: { x: number; y: number }[]) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export const HomeRunFlight: React.FC<Props> = ({ atBat, venue, color, ink, accent, delay, reduce }) => {
    const { t, i18n } = useTranslation();
    const flight = useMemo(() => flightOf(atBat), [atBat]);
    const park = useMemo(() => parkFor(venue), [venue]);
    const project = useMemo(() => camera(park, W, H), [park]);
    const scene = useRef<SVGGElement>(null);
    const glow = useRef<SVGPathElement>(null);
    const core = useRef<SVGPathElement>(null);
    const ball = useRef<SVGCircleElement>(null);
    const shadow = useRef<SVGEllipseElement>(null);
    const landing = useRef<SVGGElement>(null);
    const flash = useRef<SVGPathElement>(null);
    const burst = useRef<SVGCircleElement>(null);
    const distRef = useRef<HTMLSpanElement>(null);
    const evRef = useRef<HTMLSpanElement>(null);
    const laRef = useRef<HTMLSpanElement>(null);

    const number = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }), [i18n.language]);

    // El parque, fijo: césped, tierra del cuadro, bases, líneas de foul, cerca con su alto, gradas y medidas
    const field = useMemo(() => {
        const angles: number[] = [];
        for (let a = -45; a <= 45.001; a += STEP) angles.push(a);
        const wallBottom = angles.map((a) => {
            const p = polar(a, wallAt(park, a));
            return project(p.x, p.y, 0);
        });
        const wallTop = angles.map((a) => {
            const p = polar(a, wallAt(park, a));
            return project(p.x, p.y, park.wall);
        });
        const standsTop = angles.map((a) => {
            const p = polar(a, wallAt(park, a) + 70);
            return project(p.x, p.y, 38);
        });
        const home = project(0, 0, 0);
        // Grama cortada en franjas, como en los parques (una cuña sí y otra no)
        const stripes: string[] = [];
        for (let a = -45; a < 45; a += 15) {
            const wedge = [home];
            for (let b = a; b <= a + 7.5 + 0.001; b += STEP) {
                const p = polar(b, wallAt(park, b));
                wedge.push(project(p.x, p.y, 0));
            }
            stripes.push(pts(wedge));
        }
        // Tierra del cuadro: arco de 95 pies desde el montículo, de línea a línea
        const dirt = [home, project(90.2, 90.2)];
        for (let phi = 18.2; phi <= 161.8; phi += 6) dirt.push(project(95 * Math.cos((phi * Math.PI) / 180), 60.5 + 95 * Math.sin((phi * Math.PI) / 180)));
        dirt.push(project(-90.2, 90.2));
        const bases = [project(63.6, 63.6), project(0, 127.3), project(-63.6, 63.6)];
        const grassInner = [project(0, 6), project(58, 63.6), project(0, 121), project(-58, 63.6)];
        const poleL = polar(-45, park.left);
        const poleR = polar(45, park.right);
        const marks = park.known
            ? [
                  { a: -45, d: park.left },
                  { a: 0, d: park.center },
                  { a: 45, d: park.right }
              ].map(({ a, d }) => {
                  const p = polar(a, d);
                  return { ...project(p.x, p.y, park.wall + 9), d };
              })
            : [];
        return {
            stripes,
            fair: pts([home, ...wallBottom]),
            wall: pts([...wallBottom, ...[...wallTop].reverse()]),
            wallTop: `M${pts(wallTop).replace(/ /g, ' L')}`,
            stands: pts([...wallTop, ...[...standsTop].reverse()]),
            dirt: pts(dirt),
            grassInner: pts(grassInner),
            bases,
            home,
            mound: project(0, 60.5),
            lines: [project(poleL.x, poleL.y), project(poleR.x, poleR.y)],
            poles: [
                [project(poleL.x, poleL.y, 0), project(poleL.x, poleL.y, 45)],
                [project(poleR.x, poleR.y, 0), project(poleR.x, poleR.y, 45)]
            ],
            marks
        };
    }, [park, project]);

    // La estela, la bola y su sombra en el instante `t` (0-1 del tiempo de vuelo)
    const geometry = useMemo(() => {
        if (!flight) return null;
        const homeDepth = project(0, 0, 0).depth;
        const at = (s: number) => {
            const ground = { x: flight.land.x * s, y: flight.land.y * s };
            const z = heightAt(flight, s);
            return { air: project(ground.x, ground.y, z), floor: project(ground.x, ground.y, 0), z };
        };
        const trail = (s: number) => {
            const list = [];
            const count = Math.max(2, Math.round(s * 90));
            for (let i = 0; i <= count; i++) list.push(at((s * i) / count).air);
            return `M${list.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`;
        };
        const crossing = wallCrossing(flight, park);
        const wallSpan = (() => {
            const list = [];
            for (let a = flight.deg - 7; a <= flight.deg + 7; a += 1) {
                const p = polar(a, wallAt(park, a));
                list.push(project(p.x, p.y, park.wall));
            }
            return `M${list.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`;
        })();
        const land = project(flight.land.x, flight.land.y, 0);
        return { at, trail, crossing, wallSpan, land, homeDepth, ms: flightMs(flight) };
    }, [flight, park, project]);

    useEffect(() => {
        if (!flight || !geometry) return;
        const { at, trail, crossing, land, homeDepth, ms } = geometry;
        const radius = (depth: number) => Math.max(2.4, Math.min(8, (7 * homeDepth) / depth));
        const fmt = (value: number) => number.format(Math.round(value * 10) / 10);
        let raf = 0;
        let flashed = false;
        let landed = false;

        const draw = (time: number) => {
            const s = groundAt(time);
            const { air, floor, z } = at(s);
            const d = trail(s);
            glow.current?.setAttribute('d', d);
            core.current?.setAttribute('d', d);
            if (ball.current) {
                ball.current.setAttribute('cx', air.x.toFixed(1));
                ball.current.setAttribute('cy', air.y.toFixed(1));
                ball.current.setAttribute('r', radius(air.depth).toFixed(2));
            }
            if (shadow.current) {
                const r = radius(floor.depth);
                shadow.current.setAttribute('cx', floor.x.toFixed(1));
                shadow.current.setAttribute('cy', floor.y.toFixed(1));
                shadow.current.setAttribute('rx', (r * 1.2).toFixed(2));
                shadow.current.setAttribute('ry', (r * 0.45).toFixed(2));
                shadow.current.setAttribute('opacity', (0.42 - 0.3 * Math.min(1, z / Math.max(1, flight.apex))).toFixed(2));
            }
            // Cámara: se acerca un poco hacia donde va a caer
            if (scene.current) {
                const k = 1 + 0.07 * s;
                scene.current.setAttribute('transform', `translate(${land.x * (1 - k)} ${land.y * (1 - k)}) scale(${k})`);
            }
            if (distRef.current) distRef.current.textContent = t('anim.feet', { ft: Math.round(flight.dist * s) });
            if (evRef.current && flight.ev !== null) evRef.current.textContent = `${fmt(flight.ev * Math.min(1, time * 3))} mph`;
            if (laRef.current && flight.la !== null) laRef.current.textContent = `${Math.round(flight.la * Math.min(1, time * 3))}°`;
            if (!flashed && crossing !== null && s >= crossing) {
                flashed = true;
                flash.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'both' });
            }
            if (!landed && time >= 1) {
                landed = true;
                if (distRef.current) distRef.current.textContent = t('anim.feet', { ft: Math.round(flight.dist) });
                landing.current?.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
                landing.current?.querySelectorAll('.hrf-ring').forEach((ring, index) =>
                    ring.animate([{ transform: 'scale(.2)', opacity: 0.9 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 900, delay: index * 260, iterations: 2, easing: 'ease-out', fill: 'both' })
                );
            }
        };

        if (reduce) {
            draw(1);
            return;
        }
        draw(0);
        const start = performance.now() + delay;
        burst.current?.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(.2)', opacity: 0.9, offset: 0.01 }, { transform: 'scale(1.8)', opacity: 0 }], { duration: 500, delay, easing: 'ease-out', fill: 'both' });
        const tick = (now: number) => {
            const time = Math.max(0, Math.min(1, (now - start) / ms));
            draw(time);
            if (time < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [flight, geometry, delay, reduce, number, t]);

    if (!flight || !geometry) return null;
    const home = field.home;
    const label = t('anim.flightLabel', { ft: Math.round(flight.dist), dir: t(flight.deg < -15 ? 'anim.toLeft' : flight.deg > 15 ? 'anim.toRight' : 'anim.toCenter') });

    return (
        <div className="hrf relative w-full max-w-[400px]">
            <svg viewBox={`0 0 ${W} ${H}`} className="block w-full overflow-visible" role="img" aria-label={label} style={{ color: ink }}>
                <defs>
                    <linearGradient id="hrf-grass" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="currentColor" stopOpacity={0.2} />
                        <stop offset="1" stopColor="currentColor" stopOpacity={0.07} />
                    </linearGradient>
                    <filter id="hrf-blur" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2.4" />
                    </filter>
                </defs>
                <g ref={scene}>
                    <polygon points={field.stands} fill="currentColor" fillOpacity={0.1} />
                    <polygon points={field.fair} fill="url(#hrf-grass)" />
                    {field.stripes.map((stripe, index) => (
                        <polygon key={index} points={stripe} fill="currentColor" fillOpacity={0.05} />
                    ))}
                    <polygon points={field.dirt} fill="currentColor" fillOpacity={0.14} />
                    <polygon points={field.grassInner} fill="currentColor" fillOpacity={0.08} />
                    {field.lines.map((end, index) => (
                        <line key={index} x1={home.x} y1={home.y} x2={end.x} y2={end.y} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.1} />
                    ))}
                    <polygon points={field.wall} fill="currentColor" fillOpacity={0.3} />
                    <path d={field.wallTop} fill="none" stroke="currentColor" strokeOpacity={0.85} strokeWidth={1.4} />
                    {field.poles.map(([bottom, top], index) => (
                        <line key={index} x1={bottom.x} y1={bottom.y} x2={top.x} y2={top.y} stroke="currentColor" strokeOpacity={0.9} strokeWidth={1.6} strokeLinecap="round" />
                    ))}
                    {field.marks.map((mark) => (
                        <text key={mark.d + '-' + mark.x} x={mark.x} y={mark.y} textAnchor="middle" fontSize={9} fontWeight={800} fill="currentColor" fillOpacity={0.8} className="tabular-nums">
                            {mark.d}
                        </text>
                    ))}
                    <circle cx={field.mound.x} cy={field.mound.y} r={2.6} fill="currentColor" fillOpacity={0.3} />
                    {field.bases.map((base, index) => (
                        <rect key={index} x={base.x - 2.2} y={base.y - 1.2} width={4.4} height={2.4} fill="currentColor" fillOpacity={0.9} />
                    ))}
                    <path d={`M${home.x - 3} ${home.y - 1} L${home.x + 3} ${home.y - 1} L${home.x + 3} ${home.y + 1} L${home.x} ${home.y + 2.4} L${home.x - 3} ${home.y + 1} Z`} fill="currentColor" />
                    <path ref={flash} d={geometry.wallSpan} fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" opacity={0} />
                    <g ref={landing} opacity={reduce ? 1 : 0}>
                        <circle className="hrf-ring" cx={geometry.land.x} cy={geometry.land.y} r={9} fill="none" stroke={accent} strokeWidth={2} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                        <circle className="hrf-ring" cx={geometry.land.x} cy={geometry.land.y} r={9} fill="none" stroke="currentColor" strokeWidth={1.5} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                        <circle cx={geometry.land.x} cy={geometry.land.y} r={2.6} fill={accent} />
                        <line x1={geometry.land.x} y1={geometry.land.y} x2={geometry.land.x} y2={geometry.land.y - 22} stroke="currentColor" strokeWidth={1.2} />
                        <g transform={`translate(${geometry.land.x} ${geometry.land.y - 30})`}>
                            <rect x={-27} y={-9} width={54} height={17} rx={8.5} fill="currentColor" />
                            <text x={0} y={3.6} textAnchor="middle" fontSize={10.5} fontWeight={900} fill={color} className="tabular-nums">
                                {t('anim.feet', { ft: Math.round(flight.dist) })}
                            </text>
                        </g>
                    </g>
                    <ellipse ref={shadow} cx={home.x} cy={home.y} rx={4} ry={1.6} fill="#000" opacity={0} />
                    <path ref={glow} d="" fill="none" stroke={accent} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} filter="url(#hrf-blur)" />
                    <path ref={core} d="" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                    <circle ref={burst} cx={home.x} cy={home.y} r={14} fill="none" stroke="#fff" strokeWidth={2} opacity={0} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                    <circle ref={ball} cx={home.x} cy={home.y} r={6} fill="#fff" stroke={accent} strokeWidth={1.4} />
                </g>
            </svg>
            <div className="mt-1 flex justify-center gap-2 text-[12px] font-extrabold tabular-nums" aria-hidden="true">
                {flight.ev !== null && (
                    <span className="hrf-chip">
                        <span className="hrf-chip-label">{t('anim.exitVelo')}</span>
                        <span ref={evRef}>{reduce ? `${number.format(flight.ev)} mph` : '0 mph'}</span>
                    </span>
                )}
                {flight.la !== null && (
                    <span className="hrf-chip">
                        <span className="hrf-chip-label">{t('anim.launchAngle')}</span>
                        <span ref={laRef}>{reduce ? `${Math.round(flight.la)}°` : '0°'}</span>
                    </span>
                )}
                <span className="hrf-chip">
                    <span className="hrf-chip-label">{t('anim.distance')}</span>
                    <span ref={distRef}>{t('anim.feet', { ft: reduce ? Math.round(flight.dist) : 0 })}</span>
                </span>
            </div>
        </div>
    );
};

/** Cuánto dura el vuelo (para que la tarjeta espere a que caiga); null si no hay batazo marcado */
export const homeRunFlightMs = (atBat: AtBat | null) => {
    const flight = flightOf(atBat);
    return flight ? flightMs(flight) : null;
};
