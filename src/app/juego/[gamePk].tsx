import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bell, BellRing, CircleCheck, CloudSun, ListOrdered, MapPin, SearchX, Share2, Table2, Target } from 'lucide-react-native';
import type { GameDetail, TopPerformer } from '../../types';
import { findScheduledGame, useGame } from '../../lib/queries';
import { ApiError } from '../../lib/api';
import { atBatForZone, inningBreak, isNotPlayed } from '../../lib/baseball';
import { formatCountdown, formatShortDate, formatTime, lastName } from '../../lib/format';
import { STALE_READ_MS, forMode, playsSince, queuePlays, type PlayEvent } from '../../lib/playEvents';
import { useIsPro } from '../../lib/pro';
import { teamDisplayName } from '../../lib/teams';
import { toggleFollow, useFollow, useFollowSync } from '../../lib/follow';
import { showToast } from '../../lib/toast';
import { useLeague } from '../../state/league';
import { usePreferences } from '../../state/preferences';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { Screen } from '../../components/layout';
import { Card, ErrorState, OfflineState, PlayerPhoto, Row, Sheet, Skeleton, TeamLogo, Txt, useErrorText } from '../../components/ui';
import { GameHero, goBack, heroFromDetail, heroFromSchedule } from '../../components/gamecast/GameHero';
import { Timeline } from '../../components/gamecast/Timeline';
import { StoryRecap } from '../../components/gamecast/StoryRecap';
import { PlayAnimation } from '../../components/gamecast/PlayAnimation';
import { Bases, OutsDots } from '../../components/game/Bases';
import { StrikeZone } from '../../components/game/StrikeZone';
import { StrikeZonePanel } from '../../components/game/StrikeZonePanel';
import { uniformColors } from '../../components/game/BatterFigure';
import { SprayChart } from '../../components/game/SprayChart';
import { Matchup } from '../../components/game/Matchup';
import { InningBreakMini } from '../../components/game/InningBreak';
import { PlayByPlay } from '../../components/game/PlayByPlay';
import { BoxScore } from '../../components/game/BoxScore';
import { ProGame } from '../../components/pro/juego/ProGame';
import { HeroPulse, ProScoreBar } from '../../components/pro/juego/vivo/ScoreBar';
import { ProGameScroll, ProScrollProvider, useProScrollState } from '../../components/pro/juego/vivo/scroll';
import { useAlertToggle } from '../../components/feed/alerts';
import { capitalize, waitingForNetwork } from '../../components/feed/DayChips';
import { useNow } from '../../components/feed/useNow';
import { useShare } from '../../components/share/ShareSheet';
import { playerFromPerformer, resultFromGame } from '../../components/share/subjects';

type SheetName = 'zone' | 'plays' | 'box' | null;

const ActionButton: React.FC<{ icon: (color: string) => React.ReactNode; label: string; onPress: () => void; primary?: boolean }> = ({ icon, label, onPress, primary }) => {
    const colors = useColors();
    const ink = primary ? colors.bg : colors.ink;
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={({ pressed }) => [
                { flex: 1, height: 48, borderRadius: radius.tile, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8, backgroundColor: primary ? colors.ink : colors.surface, opacity: pressed ? 0.85 : 1 },
                !primary && shadow('card')
            ]}
        >
            {icon(ink)}
            <Txt size={14} weight="bold" color={ink} numberOfLines={2} style={{ flexShrink: 1, lineHeight: 17, textAlign: 'center' }}>
                {label}
            </Txt>
        </Pressable>
    );
};

