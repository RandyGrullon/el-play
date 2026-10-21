import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, CalendarDays, Star } from 'lucide-react-native';
import type { ScheduleGame } from '../../../types';
import type { SeasonCalendar } from '../../../types/pro-liga';
import { dayKey, formatDayNumber, formatTime, formatWeekday, todayKey } from '../../../lib/format';
import { usePreferences } from '../../../state/preferences';
import { useColors } from '../../../theme/theme';
import { alpha, fonts, radius, shadow } from '../../../theme/tokens';
import { Skeleton, TeamLogo, Txt } from '../../ui';
import { useAlertToggle } from '../../feed/alerts';
import { MOTION_EASE, MOTION_MS, ModuleHeader, ProNote, fmtSigned, teamInk, useInView, useMotion, useProColors } from '../kit';
import { teamCardOf, type TableRow } from './logic';

// Mi equipo: carrusel con los logos en el orden de la tabla para elegir el favorito y, debajo, su tarjeta en el color
// del equipo: récord, lugar, juegos detrás, diferencia, racha, casa/visita, récord esperado, últimos 10 y el próximo
// juego (con su campana). Sin la ruta PRO de posiciones sale con la tabla del Lite (sin el récord esperado).

const SPRING_MS = 380;
const ITEM = 52;
const GAP = 8;

/** Logo del carrusel: crece y lleva el anillo y la rayita del color del equipo cuando es el elegido */
const LogoChoice: React.FC<{ row: TableRow; selected: boolean; dimmed: boolean; onPress: () => void; label: string }> = ({ row, selected, dimmed, onPress, label }) => {
    const colors = useColors();
    const motion = useMotion();
    const grow = useSharedValue(selected ? 1 : 0);
    useEffect(() => {
        grow.set(motion.animate ? withTiming(selected ? 1 : 0, { duration: SPRING_MS, easing: MOTION_EASE }) : selected ? 1 : 0);
        return () => cancelAnimation(grow);
    }, [selected, motion.animate, grow]);
    const circle = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + 0.22 * grow.get() }] }));
    const bar = useAnimatedStyle(() => ({ width: 22 * grow.get() }));
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} style={{ width: ITEM, height: 70, alignItems: 'center' }}>
            <Animated.View
                style={[
                    { width: ITEM, height: ITEM, borderRadius: ITEM / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: selected ? row.team.color : alpha(colors.line, 0.12), opacity: dimmed ? 0.6 : 1 },
                    selected && shadow('float'),
                    circle
                ]}
            >
                <TeamLogo team={row.team} size={36} />
            </Animated.View>
            <Animated.View style={[{ marginTop: 8, height: 4, borderRadius: 2, backgroundColor: row.team.color }, bar]} />
        </Pressable>
    );
};

/** Barra de los últimos 10 (G verde / P roja) que crece de abajo al verse */
const FormBar: React.FC<{ win: boolean; letter: string; index: number; seen: boolean }> = ({ win, letter, index, seen }) => {
    const motion = useMotion();
    const grow = useSharedValue(motion.animate ? 0 : 1);
    useEffect(() => {
        if (!motion.animate) {
            grow.set(1);
            return;
        }
        if (!seen) return;
        grow.set(withDelay(motion.delay(index), withTiming(1, { duration: MOTION_MS.bar, easing: MOTION_EASE })));
        return () => cancelAnimation(grow);
    }, [seen, motion, index, grow]);
    const style = useAnimatedStyle(() => ({ opacity: grow.get(), transform: [{ scaleY: 0.2 + 0.8 * grow.get() }] }));
    return (
        <Animated.View style={[{ flex: 1, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: win ? '#15803d' : '#c81e1e' }, style]}>
            <Txt size={11} weight="extrabold" tone="white">
                {letter}
            </Txt>
        </Animated.View>
    );
};

interface MyTeamProps {
    /** Tabla de la regular (los equipos en el carrusel) */
    rows: TableRow[] | undefined;
    /** Tabla de la fase en curso si el favorito está en ella (Round Robin, final): la tarjeta va con esos números */
    cardRows?: TableRow[];
    calendar: SeasonCalendar | undefined;
    schedule: ScheduleGame[];
    loading: boolean;
    error: boolean;
}

