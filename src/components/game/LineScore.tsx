// Marcador por entradas (la pizarra): las entradas de los dos equipos y sus C, H, E, siempre a la vista en la página del
// juego. Las entradas se desplazan de lado si hay extra innings; el equipo a la izquierda y C, H, E a la derecha se
// quedan fijos. En vivo, la media entrada que se juega va resaltada.
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { TeamLogo } from '../ui/TeamLogo';

export const LineScore: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const scroller = useRef<HTMLDivElement>(null);
    const live = game.state === 'live';
    const final = game.state === 'final';
    const current = live ? game.inning : null;
    const innings = Math.max(game.scheduledInnings || 9, game.linescore.length);
    const columns = Array.from({ length: innings }, (_, index) => index + 1);
    const byInning = new Map(game.linescore.map((row) => [row.n, row]));
    const sides = ['away', 'home'] as const;

    // Si no caben todas (extra innings o pantalla angosta), se ve la entrada del momento sin tener que desplazar
    const focus = current?.n ?? (final ? innings : null);
    useEffect(() => {
        const node = scroller.current;
        if (!node || node.scrollWidth <= node.clientWidth || !focus) return;
        const column = node.querySelector<HTMLElement>(`[data-inning="${focus}"]`);
        if (column) node.scrollLeft = Math.max(0, column.offsetLeft + column.offsetWidth - node.clientWidth + 8);
    }, [focus, innings]);

    const cell = (side: 'away' | 'home', n: number) => {
        const row = byInning.get(n);
        const value = row?.[side];
        const now = !!current && current.n === n && (side === 'away') === current.isTop && current.state !== 'Middle' && current.state !== 'End';
        // La baja de la última entrada que no se jugó porque el local ya iba ganando
        const skipped = final && side === 'home' && n === game.linescore.length && (value === null || value === undefined);
        const text = value ?? (skipped ? 'x' : now ? '0' : '');
        return (
            <td key={n} className="p-0">
                <span
                    className={`mx-auto flex h-8 w-5 items-center justify-center rounded-md tabular-nums ${now ? 'bg-live/10 font-extrabold text-live ring-1 ring-live/40' : value ? 'font-extrabold text-ink' : 'text-faint'}`}
                    aria-current={now ? 'true' : undefined}
                >
                    {text}
                </span>
            </td>
        );
    };

    return (
        <section className="card overflow-hidden" aria-labelledby="line-score">
            <h2 id="line-score" className="eyebrow px-4 pb-1 pt-3.5">
                {t('lineScore.title')}
            </h2>
            <div className="flex items-stretch pb-2">
                {/* Equipos */}
                <table className="shrink-0 text-sm" aria-hidden="true">
                    <tbody>
                        <tr className="h-7" />
                        {sides.map((side) => {
                            const team = game[side];
                            const dim = final && !team.isWinner;
                            return (
                                <tr key={side} className="h-9">
                                    <td className="pl-2.5 pr-2 min-[380px]:pr-1">
                                        <span className={`flex items-center gap-1.5 ${dim ? 'opacity-60' : ''}`}>
                                            <span className="h-6 w-[3px] rounded-full" style={{ backgroundColor: team.color }} />
                                            <TeamLogo team={team} size={22} className="hidden min-[380px]:inline-flex" />
                                            <span className="text-[13px] font-extrabold">{team.abbrev}</span>
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Entradas (se desplazan de lado) */}
                <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
                    <table className="w-full min-w-max border-separate border-spacing-0 text-center text-[13px]">
                        <caption className="sr-only">{t('lineScore.title')}</caption>
                        <thead>
                            <tr className="h-7 text-[11px] font-bold text-muted">
                                <th scope="col" className="sr-only">
                                    {t('lineScore.team')}
                                </th>
                                {columns.map((n) => (
                                    <th key={n} scope="col" data-inning={n} className={`min-w-[21px] font-bold ${current?.n === n ? 'text-live' : ''}`}>
                                        {n}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sides.map((side) => (
                                <tr key={side} className="h-9">
                                    <th scope="row" className="sr-only">
                                        {game[side].name}
                                    </th>
                                    {columns.map((n) => cell(side, n))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* C, H, E fijos a la derecha */}
                <table className="shrink-0 border-l border-line/10 text-center text-sm tabular-nums">
                    <thead>
                        <tr className="h-7 text-[11px] font-bold text-muted">
                            <th scope="col" className="w-9 pl-1 text-ink">
                                {t('lineScore.runs')}
                            </th>
                            <th scope="col" className="w-6">
                                {t('lineScore.hits')}
                            </th>
                            <th scope="col" className="w-7 pr-2">
                                {t('lineScore.errors')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sides.map((side) => {
                            const team = game[side];
                            const leading = team.runs > game[side === 'away' ? 'home' : 'away'].runs;
                            return (
                                <tr key={side} className="h-9">
                                    <td className="p-0 pl-1">
                                        <span className={`mx-auto flex h-8 w-[30px] items-center justify-center rounded-lg font-display text-lg font-extrabold ${leading ? 'bg-ink text-bg' : 'bg-raised text-ink'}`}>{team.runs}</span>
                                    </td>
                                    <td className="font-semibold text-muted">{team.hits}</td>
                                    <td className="pr-2 font-semibold text-muted">{team.errors}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {game.abs && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/10 px-4 py-2 text-xs">
                    <span className="font-extrabold uppercase tracking-wide text-muted">{t('lineScore.abs')}</span>
                    {sides.map((side) => {
                        const count = game.abs![side];
                        return (
                            <span key={side} className="inline-flex items-center gap-1.5 font-semibold" aria-label={t('lineScore.absAria', { team: game[side].abbrev, left: count.remaining ?? '—', won: count.won, lost: count.lost })}>
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: game[side].color }} aria-hidden="true" />
                                {game[side].abbrev}
                                {/* Lo que importa es cuántos le quedan; ganados y perdidos solo si no llega el total */}
                                {count.remaining !== null ? (
                                    <b className="rounded-md bg-raised px-1.5 tabular-nums">{t('lineScore.absLeft', { count: count.remaining })}</b>
                                ) : (
                                    <span className="tabular-nums text-muted">
                                        ✓{count.won} ✗{count.lost}
                                    </span>
                                )}
                            </span>
                        );
                    })}
                </div>
            )}
        </section>
    );
};
