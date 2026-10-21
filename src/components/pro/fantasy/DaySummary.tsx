// «Tu día» del Fantasy PRO: anillo real contra proyectado, puesto en la tabla de la temporada, el día anterior, la
// cuenta regresiva al primer cierre y si lo de este teléfono ya está en la cuenta.
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CheckCheck, ChevronRight, Clock, CloudOff, ShieldCheck, UploadCloud } from 'lucide-react-native';
import { formatTime } from '../../../lib/format';
import { RULES, gameStarted, type DayEntry, type FantasyDay } from '../../../lib/fantasy';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import { Skeleton, Txt } from '../../ui';
import { CountUp, Gauge, GradientCard, useNow, useProColors } from '../kit';
import { Num, fmtPts, ordinal, type T } from './bits';
import type { SaveStatus } from './data';
import { lockGroups, nextGame, surname, topPercent, type Projection } from './logic';

export interface RankInfo {
    rank: number;
    total: number;
    toLeader: number;
}

export interface PrevInfo {
    label: string;
    total: number;
    team: number;
    picks: number;
}

interface DaySummaryProps {
    day: FantasyDay;
    entry: DayEntry;
    /** «hoy» o «vie 16» */
    dayName: string;
    team: number;
    picks: number;
    projection: Projection;
    rank: RankInfo | null;
    rankPending: boolean;
    prev: PrevInfo | null;
    season: { points: number; days: number };
    saveStatus: SaveStatus;
    onOpenSeason: () => void;
}

