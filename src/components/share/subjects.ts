// Convierte los datos de la app en el contenido de la imagen para compartir (igual que el-play/src/share/subjects.ts):
// el resultado de un juego, un pelotero (figura del juego o líder de una categoría) y la tabla de posiciones.
import type { GameDetail, Leader, ScheduleGame, StandingRow, TopPerformer } from '../../types';
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
    /** Línea de abajo («12 H en 40 VB», «46.1 IP · 34 K») */
    detail?: string;
    league: string;
}

export interface StandingsPost {
    kind: 'standings';
    title: string;
    subtitle: string;
    league: string;
    rows: { rank: number; abbrev: string; name: string; color: string; wins: number; losses: number; gamesBack: string }[];
}

export type PostData = ResultPost | PlayerPost | StandingsPost;

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

/** Un líder de una categoría (Líderes): su cifra, la categoría (en singular si es 1) y su puesto en la liga */
export const playerFromLeader = (leader: Leader, categoryId: string, seasonLabel: string, leagueName: string, t: T): PlayerPost => {
    const extra = leader.extra || {};
    let detail: string | undefined;
    if (extra.h !== null && extra.h !== undefined && extra.ab) detail = t('share.hitsInAtBats', { h: extra.h, ab: extra.ab });
    else if (extra.ip) detail = t('share.innings', { ip: extra.ip, k: extra.k ?? 0 });
    return {
        kind: 'player',
        personId: leader.id,
        name: leader.name,
        teamId: leader.teamId,
        teamName: leader.teamName,
        teamAbbrev: leader.teamAbbrev,
        logo: leader.logo,
        color: leader.color || '#2563eb',
        color2: leader.color2,
        value: String(leader.value ?? '—'),
        label: String(leader.value) === '1' ? t(`leaders.one.${categoryId}`, { defaultValue: t(`leaders.${categoryId}`) }) : t(`leaders.${categoryId}`),
        context: t('share.rankIn', { rank: leader.rank, league: leagueName, season: seasonLabel }),
        detail,
        league: leagueName
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

/** La tabla de posiciones (o un grupo del Clásico) */
export const standingsPost = (rows: StandingRow[], title: string, subtitle: string, leagueName: string, lang: string): StandingsPost => ({
    kind: 'standings',
    title,
    subtitle,
    league: leagueName,
    rows: rows.map((row) => ({
        rank: row.rank,
        abbrev: row.team.abbrev,
        name: teamDisplayName(row.team, lang),
        color: row.team.color,
        wins: row.wins,
        losses: row.losses,
        gamesBack: row.gamesBack
    }))
});
