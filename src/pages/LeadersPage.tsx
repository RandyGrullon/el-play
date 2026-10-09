import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { useLeaders } from '../lib/queries';
import { seasonLabel } from '../lib/format';
import { useLeague } from '../store/LeagueContext';
import { LeaderBoard } from '../components/leaders/LeaderBoard';
import { Segmented } from '../components/ui/Segmented';
import { ErrorState, Skeleton } from '../components/ui/States';
import { PullToRefresh } from '../components/common/PullToRefresh';

export const LeadersPage: React.FC = () => {
    const { t } = useTranslation();
    const { activeLeague } = useLeague();
    const leaders = useLeaders(activeLeague);
    const [group, setGroup] = useState<'hitting' | 'pitching'>('hitting');
    const data = leaders.data;

    return (
        <PullToRefresh onRefresh={async () => { await leaders.refetch(); }}>
            <div className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="display text-3xl">{t('leaders.title')}</h1>
                        {data && (
                            <p className="text-sm text-muted">
                                {t(`leagues.${activeLeague}.fullName`)} · {t('common.season', { season: seasonLabel(data.season, activeLeague) })}
                            </p>
                        )}
                    </div>
                    <Segmented
                        label={t('leaders.group')}
                        value={group}
                        onChange={setGroup}
                        options={[
                            { value: 'hitting', label: t('leaders.hitting') },
                            { value: 'pitching', label: t('leaders.pitching') }
                        ]}
                    />
                </div>

                {data?.isPreviousSeason && (
                    <p className="flex items-start gap-2 rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent-ink">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        {t('leaders.previousSeason')}
                    </p>
                )}

                {leaders.isPending ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {[0, 1, 2].map((index) => <Skeleton key={index} className="h-[250px] rounded-card" />)}
                    </div>
                ) : leaders.isError && !data ? (
                    <ErrorState error={leaders.error} onRetry={() => leaders.refetch()} />
                ) : data ? (
                    <>
                        <LeaderBoard data={data} group={group} />
                        <p className="text-xs text-muted">{t('leaders.qualifiedNote')}</p>
                    </>
                ) : null}
            </div>
        </PullToRefresh>
    );
};
