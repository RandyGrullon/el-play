import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Radio, X } from 'lucide-react-native';
import type { ScheduleGame } from '../types';
import { inningName } from '../lib/baseball';
import { formatShortDate, formatTime } from '../lib/format';
import { usePrefetchGame, useSchedule } from '../lib/queries';
import { useLeague } from '../state/league';
import { useColors } from '../theme/theme';
import { radius, shadow } from '../theme/tokens';
import { ErrorState, OfflineState, Row, Skeleton, TeamLogo, Txt, useErrorText } from '../components/ui';
import { Bases } from '../components/game/Bases';
import { PulseDot } from '../components/feed/PulseDot';
import { waitingForNetwork } from '../components/feed/DayChips';
import { useNow } from '../components/feed/useNow';

const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
};

// Modal del botón rojo de la barra: los juegos en vivo de la liga; si no hay, los próximos tres
export default function LiveGamesScreen() {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const errorText = useErrorText();
    const { activeLeague } = useLeague();
    const schedule = useSchedule(activeLeague);
    const prefetch = usePrefetchGame();
    const now = useNow();
    const games = schedule.data?.games ?? [];
    const live = games.filter((game) => game.state === 'live');
    const next = games
        .filter((game) => game.state === 'preview' && new Date(game.date).getTime() > now)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3);
    const list = live.length ? live : next;

    // El juego toma el lugar del modal: al volver se llega a la portada
    const open = (game: ScheduleGame) => router.replace(`/juego/${game.gamePk}`);

    const row = (game: ScheduleGame) => {
        const isLive = game.state === 'live' && game.live;
        return (
            <Pressable
                key={game.gamePk}
                onPress={() => open(game)}
                onPressIn={() => prefetch(game.gamePk).catch(() => undefined)}
                accessibilityRole="link"
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, backgroundColor: colors.surface, padding: 12, opacity: pressed ? 0.85 : 1 }, shadow('card')]}
            >
                <TeamLogo team={game.away} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt weight="bold" numberOfLines={1}>
                        {game.away.abbrev} {game.away.score ?? ''}{' '}
                        <Txt weight="bold" tone="muted">
                            ·
                        </Txt>{' '}
                        {game.home.abbrev} {game.home.score ?? ''}
                    </Txt>
                    {isLive && game.live?.batter ? (
                        <Txt size={12} tone="muted" numberOfLines={1}>
                            {t('card.batting', { name: game.live.batter.name })}
                        </Txt>
                    ) : !isLive ? (
                        <Txt size={12} tone="muted" numberOfLines={1}>
                            {formatShortDate(game.date, i18n.language)}
                        </Txt>
                    ) : null}
                </View>
                {isLive && game.live && game.live.inningState !== 'Middle' && game.live.inningState !== 'End' && <Bases runners={game.live.runners} size={24} color={(game.live.isTop ? game.away : game.home).color} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: isLive ? colors.live : colors.raised }}>
                    {isLive && <PulseDot color="#fff" />}
                    <Txt size={12} weight="bold" color={isLive ? '#fff' : colors.muted}>
                        {isLive && game.live ? inningName({ n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState }, i18n.language, true) : formatTime(game.date, i18n.language)}
                    </Txt>
                </View>
                <TeamLogo team={game.home} size={36} />
            </Pressable>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
                <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.faint, opacity: 0.5 }} />
            </View>
            <Row justify="space-between" style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
                <Row gap={10} style={{ flex: 1 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.live, alignItems: 'center', justifyContent: 'center' }}>
                        <Radio size={16} color="#fff" />
                    </View>
                    <Txt size={20} weight="extrabold" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
                        {live.length ? t('live.title') : t('live.noneTitle')}
                    </Txt>
                </Row>
                <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                    <X size={18} color={colors.ink} />
                </Pressable>
            </Row>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 8 }}>
                {waitingForNetwork(schedule) ? (
                    <OfflineState />
                ) : schedule.isPending ? (
                    [0, 1, 2].map((index) => <Skeleton key={index} height={64} round={radius.tile} />)
                ) : schedule.isError && !schedule.data ? (
                    <ErrorState message={errorText(schedule.error)} onRetry={() => schedule.refetch()} />
                ) : (
                    <>
                        {!live.length && (
                            <Txt size={14} tone="muted" style={{ marginBottom: 4 }}>
                                {next.length ? t('live.next') : t('live.nothing')}
                            </Txt>
                        )}
                        {list.map(row)}
                    </>
                )}
            </ScrollView>
        </View>
    );
}
