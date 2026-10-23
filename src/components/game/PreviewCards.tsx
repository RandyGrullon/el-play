// Previa del juego: cómo llegan los dos equipos (posiciones), entre ellos en la temporada, los que vienen calientes
// (últimos 7 días) y las alineaciones cuando se anuncian.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flame, Swords, TrendingUp, Users } from 'lucide-react';
import type { GameDetail, StandingRow, Standings } from '../../types';
import { usePreview, useStandings } from '../../lib/queries';
import { formatShortDate, seasonLabel } from '../../lib/format';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { Segmented } from '../ui/Segmented';
import { TeamLogo } from '../ui/TeamLogo';

/** La fila del equipo en las posiciones (en LIDOM, la de la fase que se juega) */
const rowOf = (standings: Standings | undefined, teamId: number): StandingRow | null => {
    if (!standings) return null;
    const lists: StandingRow[][] =
        standings.type === 'lidom'
            ? [standings[standings.activePhase], standings.regular, standings.roundRobin, standings.final]
            : standings.type === 'wbc'
              ? Object.values(standings.pools)
              : [standings.teams];
    for (const list of lists) {
        const row = list?.find((item) => item.team.id === teamId);
        if (row) return row;
    }
    return null;
};

const Heading: React.FC<{ id: string; icon: React.ReactNode; children: React.ReactNode }> = ({ id, icon, children }) => (
    <h2 id={id} className="eyebrow mb-3 flex items-center gap-1.5">
        {icon}
        {children}
    </h2>
);

