// Posiciones del modo PRO (igual que la de la web): píldoras de fase con su avance, la carrera por la clasificación
// con los juegos de hoy, la tabla rediseñada (Resumen · Carreras · Situaciones), los enfrentamientos directos y la
// última fecha en cifras. En el Clásico, un grupo por tabla con DIF; en la Serie del Caribe, una tabla.
// Sin /api/v2/pro/standings (producción todavía) se usan las posiciones del Lite y salen solo los bloques con datos.
import React, { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react-native';
import type { LeagueId, Standings, StandingRow } from '../../../types';
import type { ProPhaseId, SeasonCalendar, StandingsProInfo } from '../../../types/pro-liga';
import { useProCalendar, useProStandings } from '../../../lib/pro/liga';
import { isPermanent } from '../../../lib/pro/http';
import { seasonLabel, todayKey } from '../../../lib/format';
import { teamDisplayName } from '../../../lib/teams';
import { useLeague } from '../../../state/league';
import { usePreferences } from '../../../state/preferences';
import { useColors, useTheme } from '../../../theme/theme';
import { alpha, radius } from '../../../theme/tokens';
import { Screen } from '../../layout';
import { ErrorState, OfflineState, Skeleton, TeamLogo, Txt, useErrorText } from '../../ui';
import { HeaderButton, poolTitle, shareText, waitingForNetwork } from '../../stats/common';
import { StandingsTable } from '../StandingsTable';
import { ChipRow, GrowBar, LiveDot, ModuleHeader, ProNote, ProSection, ScreenTitle, StatTile, fmtSigned, useProColors } from '../kit';
import { cutStatus, headToHeadMatrix, lastDayNumbers, marginKind, overFive, pairsPending, pendingGames, phaseProgress, raceModel, upcomingDay, type TableRow } from './logic';
import { dayRangeText, longDay, shortDay, useLiteStandings } from './data';
import { RaceChart, type RaceTeam } from './RaceChart';
import { TodayGames } from './TodayGames';
import { HeadToHead } from './HeadToHead';

type LidomPhase = 'regular' | 'roundRobin' | 'final';
const LIDOM_PHASES: LidomPhase[] = ['regular', 'roundRobin', 'final'];

/** Las posiciones PRO o las del Lite: misma forma, con `pro` solo en las PRO */
type AnyStandings = Standings & { pro?: StandingsProInfo };
type LidomStandings = Extract<AnyStandings, { type: 'lidom' }>;

const teamOf = (row: StandingRow): RaceTeam => ({ id: row.team.id, abbrev: row.team.abbrev, name: row.team.name, color: row.team.color, logo: row.team.logo });

/** La tabla en texto para compartir: «1. Estrellas 1-0 · 2. Leones 0-0 …» (como el Lite) */
const tableText = (rows: StandingRow[], title: string, lang: string) =>
    [title, ...rows.map((row) => `${row.rank}. ${teamDisplayName(row.team, lang)} ${row.wins}-${row.losses}${row.gamesBack !== '-' ? ` (${row.gamesBack})` : ''}`), '· El Play'].join('\n');

// ---------------------------------------------------------------- fase: píldoras, nota y avance

const PhasePill: React.FC<{ label: string; active: boolean; empty: boolean; onPress: () => void; accessibilityLabel?: string }> = ({ label, active, empty, onPress, accessibilityLabel }) => {
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={accessibilityLabel ?? label}
            style={({ pressed }) => ({
                height: 44,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
                ...(active
                    ? { backgroundColor: colors.ink }
                    : { borderWidth: 1, borderStyle: empty ? ('dashed' as const) : ('solid' as const), borderColor: alpha(colors.line, empty ? 0.25 : 0.15) })
            })}
        >
            <Txt size={13} weight="bold" color={active ? colors.bg : empty ? colors.muted : colors.ink} numberOfLines={1}>
                {label}
            </Txt>
        </Pressable>
    );
};

