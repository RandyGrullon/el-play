import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Cloud, Hourglass, MapPin, Play, ShieldCheck, Timer, Users, Wind } from 'lucide-react-native';
import type { GameDetail } from '../../../../types';
import type { GamePro } from '../../../../lib/pro/juego';
import { formatShortDate, formatTime } from '../../../../lib/format';
import { useColors } from '../../../../theme/theme';
import { alpha, radius } from '../../../../theme/tokens';
import { TeamLogo, Txt } from '../../../ui';
import { capitalize } from '../../../feed/DayChips';
import { GradientCard, shortName, toCelsius } from '../../kit';
import { clock, gamesBetween, phaseOf, seasonSeries, skyKey, toKmh, windKind, type SeriesSource } from '../previa/logica';

// Cabecera del final (debajo del marcador): chapa de serie y ficha del juego con duración (contra la liga),
// primer pitcheo, demora, clima, viento, árbitros y retos ABS. Sin asistencia: en LIDOM MLB siempre manda 0.
// Lo que no llega (sin los datos PRO del servidor: duración, árbitros, viento) no sale.

const Fact: React.FC<{ icon: (color: string) => React.ReactNode; label: string; children: React.ReactNode; span?: 1 | 2 | 3; text: string }> = ({ icon, label, children, span = 1, text }) => {
    const colors = useColors();
    return (
        <View accessible accessibilityLabel={`${label}: ${text}`} style={{ width: `${(span * 100) / 3}%`, paddingRight: 10, paddingVertical: 4, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {icon(colors.muted)}
                <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 1.2, flexShrink: 1 }}>
                    {label}
                </Txt>
            </View>
            <Txt size={12} weight="bold" style={{ marginTop: 2, lineHeight: 16 }}>
                {children}
            </Txt>
        </View>
    );
};

const OFFICIAL_KEYS: Record<string, string> = { 'Home Plate': 'hp', 'First Base': '1b', 'Second Base': '2b', 'Third Base': '3b' };

