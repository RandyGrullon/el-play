// Estadísticas colectivas: bateo y pitcheo de cada equipo. Tarjetas con los mejores de la liga, ranking con barras en
// el color de cada equipo (con el promedio de la liga), diferencia de carreras y la ficha de cada equipo con sus
// puestos en la liga y sus líderes.
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { inkOn } from '../gamecast/GameHero';
import { BottomSheet } from '../ui/BottomSheet';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { Segmented } from '../ui/Segmented';
import { TeamLogo } from '../ui/TeamLogo';
import { pythagorean } from '../../lib/advanced';
import { qualifies, type PlayerRow, type PlayersData } from '../../lib/stats';
import { TEAM_HIGHLIGHTS, TEAM_SORTS, leagueAverage, leagueRank, rankTeams, recordOf, teamSort, type TeamGroup, type TeamRow, type TeamSort } from '../../lib/teamStats';

interface Props {
    teams: TeamRow[];
    /** Los peloteros de la misma temporada: los líderes de cada equipo */
    players?: PlayersData;
    onOpenPlayer: (row: PlayerRow) => void;
    /** «Ver sus peloteros»: la lista de bateadores filtrada por ese equipo */
    onShowPlayers: (teamId: number) => void;
}

const sortLabel = (t: (key: string) => string, group: TeamGroup, key: string) => t(`statsPage.teamSort.${group}.${key}`);