const PhasePicker: React.FC<{ data: LidomStandings; phase: LidomPhase; onChange: (phase: LidomPhase) => void }> = ({ data, phase, onChange }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const info = data.pro?.phases;
    const played = (id: LidomPhase) => (info ? info[id].played > 0 : data[id].some((row) => row.wins + row.losses > 0));
    const perTeam = phase === 'regular' ? (info?.regular.perTeam ?? data.pro?.regularSeasonGames ?? null) : phase === 'roundRobin' ? (info?.roundRobin.perTeam ?? data.roundRobinInfo?.games ?? null) : null;
    const progress = phaseProgress(data[phase], perTeam);
    const finalTotal = info?.final.total ?? null;
    const finalPlayed = info?.final.played ?? 0;
    const detail =
        phase === 'final'
            ? [finalTotal ? t('pro.posiciones.progress.bestOf', { count: finalTotal }) : t('standings.finalNote'), info ? t('pro.posiciones.progress.played', { count: finalPlayed }) : null]
            : [progress.perTeam ? t('pro.posiciones.progress.perTeam', { count: progress.perTeam }) : null, t('pro.posiciones.progress.played', { count: progress.played })];

    return (
        <View style={{ gap: 8 }}>
            <ChipRow label={t('standings.phase')}>
                {LIDOM_PHASES.map((id) => {
                    const empty = !played(id);
                    return (
                        <PhasePill
                            key={id}
                            label={t(`standings.${id}`)}
                            active={phase === id}
                            empty={empty}
                            onPress={() => onChange(id)}
                            accessibilityLabel={empty ? t('pro.posiciones.phaseEmpty', { phase: t(`standings.${id}`) }) : undefined}
                        />
                    );
                })}
            </ChipRow>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Txt size={13} tone="muted" style={{ flex: 1, lineHeight: 18 }}>
                    <Txt size={13} weight="extrabold" color={colors.accentInk}>
                        {t(`standings.${phase}`)}
                    </Txt>
                    {' · '}
                    {detail.filter(Boolean).join(' · ')}
                </Txt>
                {phase !== 'final' && progress.share !== null && (
                    <View accessible accessibilityRole="image" accessibilityLabel={t('pro.posiciones.progress.aria', { played: progress.played, total: progress.perTeam })} style={{ width: 64 }}>
                        <GrowBar value={progress.share} height={6} />
                    </View>
                )}
            </View>
        </View>
    );
};

// ---------------------------------------------------------------- carrera por la clasificación

