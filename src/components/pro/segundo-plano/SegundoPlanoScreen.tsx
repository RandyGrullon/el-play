import React from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Lock } from 'lucide-react-native';
import type { GameDetail, ScheduleGame } from '../../../types';
import { liveGameProps } from '../../../live/props';
import { useFollowedGame } from '../../../lib/follow';
import { formatLongDate, formatTime, todayKey } from '../../../lib/format';
import { useIsPro } from '../../../lib/pro';
import { useWinProb } from '../../../lib/pro/juego';
import { useGame, useSchedule } from '../../../lib/queries';
import { useLeague } from '../../../state/league';
import { usePreferences } from '../../../state/preferences';
import { useColors } from '../../../theme/theme';
import { PRO_GRADIENT, PRO_GRADIENT_LINE, alpha, radius } from '../../../theme/tokens';
import { Screen } from '../../layout';
import { EmptyState, ErrorState, IconButton, OfflineState, ProBadge, Skeleton, Txt, useErrorText } from '../../ui';
import { waitingForNetwork } from '../../feed/DayChips';
import { Enter, ModuleHeader, ProNote, ScreenTitle, useNow } from '../kit';
import { IslandCompact, IslandExpanded, IslandMinimal, LockBanner, NotificationCollapsed, NotificationExpanded } from './previews';
import { FollowSettings } from './FollowSettings';
import { ProFollow } from './ProFollow';

/** El juego de la vista previa: el que sigues; si no, el de tu equipo en vivo, otro en vivo o el último que terminó */
const pickGame = (games: ScheduleGame[], followed: number | null, favorite: number | null) => {
    if (followed) return followed;
    const live = games.filter((game) => game.state === 'live');
    const mine = live.find((game) => game.away.id === favorite || game.home.id === favorite);
    if (mine || live[0]) return (mine ?? live[0]).gamePk;
    const finals = games.filter((game) => game.state === 'final').sort((a, b) => b.date.localeCompare(a.date));
    return finals[0]?.gamePk ?? null;
};

const back = () => (router.canGoBack() ? router.back() : router.replace('/mas'));

/** Rótulo de cada vista previa: nombre en negrita, la pista apagada y la insignia PRO si va */
const Caption: React.FC<{ name: string; hint: string; pro?: boolean; forAll?: string }> = ({ name, hint, pro, forAll }) => {
    const colors = useColors();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginHorizontal: 4 }}>
            <Txt size={12} tone="muted" style={{ flexShrink: 1 }}>
                <Txt size={12} weight="bold">
                    {name}
                </Txt>
                {` · ${hint}`}
            </Txt>
            {pro && <ProBadge />}
            {forAll && (
                <View style={{ height: 18, paddingHorizontal: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: alpha(colors.line, 0.14), backgroundColor: colors.raised, justifyContent: 'center' }}>
                    <Txt size={10} weight="extrabold" color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>
                        {forAll}
                    </Txt>
                </View>
            )}
        </View>
    );
};

