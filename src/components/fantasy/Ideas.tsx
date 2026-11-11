// «Ideas para hoy» (igual que la web): dentro de «Mi equipo», plegable (se acuerda en el teléfono), carruseles con los
// que vienen en racha, las gangas, los que suben y bajan de precio, los lanzadores con mejor duelo y los más elegidos
// ayer (/api/v2/fantasy/trends). Cada tarjeta lleva la foto, cómo llega al juego, el rival, el número de su lista, el
// precio, la proyección, los últimos 5 y «Agregar» con la misma regla del selector (si no se puede, dice por qué).
// Sin la ruta (404, 503 o error) la sección no sale.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Check, ChevronDown, Lightbulb, Lock, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { addPlayer, isLocked, playerPostponed, type DayEntry, type FantasyDay } from '../../lib/fantasy';
import { matchupOf, statusOf } from '../../lib/fantasyPicker';
import { ideaRow, ideaRows, type IdeaReason, type IdeaRow } from '../../lib/fantasyQuick';
import { TREND_LISTS, useFantasyTrends, type TrendItem, type TrendList } from '../../lib/fantasyStats';
import { getItem, removeItem, setItem } from '../../lib/storage';
import { showToast } from '../../lib/toast';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { PlayerPhoto, Row, Txt } from '../ui';
import { PlayerLink, playerTextLink, teamTextLink } from '../stats/common';
import { Last5Bars, StatusBadge, reasonText } from './PlayerBits';
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
const writeClosed = (closed: boolean) => {
    try {
        if (closed) setItem(CLOSED_KEY, '1');
        else removeItem(CLOSED_KEY);
    } catch {
        /* sin almacenamiento: vale mientras la app esté abierta */
    }
};

/** Por qué no se puede agregar: lo del selector o «No juega hoy» */
const ideaReasonText = (reason: IdeaReason | null, t: TFunction, lang: string) => (!reason ? '' : reason.kind === 'notPlaying' ? t('fantasyIdeas.notToday') : reasonText(reason, t, lang));

/** El número de su lista (lo del servidor o, si falta, lo que se saca de lo que hay), como la web */
const metricOf = (list: TrendList, item: TrendItem): number | 'good' | 'even' | 'tough' | null => {
    switch (list) {
        case 'hot': {
            if (typeof item.avg === 'number') return item.avg;
            const last5 = (item.last5 ?? []).filter((value) => Number.isFinite(value));
            return last5.length ? Math.round((last5.reduce((sum, value) => sum + value, 0) / last5.length) * 10) / 10 : null;
        }
        case 'bargains':
            if (typeof item.value === 'number') return item.value;
            return typeof item.proj === 'number' && typeof item.price === 'number' && item.price > 0 ? Math.round((item.proj / item.price) * 100) / 100 : null;
        case 'risers':
        case 'fallers':
            return typeof item.priceDelta === 'number' ? item.priceDelta : null;
        case 'pitchers':
            return item.matchup?.edge ?? null;
        case 'popular':
            return typeof item.owned === 'number' ? item.owned : null;
    }
};

/** «Prom. 14», «1,45 pts/crédito», «Subió 1», «48 % lo eligió» o el chip del duelo */
const MetricChip: React.FC<{ list: TrendList; item: TrendItem }> = ({ list, item }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const metric = metricOf(list, item);
    if (metric === null) return null;
    let text: string;
    let ink = colors.accentInk;
    let bg = alpha(colors.accent, 0.1);
    if (typeof metric === 'string') {
        text = t(`fantasyIdeas.edge.${metric}`);
        ink = metric === 'tough' ? colors.live : metric === 'good' ? colors.ink : colors.muted;
        bg = metric === 'tough' ? alpha(colors.live, 0.1) : metric === 'good' ? alpha(colors.ball, 0.15) : colors.raised;
    } else if (list === 'hot') text = t('fantasyIdeas.metric.avg', { pts: formatCredits(metric, lang) });
    else if (list === 'bargains') text = t('fantasyIdeas.metric.value', { v: formatValue(metric, lang) });
    else if (list === 'popular') text = t('fantasyIdeas.metric.owned', { pct: formatCredits(metric, lang) });
    else {
        text = t(metric >= 0 ? 'fantasyIdeas.metric.up' : 'fantasyIdeas.metric.down', { delta: formatCredits(Math.abs(metric), lang) });
        ink = list === 'fallers' ? colors.live : colors.ink;
        bg = list === 'fallers' ? alpha(colors.live, 0.1) : alpha(colors.ball, 0.15);
    }
    const label = list === 'pitchers' && item.matchup?.oppOps ? `${text}. ${t('fantasyIdeas.metric.oppOps', { ops: item.matchup.oppOps })}` : text;
    return (
        <View accessible accessibilityLabel={label} style={{ alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 6, height: 18, justifyContent: 'center', backgroundColor: bg }}>
            <Txt size={10} weight="bold" tabular color={ink} numberOfLines={1}>
                {text}
            </Txt>
        </View>
    );
};

