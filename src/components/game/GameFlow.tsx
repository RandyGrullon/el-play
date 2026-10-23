// «Así va el juego»: la probabilidad de victoria jugada a jugada (lib/liveWinProbability.ts) y las carreras de cada
// equipo entrada por entrada. Arriba de la línea media manda el local; abajo, el visitante.
import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { biggestSwings, winNow, winSeries, type WinPoint } from '../../lib/liveWinProbability';
import { eventName, inningName } from '../../lib/baseball';
import { surname } from '../../lib/format';
import { Segmented } from '../ui/Segmented';
import { TeamLogo } from '../ui/TeamLogo';
import { usePregameWin } from './WinProbability';

const W = 320;
const H = 132;
const PAD = { top: 10, bottom: 18, left: 4, right: 4 };
const plotH = H - PAD.top - PAD.bottom;

type View = 'win' | 'runs';

const WinChart: React.FC<{ game: GameDetail; points: WinPoint[]; swings: WinPoint[] }> = ({ game, points, swings }) => {
    const id = useId().replace(/:/g, '');
    const x = (index: number) => PAD.left + (points.length > 1 ? (index / (points.length - 1)) * (W - PAD.left - PAD.right) : 0);
    const y = (home: number) => PAD.top + (1 - home) * plotH;
    const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.home).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0.5)} L${x(0)},${y(0.5)} Z`;
    // Una marca al empezar cada entrada
    const ticks = points.map((point, index) => ({ point, index })).filter(({ point, index }) => index === 0 || (point.top && points[index - 1].inning !== point.inning));
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
            <defs>
                <clipPath id={`${id}-up`}>
                    <rect x="0" y="0" width={W} height={y(0.5)} />
                </clipPath>
                <clipPath id={`${id}-down`}>
                    <rect x="0" y={y(0.5)} width={W} height={H} />
                </clipPath>
            </defs>
            {[0.25, 0.75].map((level) => (
                <line key={level} x1={PAD.left} x2={W - PAD.right} y1={y(level)} y2={y(level)} stroke="rgb(var(--line) / 0.08)" />
            ))}
            <path d={area} fill={game.home.color} opacity="0.22" clipPath={`url(#${id}-up)`} />
            <path d={area} fill={game.away.color} opacity="0.22" clipPath={`url(#${id}-down)`} />
            <line x1={PAD.left} x2={W - PAD.right} y1={y(0.5)} y2={y(0.5)} stroke="rgb(var(--line) / 0.25)" strokeDasharray="3 3" />
            <path d={line} fill="none" stroke="rgb(var(--ink))" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            {ticks.map(({ point, index }) => (
                <text key={index} x={x(index)} y={H - 4} textAnchor={index === 0 ? 'start' : 'middle'} className="fill-faint" fontSize="9" fontWeight="700">
                    {point.inning}
                </text>
            ))}
            {swings.map((point) => {
                const index = points.indexOf(point);
                const team = point.delta > 0 ? game.home : game.away;
                return <circle key={index} cx={x(index)} cy={y(point.home)} r="4" fill={team.color} stroke="rgb(var(--surface))" strokeWidth="1.5" />;
            })}
            <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].home)} r="3.5" fill="rgb(var(--ink))" />
        </svg>
    );
};

const RunsChart: React.FC<{ game: GameDetail }> = ({ game }) => {
    // Carreras acumuladas al final de cada entrada
    const innings = game.linescore.filter((row) => row.away !== null || row.home !== null);
    const series = (side: 'away' | 'home') => {
        let total = 0;
        return [0, ...innings.map((row) => (total += row[side] ?? 0))];
    };
    const away = series('away');
    const home = series('home');
    const top = Math.max(4, ...away, ...home);
    const x = (index: number) => PAD.left + 10 + (index / Math.max(1, innings.length)) * (W - PAD.left - PAD.right - 20);
    const y = (runs: number) => PAD.top + (1 - runs / top) * plotH;
    const path = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
            {[0, Math.round(top / 2), top].map((level) => (
                <g key={level}>
                    <line x1={PAD.left + 10} x2={W - PAD.right - 10} y1={y(level)} y2={y(level)} stroke="rgb(var(--line) / 0.08)" />
                    <text x={PAD.left} y={y(level) + 3} className="fill-faint" fontSize="9" fontWeight="700">
                        {level}
                    </text>
                </g>
            ))}
            {innings.map((row, index) => (
                <text key={row.n} x={x(index + 1)} y={H - 4} textAnchor="middle" className="fill-faint" fontSize="9" fontWeight="700">
                    {row.n}
                </text>
            ))}
            {(
                [
                    ['away', away],
                    ['home', home]
                ] as const
            ).map(([side, values]) => (
                <g key={side}>
                    <path d={path(values)} fill="none" stroke={game[side].color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
                    {values.map((value, index) => (index ? <circle key={index} cx={x(index)} cy={y(value)} r="2.6" fill={game[side].color} /> : null))}
                </g>
            ))}
        </svg>
    );
};

