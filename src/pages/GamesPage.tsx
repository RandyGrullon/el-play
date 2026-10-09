import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarX2, Gamepad2 } from 'lucide-react';
import type { ScheduleGame } from '../types';
import { useSchedule, useStandings } from '../lib/queries';
import { dayKey, dayRange, formatLongDate, todayKey } from '../lib/format';
import { useLeague } from '../store/LeagueContext';
import { usePreferences } from '../store/preferences';
import { useGameAlerts } from '../hooks/useGameAlerts';
import { DateStrip } from '../components/game/DateStrip';
import { GameCard, GameCardSkeleton } from '../components/game/GameCard';
import { StandingsTable } from '../components/standings/StandingsTable';
import { EmptyState, ErrorState } from '../components/ui/States';
import { PullToRefresh } from '../components/common/PullToRefresh';
import MiniGame from '../components/game/MiniGame';

const ORDER = { live: 0, preview: 1, final: 2 } as const;

export const GamesPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { activeLeague, leagueConfig } = useLeague();
    const { favoriteTeamId } = usePreferences();
    const schedule = useSchedule(activeLeague);
    const timeZone = schedule.data?.timeZone || leagueConfig.timeZone;
    const today = todayKey(timeZone);
    const [selected, setSelected] = useState<string | null>(null);
    const [playing, setPlaying] = useState(false);

    useGameAlerts(schedule.data?.games);
    useEffect(() => setSelected(null), [activeLeague]);

    const days = useMemo(() => (schedule.data ? dayRange(schedule.data.startDate, schedule.data.endDate) : []), [schedule.data]);

    const byDay = useMemo(() => {
        const map: Record<string, ScheduleGame[]> = {};
        for (const game of schedule.data?.games ?? []) {
            let key = dayKey(game.date, timeZone);
            // Un juego de anoche que sigue en vivo después de medianoche se muestra en "Hoy"
            if (game.state === 'live' && key < today) key = today;
            (map[key] ||= []).push(game);
        }
        return map;
    }, [schedule.data, timeZone, today]);

    const counts = useMemo(
        () => Object.fromEntries(Object.entries(byDay).map(([key, games]) => [key, { total: games.length, live: games.filter((g) => g.state === 'live').length }])),
        [byDay]
    );

    const day = selected ?? today;
    const games = useMemo(() => {
        const list = [...(byDay[day] ?? [])];
        const hasFavorite = (game: ScheduleGame) => (favoriteTeamId !== null && (game.away.id === favoriteTeamId || game.home.id === favoriteTeamId) ? 0 : 1);
        return list.sort((a, b) => hasFavorite(a) - hasFavorite(b) || ORDER[a.state] - ORDER[b.state] || a.date.localeCompare(b.date));
    }, [byDay, day, favoriteTeamId]);

    const nextDay = useMemo(() => days.find((key) => key > day && byDay[key]?.length), [days, day, byDay]);
    const liveCount = games.filter((game) => game.state === 'live').length;

    return (
        <PullToRefresh onRefresh={async () => { await schedule.refetch(); }}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-4">
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <h1 className="display text-3xl">{day === today ? t('games.today') : t('games.title')}</h1>
                            <p className="text-sm capitalize text-muted">{formatLongDate(day, i18n.language)}</p>
                        </div>
                        {liveCount > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-live/10 px-3 py-1 text-xs font-bold text-live">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
                                {t('games.liveCount', { count: liveCount })}
                            </span>
                        )}
                    </div>

                    {days.length > 0 && <DateStrip days={days} selected={day} today={today} counts={counts} onSelect={setSelected} />}

                    {schedule.isPending ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {[0, 1, 2].map((index) => <GameCardSkeleton key={index} />)}
                        </div>
                    ) : schedule.isError && !schedule.data ? (
                        <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />
                    ) : games.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {games.map((game) => <GameCard key={game.gamePk} game={game} />)}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <EmptyState icon={<CalendarX2 className="h-8 w-8" />} title={t('games.none')}>
                                {nextDay ? (
                                    <button type="button" onClick={() => setSelected(nextDay)} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-accent-ink">
                                        {t('games.nextDay', { date: formatLongDate(nextDay, i18n.language) })}
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                ) : (
                                    <p>{t('games.noneInRange')}</p>
                                )}
                                {!playing && (
                                    <button type="button" onClick={() => setPlaying(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-xs font-semibold text-ink">
                                        <Gamepad2 className="h-4 w-4" />
                                        {t('games.playMini')}
                                    </button>
                                )}
                            </EmptyState>
                            {playing && <MiniGame leagueColor={leagueConfig.color} leagueName={leagueConfig.shortName} />}
                        </div>
                    )}
                </div>

                <aside className="hidden lg:block">
                    <StandingsAside />
                </aside>
            </div>
        </PullToRefresh>
    );
};

const StandingsAside: React.FC = () => {
    const { t } = useTranslation();
    const { activeLeague } = useLeague();
    const standings = useStandings(activeLeague);
    const data = standings.data;
    const rows = !data ? [] : data.type === 'lidom' ? data[data.activePhase] : data.type === 'sdc' ? data.teams : Object.values(data.pools).flat().slice(0, 8);

    return (
        <section className="card sticky top-20 overflow-hidden">
            <header className="flex items-center justify-between border-b border-line/10 px-4 py-3">
                <h2 className="eyebrow">{t('nav.standings')}</h2>
                <Link to="/posiciones" className="text-xs font-semibold text-accent-ink">{t('common.seeAll')}</Link>
            </header>
            {standings.isPending ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-6" />)}</div> : <StandingsTable rows={rows} compact />}
        </section>
    );
};