/** La sección: solo el día que todavía tiene peloteros abiertos y si el servidor manda ideas de ese día */
export const IdeasSection: React.FC<{ day: FantasyDay; entry: DayEntry }> = ({ day, entry }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [open, setOpen] = useState(() => !readClosed());
    const anyOpen = day.players.some((player) => !isLocked(day, player) && !playerPostponed(day, player));
    const trends = useFantasyTrends(day.league, day.date, anyOpen);
    // Una respuesta de otro día (la caché del servidor) no sirve
    const lists = useMemo(
        () => (trends.data && (!trends.data.date || trends.data.date === day.date) ? TREND_LISTS.map((list) => ({ list, items: trends.data[list] })).filter((group) => group.items.length > 0) : []),
        [trends.data, day.date]
    );
    if (!anyOpen || !lists.length) return null;
    const toggle = () =>
        setOpen((value) => {
            writeClosed(value);
            return !value;
        });
    return (
        <View accessibilityLabel={t('fantasyIdeas.title')} style={[{ borderRadius: radius.card, backgroundColor: colors.surface, paddingVertical: 16, gap: 12 }, shadow('card')]}>
            <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
                <Lightbulb size={16} color={colors.gold} />
                <Txt eyebrow accessibilityRole="header" style={{ flex: 1, minWidth: 0 }}>
                    {t('fantasyIdeas.title')}
                </Txt>
                <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                    <ChevronDown size={16} color={colors.muted} />
                </View>
            </Pressable>
            {open && (
                <View style={{ gap: 16 }}>
                    <Txt size={12} tone="muted" style={{ paddingHorizontal: 16 }}>
                        {t('fantasyIdeas.hint')}
                    </Txt>
                    {lists.map(({ list, items }) => (
                        <IdeaList key={list} day={day} entry={entry} list={list} rows={ideaRows(day, entry, items)} />
                    ))}
                </View>
            )}
        </View>
    );
};

const IdeaList: React.FC<{ day: FantasyDay; entry: DayEntry; list: TrendList; rows: IdeaRow[] }> = ({ day, entry, list, rows }) => {
    const { t } = useTranslation();
    return (
        <View style={{ gap: 6 }}>
            <View style={{ paddingHorizontal: 16 }}>
                <Txt size={14} weight="extrabold" accessibilityRole="header">
                    {t(`fantasyIdeas.lists.${list}`)}
                </Txt>
                <Txt size={12} tone="muted">
                    {t(`fantasyIdeas.why.${list}`)}
                </Txt>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 4 }} accessibilityLabel={t(`fantasyIdeas.lists.${list}`)}>
                {rows.map((row) => (
                    <IdeaCard key={`${list}-${row.item.id}`} day={day} entry={entry} list={list} row={row} />
                ))}
            </ScrollView>
        </View>
    );
};

