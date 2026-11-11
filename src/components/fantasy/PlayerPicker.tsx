// Escoger peloteros: arriba cuántos faltan y cuántos créditos quedan; buscar, rol, filtros (Disponibles, Me alcanza,
// Titulares, por juego y por equipo) y orden (Proyección, Valor, Precio, Pts/J, Últimos 5, % elegido). Cada fila dice
// su rival, su estado, su temporada, sus últimos 5, su precio (con lo que subió o bajó) y, si no se puede, por qué.
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Plus, Search, X } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { Segmented } from '../ui/Segmented';
import { PlayerPhoto } from '../ui/PlayerPhoto';
import { TeamLogo } from '../ui/TeamLogo';
import { PlayerSheet } from '../stats/PlayerSheet';
import { usePlayers, type PlayerRow } from '../../lib/stats';
import { formatTime } from '../../lib/format';
import { valueOf } from '../../lib/fantasyBest';
import { addPlayer, canAdd, creditsLeft, isLocked, lineText, removePlayer, rulesOf, slotsLeft, type AddProblem, type DayEntry, type FantasyDay, type FantasyPlayer } from '../../lib/fantasy';
import {
    defaultFilters,
    last5Average,
    opponentOf,
    pickerGames,
    pickerRows,
    reasonDetail,
    seasonLineOf,
    type PickerFilters,
    type PickerRow,
    type PickerSort
} from '../../lib/fantasyPicker';
import { StatusBadge, credits, gameStatus, shortTime, teamOf, useOwners, valueText } from './fantasyUi';

type T = (key: string, options?: Record<string, unknown>) => string;

/** «Su juego ya empezó», «Ya tienes 2 de LIC», «Te faltan 1,5 créditos», «Ya tienes tu lanzador», «Juego pospuesto» */
export const reasonText = (t: T, lang: string, day: FantasyDay, entry: DayEntry, player: FantasyPlayer, reason: AddProblem) => {
    const detail = reasonDetail(day, entry, player, reason);
    switch (reason) {
        case 'locked':
            return t('fantasyHelp.reason.locked');
        case 'postponed':
            return t('fantasyHelp.reason.postponed');
        case 'team':
            return t('fantasyHelp.reason.team', { n: detail.n, team: detail.team });
        case 'budget':
            return t('fantasyHelp.reason.budget', { short: credits(detail.short ?? 0, lang) });
        case 'full':
            return player.role === 'P' ? t('fantasyHelp.reason.fullP', { count: detail.count }) : t('fantasyHelp.reason.fullB', { n: detail.n });
        case 'already':
            return t('fantasyHelp.reason.already');
        default:
            return '';
    }
};

/** «Te faltan 2 bateadores · 14,5 créditos» (o «Tu equipo está completo · …») */
export const needText = (t: T, lang: string, day: FantasyDay, entry: DayEntry) => {
    const slots = slotsLeft(day, entry);
    const total = slots.batters + slots.pitchers;
    const parts = [slots.batters ? t('fantasyHelp.picker.needB', { count: slots.batters }) : null, slots.pitchers ? t('fantasyHelp.picker.needP', { count: slots.pitchers }) : null].filter(Boolean) as string[];
    const what = parts.length === 2 ? t('fantasyHelp.picker.needBoth', { b: parts[0], p: parts[1] }) : parts[0];
    const head = total ? t('fantasyHelp.picker.need', { count: total, what }) : t('fantasyHelp.picker.full');
    const left = creditsLeft(day, entry);
    const money = left === null ? t('fantasyHelp.picker.noCap') : left < -1e-9 ? t('fantasyHelp.picker.over', { over: credits(-left, lang) }) : t('fantasyHelp.picker.credits', { left: credits(left, lang) });
    return { text: `${head} · ${money}`, over: left !== null && left < -1e-9 };
};

/** Barritas de sus últimos 5 juegos (del más viejo al más nuevo); los negativos en rojo */
export const Sparkline: React.FC<{ values: number[]; label: string }> = ({ values, label }) => {
    const top = Math.max(1, ...values);
    const bottom = Math.min(0, ...values);
    return (
        <span role="img" aria-label={label} title={label} className="flex h-4 items-end gap-[2px]">
            {values.map((value, index) => (
                <span key={index} className={`w-[4px] rounded-[1px] ${value < 0 ? 'bg-live' : 'bg-accent'}`} style={{ height: `${Math.max(12, ((value - bottom) / (top - bottom)) * 100)}%` }} />
            ))}
        </span>
    );
};

