// «Mi temporada» (Fantasy v3): números de la temporada (puntos, promedio, mejor día, días, rachas), la gráfica de
// puntos por día con el puesto encima, el capitán, los pronósticos, los peloteros que más usó y los logros. Es la
// pestaña propia del Fantasy y va también en el perfil de cada fanático. Sin el servidor nuevo se arma con el perfil
// (y los logros con el cálculo de antes).
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, LineChart, Target, Trophy, Users } from 'lucide-react';
import type { LeagueId } from '../../types';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { PlayerLink } from '../ui/PlayerLink';
import { TeamLink } from '../ui/TeamLink';
import { ErrorState, OfflineState, Skeleton, waitingForNetwork } from '../ui/States';
import { useFantasyDay, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import type { FanProfileData } from '../../lib/fans';
import { ACHIEVEMENT_ICONS, achievementList, seasonData, useFanStats, withWeekTitle, type AchievementView, type FanStats, type FanStatsDay } from '../../lib/fantasyStats';
import { useWeekTitle } from '../../lib/fantasyLeagues';
import { credits, dayMonth, shortDay } from './fantasyUi';

export type KpiKey = 'points' | 'avg' | 'best' | 'days' | 'streak' | 'longest';
const ALL_KPIS: KpiKey[] = ['points', 'avg', 'best', 'days', 'streak', 'longest'];

interface SeasonViewProps {
    userId: string | null;
    league: LeagueId;
    own: boolean;
    /** El perfil (/fan/:id): respaldo si el servidor no tiene la temporada */
    profile?: FanProfileData | null;
    /** Modo de prueba (solo en desarrollo): datos inventados */
    demo?: boolean;
    /** Peloteros del día para los datos de prueba (así salen sus fotos) */
    demoPlayers?: Pick<FantasyPlayer, 'id' | 'name' | 'teamId' | 'role'>[];
    /** Qué números se muestran arriba (en el perfil, los que la cabecera no dice) */
    kpis?: KpiKey[];
    /** «Armar mi equipo» en la temporada vacía */
    onBuild?: () => void;
}

export const SeasonView: React.FC<SeasonViewProps> = ({ userId, league, own, profile, demo = false, demoPlayers, kpis = ALL_KPIS, onBuild }) => {
    const { t } = useTranslation();
    const query = useFanStats(userId, league, demo);
    // Los equipos (siglas y logos) salen del día de hoy, que ya está en la caché
    const today = useFantasyDay(league);
    const teams = today.data?.teams;
    const demoStats = useMemo(() => (demo && query.data && demoPlayers?.length ? withDemoPlayers(query.data, demoPlayers) : query.data), [demo, query.data, demoPlayers]);
    const data = seasonData(demoStats, query.isError || query.isPending ? profile : null);
    // «Campeón de la semana» (solo el propio: las ligas privadas no se ven desde afuera) sale de /weeks de sus ligas
    const title = useWeekTitle(league, userId, own && !demo && query.isSuccess);
    const achievements = withWeekTitle(achievementList(demoStats, query.isError ? profile : null), title.data);

    if (!data) {
        if (waitingForNetwork(query)) return <OfflineState />;
        if (query.isPending)
            return (
                <div className="space-y-3" aria-busy="true">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {[0, 1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-[72px] rounded-2xl" />
                        ))}
                    </div>
                    <Skeleton className="h-[200px] rounded-card" />
                </div>
            );
        return <ErrorState error={query.error} onRetry={() => query.refetch()} compact />;
    }

    const stats = data.stats;
    const empty = stats.totals.days === 0 && stats.days.length === 0;
    return (
        <div className="space-y-4">
            {empty ? (
                <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
                    <Trophy className="h-8 w-8 text-gold" aria-hidden="true" />
                    <p className="text-sm font-semibold">{own ? t('fantasyStats.empty') : t('fantasyStats.emptyOther')}</p>
                    {own && onBuild && (
                        <button type="button" onClick={onBuild} className="h-11 rounded-full bg-accent px-5 text-sm font-extrabold text-white">
                            {t('fantasyStats.emptyCta')}
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <Kpis stats={stats} keys={kpis} />
                    {stats.days.length > 0 && <PointsChart days={stats.days} own={own} best={stats.totals.best?.date ?? null} />}
                    {data.full && (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <CaptainCard stats={stats} teams={teams} />
                            <PicksCard stats={stats} />
                        </div>
                    )}
                    {data.full && stats.players.length > 0 && <MostUsed stats={stats} own={own} teams={teams} />}
                    {!data.full && query.isError && <p className="px-1 text-xs text-muted">{t('fantasyStats.fallback')}</p>}
                </>
            )}
            {achievements.length > 0 && <AchievementGallery items={achievements} />}
        </div>
    );
};

/** En el modo de prueba, los peloteros inventados se cambian por los del día (con sus fotos) */
const withDemoPlayers = (stats: FanStats, players: Pick<FantasyPlayer, 'id' | 'name' | 'teamId' | 'role'>[]): FanStats => {
    const pool = [...players].sort((a, b) => a.id - b.id).slice(0, stats.players.length || 8);
    const used = stats.players.map((row, index) => (pool[index] ? { ...row, id: pool[index].id, name: pool[index].name, teamId: pool[index].teamId, role: pool[index].role } : row));
    const best = stats.captain.best && pool[0] ? { ...stats.captain.best, id: pool[0].id, name: pool[0].name } : stats.captain.best;
    return { ...stats, players: used, captain: { ...stats.captain, best } };
};

// ---------------------------------------------------------------- números

const Kpis: React.FC<{ stats: FanStats; keys: KpiKey[] }> = ({ stats, keys }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const n = (value: number) => credits(Math.abs(value) >= 1000 ? Math.round(value) : value, lang);
    const items: Record<KpiKey, { value: string; hint?: string }> = {
        points: { value: n(stats.totals.total) },
        avg: { value: n(stats.totals.avg), hint: stats.totals.median ? t('fantasyStats.kpi.median', { n: credits(stats.totals.median, lang) }) : t('fantasyStats.kpi.perDay') },
        best: { value: stats.totals.best ? n(stats.totals.best.total) : '—', hint: stats.totals.best ? shortDay(stats.totals.best.date, lang) : undefined },
        days: { value: String(stats.totals.days) },
        streak: { value: String(stats.streak.current), hint: t('fantasyStats.kpi.daysUnit', { count: stats.streak.current }) },
        longest: { value: String(stats.streak.longest), hint: t('fantasyStats.kpi.daysUnit', { count: stats.streak.longest }) }
    };
    return (
        <dl className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3" aria-label={t('fantasyStats.kpis')}>
            {keys.map((key) => (
                <div key={key} className="min-w-0 rounded-2xl bg-surface px-3 py-2.5 shadow-card">
                    <dt className="truncate text-[11px] font-bold text-muted">{t(`fantasyStats.kpi.${key}`)}</dt>
                    <dd className="truncate font-display text-[26px] font-extrabold leading-tight tabular-nums">{items[key].value}</dd>
                    {items[key].hint && <dd className="truncate text-[11px] font-semibold text-muted first-letter:uppercase">{items[key].hint}</dd>}
                </div>
            ))}
        </dl>
    );
};

// ---------------------------------------------------------------- gráfica

/** Barras con los puntos de cada día y, si se pide, la línea del puesto en el eje de la derecha (el 1 arriba) */
export const PointsChart: React.FC<{ days: FanStatsDay[]; own: boolean; best: string | null }> = ({ days, own, best }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const [showRank, setShowRank] = useState(false);
    const scroller = useRef<HTMLDivElement>(null);
    const ranked = days.filter((day) => day.rank !== null);
    const hasRank = ranked.length > 1;
    const max = Math.max(1, ...days.map((day) => day.total));
    // El eje del puesto va del 1 al peor puesto que tuvo (así la línea usa todo el alto)
    const worstRank = Math.max(2, ...ranked.map((day) => day.rank ?? 1));
    const step = 10;
    const width = days.length * step;
    const top = Math.round(max);
    // Lo más nuevo a la vista (a la derecha)
    useLayoutEffect(() => {
        const node = scroller.current;
        if (node) node.scrollLeft = node.scrollWidth;
    }, [days.length]);
    const rankY = (rank: number) => ((rank - 1) / (worstRank - 1)) * 100;
    const points = ranked.map((day) => `${days.indexOf(day) * step + step / 2},${rankY(day.rank!)}`).join(' ');
    const bestDay = days.find((day) => day.date === best) ?? days.reduce((high, day) => (day.total > high.total ? day : high), days[0]);
    const summary = t('fantasyStats.chart.label', { count: days.length, best: credits(bestDay.total, lang) });

    return (
        <figure className="card space-y-3 p-4">
            <figcaption className="flex items-center justify-between gap-3">
                <span className="eyebrow flex items-center gap-1.5">
                    <LineChart className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('fantasyStats.chart.title')}
                </span>
                {hasRank && (
                    <button type="button" aria-pressed={showRank} onClick={() => setShowRank((value) => !value)} className={`h-8 shrink-0 rounded-full px-3 text-xs font-bold ${showRank ? 'bg-ink text-bg' : 'bg-raised text-muted'}`}>
                        {own ? t('fantasyStats.chart.showRank') : t('fantasyStats.chart.showRankOther')}
                    </button>
                )}
            </figcaption>
            <div className="flex gap-1.5">
                <div className="flex h-40 w-8 shrink-0 flex-col justify-between text-right text-[10px] font-semibold text-muted tabular-nums" aria-hidden="true">
                    <span>{credits(top, lang)}</span>
                    <span>{credits(Math.round(top / 2), lang)}</span>
                    <span>0</span>
                </div>
                <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
                    <div className="relative h-40" style={{ minWidth: days.length * 9 }}>
                        <svg viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={summary}>
                            {[0, 50, 100].map((y) => (
                                <line key={y} x1={0} x2={width} y1={y} y2={y} className="stroke-line/10" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                            ))}
                            {days.map((day, index) => {
                                const height = Math.max(1.5, (Math.max(0, day.total) / max) * 100);
                                const label = day.rank !== null && day.players ? t('fantasyStats.chart.barRank', { date: shortDay(day.date, lang), pts: credits(day.total, lang), rank: day.rank, players: day.players }) : t('fantasyStats.chart.bar', { date: shortDay(day.date, lang), pts: credits(day.total, lang) });
                                return (
                                    <rect key={day.date} x={index * step + 1.5} width={step - 3} y={100 - height} height={height} className={day.total < 0 ? 'fill-live' : day.date === bestDay.date ? 'fill-gold' : 'fill-accent'}>
                                        <title>{label}</title>
                                    </rect>
                                );
                            })}
                            {showRank && hasRank && <polyline points={points} fill="none" className="stroke-ink" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
                        </svg>
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted" style={{ minWidth: days.length * 9 }} aria-hidden="true">
                        <span>{dayMonth(days[0].date, lang)}</span>
                        {days.length > 1 && <span>{dayMonth(days[days.length - 1].date, lang)}</span>}
                    </div>
                </div>
                {showRank && hasRank && (
                    <div className="flex h-40 w-8 shrink-0 flex-col justify-between text-left text-[10px] font-semibold text-muted tabular-nums" aria-hidden="true">
                        <span>{t('fantasyStats.chart.rankAxis', { rank: 1 })}</span>
                        <span>{t('fantasyStats.chart.rankAxis', { rank: worstRank })}</span>
                    </div>
                )}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-muted">
                <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden="true" />
                    {t('fantasyStats.chart.legendPoints')}
                </li>
                {showRank && hasRank && (
                    <li className="flex items-center gap-1.5">
                        <span className="h-0.5 w-3 rounded-full bg-ink" aria-hidden="true" />
                        {t('fantasyStats.chart.legendRank')}
                    </li>
                )}
            </ul>
        </figure>
    );
};

// ---------------------------------------------------------------- capitán y pronósticos

const MiniStat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
    <div className="min-w-0">
        <dt className="truncate text-[11px] font-bold text-muted">{label}</dt>
        <dd className="truncate font-display text-2xl font-extrabold leading-tight tabular-nums">{value}</dd>
        {hint && <dd className="truncate text-[10px] font-semibold text-muted">{hint}</dd>}
    </div>
);

const CaptainCard: React.FC<{ stats: FanStats; teams?: FantasyDay['teams'] }> = ({ stats, teams }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const captain = stats.captain;
    const best = captain.best;
    const teamId = best ? stats.players.find((player) => player.id === best.id)?.teamId ?? null : null;
    const team = teamId !== null ? teams?.[teamId] : undefined;
    return (
        <section className="card space-y-3 p-4" aria-label={t('fantasyStats.captain.title')}>
            <h3 className="eyebrow flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                {t('fantasyStats.captain.title')}
            </h3>
            {captain.days === 0 ? (
                <p className="text-sm text-muted">{t('fantasyStats.captain.none')}</p>
            ) : (
                <dl className="grid grid-cols-3 gap-2">
                    <MiniStat label={t('fantasyStats.captain.days')} value={String(captain.days)} />
                    <MiniStat label={t('fantasyStats.captain.avg')} value={credits(captain.avg, lang)} />
                    <MiniStat label={t('fantasyStats.captain.bonus')} value={`+${credits(captain.bonus, lang)}`} hint={t('fantasyStats.captain.bonusHint')} />
                </dl>
            )}
            {best && (
                <div className="flex items-center gap-3 rounded-2xl bg-gold/10 p-2.5">
                    <PlayerLink id={best.id} decorative className="flex shrink-0">
                        <PlayerPhoto personId={best.id} name={best.name} size={44} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                    </PlayerLink>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-muted">{t('fantasyStats.captain.best')}</p>
                        <p className="truncate text-sm font-extrabold">
                            <PlayerLink id={best.id}>{best.name}</PlayerLink>
                        </p>
                        <p className="truncate text-xs text-muted first-letter:uppercase">{t('fantasyStats.captain.bestDetail', { pts: credits(best.points, lang), date: best.date ? shortDay(best.date.slice(0, 10), lang) : '' })}</p>
                    </div>
                </div>
            )}
        </section>
    );
};

/** % de aciertos (de los números: así no importa si el servidor lo manda de 0 a 1 o de 0 a 100) */
export const picksPct = (picks: FanStats['picks']) => (picks.made > 0 ? Math.round((picks.hits / picks.made) * 1000) / 10 : null);

const PicksCard: React.FC<{ stats: FanStats }> = ({ stats }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const pct = picksPct(stats.picks);
    return (
        <section className="card space-y-3 p-4" aria-label={t('fantasyStats.picks.title')}>
            <h3 className="eyebrow flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" aria-hidden="true" />
                {t('fantasyStats.picks.title')}
            </h3>
            {pct === null ? (
                <p className="text-sm text-muted">{t('fantasyStats.picks.none')}</p>
            ) : (
                <>
                    <dl className="grid grid-cols-3 gap-2">
                        <MiniStat label={t('fantasyStats.picks.hits')} value={String(stats.picks.hits)} />
                        <MiniStat label={t('fantasyStats.picks.made')} value={String(stats.picks.made)} />
                        <MiniStat label={t('fantasyStats.picks.pct')} value={`${credits(pct, lang)} %`} />
                    </dl>
                    <div className="h-2 overflow-hidden rounded-full bg-raised" role="meter" aria-label={t('fantasyStats.picks.summary', { hits: stats.picks.hits, made: stats.picks.made, pct: credits(pct, lang) })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                        <div className="h-full rounded-full bg-ball" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                </>
            )}
        </section>
    );
};

// ---------------------------------------------------------------- peloteros

const MostUsed: React.FC<{ stats: FanStats; own: boolean; teams?: FantasyDay['teams'] }> = ({ stats, own, teams }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const title = own ? t('fantasyStats.players.title') : t('fantasyStats.players.titleOther');
    return (
        <section className="space-y-2" aria-label={title}>
            <h3 className="eyebrow flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {title}
            </h3>
            <ol className="card divide-y divide-line/10 overflow-hidden">
                {stats.players.slice(0, 12).map((player, index) => {
                    const team = player.teamId !== null ? teams?.[player.teamId] : undefined;
                    return (
                        <li key={player.id} className="flex items-center gap-3 px-3 py-2.5 min-[360px]:px-4">
                            <span className="w-5 shrink-0 text-center font-display text-base font-extrabold text-muted">{index + 1}</span>
                            <PlayerLink id={player.id} decorative className="flex shrink-0">
                                <PlayerPhoto personId={player.id} name={player.name} size={40} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                            </PlayerLink>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-extrabold">
                                    <PlayerLink id={player.id}>{player.name}</PlayerLink>
                                </span>
                                <span className="block truncate text-xs text-muted">
                                    {team && (
                                        <>
                                            <TeamLink id={team.id}>{team.abbrev}</TeamLink> ·{' '}
                                        </>
                                    )}
                                    {player.role === 'P' ? t('fantasy.pitcher') : t('fantasy.batter')} · {t('fantasyStats.players.days', { count: player.days })}
                                </span>
                            </span>
                            <span className="shrink-0 text-right">
                                <span className="block font-display text-lg font-extrabold leading-none tabular-nums">{credits(player.points, lang)}</span>
                                <span className="block text-[10px] font-semibold text-muted">{t('fantasy.fans.pts')}</span>
                            </span>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
};

// ---------------------------------------------------------------- logros

export const AchievementGallery: React.FC<{ items: AchievementView[] }> = ({ items }) => {
    const { t, i18n } = useTranslation();
    const done = items.filter((item) => item.done).length;
    return (
        <section className="space-y-2" aria-label={t('fantasyStats.badges.title')}>
            <h3 className="eyebrow flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                {t('fantasyStats.badges.title')} · {t('fantasyStats.badges.count', { done, total: items.length })}
            </h3>
            <ul className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3 sm:grid-cols-4">
                {items.map((item) => {
                    const title = t(`fantasyStats.achievements.${item.id}.title`);
                    const state = item.done
                        ? item.date
                            ? t('fantasyStats.badges.unlocked', { date: dayMonth(item.date, i18n.language) })
                            : t('fantasyStats.badges.unlockedNoDate')
                        : item.progress
                          ? t('fantasyStats.badges.progress', { value: item.progress.value, goal: item.progress.goal })
                          : t('fantasyStats.badges.locked');
                    return (
                        <li key={item.id} className={`flex flex-col gap-1 rounded-2xl p-2.5 ${item.done ? 'bg-gold/15' : 'bg-raised'}`}>
                            <span className="flex items-center gap-1.5">
                                <span className={`text-xl leading-none ${item.done ? '' : 'opacity-50 grayscale'}`} aria-hidden="true">
                                    {ACHIEVEMENT_ICONS[item.id]}
                                </span>
                                <span className={`min-w-0 text-xs font-extrabold leading-tight ${item.done ? '' : 'text-muted'}`}>{title}</span>
                            </span>
                            <span className="text-[10px] leading-snug text-muted">{t(`fantasyStats.achievements.${item.id}.desc`)}</span>
                            {!item.done && item.progress && (
                                <span className="h-1.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={item.progress.goal} aria-valuenow={item.progress.value}>
                                    <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (item.progress.value / item.progress.goal) * 100)}%` }} />
                                </span>
                            )}
                            <span className={`mt-auto text-[10px] font-bold tabular-nums ${item.done ? 'text-gold' : 'text-faint'}`}>{state}</span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};