/** La pantalla bloqueada de mentira: fondo oscuro con la franja del degradado PRO, la fecha, la hora y el banner */
const LockScreen: React.FC<{ game: GameDetail; props: ReturnType<typeof liveGameProps> }> = ({ game, props }) => {
    const { i18n } = useTranslation();
    const now = useNow(30 * 1000);
    return (
        <View style={{ borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#050608', paddingHorizontal: 12, paddingTop: 18, paddingBottom: 16, gap: 14 }}>
            <LinearGradient colors={['#171c33', '#08090d', '#050608']} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
            <LinearGradient colors={PRO_GRADIENT} {...PRO_GRADIENT_LINE} style={{ position: 'absolute', left: -60, right: -60, top: 150, height: 90, opacity: 0.35, transform: [{ rotate: '-14deg' }] }} />
            <View aria-hidden style={{ alignItems: 'center', gap: 2 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Lock size={16} color="rgba(255,255,255,0.9)" />
                <Txt size={16} weight="semibold" color="rgba(255,255,255,0.9)">
                    {formatLongDate(todayKey(), i18n.language)}
                </Txt>
                <Txt size={64} weight="semibold" color="rgba(255,255,255,0.96)" tabular style={{ lineHeight: 70, letterSpacing: -2 }}>
                    {formatTime(new Date(now).toISOString(), i18n.language, Intl.DateTimeFormat().resolvedOptions().timeZone).replace(/\s?[ap]\.?\s?m\.?/i, '')}
                </Txt>
            </View>
            <LockBanner props={props} away={game.away} home={game.home} />
        </View>
    );
};

// Página PRO «Segundo plano» (se abre desde Más): qué sale fuera de la app, con las vistas previas pintadas con un
// juego real (el que sigues, uno en vivo o el último que terminó), y los ajustes de alertas y de seguir solo.
export const SegundoPlanoScreen: React.FC = () => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useIsPro();
    const errorText = useErrorText();
    const { activeLeague } = useLeague();
    const { favoriteTeamId } = usePreferences();
    const followed = useFollowedGame();
    const schedule = useSchedule(activeLeague);
    const gamePk = pickGame(schedule.data?.games ?? [], followed, favoriteTeamId);
    const detail = useGame(gamePk ? String(gamePk) : undefined);
    const game = detail.data;
    const winProb = useWinProb(gamePk ?? undefined, game?.currentAtBat, pro && !!game && game.state !== 'preview');
    const now = useNow(60 * 1000);
    const platform = Platform.OS;
    const showIos = platform !== 'android';
    const showAndroid = platform !== 'ios';

    const header = (
        <View style={{ gap: 12 }}>
            <IconButton label={t('pro.segundo-plano.back')} onPress={back} style={{ width: 44, height: 44 }}>
                <ChevronLeft size={22} color={colors.ink} />
            </IconButton>
            <ScreenTitle title={t('pro.segundo-plano.title')} subtitle={t('pro.segundo-plano.subtitle')} />
        </View>
    );

    // Página del modo PRO: sin PRO solo dice qué es (Más no la muestra en el Lite)
    if (!pro) {
        return (
            <Screen>
                {header}
                <ProNote tone="neutral">{t('pro.segundo-plano.proText')}</ProNote>
            </Screen>
        );
    }

    let body: React.ReactNode;
    if (waitingForNetwork(schedule) || (gamePk && waitingForNetwork(detail))) {
        body = <OfflineState />;
    } else if (schedule.isPending || (gamePk && detail.isPending)) {
        body = (
            <View style={{ gap: 12 }}>
                <Skeleton height={260} round={24} />
                <Skeleton height={120} round={24} />
            </View>
        );
    } else if (schedule.isError && !schedule.data) {
        body = <ErrorState message={errorText(schedule.error)} onRetry={() => void schedule.refetch()} />;
    } else if (detail.isError && !game) {
        body = <ErrorState message={errorText(detail.error)} onRetry={() => void detail.refetch()} />;
    } else if (!game) {
        body = (
            <>
                <EmptyState title={t('pro.segundo-plano.noGame')} />
                <FollowSettings />
            </>
        );
    } else {
        const plays = winProb.data?.plays ?? [];
        const props = liveGameProps(game, i18n.language, now, undefined, {
            pro: true,
            wpAway: plays.length ? 100 - plays[plays.length - 1].home : null,
            wpSeries: plays.map((play) => 100 - play.home)
        });
        const where = game.state === 'live' ? props.inning : props.inningMark;
        const label = `${game.away.abbrev} ${t('pro.segundo-plano.vs')} ${game.home.abbrev} · ${where}`;
        const preview = { props, away: game.away, home: game.home };
        body = (
            <>
                <View style={{ gap: 4 }}>
                    <Txt size={14} tone="muted">
                        {t('pro.segundo-plano.example', { game: label })}
                    </Txt>
                    {followed === game.gamePk && (
                        <Txt size={12} weight="semibold" color={colors.ball}>
                            {t('pro.segundo-plano.exampleFollowing')}
                        </Txt>
                    )}
                </View>

                {showIos && (
                    <Enter index={0} style={{ gap: 10 }}>
                        <ModuleHeader title={t('pro.segundo-plano.sections.lock')} />
                        <LockScreen game={game} props={props} />
                    </Enter>
                )}

                <Enter index={1} style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                        <View style={{ height: 20, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.raised, justifyContent: 'center' }}>
                            <Txt size={10} weight="extrabold" color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>
                                {t('pro.segundo-plano.forAll')}
                            </Txt>
                        </View>
                        <Txt size={13} style={{ flex: 1, lineHeight: 18 }}>
                            {t('pro.segundo-plano.forAllText')}
                        </Txt>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                        <ProBadge />
                        <Txt size={13} style={{ flex: 1, lineHeight: 18 }}>
                            {t('pro.segundo-plano.proText')}
                        </Txt>
                    </View>
                    <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                        {t('pro.segundo-plano.updatesNote')}
                    </Txt>
                </Enter>

                {showIos && (
                    <Enter index={2} style={{ gap: 10 }}>
                        <ModuleHeader title={t('pro.segundo-plano.sections.island')} />
                        <View style={{ borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 16, gap: 14 }}>
                            <View style={{ gap: 8 }}>
                                <Caption name={t('pro.segundo-plano.island.compact')} hint={t('pro.segundo-plano.island.compactHint')} />
                                <IslandCompact {...preview} />
                            </View>
                            <View style={{ gap: 8 }}>
                                <Caption name={t('pro.segundo-plano.island.minimal')} hint={t('pro.segundo-plano.island.minimalHint')} />
                                <IslandMinimal {...preview} />
                            </View>
                            <View style={{ gap: 8 }}>
                                <Caption name={t('pro.segundo-plano.island.expanded')} hint={t('pro.segundo-plano.island.expandedHint')} pro />
                                <IslandExpanded {...preview} />
                            </View>
                        </View>
                    </Enter>
                )}

                {showAndroid && (
                    <Enter index={3} style={{ gap: 10 }}>
                        <ModuleHeader title={t('pro.segundo-plano.sections.android')} />
                        <View style={{ borderRadius: 28, backgroundColor: colors.surface, padding: 12, gap: 10 }}>
                            <Caption name={t('pro.segundo-plano.android.collapsed')} hint={t('pro.segundo-plano.android.collapsedHint')} forAll={t('pro.segundo-plano.forAll')} />
                            <NotificationCollapsed {...preview} />
                            <Caption name={t('pro.segundo-plano.android.expanded')} hint={t('pro.segundo-plano.android.expandedHint')} pro />
                            <NotificationExpanded {...preview} stopText={props.stopText} />
                        </View>
                        <Txt size={12} tone="muted" style={{ lineHeight: 17, marginHorizontal: 4 }}>
                            {t('pro.segundo-plano.android.note')}
                        </Txt>
                    </Enter>
                )}

                <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                    {t('pro.segundo-plano.previewNote')}
                </Txt>

                <Enter index={4} style={{ gap: 4 }}>
                    <ModuleHeader title={t('pro.segundo-plano.sections.game')} />
                    {/* El botón solo sirve en vivo; si no, los ajustes */}
                    {game.state === 'live' ? (
                        <View style={{ marginHorizontal: -16 }}>
                            <ProFollow game={game} />
                        </View>
                    ) : (
                        <FollowSettings game={game} style={{ marginTop: 8 }} />
                    )}
                </Enter>
            </>
        );
    }

    return (
        <Screen onRefresh={() => Promise.all([schedule.refetch(), gamePk ? detail.refetch() : Promise.resolve()])}>
            {header}
            {body}
        </Screen>
    );
};