export const MyTeam: React.FC<MyTeamProps> = ({ rows, cardRows, calendar, schedule, loading, error }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const motion = useMotion();
    const { favoriteTeamId, toggleFavoriteTeam, subscribedGames } = usePreferences();
    const toggleAlert = useAlertToggle();
    const strip = useRef<ScrollView>(null);
    const { setNode, onLayout, seen } = useInView();
    const ordered = [...(rows ?? [])].sort((a, b) => a.rank - b.rank);
    const card = favoriteTeamId !== null && rows ? teamCardOf(cardRows ?? rows, calendar, schedule, favoriteTeamId) : null;
    const selectedIndex = ordered.findIndex((row) => row.team.id === favoriteTeamId);

    // El elegido queda al centro del carrusel
    useEffect(() => {
        if (selectedIndex < 0) return;
        strip.current?.scrollTo({ x: Math.max(0, selectedIndex * (ITEM + GAP) - 120), animated: motion.animate });
    }, [selectedIndex, motion.animate]);

    const header = <ModuleHeader title={t('pro.mas.team.title')} aside={t('pro.mas.team.order')} style={{ marginBottom: 12 }} />;
    if (loading && !rows) {
        return (
            <View>
                {header}
                <Skeleton height={72} round={16} />
                <Skeleton height={420} style={{ marginTop: 12 }} />
            </View>
        );
    }
    if (error && !rows) {
        return (
            <View>
                {header}
                <ProNote tone="warn">{t('pro.mas.team.error')}</ProNote>
            </View>
        );
    }
    if (!ordered.length) return null;

    const team = card?.team;
    const ink = team ? teamInk(team.color) : colors.ink;
    const light = ink !== '#fff';
    const veil = light ? 'rgba(20,21,26,0.12)' : 'rgba(11,12,16,0.3)';
    const last = card?.form[0];
    const teamById = (id: number) => ordered.find((row) => row.team.id === id)?.team ?? calendar?.teams[String(id)];
    const next = card?.next ?? null;
    const nextHome = next && card ? next.home.id === card.team.id : false;
    const nextOpponent = next && card ? teamById(nextHome ? next.away.id : next.home.id) : undefined;
    const nextDay = next ? dayKey(next.date) : null;
    const nextGame = next ? schedule.find((game) => game.gamePk === next.gamePk) : undefined;
    const subscribed = next ? subscribedGames.includes(next.gamePk) : false;
    const record = (value: { wins: number; losses: number } | null | undefined) => (value ? `${value.wins}-${value.losses}` : '—');
    const games = card ? card.wins + card.losses : 0;
    const signTone = (value: number | null) => (value === null || value === 0 ? colors.ink : value > 0 ? pro.up : pro.down);

    return (
        <View>
            {header}
            <ScrollView
                ref={strip}
                horizontal
                showsHorizontalScrollIndicator={false}
                accessibilityLabel={t('pro.mas.team.pick')}
                style={{ marginHorizontal: -16 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, gap: GAP }}
            >
                {ordered.map((row) => {
                    const selected = row.team.id === favoriteTeamId;
                    return (
                        <LogoChoice
                            key={row.team.id}
                            row={row}
                            selected={selected}
                            dimmed={favoriteTeamId !== null && !selected}
                            label={selected ? t('pro.mas.team.yours', { team: row.team.name }) : t('pro.mas.team.choose', { team: row.team.name })}
                            onPress={() => row.team.id !== favoriteTeamId && toggleFavoriteTeam(row.team.id)}
                        />
                    );
                })}
            </ScrollView>

            {!card || !team ? (
                <View style={[{ marginTop: 8, borderRadius: radius.card, backgroundColor: colors.surface, padding: 20, alignItems: 'center', gap: 4 }, shadow('card')]}>
                    <Star size={24} color={colors.muted} />
                    <Txt weight="bold">{t('pro.mas.team.none')}</Txt>
                    <Txt size={14} tone="muted" center>
                        {t('pro.mas.team.noneHint')}
                    </Txt>
                </View>
            ) : (
                <View style={[{ marginTop: 8, borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' }, shadow('card')]}>
                    <View style={{ padding: 16, backgroundColor: team.color }}>
                        <LinearGradient
                            pointerEvents="none"
                            colors={light ? ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)'] : ['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.34)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0.6, y: 1 }}
                            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                        />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={[{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, shadow('card')]}>
                                <TeamLogo team={team} size={42} />
                            </View>
                            <Txt size={22} weight="black" color={ink} numberOfLines={2} accessibilityRole="header" style={{ flex: 1, lineHeight: 26, letterSpacing: -0.3 }}>
                                {team.name}
                            </Txt>
                            <Pressable
                                onPress={() => toggleFavoriteTeam(team.id)}
                                accessibilityRole="button"
                                accessibilityLabel={t('pro.mas.team.unfavorite', { team: team.name })}
                                style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 14, backgroundColor: veil }}
                            >
                                <Star size={16} color={ink} fill={ink} />
                                <Txt size={13} weight="extrabold" color={ink}>
                                    {t('pro.mas.team.favorite')}
                                </Txt>
                            </Pressable>
                        </View>
                        <View
                            accessible
                            accessibilityLabel={t('pro.mas.team.aria', { team: team.name, record: `${card.wins}-${card.losses}`, rank: card.rank, pct: card.pct })}
                            style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 8 }}
                        >
                            <Txt color={ink} style={{ fontFamily: fonts.condensed, fontSize: 76, lineHeight: 72, fontVariant: ['tabular-nums'] }}>
                                {card.wins}-{card.losses}
                            </Txt>
                            <View style={{ alignItems: 'flex-end', gap: 6, paddingBottom: 6 }}>
                                <View style={{ borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: veil }}>
                                    <Txt size={13} weight="extrabold" color={ink}>
                                        PCT {card.pct}
                                    </Txt>
                                </View>
                                {card.runsScored !== null && card.runsAllowed !== null && (
                                    <View style={{ borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: veil }}>
                                        <Txt size={13} weight="extrabold" color={ink}>
                                            {t('pro.mas.team.runs', { scored: card.runsScored, allowed: card.runsAllowed })}
                                        </Txt>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                    <View style={{ padding: 16, gap: 16 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {[
                                { key: 'rank', label: t('pro.mas.team.rank'), value: t('pro.mas.team.rankValue', { n: card.rank }), color: colors.ink },
                                { key: 'gb', label: t('pro.mas.team.gb'), value: card.gamesBack === '-' ? '—' : card.gamesBack, color: colors.ink },
                                { key: 'diff', label: t('pro.mas.team.diff'), value: card.runDiff === null ? '—' : fmtSigned(card.runDiff), color: signTone(card.runDiff) },
                                {
                                    key: 'streak',
                                    label: t('pro.mas.team.streak'),
                                    value: card.streak ? `${card.streak.won ? t('pro.kit.form.win') : t('pro.kit.form.loss')}${card.streak.n}` : '—',
                                    color: card.streak ? (card.streak.won ? pro.up : pro.down) : colors.ink
                                }
                            ].map((tile) => (
                                <View key={tile.key} accessible accessibilityLabel={`${tile.label}: ${tile.value}`} style={{ flex: 1, flexBasis: 0, minWidth: 0, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 8, paddingVertical: 10 }}>
                                    <Txt color={tile.color} numberOfLines={1} style={{ fontFamily: fonts.condensed, fontSize: 26, lineHeight: 28, fontVariant: ['tabular-nums'] }}>
                                        {tile.value}
                                    </Txt>
                                    <Txt size={11} weight="extrabold" tone="muted" numberOfLines={1} style={{ marginTop: 2, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                        {tile.label}
                                    </Txt>
                                </View>
                            ))}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {[
                                { key: 'home', value: record(card.home), accent: false },
                                { key: 'away', value: record(card.away), accent: false },
                                { key: 'expected', value: record(card.expected), accent: true }
                            ].map((split) => (
                                <View
                                    key={split.key}
                                    accessible
                                    accessibilityLabel={`${t(`pro.mas.team.splitLong.${split.key}`)}: ${split.value}`}
                                    style={{
                                        flex: 1,
                                        flexBasis: 0,
                                        minWidth: 0,
                                        flexDirection: 'row',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        columnGap: 4,
                                        borderRadius: 18,
                                        paddingHorizontal: 10,
                                        paddingVertical: 7,
                                        backgroundColor: split.accent ? alpha(colors.accent, 0.12) : colors.raised,
                                        borderWidth: split.accent ? 1 : 0,
                                        borderColor: alpha(colors.accent, 0.4)
                                    }}
                                >
                                    <Txt size={11} weight="extrabold" color={split.accent ? colors.accentInk : colors.muted} numberOfLines={1} style={{ letterSpacing: 0.4, textTransform: 'uppercase' }}>
                                        {t(`pro.mas.team.split.${split.key}`)}
                                    </Txt>
                                    <Txt style={{ fontFamily: fonts.condensed, fontSize: 18, fontVariant: ['tabular-nums'] }}>{split.value}</Txt>
                                </View>
                            ))}
                        </View>
                        {card.expected && card.runsScored !== null && card.runsAllowed !== null && (
                            <Txt size={13} tone="muted" style={{ lineHeight: 18, marginTop: -6 }}>
                                {t('pro.mas.team.expectedNote', { scored: card.runsScored, allowed: card.runsAllowed })}
                            </Txt>
                        )}

                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                <Txt eyebrow>{t('pro.mas.team.last10')}</Txt>
                                {last && (
                                    <Txt size={12} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                                        {t('pro.mas.team.lastGame', {
                                            result: last.isWin ? t('pro.kit.form.win') : t('pro.kit.form.loss'),
                                            score: `${last.runs}-${last.runsAllowed}`,
                                            where: last.isHome ? t('pro.mas.team.vs') : t('pro.mas.team.at'),
                                            team: teamById(last.opponentId)?.abbrev ?? '',
                                            count: card.form.length
                                        })}
                                    </Txt>
                                )}
                            </View>
                            <View
                                ref={setNode}
                                onLayout={onLayout}
                                accessible
                                accessibilityRole="image"
                                accessibilityLabel={t('pro.kit.form.aria', { count: Math.max(1, card.form.length), wins: card.form.filter((game) => game.isWin).length, losses: card.form.filter((game) => !game.isWin).length })}
                                style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 30 }}
                            >
                                {Array.from({ length: 10 }, (_, index) => {
                                    // El más reciente a la izquierda; lo que falta por jugar, en gris
                                    const game = card.form[index];
                                    if (!game) return <View key={index} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: alpha(colors.line, 0.15) }} />;
                                    return <FormBar key={index} win={game.isWin} letter={game.isWin ? t('pro.kit.form.win') : t('pro.kit.form.loss')} index={index} seen={seen} />;
                                })}
                            </View>
                            {games === 0 && (
                                <Txt size={13} tone="muted" style={{ marginTop: 8 }}>
                                    {t('pro.mas.team.noGames')}
                                </Txt>
                            )}
                        </View>

                        {next && nextOpponent && nextDay && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, backgroundColor: colors.raised, padding: 12 }}>
                                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                                    <CalendarDays size={20} color={colors.muted} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Txt size={11} weight="extrabold" tone="muted" numberOfLines={1} style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
                                        {t('pro.mas.team.next')} · {nextDay === todayKey() ? t('pro.mas.alerts.today') : `${formatWeekday(nextDay, lang)} ${formatDayNumber(nextDay)}`}
                                    </Txt>
                                    <Txt size={16} weight="extrabold" numberOfLines={1}>
                                        {nextHome ? t('pro.mas.team.vs') : t('pro.mas.team.at')} {nextOpponent.abbrev} · {formatTime(next.date, lang)}
                                    </Txt>
                                    <Txt size={13} tone="muted" numberOfLines={1}>
                                        {nextHome ? t('pro.mas.team.atHome') : t('pro.mas.team.away')} · {next.venue}
                                    </Txt>
                                </View>
                                {next.state === 'preview' && nextGame && (
                                    <Pressable
                                        onPress={() => void toggleAlert(nextGame)}
                                        accessibilityRole="switch"
                                        accessibilityState={{ checked: subscribed }}
                                        accessibilityLabel={subscribed ? t('pro.mas.alerts.remove') : t('pro.mas.alerts.add')}
                                        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: subscribed ? alpha(pro.warn, 0.18) : colors.surface }}
                                    >
                                        {subscribed ? <BellRing size={20} color={pro.warn} /> : <Bell size={20} color={colors.muted} />}
                                    </Pressable>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
};
