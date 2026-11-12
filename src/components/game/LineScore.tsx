// Marcador por entradas (la pizarra): las entradas de los dos equipos y sus C, H, E, siempre a la vista en la página del
// juego. Las entradas se desplazan de lado si hay extra innings; el equipo a la izquierda y C, H, E a la derecha se
// quedan fijos. En vivo, la media entrada que se juega va resaltada.
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { TeamLogo } from '../ui/TeamLogo';
import { TeamLink } from '../ui/TeamLink';
import { absSlots, absTally } from '../../lib/absChallenges';

const SLOT: Record<'left' | 'lost' | 'empty', string> = {
    left: '',
    lost: 'bg-strike/25 ring-1 ring-inset ring-strike/50',
    empty: 'bg-raised ring-1 ring-inset ring-line/20'
};

/**
 * Retos del ABS de los dos equipos: por equipo, una barra con una casilla por reto que ha tenido (en su color las que
 * le quedan, en rojo tenue las que perdió), «le quedan N de M» y cuántos ganó y perdió. Mientras uno está retando,
 * su fila dice «revisando».
 */
const AbsPanel: React.FC<{ game: GameDetail; abs: NonNullable<GameDetail['abs']> }> = ({ game, abs }) => {
    const { t } = useTranslation();
    return (
        <div className="border-t border-line/10 px-4 py-3">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted">{t('lineScore.abs')}</p>
            <ul className="space-y-2">
                {(['away', 'home'] as const).map((side) => {
                    const team = game[side];
                    const tally = absTally(abs[side]);
                    const slots = absSlots(tally);
                    const checking = abs.challenging !== null && abs.challenging === team.id;
                    return (
                        <li key={side} className="flex items-center gap-2.5 text-xs" aria-label={t('lineScore.absAria', { team: team.abbrev, left: tally.left ?? '—', won: tally.won, lost: tally.lost })}>
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
                            <TeamLink id={team.id} className="w-9 shrink-0 font-bold">
                                {team.abbrev}
                            </TeamLink>
                            {slots.length > 0 && (
                                <span className="flex shrink-0 gap-1" aria-hidden="true">
                                    {slots.map((slot, index) => (
                                        <span key={index} className={`h-2.5 w-6 rounded-full transition-colors ${SLOT[slot]}`} style={slot === 'left' ? { backgroundColor: team.color } : undefined} />
                                    ))}
                                </span>
                            )}
                            <span className="min-w-0 flex-1 truncate font-semibold tabular-nums" aria-hidden="true">
                                {checking ? (
                                    <span className="text-gold">{t('lineScore.absChecking')}</span>
                                ) : tally.left !== null && tally.total !== null ? (
                                    t('lineScore.absOf', { count: tally.left, total: tally.total })
                                ) : null}
                            </span>
                            <span className="shrink-0 tabular-nums text-muted" aria-hidden="true" title={t('lineScore.absWonLost', { won: tally.won, lost: tally.lost })}>
                                <b className="text-ball">✓{tally.won}</b> <b className="text-strike">✗{tally.lost}</b>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

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
                {/* Equipos (el lector los tiene en la tabla de las entradas; aquí son solo para tocar y abrir su página) */}
                <table className="shrink-0 text-sm" aria-hidden="true">
                    <tbody>
                        <tr className="h-7" />
                        {sides.map((side) => {
                            const team = game[side];
                            const dim = final && !team.isWinner;
                            return (
                                <tr key={side} className="h-9">
                                    <td className="pl-2.5 pr-2 min-[380px]:pr-1">
                                        <TeamLink id={team.id} decorative className={`flex items-center gap-1.5 ${dim ? 'opacity-60' : ''}`}>
                                            <span className="h-6 w-[3px] rounded-full" style={{ backgroundColor: team.color }} />
                                            <TeamLogo team={team} size={22} className="hidden min-[380px]:inline-flex" />
                                            <span className="text-[13px] font-extrabold">{team.abbrev}</span>
                                        </TeamLink>
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
            {game.abs && <AbsPanel game={game} abs={game.abs} />}
        </section>
    );
};
