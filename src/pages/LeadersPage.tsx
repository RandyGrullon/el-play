import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Share2 } from 'lucide-react';
import type { Leader, Leaders } from '../types';
import { useLeaders } from '../lib/queries';
import { seasonLabel } from '../lib/format';
import { useLeague } from '../store/LeagueContext';
import { useShare } from '../share/ShareSheet';
import { playerFromLeader } from '../share/subjects';
import { inkOn } from '../components/gamecast/GameHero';
import { PlayerPhoto } from '../components/ui/PlayerPhoto';
import { ErrorState, Skeleton } from '../components/ui/States';
import { PullToRefresh } from '../components/common/PullToRefresh';

const detailOf = (leader: Leader, t: (key: string, options?: Record<string, unknown>) => string) => {
    const extra = leader.extra || {};
    if (extra.h !== null && extra.h !== undefined && extra.ab) return t('share.hitsInAtBats', { h: extra.h, ab: extra.ab });
    if (extra.ip) return t('share.innings', { ip: extra.ip, k: extra.k ?? 0 });
    return '';
};

// Carrusel de una categoría: la primera tarjeta en el color del equipo del líder, con su foto
const CategoryCarousel: React.FC<{ data: Leaders; group: 'hitting' | 'pitching'; season: string }> = ({ data, group, season }) => {
    const { t } = useTranslation();
    const share = useShare();
    const { activeLeague } = useLeague();
    const categories = data.categories.filter((category) => category.group === group);
    const [selected, setSelected] = useState(categories[0]?.id);
    const category = categories.find((item) => item.id === selected) ?? categories[0];
    if (!category) return null;
    const leagueName = t(`leagues.${activeLeague}.name`);

    const sharePlayer = (leader: Leader) =>
        share({
            data: playerFromLeader(leader, category.id, season, leagueName, t),
            fileName: `el-play-${leader.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            text: `${leader.name} · ${t(`leaders.${category.id}`)} ${leader.value} · El Play`
        });

    return (
        <section aria-label={t(`leaders.${group}`)} className="space-y-3">
            <h2 className="px-4 text-xl font-extrabold">{t(`leaders.${group}`)}</h2>
            <div role="tablist" aria-label={t('leaders.group')} className="flex gap-2 overflow-x-auto px-4 scrollbar-none">
                {categories.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={item.id === category.id}
                        onClick={() => setSelected(item.id)}
                        className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold ${item.id === category.id ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card'}`}
                    >
                        {t(`leaders.${item.id}`)}
                    </button>
                ))}
            </div>

            {category.leaders.length === 0 ? (
                <p className="mx-4 rounded-card bg-surface px-4 py-8 text-center text-sm text-muted shadow-card">{category.error ? t('errors.leaders') : t('leaders.noData')}</p>
            ) : (
                <div className="snap-row px-4 pb-2">
                    {category.leaders.map((leader, index) => {
                        const first = index === 0;
                        const color = leader.color || '#2563eb';
                        const ink = first ? inkOn(color) : undefined;
                        return (
                            <article
                                key={`${leader.id}-${leader.rank}`}
                                className={`relative flex shrink-0 snap-start flex-col overflow-hidden rounded-[28px] p-5 ${first ? 'w-[78%] max-w-[300px] shadow-float' : 'w-[62%] max-w-[240px] bg-surface shadow-card'}`}
                                style={first ? { backgroundColor: color, color: ink } : undefined}
                            >
                                <div className="flex items-center justify-between text-[13px] font-bold">
                                    <span className={first ? 'opacity-85' : 'text-muted'}>{t('leaders.rank', { rank: leader.rank })}</span>
                                    <span className={first ? 'opacity-85' : 'text-muted'}>{leader.teamAbbrev}</span>
                                </div>
                                <div className="mt-3 flex items-end justify-between gap-2">
                                    <span className={`font-extrabold leading-none tracking-tight tabular-nums ${first ? 'text-[64px]' : 'text-[48px]'}`}>{leader.value ?? '—'}</span>
                                    <PlayerPhoto personId={leader.id} name={leader.name} size={first ? 96 : 72} background={first ? 'rgba(255,255,255,0.25)' : `${color}26`} team={{ id: leader.teamId, logo: leader.logo, color: leader.color }} />
                                </div>
                                <p className={`mt-3 truncate font-extrabold ${first ? 'text-2xl' : 'text-lg'}`}>{leader.name}</p>
                                <p className={`truncate text-sm font-semibold ${first ? 'opacity-80' : 'text-muted'}`}>{detailOf(leader, t) || leader.teamName}</p>
                                <button
                                    type="button"
                                    onClick={() => sharePlayer(leader)}
                                    className={`mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full text-sm font-bold ${first ? 'bg-white/90 text-[#14151a]' : 'bg-raised'}`}
                                    aria-label={t('share.sharePlayer', { name: leader.name })}
                                >
                                    <Share2 className="h-4 w-4" />
                                    {t('share.short')}
                                </button>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

export const LeadersPage: React.FC = () => {
    const { t } = useTranslation();
    const { activeLeague } = useLeague();
    const leaders = useLeaders(activeLeague);
    const data = leaders.data;
    const season = data ? seasonLabel(data.season, activeLeague) : '';

    return (
        <PullToRefresh onRefresh={async () => { await leaders.refetch(); }}>
            <div className="space-y-6 pt-5">
                <header className="px-4">
                    <p className="text-sm font-semibold text-muted">{t(`leagues.${activeLeague}.name`)}{season ? ` · ${t('common.season', { season })}` : ''}</p>
                    <h1 className="display text-[32px] leading-tight">{t('leaders.title')}</h1>
                </header>

                {data?.isPreviousSeason && (
                    <p className="mx-4 flex items-start gap-2 rounded-2xl bg-accent/10 px-3 py-2.5 text-sm text-accent-ink">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        {t('leaders.previousSeason')}
                    </p>
                )}

                {leaders.isPending ? (
                    <div className="flex gap-3 overflow-hidden px-4">
                        <Skeleton className="h-[300px] w-[78%] shrink-0 rounded-[28px]" />
                        <Skeleton className="h-[300px] w-[62%] shrink-0 rounded-[28px]" />
                    </div>
                ) : leaders.isError && !data ? (
                    <div className="px-4"><ErrorState error={leaders.error} onRetry={() => leaders.refetch()} /></div>
                ) : data ? (
                    <>
                        <CategoryCarousel data={data} group="hitting" season={season} />
                        <CategoryCarousel data={data} group="pitching" season={season} />
                        <p className="px-4 text-xs text-muted">{t('leaders.qualifiedNote')}</p>
                    </>
                ) : null}
            </div>
        </PullToRefresh>
    );
};
