import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Gauge } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import type { GamePro, WinProb } from '../../../../lib/pro/juego';
import type { Challenge, HalfInning, NameBook, PlayEvent, PlayFilter, PlayItem } from './model';
import { filterCounts, filterHalves } from './model';
import { eventName } from '../../../../lib/baseball';
import { alpha, radius, shadow } from '../../../../theme/tokens';
import { Txt } from '../../../ui';
import { ChipButton, ChipRow, ModuleHeader, WinProbChart, fmtPercent, useMotion, type WinProbMarker } from '../../kit';
import { ChallengeCard, EventChip, PitchingChangeCard } from './EventCards';
import { HalfHeader } from './HalfHeader';
import { PlayRow } from './PlayRow';
import { RowIn, fmtSwing, usePlayColors } from './parts';
import { ordinal, totalsText } from './texts';

type Game = Pick<GameDetail, 'away' | 'home' | 'state' | 'box' | 'atBats'>;

interface PlaysSheetProps {
    game: Game;
    pro?: GamePro;
    winProb?: WinProb;
    halves: HalfInning[];
    names: NameBook;
    /** Nota de carga o de error de los extras PRO (va arriba) */
    note?: React.ReactNode;
    /** La lista tiene su propio desplazamiento (hoja sin ScrollView): virtualizada y con encabezados pegajosos */
    fill?: boolean;
}

// ------------------------------------------------------------------ Filas de la lista

type Row =
    | { type: 'event'; key: string; event: PlayEvent; item: PlayItem; n: number }
    | { type: 'challenge'; key: string; challenge: Challenge; item: PlayItem; n: number }
    | { type: 'play'; key: string; item: PlayItem; n: number }
    | { type: 'aside'; key: string; event: PlayEvent; item: PlayItem; n: number };

interface HalfSection {
    key: string;
    half: HalfInning;
    open: boolean;
    data: Row[];
}

/** Lo de una media entrada en orden: lo de antes de cada jugada (eventos y retos), la jugada y lo del último pitcheo */
const rowsOf = (half: HalfInning, withEvents: boolean, prefix: string): Row[] => {
    const rows: Row[] = [];
    for (const item of half.plays) {
        const id = `${prefix}${item.atBat.i}`;
        if (withEvents) {
            item.events.forEach((event, index) => rows.push({ type: 'event', key: `${id}-e${index}`, event, item, n: rows.length }));
            item.challenges.forEach((challenge) => rows.push({ type: 'challenge', key: `${id}-c${challenge.k}`, challenge, item, n: rows.length }));
        }
        rows.push({ type: 'play', key: `${id}-p`, item, n: rows.length });
        if (withEvents) item.aside.forEach((event, index) => rows.push({ type: 'aside', key: `${id}-a${index}`, event, item, n: rows.length }));
    }
    return rows;
};

/** Abiertas por defecto, menos las 1-2-3 (no traen nada); con un filtro, todas; el usuario las abre o cierra */
const openOf = (half: HalfInning, filter: PlayFilter, toggled: Record<string, boolean>) => toggled[half.key] ?? (filter !== 'all' || half.current || !half.oneTwoThree);

/** Las secciones de la lista (las claves llevan el filtro: al cambiarlo, las filas vuelven a entrar) */
const buildSections = (halves: HalfInning[], filter: PlayFilter, toggled: Record<string, boolean>): HalfSection[] =>
    filterHalves(halves, filter).map((half) => {
        const open = openOf(half, filter, toggled);
        return { key: `${filter}:${half.key}`, half, open, data: open ? rowsOf(half, filter === 'all', `${filter}:`) : [] };
    });

// ------------------------------------------------------------------ Probabilidad de ganar