// Textos del segundo plano (la web no lo tiene: no están en los JSON)
const FOLLOW_TEXTS = {
    es: {
        follow: 'Seguir en segundo plano',
        stop: 'Dejar de seguir',
        hintIos: 'Lleva el marcador a la pantalla de bloqueo y a la isla dinámica. Se quita sola al final.',
        hintAndroid: 'Lleva el marcador a una notificación fija. Se quita sola al final.',
        followingIos: 'Siguiendo en tu pantalla de bloqueo hasta el final.',
        followingAndroid: 'Siguiendo en la notificación hasta el final.',
        on: 'Listo: el juego sigue fuera de la app.',
        blockedIos: 'Activa las Actividades en vivo de El Play en Ajustes.',
        blockedAndroid: 'Tienes los avisos bloqueados. Actívalos para El Play en Ajustes.',
        error: 'No se pudo seguir el juego. Inténtalo otra vez.',
        settings: 'Ajustes'
    },
    en: {
        follow: 'Follow in the background',
        stop: 'Stop following',
        hintIos: 'Puts the score on your Lock Screen and in the Dynamic Island. It goes away when the game ends.',
        hintAndroid: 'Puts the score in a pinned notification. It goes away when the game ends.',
        followingIos: 'Following on your Lock Screen until the end.',
        followingAndroid: 'Following in the notification until the end.',
        on: 'Done: the game follows you outside the app.',
        blockedIos: 'Turn on Live Activities for El Play in Settings.',
        blockedAndroid: 'Notifications are off. Turn them on for El Play in Settings.',
        error: "Couldn't follow the game. Try again.",
        settings: 'Settings'
    }
};

// Seguir el juego fuera de la app (Live Activity / notificación fija). En la web y en Expo Go no sale.
const FollowButton: React.FC<{ game: GameDetail }> = ({ game }) => {
    const { i18n } = useTranslation();
    const colors = useColors();
    const { supported, following, busy } = useFollow(game.gamePk);
    if (!supported) return null;
    const words = i18n.language.startsWith('en') ? FOLLOW_TEXTS.en : FOLLOW_TEXTS.es;
    const ios = Platform.OS === 'ios';
    const green = '#34c778';
    const onPress = async () => {
        const result = await toggleFollow(game);
        if (result === 'on') showToast(words.on, undefined, 3500);
        else if (result === 'blocked') showToast(ios ? words.blockedIos : words.blockedAndroid, { label: words.settings, run: () => Linking.openSettings().catch(() => undefined) }, 9000);
        else if (result === 'error') showToast(words.error, undefined, 4000);
    };
    let hint = ios ? words.hintIos : words.hintAndroid;
    if (following) hint = ios ? words.followingIos : words.followingAndroid;

    return (
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 8 }}>
            <Pressable
                onPress={onPress}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ busy, selected: following }}
                style={({ pressed }) => ({
                    height: 52,
                    borderRadius: radius.pill,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    paddingHorizontal: 16,
                    backgroundColor: following ? 'transparent' : colors.accent,
                    borderWidth: following ? 1.5 : 0,
                    borderColor: green,
                    opacity: pressed || busy ? 0.75 : 1
                })}
            >
                {following ? <CircleCheck size={18} color={green} /> : <BellRing size={18} color="#fff" />}
                <Txt size={15} weight="bold" color={following ? colors.ink : '#fff'}>
                    {following ? words.stop : words.follow}
                </Txt>
            </Pressable>
            <Txt size={12} tone="muted" center>
                {hint}
            </Txt>
        </View>
    );
};

