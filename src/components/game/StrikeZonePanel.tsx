import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AtBat, GameDetail } from '../../types';
import { arsenal, atBatForZone, battersFaced, eventName, inningBreak, isWhiff, pitchTypeColor, pitchesByPitcher } from '../../lib/baseball';
import { surname } from '../../lib/format';
import { Segmented } from '../ui/Segmented';
import { StrikeZone } from './StrikeZone';
import { uniformColors } from './BatterFigure';
import { PitchList } from './PitchList';
import { InningBreak } from './InningBreak';

type Mode = 'atBat' | 'pitcher';

interface StrikeZonePanelProps {
    game: GameDetail;
    /** Turno elegido desde la lista de jugadas; si no, el actual */
    atBat?: AtBat | null;
}

export const StrikeZonePanel: React.FC<StrikeZonePanelProps> = ({ game, atBat: forced }) => {
    const { t, i18n } = useTranslation();
    const [mode, setMode] = useState<Mode>('atBat');
    const [selected, setSelected] = useState<number | null>(null);

    const { atBat: automatic, isPrevious } = atBatForZone(game);
    const atBat = forced ?? automatic;
    // Tras el tercer out y hasta el primer bateador de la otra mitad: espera animada en vez del último turno
    const pause = forced ? null : inningBreak(game);

    // Vista del lanzador por bateador: sigue al bateador del turno (null) o al que se eligió; 'all' = todos
    const [batterPick, setBatterPick] = useState<number | 'all' | null>(null);

    // Al cambiar de turno se limpia la selección y la vista del lanzador vuelve al bateador actual
    useEffect(() => setSelected(null), [atBat?.i, mode]);
    useEffect(() => setBatterPick(null), [atBat?.i]);

    const pitcher = atBat?.pitcher ?? null;
    const batters = useMemo(() => battersFaced(game.atBats, pitcher?.id), [game.atBats, pitcher?.id]);
    const batterId = batterPick === 'all' ? null : batterPick ?? atBat?.batter.id ?? null;
    const pitcherPitches = useMemo(() => pitchesByPitcher(game.atBats, pitcher?.id, batterId), [game.atBats, pitcher?.id, batterId]);
    const rows = useMemo(() => arsenal(pitcherPitches, i18n.language), [pitcherPitches, i18n.language]);
    // Sin rastreo no hay tipos de pitcheo: el resumen sale de los resultados, que siempre vienen
    const typed = pitcherPitches.some((pitch) => pitch.type);
    const located = pitcherPitches.some((pitch) => pitch.x !== null && pitch.z !== null);
    const summary = useMemo(() => {
        const count = (test: (code: string | null, r: string) => boolean) => pitcherPitches.filter((p) => test(p.code, p.r)).length;
        const strikes = count((_, r) => r === 'strike' || r === 'inplay');
        return [
            { label: t('zone.sumPitches'), value: String(pitcherPitches.length) },
            { label: t('zone.sumStrikes'), value: pitcherPitches.length ? `${strikes} · ${Math.round((strikes / pitcherPitches.length) * 100)}%` : '0' },
            { label: t('zone.sumBalls'), value: String(count((_, r) => r === 'ball' || r === 'hbp')) },
            { label: t('zone.whiffs'), value: String(count((code) => isWhiff(code))) },
            { label: t('zone.sumFouls'), value: String(count((code) => code === 'F' || code === 'T' || code === 'L' || code === 'O' || code === 'R')) },
            { label: t('zone.inPlay'), value: String(count((_, r) => r === 'inplay')) }
        ];
    }, [pitcherPitches, t]);

    if (!atBat) {
        return (
            <section className="card p-4">
                <h2 className="eyebrow">{t('zone.title')}</h2>
                <p className="py-10 text-center text-sm text-muted">{t('zone.empty')}</p>
            </section>
        );
    }

    const status = !atBat.complete
        ? t('zone.currentAtBat')
        : isPrevious && !forced
            ? t('zone.previousAtBat', { result: eventName(atBat, i18n.language) })
            : eventName(atBat, i18n.language);

    return (
        <section className="card overflow-hidden" aria-labelledby="zone-title">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/10 px-4 py-3">
                <h2 id="zone-title" className="eyebrow">{t('zone.title')}</h2>
                <Segmented<Mode>
                    size="sm"
                    label={t('zone.mode')}
                    value={mode}
                    onChange={setMode}
                    options={[
                        { value: 'atBat', label: t('zone.modeAtBat') },
                        { value: 'pitcher', label: t('zone.modePitcher') }
                    ]}
                />
            </header>

            <div className="px-4 pt-3">
                {mode === 'atBat' && pause ? (
                    <p className="text-sm" aria-live="polite">
                        <span className="font-semibold">{t(pause.endedTop ? 'anim.inningEnd_top' : 'anim.inningEnd_bottom', { n: pause.inning })}</span>
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-muted">
                            <span className="zb-dot h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pause.next.color }} aria-hidden="true" />
                            {t('zone.breakStatus')}
                        </span>
                    </p>
                ) : mode === 'atBat' ? (
                    <p className="text-sm">
                        <span className="font-semibold">{atBat.batter.name}</span>
                        <span className="text-muted"> {t('zone.facing')} </span>
                        <span className="font-semibold">{atBat.pitcher.name}</span>
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${atBat.complete ? 'bg-raised text-muted' : 'bg-live/10 text-live'}`}>{status}</span>
                    </p>
                ) : (
                    <>
                        <p className="text-sm">
                            <span className="font-semibold">{pitcher?.name}</span>
                            <span className="text-muted">
                                {' · '}
                                {batterId === null
                                    ? t('zone.pitchesToday', { count: pitcherPitches.length })
                                    : t('zone.pitchesTo', { count: pitcherPitches.length, batter: batters.find((b) => b.id === batterId)?.name ?? atBat.batter.name })}
                            </span>
                        </p>
                        {/* Por bateador: el actual primero, luego los demás que ha enfrentado (el más reciente antes) y «Todos» */}
                        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none" role="group" aria-label={t('zone.byBatter')}>
                            {[...batters.filter((b) => b.id === atBat.batter.id), ...batters.filter((b) => b.id !== atBat.batter.id).reverse()].map((batter) => (
                                <BatterChip key={batter.id} active={batterId === batter.id} onClick={() => setBatterPick(batter.id === atBat.batter.id ? null : batter.id)}>
                                    {surname(batter.name)}
                                    {batter.id === atBat.batter.id && !atBat.complete && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-live align-middle" />}
                                </BatterChip>
                            ))}
                            <BatterChip active={batterId === null} onClick={() => setBatterPick('all')}>
                                {t('zone.allBatters')}
                            </BatterChip>
                        </div>
                    </>
                )}
            </div>

            {mode === 'atBat' && pause ? (
                <InningBreak pause={pause} />
            ) : mode === 'atBat' ? (
                <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:items-start">
                    <StrikeZone
                        pitches={atBat.pitches}
                        batterSide={atBat.batter.side}
                        uniform={uniformColors(atBat.top ? game.away : game.home, !atBat.top)}
                        selected={selected}
                        onSelect={setSelected}
                    />
                    <div className="max-h-[360px] overflow-y-auto">
                        <PitchList pitches={atBat.pitches} selected={selected} onSelect={setSelected} />
                    </div>
                </div>
            ) : !typed ? (
                <div className="space-y-3 p-4">
                    {located && <StrikeZone pitches={pitcherPitches} mode="types" />}
                    <dl className="grid grid-cols-3 gap-2">
                        {summary.map((item) => (
                            <div key={item.label} className="rounded-2xl bg-raised p-3 text-center">
                                <dd className="num font-display text-xl font-bold leading-none">{item.value}</dd>
                                <dt className="mt-1 text-[11px] font-semibold text-muted">{item.label}</dt>
                            </div>
                        ))}
                    </dl>
                    <p className="text-center text-[11px] text-faint">{t('zone.untrackedPitcher')}</p>
                </div>
            ) : (
                <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:items-start">
                    <StrikeZone pitches={pitcherPitches} mode="types" />
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t('zone.arsenal')}</caption>
                        <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
                                <th className="pb-2 font-semibold">{t('zone.pitchType')}</th>
                                <th className="pb-2 pl-3 text-right font-semibold">%</th>
                                <th className="pb-2 pl-3 text-right font-semibold">{t('zone.avgMph')}</th>
                                <th className="pb-2 pl-3 text-right font-semibold">{t('zone.whiffs')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line/10">
                            {rows.map((row) => (
                                <tr key={row.type}>
                                    <td className="py-2">
                                        <span className="inline-flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pitchTypeColor(row.type) }} />
                                            <span className="font-medium">{row.name}</span>
                                        </span>
                                    </td>
                                    <td className="num py-2 pl-3 text-right">{Math.round(row.share * 100)}</td>
                                    <td className="num py-2 pl-3 text-right">{row.avgMph ? row.avgMph.toFixed(1) : '—'}</td>
                                    <td className="num py-2 pl-3 text-right">{row.whiffs}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
};

const BatterChip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${active ? 'bg-ink text-bg' : 'bg-raised text-muted'}`}
    >
        {children}
    </button>
);
