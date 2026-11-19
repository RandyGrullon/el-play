import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import type { PlayerDetail } from '../../lib/stats';
import { lastGames, MAX_RECENT, recentHitting, setRecentCount, sumHitting, useRecentCount } from '../../lib/recentGames';

interface Row {
    key: string;
    label: string;
    g: number;
    ab: number;
    h: number;
    avg: string | null;
}

/** − 8 + : se puede escribir cualquier número (lo que no cabe en sus juegos se mide con todos) */
const GamesStepper: React.FC<{ value: number; max: number }> = ({ value, max }) => {
    const { t } = useTranslation();
    const [draft, setDraft] = useState<string | null>(null);
    const step = (by: number) => {
        setDraft(null);
        setRecentCount(Math.max(1, Math.min(max, value + by)));
    };
    return (
        <span className="inline-flex items-center rounded-full bg-raised">
            <button type="button" onClick={() => step(-1)} disabled={value <= 1} aria-label={t('statsPage.measure.fewer')} className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-35">
                <Minus className="h-4 w-4" />
            </button>
            <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_RECENT}
                value={draft ?? String(value)}
                aria-label={t('statsPage.measure.input')}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                    setDraft(event.target.value);
                    const typed = Number.parseInt(event.target.value, 10);
                    if (typed >= 1) setRecentCount(typed);
                }}
                onBlur={() => setDraft(null)}
                // 16 px: en iPhone un campo más chico agranda la pantalla al tocarlo
                className="w-11 appearance-none bg-transparent text-center text-base font-extrabold tabular-nums outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button type="button" onClick={() => step(1)} disabled={value >= max} aria-label={t('statsPage.measure.more')} className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-35">
                <Plus className="h-4 w-4" />
            </button>
        </span>
    );
};

/**
 * Encima del juego a juego de un bateador: escoges cuántos de sus últimos juegos medir y salen sumados (turnos, hits
 * y promedio) junto a lo de la temporada y la carrera en la liga
 */
export const RecentTotal: React.FC<{ player: PlayerDetail; className?: string }> = ({ player, className = '' }) => {
    const { t } = useTranslation();
    const count = useRecentCount();
    const total = player.log.length;
    if (!total) return null;
    const all = count === 0 || count >= total;
    const shown = all ? total : count;
    const recent = recentHitting(lastGames(player.log, shown));

    const rows: Row[] = [];
    const season = player.hitting;
    // Con todos sus juegos, la fila de lo medido sobra si da lo mismo que la temporada
    if (!all || !season || season.ab !== recent.ab || season.h !== recent.h) {
        rows.push({ key: 'recent', label: all ? t('statsPage.measure.allGames', { count: recent.games }) : t('statsPage.recentTotal', { count: shown }), g: recent.games, ...recent });
    }
    if (season) rows.push({ key: 'season', label: t('statsPage.measure.season'), g: season.g, ...sumHitting([season]) });
    if (player.career.length > 1) {
        const lines = player.career.map((row) => row.hitting);
        rows.push({ key: 'career', label: t('statsPage.measure.career'), g: lines.reduce((sum, line) => sum + (line?.g ?? 0), 0), ...sumHitting(lines) });
    }

    return (
        <section className={`card p-3 ${className}`} aria-label={t('statsPage.measure.title')}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">{t('statsPage.measure.lastBefore', { count: shown })}</span>
                <GamesStepper value={shown} max={total} />
                <span className="text-sm font-bold">{t('statsPage.measure.lastAfter', { count: shown })}</span>
                <button
                    type="button"
                    onClick={() => setRecentCount(0)}
                    aria-pressed={all}
                    className={`ml-auto h-9 rounded-full px-3.5 text-xs font-bold ${all ? 'bg-ink text-bg' : 'bg-raised'}`}
                >
                    {t('statsPage.measure.all')}
                </button>
            </div>
            <table className="mt-2.5 w-full text-sm">
                <thead>
                    <tr className="text-[11px] font-bold uppercase tracking-wide text-muted">
                        <th scope="col" className="pb-1 text-left font-bold">
                            <span className="sr-only">{t('statsPage.measure.span')}</span>
                        </th>
                        <th scope="col" className="pb-1 text-right font-bold">{t('statsPage.measure.g')}</th>
                        <th scope="col" className="pb-1 text-right font-bold">{t('statsPage.measure.ab')}</th>
                        <th scope="col" className="pb-1 text-right font-bold">{t('statsPage.measure.h')}</th>
                        <th scope="col" className="pb-1 text-right font-bold">AVG</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-line/10">
                    {rows.map((row) => (
                        <tr key={row.key}>
                            <th scope="row" className={`py-1.5 pr-2 text-left ${row.key === 'recent' ? 'font-extrabold' : 'font-semibold text-muted'}`}>
                                {row.label}
                            </th>
                            <td className="num py-1.5 pl-2 text-right">{row.g}</td>
                            <td className="num py-1.5 pl-2 text-right">{row.ab}</td>
                            <td className={`num py-1.5 pl-2 text-right ${row.key === 'recent' ? 'font-extrabold' : ''}`}>{row.h}</td>
                            <td className={`num py-1.5 pl-2 text-right ${row.key === 'recent' ? 'font-extrabold' : ''}`}>{row.avg ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
};