const RaceSection: React.FC<{ calendar: SeasonCalendar; phase: 'regular' | 'roundRobin'; rows: TableRow[]; advance: number | null; timeZone: string }> = ({ calendar, phase, rows, advance, timeZone }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const { favoriteTeamId } = usePreferences();
    const narrow = useWindowDimensions().width < 360;
    const [selected, setSelected] = useState<number | null>(null);
    const lang = i18n.language;
    const teamIds = rows.map((row) => row.team.id);
    // El React Compiler ya memoriza estos cálculos
    const model = raceModel(calendar.race[phase], teamIds, advance);
    const teams = Object.fromEntries(rows.map((row) => [row.team.id, teamOf(row)]));
    const ranks = Object.fromEntries(rows.map((row) => [row.team.id, row.rank]));
    const today = todayKey(timeZone);
    if (!model) return null;
    const upcoming = upcomingDay(calendar, phase, today);
    const pending = pendingGames(calendar, phase, today);

    const last = model.dates.length;
    const pendingDays = [...new Set(pending.map((game) => game.day))].sort();
    const firstDayCount = pendingDays.length ? pending.filter((game) => game.day === pendingDays[0]).length : 0;
    const pendingInfo = pendingDays.length
        ? {
              title: t('pro.posiciones.race.pending'),
              sub: pendingDays[0] === today ? t('pro.posiciones.race.pendingToday', { count: firstDayCount }) : t('pro.posiciones.race.pendingDay', { count: firstDayCount, day: shortDay(pendingDays[0], lang) }),
              ticks: pendingDays.slice(0, 2).map((day) => ({ label: day === today ? t('pro.posiciones.race.today') : shortDay(day, lang), strong: day === today }))
          }
        : null;

    const overText = (value: number) => (value === 0 ? '.500' : fmtSigned(value));
    const summary = model.lines.map((line) => `${teams[line.teamId]?.abbrev} ${overText(line.values[last])}`).join(', ');
    const chosen = selected !== null ? rows.find((row) => row.team.id === selected) : undefined;
    const status = chosen ? cutStatus(chosen, advance) : null;
    const statusText = !status ? '' : status.kind === 'behind' ? t('pro.posiciones.race.status.behind', { count: status.games, advance }) : t(`pro.posiciones.race.status.${status.kind}`, { advance });
    const toggle = (id: number) => setSelected((current) => (current === id ? null : id));
    const favoriteHere = favoriteTeamId !== null && teamIds.includes(favoriteTeamId);
    const columns = narrow ? 3 : 6;

    return (
        <ProSection title={t('pro.posiciones.race.title')} gradient bodyStyle={{ gap: 12 }}>
            <Txt size={14} tone="muted" style={{ lineHeight: 19, marginTop: -4 }}>
                {t(phase === 'regular' ? 'pro.posiciones.race.leadRegular' : 'pro.posiciones.race.leadRoundRobin', { count: advance ?? 0 })}
                {favoriteHere ? ` ${t('pro.posiciones.race.favorite')}` : ''}
            </Txt>
            <View accessibilityLiveRegion="polite" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, backgroundColor: colors.raised, paddingHorizontal: 16, paddingVertical: 8 }}>
                {chosen ? (
                    <>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: chosen.team.color }} />
                        <Txt size={14} weight="black" tabular>
                            {t('pro.posiciones.race.readout', { abbrev: chosen.team.abbrev, record: `${chosen.wins}-${chosen.losses}`, over: overText(overFive(chosen)) })}
                        </Txt>
                        <Txt size={12} weight="semibold" tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                            {t('pro.posiciones.race.place', { rank: chosen.rank })}
                            {statusText ? ` · ${statusText}` : ''}
                        </Txt>
                    </>
                ) : (
                    <Txt size={14} weight="semibold" tone="muted" numberOfLines={2}>
                        {t('pro.posiciones.race.hint')}
                    </Txt>
                )}
            </View>
            <RaceChart
                model={model}
                teams={teams}
                label={t('pro.posiciones.race.aria', { summary })}
                selected={selected}
                favorite={favoriteHere ? favoriteTeamId : null}
                onSelect={toggle}
                dateLabel={(day) => shortDay(day, lang)}
                startLabel={t('pro.posiciones.race.start')}
                pending={pendingInfo}
                cutLabel={model.cut && advance ? t('pro.posiciones.race.cut', { advance }) : undefined}
            />
            <View accessibilityLabel={t('pro.posiciones.race.teams')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {rows.map((row) => {
                    const active = selected === row.team.id;
                    return (
                        <Pressable
                            key={row.team.id}
                            onPress={() => toggle(row.team.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={t('pro.posiciones.race.isolate', { name: row.team.name })}
                            style={{
                                width: `${100 / columns}%`,
                                flexGrow: 1,
                                flexBasis: 0,
                                minWidth: narrow ? 72 : 44,
                                minHeight: 52,
                                borderRadius: 16,
                                borderWidth: 1,
                                borderColor: active ? row.team.color : alpha(colors.line, 0.1),
                                backgroundColor: active ? colors.raised : 'transparent',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 2,
                                opacity: selected !== null && !active ? 0.6 : 1
                            }}
                        >
                            <TeamLogo team={row.team} size={22} />
                            <Txt size={11} weight="extrabold">
                                {row.team.abbrev}
                            </Txt>
                        </Pressable>
                    );
                })}
            </View>
            {upcoming && (
                <View style={{ gap: 8, marginTop: 6 }}>
                    <ModuleHeader title={upcoming.day === today ? t('pro.posiciones.today.title', { day: shortDay(upcoming.day, lang) }) : t('pro.posiciones.today.titleNext', { day: shortDay(upcoming.day, lang) })} />
                    <TodayGames games={upcoming.games} teams={teams} ranks={ranks} advance={advance} timeZone={timeZone} />
                </View>
            )}
            {last < 5 && (
                <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                    {t('pro.posiciones.race.early', { count: last })}
                </Txt>
            )}
        </ProSection>
    );
};

// ---------------------------------------------------------------- la fecha en cifras

const DayNumbers: React.FC<{ calendar: SeasonCalendar; phase: ProPhaseId; teams: Record<number, RaceTeam> }> = ({ calendar, phase, teams }) => {
    const { t, i18n } = useTranslation();
    const narrow = useWindowDimensions().width < 360;
    const numbers = lastDayNumbers(calendar, phase);
    if (!numbers) return null;
    const blowout = numbers.blowout;
    const winner = blowout ? ((blowout.game.away.score ?? 0) > (blowout.game.home.score ?? 0) ? blowout.game.away : blowout.game.home) : null;
    const loser = blowout && winner ? (winner === blowout.game.away ? blowout.game.home : blowout.game.away) : null;
    // Un juego de 1 a 4 carreras no es una paliza: es solo el mayor margen de la fecha
    const kind = marginKind(blowout?.margin);
    const tile = { flex: 1, flexBasis: 0 } as const;
    const third =
        blowout && winner && loser && kind ? (
            <StatTile
                countTo={blowout.margin}
                format={(value) => `+${Math.round(value)}`}
                tone="up"
                label={t(kind === 'blowout' ? 'pro.posiciones.day.blowout' : 'pro.posiciones.day.margin', { winner: teams[winner.id]?.abbrev ?? '', loser: teams[loser.id]?.abbrev ?? '', score: `${winner.score}-${loser.score}` })}
                style={tile}
            />
        ) : (
            <StatTile value="—" label={t('pro.posiciones.day.noBlowout')} style={tile} />
        );
    return (
        <ProSection title={numbers.number ? t('pro.posiciones.day.title', { number: numbers.number }) : t('pro.posiciones.day.titleDay', { day: shortDay(numbers.day, i18n.language) })}>
            <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <StatTile countTo={numbers.games} label={t('pro.posiciones.day.games', { count: numbers.games })} style={tile} />
                    <StatTile countTo={numbers.runsPerGame} format={(value) => value.toFixed(1)} label={t('pro.posiciones.day.runs')} style={tile} />
                    {!narrow && third}
                </View>
                {/* A 320 px tres tiles no dejan sitio a «CARRERAS»: el tercero baja */}
                {narrow && <View style={{ flexDirection: 'row' }}>{third}</View>}
            </View>
        </ProSection>
    );
};

// ---------------------------------------------------------------- enfrentamientos directos

const HeadToHeadSection: React.FC<{ calendar: SeasonCalendar; phase: 'regular' | 'roundRobin'; rows: TableRow[]; timeZone: string }> = ({ calendar, phase, rows, timeZone }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const { isDark } = useTheme();
    const pro = useProColors();
    const today = todayKey(timeZone);
    const teams = rows.map(teamOf);
    const matrix = rows.length > 2 ? headToHeadMatrix(calendar, phase, teams.map((team) => team.id), today) : null;
    if (!matrix || !matrix.some((line) => line.some((cell) => cell && (cell.played > 0 || cell.next)))) return null;
    const pairs = pairsPending(matrix);
    const strong = (color: string) => (isDark ? alpha(color, 0.55) : color);
    const legend = (color: string, text: string, border?: boolean) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: color, borderWidth: border ? 1 : 0, borderColor: alpha(colors.line, 0.2) }} />
            <Txt size={11} weight="semibold" tone="muted">
                {text}
            </Txt>
        </View>
    );
    return (
        <ProSection title={t('pro.posiciones.h2h.title')} bodyStyle={{ gap: 10, paddingHorizontal: 12 }}>
            <Txt size={14} tone="muted" style={{ lineHeight: 19, marginTop: -4 }}>
                {t('pro.posiciones.h2h.lead')}
            </Txt>
            <HeadToHead teams={teams} matrix={matrix} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                {legend(strong(pro.up), t('pro.posiciones.h2h.won'))}
                {legend(strong(pro.down), t('pro.posiciones.h2h.lost'))}
                {legend(colors.raised, t('pro.posiciones.h2h.none'), true)}
            </View>
            <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                {pairs.pending === 0
                    ? t('pro.posiciones.h2h.allMet', { count: pairs.pairs })
                    : pairs.by
                      ? t('pro.posiciones.h2h.pendingBy', { ...dayRangeText(today, pairs.by, i18n.language), count: pairs.pairs })
                      : t('pro.posiciones.h2h.pendingCount', { count: pairs.pending })}
            </Txt>
        </ProSection>
    );
};