export const TeamFormCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const standings = useStandings(game.league);
    const away = rowOf(standings.data, game.away.id);
    const home = rowOf(standings.data, game.home.id);
    if (!away || !home) return null;
    const es = !i18n.language.startsWith('en');
    const streak = (code: string) => (code && code !== '-' ? (es ? code.replace(/^W/, 'G').replace(/^L/, 'P') : code) : '—');
    const record = (value: { wins: number; losses: number } | null | undefined) => (value ? `${value.wins}-${value.losses}` : '—');
    const diff = (row: StandingRow) => (row.runsScored != null && row.runsAllowed != null ? row.runsScored - row.runsAllowed : null);
    const signed = (n: number | null) => (n === null ? '—' : n > 0 ? `+${n}` : String(n));
    const lines: { key: string; away: string; home: string }[] = [
        { key: 'record', away: record(away), home: record(home) },
        { key: 'streak', away: streak(away.streak), home: streak(home.streak) },
        { key: 'lastTen', away: record(away.lastTen), home: record(home.lastTen) },
        // Cada uno donde va a jugar: el visitante de visita y el local en casa
        { key: 'where', away: record(away.away), home: record(home.home) },
        { key: 'diff', away: signed(diff(away)), home: signed(diff(home)) }
    ].filter((line) => line.away !== '—' || line.home !== '—');

    return (
        <section className="card p-4" aria-labelledby="team-form">
            <Heading id="team-form" icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}>
                {t('previewMore.form')}
            </Heading>
            <table className="w-full text-sm tabular-nums">
                <thead>
                    <tr>
                        <th scope="col" className="sr-only">
                            {t('previewMore.stat')}
                        </th>
                        {(['away', 'home'] as const).map((side) => (
                            <th key={side} scope="col" className="w-[30%] pb-2 text-center">
                                <span className="inline-flex items-center gap-1.5 font-extrabold">
                                    <TeamLogo team={game[side]} size={20} />
                                    {game[side].abbrev}
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-line/10">
                    {lines.map((line) => (
                        <tr key={line.key}>
                            <th scope="row" className="py-2 text-left font-semibold text-muted">
                                {line.key === 'where' ? `${t('previewMore.awayRecord')} / ${t('previewMore.homeRecord')}` : t(`previewMore.${line.key}`)}
                            </th>
                            <td className="py-2 text-center font-bold">{line.away}</td>
                            <td className="py-2 text-center font-bold">{line.home}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
};

export const HeadToHeadCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t, i18n } = useTranslation();
    const preview = usePreview(game.league, game.away.id, game.home.id);
    const h2h = preview.data?.headToHead;
    if (!h2h) return null;
    const season = preview.data ? seasonLabel(preview.data.season, game.league) : '';
    const wins = (id: number) => h2h.wins[id] ?? 0;
    const teamOf = (id: number) => (id === game.away.id ? game.away : game.home);

    return (
        <section className="card p-4" aria-labelledby="head-to-head">
            <Heading id="head-to-head" icon={<Swords className="h-3.5 w-3.5" aria-hidden="true" />}>
                {t('previewMore.h2h', { season })}
            </Heading>
            {h2h.games.length === 0 ? (
                <p className="text-sm text-muted">{t('previewMore.h2hNone')}</p>
            ) : (
                <>
                    <div className="flex items-center justify-center gap-4">
                        {(['away', 'home'] as const).map((side, index) => (
                            <React.Fragment key={side}>
                                {index === 1 && <span className="text-xl font-bold text-faint">–</span>}
                                <span className={`flex items-center gap-2 ${index === 1 ? 'flex-row-reverse' : ''}`}>
                                    <TeamLogo team={game[side]} size={32} />
                                    <span className="font-display text-[34px] font-extrabold leading-none tabular-nums">{wins(game[side].id)}</span>
                                </span>
                            </React.Fragment>
                        ))}
                    </div>
                    <p className="mt-1 text-center text-xs font-semibold text-muted">
                        {t('previewMore.h2hRuns', { away: game.away.abbrev, awayRuns: h2h.runs[game.away.id] ?? 0, home: game.home.abbrev, homeRuns: h2h.runs[game.home.id] ?? 0 })}
                    </p>
                    <ul className="mt-3 divide-y divide-line/10 text-sm">
                        {h2h.games.slice(0, 5).map((meeting) => {
                            const awayTeam = teamOf(meeting.away.id);
                            const homeTeam = teamOf(meeting.home.id);
                            return (
                                <li key={meeting.gamePk}>
                                    <Link to={`/juego/${meeting.gamePk}`} className="flex items-center gap-3 py-2">
                                        <span className="w-20 shrink-0 text-xs font-semibold text-muted first-letter:uppercase">{meeting.date ? formatShortDate(meeting.date, i18n.language) : ''}</span>
                                        <span className="flex-1 tabular-nums">
                                            <span className={meeting.winnerId === awayTeam.id ? 'font-extrabold' : 'text-muted'}>
                                                {awayTeam.abbrev} {meeting.away.runs}
                                            </span>
                                            <span className="mx-1.5 text-faint">·</span>
                                            <span className={meeting.winnerId === homeTeam.id ? 'font-extrabold' : 'text-muted'}>
                                                {homeTeam.abbrev} {meeting.home.runs}
                                            </span>
                                        </span>
                                        {meeting.winnerId && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: teamOf(meeting.winnerId).color }} aria-hidden="true" />}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </section>
    );
};

export const HotPlayersCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const preview = usePreview(game.league, game.away.id, game.home.id);
    const hot = preview.data?.hot;
    const sides = (['away', 'home'] as const).map((side) => ({ side, team: game[side], players: hot?.teams[game[side].id] ?? [] })).filter((item) => item.players.length);
    if (!hot || !sides.length) return null;
    return (
        <section className="card p-4" aria-labelledby="hot-players">
            <Heading id="hot-players" icon={<Flame className="h-3.5 w-3.5" aria-hidden="true" />}>
                {t('previewMore.hot')}
            </Heading>
            <div className="space-y-4">
                {sides.map(({ side, team, players }) => (
                    <div key={side}>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold">
                            <TeamLogo team={team} size={18} />
                            {team.abbrev}
                        </p>
                        <ul className="space-y-2">
                            {players.map((player) => (
                                <li key={player.id} className="flex items-center gap-3">
                                    <PlayerPhoto personId={player.id} name={player.name} size={40} background={`${team.color}22`} team={team} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-bold">{player.name}</span>
                                        <span className="block text-xs text-muted">
                                            {[t('previewMore.hits', { h: player.h, ab: player.ab }), player.hr ? t('previewMore.hr', { count: player.hr }) : null, player.rbi ? t('previewMore.rbi', { count: player.rbi }) : null].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <span className="shrink-0 rounded-lg bg-raised px-2 py-1 text-right">
                                        <span className="block text-[10px] font-bold uppercase text-faint">OPS</span>
                                        <span className="block font-display text-base font-extrabold leading-none tabular-nums">{player.ops}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            <p className="mt-3 text-[11px] text-faint">{t('previewMore.hotNote')}</p>
        </section>
    );
};

export const LineupsCard: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { t } = useTranslation();
    const [side, setSide] = useState<'away' | 'home'>('away');
    const lineups = game.lineups;
    const list = lineups?.[side] ?? [];
    return (
        <section className="card p-4" aria-labelledby="lineups">
            <div className="mb-3 flex items-center justify-between gap-2">
                <h2 id="lineups" className="eyebrow flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('previewMore.lineups')}
                </h2>
                {lineups && (
                    <Segmented
                        size="sm"
                        label={t('previewMore.lineups')}
                        value={side}
                        onChange={setSide}
                        options={(['away', 'home'] as const).map((key) => ({ value: key, label: game[key].abbrev }))}
                    />
                )}
            </div>
            {!lineups ? (
                <p className="text-sm text-muted">{t('previewMore.lineupsLater')}</p>
            ) : list.length === 0 ? (
                <p className="text-sm text-muted">{t('previewMore.lineupPending', { team: game[side].abbrev })}</p>
            ) : (
                <ol className="divide-y divide-line/10 text-sm">
                    {list.map((player, index) => (
                        <li key={player.id} className="flex items-center gap-3 py-2">
                            <span className="w-4 text-center text-xs font-extrabold text-muted">{index + 1}</span>
                            <span className="min-w-0 flex-1 truncate font-semibold">
                                {player.name}
                                {player.bats && <span className="ml-1.5 text-xs font-normal text-faint">{t(`previewMore.bats.${player.bats}`, { defaultValue: player.bats })}</span>}
                            </span>
                            <span className="w-7 text-xs font-bold text-muted">{player.pos}</span>
                            <span className="num w-10 text-right text-muted">{player.avg ?? '—'}</span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
};

