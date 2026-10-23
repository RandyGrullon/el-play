import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../types';
import { Segmented } from '../ui/Segmented';
import { TeamLogo } from '../ui/TeamLogo';

export const BoxScore: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const [side, setSide] = useState<'away' | 'home'>(game.inning && !game.inning.isTop ? 'home' : 'away');
    const team = game[side];
    const box = game.box[side];

    return (
        <div className="space-y-4">
            <Segmented
                label={t('box.team')}
                value={side}
                onChange={setSide}
                className="w-full justify-center"
                options={(['away', 'home'] as const).map((key) => ({
                    value: key,
                    label: (
                        <span className="inline-flex items-center gap-2">
                            <TeamLogo team={game[key]} size={18} />
                            {game[key].abbrev}
                        </span>
                    )
                }))}
            />

            <section className="card overflow-hidden" aria-label={t('box.batting')}>
                <h2 className="eyebrow border-b border-line/10 px-4 py-3">{t('box.batting')} · {team.name}</h2>
                {box.batters.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted">{t('box.noData')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[11px] uppercase tracking-wide text-faint">
                                    <th className="sticky left-0 z-[1] bg-surface py-2 pl-4 pr-2 text-left font-semibold">{t('box.player')}</th>
                                    {['ab', 'r', 'h', 'rbi', 'bb', 'k', 'avg'].map((key) => (
                                        <th key={key} className="px-1.5 py-2 text-right font-semibold">{t(`stats.${key}`)}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line/10">
                                {box.batters.map((batter) => (
                                    <tr key={batter.id}>
                                        <td className={`sticky left-0 z-[1] min-w-[7.5rem] bg-surface py-2 pr-2 ${batter.sub ? 'pl-8' : 'pl-4'}`}>
                                            <span className="font-medium">{batter.name}</span>
                                            <span className="ml-1.5 text-xs text-faint">{batter.pos}</span>
                                            {batter.hr > 0 && <span className="ml-1.5 rounded bg-gold/15 px-1 text-[10px] font-bold text-gold">HR{batter.hr > 1 ? ` ${batter.hr}` : ''}</span>}
                                        </td>
                                        <td className="num px-1.5 text-right">{batter.ab}</td>
                                        <td className="num px-1.5 text-right">{batter.r}</td>
                                        <td className={`num px-1.5 text-right ${batter.h ? 'font-semibold' : ''}`}>{batter.h}</td>
                                        <td className="num px-1.5 text-right">{batter.rbi}</td>
                                        <td className="num px-1.5 text-right">{batter.bb}</td>
                                        <td className="num px-1.5 text-right">{batter.k}</td>
                                        <td className="num px-1.5 pr-4 text-right text-muted">{batter.avg ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-line/15 font-semibold">
                                    <td className="sticky left-0 z-[1] bg-surface px-4 py-2">{t('box.totals')}</td>
                                    {(['ab', 'r', 'h', 'rbi', 'bb', 'k'] as const).map((key) => (
                                        <td key={key} className="num px-1.5 text-right">{box.totals[key] ?? '—'}</td>
                                    ))}
                                    <td className="num px-1.5 pr-4 text-right text-muted">{box.totals.avg ?? ''}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
                {box.totals.lob !== null && <p className="px-4 pb-3 text-xs text-muted">{t('box.lob', { count: box.totals.lob })}</p>}
            </section>

            <section className="card overflow-hidden" aria-label={t('box.pitching')}>
                <h2 className="eyebrow border-b border-line/10 px-4 py-3">{t('box.pitching')} · {team.name}</h2>
                {box.pitchers.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted">{t('box.noData')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[460px] text-sm">
                            <thead>
                                <tr className="text-[11px] uppercase tracking-wide text-faint">
                                    <th className="sticky left-0 z-[1] bg-surface py-2 pl-4 pr-2 text-left font-semibold">{t('box.pitcher')}</th>
                                    {['ip', 'h', 'r', 'er', 'bb', 'k', 'pitches', 'era'].map((key) => (
                                        <th key={key} className="px-1.5 py-2 text-right font-semibold">{t(`stats.${key}`)}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line/10">
                                {box.pitchers.map((pitcher) => (
                                    <tr key={pitcher.id}>
                                        <td className="sticky left-0 z-[1] bg-surface py-2 pl-4 pr-2">
                                            <span className="font-medium">{pitcher.name}</span>
                                            {pitcher.note && <span className="ml-1.5 text-xs font-semibold text-accent-ink">{pitcher.note}</span>}
                                        </td>
                                        <td className="num px-1.5 text-right">{pitcher.ip}</td>
                                        <td className="num px-1.5 text-right">{pitcher.h}</td>
                                        <td className="num px-1.5 text-right">{pitcher.r}</td>
                                        <td className="num px-1.5 text-right">{pitcher.er}</td>
                                        <td className="num px-1.5 text-right">{pitcher.bb}</td>
                                        <td className="num px-1.5 text-right">{pitcher.k}</td>
                                        <td className="num px-1.5 text-right">{pitcher.np !== null ? `${pitcher.np}${pitcher.st !== null ? `-${pitcher.st}` : ''}` : '—'}</td>
                                        <td className="num px-1.5 pr-4 text-right text-muted">{pitcher.era ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {(box.bench?.length ?? 0) + (box.bullpen?.length ?? 0) > 0 && (
                <section className="card overflow-hidden" aria-label={t('box.benchTitle')}>
                    <h2 className="eyebrow border-b border-line/10 px-4 py-3">{t('box.benchTitle')} · {team.name}</h2>
                    <div className="grid gap-4 p-4 sm:grid-cols-2">
                        {!!box.bench?.length && (
                            <details>
                                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-muted">{t('box.bench')} · {box.bench.length}</summary>
                                <ul className="mt-1.5 divide-y divide-line/10 text-sm">
                                    {box.bench.map((player) => (
                                        <li key={player.id} className="flex items-center gap-2 py-1.5">
                                            <span className="min-w-0 flex-1 truncate font-medium">{player.name}</span>
                                            <span className="text-xs text-faint">{player.pos}</span>
                                            <span className="num w-12 text-right text-muted">{player.avg ?? '—'}</span>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                        {!!box.bullpen?.length && (
                            <details>
                                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-muted">{t('box.bullpen')} · {box.bullpen.length}</summary>
                                <ul className="mt-1.5 divide-y divide-line/10 text-sm">
                                    {box.bullpen.map((arm) => (
                                        <li key={arm.id} className="flex items-center gap-2 py-1.5">
                                            <span className="min-w-0 flex-1 truncate font-medium">{arm.name}</span>
                                            {arm.throws && <span className="text-xs text-faint">{t(`box.hand${arm.throws}`, { defaultValue: arm.throws })}</span>}
                                            <span className="num w-16 text-right text-muted">{arm.era ? t('box.era', { era: arm.era }) : '—'}</span>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
};