const chipClass = (active: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${active ? 'bg-ink text-bg' : 'bg-raised text-muted hover:text-ink'}`;

export const PlayerPicker: React.FC<{ day: FantasyDay; entry: DayEntry; role: 'B' | 'P'; onClose: () => void }> = ({ day, entry, role: initialRole, onClose }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const [filters, setFilters] = useState<PickerFilters>(() => defaultFilters(initialRole));
    const hasProj = day.players.some((p) => p.proj !== undefined);
    const [sort, setSort] = useState<PickerSort>(hasProj ? 'proj' : 'ppg');
    const [info, setInfo] = useState<FantasyPlayer | null>(null);
    const owners = useOwners(day);
    // Puntos por juego y línea de la temporada actual (si el día no los trae)
    const stats = usePlayers(day.league);
    const seasonRows = useMemo(() => {
        const data = stats.data;
        return data && !data.isPreviousSeason ? new Map<number, PlayerRow>(data.players.map((row) => [row.id, row])) : new Map<number, PlayerRow>();
    }, [stats.data]);
    const context = useMemo(
        () => ({
            ppg: new Map([...seasonRows.values()].filter((row) => row.g > 0).map((row) => [row.id, row.ppg])),
            owned: new Map([...owners.entries()].map(([id, row]) => [id, row.pct]))
        }),
        [seasonRows, owners]
    );
    const rows = useMemo(() => pickerRows(day, entry, filters, sort, context), [day, entry, filters, sort, context]);
    const set = (change: Partial<PickerFilters>) => setFilters((current) => ({ ...current, ...change }));
    const need = needText(t, lang, day, entry);
    const rules = rulesOf(day);
    const full = slotsLeft(day, entry)[filters.role === 'P' ? 'pitchers' : 'batters'] === 0;
    const hasBudget = creditsLeft(day, entry) !== null;
    const games = pickerGames(day);
    const sorts: { value: PickerSort; label: string }[] = [
        { value: 'proj', label: t('fantasyHelp.picker.sortProj') },
        { value: 'value', label: t('fantasyHelp.picker.sortValue') },
        { value: 'price', label: t('fantasyHelp.picker.sortPrice') },
        { value: 'ppg', label: t('fantasyHelp.picker.sortPpg') },
        { value: 'last5', label: t('fantasyHelp.picker.sortLast5') },
        // El % elegido solo existe cuando ya empezó algún juego (antes no se muestra para que nadie copie)
        ...(owners.size ? [{ value: 'owned' as const, label: t('fantasyHelp.picker.sortOwned') }] : [])
    ];
    const filtered = filters.search !== '' || !filters.available || filters.affordable || filters.starters || filters.gamePk !== null || filters.teamId !== null;

    return (
        <BottomSheet open onClose={onClose} title={filters.role === 'P' ? t('fantasy.choosePitcher') : t('fantasy.chooseBatters')} tall>
            <div className="space-y-3 pb-2">
                {/* Siempre a la vista: cuántos faltan y cuántos créditos quedan */}
                <p className={`sticky top-0 z-10 -mx-4 bg-bg px-4 pb-2 pt-1 text-sm font-extrabold tabular-nums ${need.over ? 'text-live' : ''}`} aria-live="polite">
                    {need.text}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Segmented<'B' | 'P'>
                        size="sm"
                        label={t('fantasy.role')}
                        value={filters.role}
                        onChange={(role) => set({ role })}
                        options={[
                            { value: 'B', label: t('fantasy.batters') },
                            { value: 'P', label: t('fantasy.pitchers') }
                        ]}
                    />
                    <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-surface px-3 shadow-card">
                        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        <span className="sr-only">{t('fantasy.search')}</span>
                        <input type="search" value={filters.search} onChange={(event) => set({ search: event.target.value })} placeholder={t('fantasy.search')} className="min-w-0 flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:hidden" />
                        {filters.search && (
                            <button type="button" onClick={() => set({ search: '' })} className="flex h-7 w-7 items-center justify-center rounded-full bg-raised text-muted" aria-label={t('fantasy.fans.clear')}>
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </label>
                </div>

                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none" role="group" aria-label={t('fantasyHelp.picker.filters')}>
                    <button type="button" aria-pressed={filters.available} onClick={() => set({ available: !filters.available })} className={chipClass(filters.available)}>
                        {t('fantasyHelp.picker.available')}
                    </button>
                    {hasBudget && (
                        <button type="button" aria-pressed={filters.affordable} onClick={() => set({ affordable: !filters.affordable })} className={chipClass(filters.affordable)}>
                            {t('fantasyHelp.picker.affordable')}
                        </button>
                    )}
                    <button type="button" aria-pressed={filters.starters} onClick={() => set({ starters: !filters.starters })} className={chipClass(filters.starters)}>
                        {t('fantasyHelp.picker.starters')}
                    </button>
                </div>

                {games.length > 1 && (
                    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none" role="group" aria-label={t('fantasyHelp.picker.byGame')}>
                        <button type="button" aria-pressed={filters.gamePk === null} onClick={() => set({ gamePk: null })} className={chipClass(filters.gamePk === null)}>
                            {t('fantasyHelp.picker.allGames')}
                        </button>
                        {games.map((game) => (
                            <button key={game.gamePk} type="button" aria-pressed={filters.gamePk === game.gamePk} onClick={() => set({ gamePk: game.gamePk, teamId: null })} className={`${chipClass(filters.gamePk === game.gamePk)} whitespace-nowrap tabular-nums`}>
                                {game.away}-{game.home}
                                {!game.tbd ? ` ${shortTime(game.date, lang)}` : ''}
                            </button>
                        ))}
                    </div>
                )}

                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none" role="group" aria-label={t('fantasyHelp.picker.byTeam')}>
                    <button type="button" aria-pressed={filters.teamId === null} onClick={() => set({ teamId: null })} className={chipClass(filters.teamId === null)}>
                        {t('fantasyHelp.picker.allTeams')}
                    </button>
                    {Object.values(day.teams).map((team) => (
                        <button
                            key={team.id}
                            type="button"
                            onClick={() => set({ teamId: team.id, gamePk: null })}
                            aria-pressed={filters.teamId === team.id}
                            className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-bold ${filters.teamId === team.id ? 'bg-ink text-bg' : 'bg-raised text-muted'}`}
                        >
                            <TeamLogo team={{ ...team, name: team.abbrev }} size={22} />
                            {team.abbrev}
                        </button>
                    ))}
                </div>

                <Segmented<PickerSort> size="sm" label={t('fantasyHelp.picker.sort')} value={sort} onChange={setSort} options={sorts} className="w-full" />

                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
                    <span>{t('fantasyHelp.picker.count', { count: rows.length })}</span>
                    {filtered && (
                        <button type="button" onClick={() => setFilters(defaultFilters(filters.role))} className="font-bold text-accent-ink">
                            {t('fantasyHelp.picker.clearFilters')}
                        </button>
                    )}
                </div>
                {full && filters.available && (
                    <p className="rounded-2xl bg-raised px-3 py-2.5 text-xs font-semibold">
                        {filters.role === 'P' ? t('fantasyHelp.reason.fullP', { count: rules.pitchers }) : t('fantasyHelp.reason.fullB', { n: rules.batters })}. {t('fantasyHelp.picker.fullHint')}
                    </p>
                )}

                <ul className="divide-y divide-line/10" aria-label={filters.role === 'P' ? t('fantasy.pitchers') : t('fantasy.batters')}>
                    {rows.map((row) => (
                        <PickerItem key={row.player.id} day={day} entry={entry} row={row} sort={sort} ppg={context.ppg.get(row.player.id)} owned={context.owned.get(row.player.id)} season={seasonRows.get(row.player.id)} onInfo={setInfo} />
                    ))}
                    {!rows.length && (
                        <li className="space-y-2 py-8 text-center text-sm text-muted">
                            <p>{filters.available ? t('fantasyHelp.picker.emptyAvailable') : t('fantasyHelp.picker.empty')}</p>
                            {filtered && (
                                <button type="button" onClick={() => setFilters({ ...defaultFilters(filters.role), available: false })} className="font-bold text-accent-ink">
                                    {t('fantasyHelp.picker.clearFilters')}
                                </button>
                            )}
                        </li>
                    )}
                </ul>
            </div>
            {info && (
                <PlayerSheet
                    id={info.id}
                    name={info.name}
                    team={teamOf(day, info)}
                    onClose={() => setInfo(null)}
                    action={<PickerAction day={day} entry={entry} player={info} onDone={() => setInfo(null)} />}
                />
            )}
        </BottomSheet>
    );
};