const IdeaCard: React.FC<{ day: FantasyDay; entry: DayEntry; list: TrendList; row: IdeaRow }> = ({ day, entry, list, row }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const { item, player, inTeam, reason } = row;
    const team = day.teams[player?.teamId ?? item.teamId];
    const status = player ? statusOf(day, player) : item.status ? (item.status === 'probable' && item.estimated ? 'rotation' : item.status) : null;
    const match = player ? matchupOf(day, player) : item.opp ? { team: team?.abbrev ?? '', opp: item.opp.abbrev, home: item.opp.home } : null;
    const game = player ? day.games.find((value) => value.gamePk === player.gamePk) : undefined;
    const oppId = player?.opp?.id ?? item.opp?.id ?? (game?.home && game.away && player ? (game.home.id === player.teamId ? game.away.id : game.home.id) : null);
    const price = player?.price ?? item.price;
    const proj = player?.proj ?? item.proj;
    const last5 = (Array.isArray(item.last5) && item.last5.length ? item.last5 : Array.isArray(player?.last5) ? player.last5 : []).filter((value) => Number.isFinite(value));
    const why = ideaReasonText(reason, t, lang);
    const add = () => {
        // Con lo de ahora (el equipo pudo cambiar): entra o dice por qué no
        const now = ideaRow(day, entry, item);
        if (now.player && !now.reason && !now.inTeam && addPlayer(day, entry, now.player)) {
            Haptics.selectionAsync().catch(() => undefined);
            showToast(t('fantasyIdeas.added', { name: item.name }));
        } else if (now.reason) showToast(ideaReasonText(now.reason, t, lang));
    };
    return (
        <View style={{ width: 172, borderRadius: 20, backgroundColor: colors.surface, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.line }}>
            <Row gap={8} align="flex-start">
                <PlayerLink player={{ id: item.id, name: item.name, teamId: team?.id }}>
                    <PlayerPhoto personId={item.id} name={item.name} size={44} team={player ? teamOf(day, player) : team ? { id: team.id, logo: team.logo, color: team.color, abbrev: team.abbrev } : null} />
                </PlayerLink>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={14} weight="extrabold" numberOfLines={2} style={{ lineHeight: 17 }} {...playerTextLink({ id: item.id, name: item.name, teamId: team?.id })}>
                        {item.name}
                    </Txt>
                    <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                        <Text {...teamTextLink(team?.id)}>{team?.abbrev ?? match?.team ?? ''}</Text>
                        {match ? (
                            <>
                                {` ${match.home ? 'vs' : '@'} `}
                                <Text {...teamTextLink(oppId)}>{match.opp}</Text>
                            </>
                        ) : null}
                    </Txt>
                </View>
            </Row>
            <View style={{ minHeight: 18, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                {status && status !== 'dnp' ? <StatusBadge status={status} /> : null}
                <MetricChip list={list} item={item} />
            </View>
            <Row justify="space-between" align="flex-end" gap={8}>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                    {price !== undefined && (
                        <Txt size={11} weight="extrabold" tabular>
                            {t('fantasy.credits.price', { price: formatCredits(price, lang) })}
                        </Txt>
                    )}
                    {proj !== undefined && (
                        <Txt size={11} weight="semibold" tone="accentInk" tabular>
                            {t('fantasy.smart.proj', { pts: formatCredits(proj, lang) })}
                        </Txt>
                    )}
                </View>
                {last5.length > 0 && <Last5Bars values={last5} />}
            </Row>
            {reason ? (
                <Txt size={11} weight="bold" tone={reason.kind === 'budget' || reason.kind === 'notPlaying' ? 'live' : 'faint'}>
                    {why}
                </Txt>
            ) : null}
            <View style={{ flex: 1 }} />
            {inTeam ? (
                <Row gap={6} style={{ height: 36, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: alpha(colors.ball, 0.15) }}>
                    <Check size={16} color={colors.ink} />
                    <Txt size={12} weight="extrabold">
                        {t('fantasyIdeas.inTeam')}
                    </Txt>
                </Row>
            ) : (
                <Pressable
                    onPress={add}
                    disabled={!!reason}
                    accessibilityRole="button"
                    accessibilityLabel={t('fantasy.add', { name: item.name })}
                    accessibilityHint={why || undefined}
                    accessibilityState={{ disabled: !!reason }}
                    style={({ pressed }) => ({ height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: reason ? colors.raised : colors.accent, opacity: pressed ? 0.85 : 1 })}
                >
                    {reason?.kind === 'started' ? <Lock size={16} color={colors.muted} /> : <Plus size={16} color={reason ? colors.muted : '#fff'} />}
                    <Txt size={12} weight="extrabold" color={reason ? colors.muted : '#fff'}>
                        {t('fantasyIdeas.add')}
                    </Txt>
                </Pressable>
            )}
        </View>
    );
};
