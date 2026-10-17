import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Info, Lock, Plus, Search, Share2, Sparkles, Users, X } from 'lucide-react';
import { useLeague } from '../store/LeagueContext';
import { PlayerPhoto } from '../components/ui/PlayerPhoto';
import { TeamLogo } from '../components/ui/TeamLogo';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Segmented } from '../components/ui/Segmented';
import { ErrorState, Skeleton } from '../components/ui/States';
import { AccountCard } from '../components/account/AccountCard';
import { formatLongDate, formatTime } from '../lib/format';
import { inningName } from '../lib/baseball';
import {
    RULES,
    addPlayer,
    canAdd,
    history,
    isLocked,
    pickPoints,
    pickResult,
    playerScore,
    removePlayer,
    setCaptain,
    setPick,
    settleDay,
    teamPoints,
    useEntry,
    useFantasyDay,
    useFantasyStore,
    type DayEntry,
    type FantasyDay,
    type FantasyGame,
    type FantasyPlayer
} from '../lib/fantasy';
import { accountEnabled, createLeague, dayEntries, joinLeague, myLeagues, pushEntry, syncFantasy, useSession, type PrivateLeague, type Rival } from '../lib/account';

type Tab = 'team' | 'picks' | 'table';
const DAY_MS = 86400000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// ---------------------------------------------------------------- textos cortos del pelotero

const lineText = (player: FantasyPlayer, t: (key: string, options?: Record<string, unknown>) => string) => {
    const line = player.line;
    if (!line || !player.played) return null;
    if (player.role === 'P') return t('fantasy.pitchLine', { ip: line.ip, k: line.k, er: line.er });
    const extras = [Number(line.hr) ? `${line.hr} HR` : '', Number(line.d) ? `${line.d} 2B` : '', Number(line.t) ? `${line.t} 3B` : '', Number(line.rbi) ? `${line.rbi} CI` : '', Number(line.sb) ? `${line.sb} BR` : '']
        .filter(Boolean)
        .join(', ');
    return `${line.h}-${line.ab}${extras ? `, ${extras}` : ''}`;
};

const gameStatus = (day: FantasyDay, gamePk: number, lang: string, t: (key: string) => string) => {
    const game = day.games.find((g) => g.gamePk === gamePk);
    if (!game) return '';
    if (game.state === 'final') return t('fantasy.final');
    if (game.state === 'live' && game.live) return inningName({ n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState }, lang, true);
    return formatTime(game.date, lang);
};

// ---------------------------------------------------------------- página

