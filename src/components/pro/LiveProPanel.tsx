import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge } from 'lucide-react';
import type { GameDetail } from '../../types';
import { arsenal, atBatForZone, battedBalls, eventName, pitchCallName, pitchTypeName, pitchesByPitcher } from '../../lib/baseball';
import { ProBadge } from './ProBadge';

// Panel del modo PRO en el juego: último pitcheo (tipo, velocidad, efecto, zona), el turno pitcheo a pitcheo,
// el repertorio de cada lanzador y los batazos más duros. En estadios sin rastreo MLB no manda velocidad ni efecto.

const Tile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="rounded-2xl bg-raised px-2 py-2.5 text-center">
        <p className="font-display text-xl font-extrabold leading-none tabular-nums">{value}</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
    </div>
);


/** Lanzadores a la vista en el repertorio; el resto con «Ver todos» (en LIDOM tiran 10 o 12 por juego) */
const PITCHERS_SHOWN = 4;
export const LiveProPanel: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const { atBat } = atBatForZone(game);
    const live = game.state === 'live';
    const pitches = atBat?.pitches ?? [];
    const last = live ? pitches[pitches.length - 1] : undefined;
    const tracked = game.atBats.some((item) => item.pitches.some((pitch) => typeof pitch.mph === 'number'));

    // Repertorio de los lanzadores que han tirado (el actual primero)
    const [allPitchers, setAllPitchers] = useState(false);
    const pitchers = useMemo(() => {
        const ids: { id: number; name: string; top: boolean }[] = [];
        for (const item of game.atBats) {
            if (item.pitcher.id && !ids.some((p) => p.id === item.pitcher.id)) ids.push({ id: item.pitcher.id, name: item.pitcher.name, top: item.top });
        }
        const current = game.matchup?.pitcher.id;
        return ids.sort((a, b) => Number(b.id === current) - Number(a.id === current));
    }, [game.atBats, game.matchup?.pitcher.id]);

    const hardest = useMemo(
        () =>
            battedBalls(game.atBats)
                .filter((ball) => typeof ball.pitch.hit?.ev === 'number')
                .sort((a, b) => (b.pitch.hit!.ev as number) - (a.pitch.hit!.ev as number))
                .slice(0, 5),
        [game.atBats]
    );

    return (
        <section className="card space-y-5 p-4" aria-label={t('pro.live.title')}>
            <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-accent-ink" aria-hidden="true" />
                <h2 className="font-extrabold">{t('pro.live.title')}</h2>
                <ProBadge />
            </div>
            {!tracked && <p className="rounded-2xl bg-raised px-3 py-2 text-xs text-muted">{t('pro.live.noTracking')}</p>}

            {last && (
                <div>
                    <p className="eyebrow mb-2">{t('pro.live.lastPitch')}</p>
                    <div className="grid grid-cols-4 gap-2">
                        <Tile label={t('pro.live.type')} value={<span className="text-sm">{pitchTypeName(last, lang) || '—'}</span>} />
                        <Tile label="mph" value={last.mph ?? '—'} />
                        <Tile label="rpm" value={last.spin ?? '—'} />
                        <Tile label={t('pro.live.zone')} value={last.zone ?? '—'} />
                    </div>
                </div>
            )}

            {live && pitches.length > 0 && (
                <div>
                    <p className="eyebrow mb-2">{t('pro.live.thisAtBat', { batter: atBat?.batter.name ?? '' })}</p>
                    <div className="overflow-x-auto rounded-2xl bg-raised">
                        <table className="w-full text-[13px] tabular-nums">
                            <thead>
                                <tr className="text-[11px] font-bold uppercase text-muted">
                                    <th className="px-2 py-2 text-left">#</th>
                                    <th className="px-2 py-2 text-left">{t('pro.live.type')}</th>
                                    <th className="px-2 py-2 text-right">mph</th>
                                    <th className="px-2 py-2 text-right">rpm</th>
                                    <th className="px-2 py-2 text-left">{t('pro.live.result')}</th>
                                    <th className="px-2 py-2 text-right">{t('pro.live.count')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line/10">
                                {pitches.map((pitch, index) => (
                                    <tr key={index}>
                                        <td className="px-2 py-1.5 text-muted">{index + 1}</td>
                                        <td className="px-2 py-1.5 font-semibold">{pitchTypeName(pitch, lang) || '—'}</td>
                                        <td className="px-2 py-1.5 text-right font-bold">{pitch.mph ?? '—'}</td>
                                        <td className="px-2 py-1.5 text-right">{pitch.spin ?? '—'}</td>
                                        <td className="px-2 py-1.5">{pitchCallName(pitch, lang)}</td>
                                        <td className="px-2 py-1.5 text-right text-muted">{pitch.b != null && pitch.s != null ? `${pitch.b}-${pitch.s}` : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {pitchers.length > 0 && (
                <div className="space-y-3">
                    <p className="eyebrow">{t('pro.live.arsenal')}</p>
                    {(allPitchers ? pitchers : pitchers.slice(0, PITCHERS_SHOWN)).map((pitcher) => {
                        const list = pitchesByPitcher(game.atBats, pitcher.id);
                        const rows = arsenal(list, lang);
                        const team = pitcher.top ? game.home : game.away;
                        return (
                            <div key={pitcher.id} className="overflow-hidden rounded-2xl bg-raised">
                                <p className="flex items-center justify-between px-3 py-2 text-sm font-extrabold">
                                    <span className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                                        {pitcher.name}
                                    </span>
                                    <span className="text-xs font-semibold text-muted">{t('pro.live.pitches', { count: list.length })}</span>
                                </p>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[13px] tabular-nums">
                                        <thead>
                                            <tr className="text-[11px] font-bold uppercase text-muted">
                                                <th className="px-3 py-1.5 text-left">{t('pro.live.type')}</th>
                                                <th className="px-2 py-1.5 text-right">%</th>
                                                <th className="px-2 py-1.5 text-right">{t('pro.live.avgMph')}</th>
                                                <th className="px-2 py-1.5 text-right">{t('pro.live.maxMph')}</th>
                                                <th className="px-2 py-1.5 text-right">{t('pro.live.strikePct')}</th>
                                                <th className="px-3 py-1.5 text-right">{t('pro.live.whiffs')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-line/10">
                                            {rows.map((row) => (
                                                <tr key={row.type}>
                                                    <td className="px-3 py-1.5 font-semibold">{row.name}</td>
                                                    <td className="px-2 py-1.5 text-right">{Math.round(row.share * 100)}%</td>
                                                    <td className="px-2 py-1.5 text-right font-bold">{row.avgMph !== null ? row.avgMph.toFixed(1) : '—'}</td>
                                                    <td className="px-2 py-1.5 text-right">{row.maxMph ?? '—'}</td>
                                                    <td className="px-2 py-1.5 text-right">{row.count ? `${Math.round((row.strikes / row.count) * 100)}%` : '—'}</td>
                                                    <td className="px-3 py-1.5 text-right">{row.whiffs}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                    {pitchers.length > PITCHERS_SHOWN && (
                        <button type="button" onClick={() => setAllPitchers((value) => !value)} className="h-10 w-full rounded-full bg-raised text-sm font-bold">
                            {allPitchers ? t('pro.live.fewerPitchers') : t('pro.live.allPitchers', { count: pitchers.length })}
                        </button>
                    )}
                </div>
            )}

            {hardest.length > 0 && (
                <div>
                    <p className="eyebrow mb-2">{t('pro.live.hardest')}</p>
                    <ol className="divide-y divide-line/10 overflow-hidden rounded-2xl bg-raised">
                        {hardest.map((ball) => (
                            <li key={`${ball.atBat.i}`} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: (ball.side === 'away' ? game.away : game.home).color }} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-extrabold">{ball.atBat.batter.name}</span>
                                    <span className="block truncate text-xs text-muted">{eventName(ball.atBat, lang)}</span>
                                </span>
                                <span className="text-right tabular-nums">
                                    <span className="block font-display text-lg font-extrabold leading-none">{ball.pitch.hit?.ev}</span>
                                    <span className="text-[10px] font-bold uppercase text-muted">mph</span>
                                </span>
                                <span className="w-14 text-right text-xs text-muted tabular-nums">
                                    {ball.pitch.hit?.la != null ? `${ball.pitch.hit.la}°` : ''}
                                    {ball.pitch.hit?.dist ? <span className="block">{ball.pitch.hit.dist} ft</span> : null}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
};