/** «A esa hora se cierran Núñez y Mejía. Celestino, a las 6:00; Tapia, Lester y Lake, a las 7:30.» */
const lockText = (day: FantasyDay, entry: DayEntry, firstAt: number, lang: string, t: T, now: number) => {
    if (!entry.lineup.length) return t('pro.fantasy.summary.lockEmpty');
    const groups = lockGroups(day, entry, now);
    if (!groups.length) return null;
    const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t('pro.fantasy.and')} ${names[names.length - 1]}` : names[0]);
    const first = groups.filter((group) => group.at === firstAt);
    const rest = groups.filter((group) => group.at !== firstAt);
    const parts: string[] = [];
    if (first.length) parts.push(t('pro.fantasy.summary.lockFirst', { count: first.flatMap((g) => g.players).length, names: list(first.flatMap((g) => g.players).map((p) => surname(p.name))) }));
    if (rest.length) {
        const text = rest.map((group) => t('pro.fantasy.summary.lockAt', { names: list(group.players.map((p) => surname(p.name))), time: formatTime(new Date(group.at).toISOString(), lang) })).join('; ');
        // «7:30 p. m.» ya termina en punto
        parts.push(text.endsWith('.') ? text : `${text}.`);
    }
    return parts.join(' ');
};

export const DaySummary: React.FC<DaySummaryProps> = ({ day, entry, dayName, team, picks, projection, rank, rankPending, prev, season, saveStatus, onOpenSeason }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const now = useNow(30000);
    // En 320 px el anillo se achica para que quepan los dos tiles al lado
    const narrow = useWindowDimensions().width < 360;
    const players = entry.lineup.filter((id) => day.players.some((player) => player.id === id));
    const missing = RULES.batters + RULES.pitchers - players.length;
    const next = nextGame(day, now);
    const until = next ? Math.max(0, Date.parse(next.date) - now) : 0;
    const hours = Math.floor(until / 3600000);
    const minutes = Math.floor((until % 3600000) / 60000);
    const top = rank ? topPercent(rank.rank, rank.total) : null;
    const real = Math.round((team + picks) * 10) / 10;
    const locks = next ? lockText(day, entry, Date.parse(next.date), lang, t, now) : null;
    const save =
        saveStatus === 'saved'
            ? { Icon: CheckCheck, color: pro.up }
            : saveStatus === 'saving'
              ? { Icon: UploadCloud, color: colors.muted }
              : saveStatus === 'pending' || saveStatus === 'offline'
                ? { Icon: saveStatus === 'offline' ? CloudOff : UploadCloud, color: pro.warn }
                : null;
    const tile = { minWidth: 0, gap: 2, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 12, paddingVertical: 10 } as const;

    return (
        <GradientCard style={shadow('float')} innerStyle={{ gap: 14 }} accessibilityLabel={t('pro.fantasy.summary.title', { day: dayName })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Txt eyebrow accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {t('pro.fantasy.summary.title', { day: dayName })}
                </Txt>
                {players.length > 0 &&
                    (missing <= 0 ? (
                        <View style={{ height: 24, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: alpha(pro.up, 0.14) }}>
                            <ShieldCheck size={13} color={pro.up} />
                            <Txt size={11} weight="bold" color={pro.up} numberOfLines={1}>
                                {t('pro.fantasy.summary.complete')}
                            </Txt>
                        </View>
                    ) : (
                        <View style={{ height: 24, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: alpha(pro.warn, 0.14) }}>
                            <Txt size={11} weight="bold" color={pro.warn} numberOfLines={1}>
                                {t('pro.fantasy.summary.missing', { count: missing })}
                            </Txt>
                        </View>
                    ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: narrow ? 10 : 14 }}>
                <Gauge
                    value={team}
                    max={projection.total > 0 ? projection.total : Math.max(team, 1)}
                    size={narrow ? 100 : 120}
                    thickness={narrow ? 9 : 11}
                    color={pro.fantasy}
                    label={projection.known ? t('pro.fantasy.summary.ringLabel', { real: fmtPts(team), proj: fmtPts(projection.total) }) : t('pro.fantasy.summary.ringLabelNoProj', { real: fmtPts(team) })}
                >
                    <Txt size={10} weight="extrabold" tone="muted" style={{ letterSpacing: 1.2 }}>
                        {t('pro.fantasy.summary.real')}
                    </Txt>
                    <Num size={narrow ? 30 : 36}>
                        <CountUp value={team} format={(value) => fmtPts(value)} />
                    </Num>
                    {projection.known > 0 ? (
                        <Txt size={11} weight="semibold" tone="muted">
                            {`${t('pro.fantasy.summary.of')} `}
                            <Txt condensed size={15} tabular>
                                {fmtPts(projection.total)}
                            </Txt>
                            {` ${t('pro.fantasy.summary.proj')}`}
                        </Txt>
                    ) : (
                        <Txt size={10} weight="semibold" tone="muted" center style={{ maxWidth: 80, lineHeight: 12 }}>
                            {players.length ? t('pro.fantasy.summary.noProj') : t('pro.fantasy.summary.build')}
                        </Txt>
                    )}
                </Gauge>

                <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                    <View style={tile} accessible>
                        <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1, lineHeight: 14 }}>
                            {t('pro.fantasy.summary.rank')}
                        </Txt>
                        {rank ? (
                            <>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4 }}>
                                    <Num size={28}>{ordinal(rank.rank, lang)}</Num>
                                    <Txt size={12} tone="muted">
                                        {t('pro.fantasy.summary.ofFans', { count: rank.total })}
                                    </Txt>
                                </View>
                                <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                                    {top !== null ? t('pro.fantasy.summary.top', { pct: top }) : ''}
                                    {rank.toLeader > 0 ? ` · ${t('pro.fantasy.summary.toLeader', { pts: fmtPts(rank.toLeader) })}` : ` · ${t('pro.fantasy.summary.leader')}`}
                                </Txt>
                            </>
                        ) : rankPending ? (
                            <Skeleton height={24} width={80} round={12} style={{ marginTop: 4 }} />
                        ) : (
                            <Txt size={12} tone="muted" style={{ lineHeight: 16 }}>
                                {t('pro.fantasy.summary.noRank')}
                            </Txt>
                        )}
                    </View>
                    <View style={tile} accessible>
                        {prev ? (
                            <>
                                <Txt size={11} weight="extrabold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 1, lineHeight: 14 }}>
                                    {prev.label}
                                </Txt>
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                                    <Num size={28}>
                                        <CountUp value={prev.total} format={(value) => fmtPts(value)} />
                                    </Num>
                                    <Txt size={12} tone="muted">
                                        {t('pro.fantasy.pts')}
                                    </Txt>
                                </View>
                                <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                                    {t('pro.fantasy.summary.split', { team: fmtPts(prev.team), picks: fmtPts(prev.picks) })}
                                </Txt>
                            </>
                        ) : (
                            <>
                                <Txt size={11} weight="extrabold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 1, lineHeight: 14 }}>
                                    {t('pro.fantasy.summary.season')}
                                </Txt>
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                                    <Num size={28}>{fmtPts(season.points)}</Num>
                                    <Txt size={12} tone="muted">
                                        {t('pro.fantasy.pts')}
                                    </Txt>
                                </View>
                                <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                                    {t('pro.fantasy.summary.seasonDays', { count: season.days })}
                                </Txt>
                            </>
                        )}
                    </View>
                </View>
            </View>

            {picks > 0 && (
                <Txt size={12} weight="semibold" tone="muted" style={{ marginTop: -4 }}>
                    {t('pro.fantasy.summary.withPicks', { total: fmtPts(real), picks: fmtPts(picks) })}
                </Txt>
            )}

            {next && (
                <View style={{ gap: 8, borderRadius: radius.tile, backgroundColor: colors.raised, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Clock size={13} color={colors.muted} />
                                <Txt size={11} weight="extrabold" tone="muted" numberOfLines={1} style={{ flexShrink: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    {day.games.some((game) => gameStarted(game, now)) ? t('pro.fantasy.summary.nextLock') : t('pro.fantasy.summary.firstLock')}
                                </Txt>
                            </View>
                            <Txt size={14} weight="bold" style={{ lineHeight: 19 }}>
                                {t('pro.fantasy.summary.game', { away: next.away.abbrev, home: next.home.abbrev, time: formatTime(next.date, lang) })}
                            </Txt>
                        </View>
                        <View accessible accessibilityRole="timer" accessibilityLabel={t('pro.fantasy.summary.countdown', { hours, minutes })} style={{ flexDirection: 'row', alignItems: 'baseline', flexShrink: 0 }}>
                            {hours > 0 && (
                                <>
                                    <Num size={30}>{hours}</Num>
                                    <Txt size={15} weight="bold" tone="muted">
                                        h
                                    </Txt>
                                </>
                            )}
                            <Num size={30} style={hours > 0 ? { marginLeft: 6 } : undefined}>
                                {minutes}
                            </Num>
                            <Txt size={15} weight="bold" tone="muted">
                                min
                            </Txt>
                        </View>
                    </View>
                    {locks ? (
                        <Txt size={11} tone="muted" style={{ lineHeight: 16 }}>
                            {locks}
                        </Txt>
                    ) : null}
                </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                {save ? (
                    <View accessible accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
                        <save.Icon size={16} color={save.color} />
                        <Txt size={12} weight="semibold" color={save.color} style={{ flexShrink: 1 }}>
                            {t(`pro.fantasy.save.${saveStatus}`)}
                        </Txt>
                    </View>
                ) : (
                    <Txt size={12} tone="muted" style={{ flexShrink: 1 }}>
                        {saveStatus === 'closed' ? t('pro.fantasy.save.closed') : ''}
                    </Txt>
                )}
                <Pressable
                    onPress={onOpenSeason}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ marginRight: -8, minHeight: 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: radius.pill, paddingHorizontal: 8, backgroundColor: pressed ? alpha(colors.accent, 0.1) : 'transparent' })}
                >
                    <Txt size={12} weight="bold" tone="accentInk">
                        {t('pro.fantasy.season.open')}
                    </Txt>
                    <ChevronRight size={14} color={colors.accentInk} />
                </Pressable>
            </View>
        </GradientCard>
    );
};
