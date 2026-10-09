import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Leaders } from '../../types';
import { TeamLogo } from '../ui/TeamLogo';

export const LeaderBoard: React.FC<{ data: Leaders; group: 'hitting' | 'pitching' }> = ({ data, group }) => {
    const { t } = useTranslation();
    const categories = data.categories.filter((category) => category.group === group);

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => {
                const [first, ...rest] = category.leaders;
                return (
                    <section key={category.id} className="card overflow-hidden" aria-label={t(`leaders.${category.id}`)}>
                        <header className="flex items-baseline justify-between border-b border-line/10 px-4 py-3">
                            <h2 className="font-semibold">{t(`leaders.${category.id}`)}</h2>
                            <span className="eyebrow">{t(`leaders.${category.id}Short`)}</span>
                        </header>
                        {!first ? (
                            <p className="px-4 py-8 text-center text-sm text-muted">{category.error ? t('errors.leaders') : t('leaders.noData')}</p>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 px-4 py-3" style={{ background: `linear-gradient(90deg, ${first.color ?? 'transparent'}1f, transparent 70%)` }}>
                                    {first.logo && <TeamLogo team={{ id: first.teamId ?? 0, abbrev: first.teamAbbrev, logo: first.logo, color: first.color ?? '#64748b' }} size={36} />}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-semibold">{first.name}</span>
                                        <span className="block truncate text-xs text-muted">{first.teamName}</span>
                                    </span>
                                    <span className="display num text-3xl">{first.value ?? '—'}</span>
                                </div>
                                <ol className="divide-y divide-line/10 border-t border-line/10">
                                    {rest.map((leader) => (
                                        <li key={`${leader.id}-${leader.rank}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                                            <span className="num w-4 text-faint">{leader.rank}</span>
                                            <span className="min-w-0 flex-1 truncate">{leader.name}</span>
                                            <span className="rounded bg-raised px-1.5 text-[11px] font-semibold text-muted">{leader.teamAbbrev}</span>
                                            <span className="num w-12 text-right font-semibold">{leader.value ?? '—'}</span>
                                        </li>
                                    ))}
                                </ol>
                            </>
                        )}
                    </section>
                );
            })}
        </div>
    );
};
