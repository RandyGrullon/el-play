// Perfil de un fanático (como FanProfile de la web): su temporada, sus últimos días, el equipo de hoy (a los demás
// se les esconde lo que no ha empezado) y los días anteriores, que al tocarlos muestran ese equipo.
import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Crown, Lock, Sparkles, User } from 'lucide-react-native';
import type { LeagueId } from '../../types';
import { useSession } from '../../lib/account';
import { RULES, entryKey, gameStarted, isLocked, pickPoints, pickResult, playerScore, teamPoints, useFantasyDay, useFantasyStore, type DayEntry, type FantasyPlayer } from '../../lib/fantasy';
import { formatTime, localeFor, seasonLabel, todayKey } from '../../lib/format';
import { useColors } from '../../theme/theme';
import { alpha, inkOn, radius, shadow } from '../../theme/tokens';
import { Card, ErrorState, Gradient, OfflineState, PlayerPhoto, Row, Skeleton, TeamLogo, Txt, useErrorText } from '../ui';
import { useFanEntry, useFanProfile, useSeasonRanking, withRanks, type FanDay } from './fans';
import { gameStatus, lineText, teamOf, useOpenPlayer } from './shared';
import { useLocalText } from './texts';

const round = (value: number) => Math.round(value * 10) / 10;
const initialOf = (name: string | null | undefined) => (name ? Array.from(name.trim())[0]?.toLocaleUpperCase() : '') || '';
const BRAND_PURPLE = '#6d28d9';

