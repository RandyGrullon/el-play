// Página de un equipo: su récord y puesto, el juego de hoy (o el próximo), la forma, en casa y de visita, contra cada
// rival, bateo y pitcheo con su puesto en la liga, sus líderes, la plantilla, los resultados, el calendario y sus
// movimientos. El botón flotante: comparar con otro equipo, compartir, hacerlo «mi equipo» y su próximo juego.
import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarClock, ChevronRight, GitCompare, Share2, Star } from 'lucide-react';
import type { ScheduleGame } from '../types';
import { useLeague } from '../store/LeagueContext';
import { usePreferences } from '../store/preferences';
import { useRace, useStandings } from '../lib/queries';
import { qualifies, usePlayers, type PlayerRow, type PlayersData } from '../lib/stats';
import { TEAM_SORTS, leagueRank, recordOf, useTeamStats, type TeamGroup, type TeamRow, type TeamSort } from '../lib/teamStats';
import { nextGame, standingOf, summarize, teamResults, useTeamGames, versusAll, type Split, type TeamResult } from '../lib/team';
import { pythagorean } from '../lib/advanced';
import { formatShortDate, formatTime, localeFor, seasonLabel } from '../lib/format';
import { showToast } from '../lib/toast';
import { useNow } from '../hooks/useNow';
import { inkOn } from '../components/gamecast/GameHero';
import { TeamLogo } from '../components/ui/TeamLogo';
import { PlayerPhoto } from '../components/ui/PlayerPhoto';
import { Segmented } from '../components/ui/Segmented';
import { ErrorState, OfflineState, Skeleton, waitingForNetwork } from '../components/ui/States';
import { ActionDial } from '../components/ui/ActionDial';
import { GameFeedCard } from '../components/feed/GameFeedCard';
import { TransactionsCard } from '../components/stats/Transactions';
import { TeamCompareSheet } from '../components/compare/CompareSheet';

/** «3 nov» (sin el día de la semana, para que quepa en una línea) */
const dayMonth = (date: string, lang: string) => new Date(date).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', timeZone: 'America/Santo_Domingo' }).replace('.', '');
const ordinal = (n: number, language: string) => (language.startsWith('en') ? `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}` : `${n}.º`);
/** «8-4»: de nuestros juegos ({ w, l }) o de las posiciones de MLB ({ wins, losses }) */
const splitText = (split: Split | { wins: number; losses: number } | null | undefined) => (!split ? '—' : 'w' in split ? `${split.w}-${split.l}` : `${split.wins}-${split.losses}`);

/** Volver a donde se estaba (o a Posiciones si se llegó por un enlace) */
export const useBack = (fallback: string) => {
    const navigate = useNavigate();
    const location = useLocation();
    return () => (location.key !== 'default' ? navigate(-1) : navigate(fallback, { replace: true }));
};

/** Compartir el enlace de la página (o copiarlo si el teléfono no comparte) */
export const shareLink = async (title: string, text: string, copied: string) => {
    const url = window.location.href;
    try {
        if (navigator.share) {
            await navigator.share({ title, text, url });
            return;
        }
        await navigator.clipboard.writeText(url);
        showToast(copied);
    } catch {
        // Cancelado por la persona: nada que hacer
    }
};