// En vivo: situación + mini zona flotando sobre la cabecera, cronología tipo chat, mapa de batazos y botones
const LiveView: React.FC<{ game: GameDetail; open: (sheet: SheetName) => void; onShare: () => void }> = ({ game, open, onShare }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { atBat } = atBatForZone(game);
    const batting = game.inning?.isTop ? game.away : game.home;
    const between = game.inning?.state === 'Middle' || game.inning?.state === 'End';
    // Tras el tercer out, hasta el primer bateador de la otra mitad: la zona espera y la situación dice quién abre
    const pause = inningBreak(game);
    const leadoff = pause?.dueUp[0] ?? null;
    // En teléfonos angostos la mini zona y las bases se achican para que quepa el duelo
    const narrow = useWindowDimensions().width < 360;

    return (
        <>
            <View style={{ flexDirection: 'row', gap: narrow ? 8 : 12, paddingHorizontal: 16, marginTop: -20, zIndex: 10 }}>
                <View
                    style={[{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: narrow ? 6 : 8, borderRadius: 24, backgroundColor: colors.surface, paddingHorizontal: narrow ? 8 : 12, paddingVertical: 14 }, shadow('float')]}
                    accessibilityLabel={t('game.countAria', { balls: game.count.balls, strikes: game.count.strikes, outs: game.count.outs })}
                >
                    <Bases runners={game.runners} size={narrow ? 38 : 48} color={batting.color} />
                    <View style={{ alignItems: 'center' }}>
                        <Txt size={narrow ? 24 : 28} weight="extrabold" tabular style={{ lineHeight: 30 }}>
                            {between ? '—' : `${game.count.balls}-${game.count.strikes}`}
                        </Txt>
                        <OutsDots outs={game.count.outs} style={{ marginTop: 6 }} />
                    </View>
                    {pause ? (
                        <View style={{ minWidth: 0, flexShrink: 1, alignItems: 'center' }}>
                            <Txt size={14} weight="bold" numberOfLines={1}>
                                {leadoff ? lastName(leadoff.name) : pause.next.abbrev}
                            </Txt>
                            <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} center>
                                {leadoff ? t('zone.breakLeadsOff', { team: pause.next.abbrev }) : t('zone.breakStatus')}
                            </Txt>
                        </View>
                    ) : game.matchup && (
                        <View style={{ minWidth: 0, flexShrink: 1, alignItems: 'center' }}>
                            <Txt size={14} weight="bold" numberOfLines={1}>
                                {lastName(game.matchup.batter.name)}
                            </Txt>
                            <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} center>
                                {t('zone.facing')} {lastName(game.matchup.pitcher.name)}
                            </Txt>
                        </View>
                    )}
                </View>
                <Pressable onPress={() => open('zone')} accessibilityRole="button" accessibilityLabel={t('zone.open')} style={[{ width: narrow ? 84 : 104, borderRadius: 24, backgroundColor: colors.surface, padding: 6, justifyContent: 'center' }, shadow('float')]}>
                    {pause ? (
                        <InningBreakMini pause={pause} />
                    ) : atBat ? (
                        <StrikeZone pitches={atBat.pitches} batterSide={atBat.batter.side} uniform={uniformColors(atBat.top ? game.away : game.home, !atBat.top)} showLegend={false} />
                    ) : (
                        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                            <Target size={32} color={colors.faint} />
                        </View>
                    )}
                </Pressable>
            </View>

            <FollowButton game={game} />

            <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
                <Timeline game={game} onMore={() => open('plays')} />
            </View>
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <SprayChart game={game} />
            </View>
            <Row gap={8} style={{ paddingHorizontal: 16, paddingTop: 20 }}>
                <ActionButton icon={(color) => <Table2 size={16} color={color} />} label={t('game.tabs.box')} onPress={() => open('box')} />
                <ActionButton icon={(color) => <Target size={16} color={color} />} label={t('zone.full')} onPress={() => open('zone')} />
                <ActionButton icon={(color) => <Share2 size={16} color={color} />} label={t('share.short')} onPress={onShare} primary />
            </Row>
        </>
    );
};

const FinalView: React.FC<{ game: GameDetail; open: (sheet: SheetName) => void; onShare: () => void; onSharePerformer: (performer: TopPerformer) => void }> = ({ game, open, onShare, onSharePerformer }) => {
    const { t } = useTranslation();
    return (
        <View style={{ gap: 16, paddingHorizontal: 16, paddingTop: 16 }}>
            <StoryRecap game={game} onSharePerformer={onSharePerformer} />
            <SprayChart game={game} />
            <Row gap={8}>
                <ActionButton icon={(color) => <ListOrdered size={16} color={color} />} label={t('game.tabs.plays')} onPress={() => open('plays')} />
                <ActionButton icon={(color) => <Table2 size={16} color={color} />} label={t('game.tabs.box')} onPress={() => open('box')} />
                <ActionButton icon={(color) => <Share2 size={16} color={color} />} label={t('share.short')} onPress={onShare} primary />
            </Row>
        </View>
    );
};