export const FantasyPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { activeLeague } = useLeague();
    const [date, setDate] = useState<string | undefined>(undefined);
    const [today, setToday] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('team');
    const [picking, setPicking] = useState<'B' | 'P' | null>(null);
    const query = useFantasyDay(activeLeague, date);
    const day = query.data;
    const entry = useEntry(activeLeague, day?.date);
    const store = useFantasyStore();
    const session = useSession();

    useEffect(() => {
        if (!date && day?.date) setToday(day.date);
    }, [date, day?.date]);
    useEffect(() => {
        setDate(undefined);
        setToday(null);
    }, [activeLeague]);

    // Al terminar el día se guarda el resultado; con cuenta, cada cambio se sube
    useEffect(() => {
        if (day) settleDay(day, entry);
    }, [day, entry]);
    useEffect(() => {
        if (session && day && entry.savedAt) pushEntry(day.league, day.date, entry);
    }, [session, day?.league, day?.date, entry.savedAt]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (session) syncFantasy().catch(() => undefined);
    }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const past = useMemo(() => history(store, activeLeague), [store, activeLeague]);
    const season = past.reduce((sum, d) => sum + d.points, 0);
    const points = day ? teamPoints(day, entry) : 0;
    const picks = day ? pickPoints(day, entry) : 0;
    const days = today ? [shift(today, -1), today, shift(today, 1)] : [];
    const dayLabel = (key: string) => (key === today ? t('games.today') : key < (today ?? '') ? t('games.yesterday') : t('games.tomorrow'));

    return (
        <div className="space-y-4 px-4 pt-5">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-muted first-letter:uppercase">{day ? formatLongDate(day.date, i18n.language) : t(`leagues.${activeLeague}.name`)}</p>
                    <h1 className="display text-[32px] leading-tight">{t('fantasy.title')}</h1>
                </div>
                {day && day.players.some((p) => entry.lineup.includes(p.id)) && <ShareTeam day={day} entry={entry} points={points + picks} />}
            </header>

            {days.length > 0 && (
                <div className="flex gap-2" role="tablist" aria-label={t('games.selectDate')}>
                    {days.map((key) => {
                        const active = (date ?? today) === key;
                        return (
                            <button key={key} type="button" role="tab" aria-selected={active} onClick={() => setDate(key === today ? undefined : key)} className={`rounded-full px-4 py-2 text-sm font-bold ${active ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card'}`}>
                                {dayLabel(key)}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Resumen: puntos del día, pronósticos y temporada */}
            <section className="relative overflow-hidden rounded-card p-5 text-white shadow-float" style={{ background: 'linear-gradient(135deg, #1e4fd8 0%, #6d28d9 55%, #e11d48 100%)' }}>
                <Sparkles className="absolute -right-3 -top-3 h-24 w-24 opacity-15" aria-hidden="true" />
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-85">{t('fantasy.yourPoints')}</p>
                <p className="mt-1 font-display text-[64px] font-extrabold leading-none tabular-nums">{Math.round((points + picks) * 10) / 10}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
                    <span>{t('fantasy.teamPts', { pts: points })}</span>
                    <span>{t('fantasy.picksPts', { pts: picks })}</span>
                    <span>{t('fantasy.seasonPts', { pts: Math.round(season * 10) / 10, days: past.length })}</span>
                </div>
                {past.length > 0 && <HistoryBars days={past.slice(0, 7).reverse()} />}
            </section>

            <Segmented<Tab>
                label={t('fantasy.sections')}
                value={tab}
                onChange={setTab}
                options={[
                    { value: 'team', label: t('fantasy.myTeam') },
                    { value: 'picks', label: t('fantasy.picks') },
                    { value: 'table', label: t('fantasy.table') }
                ]}
            />

            {query.isPending ? (
                <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[88px] rounded-card" />)}</div>
            ) : query.isError && !day ? (
                <ErrorState error={query.error as Error} onRetry={() => query.refetch()} />
            ) : day && !day.games.length ? (
                <div className="card p-6 text-center">
                    <p className="font-extrabold">{t('fantasy.noGames')}</p>
                    <p className="mt-1 text-sm text-muted">{t('fantasy.noGamesHint')}</p>
                </div>
            ) : day ? (
                tab === 'team' ? (
                    <TeamTab day={day} entry={entry} onPick={setPicking} />
                ) : tab === 'picks' ? (
                    <PicksTab day={day} entry={entry} />
                ) : (
                    <TableTab day={day} />
                )
            ) : null}

            {day && picking && <PlayerPicker day={day} entry={entry} role={picking} onClose={() => setPicking(null)} />}
        </div>
    );
};

// ---------------------------------------------------------------- mi equipo

const TeamTab: React.FC<{ day: FantasyDay; entry: DayEntry; onPick: (role: 'B' | 'P') => void }> = ({ day, entry, onPick }) => {
    const { t } = useTranslation();
    const [rules, setRules] = useState(false);
    const chosen = entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    const batters = chosen.filter((p) => p.role === 'B');
    const pitchers = chosen.filter((p) => p.role === 'P');
    const slots: (FantasyPlayer | 'B' | 'P')[] = [
        ...batters,
        ...Array.from({ length: Math.max(0, RULES.batters - batters.length) }, () => 'B' as const),
        ...pitchers,
        ...Array.from({ length: Math.max(0, RULES.pitchers - pitchers.length) }, () => 'P' as const)
    ];

    return (
        <section className="space-y-3" aria-label={t('fantasy.myTeam')}>
            <p className="text-sm text-muted">{t('fantasy.rulesShort', { batters: RULES.batters, perTeam: RULES.perTeam })}</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
                {slots.map((slot, index) =>
                    typeof slot === 'string' ? (
                        <button key={`empty-${index}`} type="button" onClick={() => onPick(slot)} className="flex h-[84px] items-center gap-3 rounded-[22px] border-2 border-dashed border-line/20 px-4 text-left font-bold text-muted">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-raised">
                                <Plus className="h-5 w-5" />
                            </span>
                            {slot === 'P' ? t('fantasy.addPitcher') : t('fantasy.addBatter')}
                        </button>
                    ) : (
                        <PlayerSlot key={slot.id} day={day} entry={entry} player={slot} />
                    )
                )}
            </div>

            <button type="button" onClick={() => setRules((v) => !v)} className="flex items-center gap-2 text-sm font-semibold text-accent-ink" aria-expanded={rules}>
                <Info className="h-4 w-4" />
                {t('fantasy.howPoints')}
            </button>
            {rules && <ScoringTable day={day} />}
        </section>
    );
};

const PlayerSlot: React.FC<{ day: FantasyDay; entry: DayEntry; player: FantasyPlayer }> = ({ day, entry, player }) => {
    const { t, i18n } = useTranslation();
    const team = day.teams[player.teamId];
    const locked = isLocked(day, player);
    const captain = entry.captain === player.id;
    const line = lineText(player, t);
    return (
        <div className="relative flex h-[84px] items-center gap-3 rounded-[22px] bg-surface px-3 shadow-card">
            <PlayerPhoto personId={player.id} name={player.name} size={56} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-extrabold">
                    {captain && <Crown className="h-4 w-4 shrink-0 text-gold" aria-label={t('fantasy.captain')} />}
                    <span className="truncate">{player.name}</span>
                </p>
                <p className="truncate text-xs font-semibold text-muted">
                    {team?.abbrev} · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')} · {gameStatus(day, player.gamePk, i18n.language, t)}
                </p>
                {line && <p className="truncate text-xs text-muted">{line}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
                <span className="font-display text-2xl font-extrabold leading-none tabular-nums">{playerScore(entry, player)}</span>
                {locked ? (
                    <Lock className="h-3.5 w-3.5 text-faint" aria-label={t('fantasy.locked')} />
                ) : (
                    <span className="flex gap-1">
                        <button type="button" onClick={() => setCaptain(day, entry, player)} className={`flex h-7 w-7 items-center justify-center rounded-full ${captain ? 'bg-gold text-white' : 'bg-raised text-muted'}`} aria-label={t('fantasy.makeCaptain')} aria-pressed={captain}>
                            <Crown className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => removePlayer(day, player)} className="flex h-7 w-7 items-center justify-center rounded-full bg-raised text-muted" aria-label={t('fantasy.remove', { name: player.name })}>
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </span>
                )}
            </div>
        </div>
    );
};

const ScoringTable: React.FC<{ day: FantasyDay }> = ({ day }) => {
    const { t } = useTranslation();
    const row = (group: 'batter' | 'pitcher') =>
        Object.entries(day.scoring[group]).map(([key, value]) => (
            <li key={`${group}-${key}`} className="flex justify-between gap-3 py-1.5">
                <span>{t(`fantasy.scoring.${group}.${key}`)}</span>
                <span className={`font-bold tabular-nums ${value < 0 ? 'text-live' : ''}`}>{value > 0 ? `+${value}` : value}</span>
            </li>
        ));
    return (
        <div className="card grid gap-4 p-4 text-sm sm:grid-cols-2">
            <div>
                <p className="eyebrow mb-1">{t('fantasy.batters')}</p>
                <ul className="divide-y divide-line/10">{row('batter')}</ul>
            </div>
            <div>
                <p className="eyebrow mb-1">{t('fantasy.pitchers')}</p>
                <ul className="divide-y divide-line/10">{row('pitcher')}</ul>
                <p className="mt-3 text-xs text-muted">{t('fantasy.captainRule', { x: RULES.captain })}</p>
                <p className="mt-1 text-xs text-muted">{t('fantasy.pickRule', { pts: RULES.pick })}</p>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------- elegir peloteros

const PlayerPicker: React.FC<{ day: FantasyDay; entry: DayEntry; role: 'B' | 'P'; onClose: () => void }> = ({ day, entry, role: initialRole, onClose }) => {
    const { t, i18n } = useTranslation();
    const [role, setRole] = useState<'B' | 'P'>(initialRole);
    const [teamId, setTeamId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const started = day.games.some((game) => game.state !== 'preview');
    const normalized = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    const list = useMemo(
        () =>
            day.players
                .filter((p) => p.role === role && (teamId === null || p.teamId === teamId) && (!search || normalized(p.name).includes(normalized(search))))
                .sort((a, b) => (started ? b.points - a.points : 0) || Number(b.starter) - Number(a.starter) || a.name.localeCompare(b.name)),
        [day.players, role, teamId, search, started]
    );

    const problemText = (problem: string | null) =>
        problem === 'locked' ? t('fantasy.problem.locked') : problem === 'full' ? (role === 'P' ? t('fantasy.problem.fullP') : t('fantasy.problem.fullB')) : problem === 'team' ? t('fantasy.problem.team', { n: RULES.perTeam }) : problem === 'already' ? t('fantasy.problem.already') : '';

    return (
        <BottomSheet open onClose={onClose} title={role === 'P' ? t('fantasy.choosePitcher') : t('fantasy.chooseBatters')} tall>
            <div className="space-y-3 pb-2">
                <Segmented<'B' | 'P'>
                    size="sm"
                    label={t('fantasy.role')}
                    value={role}
                    onChange={setRole}
                    options={[
                        { value: 'B', label: t('fantasy.batters') },
                        { value: 'P', label: t('fantasy.pitchers') }
                    ]}
                />
                <label className="flex h-11 items-center gap-2 rounded-2xl bg-surface px-3 shadow-card">
                    <Search className="h-4 w-4 text-muted" />
                    <span className="sr-only">{t('fantasy.search')}</span>
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('fantasy.search')} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                </label>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none" role="group" aria-label={t('fantasy.filterTeam')}>
                    <button type="button" onClick={() => setTeamId(null)} aria-pressed={teamId === null} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${teamId === null ? 'bg-ink text-bg' : 'bg-raised text-muted'}`}>
                        {t('fantasy.allTeams')}
                    </button>
                    {Object.values(day.teams).map((team) => (
                        <button key={team.id} type="button" onClick={() => setTeamId(team.id)} aria-pressed={teamId === team.id} className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-bold ${teamId === team.id ? 'bg-ink text-bg' : 'bg-raised text-muted'}`}>
                            <TeamLogo team={{ ...team, name: team.abbrev }} size={22} />
                            {team.abbrev}
                        </button>
                    ))}
                </div>
                <ul className="divide-y divide-line/10">
                    {list.map((player) => {
                        const problem = canAdd(day, entry, player);
                        const inTeam = entry.lineup.includes(player.id);
                        const team = day.teams[player.teamId];
                        return (
                            <li key={player.id} className="flex items-center gap-3 py-2.5">
                                <PlayerPhoto personId={player.id} name={player.name} size={44} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-extrabold">
                                        {player.name}
                                        {player.starter && <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent-ink">{t('fantasy.starter')}</span>}
                                    </p>
                                    <p className="truncate text-xs text-muted">
                                        {team?.abbrev} · {player.pos || '—'} · {gameStatus(day, player.gamePk, i18n.language, t)}
                                        {lineText(player, t) ? ` · ${lineText(player, t)}` : ''}
                                    </p>
                                    {problem && problem !== 'already' && <p className="text-[11px] font-semibold text-faint">{problemText(problem)}</p>}
                                </div>
                                {started && <span className="w-9 text-right font-display text-lg font-extrabold tabular-nums">{player.points}</span>}
                                <button
                                    type="button"
                                    disabled={!inTeam && !!problem}
                                    onClick={() => (inTeam ? removePlayer(day, player) : addPlayer(day, entry, player))}
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${inTeam ? 'bg-accent text-white' : 'bg-raised text-ink disabled:opacity-30'}`}
                                    aria-label={inTeam ? t('fantasy.remove', { name: player.name }) : t('fantasy.add', { name: player.name })}
                                    aria-pressed={inTeam}
                                >
                                    {inTeam ? <X className="h-4 w-4" /> : problem === 'locked' ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                </button>
                            </li>
                        );
                    })}
                    {!list.length && <li className="py-8 text-center text-sm text-muted">{t('fantasy.noPlayers')}</li>}
                </ul>
            </div>
        </BottomSheet>
    );
};

// ---------------------------------------------------------------- pronósticos

const PicksTab: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t, i18n } = useTranslation();
    return (
        <section className="space-y-2.5" aria-label={t('fantasy.picks')}>
            <p className="text-sm text-muted">{t('fantasy.picksHint', { pts: RULES.pick })}</p>
            {day.games.map((game: FantasyGame) => {
                const pick = entry.picks[game.gamePk];
                const result = pickResult(game, entry);
                const locked = game.state !== 'preview';
                return (
                    <div key={game.gamePk} className="card p-3">
                        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
                            <span>{game.state === 'preview' ? formatTime(game.date, i18n.language) : game.state === 'final' ? t('fantasy.final') : t('fantasy.liveNow')}</span>
                            {result === 'win' && <span className="font-extrabold text-ball">+{RULES.pick}</span>}
                            {result === 'loss' && <span className="font-extrabold text-live">0</span>}
                            {locked && !pick && <span>{t('fantasy.noPick')}</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {[game.away, game.home].map((side) => {
                                const chosen = pick === side.id;
                                return (
                                    <button
                                        key={side.id}
                                        type="button"
                                        disabled={locked}
                                        onClick={() => setPick(day, game, side.id)}
                                        aria-pressed={chosen}
                                        className={`flex items-center gap-2 rounded-2xl p-2.5 text-left transition-colors ${chosen ? 'text-white' : 'bg-raised'} ${locked && !chosen ? 'opacity-60' : ''}`}
                                        style={chosen ? { backgroundColor: side.color } : undefined}
                                    >
                                        <TeamLogo team={side} size={32} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-extrabold">{side.abbrev}</span>
                                            {game.state !== 'preview' && <span className="block text-xs font-bold opacity-80">{side.score ?? 0}</span>}
                                        </span>
                                        {locked && chosen && <Lock className="h-3.5 w-3.5 opacity-80" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </section>
    );
};

// ---------------------------------------------------------------- tabla (con cuenta)

const TableTab: React.FC<{ day: FantasyDay }> = ({ day }) => {
    const { t } = useTranslation();
    const session = useSession();
    const [rivals, setRivals] = useState<Rival[] | null>(null);
    const [leagues, setLeagues] = useState<PrivateLeague[]>([]);
    const [scope, setScope] = useState<string>('all');
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [message, setMessage] = useState<string | null>(null);

    const load = async () => {
        if (!session) return;
        const mine = await myLeagues().catch(() => []);
        setLeagues(mine);
        const members = scope === 'all' ? undefined : mine.find((l) => l.id === scope)?.members;
        setRivals(await dayEntries(day.league, day.date, members).catch(() => []));
    };
    useEffect(() => {
        load();
    }, [session?.user.id, day.date, scope]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!accountEnabled() || !session) {
        return (
            <section className="space-y-3">
                <div className="card flex items-start gap-3 p-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-raised">
                        <Users className="h-5 w-5" />
                    </span>
                    <span>
                        <span className="block font-extrabold">{t('fantasy.compete')}</span>
                        <span className="block text-sm text-muted">{t('fantasy.competeHint')}</span>
                    </span>
                </div>
                <AccountCard compact />
            </section>
        );
    }

    const ranking = (rivals || [])
        .map((rival) => ({ ...rival, points: teamPoints(day, rival.entry) + pickPoints(day, rival.entry) }))
        .sort((a, b) => b.points - a.points);

    return (
        <section className="space-y-3">
            {leagues.length > 0 && (
                <Segmented<string>
                    size="sm"
                    label={t('fantasy.leagues')}
                    value={scope}
                    onChange={setScope}
                    options={[{ value: 'all', label: t('fantasy.everyone') }, ...leagues.map((l) => ({ value: l.id, label: l.name }))]}
                />
            )}
            <ol className="card divide-y divide-line/10 overflow-hidden">
                {ranking.map((row, index) => (
                    <li key={row.userId} className={`flex items-center gap-3 px-4 py-3 ${row.userId === session.user.id ? 'bg-accent/10' : ''}`}>
                        <span className="w-6 text-center font-display text-lg font-extrabold text-muted">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-bold">{row.userId === session.user.id ? t('fantasy.you') : row.name}</span>
                        <span className="font-display text-xl font-extrabold tabular-nums">{Math.round(row.points * 10) / 10}</span>
                    </li>
                ))}
                {rivals && !ranking.length && <li className="px-4 py-6 text-center text-sm text-muted">{t('fantasy.emptyTable')}</li>}
            </ol>
            {scope !== 'all' && <p className="text-xs text-muted">{t('fantasy.leagueCode', { code: leagues.find((l) => l.id === scope)?.code })}</p>}

            <div className="card grid gap-3 p-4 sm:grid-cols-2">
                <form
                    className="flex gap-2"
                    onSubmit={async (event) => {
                        event.preventDefault();
                        const created = await createLeague(name).catch(() => null);
                        setMessage(created?.[0]?.code ? t('fantasy.created', { code: created[0].code }) : t('account.errors.unknown'));
                        setName('');
                        load();
                    }}
                >
                    <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder={t('fantasy.newLeague')} aria-label={t('fantasy.newLeague')} className="h-11 min-w-0 flex-1 rounded-2xl bg-raised px-3 text-sm outline-none focus:ring-2 focus:ring-accent" />
                    <button type="submit" className="h-11 rounded-2xl bg-ink px-4 text-sm font-bold text-bg">
                        {t('fantasy.create')}
                    </button>
                </form>
                <form
                    className="flex gap-2"
                    onSubmit={async (event) => {
                        event.preventDefault();
                        const ok = await joinLeague(code).then(() => true).catch(() => false);
                        setMessage(ok ? t('fantasy.joined') : t('fantasy.badCode'));
                        setCode('');
                        load();
                    }}
                >
                    <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={6} placeholder={t('fantasy.code')} aria-label={t('fantasy.code')} className="h-11 min-w-0 flex-1 rounded-2xl bg-raised px-3 text-sm uppercase tracking-widest outline-none focus:ring-2 focus:ring-accent" />
                    <button type="submit" className="h-11 rounded-2xl bg-accent px-4 text-sm font-bold text-white">
                        {t('fantasy.join')}
                    </button>
                </form>
                {message && <p className="text-sm font-semibold sm:col-span-2">{message}</p>}
            </div>
        </section>
    );
};

// ---------------------------------------------------------------- extras

const HistoryBars: React.FC<{ days: { date: string; points: number }[] }> = ({ days }) => {
    const max = Math.max(...days.map((d) => d.points), 1);
    return (
        <div className="mt-4 flex h-12 items-end gap-1.5" aria-hidden="true">
            {days.map((d) => (
                <span key={d.date} className="flex-1 rounded-t-md bg-white/70" style={{ height: `${Math.max(8, (d.points / max) * 100)}%` }} title={`${d.date}: ${d.points}`} />
            ))}
        </div>
    );
};

const ShareTeam: React.FC<{ day: FantasyDay; entry: DayEntry; points: number }> = ({ day, entry, points }) => {
    const { t } = useTranslation();
    const share = async () => {
        const names = entry.lineup
            .map((id) => day.players.find((p) => p.id === id))
            .filter((p): p is FantasyPlayer => !!p)
            .map((p) => `${entry.captain === p.id ? '👑 ' : ''}${p.name} (${playerScore(entry, p)})`)
            .join(', ');
        const text = t('fantasy.shareText', { points: Math.round(points * 10) / 10, names });
        const url = `${window.location.origin}/fantasy`;
        try {
            if (navigator.share) await navigator.share({ title: 'El Play Fantasy', text, url });
            else window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noopener');
        } catch {
            /* el usuario cerró la lista de apps */
        }
    };
    return (
        <button type="button" onClick={share} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-card" aria-label={t('fantasy.share')}>
            <Share2 className="h-5 w-5" />
        </button>
    );
};