export const TeamStatsView: React.FC<Props> = ({ teams, players, onOpenPlayer, onShowPlayers }) => {
    const { t } = useTranslation();
    const [group, setGroup] = useState<TeamGroup>('bat');
    const [key, setKey] = useState('avg');
    const [openId, setOpenId] = useState<number | null>(null);
    const sort = teamSort(group, key);
    const ranked = useMemo(() => rankTeams(teams, sort), [teams, sort]);
    const average = leagueAverage(teams, sort);
    const values = ranked.map((item) => item.value).filter((value): value is number => value !== null);
    const [min, max] = [Math.min(...values), Math.max(...values)];
    // La barra: el mejor llena, el peor deja un 18 % para que se vea (en los que menos es mejor, al revés)
    const share = (value: number) => (max === min ? 1 : 0.18 + 0.82 * (sort.asc ? (max - value) / (max - min) : (value - min) / (max - min)));
    const opened = teams.find((team) => team.id === openId) ?? null;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 px-4">
                <Segmented<TeamGroup>
                    label={t('statsPage.teamGroup')}
                    value={group}
                    onChange={(value) => {
                        setGroup(value);
                        setKey(TEAM_SORTS[value][0].key);
                    }}
                    options={[
                        { value: 'bat', label: t('statsPage.teamBat') },
                        { value: 'pitch', label: t('statsPage.teamPitch') }
                    ]}
                />
            </div>

            {/* Los mejores de la liga en lo que más se mira */}
            <ul className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-4" aria-label={t('statsPage.teamLeaders')}>
                {TEAM_HIGHLIGHTS[group].map((highlightKey) => {
                    const highlight = teamSort(group, highlightKey);
                    const best = rankTeams(teams, highlight)[0];
                    if (!best || best.value === null) return null;
                    const ink = inkOn(best.team.color);
                    return (
                        <li key={highlightKey}>
                            <button
                                type="button"
                                onClick={() => setOpenId(best.team.id)}
                                className="flex h-full w-full items-center gap-2.5 rounded-[22px] p-3 text-left shadow-card"
                                style={{ backgroundColor: best.team.color, color: ink }}
                                aria-label={t('statsPage.teamBest', { stat: sortLabel(t, group, highlightKey), team: best.team.name, value: highlight.show(best.value) })}
                            >
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/90">
                                    <TeamLogo team={best.team} size={30} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-[11px] font-bold uppercase tracking-wide opacity-85">{sortLabel(t, group, highlightKey)}</span>
                                    <span className="block font-display text-2xl font-extrabold leading-none tabular-nums">{highlight.show(best.value)}</span>
                                    <span className="block truncate text-xs font-bold opacity-85">{best.team.abbrev}</span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            <div className="-mt-1 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none" role="tablist" aria-label={t('statsPage.sortBy')}>
                {TEAM_SORTS[group].map((option) => (
                    <button
                        key={option.key}
                        type="button"
                        role="tab"
                        aria-selected={option.key === sort.key}
                        onClick={() => setKey(option.key)}
                        className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold ${option.key === sort.key ? 'bg-accent text-white' : 'bg-raised text-muted'}`}
                    >
                        {sortLabel(t, group, option.key)}
                    </button>
                ))}
            </div>

            <section className="card mx-4 overflow-hidden" aria-label={t('statsPage.teamRanking', { stat: sortLabel(t, group, sort.key) })}>
                <ol className="divide-y divide-line/10">
                    {ranked.map(({ team, value }, index) => {
                        const record = recordOf(team);
                        return (
                            <li key={team.id}>
                                <button type="button" onClick={() => setOpenId(team.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left" aria-label={t('statsPage.teamOpen', { team: team.name })}>
                                    <span className="w-5 shrink-0 text-center font-display text-base font-extrabold text-muted">{value === null ? '·' : index + 1}</span>
                                    <TeamLogo team={team} size={36} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-2">
                                            <span className="truncate text-[15px] font-extrabold">{team.name}</span>
                                            <span className="shrink-0 font-display text-xl font-extrabold leading-none tabular-nums">{value === null ? '—' : sort.show(value)}</span>
                                        </span>
                                        <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                                            <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${value === null ? 0 : share(value) * 100}%`, backgroundColor: team.color }} />
                                        </span>
                                        <span className="mt-1 block text-xs text-muted">
                                            {t('statsPage.teamRecord', { w: record.w, l: record.l })}
                                            {record.diff !== null ? ` · ${t('statsPage.teamDiff', { diff: record.diff > 0 ? `+${record.diff}` : record.diff })}` : ''}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
                {average !== null && (
                    <p className="border-t border-line/10 px-4 py-2.5 text-xs font-semibold text-muted">
                        {t('statsPage.leagueAverage', { stat: sortLabel(t, group, sort.key), value: sort.show(average) })}
                        {sort.asc ? ` · ${t('statsPage.lowerIsBetter')}` : ''}
                    </p>
                )}
            </section>

            <RunDifferential teams={teams} onOpen={setOpenId} />

            {opened && (
                <TeamSheet
                    team={opened}
                    teams={teams}
                    players={players}
                    onClose={() => setOpenId(null)}
                    onOpenPlayer={(row) => {
                        setOpenId(null);
                        onOpenPlayer(row);
                    }}
                    onShowPlayers={() => {
                        setOpenId(null);
                        onShowPlayers(opened.id);
                    }}
                />
            )}
        </div>
    );
};

/** Carreras anotadas contra permitidas de cada equipo y el récord que «debería» tener (expectativa pitagórica) */
const RunDifferential: React.FC<{ teams: TeamRow[]; onOpen: (id: number) => void }> = ({ teams, onOpen }) => {
    const { t } = useTranslation();
    const rows = teams
        .map((team) => ({ team, record: recordOf(team) }))
        .filter((row) => row.record.diff !== null)
        .sort((a, b) => (b.record.diff ?? 0) - (a.record.diff ?? 0));
    if (!rows.length) return null;
    const widest = Math.max(1, ...rows.map((row) => Math.abs(row.record.diff ?? 0)));
    return (
        <section className="card mx-4 p-4" aria-labelledby="run-diff">
            <h2 id="run-diff" className="eyebrow">
                {t('statsPage.runDiff')}
            </h2>
            <p className="mt-0.5 text-xs text-muted">{t('statsPage.runDiffHint')}</p>
            <ul className="mt-3 space-y-2.5">
                {rows.map(({ team, record }) => {
                    const diff = record.diff ?? 0;
                    const expected = pythagorean(record.scored, record.allowed, record.games);
                    return (
                        <li key={team.id}>
                            <button type="button" onClick={() => onOpen(team.id)} className="w-full text-left" aria-label={t('statsPage.teamOpen', { team: team.name })}>
                                <span className="flex items-center gap-2 text-sm">
                                    <TeamLogo team={team} size={22} />
                                    <span className="font-bold">{team.abbrev}</span>
                                    <span className="min-w-0 flex-1 truncate text-xs text-muted tabular-nums">
                                        {t('statsPage.runsFor', { scored: record.scored, allowed: record.allowed })}
                                        {expected ? ` · ${t('statsPage.expected', { w: expected.wins, l: expected.losses })}` : ''}
                                    </span>
                                    <span className={`shrink-0 text-right font-display text-base font-extrabold tabular-nums ${diff > 0 ? 'text-ball' : diff < 0 ? 'text-live' : 'text-muted'}`}>{diff > 0 ? `+${diff}` : diff}</span>
                                </span>
                                {/* Barra que sale del centro: a la derecha si anota más de lo que permite */}
                                <span className="relative mt-1 block h-1.5 rounded-full bg-raised" aria-hidden="true">
                                    <span className="absolute inset-y-0 left-1/2 w-px bg-line/30" />
                                    <span
                                        className={`absolute inset-y-0 rounded-full ${diff >= 0 ? 'bg-ball' : 'bg-live'}`}
                                        style={diff >= 0 ? { left: '50%', width: `${(diff / widest) * 50}%` } : { right: '50%', width: `${(-diff / widest) * 50}%` }}
                                    />
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

const ordinal = (n: number, language: string) => (language.startsWith('en') ? `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}` : `${n}.º`);

/** Ficha del equipo: récord, cada estadística con su puesto en la liga y sus líderes */
const TeamSheet: React.FC<{ team: TeamRow; teams: TeamRow[]; players?: PlayersData; onClose: () => void; onOpenPlayer: (row: PlayerRow) => void; onShowPlayers: () => void }> = ({
    team,
    teams,
    players,
    onClose,
    onOpenPlayer,
    onShowPlayers
}) => {
    const { t, i18n } = useTranslation();
    const record = recordOf(team);
    const expected = pythagorean(record.scored, record.allowed, record.games);
    const ink = inkOn(team.color);
    const block = (group: TeamGroup) => (
        <section aria-labelledby={`team-${group}`}>
            <h3 id={`team-${group}`} className="eyebrow mb-2">
                {group === 'bat' ? t('statsPage.teamBat') : t('statsPage.teamPitch')}
            </h3>
            <dl className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {TEAM_SORTS[group].map((sort: TeamSort) => {
                    const value = sort.value(team);
                    const rank = leagueRank(teams, team, sort);
                    return (
                        <div key={sort.key} className="rounded-2xl bg-surface p-2.5 text-center shadow-card">
                            <dd className="font-display text-xl font-extrabold leading-none tabular-nums">{value === null ? '—' : sort.show(value)}</dd>
                            <dt className="mt-1 text-[11px] font-semibold leading-tight text-muted">{sortLabel(t, group, sort.key)}</dt>
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

    // Líderes del equipo con los peloteros de la misma temporada (los promedios, solo con turnos o entradas suficientes)
    const leaders = useMemo(() => {
        if (!players) return [];
        const teamGames = Math.max(0, ...players.players.map((row) => row.hitting?.g ?? 0));
        const mine = players.players.filter((row) => row.teamId === team.id);
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
    }, [players, team.id, t]);

    return (
        <BottomSheet open onClose={onClose} title={team.name} tall>
            <div className="space-y-5 pb-2">
                <div className="flex items-center gap-3 rounded-[22px] p-4" style={{ backgroundColor: team.color, color: ink }}>
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/90">
                        <TeamLogo team={team} size={42} />
                    </span>
                    <div className="min-w-0">
                        <p className="font-display text-3xl font-extrabold leading-none tabular-nums">{t('statsPage.teamRecord', { w: record.w, l: record.l })}</p>
                        <p className="mt-1 text-xs font-bold opacity-85">
                            {record.diff !== null ? t('statsPage.teamDiff', { diff: record.diff > 0 ? `+${record.diff}` : record.diff }) : ''}
                            {expected ? ` · ${t('statsPage.expected', { w: expected.wins, l: expected.losses })}` : ''}
                        </p>
                    </div>
                </div>

                {block('bat')}
                {block('pitch')}

                {leaders.length > 0 && (
                    <section aria-labelledby="team-leaders">
                        <h3 id="team-leaders" className="eyebrow mb-2">
                            {t('statsPage.teamPlayersLeaders')}
                        </h3>
                        <ul className="card divide-y divide-line/10 overflow-hidden">
                            {leaders.map(({ label, item, show }) => (
                                <li key={label}>
                                    <button type="button" onClick={() => onOpenPlayer(item!.row)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-label={t('statsPage.viewPlayer', { name: item!.row.name })}>
                                        <PlayerPhoto personId={item!.row.id} name={item!.row.name} size={40} team={{ id: team.id, logo: team.logo, color: team.color }} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
                                            <span className="block truncate text-[15px] font-extrabold">{item!.row.name}</span>
                                        </span>
                                        <span className="font-display text-xl font-extrabold tabular-nums">{show(item!.row)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <button type="button" onClick={onShowPlayers} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-sm font-extrabold text-bg">
                    <Users className="h-4 w-4" />
                    {t('statsPage.teamShowPlayers', { team: team.abbrev })}
                </button>
            </div>
        </BottomSheet>
    );
};
