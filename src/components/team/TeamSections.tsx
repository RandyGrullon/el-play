// Piezas de la página del equipo (src/app/equipo/[id].tsx), las mismas de la web (pages/TeamPage.tsx): la cabecera en
// su color, la forma, la temporada día a día, en casa y de visita, contra cada rival, bateo y pitcheo con su puesto en
// la liga, sus líderes, la plantilla, los resultados, el calendario y sus movimientos.
import React, { useId, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowLeftRight, ChevronRight, Star } from 'lucide-react-native';
import type { LeagueId, ScheduleGame } from '../../types';
import { useRace } from '../../lib/queries';
import { qualifies, teamGamesOf, useTransactions, type PlayerRow, type PlayersData } from '../../lib/stats';
import { TEAM_SORTS, leagueRank, type TeamGroup, type TeamRow } from '../../lib/teamStats';
import { versusAll, type TeamResult, type TeamSummary } from '../../lib/team';
import { DEFAULT_TZ, formatShortDate, formatTime, localeFor } from '../../lib/format';
import { teamDisplayName } from '../../lib/teams';
import { useColors } from '../../theme/theme';
import { alpha, radius, shadow } from '../../theme/tokens';
import { Card, PlayerPhoto, Row, Segmented, TeamLogo, Txt } from '../ui';
import { MoreButton, openPlayer, openTeam } from '../stats/common';

/** Lo que hace falta para pintar al equipo (sale de las estadísticas, de las posiciones o de sus juegos) */
export interface TeamLook {
    id: number;
    name: string;
    abbrev: string;
    logo: string;
    color: string;
    flag?: string | null;
}

/** «2.º» / «2nd» */
export const ordinal = (n: number, language: string) => (language.startsWith('en') ? `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}` : `${n}.º`);
/** «3 nov» (sin el día de la semana, para que quepa en una línea) */
const dayMonth = (date: string, lang: string) => new Date(date).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short', timeZone: DEFAULT_TZ }).replace('.', '');
const openGame = (gamePk: number) => router.push({ pathname: '/juego/[gamePk]', params: { gamePk } });

/** Título de cada bloque */
const Heading: React.FC<{ children: string; aside?: React.ReactNode }> = ({ children, aside }) => (
    <Row justify="space-between" gap={8} style={{ marginBottom: 8, minHeight: aside ? 32 : undefined }}>
        <Txt eyebrow accessibilityRole="header" style={{ flexShrink: 1 }}>
            {children}
        </Txt>
        {aside}
    </Row>
);

/** Lista en una tarjeta, una fila por renglón con su raya */
const ListCard: React.FC<{ children: React.ReactNode }> = ({ children }) => <Card padded={false}>{children}</Card>;
const rowStyle = (first: boolean, line: string, pressed: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: line, opacity: pressed ? 0.7 : 1 });

// ---------------------------------------------------------------- cabecera