/** «vie, 16 oct» (los días vienen sin hora) */
const shortDay = (day: string, lang: string) => {
    const text = new Date(`${day}T12:00:00Z`).toLocaleDateString(localeFor(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Nombre que se ve arriba (la propia cuenta usa el de la sesión, que es el más nuevo) */
export const useFanName = (userId: string, league: LeagueId) => {
    const session = useSession();
    const own = session?.user.id === userId;
    const profile = useFanProfile(userId, league).data;
    const season = useSeasonRanking(league).data;
    const place = season?.ranking.find((row) => row.userId === userId);
    return { own, name: (own ? session?.name : null) || profile?.name || place?.name || null };
};

export const FanProfileView: React.FC<{ userId: string; league: LeagueId }> = ({ userId, league }) => {
    const { i18n } = useTranslation();
    const errorText = useErrorText();
    const L = useLocalText();
    const query = useFanProfile(userId, league);
    const season = useSeasonRanking(league);
    const today = useFantasyDay(league);
    const profile = query.data;
    const { own, name } = useFanName(userId, league);

    const ranked = useMemo(() => withRanks(season.data?.ranking ?? []), [season.data]);
    const place = ranked.find((row) => row.userId === userId);
    const todayDate = today.data?.date ?? todayKey();
    const days = profile?.days ?? [];
    const todayFan = days.find((day) => day.date === todayDate);
    const past = days.filter((day) => day.date < todayDate);
    const recent = days.slice(0, 10).reverse();
    const notFound = query.error && (query.error as { status?: number }).status === 404;

    return (
        <>
            {/* Cabecera: la inicial, el puesto y la temporada */}
            <View style={[{ borderRadius: radius.card }, shadow('float')]}>
                <Gradient style={{ borderRadius: radius.card, padding: 20, overflow: 'hidden' }}>
                    <View pointerEvents="none" style={{ position: 'absolute', right: -12, top: -12, opacity: 0.15 }}>
                        <Sparkles size={96} color="#fff" />
                    </View>
                    <Row gap={16}>
                        <View style={[{ width: 76, height: 76, borderRadius: 38, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, shadow('float')]}>
                            {initialOf(name) ? (
                                <Txt size={38} weight="extrabold" color={BRAND_PURPLE} style={{ lineHeight: 44 }}>
                                    {initialOf(name)}
                                </Txt>
                            ) : (
                                <User size={36} color={BRAND_PURPLE} />
                            )}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt eyebrow color="rgba(255,255,255,0.85)">
                                {own ? L('fans.yourProfile') : L('fans.eyebrow')}
                            </Txt>
                            <Txt size={26} weight="extrabold" tone="white" style={{ lineHeight: 29 }} accessibilityRole="header">
                                {name || L('fans.anonymous')}
                            </Txt>
                            <Txt size={14} weight="semibold" tone="white" style={{ marginTop: 2, opacity: 0.9 }}>
                                {place ? L('fans.rank', { rank: place.rank, season: season.data ? seasonLabel(season.data.season, league) : '' }) : season.isPending ? ' ' : L('fans.unranked')}
                            </Txt>
                        </View>
                    </Row>

                    {profile && (
                        <>
                            <Row gap={8} align="stretch" style={{ marginTop: 16 }}>
                                <Stat label={L('fans.seasonPoints')} value={round(profile.season.points)} />
                                <Stat label={L('fans.daysPlayed')} value={profile.season.days} />
                                <Stat label={L('fans.bestDay')} value={profile.season.best ? round(profile.season.best.points) : '—'} hint={profile.season.best ? shortDay(profile.season.best.date, i18n.language) : undefined} />
                            </Row>
                            {recent.length > 1 && <RecentBars days={recent} />}
                        </>
                    )}
                </Gradient>
            </View>

            {query.fetchStatus === 'paused' && !profile ? (
                <OfflineState />
            ) : query.isPending ? (
                <View style={{ gap: 12 }}>
                    <Skeleton height={20} width={120} round={10} />
                    <Skeleton height={220} />
                    <Skeleton height={140} />
                </View>
            ) : query.isError && !profile ? (
                <ErrorState message={notFound ? L('fans.notFound') : errorText(query.error)} onRetry={notFound ? undefined : () => query.refetch()} />
            ) : profile ? (
                <>
                    <View style={{ gap: 8 }}>
                        <Txt eyebrow accessibilityRole="header">
                            {own ? L('fans.yourTeamToday') : L('fans.teamToday')}
                        </Txt>
                        <DayDetail userId={userId} league={league} own={own} fanDay={todayFan} isToday />
                    </View>

                    <View style={{ gap: 8 }}>
                        <Txt eyebrow accessibilityRole="header">
                            {L('fans.pastDays')}
                        </Txt>
                        {past.length ? (
                            <Card padded={false} style={{ overflow: 'hidden' }}>
                                {past.map((day, index) => (
                                    <PastDay key={day.date} userId={userId} league={league} own={own} day={day} first={index === 0} />
                                ))}
                            </Card>
                        ) : (
                            <Card>
                                <Txt size={14} tone="muted">
                                    {own ? L('fans.noPastDaysOwn') : L('fans.noPastDays')}
                                </Txt>
                            </Card>
                        )}
                    </View>
                </>
            ) : null}
        </>
    );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => {
    // En pantallas angostas (320 px) la cifra se achica para que «212.5» quepa en una línea
    const narrow = useWindowDimensions().width < 360;
    return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: narrow ? 8 : 10, paddingVertical: 8 }}>
        <Txt size={11} weight="bold" tone="white" numberOfLines={1} style={{ opacity: 0.85 }}>
            {label}
        </Txt>
        <Txt size={narrow ? 20 : 26} weight="extrabold" tone="white" tabular numberOfLines={1} adjustsFontSizeToFit style={{ lineHeight: narrow ? 26 : 32 }}>
            {value}
        </Txt>
        {hint ? (
            <Txt size={11} weight="semibold" tone="white" numberOfLines={1} style={{ opacity: 0.85 }}>
                {hint}
            </Txt>
        ) : null}
    </View>
    );
};

/** Barras de los últimos días (del más viejo al más nuevo), como las del resumen del Fantasy */
const RecentBars: React.FC<{ days: FanDay[] }> = ({ days }) => {
    const { i18n } = useTranslation();
    const L = useLocalText();
    const max = Math.max(...days.map((day) => day.total), 1);
    const summary = days.map((day) => `${shortDay(day.date, i18n.language)}: ${round(day.total)}`).join(', ');
    return (
        <View style={{ marginTop: 16 }}>
            <Txt size={11} weight="bold" tone="white" style={{ opacity: 0.85, marginBottom: 6 }}>
                {L('fans.lastDays', { count: days.length })}
            </Txt>
            <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ height: 48, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                {days.map((day) => (
                    <View
                        key={day.date}
                        style={{ flex: 1, height: `${Math.max(8, (Math.max(0, day.total) / max) * 100)}%`, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: day.live ? '#fff' : 'rgba(255,255,255,0.7)' }}
                    />
                ))}
            </View>
        </View>
    );
};

// ---------------------------------------------------------------- días anteriores

const PastDay: React.FC<{ userId: string; league: LeagueId; own: boolean; day: FanDay; first: boolean }> = ({ userId, league, own, day, first }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [open, setOpen] = useState(false);
    return (
        <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
            <Pressable onPress={() => setOpen((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Row gap={8}>
                        <Txt weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {shortDay(day.date, i18n.language)}
                        </Txt>
                        {day.live && (
                            <View style={{ borderRadius: radius.pill, backgroundColor: alpha(colors.live, 0.1), paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Txt size={10} weight="extrabold" color={colors.live} style={{ textTransform: 'uppercase' }}>
                                    {t('fantasy.liveNow')}
                                </Txt>
                            </View>
                        )}
                    </Row>
                    <Txt size={12} tone="muted" numberOfLines={1}>
                        {t('fantasy.teamPts', { pts: round(day.team) })} · {t('fantasy.picksPts', { pts: round(day.picks) })}
                    </Txt>
                </View>
                <Txt size={20} weight="extrabold" tabular>
                    {round(day.total)}
                </Txt>
                <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                    <ChevronDown size={16} color={colors.faint} />
                </View>
            </Pressable>
            {open && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                    <DayDetail userId={userId} league={league} own={own} fanDay={day} date={day.date} flat />
                </View>
            )}
        </View>
    );
};

// ---------------------------------------------------------------- equipo de un día

interface DayDetailProps {
    userId: string;
    league: LeagueId;
    own: boolean;
    /** Lo que dice el perfil de ese día (respaldo si Supabase no responde) */
    fanDay?: FanDay;
    /** Sin fecha es hoy */
    date?: string;
    isToday?: boolean;
    /** Dentro de la lista de días: sin tarjeta propia */
    flat?: boolean;
}

/** Tarjeta del día (o, dentro de la lista de días, un recuadro sin sombra) */
const DayBox: React.FC<{ flat: boolean; children: React.ReactNode }> = ({ flat, children }) => {
    const colors = useColors();
    return flat ? <View style={{ borderRadius: 16, backgroundColor: alpha(colors.raised, 0.6), padding: 12, gap: 12 }}>{children}</View> : <Card style={{ gap: 12 }}>{children}</Card>;
};

/** Equipo y pronósticos de un día con sus puntos; a los demás no se les muestra lo que no ha empezado */
const DayDetail: React.FC<DayDetailProps> = ({ userId, league, own, fanDay, date, isToday = false, flat = false }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const errorText = useErrorText();
    const L = useLocalText();
    const openPlayer = useOpenPlayer();
    const dayQuery = useFantasyDay(league, date);
    const day = dayQuery.data;
    const key = date ?? day?.date;
    // La propia cuenta: lo del teléfono (lo más nuevo); los demás: lo de Supabase
    const store = useFantasyStore();
    const local = own && key ? store[entryKey(league, key)] : undefined;
    const useLocal = !!local && local.savedAt > 0;
    const remote = useFanEntry(userId, league, key, !useLocal);

    const entry: DayEntry | null = useLocal ? local! : (remote.data ?? (fanDay && remote.isError ? { lineup: fanDay.lineup, captain: fanDay.captain, picks: {}, savedAt: 0 } : null));
    const picksKnown = useLocal || !!remote.data;

    if (dayQuery.fetchStatus === 'paused' && !day) return <OfflineState />;
    if (dayQuery.isPending || (!useLocal && remote.isPending && !!key)) return <Skeleton height={flat ? 160 : 220} />;
    if (dayQuery.isError && !day) return <ErrorState message={errorText(dayQuery.error)} onRetry={() => dayQuery.refetch()} />;
    if (!day) return null;

    const note = (text: string) => (
        <DayBox flat={flat}>
            <Txt size={14} tone="muted">
                {text}
            </Txt>
        </DayBox>
    );
    if (!day.games.length && !entry?.lineup.length) return note(t('fantasy.noGames'));
    if (!entry || (!entry.lineup.length && !Object.keys(entry.picks).length && !(fanDay?.picksMade ?? 0))) {
        return note(isToday ? (own ? L('fans.noTeamTodayOwn') : L('fans.noTeamToday')) : L('fans.noTeamDay'));
    }

    const players = entry.lineup.map((id) => day.players.find((p) => p.id === id)).filter((p): p is FantasyPlayer => !!p);
    const hidden = (player: FantasyPlayer) => !own && !isLocked(day, player);
    const team = teamPoints(day, entry);
    const picks = picksKnown ? pickPoints(day, entry) : (fanDay?.picks ?? 0);
    const games = day.games.filter((game) => entry.picks[game.gamePk] || game.state !== 'preview');

    return (
        <DayBox flat={flat}>
            <Row justify="space-between" align="flex-end" gap={12}>
                <Txt size={12} weight="semibold" tone="muted" style={{ flex: 1 }}>
                    {t('fantasy.teamPts', { pts: team })} · {t('fantasy.picksPts', { pts: picks })}
                </Txt>
                <Row gap={4} align="flex-end">
                    <Txt size={28} weight="extrabold" tabular style={{ lineHeight: 30 }}>
                        {round(team + picks)}
                    </Txt>
                    <Txt size={12} weight="bold" tone="muted" style={{ marginBottom: 3 }}>
                        {L('fans.pts')}
                    </Txt>
                </Row>
            </Row>

            {players.length > 0 && (
                <View>
                    {players.map((player, index) => {
                        const border = { borderTopWidth: index ? 1 : 0, borderTopColor: colors.line };
                        if (hidden(player)) {
                            return (
                                <Row key={player.id} gap={12} style={[{ paddingVertical: 8 }, border]}>
                                    <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised }}>
                                        <Lock size={16} color={colors.faint} />
                                    </View>
                                    <Txt size={14} weight="semibold" tone="muted" style={{ flex: 1 }}>
                                        {L('fans.hidden')}
                                    </Txt>
                                </Row>
                            );
                        }
                        const club = day.teams[player.teamId];
                        const line = lineText(player, t);
                        const captain = entry.captain === player.id;
                        return (
                            <Pressable
                                key={player.id}
                                onPress={() => openPlayer(player.id)}
                                accessibilityRole="button"
                                accessibilityLabel={t('statsPage.viewPlayer', { name: player.name })}
                                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, opacity: pressed ? 0.7 : 1 }, border]}
                            >
                                <PlayerPhoto personId={player.id} name={player.name} size={44} team={teamOf(day, player)} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Row gap={6}>
                                        {captain && <Crown size={16} color={colors.gold} accessibilityLabel={t('fantasy.captain')} />}
                                        <Txt size={14} weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>
                                            {player.name}
                                        </Txt>
                                    </Row>
                                    <Txt size={12} tone="muted" numberOfLines={1}>
                                        {club?.abbrev} · {player.role === 'P' ? t('fantasy.pitcher') : player.pos || t('fantasy.batter')} · {gameStatus(day, player.gamePk, i18n.language, t)}
                                        {line ? ` · ${line}` : ''}
                                    </Txt>
                                </View>
                                <Txt size={20} weight="extrabold" tabular>
                                    {playerScore(entry, player)}
                                </Txt>
                            </Pressable>
                        );
                    })}
                </View>
            )}

            {picksKnown && games.length > 0 && (
                <View style={{ gap: 8 }}>
                    <Txt eyebrow>{t('fantasy.picks')}</Txt>
                    {games.map((game) => {
                        const pick = entry.picks[game.gamePk];
                        // Como los peloteros: se revela al empezar el juego o al llegar su hora
                        const secret = !own && !gameStarted(game);
                        const result = pickResult(game, entry);
                        return (
                            <View key={game.gamePk} style={[{ borderRadius: 16, backgroundColor: colors.surface, padding: 8, gap: 6 }, shadow('card')]}>
                                <Row justify="space-between" style={{ paddingHorizontal: 4 }}>
                                    <Txt size={11} weight="semibold" tone="muted">
                                        {game.state === 'preview' ? formatTime(game.date, i18n.language) : game.state === 'final' ? t('fantasy.final') : t('fantasy.liveNow')}
                                    </Txt>
                                    {result === 'win' && (
                                        <Txt size={11} weight="extrabold" color={colors.ball}>
                                            +{RULES.pick}
                                        </Txt>
                                    )}
                                    {result === 'loss' && (
                                        <Txt size={11} weight="extrabold" color={colors.live}>
                                            0
                                        </Txt>
                                    )}
                                    {!pick && (
                                        <Txt size={11} weight="semibold" tone="muted">
                                            {t('fantasy.noPick')}
                                        </Txt>
                                    )}
                                </Row>
                                {secret ? (
                                    <Row gap={8} style={{ borderRadius: 12, backgroundColor: colors.raised, paddingHorizontal: 10, paddingVertical: 8 }}>
                                        <Lock size={14} color={colors.muted} />
                                        <Txt size={12} weight="semibold" tone="muted" style={{ flex: 1 }}>
                                            {game.away.abbrev} @ {game.home.abbrev} · {L('fans.hidden')}
                                        </Txt>
                                    </Row>
                                ) : (
                                    <Row gap={6}>
                                        {[game.away, game.home].map((side) => {
                                            const chosen = pick === side.id;
                                            const ink = chosen ? inkOn(side.color) : colors.ink;
                                            return (
                                                <Row
                                                    key={side.id}
                                                    gap={8}
                                                    style={{ flex: 1, minWidth: 0, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: chosen ? side.color : colors.raised, opacity: pick && !chosen ? 0.6 : 1 }}
                                                >
                                                    <TeamLogo team={side} size={24} />
                                                    <Txt size={14} weight="extrabold" color={ink} numberOfLines={1} style={{ flex: 1 }}>
                                                        {side.abbrev}
                                                    </Txt>
                                                    {game.state !== 'preview' && (
                                                        <Txt size={12} weight="bold" color={ink} tabular style={{ opacity: 0.8 }}>
                                                            {side.score ?? 0}
                                                        </Txt>
                                                    )}
                                                </Row>
                                            );
                                        })}
                                    </Row>
                                )}
                            </View>
                        );
                    })}
                </View>
            )}
        </DayBox>
    );
};
