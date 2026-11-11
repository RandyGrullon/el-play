// Tabla del día o de la temporada (de todos o de una liga privada), crear y unirse a ligas. Cada equipo cuenta como
// estaba al empezar cada juego (effectiveEntry) y los empates comparten el puesto (1, 2, 2, 4).
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Segmented } from '../ui/Segmented';
import { Skeleton } from '../ui/States';
import { AccountCard } from '../account/AccountCard';
import { createLeague, dayEntries, joinLeague, myLeagues, useSession, type PrivateLeague, type Rival } from '../../lib/account';
import { withRanks } from '../../lib/fans';
import { LEAGUE_CODE_LENGTH } from '../../lib/fantasyHelp';
import { effectiveEntry, pickPoints, teamPoints, type FantasyDay } from '../../lib/fantasy';
import { FanRow, SeasonTable, type OpenFan } from './FanSearch';
import { LeagueSummary } from './LeagueSummary';
import { HelpButton, useFantasyDemo } from './fantasyUi';
import { LeagueOwnerTools, LeagueWeeks, type OwnerActions } from './LeagueWeeks';
import { useLeagueWeeks } from '../../lib/fantasyLeagues';
import { DEMO_LEAGUE, DEMO_NAMES, DEMO_USER } from '../../lib/fantasyDemo';

type Period = 'day' | 'week' | 'season';

/** Día / Semana / Temporada (la semana solo dentro de una liga privada y si el servidor la tiene) */
const PeriodSwitch: React.FC<{ value: Period; onChange: (value: Period) => void; dayName: string; week: boolean }> = ({ value, onChange, dayName, week }) => {
    const { t } = useTranslation();
    return (
        <Segmented<Period>
            size="sm"
            label={week ? t('fantasyLeagues.period') : t('fantasy.fans.period')}
            value={value}
            onChange={onChange}
            options={[{ value: 'day', label: dayName }, ...(week ? [{ value: 'week' as const, label: t('fantasyLeagues.week') }] : []), { value: 'season', label: t('fantasy.fans.season') }]}
        />
    );
};