export const TeamHero: React.FC<{
    team: TeamLook;
    ink: string;
    topInset: number;
    seasonText: string | null;
    record: { w: number; l: number; pct: string | null };
    rankLine: string | null;
    chips: string[];
    favorite: boolean;
    onBack: () => void;
}> = ({ team, ink, topInset, seasonText, record, rankLine, chips, favorite, onBack }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const glow = `glow-${useId().replace(/:/g, '')}`;
    const chip = (key: string, children: React.ReactNode, light = false) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: light ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.15)' }}>
            {children}
        </View>
    );
    return (
        <View style={{ backgroundColor: team.color, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingHorizontal: 16, paddingTop: topInset + 12, paddingBottom: 24, overflow: 'hidden' }}>
            {/* Brillo suave arriba a la derecha */}
            <Svg pointerEvents="none" width={256} height={256} style={{ position: 'absolute', right: -64, top: -40 }}>
                <Defs>
                    <RadialGradient id={glow} cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor={ink} stopOpacity={0.15} />
                        <Stop offset="0.7" stopColor={ink} stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Circle cx={128} cy={128} r={128} fill={`url(#${glow})`} />
            </Svg>
            <Row justify="space-between">
                <Pressable
                    onPress={onBack}
                    accessibilityRole="button"
                    accessibilityLabel={t('team.back')}
                    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
                >
                    <ArrowLeft size={20} color="#14151a" />
                </Pressable>
                {seasonText ? (
                    <View style={{ borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: 'rgba(0,0,0,0.15)' }}>
                        <Txt size={12} weight="bold" color={ink}>
                            {seasonText}
                        </Txt>
                    </View>
                ) : null}
            </Row>
            <Row gap={16} style={{ marginTop: 16 }}>
                <View style={[{ width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }, shadow('float')]}>
                    <TeamLogo team={team} size={72} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={28} weight="extrabold" color={ink} accessibilityRole="header" numberOfLines={3} style={{ lineHeight: 30 }}>
                        {teamDisplayName(team, i18n.language)}
                    </Txt>
                    <Row gap={8} align="baseline" style={{ marginTop: 4 }}>
                        <Txt size={36} weight="extrabold" color={ink} tabular style={{ lineHeight: 38 }}>
                            {t('team.record', { w: record.w, l: record.l })}
                        </Txt>
                        {record.pct ? (
                            <Txt size={18} weight="bold" color={ink} tabular style={{ opacity: 0.8 }}>
                                {record.pct}
                            </Txt>
                        ) : null}
                    </Row>
                    {rankLine ? (
                        <Txt size={14} weight="semibold" color={ink} style={{ marginTop: 4, opacity: 0.85 }}>
                            {rankLine}
                        </Txt>
                    ) : null}
                </View>
            </Row>
            {(chips.length > 0 || favorite) && (
                <Row gap={6} wrap style={{ marginTop: 16 }}>
                    {chips.map((text) =>
                        chip(
                            text,
                            <Txt size={12} weight="bold" color={ink}>
                                {text}
                            </Txt>
                        )
                    )}
                    {favorite &&
                        chip(
                            'favorite',
                            <>
                                <Star size={13} color={colors.gold} fill={colors.gold} />
                                <Txt size={12} weight="bold" color="#14151a">
                                    {t('team.myTeam')}
                                </Txt>
                            </>,
                            true
                        )}
                </Row>
            )}
        </View>
    );
};

// ---------------------------------------------------------------- forma y temporada

/** Los últimos 10 (del más viejo al más nuevo) como cuadritos de ganado y perdido; cada uno abre su juego */
export const FormCard: React.FC<{ summary: TeamSummary }> = ({ summary }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    return (
        <Card>
            <Heading>{t('team.form')}</Heading>
            <Row gap={6}>
                {summary.last10.map((result) => (
                    <Pressable
                        key={result.game.gamePk}
                        onPress={() => openGame(result.game.gamePk)}
                        accessibilityRole="button"
                        accessibilityLabel={t('team.resultLabel', { date: formatShortDate(result.game.date, i18n.language), result: result.won ? t('team.won') : t('team.lost'), score: `${result.runs}-${result.allowed}`, rival: result.opponent.name })}
                        style={({ pressed }) => ({ flex: 1, minWidth: 0, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: result.won ? alpha(colors.ball, 0.15) : alpha(colors.live, 0.1), opacity: pressed ? 0.7 : 1 })}
                    >
                        <Txt size={18} weight="extrabold" tone={result.won ? 'ball' : 'live'}>
                            {result.won ? t('team.w') : t('team.l')}
                        </Txt>
                    </Pressable>
                ))}
            </Row>
        </Card>
    );
};