// ---------------------------------------------------------------- pantalla

export const ProStandings: React.FC<{ tabs: React.ReactNode }> = ({ tabs }) => {
    const { t, i18n } = useTranslation();
    const errorText = useErrorText();
    const { activeLeague } = useLeague();
    const proQuery = useProStandings(activeLeague);
    // Producción todavía sin la ruta PRO: las posiciones del Lite (sin `pro`: sin insignias, esperado ni situaciones nuevas)
    const routeMissing = !proQuery.data && isPermanent(proQuery.error);
    const lite = useLiteStandings(activeLeague, routeMissing);
    const query = routeMissing ? lite : proQuery;
    const data = (proQuery.data ?? (routeMissing ? lite.data : undefined)) as AnyStandings | undefined;
    const calendar = useProCalendar(activeLeague, undefined, !!data && !routeMissing);
    const [picked, setPicked] = useState<{ league: LeagueId; phase: LidomPhase | null }>({ league: activeLeague, phase: null });
    // Otra liga: vuelve a la fase activa
    const phase = picked.league === activeLeague ? picked.phase : null;
    const setPhase = (next: LidomPhase) => setPicked({ league: activeLeague, phase: next });

    const leagueName = t(`leagues.${activeLeague}.name`);
    const season = data ? seasonLabel(data.season, activeLeague) : '';
    const activePhase: LidomPhase | null = data?.type === 'lidom' ? (phase ?? data.activePhase) : null;
    const rows = (!data ? [] : data.type === 'lidom' ? data[activePhase!] : data.type === 'sdc' ? data.teams : []) as TableRow[];
    const cal = calendar.data && calendar.data.league === activeLeague && calendar.data.season === data?.season ? calendar.data : undefined;
    const timeZone = cal?.timeZone ?? 'America/Santo_Domingo';
    const teams = Object.fromEntries(rows.map((row) => [row.team.id, teamOf(row)]));

    const advance = !data
        ? null
        : data.type === 'lidom'
          ? activePhase === 'regular'
              ? (data.pro?.advance?.regular ?? 4)
              : activePhase === 'roundRobin'
                ? (data.roundRobinInfo?.advance ?? data.pro?.advance?.roundRobin ?? 2)
                : null
          : data.type === 'sdc'
            ? 4
            : 2;
    const cutLabel = !data ? '' : data.type === 'lidom' ? (activePhase === 'regular' ? t('standings.cutRoundRobin') : t('standings.cutFinal')) : t('standings.cutNext');
    const share = (tableRows: StandingRow[], subtitle: string) => shareText(tableText(tableRows, `${t('standings.title')} ${leagueName} · ${subtitle}`, i18n.language));

    // «Al día: 3 finales del viernes 16 de octubre» (o en vivo)
    const freshness = (() => {
        if (data?.pro?.live) return { live: true, text: t('pro.posiciones.live') };
        const finals = (cal?.games ?? []).filter((game) => game.state === 'final');
        if (!finals.length) return null;
        const day = finals.reduce((latest, game) => (game.day > latest ? game.day : latest), finals[0].day);
        const count = finals.filter((game) => game.day === day).length;
        return { live: false, text: t('pro.posiciones.upToDate', { count, day: longDay(day, i18n.language) }) };
    })();

    const racePhase = activePhase === 'regular' || activePhase === 'roundRobin' ? activePhase : null;

    return (
        <Screen
            onRefresh={async () => {
                await Promise.all([query.refetch(), routeMissing ? null : calendar.refetch()]);
            }}
        >
            {tabs}
            <ScreenTitle
                eyebrow={`${leagueName}${season ? ` · ${t('common.season', { season })}` : ''}`}
                title={t('standings.title')}
                actions={
                    rows.length > 0 ? (
                        <HeaderButton label={t('share.shareTable')} onPress={() => share(rows, `${activePhase ? t(`standings.${activePhase}`) : leagueName} · ${season}`)}>
                            <ShareIcon />
                        </HeaderButton>
                    ) : null
                }
                subtitle={
                    freshness ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <LiveDot tone={freshness.live ? 'live' : 'ok'} pulse={freshness.live} />
                            <Txt size={13} tone="muted" style={{ flexShrink: 1 }}>
                                {freshness.text}
                            </Txt>
                        </View>
                    ) : undefined
                }
            />

            {data?.isPreviousSeason && <ProNote>{t('standings.previousSeason')}</ProNote>}

            {waitingForNetwork(query) ? (
                <OfflineState />
            ) : query.isPending || (!data && !query.isError) ? (
                <View style={{ gap: 12 }}>
                    <Skeleton height={44} round={22} />
                    <Skeleton height={420} />
                    <Skeleton height={360} />
                </View>
            ) : query.isError && !data ? (
                <ErrorState message={errorText(query.error)} onRetry={() => query.refetch()} />
            ) : data?.type === 'lidom' && activePhase ? (
                <>
                    <PhasePicker data={data} phase={activePhase} onChange={setPhase} />
                    {racePhase &&
                        rows.length > 0 &&
                        !routeMissing &&
                        (cal ? (
                            <RaceSection key={`carrera-${activeLeague}-${racePhase}`} calendar={cal} phase={racePhase} rows={rows} advance={advance} timeZone={timeZone} />
                        ) : calendar.isPending ? (
                            <Skeleton height={420} />
                        ) : calendar.isError && !isPermanent(calendar.error) ? (
                            <ErrorState message={errorText(calendar.error)} onRetry={() => calendar.refetch()} />
                        ) : null)}
                    <StandingsTable
                        key={`tabla-${activeLeague}-${activePhase}`}
                        rows={rows}
                        advance={rows.length > (advance ?? Infinity) ? advance : null}
                        cutLabel={cutLabel}
                        calendar={cal}
                        caption={t('pro.posiciones.table.caption', { phase: t(`standings.${activePhase}`) })}
                    />
                    {cal && racePhase && <HeadToHeadSection calendar={cal} phase={racePhase} rows={rows} timeZone={timeZone} />}
                    {cal && <DayNumbers calendar={cal} phase={activePhase} teams={teams} />}
                </>
            ) : data?.type === 'wbc' ? (
                <View style={{ gap: 16 }}>
                    {Object.entries(data.pools).map(([pool, poolRows]) => {
                        const title = poolTitle(pool, i18n.language);
                        return (
                            <StandingsTable
                                key={pool}
                                rows={poolRows as TableRow[]}
                                advance={poolRows.length > 2 ? 2 : null}
                                cutLabel={t('standings.cutNext')}
                                variant="pool"
                                title={title}
                                caption={t('pro.posiciones.table.caption', { phase: title })}
                                actions={
                                    <HeaderButton size={44} label={t('share.shareTable')} onPress={() => share(poolRows, `${title} · ${season}`)}>
                                        <ShareIcon small />
                                    </HeaderButton>
                                }
                            />
                        );
                    })}
                </View>
            ) : data?.type === 'sdc' ? (
                <StandingsTable rows={data.teams as TableRow[]} advance={data.teams.length > 4 ? 4 : null} cutLabel={t('standings.cutNext')} calendar={cal} caption={t('pro.posiciones.table.caption', { phase: leagueName })} />
            ) : null}

            {data && (
                <Txt size={12} tone="muted">
                    {t('pro.posiciones.source', { league: leagueName, season })}
                </Txt>
            )}
        </Screen>
    );
};

const ShareIcon: React.FC<{ small?: boolean }> = ({ small }) => {
    const colors = useColors();
    return <Share2 size={small ? 16 : 20} color={colors.ink} />;
};
