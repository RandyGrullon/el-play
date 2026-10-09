import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { useStandings } from '../lib/queries';
import { seasonLabel } from '../lib/format';
import { useLeague } from '../store/LeagueContext';
import { StandingsTable } from '../components/standings/StandingsTable';
import { Segmented } from '../components/ui/Segmented';
import { ErrorState, Skeleton } from '../components/ui/States';
import { PullToRefresh } from '../components/common/PullToRefresh';

type Phase = 'regular' | 'roundRobin' | 'final';

export const StandingsPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { activeLeague } = useLeague();
    const standings = useStandings(activeLeague);
    const data = standings.data;
    const [phase, setPhase] = useState<Phase | null>(null);

    useEffect(() => setPhase(null), [activeLeague]);

    return (
        <PullToRefresh onRefresh={async () => { await standings.refetch(); }}>
            <div className="space-y-4">
                <div>
                    <h1 className="display text-3xl">{t('standings.title')}</h1>
                    {data && (
                        <p className="text-sm text-muted">
                            {t(`leagues.${activeLeague}.fullName`)} · {t('common.season', { season: seasonLabel(data.season, activeLeague) })}
                        </p>
                    )}
                </div>

                {data?.isPreviousSeason && (
                    <p className="flex items-start gap-2 rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent-ink">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        {t('standings.previousSeason')}
                    </p>
                )}

                {standings.isPending ? (
                    <Skeleton className="h-[320px] rounded-card" />
                ) : standings.isError && !data ? (
                    <ErrorState error={standings.error} onRetry={() => standings.refetch()} />
                ) : data?.type === 'lidom' ? (
                    <div className="space-y-3">
                        <Segmented<Phase>
                            label={t('standings.phase')}
                            value={phase ?? data.activePhase}
                            onChange={setPhase}
                            options={[
                                { value: 'regular', label: t('standings.regular') },
                                { value: 'roundRobin', label: t('standings.roundRobin') },
                                { value: 'final', label: t('standings.final') }
                            ]}
                        />
                        <section className="card overflow-hidden">
                            <StandingsTable
                                rows={data[phase ?? data.activePhase]}
                                cutoff={(phase ?? data.activePhase) === 'regular' ? 4 : (phase ?? data.activePhase) === 'roundRobin' ? data.roundRobinInfo?.advance ?? 2 : undefined}
                            />
                        </section>
                        <p className="text-xs text-muted">
                            {(phase ?? data.activePhase) === 'regular' ? t('standings.regularNote') : (phase ?? data.activePhase) === 'roundRobin' ? t('standings.roundRobinNote', { games: data.roundRobinInfo?.games ?? 18 }) : t('standings.finalNote')}
                        </p>
                    </div>
                ) : data?.type === 'wbc' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                        {Object.entries(data.pools).map(([pool, rows]) => (
                            <section key={pool} className="card overflow-hidden">
                                <StandingsTable rows={rows} title={i18n.language.startsWith('en') ? pool : pool.replace(/^Pool\b/, 'Grupo')} cutoff={2} />
                            </section>
                        ))}
                        {Object.keys(data.pools).length === 0 && <p className="text-sm text-muted">{t('standings.noData')}</p>}
                    </div>
                ) : data?.type === 'sdc' ? (
                    <section className="card overflow-hidden">
                        <StandingsTable rows={data.teams} cutoff={4} />
                    </section>
                ) : null}
            </div>
        </PullToRefresh>
    );
};