export const TeamPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { teamId: param } = useParams<{ teamId: string }>();
    const teamId = Number(param) || null;
    const { activeLeague } = useLeague();
    const { favoriteTeamId, toggleFavoriteTeam } = usePreferences();
    const navigate = useNavigate();
    const back = useBack('/posiciones');
    const teamStats = useTeamStats(activeLeague, undefined);
    const standings = useStandings(activeLeague);
    const gamesQuery = useTeamGames(activeLeague, teamId);
    const players = usePlayers(activeLeague);
    const [comparing, setComparing] = useState(false);
    // La hora de ahora (cada minuto): cuál es el próximo juego y cuáles faltan
    const now = useNow(60000);

    const games = gamesQuery.data?.games ?? [];
    const results = useMemo(() => (teamId ? teamResults(games, teamId) : []), [games, teamId]);
    const summary = useMemo(() => summarize(results), [results]);
    const rows = teamStats.data?.teams ?? [];
    const row = rows.find((item) => item.id === teamId) ?? null;
    const standing = teamId ? standingOf(standings.data, teamId) : null;
    // Quién es: de las estadísticas, de las posiciones o de sus juegos (lo que llegue primero)
    const fromGames = games.map((game) => (game.home.id === teamId ? game.home : game.away)).find(Boolean);
    const team = row ?? (standing ? { ...standing.row.team } : null) ?? fromGames ?? null;
    const upcoming = nextGame(games, now);

    if (!teamId) return null;
    if (!team) {
        if (waitingForNetwork(teamStats) && waitingForNetwork(gamesQuery)) return <div className="p-4"><OfflineState /></div>;
        if (teamStats.isPending || gamesQuery.isPending || standings.isPending) {
            return (
                <div className="space-y-3 p-4">
                    <Skeleton className="h-56 rounded-[28px]" />
                    <Skeleton className="h-32 rounded-card" />
                    <Skeleton className="h-64 rounded-card" />
                </div>
            );
        }
        return (
            <div className="p-4">
                <ErrorState error={gamesQuery.error ?? teamStats.error ?? new Error('not_found')} onRetry={() => gamesQuery.refetch()} />
            </div>
        );
    }

    const color = team.color || '#2563eb';
    const ink = inkOn(color);
    const favorite = favoriteTeamId === team.id;
    const record = row ? recordOf(row) : null;
    const w = standing?.row.wins ?? record?.w ?? summary.w;
    const l = standing?.row.losses ?? record?.l ?? summary.l;
    const scored = standing?.row.runsScored ?? record?.scored ?? summary.rs;
    const allowed = standing?.row.runsAllowed ?? record?.allowed ?? summary.ra;
    const diff = scored !== null && allowed !== null ? scored - allowed : null;
    const expected = scored !== null && allowed !== null ? pythagorean(scored, allowed, w + l) : null;
    const season = gamesQuery.data?.season ?? teamStats.data?.season;

    return (
        <div className="space-y-5 pb-6">
            {/* Cabecera en el color del equipo */}
            <section className="relative overflow-hidden rounded-b-[32px] px-4 pb-6 pt-[calc(14px+env(safe-area-inset-top))]" style={{ backgroundColor: color, color: ink }}>
                <div className="pointer-events-none absolute -right-16 -top-10 h-64 w-64 rounded-full opacity-15" style={{ background: `radial-gradient(circle, ${ink} 0%, transparent 70%)` }} aria-hidden="true" />
                <div className="relative flex items-center justify-between">
                    <button type="button" onClick={back} aria-label={t('game.back')} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 text-[#14151a] backdrop-blur">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    {season && <span className="pill bg-black/15 text-xs font-bold">{t('common.season', { season: seasonLabel(season, activeLeague) })}</span>}
                </div>
                <div className="relative mt-4 flex items-center gap-4">
                    <span className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-white/90 shadow-float">
                        <TeamLogo team={team} size={72} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="font-display text-[30px] font-extrabold leading-[1.02] [text-wrap:balance]">{team.name}</h1>
                        <p className="mt-1 font-display text-4xl font-extrabold leading-none tabular-nums">
                            {w}-{l}
                            {standing && <span className="ml-2 text-lg opacity-80">{standing.row.pct}</span>}
                        </p>
                        {standing && (
                            <p className="mt-1 text-sm font-semibold opacity-85">
                                {t('team.rank', { rank: ordinal(standing.row.rank, i18n.language), total: standing.total })}
                                {standing.phase ? ` · ${t(`standings.${standing.phase}`)}` : ''}
                                {standing.row.gamesBack && standing.row.gamesBack !== '-' ? ` · ${t('team.gamesBack', { gb: standing.row.gamesBack })}` : ''}
                            </p>
                        )}
                    </div>
                </div>
                <ul className="relative mt-4 flex flex-wrap gap-1.5 text-[12px] font-bold">
                    {summary.streak && <li className="rounded-full bg-black/15 px-2.5 py-1">{t(summary.streak.won ? 'team.streakWon' : 'team.streakLost', { count: summary.streak.n })}</li>}
                    {summary.last10.length > 0 && <li className="rounded-full bg-black/15 px-2.5 py-1">{t('team.lastTen', { w: summary.last10.filter((r) => r.won).length, l: summary.last10.filter((r) => !r.won).length })}</li>}
                    {diff !== null && <li className="rounded-full bg-black/15 px-2.5 py-1">{t('statsPage.teamDiff', { diff: diff > 0 ? `+${diff}` : diff })}</li>}
                    {favorite && (
                        <li className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[#14151a]">
                            <Star className="h-3.5 w-3.5 fill-gold text-gold" aria-hidden="true" /> {t('team.myTeam')}
                        </li>
                    )}
                </ul>
            </section>

            {/* El juego de hoy o el próximo */}
            {upcoming && (
                <section className="px-4" aria-labelledby="team-next">
                    <h2 id="team-next" className="eyebrow mb-2">
                        {upcoming.state === 'live' ? t('team.playingNow') : t('team.nextGame')}
                    </h2>
                    <GameFeedCard game={upcoming} />
                </section>
            )}

            {gamesQuery.isPending ? (
                <div className="space-y-3 px-4">
                    <Skeleton className="h-28 rounded-card" />
                    <Skeleton className="h-40 rounded-card" />
                </div>
            ) : (
                <>
                    {results.length > 0 && <Form summary={summary} />}
                    <Trajectory teamId={team.id} color={color} />
                    <Splits
                        items={[
                            [t('team.home'), standing?.row.home ? splitText(standing.row.home) : splitText(summary.home)],
                            [t('team.away'), standing?.row.away ? splitText(standing.row.away) : splitText(summary.away)],
                            [t('team.oneRun'), standing?.row.oneRun ? splitText(standing.row.oneRun) : splitText(summary.oneRun)],
                            [t('team.extra'), splitText(standing?.row.extraInning)],
                            [t('team.runs'), scored !== null && allowed !== null ? `${scored}-${allowed}` : '—'],
                            [t('team.expected'), expected ? `${expected.wins}-${expected.losses}` : '—']
                        ]}
                    />
                    {results.length > 0 && <VersusList results={results} />}
                </>
            )}

            {row && rows.length > 0 && (
                <div className="space-y-5 px-4">
                    <StatBlock group="bat" team={row} teams={rows} />
                    <StatBlock group="pitch" team={row} teams={rows} />
                </div>
            )}

            {players.data && <Leaders teamId={team.id} players={players.data} team={team} />}
            {players.data && <Roster teamId={team.id} players={players.data} team={team} />}
            {results.length > 0 && <Results results={results} />}
            <Upcoming games={games} teamId={team.id} now={now} />

            <div className="px-4">
                <TransactionsCard league={activeLeague} teamId={team.id} onOpenPlayer={(id) => navigate(`/jugador/${id}`)} />
            </div>

            <ActionDial
                label={t('dial.teamMenu', { team: team.name })}
                color={color}
                actions={[
                    { key: 'compare', label: t('dial.compare'), icon: GitCompare, onSelect: () => setComparing(true), disabled: rows.length < 2 },
                    { key: 'share', label: t('dial.share'), icon: Share2, onSelect: () => void shareLink(team.name, t('team.shareText', { team: team.name }), t('dial.copied')) },
                    { key: 'favorite', label: favorite ? t('dial.isMyTeam') : t('dial.myTeam'), icon: Star, active: favorite, onSelect: () => toggleFavoriteTeam(team.id) },
                    { key: 'next', label: upcoming?.state === 'live' ? t('dial.live') : t('dial.nextGame'), icon: CalendarClock, disabled: !upcoming, onSelect: () => upcoming && navigate(`/juego/${upcoming.gamePk}`) }
                ]}
            />

            {comparing && row && <TeamCompareSheet team={row} teams={rows} standings={standings.data} results={results} games={games} onClose={() => setComparing(false)} />}
        </div>
    );
};

// ---------------------------------------------------------------- piezas

/** Los últimos 10 (del más viejo al más nuevo) como cuadritos de ganado y perdido */
const Form: React.FC<{ summary: ReturnType<typeof summarize> }> = ({ summary }) => {
    const { t, i18n } = useTranslation();
    return (
        <section className="card mx-4 p-4" aria-labelledby="team-form">
            <h2 id="team-form" className="eyebrow">
                {t('team.form')}
            </h2>
            <ol className="mt-3 flex gap-1.5">
                {summary.last10.map((result) => (
                    <li key={result.game.gamePk} className="min-w-0 flex-1">
                        <Link
                            to={`/juego/${result.game.gamePk}`}
                            className={`grid h-11 place-items-center rounded-xl font-display text-lg font-extrabold ${result.won ? 'bg-ball/15 text-ball' : 'bg-live/10 text-live'}`}
                            aria-label={t('team.resultLabel', { date: formatShortDate(result.game.date, i18n.language), result: result.won ? t('team.won') : t('team.lost'), score: `${result.runs}-${result.allowed}`, rival: result.opponent.name })}
                        >
                            {result.won ? t('team.w') : t('team.l')}
                        </Link>
                    </li>
                ))}
            </ol>
        </section>
    );
};

/** Juegos sobre .500 día a día (la misma carrera de Posiciones, solo de este equipo) */
const Trajectory: React.FC<{ teamId: number; color: string }> = ({ teamId, color }) => {
    const { t } = useTranslation();
    const { activeLeague } = useLeague();
    const race = useRace(activeLeague);
    const points = race.data?.teams.find((team) => team.id === teamId)?.points ?? [];
    if (points.length < 3) return null;
    const width = 300;
    const height = 70;
    const top = Math.max(1, ...points.map(Math.abs));
    const x = (index: number) => (index / (points.length - 1)) * width;
    const y = (value: number) => height / 2 - (value / top) * (height / 2 - 4);
    const path = points.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    return (
        <section className="card mx-4 p-4" aria-labelledby="team-race">
            <div className="flex items-baseline justify-between">
                <h2 id="team-race" className="eyebrow">
                    {t('team.trajectory')}
                </h2>
                <span className="font-display text-lg font-extrabold tabular-nums">{last > 0 ? `+${last}` : last}</span>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-[70px] w-full" preserveAspectRatio="none" role="img" aria-label={t('team.trajectoryLabel', { value: last })}>
                <line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="4 4" />
                <path d={path} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <p className="text-xs text-muted">{t('team.trajectoryHint')}</p>
        </section>
    );
};

const Splits: React.FC<{ items: [string, string][] }> = ({ items }) => (
    <dl className="mx-4 grid grid-cols-3 gap-2">
        {items.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-surface p-2.5 text-center shadow-card">
                <dd className="font-display text-xl font-extrabold leading-none tabular-nums">{value}</dd>
                <dt className="mt-1 text-[11px] font-semibold leading-tight text-muted">{label}</dt>
            </div>
        ))}
    </dl>
);

