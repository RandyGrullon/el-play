// «Ideas para hoy» (igual que la web): dentro de «Mi equipo», plegable, carruseles con los que vienen en racha, las
// gangas, los que suben y bajan de precio, los lanzadores con mejor duelo y los más elegidos ayer (/api/v2/fantasy/trends).
// Cada tarjeta lleva la foto, cómo llega al juego, el rival, el precio, la proyección, los últimos 5 y «Agregar» con la
// misma regla del selector (si no se puede, dice por qué). Sin la ruta (404, 503 o error) la sección no sale.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Check, ChevronDown, Lightbulb, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { addPlayer, isLocked, playerPostponed, type DayEntry, type FantasyDay } from '../../lib/fantasy';
import { matchupOf, statusOf } from '../../lib/fantasyPicker';
import { formatTime } from '../../lib/format';
import { ideaRows, type IdeaRow } from '../../lib/fantasyQuick';
import { TREND_LISTS, useFantasyTrends, type TrendItem, type TrendList } from '../../lib/fantasyStats';
import { getItem, setItem } from '../../lib/storage';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { PlayerPhoto, Row, Txt } from '../ui';
import { useProColors } from '../pro/kit';
import { PlayerLink, teamTextLink } from '../stats/common';
import { Last5Bars, PriceChip, StatusBadge, reasonText } from './PlayerBits';
import { formatCredits, teamOf } from './shared';
import { formatValue } from './Smart';

const CLOSED_KEY = 'el-play-fantasy-ideas-closed';
const readClosed = () => {
    try {
        return getItem(CLOSED_KEY) === '1';
    } catch {
        return false;
    }
};

/** Lo que pone a cada uno en su lista («Prom. 12,4», «1,85 pts/crédito», «Subió 0,5», «OPS del rival .640», «38 % lo eligió») */
const metricText = (list: TrendList, item: TrendItem, t: TFunction, lang: string) => {
    if (list === 'hot' && typeof item.avg === 'number') return t('fantasyIdeas.metric.avg', { pts: formatCredits(item.avg, lang) });
    if (list === 'bargains' && typeof item.value === 'number') return t('fantasyIdeas.metric.value', { v: formatValue(item.value, lang) });
    if ((list === 'risers' || list === 'fallers') && typeof item.priceDelta === 'number') return t(item.priceDelta >= 0 ? 'fantasyIdeas.metric.up' : 'fantasyIdeas.metric.down', { delta: formatCredits(Math.abs(item.priceDelta), lang) });
    if (list === 'pitchers' && item.matchup?.oppOps) return t('fantasyIdeas.metric.oppOps', { ops: item.matchup.oppOps });
    if (list === 'popular' && typeof item.owned === 'number') return t('fantasyIdeas.metric.owned', { pct: formatCredits(item.owned, lang) });
    return null;
};

/** La sección: solo el día que todavía tiene peloteros abiertos y si el servidor manda ideas */
export const IdeasSection: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [closed, setClosed] = useState(readClosed);
    const open = day.players.some((player) => !isLocked(day, player) && !playerPostponed(day, player));
    const trends = useFantasyTrends(day.league, day.date, open);
    const lists = useMemo(
        () => (trends.data ? TREND_LISTS.map((list) => ({ list, rows: ideaRows(day, entry, trends.data[list]) })).filter((group) => group.rows.length > 0) : []),
        // day cambia con cada respuesta (y con la hora de cierre): así lo cerrado sale de las listas
        [trends.data, day, entry]
    );
    if (!open || !lists.length) return null;
    const toggle = () => {
        const next = !closed;
        setClosed(next);
        try {
            setItem(CLOSED_KEY, next ? '1' : '0');
        } catch {
            /* sin almacenamiento: dura mientras la app esté abierta */
        }
    };
    return (
        <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, paddingVertical: 14, gap: 12 }, shadow('card')]}>
            <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: !closed }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.gold, 0.18) }}>
                    <Lightbulb size={16} color={colors.gold} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={16} weight="extrabold" accessibilityRole="header">
                        {t('fantasyIdeas.title')}
                    </Txt>
                    {!closed && (
                        <Txt size={12} tone="muted">
                            {t('fantasyIdeas.hint')}
                        </Txt>
                    )}
                </View>
                <View style={{ transform: [{ rotate: closed ? '0deg' : '180deg' }] }}>
                    <ChevronDown size={18} color={colors.muted} />
                </View>
            </Pressable>
            {!closed &&
                lists.map(({ list, rows }) => (
                    <View key={list} style={{ gap: 8 }}>
                        <View style={{ paddingHorizontal: 16 }}>
                            <Txt size={14} weight="extrabold">
                                {t(`fantasyIdeas.lists.${list}`)}
                            </Txt>
                            <Txt size={11} tone="muted" numberOfLines={2}>
                                {t(`fantasyIdeas.why.${list}`)}
                            </Txt>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 4 }} accessibilityLabel={t(`fantasyIdeas.lists.${list}`)}>
                            {rows.map((row) => (
                                <IdeaCard key={`${list}-${row.player.id}`} day={day} entry={entry} list={list} row={row} />
                            ))}
                        </ScrollView>
                    </View>
                ))}
        </View>
    );
};