export const GameFacts: React.FC<{ game: GameDetail; pro?: GamePro; source: SeriesSource | null }> = ({ game, pro, source }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const lang = i18n.language;
    const size = 12;

    // Serie: la de la postemporada si es al mejor de N; si no, la particular de la temporada
    const playoff = pro?.schedule?.series ?? game.series ?? null;
    const isPlayoff = !!playoff && !!playoff.total && playoff.total > 1;
    const season = source ? seasonSeries(gamesBetween(source, game.away.id, game.home.id, phaseOf(game)), game.away.id, game.home.id, game.gamePk) : null;
    const leaderId = isPlayoff ? playoff!.leaderId : (season?.leaderId ?? null);
    const leader = leaderId === game.away.id ? game.away : leaderId === game.home.id ? game.home : null;
    const other = leader ? (leader === game.away ? game.home : game.away) : null;
    const wins = isPlayoff ? [playoff!.wins, playoff!.losses] : season ? [season.wins[leader?.id ?? game.away.id] ?? 0, season.wins[other?.id ?? game.home.id] ?? 0] : null;
    const next = season?.next ?? null;
    let seriesLine: string | null = null;
    if (wins && leader && other) seriesLine = `${leader.abbrev} ${wins[0]}-${wins[1]} ${other.abbrev}`;
    else if (wins && (wins[0] || wins[1])) seriesLine = t('pro.final.facts.tied', { wins: wins[0], losses: wins[1] });
    let seriesSub: string | null = null;
    if (isPlayoff && leader)
        seriesSub = playoff!.over ? t('pro.kit.game.seriesWon', { team: leader.abbrev, wins: playoff!.wins, losses: playoff!.losses }) : t('pro.kit.game.seriesLead', { team: leader.abbrev, wins: playoff!.wins, losses: playoff!.losses });
    else if (season && leader && season.played.length === 1) seriesSub = t('pro.final.facts.firstWin', { team: leader.abbrev });
    else if (season && season.played.length) seriesSub = t('pro.final.facts.played', { count: season.played.length });
    const nextText = next ? capitalize(`${formatShortDate(next.date, lang, source?.timeZone)} · ${formatTime(next.date, lang, source?.timeZone)}`) : null;

    // Ficha
    const info = pro?.game;
    const weather = info?.weather ?? null;
    const celsius = weather?.tempC ?? toCelsius(game.weather?.temp);
    const sky = skyKey(weather?.condition ?? game.weather?.condition);
    const wind = weather?.wind ?? null;
    const kind = windKind(wind?.text);
    const kmh = toKmh(wind?.mph);
    const windText = kind.kind ? t(`pro.previa.park.wind.${kind.kind}`, { field: kind.field ? t(`pro.previa.park.field.${kind.field}`) : '' }) : wind?.text;
    const duration = clock(info?.durationMin);
    const leaguePace = pro?.leaguePace?.minutesPerGame && pro.leaguePace.games > 0 ? clock(pro.leaguePace.minutesPerGame) : null;
    const delay = info?.delayMin ? clock(info.delayMin) : null;
    const officials = (info?.officials ?? []).filter((official) => OFFICIAL_KEYS[official.type]);
    const plate = officials.find((official) => official.type === 'Home Plate');
    const abs = pro?.abs;
    const weatherText = [celsius !== null && celsius !== undefined ? `${celsius} °C` : null, sky ? t(`pro.previa.park.sky.${sky}`).toLowerCase() : null].filter(Boolean).join(' ') || '—';
    const windLine = [kmh !== null ? `${kmh} km/h` : null, windText].filter(Boolean).join(' ');
    const absLine = abs
        ? t('pro.final.facts.absLine', { away: game.away.abbrev, awayOk: abs.away.ok, awayTotal: abs.away.ok + abs.away.fail, home: game.home.abbrev, homeOk: abs.home.ok, homeTotal: abs.home.ok + abs.home.fail })
        : '';
    const umpires = officials.map((official) => `${t(`pro.final.facts.official.${OFFICIAL_KEYS[official.type]}`)} ${official.type === 'Home Plate' ? official.name : shortName(official.name)}`);

    return (
        <View style={{ gap: 10 }}>
            {seriesLine ? (
                <GradientCard radius="tile" innerStyle={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 8, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                        <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
                            <TeamLogo team={game.away} size={24} />
                        </View>
                        <View style={{ marginLeft: -8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 2, borderColor: colors.surface }}>
                            <TeamLogo team={game.home} size={22} />
                        </View>
                    </View>
                    <View accessible accessibilityLabel={[isPlayoff ? playoff!.name || t('pro.final.facts.series') : t('pro.previa.series.title'), seriesLine, seriesSub].filter(Boolean).join(', ')} style={{ flex: 1, minWidth: 120 }}>
                        <Txt size={10} weight="extrabold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                            {isPlayoff ? playoff!.name || t('pro.final.facts.series') : t('pro.previa.series.title')}
                        </Txt>
                        <Txt size={15} weight="extrabold" numberOfLines={1} style={{ marginTop: 2, letterSpacing: -0.3 }}>
                            {seriesLine}
                        </Txt>
                        {seriesSub ? (
                            <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                                {seriesSub}
                            </Txt>
                        ) : null}
                    </View>
                    {nextText ? (
                        <View accessible accessibilityLabel={`${t('pro.final.facts.next')}: ${nextText}`} style={{ alignItems: 'flex-end' }}>
                            <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                                {t('pro.final.facts.next')}
                            </Txt>
                            <Txt size={12} weight="bold" numberOfLines={1} style={{ marginTop: 2 }}>
                                {nextText}
                            </Txt>
                        </View>
                    ) : null}
                </GradientCard>
            ) : null}

            <View accessibilityLabel={t('pro.kit.game.info')} style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4, borderRadius: radius.tile, backgroundColor: colors.raised, paddingLeft: 12, paddingRight: 2, paddingVertical: 10 }}>
                <Fact icon={(c) => <MapPin size={size} color={c} />} label={t('pro.final.facts.venue')} span={2} text={info?.venue.name ?? game.venue}>
                    {info?.venue.name ?? game.venue}
                </Fact>
                <Fact icon={(c) => <Cloud size={size} color={c} />} label={t('pro.final.facts.weather')} text={weatherText}>
                    {celsius !== null && celsius !== undefined ? `${celsius} °C` : '—'}
                    {sky ? (
                        <Txt size={12} weight="semibold" tone="muted">
                            {` ${t(`pro.previa.park.sky.${sky}`).toLowerCase()}`}
                        </Txt>
                    ) : null}
                </Fact>
                {duration ? (
                    <Fact icon={(c) => <Timer size={size} color={c} />} label={t('pro.final.facts.duration')} text={[duration, leaguePace ? t('pro.final.facts.league', { time: leaguePace }) : null].filter(Boolean).join(' ')}>
                        {duration}
                        {leaguePace ? (
                            <Txt size={12} weight="semibold" tone="muted">
                                {` ${t('pro.final.facts.league', { time: leaguePace })}`}
                            </Txt>
                        ) : null}
                    </Fact>
                ) : null}
                {info?.firstPitch ? (
                    <Fact icon={(c) => <Play size={size} color={c} />} label={t('pro.final.facts.firstPitch')} text={formatTime(info.firstPitch, lang)}>
                        {formatTime(info.firstPitch, lang)}
                    </Fact>
                ) : null}
                {delay ? (
                    <Fact icon={(c) => <Hourglass size={size} color={c} />} label={t('pro.final.facts.delay')} text={delay}>
                        {delay}
                    </Fact>
                ) : null}
                {wind ? (
                    <Fact icon={(c) => <Wind size={size} color={c} />} label={t('pro.final.facts.wind')} span={2} text={windLine}>
                        {windLine}
                    </Fact>
                ) : null}
                {abs ? (
                    <Fact icon={(c) => <ShieldCheck size={size} color={c} />} label={t('pro.final.facts.abs')} span={wind ? 1 : 2} text={absLine}>
                        {absLine}
                    </Fact>
                ) : null}
                {plate ? (
                    <View
                        accessible
                        accessibilityLabel={`${t('pro.final.facts.umpires')}: ${umpires.join(', ')}`}
                        style={{ width: '100%', marginTop: 4, paddingTop: 8, paddingRight: 10, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: alpha(colors.line, 0.15) }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Users size={size} color={colors.muted} />
                            <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                                {t('pro.final.facts.umpires')}
                            </Txt>
                        </View>
                        <Txt size={12} weight="bold" style={{ marginTop: 2, lineHeight: 16 }}>
                            {officials.map((official, index) => (
                                <Txt key={official.id} size={12} weight="bold">
                                    {index > 0 ? <Txt tone="muted">{' · '}</Txt> : null}
                                    <Txt size={12} weight="semibold" tone="muted">{`${t(`pro.final.facts.official.${OFFICIAL_KEYS[official.type]}`)} `}</Txt>
                                    {official.type === 'Home Plate' ? official.name : shortName(official.name)}
                                </Txt>
                            ))}
                        </Txt>
                    </View>
                ) : null}
            </View>
        </View>
    );
};