/** Juegos sobre .500 día a día (la misma carrera de Posiciones, solo de este equipo) */
export const Trajectory: React.FC<{ league: LeagueId; teamId: number; color: string }> = ({ league, teamId, color }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const race = useRace(league);
    const [width, setWidth] = useState(0);
    const points = race.data?.teams.find((team) => team.id === teamId)?.points ?? [];
    if (points.length < 3) return null;
    const height = 70;
    const top = Math.max(1, ...points.map(Math.abs));
    const x = (index: number) => 2 + (index / (points.length - 1)) * Math.max(0, width - 4);
    const y = (value: number) => height / 2 - (value / top) * (height / 2 - 4);
    const path = points.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    return (
        <Card>
            <Row justify="space-between" align="baseline">
                <Txt eyebrow accessibilityRole="header">
                    {t('team.trajectory')}
                </Txt>
                <Txt size={18} weight="extrabold" tabular>
                    {last > 0 ? `+${last}` : String(last)}
                </Txt>
            </Row>
            <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height, marginTop: 8 }} accessible accessibilityRole="image" accessibilityLabel={t('team.trajectoryLabel', { value: last })}>
                {width > 0 && (
                    <Svg width={width} height={height}>
                        <Line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke={colors.ink} strokeOpacity={0.15} strokeDasharray="4 4" />
                        <Path d={path} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
                    </Svg>
                )}
            </View>
            <Txt size={12} tone="muted">
                {t('team.trajectoryHint')}
            </Txt>
        </Card>
    );
};