const IdeaCard: React.FC<{ day: FantasyDay; entry: DayEntry; list: TrendList; row: IdeaRow }> = ({ day, entry, list, row }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const { player, item, inTeam, reason } = row;
    const status = statusOf(day, player);
    const badge = status && status !== 'dnp' && status !== 'postponed' ? status : null;
    const last5 = (Array.isArray(player.last5) ? player.last5 : (item.last5 ?? [])).filter((value) => Number.isFinite(value));
    const metric = metricText(list, item, t, lang);
    const edge = list === 'pitchers' ? item.matchup?.edge : undefined;
    const edgeInk = edge === 'good' ? pro.up : edge === 'tough' ? pro.down : colors.muted;
    const why = reasonText(reason, t, lang);
    const add = () => {
        if (addPlayer(day, entry, player)) {
            Haptics.selectionAsync().catch(() => undefined);
            showToast(t('fantasyIdeas.added', { name: player.name }), undefined, 2500);
        }
    };
    // El rival: su equipo y el de enfrente abren su página
    const match = matchupOf(day, player);
    const game = day.games.find((item2) => item2.gamePk === player.gamePk);
    const oppId = player.opp?.id ?? (game?.home && game.away ? (game.home.id === player.teamId ? game.away.id : game.home.id) : null);
    const when = game && game.state === 'preview' && !game.startTimeTBD ? formatTime(game.date, lang) : null;
    return (
        <View style={{ width: 172, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 10, gap: 6 }}>
            <PlayerLink player={player} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <PlayerPhoto personId={player.id} name={player.name} size={44} team={teamOf(day, player)} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt size={13} weight="extrabold" numberOfLines={2} style={{ lineHeight: 15 }}>
                        {player.name}
                    </Txt>
                    {badge ? <StatusBadge status={badge} /> : null}
                </View>
            </PlayerLink>
            <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                {match ? (
                    <>
                        <Text {...teamTextLink(player.teamId)}>{match.team}</Text>
                        {match.home ? ' vs ' : ' @ '}
                        <Text {...teamTextLink(oppId)}>{match.opp}</Text>
                    </>
                ) : (
                    <Text {...teamTextLink(player.teamId)}>{day.teams[player.teamId]?.abbrev ?? ''}</Text>
                )}
                {when ? ` · ${when}` : ''}
            </Txt>
            <Row gap={6} justify="space-between">
                {player.price !== undefined ? <PriceChip price={player.price} delta={player.priceDelta} surface={colors.surface} /> : <View />}
                {last5.length > 0 && <Last5Bars values={last5} />}
            </Row>
            <Txt size={11} weight="bold" tone="accentInk" numberOfLines={1}>
                {[player.proj !== undefined ? t('fantasyHelp.picker.proj', { pts: formatCredits(player.proj, lang) }) : null, metric].filter(Boolean).join(' · ')}
            </Txt>
            {edge ? (
                <View style={{ alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: alpha(edgeInk, 0.14) }}>
                    <Txt size={10} weight="extrabold" color={edgeInk}>
                        {t(`fantasyIdeas.edge.${edge}`)}
                    </Txt>
                </View>
            ) : null}
            <View style={{ flex: 1 }} />
            {inTeam ? (
                <Row gap={4} style={{ height: 36, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: alpha(pro.up, 0.14) }}>
                    <Check size={14} color={pro.up} />
                    <Txt size={12} weight="extrabold" color={pro.up}>
                        {t('fantasyIdeas.inTeam')}
                    </Txt>
                </Row>
            ) : (
                <Pressable
                    onPress={add}
                    disabled={!!reason}
                    accessibilityRole="button"
                    accessibilityLabel={t('fantasy.add', { name: player.name })}
                    accessibilityHint={why || undefined}
                    accessibilityState={{ disabled: !!reason }}
                    style={({ pressed }) => ({ height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: reason ? colors.surface : colors.accent, opacity: pressed ? 0.85 : 1 })}
                >
                    {!reason && <Plus size={14} color="#fff" />}
                    <Txt size={12} weight="extrabold" color={reason ? colors.muted : '#fff'} numberOfLines={1}>
                        {reason ? why : t('fantasyIdeas.add')}
                    </Txt>
                </Pressable>
            )}
        </View>
    );
};
