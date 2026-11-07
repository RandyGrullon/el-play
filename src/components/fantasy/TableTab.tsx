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
import { HelpButton } from './fantasyUi';

export const TableTab: React.FC<{ day: FantasyDay; dayName: string; onOpenFan: OpenFan }> = ({ day, dayName, onOpenFan }) => {
    const { t } = useTranslation();
    const session = useSession();
    const [period, setPeriod] = useState<'day' | 'season'>('day');
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

    if (!session) return <p className="card p-4 text-sm text-muted">{t('fantasyHelp.demo')}</p>;

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
                <Segmented<'day' | 'season'>
                    size="sm"
                    label={t('fantasy.fans.period')}
                    value={period}
                    onChange={setPeriod}
                    options={[
                        { value: 'day', label: dayName },
                        { value: 'season', label: t('fantasy.fans.season') }
                    ]}
                />
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
