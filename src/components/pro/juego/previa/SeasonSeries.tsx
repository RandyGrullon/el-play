import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { GameDetail } from '../../../../types';
import type { CalendarGame, ProPhaseId } from '../../../../types/pro-liga';
import type { StatsTeam } from '../../../../lib/stats';
import type { PreviaVenue } from '../../../../lib/pro/pantallas';
import { formatShortDate, formatTime, localeFor } from '../../../../lib/format';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { capitalize } from '../../../feed/DayChips';
import { GradientCard, ProSection, TeamChip, useInView } from '../../kit';
import { gamesBetween, ordinal, seasonSeries, shortVenue, venueByName, type SeriesSource } from './logica';
import { Eyebrow, SeenEnter, useDivider } from './shared';

// Serie particular de la temporada: cómo va entre los dos, una fila de mini marcadores (los dos últimos jugados, hoy
// y el próximo), cuántos faltan y cómo quedó la de la temporada pasada. Con el calendario corto del Lite se dice de
// qué fechas es.

interface SeasonSeriesProps {
    game: GameDetail;
    source: SeriesSource;
    /** Cara a cara de la temporada pasada (calendario PRO), si lo hay */
    previous?: SeriesSource;
    phase: ProPhaseId;
    venues: PreviaVenue[] | null;
    seasonLabel: string;
    previousLabel: string | null;
}

