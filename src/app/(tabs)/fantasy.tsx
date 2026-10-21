// Fantasy (igual que FantasyPage de la web): sin cuenta, la portada para entrar; con cuenta, Ayer/Hoy/Mañana,
// los puntos del día y las pestañas Mi equipo / Pronósticos / Tabla. Todo se sincroniza con la cuenta.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react-native';
import { Screen } from '../../components/layout';
import { EmptyState, ErrorState, OfflineState, Pill, ProBadge, Row, Skeleton, Title, Txt, useErrorText } from '../../components/ui';
import { FantasyGate } from '../../components/fantasy/FantasyGate';
import { PicksTab } from '../../components/fantasy/PicksTab';
import { PlayerPicker, type PickerState } from '../../components/fantasy/PlayerPicker';
import { ShareTeam } from '../../components/fantasy/ShareTeam';
import { SummaryCard } from '../../components/fantasy/SummaryCard';
import { TableTab } from '../../components/fantasy/TableTab';
import { TeamTab } from '../../components/fantasy/TeamTab';
import { shift, useOpenPlayer } from '../../components/fantasy/shared';
import { FanSearch } from '../../components/fantasy/FanSearch';
import { ProFantasy } from '../../components/pro/fantasy/ProFantasy';
import { useLocalText } from '../../components/fantasy/texts';
import { accountEnabled, pushEntry, syncFantasy, useSession } from '../../lib/account';
import { entryKey, fetchFantasyDay, getStore, history, pickPoints, settleDay, teamPoints, unsettledDays, useEntry, useFantasyDay, useFantasyStore } from '../../lib/fantasy';
import { formatLongDate } from '../../lib/format';
import { useIsPro } from '../../lib/pro';
import { useLeague } from '../../state/league';
import type { LeagueId } from '../../types';
import { useColors } from '../../theme/theme';
import { radius, shadow } from '../../theme/tokens';

type Tab = 'team' | 'picks' | 'table' | 'fans';