export const GameFlow: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const [view, setView] = useState<View>('win');
    const prior = usePregameWin(game);
    const points = useMemo(() => {
        const list = winSeries(game, prior);
        // En vivo, el último punto es «ahora» (con los corredores y los outs del turno en curso)
        const now = winNow(game, prior);
        if (game.state === 'live' && now !== null && list.length) list.push({ atBat: null, inning: game.inning?.n ?? 1, top: !!game.inning?.isTop, home: now, delta: now - list[list.length - 1].home });
        return list;
    }, [game, prior]);
    const swings = useMemo(() => biggestSwings(points), [points]);
    if (points.length < 2) return null;

    const current = points[points.length - 1].home;
    const homePct = Math.round(current * 100);
    const leader = homePct >= 50 ? game.home : game.away;
    const leaderPct = homePct >= 50 ? homePct : 100 - homePct;
    const final = game.state === 'final';

    return (
        <section className="card overflow-hidden" aria-labelledby="game-flow">
            <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
                <h2 id="game-flow" className="eyebrow">
                    {t('flow.title')}
                </h2>
                <Segmented
                    size="sm"
                    label={t('flow.title')}
                    value={view}
                    onChange={setView}
                    options={[
                        { value: 'win', label: t('flow.win') },
                        { value: 'runs', label: t('flow.runs') }
                    ]}
                />
            </div>

            {view === 'win' ? (
                <div className="px-4 pb-4 pt-3">
                    <p className="flex items-center gap-2" role="img" aria-label={t('flow.now', { team: leader.abbrev, pct: leaderPct })}>
                        <TeamLogo team={leader} size={24} />
                        <span className="font-display text-[28px] font-extrabold leading-none tabular-nums">{final ? t('flow.won') : `${leaderPct}%`}</span>
                        <span className="text-sm font-semibold text-muted">{final ? leader.abbrev : t('flow.toWin', { team: leader.abbrev })}</span>
                    </p>
                    <div className="mt-2 flex justify-between text-[10px] font-extrabold uppercase tracking-wide text-faint">
                        <span>{game.home.abbrev} ↑</span>
                        <span>{game.away.abbrev} ↓</span>
                    </div>
                    <WinChart game={game} points={points} swings={swings} />
                    {swings.length > 0 && (
                        <div className="mt-3">
                            <p className="eyebrow mb-2">{t('flow.swings')}</p>
                            <ul className="space-y-1.5">
                                {swings.map((point) => {
                                    const atBat = point.atBat!;
                                    const team = point.delta > 0 ? game.home : game.away;
                                    return (
                                        <li key={atBat.i} className="flex items-center gap-2.5 rounded-xl bg-raised px-3 py-2 text-sm">
                                            <span className="w-12 shrink-0 rounded-md px-1 py-0.5 text-center text-xs font-extrabold tabular-nums" style={{ backgroundColor: `${team.color}22`, color: 'rgb(var(--ink))' }}>
                                                +{Math.round(Math.abs(point.delta) * 100)}%
                                            </span>
                                            <span className="min-w-0 flex-1 truncate">
                                                <b>{eventName(atBat, i18n.language)}</b> · {surname(atBat.batter.name)}
                                            </span>
                                            <span className="shrink-0 text-xs font-semibold text-muted">{inningName({ n: atBat.inning, isTop: atBat.top }, i18n.language, true)}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                    <p className="mt-3 text-[11px] leading-snug text-faint">{t('flow.note')}</p>
                </div>
            ) : (
                <div className="px-4 pb-4 pt-3">
                    <div className="flex gap-4 text-xs font-bold">
                        {(['away', 'home'] as const).map((side) => (
                            <span key={side} className="inline-flex items-center gap-1.5">
                                <span className="h-2 w-4 rounded-full" style={{ backgroundColor: game[side].color }} />
                                {game[side].abbrev} {game[side].runs}
                            </span>
                        ))}
                    </div>
                    <RunsChart game={game} />
                </div>
            )}
        </section>
    );
};
