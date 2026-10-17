import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarX2, Check, Gamepad2 } from 'lucide-react';
import type { ScheduleGame } from '../types';
import { useSchedule } from '../lib/queries';
import { dayKey, dayRange, formatDayNumber, formatLongDate, formatWeekday, todayKey } from '../lib/format';
import { useLeague } from '../store/LeagueContext';
import { usePreferences } from '../store/preferences';
import { useGameAlerts } from '../hooks/useGameAlerts';
import { GameFeedCard, GameFeedCardSkeleton } from '../components/feed/GameFeedCard';
import { TeamStories } from '../components/feed/TeamStories';
import { LogoMark } from '../components/brand/Logo';
import { BottomSheet } from '../components/ui/BottomSheet';
import { EmptyState, ErrorState, OfflineState, waitingForNetwork } from '../components/ui/States';
import { PullToRefresh } from '../components/common/PullToRefresh';
import { InstallBanner, InstallIconButton } from '../components/install/InstallCard';

// Solo se baja si el usuario quiere jugar mientras no hay juegos
const MiniGame = lazy(() => import('../components/game/MiniGame'));

const ORDER = { live: 0, preview: 1, final: 2 } as const;
const DAY = 86400000;

const DayChips: React.FC<{ days: string[]; selected: string; today: string; counts: Record<string, { total: number; live: number }>; onSelect: (day: string) => void }> = ({ days, selected, today, counts, onSelect }) => {
    const { t, i18n } = useTranslation();
    const scroller = useRef<HTMLDivElement>(null);
    const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - DAY).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + DAY).toISOString().slice(0, 10);

    useEffect(() => {
        const container = scroller.current;
        const element = container?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
        if (!container || !element) return;
        container.scrollTo?.({ left: element.offsetLeft - (container.clientWidth - element.clientWidth) / 2, behavior: 'smooth' });
    }, [selected, days.length]);

    const label = (day: string) =>
        day === today ? t('games.today') : day === yesterday ? t('games.yesterday') : day === tomorrow ? t('games.tomorrow') : `${formatWeekday(day, i18n.language)} ${formatDayNumber(day)}`;

    return (
        <div ref={scroller} role="tablist" aria-label={t('games.selectDate')} className="relative flex gap-2 overflow-x-auto px-4 scrollbar-none">
            {days.map((day) => {
                const active = day === selected;
                const info = counts[day];
                return (
                    <button
                        key={day}
                        data-day={day}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-label={formatLongDate(day, i18n.language)}
                        onClick={() => onSelect(day)}
                        className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold capitalize transition-colors ${active ? 'bg-ink text-bg' : 'bg-surface text-ink shadow-card'} ${!info && !active ? 'opacity-50' : ''}`}
                    >
                        {label(day)}
                        {info?.live ? <span className="h-2 w-2 animate-pulse rounded-full bg-live" /> : null}
                    </button>
                );
            })}
        </div>
    );
};

const LeagueSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const { t } = useTranslation();
    const { leagues, activeLeague, setActiveLeague } = useLeague();
    return (
        <BottomSheet open={open} onClose={onClose} title={t('leagues.choose')}>
            <ul className="flex flex-col gap-2 pb-2">
                {leagues.map((league) => (
                    <li key={league.id}>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveLeague(league.id);
                                onClose();
                            }}
                            className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left shadow-card"
                        >
                            <span className="h-4 w-4 rounded-full" style={{ backgroundColor: league.color }} />
                            <span className="flex-1">
                                <span className="block font-bold">{t(`leagues.${league.id}.name`)}</span>
                                <span className="block text-sm text-muted">{t(`leagues.${league.id}.fullName`)}</span>
                            </span>
                            {league.id === activeLeague && <Check className="h-5 w-5 text-accent-ink" />}
                        </button>
                    </li>
                ))}
            </ul>
        </BottomSheet>
    );
};

export const GamesPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { activeLeague, leagueConfig } = useLeague();
    const { favoriteTeamId } = usePreferences();
    const schedule = useSchedule(activeLeague);
    const timeZone = schedule.data?.timeZone || leagueConfig.timeZone;
    const today = todayKey(timeZone);
    const [selected, setSelected] = useState<string | null>(null);
    const [team, setTeam] = useState<number | null>(null);
    const [playing, setPlaying] = useState(false);
    const [leagueOpen, setLeagueOpen] = useState(false);

    useGameAlerts(schedule.data?.games);
    useEffect(() => {
        setSelected(null);
        setTeam(null);
    }, [activeLeague]);

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

    // Al empezar la temporada no se muestran los días vacíos de antes del primer juego (hoy siempre)
    const days = useMemo(() => {
        if (!schedule.data) return [];
        const first = Object.keys(byDay).sort()[0];
        return dayRange(schedule.data.startDate, schedule.data.endDate).filter((key) => key === today || !first || key >= first);
    }, [schedule.data, byDay, today]);

    const counts = useMemo(
        () => Object.fromEntries(Object.entries(byDay).map(([key, games]) => [key, { total: games.length, live: games.filter((g) => g.state === 'live').length }])),
        [byDay]
    );

    const day = selected ?? today;
    const dayGames = byDay[day] ?? [];
    const games = useMemo(() => {
        const list = dayGames.filter((game) => team === null || game.away.id === team || game.home.id === team);
        const favorite = (game: ScheduleGame) => (favoriteTeamId !== null && (game.away.id === favoriteTeamId || game.home.id === favoriteTeamId) ? 0 : 1);
        return list.sort((a, b) => ORDER[a.state] - ORDER[b.state] || favorite(a) - favorite(b) || a.date.localeCompare(b.date));
    }, [dayGames, team, favoriteTeamId]);

    const nextDay = useMemo(() => days.find((key) => key > day && byDay[key]?.length), [days, day, byDay]);
    const leagueName = t(`leagues.${activeLeague}.name`);

    return (
        <PullToRefresh onRefresh={async () => { await schedule.refetch(); }}>
            <div className="space-y-4 pt-5">
                <header className="flex items-start justify-between gap-3 px-4">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-muted first-letter:uppercase">{formatLongDate(day, i18n.language)}</p>
                        <h1 className="display truncate text-[32px] leading-tight">
                            {day === today ? t('games.todayIn', { league: leagueName }) : leagueName}
                        </h1>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <InstallIconButton />
                        <button type="button" onClick={() => setLeagueOpen(true)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-card" aria-label={t('leagues.choose')}>
                            <LogoMark size={30} />
                        </button>
                    </div>
                </header>

                <InstallBanner />
                {schedule.data && <TeamStories allGames={schedule.data.games} dayGames={dayGames} selected={team} onSelect={setTeam} />}
                {days.length > 0 && <DayChips days={days} selected={day} today={today} counts={counts} onSelect={setSelected} />}

                <div className="px-4">
                    {waitingForNetwork(schedule) ? (
<OfflineState />) : schedule.isPending ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[0, 1, 2].map((index) => <GameFeedCardSkeleton key={index} />)}</div>
                    ) : schedule.isError && !schedule.data ? (
                        <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />
                    ) : games.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {games.map((game) => (
                                <div key={game.gamePk} className={game.state === 'live' ? 'sm:col-span-2' : ''}>
                                    <GameFeedCard game={game} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <EmptyState icon={<CalendarX2 className="h-8 w-8" />} title={team !== null ? t('games.noneForTeam') : t('games.none')}>
                                {nextDay && (
                                    <button type="button" onClick={() => setSelected(nextDay)} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-accent-ink">
                                        {t('games.nextDay', { date: formatLongDate(nextDay, i18n.language) })}
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                )}
                                {!nextDay && <p>{t('games.noneInRange')}</p>}
                                {!playing && (
                                    <button type="button" onClick={() => setPlaying(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-raised px-4 py-2 text-xs font-bold text-ink">
                                        <Gamepad2 className="h-4 w-4" />
                                        {t('games.playMini')}
                                    </button>
                                )}
                            </EmptyState>
                            {playing && (
                                <Suspense fallback={<div className="skeleton h-[280px] rounded-card" />}>
                                    <MiniGame leagueColor={leagueConfig.color} leagueName={leagueConfig.shortName} />
                                </Suspense>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <LeagueSheet open={leagueOpen} onClose={() => setLeagueOpen(false)} />
        </PullToRefresh>
    );
};