const MiniGame: React.FC<{ item: CalendarGame; number: number; today: boolean; teams: Record<string, StatsTeam>; timeZone: string; index: number; venue: string; seen: boolean }> = ({ item, number, today, teams, timeZone, index, venue, seen }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const final = item.state === 'final' && item.away.score !== null && item.home.score !== null;
    const when = final
        ? t('pro.previa.series.final', { date: formatShortDate(item.date, lang, timeZone) })
        : today
          ? t('pro.previa.series.todayAt', { time: formatTime(item.date, lang, timeZone) })
          : `${formatShortDate(item.date, lang, timeZone)} · ${formatTime(item.date, lang, timeZone)}`;
    const side = (key: 'away' | 'home') => {
        const team = teams[item[key].id];
        const won = final && !!item[key].isWinner;
        return { team, won, abbrev: team?.abbrev ?? String(item[key].id), score: final ? String(item[key].score) : '–' };
    };
    const lines = [side('away'), side('home')];
    const label = [t('pro.previa.series.nth', { n: ordinal(number, lang) }), today ? t('pro.previa.series.today') : null, ...lines.map((line) => `${line.abbrev} ${final ? line.score : ''}`.trim()), capitalize(when), shortVenue(venue)].filter(Boolean).join(', ');
    const body = (
        <View accessible accessibilityLabel={label} style={{ gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <Eyebrow numberOfLines={1} style={{ flexShrink: 1 }}>
                    {t('pro.previa.series.nth', { n: ordinal(number, lang) })}
                </Eyebrow>
                {today ? (
                    <View style={{ borderRadius: radius.pill, paddingHorizontal: 6, backgroundColor: colors.live }}>
                        <Txt size={10} weight="black" color="#14151a" style={{ lineHeight: 16, letterSpacing: 0.4 }}>
                            {t('pro.previa.series.today')}
                        </Txt>
                    </View>
                ) : null}
            </View>
            {lines.map((line, position) => (
                <View key={position} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {line.team ? <TeamLogo team={line.team} size={20} /> : null}
                    <Txt size={13} weight="extrabold" tone={final && !line.won ? 'muted' : 'ink'} style={{ flex: 1 }} numberOfLines={1}>
                        {line.abbrev}
                    </Txt>
                    <Txt condensed size={18} tabular tone={line.won ? 'ink' : 'muted'}>
                        {line.score}
                    </Txt>
                </View>
            ))}
            <View>
                <Txt size={11} tone="muted" numberOfLines={1}>
                    {capitalize(when)}
                </Txt>
                <Txt size={11} tone="muted" numberOfLines={1}>
                    {shortVenue(venue)}
                </Txt>
            </View>
        </View>
    );
    return (
        <SeenEnter seen={seen} index={index} step={80} style={{ flexGrow: 1, flexBasis: '45%', minWidth: 0 }}>
            {today ? (
                <GradientCard radius="tile" innerStyle={{ padding: 0 }} style={{ flexGrow: 1 }}>
                    {body}
                </GradientCard>
            ) : (
                <View style={{ flexGrow: 1, borderRadius: radius.tile, backgroundColor: colors.raised }}>{body}</View>
            )}
        </SeenEnter>
    );
};

export const SeasonSeries: React.FC<SeasonSeriesProps> = ({ game, source, previous, phase, venues, seasonLabel, previousLabel }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const divider = useDivider();
    const { setNode, onLayout, seen } = useInView();
    const lang = i18n.language;
    const a = game.away.id;
    const b = game.home.id;
    const series = seasonSeries(gamesBetween(source, a, b, phase), a, b, game.gamePk);
    const timeZone = source.timeZone;
    const leader = series.leaderId === a ? game.away : series.leaderId === b ? game.home : null;
    const wins = [series.wins[a] ?? 0, series.wins[b] ?? 0].sort((x, y) => y - x);
    const nextPlace = series.next ? (venueByName(venues, series.next.venue)?.city ?? shortVenue(series.next.venue)) : null;
    const nextDate = series.next ? new Date(series.next.date).toLocaleDateString(localeFor(lang), { weekday: 'long', day: 'numeric', timeZone }) : null;
    const lastGame = series.later[series.later.length - 1] ?? null;
    const calendarEnd = source.games[source.games.length - 1]?.date ?? null;
    const lastSeason = previous?.headToHead?.[phase]?.[a]?.[b] ?? null;

    // Mini marcadores: los dos últimos jugados, el de hoy y el próximo
    const shown: { item: CalendarGame; number: number; today: boolean }[] = [];
    series.games.forEach((item, position) => {
        const isToday = item.gamePk === game.gamePk;
        const keep = isToday || item === series.next || (item.state === 'final' && series.played.indexOf(item) >= series.played.length - 2);
        if (keep) shown.push({ item, number: position + 1, today: isToday });
    });

    let sentence = '';
    if (!series.played.length && series.index === 1) sentence = t('pro.previa.series.first');
    else if (series.index) sentence = t('pro.previa.series.nthToday', { n: ordinal(series.index, lang) });
    if (series.next && nextDate && nextPlace)
        sentence += ` ${series.index === 1 && !series.played.length ? t('pro.previa.series.secondAt', { date: nextDate, place: nextPlace }) : t('pro.previa.series.nextAt', { date: nextDate, place: nextPlace })}`;
    sentence = sentence.trim();

    return (
        <ProSection title={t('pro.previa.series.title')} aside={seasonLabel} headerOutside>
            <View
                accessible
                accessibilityLabel={`${leader ? `${leader.abbrev} ` : ''}${wins[0]}-${wins[1]} ${t('pro.previa.series.inSeason')}`}
                style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 }}
            >
                {leader ? <TeamChip team={leader} logo="start" size="sm" /> : null}
                <Txt condensed size={34} tabular style={{ lineHeight: 36 }}>{`${wins[0]}-${wins[1]}`}</Txt>
                <Txt size={15} weight="extrabold" style={{ letterSpacing: -0.3 }}>
                    {t('pro.previa.series.inSeason')}
                </Txt>
            </View>
            {sentence ? (
                <Txt size={13} tone="muted" style={{ marginTop: 6, marginBottom: 12, lineHeight: 18 }}>
                    {sentence}
                </Txt>
            ) : (
                <View style={{ height: 12 }} />
            )}

            {shown.length > 0 && (
                <View ref={setNode} onLayout={onLayout} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {shown.map((entry, index) => (
                        <MiniGame
                            key={entry.item.gamePk}
                            item={entry.item}
                            number={entry.number}
                            today={entry.today}
                            teams={source.teams}
                            timeZone={timeZone}
                            index={index + 1}
                            venue={venueByName(venues, entry.item.venue)?.name ?? entry.item.venue}
                            seen={seen}
                        />
                    ))}
                </View>
            )}

            {series.later.length > 0 && lastGame ? (
                <SeenEnter seen={seen} index={shown.length + 1} step={80} style={{ marginTop: 8, gap: 4, borderRadius: radius.tile, borderWidth: 1.5, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.2), paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Eyebrow>{t('pro.previa.series.more', { count: series.later.length })}</Eyebrow>
                    <Txt size={11} tone="muted" style={{ lineHeight: 15 }}>
                        {t('pro.previa.series.moreUntil', { date: formatShortDate(lastGame.date, lang, timeZone) })}
                        {calendarEnd ? ` · ${t('pro.previa.series.loadedUntil', { date: formatShortDate(calendarEnd, lang, timeZone) })}` : ''}
                    </Txt>
                </SeenEnter>
            ) : null}

            {source.window ? (
                <Txt size={11} tone="muted" style={{ marginTop: 10, lineHeight: 15 }}>
                    {t('pro.previa.window', { from: formatShortDate(`${source.window.from}T16:00:00Z`, lang), to: formatShortDate(`${source.window.to}T16:00:00Z`, lang) })}
                </Txt>
            ) : null}

            {lastSeason && previousLabel ? (
                <View style={[{ marginTop: 12, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, divider]}>
                    <Txt size={12} weight="semibold" tone="muted" style={{ flexShrink: 1 }}>
                        {t('pro.previa.series.lastSeason', { season: previousLabel })}
                    </Txt>
                    <Txt condensed size={16} tabular>
                        {lastSeason.wins === lastSeason.losses
                            ? t('pro.previa.series.lastTied', { wins: lastSeason.wins, losses: lastSeason.losses })
                            : `${lastSeason.wins > lastSeason.losses ? game.away.abbrev : game.home.abbrev} ${Math.max(lastSeason.wins, lastSeason.losses)}-${Math.min(lastSeason.wins, lastSeason.losses)}`}
                    </Txt>
                </View>
            ) : null}
        </ProSection>
    );
};
