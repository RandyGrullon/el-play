// Convierte los datos del juego en el contenido de la imagen para compartir (igual que el-play/src/share/subjects.ts)
import type { GameDetail, ScheduleGame, TopPerformer } from '../../types';
import { finalLabel, inningName, keyPlayOf, stateName } from '../../lib/baseball';
import { formatShortDate, formatTime } from '../../lib/format';
import { teamDisplayName } from '../../lib/teams';

type T = (key: string, options?: Record<string, unknown>) => string;

export interface PostTeam {
    name: string;
    abbrev: string;
    color: string;
    color2?: string | null;
    logo?: string | null;
    score: number | null;
    isWinner: boolean;
}

export interface ResultPost {
    kind: 'result';
    league: string;
    dateLabel: string;
    status: string;
    venue?: string;
    away: PostTeam;
    home: PostTeam;
    linescore?: { n: number; away: number | null; home: number | null }[];
    keyPlayLabel?: string;
    keyPlay?: string;
    keyDetail?: string;
}

export interface PlayerPost {
    kind: 'player';
    personId: number | null;
    name: string;
    teamId?: number | null;
    teamName: string;
    teamAbbrev: string;
    logo?: string | null;
    color: string;
    color2?: string | null;
    value: string;
    label: string;
    context: string;
    league: string;
}

export type PostData = ResultPost | PlayerPost;

const statusOf = (
    state: 'preview' | 'live' | 'final',
    detailedState: string,
    inning: { n: number | null; isTop: boolean } | null,
    inningsPlayed: number,
    scheduled: number,
    date: string | null,
    t: T,
    lang: string
) => {
    if (/postponed|cancel|suspended/i.test(detailedState)) return stateName(detailedState, lang).toUpperCase();
    if (state === 'final') return finalLabel(inningsPlayed, scheduled, lang).toUpperCase();
    if (state === 'live') return `${t('share.live')} · ${inningName(inning, lang, true)}`;
    return date ? `${formatShortDate(date, lang)} · ${formatTime(date, lang)}`.toUpperCase() : t('share.upcoming');
};

export const resultFromGame = (game: GameDetail, leagueName: string, t: T, lang: string): ResultPost => {
    const key = game.state === 'final' ? keyPlayOf(game.atBats, lang) : null;
    const team = (side: 'away' | 'home'): PostTeam => ({
        name: teamDisplayName(game[side], lang),
        abbrev: game[side].abbrev,
        color: game[side].color,
        color2: game[side].color2,
        logo: game[side].logo,
        score: game.state === 'preview' ? null : game[side].runs,
        isWinner: game.state === 'final' && game[side].isWinner
    });
    return {
        kind: 'result',
        league: leagueName,
        dateLabel: game.date ? formatShortDate(game.date, lang) : '',
        status: statusOf(game.state, game.detailedState, game.inning, game.linescore.length, game.scheduledInnings, game.date, t, lang),
        venue: game.venue,
        away: team('away'),
        home: team('home'),
        linescore: game.state === 'preview' ? undefined : game.linescore,
        keyPlayLabel: key ? t('share.keyPlay') : undefined,
        keyPlay: key?.headline,
        keyDetail: key?.detail
    };
};

export const resultFromSchedule = (game: ScheduleGame, leagueName: string, t: T, lang: string): ResultPost => {
    const team = (side: 'away' | 'home'): PostTeam => ({
        name: teamDisplayName(game[side], lang),
        abbrev: game[side].abbrev,
        color: game[side].color,
        color2: game[side].color2,
        logo: game[side].logo,
        score: game[side].score,
        isWinner: game.state === 'final' && game[side].isWinner
    });
    return {
        kind: 'result',
        league: leagueName,
        dateLabel: formatShortDate(game.date, lang),
        status: statusOf(game.state, game.detailedState, game.live ? { n: game.live.inning, isTop: game.live.isTop } : null, game.inningsPlayed ?? 0, game.scheduledInnings, game.date, t, lang),
        venue: game.venue,
        away: team('away'),
        home: team('home')
    };
};

export const playerFromPerformer = (performer: TopPerformer, game: GameDetail, leagueName: string, t: T, lang: string): PlayerPost => {
    const team = game.home.id === performer.teamId ? game.home : game.away;
    const rival = team === game.home ? game.away : game.home;
    const value =
        performer.kind === 'pitcher'
            ? `${performer.ip} IP · ${performer.k} K`
            : [`${performer.h}-${performer.ab}`, performer.hr ? `${performer.hr} HR` : '', performer.rbi ? `${performer.rbi} ${t('stats.rbi')}` : ''].filter(Boolean).join(' · ');
    return {
        kind: 'player',
        personId: performer.id,
        teamId: performer.teamId,
        name: performer.name.includes(',') ? performer.name.split(',').reverse().join(' ').trim() : performer.name,
        teamName: teamDisplayName(team, lang),
        teamAbbrev: team.abbrev,
        logo: team.logo,
        color: team.color,
        color2: team.color2,
        value,
        label: t('share.performer'),
        context: t('share.versus', { rival: rival.abbrev, date: game.date ? formatShortDate(game.date, lang) : '' }),
        league: leagueName
    };
};
