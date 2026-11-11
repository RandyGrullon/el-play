// Ligas 2.0 (Fantasy v3): la tabla por semana de una liga privada (lunes a domingo, con el campeón de la semana pasada
// arriba) y las herramientas del dueño: renombrar, sacar a alguien (confirmando) y borrar la liga (escribiendo su
// nombre). Si el servidor no tiene las semanas o la base no tiene las funciones del dueño, no salen.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Settings2, Trash2, Trophy, UserMinus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { LeagueId } from '../../types';
import { Segmented } from '../ui/Segmented';
import { Skeleton } from '../ui/States';
import type { PrivateLeague } from '../../lib/account';
import { useSeasonRanking } from '../../lib/fans';
import { LEAGUE_NAME_MAX, cleanLeagueName, confirmsName, deleteLeague, lastChampion, removeMember, renameLeague, sortWeeks, useLeagueWeeks, useOwnerTools, weekName, type LeagueWeek } from '../../lib/fantasyLeagues';
import { showToast } from '../../lib/toast';
import { FanRow, type OpenFan } from './FanSearch';
import { fanLabel } from './FanProfile';
import { credits, dayMonth } from './fantasyUi';

type T = (key: string, options?: Record<string, unknown>) => string;

/** «10 nov – 16 nov» */
export const weekRange = (week: Pick<LeagueWeek, 'start' | 'end'>, t: T, lang: string) => t('fantasyLeagues.weekRange', { start: dayMonth(week.start, lang), end: dayMonth(week.end, lang) });

/** Los nombres de la liga: los de la tabla de la temporada de sus miembros (o los que se pasen) */
const useMemberNames = (league: LeagueId, members: string[], given?: Record<string, string | null>) => {
    const season = useSeasonRanking(league, members, !given);
    return (userId: string) => (given ? given[userId] ?? null : season.data?.ranking.find((row) => row.userId === userId)?.name ?? null);
};

interface LeagueWeeksProps {
    fantasyLeague: LeagueId;
    members: string[];
    ownId: string;
    onOpen: OpenFan;
    /** Modo de prueba: semanas y nombres inventados */
    demo?: boolean;
    names?: Record<string, string | null>;
}

/** La tabla de cada semana (la de ahora y las 3 anteriores), con el campeón de la semana pasada resaltado */
export const LeagueWeeks: React.FC<LeagueWeeksProps> = ({ fantasyLeague, members, ownId, onOpen, demo = false, names }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const query = useLeagueWeeks(fantasyLeague, members, true, demo);
    const nameOf = useMemberNames(fantasyLeague, members, names);
    const [index, setIndex] = useState(0);
    const weeks = sortWeeks(query.data?.weeks ?? []);
    if (query.isPending)
        return (
            <div className="card space-y-3 p-4" aria-busy="true">
                <Skeleton className="h-8 w-56 rounded-full" />
                <Skeleton className="h-9 rounded-full" />
                <Skeleton className="h-9 rounded-full" />
            </div>
        );
    // Sin el servidor nuevo la pestaña no sale (TableTab la quita); aquí no se muestra nada
    if (query.isError || !weeks.length) return null;
    const week = weeks[Math.min(index, weeks.length - 1)];
    const champion = lastChampion(weeks);
    const label = (userId: string) => fanLabel(t, nameOf(userId), userId === ownId);

    return (
        <div className="space-y-3">
            {champion && (
                <button
                    type="button"
                    onClick={() => onOpen(champion.userId, nameOf(champion.userId))}
                    className="flex w-full items-center gap-3 rounded-card bg-gold/15 p-4 text-left ring-1 ring-gold/30"
                    aria-label={`${t('fantasyLeagues.championLast')}: ${label(champion.userId)}, ${t('fantasyLeagues.championPts', { pts: credits(champion.total, lang) })}`}
                >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-white">
                        <Trophy className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-extrabold uppercase tracking-wide text-gold">{t('fantasyLeagues.championLast')}</span>
                        <span className="block truncate text-lg font-extrabold">{label(champion.userId)}</span>
                        <span className="block text-xs font-semibold text-muted">
                            {t('fantasyLeagues.championPts', { pts: credits(champion.total, lang) })} · {weekRange(champion.week, t, lang)}
                        </span>
                    </span>
                </button>
            )}
            {weeks.length > 1 && (
                <Segmented<string>
                    size="sm"
                    label={t('fantasyLeagues.pickWeek')}
                    value={String(Math.min(index, weeks.length - 1))}
                    onChange={(value) => setIndex(Number(value))}
                    options={weeks.map((item, position) => ({ value: String(position), label: weekName(position, t), aria: `${weekName(position, t)} (${weekRange(item, t, lang)})` }))}
                    className="w-full"
                />
            )}
            <p className="px-1 text-xs font-semibold text-muted">
                {weekRange(week, t, lang)}
                {!week.champion ? ` · ${week === weeks[0] ? t('fantasyLeagues.inProgress') : t('fantasyLeagues.noChampion')}` : ''}
            </p>
            {week.rows.length ? (
                <ol className="card divide-y divide-line/10 overflow-hidden" aria-label={`${t('fantasyLeagues.week')} ${weekRange(week, t, lang)}`}>
                    {week.rows.map((row) => {
                        const isChampion = week.champion === row.userId;
                        const days = t('fantasyLeagues.days', { count: row.days });
                        return (
                            <li key={row.userId} className={isChampion ? 'bg-gold/10' : ''}>
                                <FanRow userId={row.userId} name={nameOf(row.userId)} own={row.userId === ownId} onOpen={onOpen} rank={row.rank} points={row.total} detail={isChampion ? `🏆 ${t('fantasyLeagues.champion')} · ${days}` : days} />
                            </li>
                        );
                    })}
                </ol>
            ) : (
                <p className="card px-4 py-6 text-center text-sm text-muted">{t('fantasyLeagues.empty')}</p>
            )}
        </div>
    );
};

