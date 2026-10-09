import React from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import type { GameState, TeamBase } from '../../types';
import { finalLabel, inningName, isNotPlayed, stateName } from '../../lib/baseball';
import { formatShortDate, formatTime } from '../../lib/format';
import { usePreferences } from '../../store/preferences';
import { teamDisplayName } from '../../lib/teams';
import { TeamLogo } from '../ui/TeamLogo';
import { Bases, OutsDots } from './Bases';

export interface HeaderModel {
    state: GameState;
    detailedState: string;
    date: string | null;
    venue: string;
    scheduledInnings: number;
    inningsPlayed: number;
    inning: { n: number | null; isTop: boolean; state?: string | null } | null;
    outs: number;
    runners: { first: unknown; second: unknown; third: unknown };
    away: TeamBase & { score: number | null; isWinner: boolean; teamName?: string };
    home: TeamBase & { score: number | null; isWinner: boolean; teamName?: string };
}

export const GameHeader: React.FC<{ model: HeaderModel }> = ({ model }) => {
    const { t, i18n } = useTranslation();
    const live = model.state === 'live';
    const final = model.state === 'final';
    const notPlayed = isNotPlayed(model.detailedState);
    const between = model.inning?.state === 'Middle' || model.inning?.state === 'End';

    let status: React.ReactNode;
    if (notPlayed) status = <span className="font-semibold text-live">{stateName(model.detailedState, i18n.language)}</span>;
    else if (final) status = <span className="display text-xl">{finalLabel(model.inningsPlayed, model.scheduledInnings, i18n.language)}</span>;
    else if (live && model.inning?.n) {
        status = (
            <span className="flex flex-col items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-live">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-live" />
                    <span className="display text-xl">{inningName(model.inning, i18n.language, true)}</span>
                </span>
                {!between && (
                    <span className="flex items-center gap-2">
                        <Bases runners={model.runners} size={30} color={(model.inning.isTop ? model.away : model.home).color} />
                        <OutsDots outs={model.outs} />
                    </span>
                )}
            </span>
        );
    } else if (live) status = <span className="font-semibold text-live">{stateName(model.detailedState, i18n.language)}</span>;
    else if (model.date) {
        status = (
            <span className="flex flex-col items-center">
                <span className="display text-xl">{formatTime(model.date, i18n.language)}</span>
                <span className="text-xs capitalize text-muted">{formatShortDate(model.date, i18n.language)}</span>
            </span>
        );
    }

    return (
        <section className="card px-3 py-4 sm:px-6 sm:py-5" aria-label={t('game.scoreboard')}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
                <TeamSide team={model.away} align="start" showScore={model.state !== 'preview' && !notPlayed} dim={final && !model.away.isWinner} />
                <div className="min-w-[88px] text-center">{status}</div>
                <TeamSide team={model.home} align="end" showScore={model.state !== 'preview' && !notPlayed} dim={final && !model.home.isWinner} />
            </div>
            {model.venue && <p className="mt-3 truncate text-center text-xs text-muted">{model.venue}</p>}
        </section>
    );
};

const TeamSide: React.FC<{ team: HeaderModel['away']; align: 'start' | 'end'; showScore: boolean; dim: boolean }> = ({ team, align, showScore, dim }) => {
    const { t, i18n } = useTranslation();
    const { favoriteTeamId, toggleFavoriteTeam } = usePreferences();
    const favorite = favoriteTeamId === team.id;
    const end = align === 'end';

    const identity = (
        <div className={`flex min-w-0 flex-col ${end ? 'items-end text-right' : 'items-start'}`}>
            <TeamLogo team={team} size={44} />
            <span className="display mt-1 text-2xl leading-none">{team.abbrev}</span>
            <span className="mt-0.5 hidden max-w-full truncate text-xs text-muted sm:block">{teamDisplayName(team, i18n.language)}</span>
            <span className={`mt-1 flex items-center gap-1 text-[11px] text-faint ${end ? 'flex-row-reverse' : ''}`}>
                {team.record && <span className="num">{team.record.wins}-{team.record.losses}</span>}
                <button
                    type="button"
                    onClick={() => toggleFavoriteTeam(team.id)}
                    className={`rounded p-0.5 ${favorite ? 'text-gold' : 'text-faint hover:text-muted'}`}
                    aria-pressed={favorite}
                    aria-label={favorite ? t('teams.removeFavorite', { name: team.name }) : t('teams.addFavorite', { name: team.name })}
                >
                    <Star className={`h-3.5 w-3.5 ${favorite ? 'fill-current' : ''}`} />
                </button>
            </span>
        </div>
    );

    const score = showScore ? <span className={`display num text-5xl leading-none sm:text-6xl ${dim ? 'text-faint' : ''}`}>{team.score ?? 0}</span> : null;

    return <div className={`flex items-center gap-3 ${end ? 'justify-end' : 'justify-start'}`}>{end ? <>{score}{identity}</> : <>{identity}{score}</>}</div>;
};
