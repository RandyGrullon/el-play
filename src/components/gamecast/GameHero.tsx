import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Share2, Star } from 'lucide-react';
import type { GameState, TeamBase } from '../../types';
import { finalLabel, inningName, isNotPlayed, stateName } from '../../lib/baseball';
import { formatCountdown, formatShortDate, formatTime } from '../../lib/format';
import { teamDisplayName } from '../../lib/teams';
import { usePreferences } from '../../store/preferences';

export interface HeroModel {
    state: GameState;
    detailedState: string;
    date: string | null;
    scheduledInnings: number;
    inningsPlayed: number;
    inning: { n: number | null; isTop: boolean; state?: string | null } | null;
    outs: number;
    away: TeamBase & { score: number | null; isWinner: boolean };
    home: TeamBase & { score: number | null; isWinner: boolean };
}

export const inkOn = (hex: string) => {
    const value = parseInt(hex.replace('#', ''), 16);
    const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#14151a' : '#ffffff';
};

// Cabecera del juego: dos mitades con el color de cada equipo, marcador gigante
export const GameHero: React.FC<{ model: HeroModel; onShare?: () => void }> = ({ model, onShare }) => {
    const { t, i18n } = useTranslation();
    const { favoriteTeamId, toggleFavoriteTeam } = usePreferences();
    const notPlayed = isNotPlayed(model.detailedState);
    const showScores = model.state !== 'preview' && !notPlayed;

    let status: string;
    if (notPlayed) status = stateName(model.detailedState, i18n.language);
    else if (model.state === 'final') status = finalLabel(model.inningsPlayed, model.scheduledInnings, i18n.language);
    else if (model.state === 'live') {
        status = model.inning?.n ? `${inningName(model.inning, i18n.language, true)} · ${t('game.outsCount', { count: model.outs })}` : stateName(model.detailedState, i18n.language);
    } else status = model.date ? `${formatShortDate(model.date, i18n.language)} · ${formatTime(model.date, i18n.language)}` : '';

    const half = (team: HeroModel['away'], align: 'start' | 'end') => {
        const ink = inkOn(team.color);
        const dim = model.state === 'final' && !team.isWinner;
        const favorite = favoriteTeamId === team.id;
        return (
            <div className={`flex min-w-0 flex-1 flex-col justify-end px-4 pb-7 pt-16 ${align === 'end' ? 'items-end text-right' : ''}`} style={{ backgroundColor: team.color, color: ink }}>
                <button
                    type="button"
                    onClick={() => toggleFavoriteTeam(team.id)}
                    className={`mb-1 inline-flex max-w-full items-center gap-1 text-base font-bold ${align === 'end' ? 'flex-row-reverse' : ''}`}
                    aria-pressed={favorite}
                    aria-label={favorite ? t('teams.removeFavorite', { name: team.name }) : t('teams.addFavorite', { name: team.name })}
                >
                    <span className="truncate">{teamDisplayName(team, i18n.language)}</span>
                    <Star className={`h-4 w-4 shrink-0 ${favorite ? 'fill-current' : 'opacity-50'}`} />
                </button>
                {showScores ? (
                    <span className={`text-[76px] font-extrabold leading-[0.9] tabular-nums ${dim ? 'opacity-60' : ''}`}>{team.score ?? 0}</span>
                ) : (
                    <span className="text-3xl font-extrabold leading-none">{team.abbrev}</span>
                )}
                {team.record && <span className="mt-1 text-xs font-semibold opacity-75 tabular-nums">{team.record.wins}-{team.record.losses}</span>}
            </div>
        );
    };

    const startsIn = model.date ? new Date(model.date).getTime() - Date.now() : 0;

    return (
        <section className="relative flex overflow-hidden sm:mx-4 sm:mt-4 sm:rounded-card" aria-label={t('game.scoreboard')}>
            {half(model.away, 'start')}
            {half(model.home, 'end')}
            <Link to="/" aria-label={t('game.back')} className="absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 text-[#14151a] backdrop-blur">
                <ArrowLeft className="h-5 w-5" />
            </Link>
            {onShare && (
                <button type="button" onClick={onShare} aria-label={t('share.title')} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 text-[#14151a] backdrop-blur">
                    <Share2 className="h-5 w-5" />
                </button>
            )}
            <span className={`pill absolute left-1/2 top-[18px] -translate-x-1/2 whitespace-nowrap px-3.5 py-1.5 text-[13px] ${model.state === 'live' ? 'bg-live text-white' : 'bg-white/90 text-[#14151a]'}`}>
                {model.state === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
                {status}
                {model.state === 'preview' && startsIn > 0 && !notPlayed ? ` · ${formatCountdown(startsIn, i18n.language)}` : ''}
            </span>
        </section>
    );
};