/** Cuadritos de tres en fila: cifra grande, nombre debajo y (si lo hay) algo más abajo */
const TileGrid: React.FC<{ tiles: { key: string; value: string; label: string; extra?: React.ReactNode }[] }> = ({ tiles }) => {
    const colors = useColors();
    const rows: (typeof tiles)[] = [];
    for (let index = 0; index < tiles.length; index += 3) rows.push(tiles.slice(index, index + 3));
    return (
        <View style={{ gap: 8 }}>
            {rows.map((row) => (
                <View key={row[0].key} style={{ flexDirection: 'row', gap: 8 }}>
                    {row.map((tile) => (
                        <View key={tile.key} accessible accessibilityLabel={`${tile.label}: ${tile.value}`} style={[{ flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', borderRadius: radius.tile, backgroundColor: colors.surface, padding: 10 }, shadow('card')]}>
                            <Txt size={20} weight="extrabold" tabular numberOfLines={1} adjustsFontSizeToFit>
                                {tile.value}
                            </Txt>
                            <Txt size={11} weight="semibold" tone="muted" center style={{ marginTop: 4, lineHeight: 13 }}>
                                {tile.label}
                            </Txt>
                            {tile.extra}
                        </View>
                    ))}
                    {Array.from({ length: 3 - row.length }, (_, index) => (
                        <View key={`empty-${index}`} style={{ flex: 1, flexBasis: 0 }} />
                    ))}
                </View>
            ))}
        </View>
    );
};

/** En casa, de visita, por una carrera, en extra innings, carreras y récord esperado */
export const SplitsGrid: React.FC<{ items: [string, string][] }> = ({ items }) => <TileGrid tiles={items.map(([label, value]) => ({ key: label, label, value }))} />;

export const VersusList: React.FC<{ results: TeamResult[] }> = ({ results }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const rows = versusAll(results);
    return (
        <View>
            <Heading>{t('team.versus')}</Heading>
            <ListCard>
                {rows.map((row, index) => {
                    const name = teamDisplayName(row.team, i18n.language);
                    return (
                        <Pressable
                            key={row.team.id}
                            onPress={() => openTeam(row.team.id)}
                            accessibilityRole="link"
                            accessibilityLabel={`${name}: ${t('team.record', { w: row.w, l: row.l })}, ${t('team.runsShort', { rs: row.rs, ra: row.ra })}`}
                            style={({ pressed }) => rowStyle(index === 0, colors.line, pressed)}
                        >
                            <TeamLogo team={row.team} size={30} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Txt weight="bold" numberOfLines={1}>
                                    {name}
                                </Txt>
                                <Txt size={12} weight="semibold" tone="muted" tabular>
                                    {t('team.runsShort', { rs: row.rs, ra: row.ra })}
                                </Txt>
                            </View>
                            <Txt size={20} weight="extrabold" tabular tone={row.w > row.l ? 'ball' : row.w < row.l ? 'live' : 'ink'}>
                                {t('team.record', { w: row.w, l: row.l })}
                            </Txt>
                            <ChevronRight size={16} color={colors.faint} />
                        </Pressable>
                    );
                })}
            </ListCard>
        </View>
    );
};

// ---------------------------------------------------------------- bateo y pitcheo

/** Bateo o pitcheo del equipo: cada número con su puesto en la liga (el primero en dorado) */
export const StatBlock: React.FC<{ group: TeamGroup; team: TeamRow; teams: TeamRow[] }> = ({ group, team, teams }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    return (
        <View>
            <Heading>{t(`team.${group}`)}</Heading>
            <TileGrid
                tiles={TEAM_SORTS[group].map((sort) => {
                    const value = sort.value(team);
                    const rank = leagueRank(teams, team, sort);
                    return {
                        key: sort.key,
                        value: value === null ? '—' : sort.show(value),
                        label: t(`team.sort.${group}.${sort.key}`),
                        extra:
                            rank !== null ? (
                                <View style={{ marginTop: 4, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: rank === 1 ? alpha(colors.gold, 0.15) : colors.raised }}>
                                    <Txt size={10} weight="extrabold" tone={rank === 1 ? 'gold' : 'muted'}>
                                        {t('team.rank', { rank: ordinal(rank, i18n.language), total: teams.length })}
                                    </Txt>
                                </View>
                            ) : undefined
                    };
                })}
            />
        </View>
    );
};

// ---------------------------------------------------------------- peloteros

const num = (text: string | undefined) => (text && Number.isFinite(parseFloat(text)) ? parseFloat(text) : null);

/** Los mejores del equipo en lo que más se mira (los promedios, solo con turnos o entradas suficientes) */
export const TeamLeaders: React.FC<{ team: TeamLook; players: PlayersData }> = ({ team, players }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const leaders = useMemo(() => {
        const teamGames = teamGamesOf(players.players);
        const mine = players.players.filter((row) => row.teamId === team.id);
        const best = (role: 'B' | 'P', value: (row: PlayerRow) => number | null, asc = false, rate = false) =>
            mine
                .filter((row) => row.role === role && (!rate || qualifies(row, teamGames)))
                .map((row) => ({ row, value: value(row) }))
                .filter((item): item is { row: PlayerRow; value: number } => item.value !== null && (asc || item.value > 0))
                .sort((a, b) => (asc ? a.value - b.value : b.value - a.value))[0] ?? null;
        return [
            { label: t('team.sort.bat.avg'), item: best('B', (row) => num(row.hitting?.avg), false, true), show: (row: PlayerRow) => row.hitting?.avg ?? '—' },
            { label: t('team.sort.bat.hr'), item: best('B', (row) => row.hitting?.hr ?? null), show: (row: PlayerRow) => String(row.hitting?.hr ?? 0) },
            { label: t('team.rbi'), item: best('B', (row) => row.hitting?.rbi ?? null), show: (row: PlayerRow) => String(row.hitting?.rbi ?? 0) },
            { label: t('team.sort.pitch.era'), item: best('P', (row) => num(row.pitching?.era), true, true), show: (row: PlayerRow) => row.pitching?.era ?? '—' },
            { label: t('team.sort.pitch.k'), item: best('P', (row) => row.pitching?.k ?? null), show: (row: PlayerRow) => String(row.pitching?.k ?? 0) },
            { label: t('team.sort.pitch.sv'), item: best('P', (row) => row.pitching?.sv ?? null), show: (row: PlayerRow) => String(row.pitching?.sv ?? 0) }
        ].flatMap((leader) => (leader.item ? [{ ...leader, row: leader.item.row }] : []));
    }, [players, team.id, t]);
    if (!leaders.length) return null;
    return (
        <View>
            <Heading>{t('team.leaders')}</Heading>
            <View style={{ gap: 8 }}>
                {leaders.map(({ label, row, show }) => (
                    <Pressable
                        key={label}
                        onPress={() => openPlayer({ id: row.id, name: row.name, teamId: team.id }, players.isPreviousSeason ? players.season : undefined)}
                        accessibilityRole="button"
                        accessibilityLabel={`${label}: ${row.name}, ${show(row)}`}
                        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.tile, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10, opacity: pressed ? 0.8 : 1 }, shadow('card')]}
                    >
                        <PlayerPhoto personId={row.id} name={row.name} size={44} team={team} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt size={11} weight="bold" tone="muted" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                {label}
                            </Txt>
                            <Txt weight="extrabold" numberOfLines={1}>
                                {row.name}
                            </Txt>
                        </View>
                        <Txt size={24} weight="extrabold" tabular>
                            {show(row)}
                        </Txt>
                    </Pressable>
                ))}
            </View>
        </View>
    );
};

