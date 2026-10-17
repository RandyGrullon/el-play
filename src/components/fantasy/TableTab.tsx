// «Tabla»: ranking del día o de la temporada (todos o una liga privada), crear liga con código, unirse y nombre
// para la tabla. Cada fila abre el perfil del fanático.
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createLeague, dayEntries, joinLeague, myLeagues, useSession } from '../../lib/account';
import { pickPoints, teamPoints, type FantasyDay } from '../../lib/fantasy';
import { Card, Row, Segmented, Skeleton, Txt } from '../ui';
import { AccountCard } from '../account/AccountCard';
import { Field, FieldButton } from '../account/Field';
import { FanRow, SeasonTable } from './FanSearch';
import { useLocalText } from './texts';

export const TableTab: React.FC<{ day: FantasyDay; dayName: string; onOpenFan: (userId: string) => void }> = ({ day, dayName, onOpenFan }) => {
    const { t } = useTranslation();
    const L = useLocalText();
    const session = useSession();
    const [period, setPeriod] = useState<'day' | 'season'>('day');
    const [scope, setScope] = useState<string>('all');
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState<'create' | 'join' | null>(null);

    // Mis ligas privadas y los equipos del día (de todos o de la liga escogida)
    const leaguesQuery = useQuery({ queryKey: ['fantasy-leagues', session?.user.id], queryFn: () => myLeagues().catch(() => []), enabled: !!session, staleTime: 60000 });
    const leagues = leaguesQuery.data ?? [];
    const members = scope === 'all' ? undefined : leagues.find((l) => l.id === scope)?.members;
    const rivalsQuery = useQuery({
        queryKey: ['fantasy-table', session?.user.id, day.league, day.date, scope, members?.join(',') ?? ''],
        queryFn: () => dayEntries(day.league, day.date, members).catch(() => []),
        enabled: !!session && (scope === 'all' || !!members),
        staleTime: 15000
    });
    const rivals = rivalsQuery.data ?? null;
    const load = () => {
        leaguesQuery.refetch();
        rivalsQuery.refetch();
    };

    if (!session) return null;

    const ranking = (rivals || []).map((rival) => ({ ...rival, points: teamPoints(day, rival.entry) + pickPoints(day, rival.entry) })).sort((a, b) => b.points - a.points);

    const create = async () => {
        if (!name.trim() || busy) return;
        setBusy('create');
        const created = await createLeague(name).catch(() => null);
        setBusy(null);
        setMessage(created?.[0]?.code ? t('fantasy.created', { code: created[0].code }) : t('account.errors.unknown'));
        setName('');
        load();
    };
    const join = async () => {
        if (!code.trim() || busy) return;
        setBusy('join');
        const ok = await joinLeague(code)
            .then(() => true)
            .catch(() => false);
        setBusy(null);
        setMessage(ok ? t('fantasy.joined') : t('fantasy.badCode'));
        setCode('');
        load();
    };

    return (
        <View style={{ gap: 12 }}>
            {!session.name && (
                <View style={{ gap: 8 }}>
                    <Txt size={14} weight="semibold">
                        {t('fantasy.gate.nameTitle')}
                    </Txt>
                    <AccountCard />
                </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                <Segmented<'day' | 'season'>
                    small
                    value={period}
                    onChange={setPeriod}
                    options={[
                        { value: 'day', label: dayName },
                        { value: 'season', label: L('fans.season') }
                    ]}
                />
                {leagues.length > 0 && (
                    <Segmented<string> small value={scope} onChange={setScope} options={[{ value: 'all', label: t('fantasy.everyone') }, ...leagues.map((l) => ({ value: l.id, label: l.name }))]} />
                )}
            </ScrollView>
            {period === 'season' ? (
                <SeasonTable league={day.league} members={scope === 'all' ? undefined : members} onOpen={onOpenFan} />
            ) : (
                <Card padded={false} style={{ overflow: 'hidden' }}>
                    {rivals === null ? (
                        <View style={{ padding: 16, gap: 10 }}>
                            {[0, 1, 2].map((i) => (
                                <Skeleton key={i} height={22} round={8} />
                            ))}
                        </View>
                    ) : ranking.length ? (
                        ranking.map((row, index) => (
                            <FanRow key={row.userId} first={index === 0} userId={row.userId} name={row.name} own={row.userId === session.user.id} onOpen={onOpenFan} rank={index + 1} points={row.points} />
                        ))
                    ) : (
                        <Txt size={14} tone="muted" center style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
                            {t('fantasy.emptyTable')}
                        </Txt>
                    )}
                </Card>
            )}
            {scope !== 'all' && (
                <Txt size={12} tone="muted" selectable>
                    {t('fantasy.leagueCode', { code: leagues.find((l) => l.id === scope)?.code })}
                </Txt>
            )}

            <Card style={{ gap: 12 }}>
                <Row gap={8}>
                    <Field value={name} onChangeText={setName} maxLength={40} placeholder={t('fantasy.newLeague')} accessibilityLabel={t('fantasy.newLeague')} returnKeyType="done" onSubmitEditing={create} style={{ flex: 1 }} />
                    <FieldButton label={t('fantasy.create')} onPress={create} disabled={!name.trim()} busy={busy === 'create'} />
                </Row>
                <Row gap={8}>
                    <Field
                        value={code}
                        onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        maxLength={6}
                        placeholder={t('fantasy.code')}
                        accessibilityLabel={t('fantasy.code')}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={join}
                        style={{ flex: 1, letterSpacing: 3 }}
                    />
                    <FieldButton tone="accent" label={t('fantasy.join')} onPress={join} disabled={!code.trim()} busy={busy === 'join'} />
                </Row>
                {message && (
                    <Txt size={14} weight="semibold">
                        {message}
                    </Txt>
                )}
            </Card>
        </View>
    );
};
