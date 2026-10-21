// Portada de Juegos en modo PRO (diseño aprobado «pro-portada»). Orden:
// 1) fecha, «Actualizado hace…» y el título que abre la hoja de ligas; 2) pizarra de la jornada y avance de la
// temporada; 3) termómetro de la liga; 4) chips de días; 5) juegos en vivo arriba del feed; 6) por empezar (el primero
// cara a cara); 7) finales (la destacada con vaivén y jugada del juego); 8) lo mejor de la jornada; 9) calendario
// completo. Fuera de temporada, una cuenta regresiva. El Lite (index.tsx) no cambia: esto solo se monta en PRO.
// Lo que el servidor todavía no da (producción sin las rutas PRO) sale de lo que sí hay: posiciones y calendario del Lite.
import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays, CalendarX2, ChevronDown } from 'lucide-react-native';
import type { Schedule, ScheduleGame, StandingRow } from '../../../types';
import type { ScheduleGamePro } from '../../../types/pro-juego';
import type { FormGame } from '../../../types/pro-liga';
import { isNotPlayed } from '../../../lib/baseball';
import { formatLongDate, seasonLabel } from '../../../lib/format';
import { scheduleInterval } from '../../../lib/polling';
import { useStandings } from '../../../lib/queries';
import { useLiveSlate } from '../../../lib/pro/juego';
import { useProCalendar, useProSeason, useProStandings } from '../../../lib/pro/liga';
import { usePortadaGames } from '../../../lib/pro/pantallas';
import { isPermanent } from '../../../lib/pro/http';
import { useLeague } from '../../../state/league';
import { usePreferences } from '../../../state/preferences';
import { useColors } from '../../../theme/theme';
import { radius } from '../../../theme/tokens';
import { Screen } from '../../layout';
import { Card, ErrorState, OfflineState, ProBadge, Skeleton, Txt, useErrorText } from '../../ui';
import { waitingForNetwork } from '../../feed/DayChips';
import { Enter, LiveDot, ModuleHeader, ProButton, agoParts, toTime, useNow } from '../kit';
import { AgendaList } from './AgendaList';
import { BestOfDay } from './BestOfDay';
import { CalendarSheet } from './CalendarSheet';
import { DayChipsPro } from './DayChipsPro';
import { FinalCardCompact, FinalCardFull } from './FinalCards';
import { LeagueSheetPro } from './LeagueSheetPro';
import { LiveCardPro } from './LiveCardPro';
import { OffSeason } from './OffSeason';
import { Pizarra } from './Pizarra';
import { PreviewCardCompact, PreviewCardFull, type RowsById } from './PreviewCards';
import { Termometro, type ThermoTeam } from './Termometro';
import {
    bestOfDay,
    dayInfo,
    daySummary,
    featuredFinal,
    formFromSchedule,
    headToHead,
    lastGames,
    mergeLive,
    proDays,
    seasonProgress,
    shiftDay,
    splitDay,
    upcomingFromSchedule,
    upcomingGames,
    type DaySplit,
    type ThermoRow
} from './logic';
import { upperFirst, useInk, weekdayDay } from './shared';

export interface ProPortadaProps {
    schedule: UseQueryResult<Schedule>;
    byDay: Record<string, ScheduleGame[]>;
    days: string[];
    today: string;
    /** Día elegido (hoy si no se eligió otro) */
    day: string;
    timeZone: string;
    onSelectDay: (day: string) => void;
    team: number | null;
    onSelectTeam: (team: number | null) => void;
    /** Compartir el resultado (la hoja de compartir es de la pantalla) */
    onShare: (game: ScheduleGame) => void;
}

const SKELETON_WEIGHTS = [1, 1, 1.15, 1.45];

// «Actualizado hace 7 s» en su píldora: el UpdatedAgo del kit con el gris reforzado (4.5:1 sobre `raised` en claro)
const UpdatedPill: React.FC<{ at: number; staleAfter: number }> = ({ at, staleAfter }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const ink = useInk();
    const now = useNow(1000);
    const time = toTime(at);
    if (!Number.isFinite(time)) return null;
    const elapsed = Math.max(0, now - time);
    const stale = elapsed > staleAfter * 1000;
    const { count, unit } = agoParts(elapsed);
    return (
        <View style={{ height: 28, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 11 }}>
            <LiveDot tone={stale ? 'warn' : 'ok'} size={6} pulse={!stale} />
            <Txt size={11} weight="semibold" color={ink.mutedStrong} numberOfLines={1}>
                {t('pro.kit.updated.full', { time: t(`pro.kit.time.${unit}`, { count }) })}
            </Txt>
        </View>
    );
};