/** La plantilla de la temporada: bateadores y lanzadores, con su línea y sus puntos de fantasy */
export const Roster: React.FC<{ team: TeamLook; players: PlayersData }> = ({ team, players }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const [role, setRole] = useState<'B' | 'P'>('B');
    const [all, setAll] = useState(false);
    if (!players.players.some((row) => row.teamId === team.id)) return null;
    const list = players.players.filter((row) => row.teamId === team.id && row.role === role).sort((a, b) => b.pts - a.pts);
    const shown = all ? list : list.slice(0, 10);
    const line = (row: PlayerRow) =>
        role === 'B'
            ? row.hitting
                ? `${row.hitting.avg} · ${t('team.hrShort', { count: row.hitting.hr })} · ${t('team.rbiShort', { count: row.hitting.rbi })}`
                : null
            : row.pitching
              ? `${row.pitching.era} ${t('statsPage.labels.era')} · ${row.pitching.ip} ${t('statsPage.labels.ip')} · ${row.pitching.k} K`
              : null;
    return (
        <View>
            <Heading
                aside={
                    <View accessibilityLabel={t('statsPage.role')}>
                        <Segmented<'B' | 'P'>
                            small
                            value={role}
                            onChange={(value) => {
                                setRole(value);
                                setAll(false);
                            }}
                            options={[
                                { value: 'B', label: t('statsPage.batters') },
                                { value: 'P', label: t('statsPage.pitchers') }
                            ]}
                        />
                    </View>
                }
            >
                {t('team.roster')}
            </Heading>
            <ListCard>
                {shown.map((row, index) => (
                    <Pressable
                        key={row.id}
                        onPress={() => openPlayer({ id: row.id, name: row.name, teamId: team.id }, players.isPreviousSeason ? players.season : undefined)}
                        accessibilityRole="button"
                        accessibilityLabel={t('statsPage.viewPlayer', { name: row.name })}
                        style={({ pressed }) => rowStyle(index === 0, colors.line, pressed)}
                    >
                        <PlayerPhoto personId={row.id} name={row.name} size={40} team={team} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt weight="bold" numberOfLines={1}>
                                {row.number ? (
                                    <Txt weight="bold" tone="muted">
                                        {`#${row.number} `}
                                    </Txt>
                                ) : null}
                                {row.name}
                            </Txt>
                            <Txt size={12} tone="muted" tabular numberOfLines={1}>
                                {[row.pos, line(row)].filter(Boolean).join(' · ')}
                            </Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Txt size={18} weight="extrabold" tone="accentInk" tabular style={{ lineHeight: 20 }}>
                                {Math.round(row.pts * 10) / 10}
                            </Txt>
                            <Txt size={10} weight="bold" tone="muted" style={{ textTransform: 'uppercase' }}>
                                {t('team.pts')}
                            </Txt>
                        </View>
                    </Pressable>
                ))}
            </ListCard>
            {list.length > shown.length && (
                <View style={{ marginTop: 8 }}>
                    <MoreButton raised label={t('statsPage.showMore', { count: list.length - shown.length })} onPress={() => setAll(true)} />
                </View>
            )}
        </View>
    );
};

