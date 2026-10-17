import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react-native';
import type { Decision, GameDetail, GameTeam, TopPerformer } from '../../types';
import { keyPlayOf } from '../../lib/baseball';
import { inkOn, radius, shadow } from '../../theme/tokens';
import { PlayerPhoto, Txt } from '../ui';
import { StrikeZone } from '../game/StrikeZone';
import { uniformColors } from '../game/BatterFigure';

type Slide = 'key' | 'stars' | 'score' | 'decisions';

const shortName = (name: string) => (name.includes(',') ? name.split(',').reverse().join(' ').trim() : name);
const DARK = '#14151a';

/** Entra subiendo un poco (animate-fade-up de la web) cada vez que cambia la parte */
const FadeUp: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [value] = useState(() => new Animated.Value(0));
    useEffect(() => {
        Animated.timing(value, { toValue: 1, duration: 320, useNativeDriver: Platform.OS !== 'web' }).start();
    }, [value]);
    return <Animated.View style={{ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>{children}</Animated.View>;
};

// Resumen de un juego terminado como historia: jugada clave, figuras, marcador y decisiones (con las flechas o las barras)
export const StoryRecap: React.FC<{ game: GameDetail; onSharePerformer: (performer: TopPerformer) => void }> = ({ game, onSharePerformer }) => {
    const { t, i18n } = useTranslation();
    const winner = game.home.isWinner ? game.home : game.away;
    const loser = winner === game.home ? game.away : game.home;
    const ink = inkOn(winner.color);
    const soft = ink === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(20,21,26,0.08)';
    const key = useMemo(() => keyPlayOf(game.atBats, i18n.language), [game.atBats, i18n.language]);
    const slides: Slide[] = [...(key ? (['key'] as const) : []), ...(game.topPerformers.length ? (['stars'] as const) : []), 'score', ...(game.decisions.winner ? (['decisions'] as const) : [])];
    const [index, setIndex] = useState(0);
    const slide = slides[Math.min(index, slides.length - 1)];
    const go = (step: number) => setIndex((current) => Math.max(0, Math.min(slides.length - 1, current + step)));

    const tag = (label: string) => (
        <View style={{ alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: soft }}>
            <Txt size={13} weight="bold" color={ink}>
                {label}
            </Txt>
        </View>
    );

    const decision = (label: string, person: Decision | null, extra: string, team: GameTeam) =>
        person && (
            <Pressable key={label} onPress={() => router.push(`/jugador/${person.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: soft }}>
                <PlayerPhoto personId={person.id} name={person.name} size={48} background="rgba(255,255,255,0.85)" team={team} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={12} weight="bold" color={ink} style={{ opacity: 0.8 }}>
                        {label}
                    </Txt>
                    <Txt weight="extrabold" color={ink} numberOfLines={1}>
                        {person.name}
                    </Txt>
                </View>
                <Txt size={14} weight="bold" color={ink} tabular style={{ opacity: 0.9 }}>
                    {extra}
                </Txt>
            </Pressable>
        );

    const record = (person: Decision | null) => (person && person.wins !== null ? `${person.wins}-${person.losses ?? 0} · ${person.era ?? ''}` : '');

    const arrow = (step: number) => {
        const disabled = step < 0 ? index === 0 : index >= slides.length - 1;
        const Icon = step < 0 ? ChevronLeft : ChevronRight;
        return (
            <Pressable
                onPress={() => go(step)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={step < 0 ? t('recap.previous') : t('recap.next')}
                style={{ position: 'absolute', bottom: 16, [step < 0 ? 'left' : 'right']: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: soft, opacity: disabled ? 0.3 : 1 }}
            >
                <Icon size={20} color={ink} />
            </Pressable>
        );
    };

    return (
        <View style={[{ borderRadius: radius.card, overflow: 'hidden', backgroundColor: winner.color }, shadow('float')]} accessibilityLabel={t('recap.title')}>
            <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingTop: 16 }} accessibilityRole="tablist" accessibilityLabel={t('recap.slides')}>
                {slides.map((item, position) => (
                    <Pressable
                        key={item}
                        onPress={() => setIndex(position)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: position === index }}
                        accessibilityLabel={t(`recap.${item}`)}
                        hitSlop={{ top: 10, bottom: 10 }}
                        style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: position <= index ? ink : soft }}
                    />
                ))}
            </View>

            <View style={{ minHeight: 460, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 80 }}>
                {slide === 'key' && key && (
                    <FadeUp key="key">
                        {tag(t('share.keyPlay'))}
                        <Txt size={40} weight="extrabold" color={ink} style={{ marginTop: 12, lineHeight: 42 }}>
                            {key.headline}
                        </Txt>
                        <Txt weight="semibold" color={ink} style={{ marginTop: 8, opacity: 0.85 }}>
                            {key.detail}
                        </Txt>
                        <View style={{ marginTop: 16, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.9)', padding: 12 }}>
                            <StrikeZone pitches={key.atBat.pitches} batterSide={key.atBat.batter.side} uniform={uniformColors(key.atBat.top ? game.away : game.home, !key.atBat.top)} showLegend={false} maxWidth={240} light />
                        </View>
                    </FadeUp>
                )}

                {slide === 'stars' && (
                    <FadeUp key="stars">
                        {tag(t('summary.topPerformers'))}
                        <View style={{ marginTop: 16, gap: 12 }}>
                            {game.topPerformers.map((player) => (
                                <Pressable
                                    key={`${player.kind}-${player.id}`}
                                    onPress={() => router.push(`/jugador/${player.id}`)}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: soft }}
                                >
                                    <PlayerPhoto personId={player.id} name={player.name} size={64} background="rgba(255,255,255,0.85)" team={player.teamId === game.home.id ? game.home : game.away} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Txt size={18} weight="extrabold" color={ink} numberOfLines={1}>
                                            {shortName(player.name)}
                                        </Txt>
                                        <Txt size={14} weight="semibold" color={ink} style={{ opacity: 0.85 }}>
                                            {player.kind === 'pitcher'
                                                ? `${player.ip} IP · ${player.k} K · ${player.er} ${t('stats.er')}`
                                                : [`${player.h}-${player.ab}`, player.hr ? `${player.hr} HR` : '', player.rbi ? `${player.rbi} ${t('stats.rbi')}` : ''].filter(Boolean).join(' · ')}
                                        </Txt>
                                    </View>
                                    <Pressable
                                        onPress={() => onSharePerformer(player)}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('share.sharePlayer', { name: shortName(player.name) })}
                                        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <Share2 size={16} color={DARK} />
                                    </Pressable>
                                </Pressable>
                            ))}
                        </View>
                    </FadeUp>
                )}

                {slide === 'score' && (
                    <FadeUp key="score">
                        {tag(t('lineScore.title'))}
                        <View style={{ marginTop: 16, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.9)', padding: 12 }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ minWidth: 300 }}>
                                    <LineRow cells={[...game.linescore.map((inning) => String(inning.n)), t('lineScore.runs'), t('lineScore.hits'), t('lineScore.errors')]} label="" head />
                                    {(['away', 'home'] as const).map((side) => (
                                        <LineRow
                                            key={side}
                                            label={game[side].abbrev}
                                            cells={[
                                                ...game.linescore.map((inning, position) => String(inning[side] ?? (side === 'home' && position === game.linescore.length - 1 ? 'x' : ''))),
                                                String(game[side].runs),
                                                String(game[side].hits),
                                                String(game[side].errors)
                                            ]}
                                            runsAt={game.linescore.length}
                                        />
                                    ))}
                                </View>
                            </ScrollView>
                        </View>
                        <Txt size={44} weight="extrabold" color={ink} style={{ marginTop: 16, lineHeight: 46 }}>
                            {game.away.abbrev} {game.away.runs} · {game.home.abbrev} {game.home.runs}
                        </Txt>
                    </FadeUp>
                )}

                {slide === 'decisions' && (
                    <FadeUp key="decisions">
                        {tag(t('summary.decisions'))}
                        <View style={{ marginTop: 16, gap: 10 }}>
                            {decision(t('recap.win'), game.decisions.winner, record(game.decisions.winner), winner)}
                            {decision(t('recap.loss'), game.decisions.loser, record(game.decisions.loser), loser)}
                            {decision(
                                t('recap.save'),
                                game.decisions.save,
                                game.decisions.save?.saves !== null && game.decisions.save?.saves !== undefined ? t('summary.saves', { count: game.decisions.save.saves }) : '',
                                winner
                            )}
                        </View>
                    </FadeUp>
                )}

                {arrow(-1)}
                {arrow(1)}
            </View>
        </View>
    );
};

// Fila del marcador por entradas (siempre en tinta oscura sobre el fondo blanco)
const LineRow: React.FC<{ label: string; cells: string[]; head?: boolean; runsAt?: number }> = ({ label, cells, head, runsAt }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: head ? 4 : 8, borderTopWidth: head ? 0 : 1, borderTopColor: 'rgba(0,0,0,0.05)' }}>
        <Txt size={14} weight="extrabold" color={DARK} style={{ width: 44 }}>
            {label}
        </Txt>
        {cells.map((cell, index) => {
            const runs = runsAt !== undefined && index === runsAt;
            return (
                <Txt
                    key={index}
                    size={head ? 12 : runs ? 16 : 14}
                    weight={runs || (head && index === cells.length - 3) ? 'extrabold' : head ? 'regular' : 'regular'}
                    color={head && index !== cells.length - 3 ? '#6b6f7b' : DARK}
                    tabular
                    center
                    style={{ width: 26 }}
                >
                    {cell}
                </Txt>
            );
        })}
    </View>
);