// ---------------------------------------------------------------- dueño

export interface OwnerActions {
    rename: (code: string, name: string) => Promise<unknown>;
    remove: (code: string, userId: string) => Promise<unknown>;
    destroy: (code: string) => Promise<unknown>;
}

const SERVER_ACTIONS: OwnerActions = { rename: renameLeague, remove: removeMember, destroy: deleteLeague };

interface OwnerToolsProps {
    league: PrivateLeague;
    fantasyLeague: LeagueId;
    ownId: string;
    /** Después de cada cambio (se vuelven a pedir las ligas); `deleted` la saca de la vista */
    onChanged: (change: 'renamed' | 'removed' | 'deleted') => void;
    /** Modo de prueba: se cambia solo en la pantalla */
    actions?: OwnerActions;
    names?: Record<string, string | null>;
}

type Mode = 'rename' | 'remove' | 'delete' | null;

/** Renombrar, sacar a alguien y borrar la liga: solo el dueño, y solo si la base ya tiene esas funciones */
export const LeagueOwnerTools: React.FC<OwnerToolsProps> = ({ league, fantasyLeague, ownId, onChanged, actions, names }) => {
    const { t } = useTranslation();
    const client = useQueryClient();
    const isOwner = !!league.owner && league.owner === ownId;
    const tools = useOwnerTools(isOwner && !actions);
    const nameOf = useMemberNames(fantasyLeague, league.members, names);
    const [mode, setMode] = useState<Mode>(null);
    const [name, setName] = useState(league.name);
    const [removing, setRemoving] = useState<string | null>(null);
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    if (!isOwner || (!actions && tools.data !== true)) return null;
    const run = actions ?? SERVER_ACTIONS;
    const others = league.members.filter((id) => id !== ownId);

    const attempt = async (work: () => Promise<unknown>, done: string, change: 'renamed' | 'removed' | 'deleted') => {
        setBusy(true);
        try {
            await work();
            showToast(done);
            setMode(null);
            setRemoving(null);
            setTyped('');
            onChanged(change);
        } catch {
            showToast(t('fantasyLeagues.owner.failed'));
            // Si la base dijo que no tiene la función, las herramientas se esconden
            client.invalidateQueries({ queryKey: ['fantasy-owner-tools'] });
        } finally {
            setBusy(false);
        }
    };
    const open = (next: Mode) => {
        setMode((current) => (current === next ? null : next));
        setRemoving(null);
        setTyped('');
        setName(league.name);
    };
    const tab = (value: Exclude<Mode, null>, Icon: typeof Pencil, text: string, danger = false) => (
        <button type="button" aria-expanded={mode === value} onClick={() => open(value)} className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-xs font-extrabold ${mode === value ? 'bg-ink text-bg' : danger ? 'bg-live/10 text-live' : 'bg-raised'}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {text}
        </button>
    );

    return (
        <section className="space-y-3 rounded-2xl border border-line/10 p-3" aria-label={t('fantasyLeagues.owner.title')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="eyebrow flex items-center gap-1.5">
                    <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('fantasyLeagues.owner.title')}
                </p>
                <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-bold">{t('fantasyLeagues.owner.badge')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
                {tab('rename', Pencil, t('fantasyLeagues.owner.rename'))}
                {tab('remove', UserMinus, t('fantasyLeagues.owner.remove'))}
                {tab('delete', Trash2, t('fantasyLeagues.owner.delete'), true)}
            </div>

            {mode === 'rename' && (
                <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const clean = cleanLeagueName(name);
                        if (!clean || clean === league.name) return setMode(null);
                        attempt(() => run.rename(league.code, clean), t('fantasyLeagues.owner.renamed', { name: clean }), 'renamed');
                    }}
                >
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        maxLength={LEAGUE_NAME_MAX}
                        aria-label={t('fantasyLeagues.owner.renameLabel')}
                        className="h-11 min-w-0 flex-1 basis-48 rounded-2xl bg-raised px-3 text-sm outline-none focus:ring-2 focus:ring-accent"
                    />
                    <button type="submit" disabled={busy} className="h-11 rounded-2xl bg-ink px-4 text-sm font-bold text-bg disabled:opacity-50">
                        {t('fantasyLeagues.owner.save')}
                    </button>
                    <button type="button" onClick={() => setMode(null)} className="h-11 rounded-2xl bg-raised px-4 text-sm font-bold">
                        {t('fantasyLeagues.owner.cancel')}
                    </button>
                </form>
            )}

            {mode === 'remove' &&
                (others.length ? (
                    <ul className="divide-y divide-line/10 rounded-2xl bg-raised/60">
                        {others.map((userId) => {
                            const who = fanLabel(t, nameOf(userId), false);
                            return (
                                <li key={userId} className="space-y-2 px-3 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{who}</span>
                                        {removing !== userId && (
                                            <button type="button" onClick={() => setRemoving(userId)} className="inline-flex h-9 items-center gap-1 rounded-full bg-surface px-3 text-xs font-bold shadow-card" aria-label={t('fantasyLeagues.owner.removeWho', { name: who })}>
                                                <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                                                {t('fantasyLeagues.owner.remove')}
                                            </button>
                                        )}
                                    </div>
                                    {removing === userId && (
                                        <div className="space-y-2 rounded-xl bg-live/10 p-2.5" role="alert">
                                            <p className="text-xs font-semibold">{t('fantasyLeagues.owner.removeConfirm', { name: who })}</p>
                                            <div className="flex gap-2">
                                                <button type="button" disabled={busy} onClick={() => attempt(() => run.remove(league.code, userId), t('fantasyLeagues.owner.removed', { name: who }), 'removed')} className="h-9 rounded-full bg-live px-3.5 text-xs font-extrabold text-white disabled:opacity-50">
                                                    {t('fantasyLeagues.owner.removeYes')}
                                                </button>
                                                <button type="button" onClick={() => setRemoving(null)} className="h-9 rounded-full bg-surface px-3.5 text-xs font-bold">
                                                    {t('fantasyLeagues.owner.cancel')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="text-sm text-muted">{t('fantasyLeagues.owner.nobody')}</p>
                ))}

            {mode === 'delete' && (
                <form
                    className="space-y-2 rounded-2xl bg-live/10 p-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (confirmsName(typed, league.name)) attempt(() => run.destroy(league.code), t('fantasyLeagues.owner.deleted', { name: league.name }), 'deleted');
                    }}
                >
                    <p className="text-xs font-semibold">{t('fantasyLeagues.owner.deleteConfirm', { name: league.name })}</p>
                    <input value={typed} onChange={(event) => setTyped(event.target.value)} aria-label={t('fantasyLeagues.owner.deleteLabel')} placeholder={league.name} autoComplete="off" className="h-11 w-full rounded-2xl bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-live" />
                    <div className="flex gap-2">
                        <button type="submit" disabled={busy || !confirmsName(typed, league.name)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-live px-4 text-xs font-extrabold text-white disabled:opacity-40">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            {t('fantasyLeagues.owner.deleteYes')}
                        </button>
                        <button type="button" onClick={() => setMode(null)} className="h-10 rounded-full bg-surface px-4 text-xs font-bold">
                            {t('fantasyLeagues.owner.cancel')}
                        </button>
                    </div>
                </form>
            )}
        </section>
    );
};