// ---------------------------------------------------------------- juegos

/** Resultados, del más nuevo al más viejo (8 y «ver más») */
export const Results: React.FC<{ results: TeamResult[] }> = ({ results }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const [all, setAll] = useState(false);
    const newest = [...results].reverse();
    const shown = all ? newest : newest.slice(0, 8);
    return (
        <View>
            <Heading>{t('team.results')}</Heading>
            <ListCard>
                {shown.map((result, index) => {
                    const rival = teamDisplayName(result.opponent, i18n.language);
                    const outcome = result.won ? t('team.won') : t('team.lost');
                    return (
                        <Pressable
                            key={result.game.gamePk}
                            onPress={() => openGame(result.game.gamePk)}
                            accessibilityRole="button"
                            accessibilityLabel={t('team.resultLabel', { date: formatShortDate(result.game.date, i18n.language), result: outcome, score: `${result.runs}-${result.allowed}`, rival })}
                            style={({ pressed }) => rowStyle(index === 0, colors.line, pressed)}
                        >
                            <Txt size={12} weight="bold" tone="muted" numberOfLines={1} style={{ width: 48 }}>
                                {dayMonth(result.game.date, i18n.language)}
                            </Txt>
                            <Txt size={11} weight="bold" tone="muted" style={{ width: 22 }}>
                                {result.home ? t('statsPage.vs') : t('statsPage.at')}
                            </Txt>
                            <TeamLogo team={result.opponent} size={26} />
                            <Txt size={14} weight="bold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                {rival}
                                {result.game.gameType && result.game.gameType !== 'R' && result.game.description ? (
                                    <Txt size={12} weight="semibold" tone="muted">
                                        {`  ${result.game.description}`}
                                    </Txt>
                                ) : null}
                            </Txt>
                            <View style={{ borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: result.won ? alpha(colors.ball, 0.15) : alpha(colors.live, 0.1) }}>
                                <Txt size={12} weight="extrabold" tone={result.won ? 'ball' : 'live'}>
                                    {result.won ? t('team.w') : t('team.l')}
                                </Txt>
                            </View>
                            <Txt size={16} weight="extrabold" tabular style={{ minWidth: 40, textAlign: 'right' }}>
                                {result.runs}-{result.allowed}
                            </Txt>
                        </Pressable>
                    );
                })}
            </ListCard>
            {newest.length > shown.length && (
                <View style={{ marginTop: 8 }}>
                    <MoreButton raised label={t('statsPage.showMore', { count: newest.length - shown.length })} onPress={() => setAll(true)} />
                </View>
            )}
        </View>
    );
};

/** Los próximos juegos (sin el de la tarjeta de arriba), hasta 6 */
export const Upcoming: React.FC<{ games: ScheduleGame[]; teamId: number; skip: number | null; now: number }> = ({ games, teamId, skip, now }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const list = games.filter((game) => game.state === 'preview' && game.gamePk !== skip && Date.parse(game.date) > now).slice(0, 6);
    if (!list.length) return null;
    const weekday = (date: string) => new Date(date).toLocaleDateString(localeFor(i18n.language), { weekday: 'short', day: 'numeric', month: 'short', timeZone: DEFAULT_TZ });
    return (
        <View>
            <Heading>{t('team.upcoming')}</Heading>
            <ListCard>
                {list.map((game, index) => {
                    const home = game.home.id === teamId;
                    const rival = home ? game.away : game.home;
                    const time = game.startTimeTBD ? t('team.tbd') : formatTime(game.date, i18n.language);
                    return (
                        <Pressable
                            key={game.gamePk}
                            onPress={() => openGame(game.gamePk)}
                            accessibilityRole="button"
                            accessibilityLabel={`${weekday(game.date)}, ${home ? t('statsPage.vs') : t('statsPage.at')} ${teamDisplayName(rival, i18n.language)}, ${time}`}
                            style={({ pressed }) => rowStyle(index === 0, colors.line, pressed)}
                        >
                            <Txt size={12} weight="bold" tone="muted" numberOfLines={1} style={{ width: 84, textTransform: 'capitalize' }}>
                                {weekday(game.date)}
                            </Txt>
                            <Txt size={11} weight="bold" tone="muted" style={{ width: 22 }}>
                                {home ? t('statsPage.vs') : t('statsPage.at')}
                            </Txt>
                            <TeamLogo team={rival} size={26} />
                            <Txt size={14} weight="bold" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                                {teamDisplayName(rival, i18n.language)}
                            </Txt>
                            <Txt size={12} weight="bold" tone="muted" tabular>
                                {time}
                            </Txt>
                        </Pressable>
                    );
                })}
            </ListCard>
        </View>
    );
};

