import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ListFilter } from 'lucide-react-native';
import type { AtBat, GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import type { HalfInning, NameBook, PlayEvent, PlayItem } from './model';
import { filterCounts } from './model';
import { pitchTypeColor, pitchTypeName } from '../../../../lib/baseball';
import { alpha, radius, shadow } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { GradientCard, LiveDot, MOTION_EASE, MOTION_MS, ModuleHeader, ProButton, readableInk, useMotion } from '../../kit';
import { ChallengeCard, EventChip, PitchingChangeCard } from './EventCards';
import { HalfSwing, PlayRow, ScorebookRow } from './PlayRow';
import { Collapse, RowIn, Turn, usePlayColors } from './parts';
import { eventText, halfAria, occupiedText, ordinal, pitchOrdinal } from './texts';

type Game = Pick<GameDetail, 'away' | 'home' | 'state' | 'box' | 'atBats' | 'currentAtBat' | 'count' | 'runners' | 'inning'>;
type T = ReturnType<typeof useTranslation>['t'];

interface PlaysTabProps {
    game: Game;
    pro?: GamePro;
    halves: HalfInning[];
    names: NameBook;
    onOpenAll?: () => void;
}

// ------------------------------------------------------------------ Al bate ahora

const BASE_OF = { first: '1B', second: '2B', third: '3B' } as const;

const NowCard: React.FC<{ game: Game; atBat: AtBat; names: NameBook }> = ({ game, atBat, names }) => {
    const { t, i18n } = useTranslation();
    const bases = (['first', 'second', 'third'] as const).filter((base) => game.runners[base]).map((base) => BASE_OF[base]);
    const runners = bases.length === 3 ? t('pro.jugadas.now.loaded') : bases.length ? t('pro.jugadas.now.runners', { bases: occupiedText(t, bases), count: bases.length }) : t('pro.jugadas.now.empty');
    const next = atBat.pitches.length + 1;
    const count = t('pro.jugadas.now.count', { balls: game.count.balls, strikes: game.count.strikes, outs: t('pro.kit.game.outs', { count: game.count.outs }) });
    const batter = names.full(atBat.batter.id, atBat.batter.name);
    const pitcher = names.full(atBat.pitcher.id, atBat.pitcher.name);
    const pitchList = atBat.pitches.map((pitch, index) => `${pitch.n ?? index + 1}: ${pitchTypeName(pitch, i18n.language)}${pitch.mph ? ` ${pitch.mph.toFixed(1)}` : ''}`).join(', ');
    return (
        <GradientCard accessible accessibilityLabel={`${t('pro.jugadas.now.title')}. ${count}. ${batter} ${t('pro.jugadas.now.vs')} ${pitcher}, ${runners}. ${pitchList}`} innerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <LiveDot pulse />
                <Txt size={11} weight="extrabold" style={{ flex: 1, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    {t('pro.jugadas.now.title')}
                </Txt>
                <Txt size={17} condensed tabular tone="muted">
                    {count}
                </Txt>
            </View>
            <Txt size={15} style={{ lineHeight: 21 }}>
                <Txt size={15} weight="extrabold">
                    {batter}
                </Txt>{' '}
                {t('pro.jugadas.now.vs')}{' '}
                <Txt size={15} weight="extrabold">
                    {pitcher}
                </Txt>
                , {runners}.
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                {atBat.pitches.map((pitch, index) => {
                    const fill = pitchTypeColor(pitch.type);
                    return (
                        <View key={index} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: fill, alignItems: 'center', justifyContent: 'center' }}>
                            <Txt size={15} condensed color={readableInk(fill)}>
                                {pitch.n ?? index + 1}
                            </Txt>
                        </View>
                    );
                })}
                <Txt size={12} tone="muted">
                    {t('pro.jugadas.now.waiting', { n: pitchOrdinal(next, i18n.language) })}
                </Txt>
            </View>
        </GradientCard>
    );
};

// ------------------------------------------------------------------ Encabezado de una media entrada

const SectionTitle: React.FC<{ half: HalfInning; game: Game; aside: string }> = ({ half, game, aside }) => {
    const { t, i18n } = useTranslation();
    const paint = usePlayColors();
    return (
        <ModuleHeader
            title={
                <Txt accessibilityRole="header" accessibilityLabel={`${halfAria(t, half, game, i18n.language)}. ${aside}`} numberOfLines={1} size={12.5} weight="extrabold" style={{ flexShrink: 1 }}>
                    <Txt size={12.5} color={paint.team(game[half.side].color)}>
                        {half.top ? '▲' : '▼'}{' '}
                    </Txt>
                    {t('pro.jugadas.tab.batting', { inning: ordinal(half.inning, i18n.language), team: game[half.side].teamName })}
                    <Txt size={11} weight="semibold" tone="muted">
                        {'  '}
                        {aside}
                    </Txt>
                </Txt>
            }
        />
    );
};

const halfLine = (t: T, half: HalfInning) =>
    half.lob !== null && !half.current ? t('pro.jugadas.tab.lineLob', { runs: half.runs, hits: half.hits, lob: half.lob }) : t('pro.jugadas.tab.line', { runs: half.runs, hits: half.hits });

// Chips y tarjetas de un turno: lo de antes (eventos y retos) o lo del último pitcheo (aside).
// En orden del juego, o al revés (lo más nuevo arriba) en la media entrada que se juega.
const EventsOf: React.FC<{ item: PlayItem; names: NameBook; game: Game; pro?: GamePro; aside?: boolean; newestFirst?: boolean }> = ({ item, names, game, pro, aside = false, newestFirst = false }) => {
    const events = (aside ? item.aside : item.events).map((event, index) =>
        event.kind === 'pitching_change' ? <PitchingChangeCard key={`e${index}`} event={event} names={names} game={game} pro={pro} /> : <EventChip key={`e${index}`} event={event} item={item} names={names} game={game} />
    );
    const challenges = aside ? [] : item.challenges.map((challenge) => <ChallengeCard key={`c${challenge.k}`} challenge={challenge} names={names} game={game} />);
    const list = [...events, ...challenges];
    return <>{newestFirst ? list.reverse() : list}</>;
};

// Etiquetas de una media entrada vieja: visitas, cambios, retos, WP/PB, robos, golpeados y errores
const useHalfTags = (game: Game, names: NameBook) => {
    const { t, i18n } = useTranslation();
    return (half: HalfInning) => {
        const tags = new Map<string, number>();
        const add = (text: string) => tags.set(text, (tags.get(text) ?? 0) + 1);
        for (const item of half.plays) {
            const events: PlayEvent[] = [...item.events, ...item.aside];
            for (const event of events) {
                if (event.kind === 'pitching_change') add(t('pro.jugadas.tab.relieves', { name: names.label(event.player), out: names.label(event.replaced) }));
                else if (event.kind === 'mound_visit') add(t('pro.jugadas.event.mound_visit'));
                else if (event.kind !== 'defense' && event.kind !== 'other') add(eventText(t, event, item, names, game, i18n.language).title + (event.runner ? ` · ${names.label(event.runner.id)}` : ''));
            }
            for (const challenge of item.challenges) add(t(challenge.over ? 'pro.jugadas.tab.absOver' : 'pro.jugadas.tab.absKept'));
            if (item.atBat.event === 'hit_by_pitch') add(t('pro.jugadas.tab.hbp', { name: names.label(item.atBat.batter.id, item.atBat.batter.name) }));
            for (const credit of item.pro?.runners.flatMap((runner) => runner.credits ?? []) ?? []) {
                if (credit.c?.includes('error')) add(t(credit.c.includes('throwing') ? 'pro.jugadas.tab.errorThrow' : 'pro.jugadas.tab.error', { name: names.label(credit.id) }));
            }
        }
        return [...tags.entries()].map(([text, count]) => (count > 1 ? `${text} ×${count}` : text));
    };
};

// Interruptor «Solo anotadoras» (44 px de alto, la bolita se desliza 200 ms)
const Toggle: React.FC<{ value: boolean; onChange: (value: boolean) => void; label: string }> = ({ value, onChange, label }) => {
    const paint = usePlayColors();
    const { colors } = paint;
    const motion = useMotion();
    const knob = useSharedValue(value ? 1 : 0);
    useEffect(() => {
        knob.set(motion.animate ? withTiming(value ? 1 : 0, { duration: MOTION_MS.tab, easing: MOTION_EASE }) : value ? 1 : 0);
    }, [value, motion.animate, knob]);
    const move = useAnimatedStyle(() => ({ transform: [{ translateX: knob.get() * 16 }] }));
    return (
        <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt size={13} weight="bold">
                {label}
            </Txt>
            <View style={{ width: 40, height: 24, borderRadius: 12, backgroundColor: value ? colors.ink : alpha(colors.ink, 0.2), justifyContent: 'center', paddingHorizontal: 2 }}>
                <Animated.View style={[{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bg }, shadow('card'), move]} />
            </View>
        </Pressable>
    );
};

// ------------------------------------------------------------------ Pestaña «Jugadas» del juego en vivo

// Cronología en vivo (diseño del juego en vivo): arriba el turno de ahora y las jugadas de esta media entrada
// (lo más nuevo primero), luego la media entrada anterior con la anotación del anotador y, plegadas, las de antes.
export const PlaysTab: React.FC<PlaysTabProps> = ({ game, pro, halves, names, onOpenAll }) => {
    const { t, i18n } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const [onlyScoring, setOnlyScoring] = useState(false);
    const [openPlays, setOpenPlays] = useState<Set<number>>(() => new Set());
    const [openHalves, setOpenHalves] = useState<Set<string>>(() => new Set());
    const tags = useHalfTags(game, names);
    const counts = filterCounts(halves);
    const toggle = <V,>(set: React.Dispatch<React.SetStateAction<Set<V>>>, value: V) =>
        set((current) => {
            const next = new Set(current);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
        });

    const current = halves[halves.length - 1];
    const previous = halves.length > 1 ? halves[halves.length - 2] : null;
    const older = halves.slice(0, Math.max(0, halves.length - 2)).reverse();
    const nowAtBat = game.state === 'live' ? game.atBats.find((atBat) => atBat.i === game.currentAtBat && !atBat.complete) : undefined;
    const scoring = useMemo(() => halves.flatMap((half) => half.plays.filter((item) => item.scoring && item.atBat.complete)).reverse(), [halves]);

    const emptyCard = (text: string) => (
        <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 32 }, shadow('card')]}>
            <Txt size={14} tone="muted" center>
                {text}
            </Txt>
        </View>
    );

    if (!current) return emptyCard(t('pro.jugadas.empty.all'));

    // La media entrada que se juega: lo más nuevo arriba (lo del último pitcheo, la jugada y lo de antes)
    const bigRows = (half: HalfInning) =>
        half.plays
            .filter((item) => item.atBat.complete)
            .reverse()
            .map((item, index) => (
                <RowIn key={item.atBat.i} index={index} play style={{ gap: 8 }}>
                    <EventsOf item={item} names={names} game={game} pro={pro} aside newestFirst />
                    <PlayRow item={item} game={game} names={names} open={openPlays.has(item.atBat.i)} onToggle={() => toggle(setOpenPlays, item.atBat.i)} big />
                    <EventsOf item={item} names={names} game={game} pro={pro} newestFirst />
                </RowIn>
            ));

    // Las anteriores, como en la hoja del anotador: en el orden del juego
    const scoreRows = (half: HalfInning) =>
        half.plays
            .filter((item) => item.atBat.complete)
            .map((item) => (
                <View key={item.atBat.i} style={{ gap: 6 }}>
                    <EventsOf item={item} names={names} game={game} pro={pro} />
                    <ScorebookRow item={item} names={names} open={openPlays.has(item.atBat.i)} onToggle={() => toggle(setOpenPlays, item.atBat.i)} />
                    <EventsOf item={item} names={names} game={game} pro={pro} aside />
                </View>
            ));

    const card = [{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06) }, shadow('card')];

    return (
        <View style={{ gap: 16 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                    <ListFilter size={16} color={colors.muted} />
                    <Txt size={12.5} tone="muted">
                        {t('pro.jugadas.tab.summary', { plays: t('pro.jugadas.count.plays', { count: counts.all }), scoring: t('pro.jugadas.count.scoring', { count: counts.scoring }) })}
                    </Txt>
                </View>
                <Toggle value={onlyScoring} onChange={setOnlyScoring} label={t('pro.jugadas.tab.onlyScoring')} />
            </View>

            <RowIn key={String(onlyScoring)} index={0} play style={{ gap: 16 }}>
                {onlyScoring ? (
                    scoring.length ? (
                        <View style={{ gap: 8 }}>
                            {scoring.map((item) => (
                                <PlayRow key={item.atBat.i} item={item} game={game} names={names} open={openPlays.has(item.atBat.i)} onToggle={() => toggle(setOpenPlays, item.atBat.i)} big />
                            ))}
                        </View>
                    ) : (
                        emptyCard(t('pro.jugadas.empty.scoring'))
                    )
                ) : (
                    <>
                        <View style={{ gap: 8 }}>
                            <SectionTitle half={current} game={game} aside={`${halfLine(t, current)}${current.current ? ` · ${t('pro.jugadas.tab.inProgress')}` : ''}`} />
                            {nowAtBat && <NowCard game={game} atBat={nowAtBat} names={names} />}
                            {bigRows(current)}
                        </View>

                        {previous && (
                            <View style={{ gap: 8 }}>
                                <SectionTitle half={previous} game={game} aside={halfLine(t, previous)} />
                                <View style={[card, { paddingHorizontal: 14, paddingVertical: 8, gap: 4 }]}>
                                    {previous.oneTwoThree && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: alpha(colors.line, 0.1) }}>
                                            <View style={{ borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 8, paddingVertical: 2 }}>
                                                <Txt size={10.5} weight="extrabold" style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                                    {t('pro.jugadas.tab.oneTwoThree')}
                                                </Txt>
                                            </View>
                                            <Txt size={12} tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                                {names.label(previous.pitchers[0])} · {t('pro.jugadas.line.pitches', { count: previous.pitches })}
                                            </Txt>
                                            <HalfSwing swing={previous.swing} game={game} />
                                        </View>
                                    )}
                                    {scoreRows(previous)}
                                </View>
                            </View>
                        )}

                        {older.length > 0 && (
                            <View style={{ gap: 8 }}>
                                <ModuleHeader title={t('pro.jugadas.tab.earlier')} aside={t('pro.jugadas.tab.earlierHint', { count: older.length })} />
                                <View style={[card, { overflow: 'hidden' }]}>
                                    {older.map((half, index) => {
                                        const open = openHalves.has(half.key);
                                        const list = tags(half);
                                        const team = game[half.side];
                                        const line = halfLine(t, half);
                                        return (
                                            <View key={half.key} style={{ borderTopWidth: index ? 1 : 0, borderTopColor: alpha(colors.line, 0.1), borderLeftWidth: 3, borderLeftColor: half.runs > 0 ? team.color : 'transparent' }}>
                                                <Pressable
                                                    onPress={() => toggle(setOpenHalves, half.key)}
                                                    accessibilityRole="button"
                                                    accessibilityState={{ expanded: open }}
                                                    accessibilityLabel={[halfAria(t, half, game, i18n.language), line, ...list].join('. ')}
                                                    style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 }}
                                                >
                                                    <Txt size={13.5} weight="extrabold" style={{ minWidth: 44 }}>
                                                        <Txt size={13.5} color={paint.team(team.color)}>
                                                            {half.top ? '▲' : '▼'}
                                                        </Txt>
                                                        {ordinal(half.inning, i18n.language)}
                                                    </Txt>
                                                    <Txt size={13.5} weight="bold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                                        {team.teamName}
                                                    </Txt>
                                                    <Txt size={15} condensed tabular>
                                                        {line}
                                                    </Txt>
                                                    <Turn open={open} size={16} />
                                                </Pressable>
                                                {list.length > 0 && (
                                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 10 }}>
                                                        {list.map((text) => (
                                                            <View key={text} style={{ height: 24, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 10 }}>
                                                                <Txt size={11.5} weight="semibold" numberOfLines={1}>
                                                                    {text}
                                                                </Txt>
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
                                                <Collapse open={open} style={{ borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.1), paddingHorizontal: 14, paddingVertical: 6, gap: 4 }}>
                                                    {scoreRows(half)}
                                                </Collapse>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}
                    </>
                )}
            </RowIn>

            {onOpenAll && <ProButton label={t('pro.jugadas.tab.all')} block iconEnd icon={(color) => <ChevronRight size={16} color={color} />} onPress={onOpenAll} />}
        </View>
    );
};