type PhaseData<R> = { type: 'lidom'; regular: R[]; roundRobin: R[]; final: R[]; activePhase: 'regular' | 'roundRobin' | 'final' } | { type: 'wbc'; pools: Record<string, R[]> } | { type: 'sdc'; teams: R[] };

/** Filas de posiciones de la fase en juego, en su orden (sirve igual para las PRO y las del Lite) */
const phaseRows = <R extends StandingRow>(data: PhaseData<R> | undefined): R[] => {
    if (!data) return [];
    if (data.type === 'lidom') return data[data.activePhase] ?? [];
    if (data.type === 'sdc') return data.teams;
    return Object.values(data.pools)
        .flat()
        .sort((a, b) => Number(b.pct) - Number(a.pct) || a.losses - b.losses);
};

export const ProPortada: React.FC<ProPortadaProps> = ({ schedule, byDay, days, today, day, timeZone, onSelectDay, team, onSelectTeam, onShare }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const ink = useInk();
    const errorText = useErrorText();
    const { width } = useWindowDimensions();
    const lang = i18n.language;
    const { activeLeague, leagueConfig } = useLeague();
    const { favoriteTeamId } = usePreferences();
    const [leaguesOpen, setLeaguesOpen] = useState(false);
    const [calendarOpen, setCalendarOpen] = useState(false);
    // Reloj de la portada (cada 30 s): tiles, próximos juegos y la hoja de ligas
    const now = useNow(30000);

    const proStandings = useProStandings(activeLeague);
    // Respaldo: las posiciones del Lite (la misma consulta de la pantalla Posiciones) mientras el servidor no tenga las PRO
    const liteStandings = useStandings(activeLeague);
    const season = useProSeason(activeLeague);
    const calendar = useProCalendar(activeLeague);
    const yesterday = shiftDay(today, -1);
    const tomorrow = shiftDay(today, 1);
    const allGames = schedule.data?.games;

    const rows = useMemo<ThermoRow[]>(() => {
        const pro = phaseRows(proStandings.data as PhaseData<ThermoRow> | undefined);
        return pro.length ? pro : phaseRows<ThermoRow>(liteStandings.data);
    }, [proStandings.data, liteStandings.data]);
    const rowsById: RowsById = useMemo(() => new Map(rows.map((row) => [row.team.id, row])), [rows]);

    // Equipos (logo y sigla de los rivales): los del calendario PRO o los del calendario del Lite
    const teams = useMemo(() => {
        const map = new Map<number, ThermoTeam>();
        for (const game of allGames ?? []) for (const side of [game.away, game.home]) map.set(side.id, { id: side.id, abbrev: side.abbrev, logo: side.logo, color: side.color });
        for (const item of Object.values(calendar.data?.teams ?? {})) map.set(item.id, { id: item.id, abbrev: item.abbrev, logo: item.logo, color: item.color });
        return map;
    }, [allGames, calendar.data]);
    const teamOf = (teamId: number) => teams.get(teamId);
    const abbrevOf = (teamId: number) => teams.get(teamId)?.abbrev ?? '';
    // Forma de cada equipo: la de toda la temporada (calendario PRO) o, si no llega, la de la semana del Lite
    const lastOf = (teamId: number): FormGame | undefined => (calendar.data ? lastGames(calendar.data, teamId, 1)[0] : formFromSchedule(allGames ?? [], teamId, timeZone)[0]);
    const formOf = (teamId: number) =>
        calendar.data
            ? { last: lastGames(calendar.data, teamId, 5), next: upcomingGames(calendar.data, teamId, now), complete: true }
            : allGames
              ? { last: formFromSchedule(allGames, teamId, timeZone).slice(0, 5), next: upcomingFromSchedule(allGames, teamId, now, timeZone), complete: false }
              : null;

    const selected = splitDay(byDay[day] ?? [], team, favoriteTeamId);
    const todaySplit = day === today ? selected : splitDay(byDay[today] ?? [], team, favoriteTeamId);
    const yesterdaySplit = splitDay(byDay[yesterday] ?? [], team, favoriteTeamId);
    // Con «Hoy» elegido y sin finales hoy, abajo salen las de ayer (como en el diseño)
    const showYesterday = day === today && selected.finals.length === 0 && yesterdaySplit.finals.length > 0;
    const finalsShown = [...selected.finals, ...(showYesterday ? yesterdaySplit.finals : [])].filter((game) => !isNotPlayed(game.detailedState));
    // Los juegos en vivo de hoy (todos, no solo los del filtro) comparten una lectura que se renueva cada 10 s,
    // y la fuente ligera de MLB (1-2 KB, cada 5 s) pone al día marcador, entrada, conteo y bases entre lecturas
    const liveAll = (byDay[today] ?? []).filter((game) => game.state === 'live').map((game) => game.gamePk);
    const livePortada = usePortadaGames(activeLeague, liveAll, true);
    const slate = useLiveSlate(activeLeague, liveAll.length > 0);
    // Cada tarjeta se queda con la lectura que va más adelante en el juego (no con la última en llegar): el marcador
    // no vuelve atrás ni repite el «+1» cuando una de las dos fuentes trae un dato viejo
    const liveIsLater = slate.dataUpdatedAt >= schedule.dataUpdatedAt;
    const liveShown = (day === today ? selected.live : []).map((game) => mergeLive(game as ScheduleGamePro, slate.data?.games.find((item) => item.gamePk === game.gamePk), liveIsLater));
    const updatedAt = Math.max(schedule.dataUpdatedAt, liveAll.length && slate.data ? slate.dataUpdatedAt : 0);
    const finalPortada = usePortadaGames(
        activeLeague,
        finalsShown.map((game) => game.gamePk),
        false
    );
    const summaryOf = (gamePk: number) => livePortada.data?.games[gamePk] ?? finalPortada.data?.games[gamePk] ?? null;

    const summary = daySummary(byDay, today, now);
    const progress = seasonProgress(season.data, today);
    const chipDays = useMemo(() => proDays(days, byDay, schedule.data?.startDate), [days, byDay, schedule.data?.startDate]);
    const infos = dayInfo(chipDays, byDay, team);
    const liveTeams = useMemo(() => new Set((byDay[today] ?? []).filter((game) => game.state === 'live').flatMap((game) => [game.away.id, game.home.id])), [byDay, today]);
    const leagueName = t(`leagues.${activeLeague}.name`);
    const filteredAbbrev = team !== null ? (teams.get(team)?.abbrev ?? null) : null;
    const suffix = filteredAbbrev ? ` · ${filteredAbbrev}` : '';
    const seasonText = seasonLabel(calendar.data?.season ?? proStandings.data?.season ?? liteStandings.data?.season ?? season.data?.season ?? Number(today.slice(0, 4)), activeLeague);
    // Serie particular: del calendario PRO (toda la temporada); sin él no se puede saber y no sale
    const h2hOf = (game: ScheduleGame) => (calendar.data ? headToHead(calendar.data, game.away.id, game.home.id) : null);

    // Cuándo se considera viejo el dato: un minuto con juegos en vivo; si no, lo que el calendario tarda en releerse
    const staleAfter = useMemo(() => Math.max(60, Math.round((scheduleInterval(schedule.data) * 1.5) / 1000)), [schedule.data]);

    const sectionTitle = (key: string) => {
        const date = weekdayDay(key, lang);
        if (key === today) return `${t('games.today')} · ${date}`;
        if (key === yesterday) return `${t('games.yesterday')} · ${date}`;
        if (key === tomorrow) return `${t('games.tomorrow')} · ${date}`;
        return upperFirst(date);
    };
    const countText = (split: DaySplit, kind: 'today' | 'past' | 'future') => {
        const parts: string[] = [];
        if (kind === 'future') {
            const total = split.previews.length + split.finals.length;
            parts.push(total ? t('pro.portada.days.games', { count: total }) : t('pro.portada.days.none'));
        } else {
            // Hoy los juegos en vivo van arriba de la sección: la cuenta es de lo que hay dentro
            if (split.live.length && kind !== 'today') parts.push(t('pro.portada.feed.live', { count: split.live.length }));
            if (split.previews.length) parts.push(t('pro.portada.feed.upcoming', { count: split.previews.length }));
            if (split.finals.length) parts.push(t('pro.portada.feed.finals', { count: split.finals.length }));
            if (!parts.length) parts.push(t('pro.portada.days.none'));
        }
        return parts.join(' · ') + suffix;
    };

    const previews = (list: ScheduleGame[], full: boolean) =>
        list.map((game, index) => (
            <Enter key={game.gamePk} index={index}>
                {full && index === 0 ? (
                    <PreviewCardFull game={game} rows={rowsById} timeZone={timeZone} today={today} season={seasonText} lastOf={lastOf} h2h={h2hOf(game)} abbrevOf={abbrevOf} />
                ) : (
                    <PreviewCardCompact game={game} rows={rowsById} timeZone={timeZone} />
                )}
            </Enter>
        ));
    const finals = (list: ScheduleGame[], offset = 0) => {
        const featured = featuredFinal(list, favoriteTeamId);
        const ordered = featured ? [featured, ...list.filter((game) => game !== featured)] : list;
        return ordered.map((game, index) => {
            const data = summaryOf(game.gamePk);
            return (
                <Enter key={game.gamePk} index={index + offset}>
                    {game === featured ? (
                        <FinalCardFull game={game as ScheduleGamePro} summary={data} loading={finalPortada.isPending && finalPortada.fetchStatus !== 'idle'} timeZone={timeZone} onShare={onShare} />
                    ) : (
                        <FinalCardCompact game={game as ScheduleGamePro} summary={data} timeZone={timeZone} />
                    )}
                </Enter>
            );
        });
    };

    const nextDay = days.find((key) => key > day && byDay[key]?.length);
    const empty = (
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 24 }}>
            <CalendarX2 size={32} color={colors.faint} />
            <Txt size={14} weight="semibold" center>
                {team !== null && (byDay[day] ?? []).length ? t('pro.portada.feed.noneForTeam', { team: filteredAbbrev ?? '' }) : t('pro.portada.feed.dayOff', { league: leagueName })}
            </Txt>
            {nextDay && (
                <Pressable onPress={() => onSelectDay(nextDay)} accessibilityRole="button" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt size={14} weight="bold" color={colors.accentInk} center style={{ flexShrink: 1 }}>
                        {t('games.nextDay', { date: formatLongDate(nextDay, lang) })}
                    </Txt>
                    <ArrowRight size={16} color={colors.accentInk} />
                </Pressable>
            )}
        </Card>
    );

    // Lo mejor de la jornada: hoy si ya hay finales; si no, la de ayer (con «Hoy» elegido); en un día pasado, ese día
    const bestDay = day === today ? (selected.finals.length ? today : showYesterday ? yesterday : null) : day < today ? day : null;
    const bestGames = bestDay ? finalsShown.filter((game) => (byDay[bestDay] ?? []).includes(game)) : [];
    const best = bestDay ? bestOfDay(bestGames.map((game) => summaryOf(game.gamePk))).filter((item) => team === null || item.performer.teamId === team) : [];
    const bestAside = bestDay
        ? `${bestDay === today ? t('games.today').toLowerCase() : bestDay === yesterday ? t('games.yesterday').toLowerCase() : weekdayDay(bestDay, lang)} · ${t('pro.portada.days.games', { count: bestGames.length })}`
        : '';

    const section = (key: string, aside: string, children: React.ReactNode, gap = 14) => (
        <View key={key} accessibilityLabel={sectionTitle(key)} style={{ gap }}>
            <ModuleHeader title={sectionTitle(key)} aside={aside} />
            {children}
        </View>
    );

    let feed: React.ReactNode;
    if (day === today) {
        const hasToday = selected.previews.length + selected.finals.length > 0;
        feed = (
            <>
                {liveShown.map((game, index) => (
                    <Enter key={game.gamePk} index={index}>
                        <LiveCardPro game={game} summary={summaryOf(game.gamePk)} loading={livePortada.isPending && livePortada.fetchStatus !== 'idle'} />
                    </Enter>
                ))}
                {(hasToday || !liveShown.length) &&
                    section(
                        today,
                        countText(todaySplit, 'today'),
                        hasToday ? (
                            <>
                                {previews(selected.previews, true)}
                                {finals(selected.finals, selected.previews.length)}
                            </>
                        ) : (
                            empty
                        )
                    )}
                {showYesterday && section(yesterday, countText(yesterdaySplit, 'past'), finals(yesterdaySplit.finals))}
            </>
        );
    } else if (day < today) {
        feed = section(
            day,
            countText(selected, 'past'),
            selected.previews.length + selected.finals.length + selected.live.length ? (
                <>
                    {selected.live.map((game) => (
                        <LiveCardPro key={game.gamePk} game={game as ScheduleGamePro} summary={summaryOf(game.gamePk)} />
                    ))}
                    {finals(selected.finals)}
                    {previews(selected.previews, false)}
                </>
            ) : (
                empty
            )
        );
    } else {
        const upcoming = [...selected.previews, ...selected.finals].sort((a, b) => a.date.localeCompare(b.date));
        feed = section(
            day,
            countText(selected, 'future'),
            upcoming.length ? (
                <Enter>
                    <AgendaList games={upcoming} timeZone={timeZone} />
                </Enter>
            ) : (
                empty
            ),
            12
        );
    }

    const loaded = !!schedule.data;
    const inSeason = loaded && schedule.data!.games.length > 0;
    // «Hoy en LIDOM» con la temporada en juego; fuera de temporada (o con otro día elegido), el nombre solo
    const title = day === today && (inSeason || !loaded) ? t('games.todayIn', { league: leagueName }) : leagueName;
    // Como clamp(28px, 9vw, 34px) de la web
    const titleSize = Math.min(34, Math.max(28, width * 0.09));

    let body: React.ReactNode;
    if (waitingForNetwork(schedule)) body = <OfflineState />;
    else if (schedule.isPending)
        body = (
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ gap: 24 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    {SKELETON_WEIGHTS.map((weight, index) => (
                        <Skeleton key={index} height={106} round={radius.tile} style={{ flex: weight, flexBasis: 0, width: undefined }} />
                    ))}
                </View>
                <Skeleton height={118} />
                <Skeleton height={52} round={radius.pill} />
                <Skeleton height={320} />
            </View>
        );
    else if (schedule.isError && !schedule.data) body = <ErrorState message={errorText(schedule.error)} onRetry={() => schedule.refetch()} />;
    else if (inSeason)
        body = (
            <>
                <Pizarra summary={summary} progress={progress} league={activeLeague} today={today} timeZone={timeZone} />
                {rows.length > 1 && <Termometro rows={rows} live={liveTeams} selected={team} onSelect={onSelectTeam} formOf={formOf} teamOf={teamOf} today={today} timeZone={timeZone} />}
                <DayChipsPro days={infos} selected={day} today={today} onSelect={onSelectDay} />
                {feed}
                <BestOfDay items={best} games={bestGames} aside={bestAside} />
                <View style={{ alignItems: 'center', gap: 10 }}>
                    <ProButton label={t('pro.portada.footer.calendar')} icon={(color) => <CalendarDays size={18} color={color} />} onPress={() => setCalendarOpen(true)} style={{ alignSelf: 'center' }} />
                    <Txt size={11} weight="semibold" tone="muted" center>
                        {t('pro.portada.footer.source')}
                    </Txt>
                </View>
            </>
        );
    else
        body = (
            <Enter>
                <OffSeason league={activeLeague} leagueName={leagueName} shortName={leagueConfig.shortName} color={leagueConfig.inkLight} season={season.data} unknown={!season.data && isPermanent(season.error)} timeZone={timeZone} />
            </Enter>
        );

    return (
        <>
            <Screen
                padded={false}
                onRefresh={() => Promise.all([schedule.refetch(), proStandings.refetch(), liteStandings.refetch(), livePortada.refetch(), finalPortada.refetch(), calendar.refetch()])}
                contentStyle={{ gap: 0 }}
            >
                <View style={{ gap: 2, paddingHorizontal: 16, paddingTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Txt size={14} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                            {upperFirst(formatLongDate(day, lang))}
                        </Txt>
                        {schedule.dataUpdatedAt > 0 && <UpdatedPill at={updatedAt} staleAfter={staleAfter} />}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10 }}>
                        <Pressable
                            onPress={() => setLeaguesOpen(true)}
                            accessibilityRole="button"
                            accessibilityLabel={t('pro.portada.header.chooseAria', { title })}
                            style={({ pressed }) => ({ minHeight: 48, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.8 : 1 })}
                        >
                            <Txt size={titleSize} weight="black" accessibilityRole="header" style={{ flexShrink: 1, lineHeight: titleSize * 1.1, letterSpacing: -0.5 }}>
                                {title}
                            </Txt>
                            <ChevronDown size={26} color={ink.mutedStrong} style={{ marginTop: 4 }} />
                        </Pressable>
                        <ProBadge />
                    </View>
                </View>
                <View style={{ gap: 24, paddingHorizontal: 16, paddingTop: 16, maxWidth: 720, width: '100%', alignSelf: 'center' }}>{body}</View>
            </Screen>
            <LeagueSheetPro open={leaguesOpen} onClose={() => setLeaguesOpen(false)} now={now} />
            <CalendarSheet open={calendarOpen} onClose={() => setCalendarOpen(false)} league={activeLeague} team={team} today={today} timeZone={timeZone} fallback={allGames ?? []} />
        </>
    );
};