export default function FantasyScreen() {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const router = useRouter();
    const errorText = useErrorText();
    const { width } = useWindowDimensions();
    const { activeLeague } = useLeague();
    const pro = useIsPro();
    // El día escogido vale para la liga en que se escogió; al cambiar de liga se vuelve a «Hoy»
    const [picked, setPicked] = useState<{ league: LeagueId; date?: string }>({ league: activeLeague });
    const date = picked.league === activeLeague ? picked.date : undefined;
    const setDate = (next?: string) => setPicked({ league: activeLeague, date: next });
    const [tab, setTab] = useState<Tab>('team');
    const [picker, setPicker] = useState<PickerState | null>(null);
    const query = useFantasyDay(activeLeague, date);
    // «Hoy» lo dice el servidor (fecha de la liga); es la misma consulta cuando no hay otro día escogido
    const today = useFantasyDay(activeLeague).data?.date ?? null;
    const day = query.data;
    const entry = useEntry(activeLeague, day?.date);
    const store = useFantasyStore();
    const session = useSession();
    const client = useQueryClient();
    const openPlayer = useOpenPlayer();
    const L = useLocalText();
    // Perfil de un fanático: su propia pantalla (atrás vuelve aquí)
    const openFan = (id: string) => router.push({ pathname: '/fantasy/fan/[id]', params: { id } });
    // El Fantasy se juega con cuenta; sin ella se ve la portada para entrar
    const playing = accountEnabled() && !!session;

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

    // Días pasados que llegaron de la cuenta sin resultado (jugados en otro teléfono): se cierran para el historial
    const unsettled = useMemo(() => (today ? unsettledDays(store, activeLeague, today).join(',') : ''), [store, activeLeague, today]);
    useEffect(() => {
        if (!session || !unsettled) return;
        let cancelled = false;
        (async () => {
            for (const past of unsettled.split(',')) {
                const data = await client.fetchQuery({ queryKey: ['fantasy', activeLeague, past], queryFn: ({ signal }) => fetchFantasyDay(activeLeague, past, signal), staleTime: 3600000 }).catch(() => null);
                if (cancelled) return;
                const saved = getStore()[entryKey(activeLeague, past)];
                if (data && saved) settleDay(data, saved);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [session?.user.id, activeLeague, unsettled]); // eslint-disable-line react-hooks/exhaustive-deps

    // Al abrir la ficha desde el selector, el selector se cierra (no puede quedar encima) y se vuelve a abrir al regresar
    const resume = useRef<PickerState | null>(null);
    useFocusEffect(
        useCallback(() => {
            if (resume.current) {
                setPicker(resume.current);
                resume.current = null;
            }
        }, [])
    );
    const openFromPicker = (id: number, state: PickerState) => {
        resume.current = state;
        setPicker(null);
        // En iOS hay que esperar que la hoja termine de cerrarse antes de presentar la ficha
        setTimeout(() => openPlayer(id), Platform.OS === 'ios' ? 450 : 0);
    };

    const past = useMemo(() => history(store, activeLeague), [store, activeLeague]);
    const season = past.reduce((sum, d) => sum + d.points, 0);
    const points = day ? teamPoints(day, entry) : 0;
    const picks = day ? pickPoints(day, entry) : 0;
    const days = today ? [shift(today, -1), today, shift(today, 1)] : [];
    const dayLabel = (key: string) => (key === today ? t('games.today') : key < (today ?? '') ? t('games.yesterday') : t('games.tomorrow'));
    const offline = !day && query.fetchStatus === 'paused';
    const dateText = day ? formatLongDate(day.date, i18n.language) : t(`leagues.${activeLeague}.name`);

    // PRO (cuenta abierta + modo PRO): la misma partida con más datos; el Lite sigue igual debajo
    if (pro && playing) {
        return <ProFantasy league={activeLeague} query={query} date={date} onDate={setDate} today={today} tab={tab} onTab={setTab} entry={entry} onOpenFan={(id) => openFan(id)} />;
    }

    return (
        <Screen onRefresh={() => query.refetch()}>
            <Row justify="space-between" align="flex-start" gap={12}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={14} weight="semibold" tone="muted" numberOfLines={1}>
                        {dateText.charAt(0).toUpperCase() + dateText.slice(1)}
                    </Txt>
                    <Row gap={8}>
                        <Title>{t('fantasy.title')}</Title>
                        {pro && <ProBadge />}
                    </Row>
                </View>
                <Row gap={8}>
                    <Pressable
                        onPress={() => router.push('/posiciones?seccion=estadisticas')}
                        accessibilityRole="button"
                        accessibilityLabel={t('statsPage.title')}
                        style={({ pressed }) => [{ height: 48, minWidth: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radius.tile, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }, shadow('card')]}
                    >
                        <BarChart3 size={20} color={colors.ink} />
                        {width >= 400 && (
                            <Txt size={14} weight="bold">
                                {t('statsPage.open')}
                            </Txt>
                        )}
                    </Pressable>
                    {playing && day && day.players.some((p) => entry.lineup.includes(p.id)) && <ShareTeam day={day} entry={entry} points={points + picks} />}
                </Row>
            </Row>

            {!playing ? (
                <FantasyGate day={day} loading={query.isPending && !offline} />
            ) : (
                <>
                    {days.length > 0 && (
                        <View accessibilityRole="tablist" accessibilityLabel={t('games.selectDate')} style={{ flexDirection: 'row', gap: 8 }}>
                            {days.map((key) => (
                                <Pill key={key} label={dayLabel(key)} active={(date ?? today) === key} onPress={() => setDate(key === today ? undefined : key)} />
                            ))}
                        </View>
                    )}

                    <SummaryCard points={points} picks={picks} season={season} past={past} />

                    <FantasyTabs
                        value={tab}
                        onChange={setTab}
                        options={[
                            { value: 'team', label: t('fantasy.myTeam') },
                            { value: 'picks', label: t('fantasy.picks') },
                            { value: 'table', label: t('fantasy.table') },
                            { value: 'fans', label: L('fans.tab') }
                        ]}
                    />

                    {tab === 'fans' ? (
                        <FanSearch league={activeLeague} onOpen={openFan} />
                    ) : offline ? (
                        <OfflineState />
                    ) : query.isPending ? (
                        <View style={{ gap: 12 }}>
                            {[0, 1, 2, 3].map((i) => (
                                <Skeleton key={i} height={84} />
                            ))}
                        </View>
                    ) : query.isError && !day ? (
                        <ErrorState message={errorText(query.error)} onRetry={() => query.refetch()} />
                    ) : day && !day.games.length && tab !== 'table' ? (
                        <EmptyState title={t('fantasy.noGames')} hint={t('fantasy.noGamesHint')} />
                    ) : day ? (
                        tab === 'team' ? (
                            <TeamTab day={day} entry={entry} onPick={(role) => setPicker({ role, teamId: null, search: '' })} />
                        ) : tab === 'picks' ? (
                            <PicksTab day={day} entry={entry} />
                        ) : (
                            <TableTab day={day} dayName={dayLabel(day.date)} onOpenFan={openFan} />
                        )
                    ) : null}

                    {day && picker && <PlayerPicker day={day} entry={entry} initial={picker} onClose={() => setPicker(null)} onOpenPlayer={openFromPicker} />}
                </>
            )}
        </Screen>
    );
}

/** Las cuatro pestañas como el Segmented, pero a todo lo ancho para que quepan en 320 px */
const FantasyTabs: React.FC<{ value: Tab; onChange: (tab: Tab) => void; options: { value: Tab; label: string }[] }> = ({ value, onChange, options }) => {
    const colors = useColors();
    const { width } = useWindowDimensions();
    const roomy = width >= 400;
    return (
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.raised, borderRadius: radius.pill, padding: 4 }}>
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        onPress={() => onChange(option.value)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        style={[{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: roomy ? 8 : 4, paddingVertical: 7 }, active && [{ backgroundColor: colors.surface }, shadow('card')]]}
                    >
                        <Txt size={roomy ? 14 : 13} weight="semibold" tone={active ? 'ink' : 'muted'} numberOfLines={1}>
                            {option.label}
                        </Txt>
                    </Pressable>
                );
            })}
        </View>
    );
};
