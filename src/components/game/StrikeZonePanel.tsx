import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AtBat, GameDetail } from '../../types';
import { arsenal, atBatForZone, eventName, pitchTypeColor, pitchesByPitcher } from '../../lib/baseball';
import { Segmented } from '../ui/Segmented';
import { StrikeZone } from './StrikeZone';
import { uniformColors } from './BatterFigure';
import { PitchList } from './PitchList';

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

    // Al cambiar de turno se limpia la selección
    useEffect(() => setSelected(null), [atBat?.i, mode]);

    const pitcher = atBat?.pitcher ?? null;
    const pitcherPitches = useMemo(() => pitchesByPitcher(game.atBats, pitcher?.id), [game.atBats, pitcher?.id]);
    const rows = useMemo(() => arsenal(pitcherPitches, i18n.language), [pitcherPitches, i18n.language]);

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
                {mode === 'atBat' ? (
                    <p className="text-sm">
                        <span className="font-semibold">{atBat.batter.name}</span>
                        <span className="text-muted"> {t('zone.facing')} </span>
                        <span className="font-semibold">{atBat.pitcher.name}</span>
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${atBat.complete ? 'bg-raised text-muted' : 'bg-live/10 text-live'}`}>{status}</span>
                    </p>
                ) : (
                    <p className="text-sm">
                        <span className="font-semibold">{pitcher?.name}</span>
                        <span className="text-muted"> · {t('zone.pitchesToday', { count: pitcherPitches.length })}</span>
                    </p>
                )}
            </div>

            {mode === 'atBat' ? (
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