export const TableTab: React.FC<{ day: FantasyDay; dayName: string; onOpenFan: OpenFan }> = ({ day, dayName, onOpenFan }) => {
    const { t } = useTranslation();
    const session = useSession();
    const demo = useFantasyDemo();
    const [period, setPeriod] = useState<Period>('day');
    const [rivals, setRivals] = useState<Rival[] | null>(null);
    const [leagues, setLeagues] = useState<PrivateLeague[]>([]);
    const [scope, setScope] = useState<string>('all');
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const selected = scope === 'all' ? undefined : leagues.find((l) => l.id === scope);
    // La semana sale solo si el servidor la tiene (con 404, 503 o error no se ofrece)
    const weeks = useLeagueWeeks(day.league, selected?.members, !!session && !!selected);
    const hasWeeks = !!selected && weeks.isSuccess && weeks.data.weeks.length > 0;
    useEffect(() => {
        if (period === 'week' && !hasWeeks && !(selected && weeks.isPending)) setPeriod('day');
    }, [period, hasWeeks, selected, weeks.isPending]);

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

    // Solo en el modo de prueba (sin cuenta): no hay tabla, pero la ayuda sí (y una liga inventada con su semana)
    if (!session)
        return (
            <div className="space-y-3">
                <div className="flex items-start gap-2">
                    <p className="card flex-1 p-4 text-sm text-muted">{t('fantasyHelp.demo')}</p>
                    <HelpButton topic="table" />
                </div>
                {demo && <DemoLeague day={day} dayName={dayName} />}
            </div>
        );

    // Cada equipo como estaba al empezar cada juego (lo cambiado después no cuenta); los empates comparten el puesto
    const ranking = withRanks(
        (rivals || [])
            .map((rival) => ({ ...rival, entry: effectiveEntry(day, rival.entry) }))
            .map((rival) => ({ ...rival, points: Math.round((teamPoints(day, rival.entry) + pickPoints(day, rival.entry)) * 10) / 10 }))
            .sort((a, b) => b.points - a.points)
    );

    return (
        <section className="space-y-3" aria-label={t('fantasy.table')}>
            {!session.name && (
                <div className="space-y-2">
                    <p className="text-sm font-semibold">{t('fantasy.gate.nameTitle')}</p>
                    <AccountCard />
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <PeriodSwitch value={period} onChange={setPeriod} dayName={dayName} week={hasWeeks} />
                {leagues.length > 0 && (
                    <Segmented<string>
                        size="sm"
                        label={t('fantasy.leagues')}
                        value={scope}
                        onChange={setScope}
                        options={[{ value: 'all', label: t('fantasy.everyone') }, ...leagues.map((l) => ({ value: l.id, label: l.name }))]}
                    />
                )}
                <HelpButton topic="table" className="ml-auto" />
            </div>
            {period === 'season' ? (
                <SeasonTable league={day.league} members={scope === 'all' ? undefined : leagues.find((l) => l.id === scope)?.members} onOpen={onOpenFan} />
            ) : period === 'week' && selected ? (
                <LeagueWeeks fantasyLeague={day.league} members={selected.members} ownId={session.user.id} onOpen={onOpenFan} />
            ) : (
                <ol className="card divide-y divide-line/10 overflow-hidden">
                    {ranking.map((row) => (
                        <li key={row.userId}>
                            <FanRow userId={row.userId} name={row.name} own={row.userId === session.user.id} onOpen={onOpenFan} rank={row.rank} points={row.points} />
                        </li>
                    ))}
                    {!rivals && (
                        <li className="px-4 py-3">
                            <Skeleton className="h-9 rounded-full" />
                        </li>
                    )}
                    {rivals && !ranking.length && <li className="px-4 py-6 text-center text-sm text-muted">{t('fantasy.emptyTable')}</li>}
                </ol>
            )}
            {scope !== 'all' && leagues.find((l) => l.id === scope) && (
                <LeagueSummary
                    league={leagues.find((l) => l.id === scope)!}
                    fantasyLeague={day.league}
                    dayName={dayName}
                    ownId={session.user.id}
                    day={ranking.map((row) => ({ userId: row.userId, name: row.name, points: row.points }))}
                    onLeft={() => {
                        setScope('all');
                        load();
                    }}
                    onChanged={(change) => {
                        if (change === 'deleted') setScope('all');
                        load();
                    }}
                />
            )}

            <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
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
                        const ok = await joinLeague(code)
                            .then(() => true)
                            .catch(() => false);
                        setMessage(ok ? t('fantasy.joined') : t('fantasy.badCode'));
                        setCode('');
                        load();
                    }}
                >
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        required
                        maxLength={LEAGUE_CODE_LENGTH}
                        placeholder={t('fantasy.code')}
                        aria-label={t('fantasy.code')}
                        className="h-11 min-w-0 flex-1 rounded-2xl bg-raised px-3 text-sm uppercase tracking-widest outline-none focus:ring-2 focus:ring-accent"
                    />
                    <button type="submit" className="h-11 rounded-2xl bg-accent px-4 text-sm font-bold text-white">
                        {t('fantasy.join')}
                    </button>
                </form>
                {message && <p className="select-text text-sm font-semibold sm:col-span-2">{message}</p>}
            </div>
        </section>
    );
};

/**
 * Solo en el modo de prueba (sin cuenta, en desarrollo): una liga inventada para ver la semana y las herramientas del
 * dueño. Los cambios se ven en la pantalla y no se guardan.
 */
const DemoLeague: React.FC<{ day: FantasyDay; dayName: string }> = ({ day, dayName }) => {
    const { t } = useTranslation();
    const [league, setLeague] = useState<PrivateLeague | null>(() => ({ ...DEMO_LEAGUE, members: [...DEMO_LEAGUE.members] }));
    const [period, setPeriod] = useState<Period>('week');
    if (!league) return null;
    const names: Record<string, string | null> = { ...DEMO_NAMES, [DEMO_USER]: null };
    const wait = () => new Promise((resolve) => setTimeout(resolve, 400));
    const actions: OwnerActions = {
        rename: async (_code, next) => {
            await wait();
            setLeague((current) => current && { ...current, name: next });
        },
        remove: async (_code, userId) => {
            await wait();
            setLeague((current) => current && { ...current, members: current.members.filter((id) => id !== userId) });
        },
        destroy: async () => {
            await wait();
            setLeague(null);
        }
    };
    return (
        <section className="space-y-3" aria-label={league.name}>
            <PeriodSwitch value={period} onChange={setPeriod} dayName={dayName} week />
            {period === 'week' && <LeagueWeeks demo names={names} fantasyLeague={day.league} members={league.members} ownId={DEMO_USER} onOpen={() => undefined} />}
            <div className="card space-y-3 p-4">
                <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold">{league.name}</p>
                    <p className="text-xs text-muted">{t('leagueSummary.members', { count: league.members.length })}</p>
                </div>
                <LeagueOwnerTools league={league} fantasyLeague={day.league} ownId={DEMO_USER} onChanged={() => undefined} actions={actions} names={names} />
            </div>
        </section>
    );
};
