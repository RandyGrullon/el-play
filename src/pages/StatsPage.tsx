import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Info, Search, X } from 'lucide-react';
import { useLeague } from '../store/LeagueContext';
import { seasonLabel } from '../lib/format';
import { SORTS, normalize, seasonSummary, sortPlayers, usePlayers, type PlayerRow, type SortKey, type StatsTeam } from '../lib/stats';
import { inkOn } from '../components/gamecast/GameHero';
import { PlayerPhoto } from '../components/ui/PlayerPhoto';
import { TeamLogo } from '../components/ui/TeamLogo';
import { Segmented } from '../components/ui/Segmented';
import { ErrorState, OfflineState, Skeleton, waitingForNetwork } from '../components/ui/States';
import { PullToRefresh } from '../components/common/PullToRefresh';
import { StatsTabs } from '../components/layout/StatsTabs';
import { PlayerSheet } from '../components/stats/PlayerSheet';
import { StatsTable } from '../components/pro/StatsTable';
import { ProBadge } from '../components/pro/ProBadge';
import { useIsPro } from '../lib/pro';

const PAGE = 40;

// Estadísticas de todos los peloteros de la liga: buscar, filtrar por equipo, ordenar (también por puntos
// de fantasy) y abrir la ficha de cada uno. `?jugador=<id>` abre la ficha directo (enlaces desde otras pantallas).
export const StatsPage: React.FC = () => {
    const { t } = useTranslation();
    const { activeLeague } = useLeague();
    const [params, setParams] = useSearchParams();
    const [season, setSeason] = useState<number | undefined>(undefined);
    const [role, setRole] = useState<'B' | 'P'>('B');
    const [teamId, setTeamId] = useState<number | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('pts');
    const [search, setSearch] = useState('');
    const [limit, setLimit] = useState(PAGE);
    const query = usePlayers(activeLeague, season);
    const pro = useIsPro();
    const data = query.data;

    useEffect(() => {
        setSeason(undefined);
        setTeamId(null);
    }, [activeLeague]);
    useEffect(() => setLimit(PAGE), [role, teamId, sortKey, search, season]);

    const sort = SORTS[role].find((option) => option.key === sortKey) ?? SORTS[role][0];
    const teams = useMemo(() => Object.values(data?.teams ?? {}).sort((a, b) => a.abbrev.localeCompare(b.abbrev)), [data?.teams]);
    const teamGames = useMemo(() => Math.max(0, ...(data?.players ?? []).map((row) => row.hitting?.g ?? 0)), [data?.players]);
    const filtered = useMemo(() => {
        const needle = normalize(search.trim());
        return (data?.players ?? []).filter((row) => row.role === role && (teamId === null || row.teamId === teamId) && (!needle || normalize(row.name).includes(needle)));
    }, [data?.players, role, teamId, search]);
    const rows = useMemo(() => sortPlayers(filtered, sort, teamGames), [filtered, sort, teamGames]);

    const viewingId = Number(params.get('jugador')) || null;
    const viewing = viewingId ? data?.players.find((row) => row.id === viewingId) : undefined;
    const open = (row: PlayerRow) => setParams((current) => ({ ...Object.fromEntries(current), jugador: String(row.id) }), { replace: false });
    const close = () =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.delete('jugador');
                return next;
            },
            { replace: true }
        );

    const top = !search && rows.length >= 3 && rows[0].ranked ? rows.slice(0, 3).map((item) => item.row) : [];
    const rest = top.length ? rows.slice(3) : rows;

    return (
        <PullToRefresh onRefresh={async () => { await query.refetch(); }}>
            <div className="space-y-4 pt-5">
                <div className="px-4">
                    <StatsTabs active="stats" />
                </div>
                <header className="px-4">
                    <p className="text-sm font-semibold text-muted">
                        {t(`leagues.${activeLeague}.name`)}
                        {data ? ` · ${t('common.season', { season: seasonLabel(data.season, activeLeague) })}` : ''}
                    </p>
                    <h1 className="display text-[32px] leading-tight">
                        {t('statsPage.title')} <ProBadge auto />
                    </h1>
                    <p className="mt-1 max-w-[52ch] text-sm text-muted">{t('statsPage.lead')}</p>
                </header>

                {data?.isPreviousSeason && (
                    <p className="mx-4 flex items-start gap-2 rounded-2xl bg-accent/10 px-3 py-2.5 text-sm text-accent-ink">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        {t('statsPage.previousSeason')}
                    </p>
                )}

                {/* Buscar y filtrar */}
                <div className="space-y-3 px-4">
                    <label className="flex h-12 items-center gap-2 rounded-2xl bg-surface px-4 shadow-card">
                        <Search className="h-4 w-4 shrink-0 text-muted" />
                        <span className="sr-only">{t('statsPage.search')}</span>
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('statsPage.search')} enterKeyHint="search" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} className="flex h-7 w-7 items-center justify-center rounded-full bg-raised text-muted" aria-label={t('statsPage.clear')}>
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Segmented<'B' | 'P'>
                            label={t('statsPage.role')}
                            value={role}
                            onChange={(value) => {
                                setRole(value);
                                setSortKey('pts');
                            }}
                            options={[
                                { value: 'B', label: t('statsPage.batters') },
                                { value: 'P', label: t('statsPage.pitchers') }
                            ]}
                        />
                        {data && (
                            <Segmented<string>
                                size="sm"
                                label={t('statsPage.seasonPicker')}
                                value={String(data.season)}
                                onChange={(value) => setSeason(Number(value) === data.currentSeason ? undefined : Number(value))}
                                options={data.seasons.slice(0, 2).map((year) => ({ value: String(year), label: seasonLabel(year, activeLeague) }))}
                            />
                        )}
                    </div>
                </div>

                {teams.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto px-4 scrollbar-none" role="group" aria-label={t('statsPage.filterTeam')}>
                        <button type="button" onClick={() => setTeamId(null)} aria-pressed={teamId === null} className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold ${teamId === null ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card'}`}>
                            {t('statsPage.allTeams')}
                        </button>
                        {teams.map((team) => (
                            <button key={team.id} type="button" onClick={() => setTeamId(teamId === team.id ? null : team.id)} aria-pressed={teamId === team.id} className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full pl-1.5 pr-3.5 text-sm font-bold ${teamId === team.id ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card'}`}>
                                <TeamLogo team={{ ...team, name: team.abbrev }} size={26} />
                                {team.abbrev}
                            </button>
                        ))}
                    </div>
                )}

                {!pro && (
                <div className="flex gap-2 overflow-x-auto px-4 scrollbar-none" role="tablist" aria-label={t('statsPage.sortBy')}>
                    {SORTS[role].map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            role="tab"
                            aria-selected={option.key === sort.key}
                            onClick={() => setSortKey(option.key)}
                            className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold ${option.key === sort.key ? 'bg-accent text-white' : 'bg-raised text-muted'}`}
                        >
                            {t(`statsPage.sort.${option.key}`)}
                        </button>
                    ))}
                </div>
                )}

                {waitingForNetwork(query) ? (
<div className="px-4"><OfflineState /></div>) : query.isPending ? (
                    <div className="space-y-3 px-4">
                        <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-[24px]" />)}</div>
                        <Skeleton className="h-80 rounded-card" />
                    </div>
                ) : query.isError && !data ? (
                    <div className="px-4">
                        <ErrorState error={query.error as Error} onRetry={() => query.refetch()} />
                    </div>
                ) : data && pro ? (
                    filtered.length ? (
                        <StatsTable rows={filtered} role={role} teams={data.teams} teamGames={teamGames} limit={limit} onOpen={open} onMore={() => setLimit((value) => value + PAGE)} />
                    ) : (
                        <p className="mx-4 rounded-card bg-surface px-4 py-8 text-center text-sm text-muted shadow-card">{search ? t('statsPage.noResults', { q: search.trim() }) : t('statsPage.empty')}</p>
                    )
                ) : data ? (
                    <>
                        {top.length > 0 && <Podium rows={top} teams={data.teams} show={sort.show} unit={t(`statsPage.unit.${sort.key}`)} onOpen={open} />}

                        {rows.length === 0 ? (
                            <p className="mx-4 rounded-card bg-surface px-4 py-8 text-center text-sm text-muted shadow-card">{search ? t('statsPage.noResults', { q: search.trim() }) : t('statsPage.empty')}</p>
                        ) : (
                            <ol className="card mx-4 divide-y divide-line/10 overflow-hidden" aria-label={t('statsPage.list')}>
                                {rest.slice(0, limit).map(({ row, ranked }, index) => (
                                    <PlayerItem key={row.id} row={row} rank={ranked ? index + 1 + top.length : null} team={row.teamId ? data.teams[row.teamId] : undefined} value={ranked ? sort.show(row) : '—'} unit={t(`statsPage.unit.${sort.key}`)} onOpen={() => open(row)} />
                                ))}
                            </ol>
                        )}
                        {rest.length > limit && (
                            <div className="px-4">
                                <button type="button" onClick={() => setLimit((value) => value + PAGE)} className="h-11 w-full rounded-full bg-surface text-sm font-bold shadow-card">
                                    {t('statsPage.showMore', { count: rest.length - limit })}
                                </button>
                            </div>
                        )}
                        <p className="px-4 text-xs text-muted">
                            {t('statsPage.count', { count: rows.length })} · {t('statsPage.qualifiedNote')}
                        </p>
                    </>
                ) : null}
            </div>

            {viewingId && (
                <PlayerSheet
                    key={viewingId}
                    id={viewingId}
                    name={viewing?.name ?? ''}
                    team={viewing?.teamId && data?.teams[viewing.teamId] ? { id: viewing.teamId, logo: data.teams[viewing.teamId].logo, color: data.teams[viewing.teamId].color } : null}
                    season={data && data.season !== data.currentSeason ? data.season : undefined}
                    onClose={close}
                />
            )}
        </PullToRefresh>
    );
};

// ---------------------------------------------------------------- piezas

/** Los tres primeros del orden elegido, en el color de su equipo */
const Podium: React.FC<{ rows: PlayerRow[]; teams: Record<string, StatsTeam>; show: (row: PlayerRow) => string; unit: string; onOpen: (row: PlayerRow) => void }> = ({ rows, teams, show, unit, onOpen }) => {
    const { t } = useTranslation();
    return (
        <ol className="grid grid-cols-3 gap-2 px-4" aria-label={t('statsPage.top')}>
            {rows.map((row, index) => {
                const team = row.teamId ? teams[row.teamId] : undefined;
                const color = team?.color || '#2563eb';
                const ink = inkOn(color);
                const last = row.name.split(' ').slice(-1)[0];
                return (
                    <li key={row.id}>
                        <button
                            type="button"
                            onClick={() => onOpen(row)}
                            className={`flex h-full w-full flex-col items-center rounded-[24px] px-2 pb-3 pt-3 text-center ${index === 0 ? 'shadow-float' : 'shadow-card'}`}
                            style={{ backgroundColor: color, color: ink }}
                            aria-label={t('statsPage.viewPlayer', { name: row.name })}
                        >
                            <span className="self-start pl-1 text-[12px] font-extrabold opacity-85">{index + 1}</span>
                            <PlayerPhoto personId={row.id} name={row.name} size={index === 0 ? 72 : 60} background="rgba(255,255,255,0.25)" team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                            <span className="mt-2 w-full truncate text-sm font-extrabold">{last}</span>
                            <span className="font-display text-[26px] font-extrabold leading-none tabular-nums">{show(row)}</span>
                            <span className="mt-0.5 text-[11px] font-bold uppercase tracking-wide opacity-80">{unit}</span>
                        </button>
                    </li>
                );
            })}
        </ol>
    );
};

const PlayerItem: React.FC<{ row: PlayerRow; rank: number | null; team?: StatsTeam; value: string; unit: string; onOpen: () => void }> = ({ row, rank, team, value, unit, onOpen }) => {
    const { t } = useTranslation();
    const summary = seasonSummary(row, t);
    return (
        <li>
            <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-label={t('statsPage.viewPlayer', { name: row.name })}>
                <span className="w-6 shrink-0 text-center font-display text-base font-extrabold text-muted">{rank ?? '·'}</span>
                <PlayerPhoto personId={row.id} name={row.name} size={44} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-extrabold">{row.name}</span>
                    <span className="block truncate text-xs text-muted">
                        {[team?.abbrev, row.pos, row.number ? `#${row.number}` : null].filter(Boolean).join(' · ')}
                        {' · '}
                        {summary ?? t('statsPage.noGamesShort')}
                    </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                    <span className="font-display text-xl font-extrabold leading-none tabular-nums">{value}</span>
                    <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">{unit}</span>
                </span>
            </button>
        </li>
    );
};
