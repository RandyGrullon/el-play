import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Share2, Star } from 'lucide-react-native';
import type { GameDetail, GameState, ScheduleGame, TeamBase } from '../../types';
import { finalLabel, inningName, isNotPlayed, stateName } from '../../lib/baseball';
import { formatCountdown, formatShortDate, formatTime } from '../../lib/format';
import { teamDisplayName } from '../../lib/teams';
import { usePreferences } from '../../state/preferences';
import { useIsPro } from '../../lib/pro';
import { useColors } from '../../theme/theme';
import { fonts, inkOn, radius, shadow } from '../../theme/tokens';
import { ProBadge, Txt } from '../ui';
import { Odometer, PlusOne } from '../pro/kit';
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

/** PRO: cuántas carreras acaban de entrar (para el «+N» del marcador) y un contador que sube con cada vez */
const useRunJump = (score: number | null) => {
    const [seen, setSeen] = useState(score);
    const [jump, setJump] = useState({ count: 0, runs: 0 });
    // Ajustar el estado cuando cambia el marcador (el patrón de React para «el valor anterior»)
    if (score !== seen) {
        setSeen(score);
        if (score !== null && seen !== null && score > seen) setJump({ count: jump.count + 1, runs: score - seen });
    }
    return jump;
};

/** PRO: el marcador como odómetro (cada dígito rueda, 400 ms) con «+N» al anotar */
const ProScore: React.FC<{ score: number; color: string; dim: boolean; end: boolean }> = ({ score, color, dim, end }) => {
    const jump = useRunJump(score);
    return (
        <View style={{ opacity: dim ? 0.6 : 1 }}>
            <Odometer value={score} size={76} color={color} textStyle={{ fontFamily: fonts.condensed }} />
            <PlusOne trigger={jump.count} style={{ top: -6, [end ? 'left' : 'right']: -30 }}>
                <Txt size={20} weight="extrabold" color={color}>
                    +{jump.runs}
                </Txt>
            </PlusOne>
        </View>
    );
};

/** La entrada en grande entre los dos marcadores (como en la transmisión): flecha arriba en la alta, abajo en la baja */
const InningBadge: React.FC<{ inning: { n: number | null; isTop: boolean; state?: string | null } }> = ({ inning }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const state = inning.state === 'Middle' || inning.state === 'End' ? inning.state : inning.isTop ? 'Top' : 'Bottom';
    const between = state === 'Middle' || state === 'End';
    return (
        <View
            pointerEvents="none"
            accessible
            accessibilityLabel={`${t('game.inning')}: ${inningName(inning, i18n.language)}`}
            style={[{ position: 'absolute', bottom: 20, left: '50%', width: 70, marginLeft: -35, alignItems: 'center', gap: 2, borderRadius: 20, backgroundColor: colors.surface, paddingTop: 8, paddingBottom: 6 }, shadow('float')]}
        >
            {between ? <View style={{ height: 8 }} /> : <Txt size={10} color={colors.live} style={{ lineHeight: 10, transform: [{ rotate: state === 'Top' ? '0deg' : '180deg' }] }}>▲</Txt>}
            <Txt size={32} weight="extrabold" tabular style={{ lineHeight: 34 }}>
                {inning.n}
            </Txt>
            <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                {t(`game.half.${state}`)}
            </Txt>
        </View>
    );
};

// Cabecera del juego: dos mitades con el color de cada equipo y el marcador gigante
export const GameHero: React.FC<{ model: HeroModel; onShare?: () => void }> = ({ model, onShare }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const { favoriteTeamId, toggleFavoriteTeam } = usePreferences();
    const pro = useIsPro();
    const notPlayed = isNotPlayed(model.detailedState);
    const showScores = model.state !== 'preview' && !notPlayed;
    const now = useNow();
    const startsIn = model.date ? new Date(model.date).getTime() - now : 0;

    let status: string;
    if (notPlayed) status = stateName(model.detailedState, i18n.language);
    else if (model.state === 'final') status = finalLabel(model.inningsPlayed, model.scheduledInnings, i18n.language);
    else if (model.state === 'live') {
        // La entrada va en grande al centro: aquí «En vivo» y los outs
        status = model.inning?.n ? `${t('game.tabs.live')} · ${t('game.outsCount', { count: model.outs })}` : stateName(model.detailedState, i18n.language);
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
                {showScores && pro ? (
                    <ProScore score={team.score ?? 0} color={ink} dim={dim} end={end} />
                ) : showScores ? (
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

    const hero = (
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
            {model.state === 'live' && !notPlayed && model.inning?.n ? <InningBadge inning={model.inning} /> : null}
            {/* Estado en el centro, entre los dos botones */}
            <View pointerEvents="none" style={{ position: 'absolute', left: 64, right: 64, top: insets.top + 18, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: model.state === 'live' ? colors.live : 'rgba(255,255,255,0.9)', maxWidth: '100%' }}>
                    {model.state === 'live' && <PulseDot color="#fff" />}
                    <Txt size={13} weight="bold" color={model.state === 'live' ? '#fff' : '#14151a'} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {status}
                    </Txt>
                    {pro && <ProBadge />}
                </View>
            </View>
        </View>
    );
    // PRO en iPhone (iOS 18+): la tarjeta del juego que lo abre con Link.AppleZoom se agranda hasta esta cabecera.
    // Sin esa tarjeta (o en Android y la web) no hace nada.
    return pro ? <Link.AppleZoomTarget>{hero}</Link.AppleZoomTarget> : hero;
};