const PickerItem: React.FC<{
    day: FantasyDay;
    entry: DayEntry;
    row: PickerRow;
    sort: PickerSort;
    ppg?: number;
    owned?: number;
    season?: PlayerRow;
    onInfo: (player: FantasyPlayer) => void;
}> = ({ day, entry, row, sort, ppg, owned, season, onInfo }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const { player, reason, inTeam, status, locked } = row;
    const team = day.teams[player.teamId];
    const opp = opponentOf(day, player);
    const game = day.games.find((g) => g.gamePk === player.gamePk);
    const blocked = !!reason && reason !== 'already';
    // Ya en el equipo y su juego empezó: no se puede quitar (como en la ficha)
    const lockedIn = inTeam && locked;
    const line = seasonLineOf(player, season);
    const last5 = Array.isArray(player.last5) ? player.last5 : [];
    const value = valueOf(player);
    const reasonId = `picker-reason-${player.id}`;
    const today = lineText(player, t);
    const fallback = '—';
    const seasonText = line
        ? player.role === 'P'
            ? t('fantasyHelp.picker.seasonPitcher', { era: line.era ?? fallback, whip: line.whip ?? fallback, k: line.k ?? fallback })
            : t('fantasyHelp.picker.seasonBatter', { avg: line.avg ?? fallback, ops: line.ops ?? fallback, hr: line.hr ?? fallback })
        : null;
    // La métrica del orden va primero (en negrita): así se ve por qué está arriba
    type Metric = { key: PickerSort; text: string };
    const average = last5Average(player);
    const candidates: (Metric | null)[] = [
        player.proj !== undefined ? { key: 'proj', text: t('fantasyHelp.picker.proj', { pts: credits(player.proj, lang) }) } : null,
        value !== null ? { key: 'value', text: t('fantasyHelp.picker.value', { v: valueText(value, lang) }) } : null,
        ppg !== undefined ? { key: 'ppg', text: t('fantasyHelp.picker.ppg', { ppg: credits(ppg, lang) }) } : null,
        sort === 'last5' && average !== null ? { key: 'last5', text: t('fantasyHelp.picker.last5', { list: credits(average, lang) }) } : null,
        owned !== undefined ? { key: 'owned', text: t('fantasyHelp.picker.owned', { pct: credits(owned, lang) }) } : null
    ];
    const metrics = candidates.filter((item): item is Metric => !!item);
    metrics.sort((a, b) => Number(b.key === sort) - Number(a.key === sort));
    const delta = typeof player.priceDelta === 'number' && Math.abs(player.priceDelta) > 1e-9 ? player.priceDelta : null;
    const priceLabel = player.price !== undefined ? [t('fantasy.credits.priceLong', { price: credits(player.price, lang) }), delta !== null ? t(delta > 0 ? 'fantasyHelp.picker.priceUp' : 'fantasyHelp.picker.priceDown', { delta: credits(Math.abs(delta), lang) }) : null].filter(Boolean).join('. ') : '';

    return (
        <li className={`flex items-center gap-3 py-2.5 ${blocked && !inTeam ? 'opacity-70' : ''}`}>
            <button type="button" onClick={() => onInfo(player)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t('statsPage.viewPlayer', { name: player.name })}>
                <PlayerPhoto personId={player.id} name={player.name} size={44} team={team ? { id: team.id, logo: team.logo, color: team.color } : null} />
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-extrabold">
                        <span className="truncate">{player.name}</span>
                        <StatusBadge status={status === 'dnp' || status === 'postponed' ? status : locked ? 'started' : status} />
                    </p>
                    <p className="truncate text-xs text-muted">
                        <span className="font-semibold">{opp ? t(opp.home ? 'fantasyHelp.picker.vs' : 'fantasyHelp.picker.at', { team: team?.abbrev ?? '', opp: opp.abbrev }) : team?.abbrev}</span>
                        {game ? ` · ${locked ? gameStatus(day, player.gamePk, lang, t) : game.startTimeTBD ? '' : formatTime(game.date, lang)}` : ''}
                        {player.pos && player.role === 'B' ? ` · ${player.pos}` : ''}
                    </p>
                    {seasonText && <p className="truncate text-[11px] text-muted tabular-nums">{seasonText}</p>}
                    {locked && today ? (
                        <p className="truncate text-[11px] font-semibold text-muted">{today}</p>
                    ) : (
                        metrics.length > 0 &&
                        status !== 'postponed' && (
                            <p className="truncate text-[11px] text-muted tabular-nums">
                                {metrics.map((metric, index) => (
                                    <React.Fragment key={metric.key}>
                                        {index > 0 && ' · '}
                                        <span className={metric.key === sort ? 'font-extrabold text-accent-ink' : 'font-semibold'}>{metric.text}</span>
                                    </React.Fragment>
                                ))}
                            </p>
                        )
                    )}
                    {blocked && (
                        <p id={reasonId} className={`text-[11px] font-bold ${reason === 'postponed' || reason === 'budget' ? 'text-live' : 'text-faint'}`}>
                            {reasonText(t, lang, day, entry, player, reason)}
                        </p>
                    )}
                </div>
            </button>
            <div className="flex shrink-0 flex-col items-end gap-1">
                {last5.length > 0 && <Sparkline values={last5} label={t('fantasyHelp.picker.last5', { list: last5.map((v) => credits(v, lang)).join(', ') })} />}
                {player.price !== undefined && (
                    <span className="flex items-center gap-1 rounded-full bg-raised px-2 py-1 text-xs font-extrabold tabular-nums" aria-label={priceLabel} title={priceLabel}>
                        {t('fantasy.credits.price', { price: credits(player.price, lang) })}
                        {delta !== null && (
                            <span className={delta > 0 ? 'text-ball' : 'text-live'} aria-hidden="true">
                                {delta > 0 ? '↑' : '↓'}
                                {credits(Math.abs(delta), lang)}
                            </span>
                        )}
                    </span>
                )}
                {locked && <span className="font-display text-lg font-extrabold leading-none tabular-nums">{credits(player.points, lang)}</span>}
            </div>
            <button
                type="button"
                disabled={inTeam ? lockedIn : blocked}
                onClick={() => (inTeam ? removePlayer(day, player) : addPlayer(day, entry, player))}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${inTeam ? 'bg-accent text-white disabled:opacity-60' : 'bg-raised text-ink disabled:opacity-30'}`}
                aria-label={inTeam ? t('fantasy.remove', { name: player.name }) : t('fantasy.add', { name: player.name })}
                aria-describedby={blocked ? reasonId : undefined}
                aria-pressed={inTeam}
            >
                {lockedIn || (!inTeam && reason === 'locked') ? <Lock className="h-4 w-4" /> : inTeam ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </button>
        </li>
    );
};

/** Botón de la ficha abierta desde el selector: agregar o quitar sin volver a la lista */
const PickerAction: React.FC<{ day: FantasyDay; entry: DayEntry; player: FantasyPlayer; onDone: () => void }> = ({ day, entry, player, onDone }) => {
    const { t, i18n } = useTranslation();
    const inTeam = entry.lineup.includes(player.id);
    const problem = canAdd(day, entry, player);
    const blocked = inTeam ? isLocked(day, player) : !!problem;
    return (
        <button
            type="button"
            disabled={blocked}
            onClick={() => {
                if (inTeam ? removePlayer(day, player) : addPlayer(day, entry, player)) onDone();
            }}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-extrabold disabled:opacity-50 ${inTeam ? 'bg-raised text-ink' : 'bg-accent text-white'}`}
        >
            {inTeam ? <X className="h-4 w-4" /> : blocked ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {inTeam ? (blocked ? t('fantasyHelp.reason.locked') : t('fantasy.remove', { name: player.name })) : blocked ? reasonText(t, i18n.language, day, entry, player, problem) : t('fantasy.add', { name: player.name })}
        </button>
    );
};
