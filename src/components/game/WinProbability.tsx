// Probabilidad de victoria antes del juego (lib/winProbability.ts): los dos equipos frente a frente con su porcentaje,
// la barra partida en sus colores (sale de 50-50 y se acomoda), el favorito y por qué (récord, carreras, EFE y AVG).
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, Sparkles } from 'lucide-react';
import type { GameDetail } from '../../types';
import { inkOn } from '../gamecast/GameHero';
import { TeamLogo } from '../ui/TeamLogo';
import { recordOf, useTeamStats, type TeamRow } from '../../lib/teamStats';
import { percents, winProbability, type TeamForm } from '../../lib/winProbability';

const formOf = (team: TeamRow | undefined, fallback: GameDetail['home']): TeamForm => {
    if (team?.pitching) {
        const record = recordOf(team);
        return { w: record.w, l: record.l, scored: record.scored, allowed: record.allowed };
    }
    return { w: fallback.record?.wins ?? 0, l: fallback.record?.losses ?? 0, scored: null, allowed: null };
};

export const WinProbabilityCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const stats = useTeamStats(game.league, undefined);
    const rows = stats.data?.teams ?? [];
    const homeRow = rows.find((row) => row.id === game.home.id);
    const awayRow = rows.find((row) => row.id === game.away.id);
    const previous = !!stats.data?.isPreviousSeason;
    // Con los números de la temporada pasada (antes del primer juego) pesa todavía menos
    const probability = winProbability(formOf(homeRow, game.home), formOf(awayRow, game.away), { homeEra: game.probables.home?.era, awayEra: game.probables.away?.era }, previous ? 40 : 20);
    const pct = percents(probability);
    // Con 52-48 o menos no hay favorito: «Parejo»
    const favorite = Math.abs(pct.home - pct.away) <= 4 ? null : pct.home > pct.away ? game.home : game.away;

    // La barra sale pareja y se acomoda (con «Reducir movimiento» el CSS la deja quieta)
    const [shown, setShown] = useState({ away: 50, home: 50 });
    useEffect(() => {
        const timer = window.setTimeout(() => setShown(pct), 120);
        return () => window.clearTimeout(timer);
    }, [pct.home, pct.away]); // eslint-disable-line react-hooks/exhaustive-deps

    if (stats.isPending && !stats.data) return <div className="skeleton h-[244px] rounded-card" aria-hidden="true" />;

    const sides = [
        { side: 'away' as const, team: game.away, row: awayRow, value: pct.away },
        { side: 'home' as const, team: game.home, row: homeRow, value: pct.home }
    ];
    const recordText = (row: TeamRow | undefined, team: GameDetail['home']) => {
        if (row?.pitching) return `${row.pitching.w}-${row.pitching.l}`;
        return team.record ? `${team.record.wins}-${team.record.losses}` : '—';
    };
    const diffOf = (row: TeamRow | undefined) => (row ? recordOf(row).diff : null);
    const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
    const num = (text: string | undefined) => (text && Number.isFinite(parseFloat(text)) ? parseFloat(text) : null);
    // Comparación rápida: el mejor de cada fila en negrita
    const lines: { key: string; label: string; away: string; home: string; better: 'away' | 'home' | null }[] = [];
    const better = (a: number | null, h: number | null, lowerIsBetter = false) => (a === null || h === null || a === h ? null : (lowerIsBetter ? a < h : a > h) ? 'away' : 'home');
    const winPctOf = (row: TeamRow | undefined, team: GameDetail['home']) => {
        const w = row?.pitching ? row.pitching.w : team.record?.wins ?? 0;
        const l = row?.pitching ? row.pitching.l : team.record?.losses ?? 0;
        return w + l ? w / (w + l) : null;
    };
    lines.push({ key: 'record', label: t('winProb.record'), away: recordText(awayRow, game.away), home: recordText(homeRow, game.home), better: better(winPctOf(awayRow, game.away), winPctOf(homeRow, game.home)) });
    if (diffOf(awayRow) !== null && diffOf(homeRow) !== null) lines.push({ key: 'diff', label: t('winProb.diff'), away: signed(diffOf(awayRow)!), home: signed(diffOf(homeRow)!), better: better(diffOf(awayRow), diffOf(homeRow)) });
    if (awayRow?.pitching && homeRow?.pitching) lines.push({ key: 'era', label: t('winProb.era'), away: awayRow.pitching.era, home: homeRow.pitching.era, better: better(num(awayRow.pitching.era), num(homeRow.pitching.era), true) });
    if (awayRow?.hitting && homeRow?.hitting) lines.push({ key: 'avg', label: t('winProb.avg'), away: awayRow.hitting.avg, home: homeRow.hitting.avg, better: better(num(awayRow.hitting.avg), num(homeRow.hitting.avg)) });

    return (
        <section className="card overflow-hidden" aria-labelledby="win-prob">
            <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                    <h2 id="win-prob" className="eyebrow">
                        {t('winProb.title')}
                    </h2>
                    {favorite ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold" style={{ backgroundColor: favorite.color, color: inkOn(favorite.color) }}>
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            {t('winProb.favorite', { team: favorite.abbrev })}
                        </span>
                    ) : (
                        <span className="rounded-full bg-raised px-2.5 py-1 text-[11px] font-extrabold text-muted">{t('winProb.even')}</span>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2" role="img" aria-label={t('winProb.aria', { away: game.away.name, a: pct.away, home: game.home.name, h: pct.home })}>
                    {sides.map(({ side, team, value }, index) => (
                        <React.Fragment key={side}>
                            {index === 1 && (
                                // La columna del medio queda siempre (la cuadrícula es de tres); el «vs» se ve desde 360 px
                                <span className="w-1 text-xs font-extrabold uppercase text-faint min-[360px]:w-auto">
                                    <span className="hidden min-[360px]:inline">vs</span>
                                </span>
                            )}
                            <div className={`flex min-w-0 items-center gap-2.5 ${side === 'home' ? 'flex-row-reverse text-right' : ''}`}>
                                <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full min-[360px]:h-14 min-[360px]:w-14" style={{ boxShadow: `inset 0 0 0 3px ${team.color}`, backgroundColor: `${team.color}1a` }}>
                                    <TeamLogo team={team} size={36} />
                                    {side === 'home' && (
                                        <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-surface shadow-card" title={t('winProb.home')}>
                                            <Home className="h-3 w-3 text-muted" aria-label={t('winProb.home')} />
                                        </span>
                                    )}
                                </span>
                                <span className="min-w-0">
                                    <span className="block font-display text-[28px] font-extrabold leading-none tabular-nums min-[360px]:text-[34px]">
                                        {value}
                                        <span className="text-lg">%</span>
                                    </span>
                                    <span className="block truncate text-xs font-bold text-muted">{team.abbrev}</span>
                                </span>
                            </div>
                        </React.Fragment>
                    ))}
                </div>

                {/* La barra partida en los colores de los dos */}
                <div className="mt-4 flex h-3.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                    <span className="h-full transition-[width] duration-700 ease-out" style={{ width: `${shown.away}%`, backgroundColor: game.away.color }} />
                    <span className="h-full w-[3px] shrink-0 bg-surface" />
                    <span className="h-full flex-1 transition-[width] duration-700 ease-out" style={{ backgroundColor: game.home.color }} />
                </div>

                {lines.length > 0 && (
                    <dl className="mt-4 divide-y divide-line/10 rounded-2xl bg-raised/60">
                        {lines.map((line) => (
                            <div key={line.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 text-sm tabular-nums">
                                <dd className={line.better === 'away' ? 'font-extrabold' : 'text-muted'}>{line.away}</dd>
                                <dt className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted">{line.label}</dt>
                                <dd className={`text-right ${line.better === 'home' ? 'font-extrabold' : 'text-muted'}`}>{line.home}</dd>
                            </div>
                        ))}
                    </dl>
                )}

                <p className="mt-3 text-[11px] leading-snug text-faint">
                    {t(probability.starters ? 'winProb.noteStarters' : 'winProb.note')}
                    {previous ? ` ${t('winProb.previous')}` : probability.early ? ` ${t('winProb.early')}` : ''}
                </p>
            </div>
        </section>
    );
};