const VersusList: React.FC<{ results: TeamResult[] }> = ({ results }) => {
    const { t } = useTranslation();
    const rows = versusAll(results);
    return (
        <section className="mx-4" aria-labelledby="team-versus">
            <h2 id="team-versus" className="eyebrow mb-2">
                {t('team.versus')}
            </h2>
            <ul className="card divide-y divide-line/10 overflow-hidden">
                {rows.map((row) => (
                    <li key={row.team.id}>
                        <Link to={`/equipo/${row.team.id}`} className="flex items-center gap-3 px-3 py-2.5">
                            <TeamLogo team={row.team} size={30} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-bold">{row.team.name}</span>
                                <span className="block text-xs font-semibold text-muted tabular-nums">{t('team.runsShort', { rs: row.rs, ra: row.ra })}</span>
                            </span>
                            <span className={`whitespace-nowrap text-right font-display text-xl font-extrabold tabular-nums ${row.w > row.l ? 'text-ball' : row.w < row.l ? 'text-live' : ''}`}>
                                {row.w}-{row.l}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
};

/** Bateo o pitcheo del equipo: cada número con su puesto en la liga */
const StatBlock: React.FC<{ group: TeamGroup; team: TeamRow; teams: TeamRow[] }> = ({ group, team, teams }) => {
    const { t, i18n } = useTranslation();
    return (
        <section aria-labelledby={`team-${group}`}>
            <h2 id={`team-${group}`} className="eyebrow mb-2">
                {group === 'bat' ? t('statsPage.teamBat') : t('statsPage.teamPitch')}
            </h2>
            <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {TEAM_SORTS[group].map((sort: TeamSort) => {
                    const value = sort.value(team);
                    const rank = leagueRank(teams, team, sort);
                    return (
                        <div key={sort.key} className="rounded-2xl bg-surface p-2.5 text-center shadow-card">
                            <dd className="font-display text-xl font-extrabold leading-none tabular-nums">{value === null ? '—' : sort.show(value)}</dd>
                            <dt className="mt-1 text-[11px] font-semibold leading-tight text-muted">{t(`statsPage.teamSort.${group}.${sort.key}`)}</dt>
                            {rank !== null && (
                                <span className={`mt-1 inline-block rounded-full px-1.5 text-[10px] font-extrabold ${rank === 1 ? 'bg-gold/15 text-gold' : 'bg-raised text-muted'}`}>
                                    {t('statsPage.rankOf', { rank: ordinal(rank, i18n.language), total: teams.length })}
                                </span>
                            )}
                        </div>
                    );
                })}
            </dl>
        </section>
    );
};

type TeamLook = { id: number; logo: string; color: string };

/** Los mejores del equipo en lo que más se mira (los promedios, solo con turnos o entradas suficientes) */
const Leaders: React.FC<{ teamId: number; players: PlayersData; team: TeamLook }> = ({ teamId, players, team }) => {
    const { t } = useTranslation();
    const leaders = useMemo(() => {
        const teamGames = Math.max(0, ...players.players.map((row) => row.hitting?.g ?? 0));
        const mine = players.players.filter((row) => row.teamId === teamId);
        const best = (role: 'B' | 'P', value: (row: PlayerRow) => number | null, asc = false, rate = false) =>
            mine
                .filter((row) => row.role === role && (!rate || qualifies(row, teamGames)))
                .map((row) => ({ row, value: value(row) }))
                .filter((item): item is { row: PlayerRow; value: number } => item.value !== null && (asc || item.value > 0))
                .sort((a, b) => (asc ? a.value - b.value : b.value - a.value))[0] ?? null;
        const num = (text: string | undefined) => (text && Number.isFinite(parseFloat(text)) ? parseFloat(text) : null);
        return [
            { label: t('statsPage.teamSort.bat.avg'), item: best('B', (row) => num(row.hitting?.avg), false, true), show: (row: PlayerRow) => row.hitting?.avg ?? '—' },
            { label: t('statsPage.teamSort.bat.hr'), item: best('B', (row) => row.hitting?.hr ?? null), show: (row: PlayerRow) => String(row.hitting?.hr ?? 0) },
            { label: t('statsPage.rbi'), item: best('B', (row) => row.hitting?.rbi ?? null), show: (row: PlayerRow) => String(row.hitting?.rbi ?? 0) },
            { label: t('statsPage.teamSort.pitch.era'), item: best('P', (row) => num(row.pitching?.era), true, true), show: (row: PlayerRow) => row.pitching?.era ?? '—' },
            { label: t('statsPage.teamSort.pitch.k'), item: best('P', (row) => row.pitching?.k ?? null), show: (row: PlayerRow) => String(row.pitching?.k ?? 0) },
            { label: t('statsPage.teamSort.pitch.sv'), item: best('P', (row) => row.pitching?.sv ?? null), show: (row: PlayerRow) => String(row.pitching?.sv ?? 0) }
        ].filter((leader) => leader.item);
    }, [players, teamId, t]);
    if (!leaders.length) return null;
    return (
        <section className="mx-4" aria-labelledby="team-leaders">
            <h2 id="team-leaders" className="eyebrow mb-2">
                {t('statsPage.teamPlayersLeaders')}
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {leaders.map(({ label, item, show }) => (
                    <li key={label}>
                        <Link to={`/jugador/${item!.row.id}`} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5 shadow-card">
                            <PlayerPhoto personId={item!.row.id} name={item!.row.name} size={44} team={team} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
                                <span className="block truncate text-[15px] font-extrabold">{item!.row.name}</span>
                            </span>
                            <span className="font-display text-2xl font-extrabold tabular-nums">{show(item!.row)}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
};

/** La plantilla de la temporada: bateadores y lanzadores, con su línea y sus puntos de fantasy */
const Roster: React.FC<{ teamId: number; players: PlayersData; team: TeamLook }> = ({ teamId, players, team }) => {
    const { t } = useTranslation();
    const [role, setRole] = useState<'B' | 'P'>('B');
    const [all, setAll] = useState(false);
    const list = players.players.filter((row) => row.teamId === teamId && row.role === role).sort((a, b) => b.pts - a.pts);
    if (!players.players.some((row) => row.teamId === teamId)) return null;
    const shown = all ? list : list.slice(0, 10);
    const line = (row: PlayerRow) =>
        role === 'B'
            ? row.hitting
                ? `${row.hitting.avg} · ${t('team.hrShort', { count: row.hitting.hr })} · ${t('team.rbiShort', { count: row.hitting.rbi })}`
                : row.pos
            : row.pitching
              ? `${row.pitching.era} ${t('statsPage.labels.era')} · ${row.pitching.ip} ${t('statsPage.labels.ip')} · ${row.pitching.k} K`
              : row.pos;
    return (
        <section className="mx-4" aria-labelledby="team-roster">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h2 id="team-roster" className="eyebrow">
                    {t('team.roster')}
                </h2>
                <Segmented<'B' | 'P'>
                    size="sm"
                    label={t('statsPage.role')}
                    value={role}
                    onChange={(value) => {
                        setRole(value);
                        setAll(false);
                    }}
                    options={[
                        { value: 'B', label: t('statsPage.batters') },
                        { value: 'P', label: t('statsPage.pitchers') }
                    ]}
                />
            </div>
            <ul className="card divide-y divide-line/10 overflow-hidden">
                {shown.map((row) => (
                    <li key={row.id}>
                        <Link to={`/jugador/${row.id}`} className="flex items-center gap-3 px-3 py-2.5">
                            <PlayerPhoto personId={row.id} name={row.name} size={40} team={team} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-bold">
                                    {row.number ? <span className="mr-1 text-muted">#{row.number}</span> : null}
                                    {row.name}
                                </span>
                                <span className="block truncate text-xs text-muted tabular-nums">{[row.pos, line(row)].filter(Boolean).join(' · ')}</span>
                            </span>
                            <span className="text-right">
                                <span className="block font-display text-lg font-extrabold leading-none tabular-nums text-accent-ink">{row.pts}</span>
                                <span className="text-[10px] font-bold uppercase text-muted">{t('team.pts')}</span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
            {list.length > shown.length && (
                <button type="button" onClick={() => setAll(true)} className="mt-2 h-10 w-full rounded-full bg-raised text-sm font-bold">
                    {t('statsPage.showMore', { count: list.length - shown.length })}
                </button>
            )}
        </section>
    );
};

const Results: React.FC<{ results: TeamResult[] }> = ({ results }) => {
    const { t, i18n } = useTranslation();
    const [all, setAll] = useState(false);
    const newest = [...results].reverse();
    const shown = all ? newest : newest.slice(0, 8);
    return (
        <section className="mx-4" aria-labelledby="team-results">
            <h2 id="team-results" className="eyebrow mb-2">
                {t('team.results')}
            </h2>
            <ol className="card divide-y divide-line/10 overflow-hidden">
                {shown.map((result) => (
                    <li key={result.game.gamePk}>
                        <Link to={`/juego/${result.game.gamePk}`} className="flex items-center gap-3 px-3 py-2.5">
                            <span className="w-12 shrink-0 whitespace-nowrap text-xs font-bold text-muted">{dayMonth(result.game.date, i18n.language)}</span>
                            <span className="w-6 shrink-0 text-[11px] font-bold text-muted">{result.home ? t('statsPage.vs') : t('statsPage.at')}</span>
                            <TeamLogo team={result.opponent} size={26} />
                            <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                {result.opponent.name}
                                {result.game.gameType && result.game.gameType !== 'R' && result.game.description ? <span className="ml-1.5 text-xs font-semibold text-muted">{result.game.description}</span> : null}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${result.won ? 'bg-ball/15 text-ball' : 'bg-live/10 text-live'}`}>{result.won ? t('team.w') : t('team.l')}</span>
                            <span className="whitespace-nowrap text-right font-display text-base font-extrabold tabular-nums">
                                {result.runs}-{result.allowed}
                            </span>
                        </Link>
                    </li>
                ))}
            </ol>
            {newest.length > shown.length && (
                <button type="button" onClick={() => setAll(true)} className="mt-2 h-10 w-full rounded-full bg-raised text-sm font-bold">
                    {t('statsPage.showMore', { count: newest.length - shown.length })}
                </button>
            )}
        </section>
    );
};

/** Los próximos juegos (después del de hoy) */
const Upcoming: React.FC<{ games: ScheduleGame[]; teamId: number; now: number }> = ({ games, teamId, now }) => {
    const { t, i18n } = useTranslation();
    const list = games.filter((game) => game.state === 'preview' && Date.parse(game.date) > now).slice(1, 7);
    if (!list.length) return null;
    const weekday = (date: string) => new Date(date).toLocaleDateString(localeFor(i18n.language), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Santo_Domingo' });
    return (
        <section className="mx-4" aria-labelledby="team-upcoming">
            <h2 id="team-upcoming" className="eyebrow mb-2">
                {t('team.upcoming')}
            </h2>
            <ul className="card divide-y divide-line/10 overflow-hidden">
                {list.map((game) => {
                    const home = game.home.id === teamId;
                    const rival = home ? game.away : game.home;
                    return (
                        <li key={game.gamePk}>
                            <Link to={`/juego/${game.gamePk}`} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="w-[5.25rem] shrink-0 whitespace-nowrap text-xs font-bold capitalize text-muted">{weekday(game.date)}</span>
                                <span className="w-6 shrink-0 text-[11px] font-bold text-muted">{home ? t('statsPage.vs') : t('statsPage.at')}</span>
                                <TeamLogo team={rival} size={26} />
                                <span className="min-w-0 flex-1 truncate text-sm font-bold">{rival.name}</span>
                                <span className="text-xs font-bold tabular-nums text-muted">{game.startTimeTBD ? t('team.tbd') : formatTime(game.date, i18n.language)}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};