// Probabilidad de ganar por jugada, con las 3 jugadas que más la movieron (al tocarlas se abre la jugada)
const WinProbBlock: React.FC<{ game: Game; winProb: WinProb; names: NameBook; onSelect: (i: number) => void }> = ({ game, winProb, names, onSelect }) => {
    const { t, i18n } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const plays = useMemo(() => winProb.plays.filter((play) => play.complete).sort((a, b) => a.i - b.i), [winProb.plays]);
    if (!plays.length) return null;
    const first = plays[0];
    const points = [{ x: 0, top: 100 - (first.home - first.wpa) }, ...plays.map((play, index) => ({ x: index + 1, top: 100 - play.home }))];
    const ticks: { value: number; label: string }[] = [];
    plays.forEach((play, index) => {
        if (play.top && play.inning && !ticks.some((tick) => tick.label === String(play.inning))) ticks.push({ value: index, label: String(play.inning) });
    });
    const last = plays[plays.length - 1];
    const leader = last.home >= 50 ? game.home : game.away;
    const leaderPct = fmtPercent(last.home >= 50 ? last.home : 100 - last.home, 0, i18n.language, true);
    const keyPlays = winProb.key
        .map((i, index) => {
            const at = plays.findIndex((play) => play.i === i);
            const atBat = game.atBats.find((entry) => entry.i === i);
            if (at < 0 || !atBat) return null;
            const play = plays[at];
            const team = play.wpa > 0 ? game.home : game.away;
            const value = fmtSwing(Math.round(Math.abs(play.wpa) * 10) / 10, i18n.language);
            const name = names.label(atBat.batter.id, atBat.batter.name);
            return {
                i,
                badge: String(index + 1),
                team,
                value,
                name,
                aria: t('pro.jugadas.chart.marker', { event: eventName(atBat, i18n.language), name, inning: ordinal(atBat.inning, i18n.language), value, team: team.abbrev }),
                x: at + 1,
                top: 100 - play.home
            };
        })
        .filter((entry): entry is NonNullable<typeof entry> => !!entry);
    const markers: WinProbMarker[] = keyPlays.map((entry) => ({ x: entry.x, top: entry.top, badge: entry.badge, name: entry.aria, onPress: () => onSelect(entry.i) }));
    const awayPct = fmtPercent(100 - last.home, 1, i18n.language, true);
    const homePct = fmtPercent(last.home, 1, i18n.language, true);

    return (
        <View style={[{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 16, paddingBottom: 12, gap: 6 }, shadow('card')]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <Txt size={15} weight="extrabold" accessibilityRole="header" style={{ flexGrow: 1 }}>
                    {t('pro.jugadas.chart.title')}
                </Txt>
                <Txt size={12} tone="muted">
                    {t(game.state === 'final' ? 'pro.jugadas.chart.finalLead' : 'pro.jugadas.chart.nowLead')}{' '}
                    <Txt size={14} weight="extrabold">
                        {leader.abbrev} {leaderPct}
                    </Txt>
                </Txt>
            </View>
            <WinProbChart
                points={points}
                topTeam={game.away}
                bottomTeam={game.home}
                label={t('pro.jugadas.chart.aria', { away: game.away.abbrev, home: game.home.abbrev, awayPct, homePct })}
                xDomain={[0, Math.max(points.length - 1, 1)]}
                xTicks={ticks}
                markers={markers}
                live={game.state === 'live'}
                height={140}
            />
            {keyPlays.length > 0 && (
                <ChipRow label={t('pro.jugadas.chart.keyPlays')} bleed={false} style={{ marginTop: 4 }}>
                    {keyPlays.map((entry) => (
                        <Pressable
                            key={entry.i}
                            onPress={() => onSelect(entry.i)}
                            accessibilityRole="button"
                            accessibilityLabel={entry.aria}
                            style={{ height: 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.raised, paddingLeft: 6, paddingRight: 12 }}
                        >
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                                <Txt size={11} weight="extrabold" color={colors.bg}>
                                    {entry.badge}
                                </Txt>
                            </View>
                            <Txt size={13} weight="bold">
                                {entry.name}
                            </Txt>
                            <Txt size={14} condensed tabular color={paint.team(entry.team.color)}>
                                {entry.team.abbrev} {entry.value}
                            </Txt>
                        </Pressable>
                    ))}
                </ChipRow>
            )}
        </View>
    );
};

// ------------------------------------------------------------------ Hoja

// Hoja «Jugadas y box score» (vista Jugadas): toda la jugada a jugada en orden, agrupada por media entrada, con la
// probabilidad de ganar arriba y el filtro Todas · Anotadoras · Clave. Con `fill` es una SectionList virtualizada con
// los encabezados de cada media entrada pegajosos; sin él (dentro del ScrollView de la hoja) va todo seguido.
export const PlaysSheet: React.FC<PlaysSheetProps> = ({ game, pro, winProb, halves, names, note, fill = false }) => {
    const { t } = useTranslation();
    const paint = usePlayColors();
    const { colors } = paint;
    const motion = useMotion();
    const list = useRef<SectionList<Row, HalfSection>>(null);
    // Adónde ir si la fila todavía no estaba medida (onScrollToIndexFailed)
    const pending = useRef<{ sectionIndex: number; itemIndex: number } | null>(null);
    const [filter, setFilter] = useState<PlayFilter>('all');
    const [toggled, setToggled] = useState<Record<string, boolean>>({});
    const [openPlays, setOpenPlays] = useState<Set<number>>(() => new Set());
    // Las filas entran escalonadas solo al abrir la hoja o al cambiar de filtro (no al desplazarse)
    const [intro, setIntro] = useState(true);
    // Media entrada cuyo encabezado está pegado arriba (gana sombra)
    const [stuck, setStuck] = useState<string | null>(null);
    const counts = filterCounts(halves);
    const sections = useMemo(() => buildSections(halves, filter, toggled), [halves, filter, toggled]);
    const pitches = halves.reduce((total, half) => total + half.pitches, 0);
    const hasWinProb = !!winProb && winProb.plays.some((play) => play.complete);

    useEffect(() => {
        if (!intro) return;
        const timer = setTimeout(() => setIntro(false), 900);
        return () => clearTimeout(timer);
    }, [intro, filter]);

    // El primero que se ve: si es una fila (no un encabezado), su encabezado ya está pegado encima de ella
    const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: { index?: number | null; section?: unknown }[] }) => {
        const top = viewableItems[0];
        setStuck(top && top.index != null && top.section ? (top.section as HalfSection).key : null);
    });
    const [viewability] = useState(() => ({ itemVisiblePercentThreshold: 1 }));

    const choose = (next: PlayFilter) => {
        if (next === filter) return;
        setFilter(next);
        setIntro(true);
    };

    const toggleHalf = (section: HalfSection) => setToggled((current) => ({ ...current, [section.half.key]: !section.open }));

    const togglePlay = (i: number) =>
        setOpenPlays((current) => {
            const next = new Set(current);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });

    // Desde la gráfica: se abre su media entrada y la jugada, y (con la lista propia) se lleva a la vista
    const goTo = (i: number) => {
        const half = halves.find((entry) => entry.plays.some((item) => item.atBat.i === i));
        if (!half) return;
        const nextFilter = filter !== 'all' && !filterHalves(halves, filter).some((entry) => entry.plays.some((item) => item.atBat.i === i)) ? 'all' : filter;
        const nextToggled = { ...toggled, [half.key]: true };
        setFilter(nextFilter);
        setToggled(nextToggled);
        setOpenPlays((current) => new Set(current).add(i));
        if (!fill) return;
        const next = buildSections(halves, nextFilter, nextToggled);
        const sectionIndex = next.findIndex((section) => section.half.key === half.key);
        const rowIndex = sectionIndex < 0 ? -1 : next[sectionIndex].data.findIndex((row) => row.type === 'play' && row.item.atBat.i === i);
        if (rowIndex < 0) return;
        // itemIndex 0 es el encabezado de la sección: la fila n va en n + 1
        const target = { sectionIndex, itemIndex: rowIndex + 1 };
        pending.current = target;
        setTimeout(() => list.current?.scrollToLocation({ ...target, viewPosition: 0.3, animated: motion.animate }), 60);
    };

    const options: { value: PlayFilter; count: number }[] = [
        { value: 'all', count: counts.all },
        { value: 'scoring', count: counts.scoring },
        { value: 'key', count: counts.key }
    ];

    const top = (
        <View style={{ gap: 12, paddingBottom: 4 }}>
            <ModuleHeader title={t('pro.jugadas.title')} aside={totalsText(t, counts.all, pitches)} />
            {note}
            {hasWinProb && winProb && <WinProbBlock game={game} winProb={winProb} names={names} onSelect={goTo} />}
            <ChipRow label={t('pro.jugadas.filter.label')}>
                {options.map((option) => {
                    const active = filter === option.value;
                    const ink = active ? colors.bg : colors.ink;
                    return (
                        <ChipButton
                            key={option.value}
                            active={active}
                            onPress={() => choose(option.value)}
                            disabled={option.value === 'key' && option.count === 0}
                            accessibilityLabel={`${t(`pro.jugadas.filter.${option.value}`)}: ${option.count}`}
                        >
                            <Txt size={13} weight="bold" color={ink}>
                                {t(`pro.jugadas.filter.${option.value}`)}
                            </Txt>
                            <Txt size={15} condensed tabular color={ink} style={{ opacity: 0.8 }}>
                                {option.count}
                            </Txt>
                        </ChipButton>
                    );
                })}
            </ChipRow>
            {hasWinProb && (
                <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: game.away.color }} />
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: game.home.color, marginLeft: -2 }} />
                        <Txt size={11.5} tone="muted">
                            {t('pro.jugadas.legend.wpa')}
                        </Txt>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Gauge size={12} color={paint.pro.warn} />
                        <Txt size={11.5} tone="muted">
                            {t('pro.jugadas.legend.pressure')}
                        </Txt>
                    </View>
                </View>
            )}
        </View>
    );

    const empty = (
        <View style={[{ marginTop: 10, borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 32 }, shadow('card')]}>
            <Txt size={14} tone="muted" center>
                {t(filter === 'scoring' ? 'pro.jugadas.empty.scoring' : filter === 'key' ? 'pro.jugadas.empty.key' : 'pro.jugadas.empty.all')}
            </Txt>
        </View>
    );

    const footer =
        game.state === 'final' && counts.all > 0 ? (
            <View
                accessible
                accessibilityLabel={`${t('pro.jugadas.end', { count: counts.all })}: ${game.away.abbrev} ${game.away.runs}, ${game.home.abbrev} ${game.home.runs}`}
                style={[{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 12, rowGap: 4, borderRadius: 16, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14 }, shadow('card')]}
            >
                <Txt eyebrow>{t('pro.jugadas.end', { count: counts.all })}</Txt>
                <Txt size={21} condensed tabular>
                    {game.away.abbrev} {game.away.runs} – {game.home.runs} {game.home.abbrev}
                </Txt>
            </View>
        ) : null;

    const renderRow = (row: Row) => {
        let body: React.ReactNode;
        if (row.type === 'play')
            body = <PlayRow item={row.item} game={game} names={names} open={openPlays.has(row.item.atBat.i)} onToggle={() => togglePlay(row.item.atBat.i)} />;
        else if (row.type === 'challenge') body = <ChallengeCard challenge={row.challenge} names={names} game={game} />;
        else if (row.event.kind === 'pitching_change') body = <PitchingChangeCard event={row.event} names={names} game={game} pro={pro} />;
        else body = <EventChip event={row.event} item={row.item} names={names} game={game} />;
        return (
            <RowIn index={row.n} play={intro} style={{ paddingBottom: 6 }}>
                {body}
            </RowIn>
        );
    };

    const header = (section: HalfSection, sticky: boolean) => (
        <HalfHeader half={section.half} game={game} names={names} open={section.open} onToggle={() => toggleHalf(section)} stuck={sticky && stuck === section.key} />
    );

    if (!fill) {
        return (
            <View>
                {top}
                {sections.length === 0
                    ? empty
                    : sections.map((section) => (
                          <View key={section.key}>
                              {header(section, false)}
                              {section.data.map((row) => (
                                  <React.Fragment key={row.key}>{renderRow(row)}</React.Fragment>
                              ))}
                          </View>
                      ))}
                {footer}
            </View>
        );
    }

    return (
        <View style={{ flex: 1, marginHorizontal: -16, marginBottom: -16 }}>
            <SectionList
                ref={list}
                sections={sections}
                keyExtractor={(row) => row.key}
                renderItem={({ item }) => renderRow(item)}
                renderSectionHeader={({ section }) => header(section, true)}
                stickySectionHeadersEnabled
                ListHeaderComponent={top}
                ListEmptyComponent={empty}
                ListFooterComponent={footer ?? undefined}
                extraData={{ openPlays, intro, stuck }}
                onViewableItemsChanged={onViewable}
                viewabilityConfig={viewability}
                initialNumToRender={14}
                maxToRenderPerBatch={12}
                windowSize={11}
                onScrollToIndexFailed={(info) => {
                    // La fila todavía no se ha medido: se baja a lo aproximado y, ya montada, se vuelve a intentar
                    list.current?.getScrollResponder()?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
                    const target = pending.current;
                    if (target) setTimeout(() => list.current?.scrollToLocation({ ...target, viewPosition: 0.3, animated: false }), 150);
                    pending.current = null;
                }}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }}
            />
        </View>
    );
};
