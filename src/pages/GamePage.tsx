import React, { useEffect, useMemo, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import type { GameDetail, ScheduleGame } from '../types';
import { findScheduledGame, useGame } from '../lib/queries';
import { useAnalytics } from '../hooks/useAnalytics';
import { GameHeader, type HeaderModel } from '../components/game/GameHeader';
import { StrikeZonePanel } from '../components/game/StrikeZonePanel';
import { Situation } from '../components/game/Situation';
import { Matchup } from '../components/game/Matchup';
import { LineScore } from '../components/game/LineScore';
import { PlayByPlay } from '../components/game/PlayByPlay';
import { BoxScore } from '../components/game/BoxScore';
import { Summary } from '../components/game/Summary';
import { Preview } from '../components/game/Preview';
import { Segmented } from '../components/ui/Segmented';
import { ErrorState, Skeleton } from '../components/ui/States';
import { PullToRefresh } from '../components/common/PullToRefresh';

type Tab = 'live' | 'summary' | 'preview' | 'plays' | 'box';

const fromDetail = (game: GameDetail): HeaderModel => ({
    state: game.state,
    detailedState: game.detailedState,
    date: game.date,
    venue: game.venue,
    scheduledInnings: game.scheduledInnings,
    inningsPlayed: game.linescore.length,
    inning: game.inning ? { n: game.inning.n, isTop: game.inning.isTop, state: game.inning.state } : null,
    outs: game.count.outs,
    runners: game.runners,
    away: { ...game.away, score: game.away.runs },
    home: { ...game.home, score: game.home.runs }
});

const fromSchedule = (game: ScheduleGame): HeaderModel => ({
    state: game.state,
    detailedState: game.detailedState,
    date: game.date,
    venue: game.venue,
    scheduledInnings: game.scheduledInnings,
    inningsPlayed: game.inningsPlayed ?? 0,
    inning: game.live ? { n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState } : null,
    outs: game.live?.outs ?? 0,
    runners: game.live?.runners ?? { first: false, second: false, third: false },
    away: game.away,
    home: game.home
});

export const GamePage: React.FC = () => {
    const { t } = useTranslation();
    const { gamePk } = useParams<{ gamePk: string }>();
    const client = useQueryClient();
    const query = useGame(gamePk);
    const game = query.data;
    const scheduled = useMemo(() => findScheduledGame(client, gamePk), [client, gamePk]);
    const [params, setParams] = useSearchParams();
    const { trackGameView, trackTabChange } = useAnalytics();
    const tracked = useRef<string | null>(null);

    useEffect(() => {
        if (game && gamePk && tracked.current !== gamePk) {
            tracked.current = gamePk;
            trackGameView(gamePk, game.home.name, game.away.name);
        }
    }, [game, gamePk, trackGameView]);

    useEffect(() => {
        if (game) document.title = `${game.away.abbrev} ${game.away.runs}-${game.home.runs} ${game.home.abbrev} · El Play`;
        return () => {
            document.title = 'El Play · Béisbol en vivo';
        };
    }, [game?.away.runs, game?.home.runs, game?.away.abbrev, game?.home.abbrev]); // eslint-disable-line react-hooks/exhaustive-deps

    const state = game?.state ?? scheduled?.state ?? 'preview';
    const tabs: { value: Tab; label: string }[] = [
        state === 'live' ? { value: 'live', label: t('game.tabs.live') } : state === 'final' ? { value: 'summary', label: t('game.tabs.summary') } : { value: 'preview', label: t('game.tabs.preview') },
        ...(state !== 'preview' ? ([{ value: 'plays', label: t('game.tabs.plays') }, { value: 'box', label: t('game.tabs.box') }] as const) : [])
    ];
    const requested = params.get('tab') as Tab | null;
    const tab: Tab = tabs.some((item) => item.value === requested) ? (requested as Tab) : tabs[0].value;

    const changeTab = (value: Tab) => {
        setParams(value === tabs[0].value ? {} : { tab: value }, { replace: true });
        if (gamePk) trackTabChange(gamePk, value);
    };

    const header = game ? fromDetail(game) : scheduled ? fromSchedule(scheduled) : null;

    return (
        <PullToRefresh onRefresh={async () => { await query.refetch(); }}>
            <div className="space-y-4">
                <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
                    <ArrowLeft className="h-4 w-4" />
                    {t('game.back')}
                </Link>

                {header ? <GameHeader model={header} /> : <Skeleton className="h-[150px] rounded-card" />}

                {query.isError && !game ? (
                    <ErrorState error={query.error} onRetry={() => query.refetch()} />
                ) : !game ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Skeleton className="h-[420px] rounded-card" />
                        <Skeleton className="h-[260px] rounded-card" />
                    </div>
                ) : (
                    <>
                        {tabs.length > 1 && (
                            <div className="sticky top-14 z-20 -mx-4 bg-bg/85 px-4 py-2 backdrop-blur-md">
                                <Segmented<Tab> label={t('game.sections')} value={tab} onChange={changeTab} options={tabs} />
                            </div>
                        )}
                        <div key={tab} className="animate-fade-up">
                            {tab === 'live' && <LiveView game={game} />}
                            {tab === 'summary' && <Summary game={game} />}
                            {tab === 'preview' && <Preview game={game} />}
                            {tab === 'plays' && <PlayByPlay game={game} />}
                            {tab === 'box' && <BoxScore game={game} />}
                        </div>
                    </>
                )}
            </div>
        </PullToRefresh>
    );
};

const LiveView: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="order-2 lg:order-1">
                    <StrikeZonePanel game={game} />
                </div>
                <div className="order-1 space-y-4 lg:order-2">
                    <Situation game={game} />
                    <Matchup game={game} />
                </div>
            </div>
            <LineScore game={game} />
            <section className="card overflow-hidden" aria-label={t('plays.recent')}>
                <h2 className="eyebrow border-b border-line/10 px-4 py-3">{t('plays.recent')}</h2>
                <PlayByPlay game={game} limit={6} compact />
            </section>
        </div>
    );
};
