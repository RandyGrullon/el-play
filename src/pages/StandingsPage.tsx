import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Share2, Star } from 'lucide-react';
import type { StandingRow } from '../types';
import { useStandings } from '../lib/queries';
import { seasonLabel } from '../lib/format';
import { teamDisplayName } from '../lib/teams';
import { useLeague } from '../store/LeagueContext';
import { usePreferences } from '../store/preferences';
import { useShare } from '../share/ShareSheet';
import { standingsPost } from '../share/subjects';
import { inkOn } from '../components/gamecast/GameHero';
import { TeamLogo } from '../components/ui/TeamLogo';
import { ErrorState, Skeleton } from '../components/ui/States';
import { PullToRefresh } from '../components/common/PullToRefresh';

type Phase = 'regular' | 'roundRobin' | 'final';

const streakLabel = (code: string, t: (key: string) => string) => {
    const match = code.match(/^([WL])(\d+)$/);
    return match ? `${match[1] === 'W' ? t('standings.wonShort') : t('standings.lostShort')}${match[2]}` : '';
};

// Tarjetas de equipo (diseño D4): el primero grande con su color, el resto en filas
const StandingCards: React.FC<{ rows: StandingRow[]; cutoff?: number; cutoffLabel?: string }> = ({ rows, cutoff, cutoffLabel }) => {
    const { t, i18n } = useTranslation();
    const { favoriteTeamId, toggleFavoriteTeam } = usePreferences();
    if (!rows.length) return <p className="card px-4 py-8 text-center text-sm text-muted">{t('standings.noData')}</p>;
    const [leader, ...rest] = rows;
    const ink = inkOn(leader.team.color);

    const favoriteButton = (row: StandingRow, color?: string) => {
        const favorite = favoriteTeamId === row.team.id;
        return (
            <button
                type="button"
                onClick={() => toggleFavoriteTeam(row.team.id)}
                aria-pressed={favorite}
                aria-label={favorite ? t('teams.removeFavorite', { name: row.team.name }) : t('teams.addFavorite', { name: row.team.name })}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={color ? { color } : undefined}
            >
                <Star className={`h-4 w-4 ${favorite ? 'fill-gold text-gold' : 'opacity-40'}`} />
            </button>
        );
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4 rounded-[26px] p-5 shadow-float" style={{ backgroundColor: leader.team.color, color: ink }}>
                <span className="text-[56px] font-extrabold leading-none">{leader.rank}</span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[22px] font-extrabold">{teamDisplayName(leader.team, i18n.language)}</span>
                    <span className="block text-sm font-semibold opacity-80 tabular-nums">
                        {leader.wins}-{leader.losses} · {leader.pct}
                    </span>
                </span>
                {streakLabel(leader.streak, t) && <span className="pill bg-black/10">{streakLabel(leader.streak, t)}</span>}
                {favoriteButton(leader, ink)}
            </div>
            {rest.map((row, index) => {
                const below = cutoff !== undefined && index + 1 >= cutoff;
                return (
                    <React.Fragment key={row.team.id}>
                        {cutoff !== undefined && index + 1 === cutoff && (
                            <div className="flex items-center gap-2 px-2 text-xs font-bold text-accent-ink">
                                <span className="h-0.5 flex-1 rounded bg-accent/25" />
                                {cutoffLabel}
                                <span className="h-0.5 flex-1 rounded bg-accent/25" />
                            </div>
                        )}
                        <div className={`flex items-center gap-3 rounded-[20px] px-3.5 py-3 ${below ? 'bg-raised' : 'bg-surface shadow-card'}`}>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] font-extrabold" style={{ backgroundColor: row.team.color, color: inkOn(row.team.color) }}>
                                {row.rank}
                            </span>
                            <TeamLogo team={row.team} size={26} />
                            <span className={`line-clamp-2 min-w-0 flex-1 text-[15px] font-bold leading-tight ${below ? 'text-muted' : ''}`}>{teamDisplayName(row.team, i18n.language)}</span>
                            <span className="font-bold tabular-nums">{row.wins}-{row.losses}</span>
                            <span className="w-9 text-right text-sm font-semibold text-muted tabular-nums">{row.gamesBack === '-' ? '—' : row.gamesBack}</span>
                            {favoriteButton(row)}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export const StandingsPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { activeLeague } = useLeague();
    const standings = useStandings(activeLeague);
    const share = useShare();
    const data = standings.data;
    const [phase, setPhase] = useState<Phase | null>(null);
    useEffect(() => setPhase(null), [activeLeague]);

    const leagueName = t(`leagues.${activeLeague}.name`);
    const season = data ? seasonLabel(data.season, activeLeague) : '';
    const activePhase = data?.type === 'lidom' ? phase ?? data.activePhase : null;
    const rows = !data ? [] : data.type === 'lidom' ? data[activePhase!] : data.type === 'sdc' ? data.teams : [];
    const phaseLabel = activePhase ? t(`standings.${activePhase}`) : '';

    const shareTable = (tableRows: StandingRow[], subtitle: string) =>
        share({
            data: standingsPost(tableRows, t('standings.title'), subtitle, leagueName, i18n.language),
            fileName: `el-play-posiciones-${activeLeague}`,
            text: `${t('standings.title')} ${leagueName} · El Play`
        });

    const pill = (value: Phase) => (
        <button
            key={value}
            type="button"
            role="tab"
            aria-selected={activePhase === value}
            onClick={() => setPhase(value)}
            className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold ${activePhase === value ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card'}`}
        >
            {t(`standings.${value}`)}
        </button>
    );

    return (
        <PullToRefresh onRefresh={async () => { await standings.refetch(); }}>
            <div className="space-y-4 px-4 pt-5">
                <header className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-muted">{leagueName}{season ? ` · ${t('common.season', { season })}` : ''}</p>
                        <h1 className="display text-[32px] leading-tight">{t('standings.title')}</h1>
                    </div>
                    {rows.length > 0 && (
                        <button type="button" onClick={() => shareTable(rows, `${phaseLabel || leagueName} · ${season}`)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface shadow-card" aria-label={t('share.shareTable')}>
                            <Share2 className="h-5 w-5" />
                        </button>
                    )}
                </header>

                {data?.isPreviousSeason && (
                    <p className="flex items-start gap-2 rounded-2xl bg-accent/10 px-3 py-2.5 text-sm text-accent-ink">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        {t('standings.previousSeason')}
                    </p>
                )}

                {standings.isPending ? (
                    <div className="space-y-2">
                        <Skeleton className="h-[96px] rounded-card" />
                        {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[56px] rounded-[20px]" />)}
                    </div>
                ) : standings.isError && !data ? (
                    <ErrorState error={standings.error} onRetry={() => standings.refetch()} />
                ) : data?.type === 'lidom' ? (
                    <>
                        <div role="tablist" aria-label={t('standings.phase')} className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">
                            {(['regular', 'roundRobin', 'final'] as const).map(pill)}
                        </div>
                        <StandingCards
                            rows={rows}
                            cutoff={activePhase === 'regular' ? 4 : activePhase === 'roundRobin' ? data.roundRobinInfo?.advance ?? 2 : undefined}
                            cutoffLabel={activePhase === 'regular' ? t('standings.cutRoundRobin') : t('standings.cutFinal')}
                        />
                    </>
                ) : data?.type === 'wbc' ? (
                    <div className="space-y-6">
                        {Object.entries(data.pools).map(([pool, poolRows]) => {
                            const title = i18n.language.startsWith('en') ? pool : pool.replace(/^Pool\b/, 'Grupo');
                            return (
                                <section key={pool} aria-label={title} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-extrabold">{title}</h2>
                                        <button type="button" onClick={() => shareTable(poolRows, `${title} · ${season}`)} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface shadow-card" aria-label={t('share.shareTable')}>
                                            <Share2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <StandingCards rows={poolRows} cutoff={2} cutoffLabel={t('standings.cutNext')} />
                                </section>
                            );
                        })}
                    </div>
                ) : data?.type === 'sdc' ? (
                    <StandingCards rows={data.teams} cutoff={4} cutoffLabel={t('standings.cutNext')} />
                ) : null}
            </div>
        </PullToRefresh>
    );
};
