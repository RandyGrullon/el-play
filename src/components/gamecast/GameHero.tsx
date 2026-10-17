import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Share2, Star } from 'lucide-react-native';
import type { GameDetail, GameState, ScheduleGame, TeamBase } from '../../types';
import { finalLabel, inningName, isNotPlayed, stateName } from '../../lib/baseball';
import { formatCountdown, formatShortDate, formatTime } from '../../lib/format';
import { teamDisplayName } from '../../lib/teams';
import { usePreferences } from '../../state/preferences';
import { useColors } from '../../theme/theme';
import { inkOn, radius } from '../../theme/tokens';
import { Txt } from '../ui';
import { PulseDot } from '../feed/PulseDot';
import { useNow } from '../feed/useNow';

export interface HeroModel {
    state: GameState;
    detailedState: string;
    date: string | null;
    scheduledInnings: number;
    inningsPlayed: number;
    inning: { n: number | null; isTop: boolean; state?: string | null } | null;
    outs: number;
    away: TeamBase & { score: number | null; isWinner: boolean };
    home: TeamBase & { score: number | null; isWinner: boolean };
}

export const heroFromDetail = (game: GameDetail): HeroModel => ({
    state: game.state,
    detailedState: game.detailedState,
    date: game.date,
    scheduledInnings: game.scheduledInnings,
    inningsPlayed: game.linescore.length,
    inning: game.inning ? { n: game.inning.n, isTop: game.inning.isTop, state: game.inning.state } : null,
    outs: game.count.outs,
    away: { ...game.away, score: game.away.runs },
    home: { ...game.home, score: game.home.runs }
});

export const heroFromSchedule = (game: ScheduleGame): HeroModel => ({
    state: game.state,
    detailedState: game.detailedState,
    date: game.date,
    scheduledInnings: game.scheduledInnings,
    inningsPlayed: game.inningsPlayed ?? 0,
    inning: game.live ? { n: game.live.inning, isTop: game.live.isTop, state: game.live.inningState } : null,
    outs: game.live?.outs ?? 0,
    away: game.away,
    home: game.home
});

/** Vuelve a la pantalla anterior o, si se entró por un enlace, a los juegos */
export const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
};

// Cabecera del juego: dos mitades con el color de cada equipo y el marcador gigante
export const GameHero: React.FC<{ model: HeroModel; onShare?: () => void }> = ({ model, onShare }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const { favoriteTeamId, toggleFavoriteTeam } = usePreferences();
    const notPlayed = isNotPlayed(model.detailedState);
    const showScores = model.state !== 'preview' && !notPlayed;
    const now = useNow();
    const startsIn = model.date ? new Date(model.date).getTime() - now : 0;

    let status: string;
    if (notPlayed) status = stateName(model.detailedState, i18n.language);
    else if (model.state === 'final') status = finalLabel(model.inningsPlayed, model.scheduledInnings, i18n.language);
    else if (model.state === 'live') {
        status = model.inning?.n ? `${inningName(model.inning, i18n.language, true)} · ${t('game.outsCount', { count: model.outs })}` : stateName(model.detailedState, i18n.language);
    } else status = model.date ? `${formatShortDate(model.date, i18n.language)} · ${formatTime(model.date, i18n.language)}` : '';
    if (model.state === 'preview' && startsIn > 0 && !notPlayed) status += ` · ${formatCountdown(startsIn, i18n.language)}`;

    const half = (team: HeroModel['away'], align: 'start' | 'end') => {
        const ink = inkOn(team.color);
        const dim = model.state === 'final' && !team.isWinner;
        const favorite = favoriteTeamId === team.id;
        const end = align === 'end';
        return (
            <View style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end', alignItems: end ? 'flex-end' : 'flex-start', paddingHorizontal: 16, paddingBottom: 28, paddingTop: insets.top + 68, backgroundColor: team.color }}>
                <Pressable
                    onPress={() => toggleFavoriteTeam(team.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: favorite }}
                    accessibilityLabel={favorite ? t('teams.removeFavorite', { name: team.name }) : t('teams.addFavorite', { name: team.name })}
                    hitSlop={6}
                    style={{ marginBottom: 4, maxWidth: '100%', flexDirection: end ? 'row-reverse' : 'row', alignItems: 'center', gap: 4 }}
                >
                    <Txt size={16} weight="bold" color={ink} numberOfLines={1} style={{ flexShrink: 1, textAlign: end ? 'right' : 'left' }}>
                        {teamDisplayName(team, i18n.language)}
                    </Txt>
                    <Star size={16} color={ink} fill={favorite ? ink : 'transparent'} style={{ opacity: favorite ? 1 : 0.5 }} />
                </Pressable>
                {showScores ? (
                    <Txt size={76} weight="extrabold" color={ink} tabular style={{ lineHeight: 72, opacity: dim ? 0.6 : 1 }}>
                        {team.score ?? 0}
                    </Txt>
                ) : (
                    <Txt size={30} weight="extrabold" color={ink} style={{ lineHeight: 32 }}>
                        {team.abbrev}
                    </Txt>
                )}
                {team.record && (
                    <Txt size={12} weight="semibold" color={ink} tabular style={{ marginTop: 4, opacity: 0.75 }}>
                        {team.record.wins}-{team.record.losses}
                    </Txt>
                )}
            </View>
        );
    };

    const glass = { width: 44, height: 44, borderRadius: radius.tile, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center' as const, justifyContent: 'center' as const };

    return (
        <View style={{ flexDirection: 'row', overflow: 'hidden' }} accessibilityLabel={t('game.scoreboard')}>
            {half(model.away, 'start')}
            {half(model.home, 'end')}
            <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel={t('game.back')} style={[glass, { position: 'absolute', left: 12, top: insets.top + 12 }]}>
                <ArrowLeft size={20} color="#14151a" />
            </Pressable>
            {onShare && (
                <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel={t('share.title')} style={[glass, { position: 'absolute', right: 12, top: insets.top + 12 }]}>
                    <Share2 size={20} color="#14151a" />
                </Pressable>
            )}
            {/* Estado en el centro, entre los dos botones */}
            <View pointerEvents="none" style={{ position: 'absolute', left: 64, right: 64, top: insets.top + 18, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: model.state === 'live' ? colors.live : 'rgba(255,255,255,0.9)', maxWidth: '100%' }}>
                    {model.state === 'live' && <PulseDot color="#fff" />}
                    <Txt size={13} weight="bold" color={model.state === 'live' ? '#fff' : '#14151a'} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {status}
                    </Txt>
                </View>
            </View>
        </View>
    );
};