const PreviewView: React.FC<{ game: GameDetail; onShare: () => void }> = ({ game, onShare }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const { subscribedGames } = usePreferences();
    const toggleAlert = useAlertToggle();
    const gamePk = game.gamePk ?? 0;
    const subscribed = subscribedGames.includes(gamePk);
    const notPlayed = isNotPlayed(game.detailedState);
    const now = useNow();
    const startsIn = game.date ? new Date(game.date).getTime() - now : 0;

    return (
        <View style={{ gap: 12, paddingHorizontal: 16, paddingTop: 16 }}>
            <Card>
                <Txt eyebrow style={{ marginBottom: 12 }} accessibilityRole="header">
                    {t('preview.probables')}
                </Txt>
                <View style={{ gap: 12 }}>
                    {(['away', 'home'] as const).map((side) => {
                        const pitcher = game.probables[side];
                        return (
                            <Pressable key={side} disabled={!pitcher} onPress={() => pitcher && router.push(`/jugador/${pitcher.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                {pitcher ? (
                                    <PlayerPhoto personId={pitcher.id} name={pitcher.name} size={56} background={alpha(game[side].color, 0.2)} team={game[side]} />
                                ) : (
                                    <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(game[side].color, 0.13) }}>
                                        <TeamLogo team={game[side]} size={38} />
                                    </View>
                                )}
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Txt weight="extrabold" numberOfLines={1}>
                                        {pitcher?.name ?? t('preview.tbd')}
                                    </Txt>
                                    <Txt size={14} tone="muted" numberOfLines={1}>
                                        {teamDisplayName(game[side], i18n.language)}
                                    </Txt>
                                </View>
                                {pitcher && (
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Txt size={14} weight="bold" tabular>
                                            {pitcher.wins !== null ? `${pitcher.wins}-${pitcher.losses ?? 0}` : '—'}
                                        </Txt>
                                        <Txt size={12} tone="muted" tabular>
                                            {t('stats.era')} {pitcher.era ?? '—'}
                                        </Txt>
                                    </View>
                                )}
                            </Pressable>
                        );
                    })}
                </View>
                {/* MLB no recibe los abridores de LIDOM: se dice en vez de dejar el hueco (no en pospuestos ni cancelados) */}
                {!notPlayed && !game.probables.away && !game.probables.home && (
                    <Txt size={14} tone="muted" style={{ marginTop: 12 }}>
                        {t('preview.probablesLater')}
                    </Txt>
                )}
            </Card>

            <Card style={{ gap: 10 }}>
                {game.date && (
                    <Txt weight="bold">
                        {capitalize(formatShortDate(game.date, i18n.language))} · {formatTime(game.date, i18n.language)}
                        {startsIn > 0 && !notPlayed ? (
                            <Txt weight="semibold" tone="muted">
                                {'  '}
                                {formatCountdown(startsIn, i18n.language)}
                            </Txt>
                        ) : null}
                    </Txt>
                )}
                {game.venue ? (
                    <Row gap={8}>
                        <MapPin size={16} color={colors.muted} />
                        <Txt size={14} tone="muted" style={{ flexShrink: 1 }}>
                            {game.venue}
                        </Txt>
                    </Row>
                ) : null}
                {game.weather && (
                    <Row gap={8}>
                        <CloudSun size={16} color={colors.muted} />
                        <Txt size={14} tone="muted">
                            {game.weather.condition}
                            {game.weather.temp ? ` · ${game.weather.temp}°F` : ''}
                        </Txt>
                    </Row>
                )}
            </Card>

            {/* Pospuesto o cancelado: ni aviso ni Compartir (saldría «0 - 0») */}
            {!notPlayed && (
                <Row gap={8}>
                    {game.date && (
                        <ActionButton
                            icon={(color) => (subscribed ? <BellRing size={16} color={color} /> : <Bell size={16} color={color} />)}
                            label={subscribed ? t('preview.notifyOff') : t('preview.notifyOn')}
                            onPress={() => toggleAlert({ gamePk, date: game.date!, away: game.away, home: game.home })}
                        />
                    )}
                    <ActionButton icon={(color) => <Share2 size={16} color={color} />} label={t('share.short')} onPress={onShare} primary />
                </Row>
            )}
        </View>
    );
};

// Pantalla del juego: igual que GamePage de la web
export default function GameScreen() {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const errorText = useErrorText();
    const { gamePk } = useLocalSearchParams<{ gamePk: string }>();
    const client = useQueryClient();
    const query = useGame(gamePk);
    const game = query.data;
    const scheduled = useMemo(() => findScheduledGame(client, gamePk), [client, gamePk]);
    const { leagueConfig } = useLeague();
    const { share, sheet: shareSheet } = useShare();
    const [sheet, setSheet] = useState<SheetName>(null);
    const { animationMode, favoriteTeamId } = usePreferences();
    // Modo PRO (cuenta abierta + PRO en «Más»): debajo de la misma cabecera va el juego PRO; el Lite queda igual
    const pro = useIsPro();
    // PRO: el scroll va en un shared value para la barra de mando y las pestañas pegadas (el Lite usa Screen igual que antes)
    const scrollState = useProScrollState();
    const previous = useRef<{ game: GameDetail; at: number } | null>(null);
    const shown = useRef(new Set<string>());
    const [plays, setPlays] = useState<PlayEvent[]>([]);
    const readAt = query.dataUpdatedAt;
    // Si este juego se sigue en segundo plano, cada lectura nueva va a la pantalla bloqueada / notificación
    useFollowSync(game, readAt);

    // Jugadas nuevas entre una lectura del juego y la siguiente → animación (en cola si llegan juntas). Corre en cada
    // lectura: si la anterior es vieja (volvió de segundo plano) o la app no está a la vista, no repite jugadas pasadas.
    useEffect(() => {
        if (!game) return;
        const before = previous.current;
        previous.current = { game, at: readAt };
        const events = playsSince(before, game, readAt, AppState.currentState === 'background');
        const fresh = forMode(events, animationMode, favoriteTeamId, [game.away.id, game.home.id]).filter((play) => !shown.current.has(play.key));
        if (!fresh.length) return;
        fresh.forEach((play) => shown.current.add(play.key));
        setPlays((queue) => queuePlays(queue, fresh));
    }, [game, readAt, animationMode, favoriteTeamId]);

    // Al volver tras un rato fuera, la cola ya es vieja (y en iOS la que se veía quedó congelada a medias): se vacía.
    // Una salida corta (centro de control, una llamada) no la toca.
    useEffect(() => {
        let leftAt: number | null = null;
        const subscription = AppState.addEventListener('change', (status) => {
            if (status !== 'active') {
                leftAt ??= Date.now();
                return;
            }
            if (leftAt !== null && Date.now() - leftAt > STALE_READ_MS) setPlays([]);
            leftAt = null;
        });
        return () => subscription?.remove();
    }, []);

    const leagueName = t(`leagues.${game?.league ?? leagueConfig.id}.name`);
    const shareGame = () =>
        game &&
        share({
            data: resultFromGame(game, leagueName, t, i18n.language),
            fileName: `el-play-${game.away.abbrev}-${game.home.abbrev}`.toLowerCase(),
            text: `${game.away.name} ${game.away.runs} - ${game.home.runs} ${game.home.name} · El Play`,
            path: game.gamePk ? `/juego/${game.gamePk}` : undefined
        });
    const sharePerformer = (performer: TopPerformer) =>
        game &&
        share({
            data: playerFromPerformer(performer, game, leagueName, t, i18n.language),
            fileName: `el-play-${performer.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            text: `${performer.name} · El Play`,
            path: game.gamePk ? `/juego/${game.gamePk}` : undefined
        });

    const model = game ? heroFromDetail(game) : scheduled ? heroFromSchedule(scheduled) : null;
    // Juego que no existe o enlace roto: se dice claro y se ofrece volver
    const notFoundCode = !game && query.error instanceof ApiError && ['game_not_found', 'invalid_game'].includes(query.error.code) ? query.error.code : null;
    const title = game ? `${game.away.abbrev} ${game.away.runs}-${game.home.runs} ${game.home.abbrev} · El Play` : 'El Play';
    const notPlayed = !!game && isNotPlayed(game.detailedState);

    let body: React.ReactNode;
    if (notFoundCode) {
        body = (
            <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 16 }}>
                <Card style={{ alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 40 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                        <SearchX size={24} color={colors.muted} />
                    </View>
                    <Txt size={18} weight="extrabold" center accessibilityRole="alert">
                        {t(`errors.${notFoundCode}`)}
                    </Txt>
                    <Txt size={14} tone="muted" center style={{ maxWidth: 300 }}>
                        {t('game.notFoundHint')}
                    </Txt>
                    <Pressable onPress={() => router.replace('/')} accessibilityRole="link" style={{ marginTop: 4, height: 44, borderRadius: radius.pill, backgroundColor: colors.accent, paddingHorizontal: 20, justifyContent: 'center' }}>
                        <Txt size={14} weight="bold" tone="white">
                            {t('game.backToGames')}
                        </Txt>
                    </Pressable>
                    <Pressable onPress={goBack} accessibilityRole="button" hitSlop={8}>
                        <Txt size={14} weight="semibold" tone="muted">
                            {t('game.back')}
                        </Txt>
                    </Pressable>
                </Card>
            </View>
        );
    } else if (waitingForNetwork(query) && !game) {
        body = (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <OfflineState />
            </View>
        );
    } else if (query.isError && !game) {
        body = (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <ErrorState message={errorText(query.error)} onRetry={() => query.refetch()} />
            </View>
        );
    } else if (!game) {
        body = (
            <View style={{ gap: 12, paddingHorizontal: 16, paddingTop: 16 }}>
                <Skeleton height={110} />
                <Skeleton height={260} />
            </View>
        );
    } else if (pro) body = <ProGame game={game} onShare={shareGame} onSharePerformer={sharePerformer} fetchedAt={readAt} follow={<FollowButton game={game} />} />;
    else if (game.state === 'live') body = <LiveView game={game} open={setSheet} onShare={shareGame} />;
    // MLB da los pospuestos y cancelados como «final»: van con la previa (sin resumen ni marcador 0 - 0)
    else if (game.state === 'final' && !notPlayed) body = <FinalView game={game} open={setSheet} onShare={shareGame} onSharePerformer={sharePerformer} />;
    else body = <PreviewView game={game} onShare={shareGame} />;

    const hero = model ? <GameHero model={model} onShare={game && !notPlayed ? shareGame : undefined} /> : notFoundCode ? null : <HeroSkeleton />;
    const liveGame = game?.state === 'live' ? game : null;
    const contentStyle = { paddingTop: 0, gap: 0, paddingBottom: insets.bottom + 40 };

    return (
        <ProScrollProvider value={scrollState}>
            <View style={{ flex: 1, backgroundColor: colors.bg }}>
                <Stack.Screen options={{ title }} />
                {pro ? (
                    <ProGameScroll state={scrollState} onRefresh={() => query.refetch()} contentStyle={contentStyle}>
                        {/* En vivo, la mitad del equipo que anota destella sobre la cabecera de siempre */}
                        {liveGame && hero ? (
                            <View>
                                {hero}
                                <HeroPulse game={liveGame} />
                            </View>
                        ) : (
                            hero
                        )}
                        {body}
                    </ProGameScroll>
                ) : (
                    <Screen padded={false} onRefresh={() => query.refetch()} contentStyle={contentStyle}>
                        {hero}
                        {body}
                    </Screen>
                )}
                {pro && liveGame && <ProScoreBar game={liveGame} fetchedAt={readAt} />}

                {plays[0] && <PlayAnimation key={plays[0].key} event={plays[0]} onDone={() => setPlays((queue) => queue.slice(1))} />}

                {game && (
                    <>
                        <Sheet open={sheet === 'zone'} onClose={() => setSheet(null)} title={t('zone.title')}>
                            <StrikeZonePanel game={game} />
                            {/* En la pausa entre entradas el duelo es el del último out: la zona ya dice a quién le toca */}
                            {!inningBreak(game) && <Matchup game={game} />}
                        </Sheet>
                        <Sheet open={sheet === 'plays'} onClose={() => setSheet(null)} title={t('plays.title')}>
                            <PlayByPlay game={game} />
                        </Sheet>
                        <Sheet open={sheet === 'box'} onClose={() => setSheet(null)} title={t('game.tabs.box')}>
                            <BoxScore game={game} />
                        </Sheet>
                    </>
                )}
                {shareSheet}
            </View>
        </ProScrollProvider>
    );
}

/** Mientras carga y no hay tarjeta del calendario en caché: el hueco de la cabecera con el botón atrás */
const HeroSkeleton: React.FC = () => {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    return (
        <View>
            <Skeleton height={insets.top + 200} round={0} />
            <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel={t('game.back')} style={{ position: 'absolute', left: 12, top: insets.top + 12, width: 44, height: 44, borderRadius: radius.tile, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeft size={20} color="#14151a" />
            </Pressable>
        </View>
    );
};