// ---------------------------------------------------------------- movimientos

const KNOWN_MOVES = new Set(['SFA', 'SGN', 'REL', 'TR', 'ASG', 'OPT', 'CU', 'SC', 'DES', 'OUT', 'CLW', 'RET', 'SU', 'NUM', 'LON']);
const MOVES_PAGE = 8;

/** Los movimientos del equipo en los últimos 30 días: los que llegan y los que se van */
export const TeamMoves: React.FC<{ league: LeagueId; teamId: number }> = ({ league, teamId }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const query = useTransactions(league);
    const [limit, setLimit] = useState(MOVES_PAGE);
    const list = (query.data?.transactions ?? []).filter((item) => item.team.id === teamId || item.other?.id === teamId);
    if (!list.length) return null;
    const es = !i18n.language.startsWith('en');
    return (
        <Card>
            <Row gap={6} style={{ marginBottom: 4 }}>
                <ArrowLeftRight size={14} color={colors.muted} />
                <Txt eyebrow accessibilityRole="header">
                    {t('team.moves.title')}
                </Txt>
            </Row>
            {list.slice(0, limit).map((item, index) => {
                const known = !!item.type && KNOWN_MOVES.has(item.type);
                return (
                    <Row key={item.id} align="flex-start" gap={12} style={{ paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                        <TeamLogo team={item.team} size={26} />
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Row gap={6} wrap>
                                <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: colors.raised }}>
                                    <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                        {t(`team.moves.type.${known ? item.type : 'other'}`)}
                                    </Txt>
                                </View>
                                <Txt
                                    size={14}
                                    weight="bold"
                                    onPress={() => openPlayer({ id: item.person.id, name: item.person.name })}
                                    accessibilityRole="link"
                                    accessibilityLabel={t('statsPage.viewPlayer', { name: item.person.name })}
                                    style={{ flexShrink: 1 }}
                                >
                                    {item.person.name}
                                </Txt>
                            </Row>
                            <Txt size={12} tone="muted" numberOfLines={1}>
                                {item.other ? t('team.moves.between', { from: item.other.abbrev, to: item.team.abbrev }) : teamDisplayName(item.team, i18n.language)}
                                {item.date ? ` · ${formatShortDate(`${item.date}T16:00:00Z`, i18n.language)}` : ''}
                            </Txt>
                            {/* El detalle viene en inglés: en español solo se muestra si no hay un tipo conocido */}
                            {(!es || !known) && item.description ? (
                                <Txt size={12} tone="faint">
                                    {item.description}
                                </Txt>
                            ) : null}
                        </View>
                    </Row>
                );
            })}
            {list.length > limit && (
                <View style={{ marginTop: 8 }}>
                    <MoreButton raised label={t('team.moves.more', { count: list.length - limit })} onPress={() => setLimit((value) => value + MOVES_PAGE)} />
                </View>
            )}
        </Card>
    );
};
