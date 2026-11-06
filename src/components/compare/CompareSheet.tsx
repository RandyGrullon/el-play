// Comparar desde el botón flotante (no es una pantalla aparte; el de la web, components/compare/CompareSheet.tsx): se
// elige el rival y salen lado a lado, cada número con una barra partida en el color de cada uno (el mejor se lleva más
// barra y va en negrita).
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Search, X } from 'lucide-react-native';
import type { LeagueId, ScheduleGame, Standings } from '../../types';
import { formatShortDate } from '../../lib/format';
import { MOTION_EASE } from '../../lib/motion';
import { STAT_COLUMNS, normalize, usePlayers, type PlayerDetail, type PlayerRow, type StatColumn } from '../../lib/stats';
import { TEAM_SORTS, recordOf, type TeamRow } from '../../lib/teamStats';
import { headToHead, standingOf, type TeamResult } from '../../lib/team';
import { teamDisplayName } from '../../lib/teams';
import { useColors } from '../../theme/theme';
import { fonts, inkOn, radius, shadow } from '../../theme/tokens';
import { Card, PlayerPhoto, Row, Sheet, TeamLogo, Txt, useReduceMotion } from '../ui';
import { LinkedTeams, PlayerLink, TeamLink, teamTextLink } from '../stats/common';
import { leagueFromPlayers } from '../pro/estadisticas/logic';

interface Side {
    name: string;
    color: string;
}

/** Cuánta barra le toca a cada uno: el mejor más (en lo que menos es mejor se invierte), con un mínimo para que se vea */
export const compareShares = (a: number | null, b: number | null, higher: boolean): [number, number] | null => {
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    const [x, y] = higher ? [Math.abs(a), Math.abs(b)] : [Math.abs(b), Math.abs(a)];
    if (x + y === 0) return [50, 50];
    const left = Math.min(96, Math.max(4, (x / (x + y)) * 100));
    return [left, 100 - left];
};

/** Una mitad de la barra: se desliza desde la mitad hasta su parte (sin movimiento con «Reducir movimiento») */
const BarHalf: React.FC<{ share: number; color: string; opacity: number }> = ({ share, color, opacity }) => {
    const reduce = useReduceMotion();
    const width = useSharedValue(reduce ? share : 50);
    useEffect(() => {
        width.set(reduce ? share : withTiming(share, { duration: 600, easing: MOTION_EASE }));
        return () => cancelAnimation(width);
    }, [share, reduce, width]);
    const style = useAnimatedStyle(() => ({ width: `${width.get()}%` }));
    return <Animated.View style={[{ height: '100%', backgroundColor: color, opacity }, style]} />;
};

const CompareRow: React.FC<{ label: string; a: number | null; b: number | null; aText: string; bText: string; higher: boolean; left: Side; right: Side; first?: boolean }> = ({
    label,
    a,
    b,
    aText,
    bText,
    higher,
    left,
    right,
    first
}) => {
    const colors = useColors();
    const better = a === null || b === null || a === b ? null : (higher ? a > b : a < b) ? 'a' : 'b';
    const shares = compareShares(a, b, higher);
    return (
        <View
            accessible
            accessibilityLabel={`${label}: ${left.name} ${aText}, ${right.name} ${bText}${better ? ` · ${(better === 'a' ? left : right).name}` : ''}`}
            style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}
        >
            <Row justify="space-between" align="baseline" gap={8}>
                <Txt size={15} weight={better === 'a' ? 'extrabold' : 'semibold'} tone={better === 'a' ? 'ink' : 'muted'} tabular>
                    {aText}
                </Txt>
                <Txt size={11} weight="bold" tone="muted" numberOfLines={1} style={{ flexShrink: 1, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {label}
                </Txt>
                <Txt size={15} weight={better === 'b' ? 'extrabold' : 'semibold'} tone={better === 'b' ? 'ink' : 'muted'} tabular>
                    {bText}
                </Txt>
            </Row>
            <View style={{ flexDirection: 'row', gap: 2, height: 8, marginTop: 6, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.raised }}>
                <BarHalf share={shares?.[0] ?? 50} color={left.color} opacity={shares ? (better === 'b' ? 0.45 : 1) : 0.25} />
                <BarHalf share={shares?.[1] ?? 50} color={right.color} opacity={shares ? (better === 'a' ? 0.45 : 1) : 0.25} />
            </View>
        </View>
    );
};

/** Cabecera de los dos lado a lado, cada mitad en su color, con el «vs» en medio y el botón para cambiar al otro */
const Faceoff: React.FC<{ left: React.ReactNode; right: React.ReactNode; leftColor: string; rightColor: string; onSwap: () => void }> = ({ left, right, leftColor, rightColor, onSwap }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const half = (color: string, children: React.ReactNode) => (
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 20, paddingBottom: 52, backgroundColor: color }}>{children}</View>
    );
    return (
        <View style={[{ borderRadius: 24 }, shadow('card')]}>
            <View style={{ flexDirection: 'row', borderRadius: 24, overflow: 'hidden' }}>
                {half(leftColor, left)}
                {half(rightColor, right)}
            </View>
            <View pointerEvents="none" style={[{ position: 'absolute', left: '50%', top: '50%', width: 40, height: 40, marginLeft: -20, marginTop: -26, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, shadow('float')]}>
                <Txt size={14} weight="extrabold" color={colors.bg}>
                    {t('statsPage.vs')}
                </Txt>
            </View>
            <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center' }}>
                <Pressable
                    onPress={onSwap}
                    accessibilityRole="button"
                    accessibilityLabel={t('compare.change')}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.28)', opacity: pressed ? 0.8 : 1 })}
                >
                    <ArrowLeftRight size={14} color="#fff" />
                    <Txt size={12} weight="bold" tone="white">
                        {t('compare.change')}
                    </Txt>
                </Pressable>
            </View>
        </View>
    );
};

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <View style={{ gap: 8 }} accessibilityLabel={title}>
        <Txt eyebrow accessibilityRole="header">
            {title}
        </Txt>
        <Card padded={false}>{children}</Card>
    </View>
);

/** Logo en un círculo blanco (se ve sobre cualquier color de equipo) */
const LogoDisc: React.FC<{ team: TeamRow; size: number }> = ({ team, size }) => (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
        <TeamLogo team={team} size={Math.round(size * 0.74)} />
    </View>
);

/** Cada vez que se abre empieza de cero (la hoja sigue montada para que baje con su animación) */
const useResetOnOpen = (open: boolean, reset: () => void) => {
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) reset();
    }
};

const rate3 = (value: number) => value.toFixed(3).replace(/^0(?=\.)/, '');
const whole = (value: number) => String(Math.round(value));
const text = (value: number | null, show: (value: number) => string) => (value === null || !Number.isFinite(value) ? '—' : show(value));

// ---------------------------------------------------------------- equipos

interface TeamCompareProps {
    open: boolean;
    team: TeamRow;
    teams: TeamRow[];
    standings?: Standings;
    /** Juegos del equipo de la página: de aquí sale cómo les ha ido entre ellos y cuándo se vuelven a ver (null: no llegaron) */
    results: TeamResult[] | null;
    games: ScheduleGame[];
    onClose: () => void;
}

export const TeamCompareSheet: React.FC<TeamCompareProps> = ({ open, team, teams, standings, results, games, onClose }) => {
    const { t, i18n } = useTranslation();
    const [otherId, setOtherId] = useState<number | null>(null);
    useResetOnOpen(open, () => setOtherId(null));
    const other = teams.find((row) => row.id === otherId) ?? null;
    const rivals = teams.filter((row) => row.id !== team.id);
    const name = (row: TeamRow) => teamDisplayName(row, i18n.language);
    // Récord y carreras de las posiciones (lo oficial); si no están, de las estadísticas del equipo
    const recordFor = (row: TeamRow) => {
        const standing = standingOf(standings, row.id)?.row;
        const stats = recordOf(row);
        return standing ? { w: standing.wins, l: standing.losses, scored: standing.runsScored ?? stats.scored, allowed: standing.runsAllowed ?? stats.allowed } : stats;
    };
    const title = t('compare.teamTitle', { team: team.abbrev });

    if (!other) {
        // De dos en dos, cada rival en su color
        const pairs: TeamRow[][] = [];
        for (let index = 0; index < rivals.length; index += 2) pairs.push(rivals.slice(index, index + 2));
        return (
            <Sheet open={open} onClose={onClose} title={title}>
                <Txt size={14} tone="muted">
                    {t('compare.pickTeam')}
                </Txt>
                <View style={{ gap: 8 }}>
                    {pairs.map((pair) => (
                        <View key={pair[0].id} style={{ flexDirection: 'row', gap: 8 }}>
                            {pair.map((row) => {
                                const ink = inkOn(row.color);
                                const record = recordFor(row);
                                return (
                                    <Pressable
                                        key={row.id}
                                        onPress={() => setOtherId(row.id)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${name(row)}, ${t('team.record', { w: record.w, l: record.l })}`}
                                        style={({ pressed }) => [
                                            { flex: 1, flexBasis: 0, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 20, backgroundColor: row.color, opacity: pressed ? 0.85 : 1 },
                                            shadow('card')
                                        ]}
                                    >
                                        <LogoDisc team={row} size={40} />
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Txt size={14} weight="extrabold" color={ink} numberOfLines={2} style={{ lineHeight: 17 }}>
                                                {name(row)}
                                            </Txt>
                                            <Txt size={12} weight="bold" color={ink} tabular style={{ opacity: 0.8 }}>
                                                {t('team.record', { w: record.w, l: record.l })}
                                            </Txt>
                                        </View>
                                    </Pressable>
                                );
                            })}
                            {pair.length === 1 && <View style={{ flex: 1, flexBasis: 0 }} />}
                        </View>
                    ))}
                </View>
            </Sheet>
        );
    }

    const left: Side = { name: name(team), color: team.color };
    const right: Side = { name: name(other), color: other.color };
    const a = recordFor(team);
    const b = recordFor(other);
    const pct = (w: number, l: number) => (w + l ? w / (w + l) : null);
    const lastTen = (id: number) => standingOf(standings, id)?.row.lastTen?.wins ?? null;
    const h2h = results ? headToHead(results, other.id) : null;
    const next = games.filter((game) => game.state !== 'final' && [game.away.id, game.home.id].includes(other.id)).sort((x, y) => x.date.localeCompare(y.date))[0];
    // El rival (logo y nombre) lleva a su página; el de la izquierda es el de la página de atrás (se vuelve cerrando)
    const side = (row: TeamRow, record: { w: number; l: number }, linked = false) => (
        <>
            <TeamLink id={row.id} name={name(row)} disabled={!linked} style={{ alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                <LogoDisc team={row} size={56} />
                <Txt size={14} weight="extrabold" color={inkOn(row.color)} numberOfLines={1} style={{ maxWidth: '100%' }}>
                    {name(row)}
                </Txt>
            </TeamLink>
            <Txt size={24} weight="extrabold" color={inkOn(row.color)} tabular>
                {t('team.record', { w: record.w, l: record.l })}
            </Txt>
        </>
    );
    const rows: { label: string; a: number | null; b: number | null; show: (value: number) => string; higher: boolean }[] = [
        { label: t('compare.winPct'), a: pct(a.w, a.l), b: pct(b.w, b.l), show: rate3, higher: true },
        { label: t('compare.runsFor'), a: a.scored, b: b.scored, show: whole, higher: true },
        { label: t('compare.runsAgainst'), a: a.allowed, b: b.allowed, show: whole, higher: false },
        ...(lastTen(team.id) !== null && lastTen(other.id) !== null ? [{ label: t('compare.lastTen'), a: lastTen(team.id), b: lastTen(other.id), show: whole, higher: true }] : [])
    ];

    return (
        <Sheet open={open} onClose={onClose} title={title}>
            <Faceoff leftColor={team.color} rightColor={other.color} onSwap={() => setOtherId(null)} left={side(team, a)} right={side(other, b, true)} />

            {/* Entre ellos esta temporada y cuándo se vuelven a ver (sin los juegos del equipo no se sabe) */}
            {results && (
                <Card style={{ paddingVertical: 12, gap: 4 }}>
                    <Txt eyebrow>{t('compare.headToHead')}</Txt>
                    {h2h ? (
                        <Row gap={8} align="baseline" wrap>
                            <Txt size={20} weight="extrabold" tabular>
                                <LinkedTeams text={t('compare.h2hLine', { a: team.abbrev, w: h2h.w, l: h2h.l, b: other.abbrev })} teams={[team, other]} />
                            </Txt>
                            <Txt size={14} weight="semibold" tone="muted" tabular>
                                {t('compare.h2hRuns', { rs: h2h.rs, ra: h2h.ra })}
                            </Txt>
                        </Row>
                    ) : (
                        <Txt size={14} tone="muted">
                            {t('compare.h2hNone')}
                        </Txt>
                    )}
                    {next && (
                        <Txt size={12} weight="semibold" tone="muted">
                            {t('compare.nextMeeting', { date: formatShortDate(next.date, i18n.language) })}
                        </Txt>
                    )}
                </Card>
            )}

            <Group title={t('compare.season')}>
                {rows.map((row, index) => (
                    <CompareRow key={row.label} label={row.label} a={row.a} b={row.b} aText={text(row.a, row.show)} bText={text(row.b, row.show)} higher={row.higher} left={left} right={right} first={index === 0} />
                ))}
            </Group>
            {(['bat', 'pitch'] as const).map((group) => (
                <Group key={group} title={t(`team.${group}`)}>
                    {TEAM_SORTS[group].map((sort, index) => {
                        const valueA = sort.value(team);
                        const valueB = sort.value(other);
                        return (
                            <CompareRow
                                key={sort.key}
                                label={t(`team.sort.${group}.${sort.key}`)}
                                a={valueA}
                                b={valueB}
                                aText={text(valueA, sort.show)}
                                bText={text(valueB, sort.show)}
                                higher={!sort.asc}
                                left={left}
                                right={right}
                                first={index === 0}
                            />
                        );
                    })}
                </Group>
            ))}
        </Sheet>
    );
};

// ---------------------------------------------------------------- peloteros

/** Lo que se compara de cada uno (las columnas de STAT_COLUMNS; los textos cortos son los de pro.short) */
const PLAYER_METRICS: Record<'B' | 'P', string[]> = {
    B: ['g', 'avg', 'obp', 'slg', 'ops', 'hr', 'rbi', 'sb', 'kPct', 'bbPct'],
    P: ['g', 'ip', 'era', 'whip', 'k', 'fip', 'kPct', 'bbPct', 'h9']
};

/** La ficha como una fila de la lista de peloteros (para leerla con las mismas columnas) */
const asRow = (player: PlayerDetail): PlayerRow => ({
    id: player.id,
    name: player.name,
    teamId: player.team?.id ?? null,
    pos: player.pos,
    number: player.number,
    role: player.role,
    hitting: player.hitting,
    pitching: player.pitching,
    g: player.g,
    pts: player.pts,
    ppg: player.ppg
});

export const PlayerCompareSheet: React.FC<{ open: boolean; player: PlayerDetail; league: LeagueId; onClose: () => void }> = ({ open, player, league, onClose }) => {
    const { t } = useTranslation();
    const colors = useColors();
    // La lista de su temporada se pide al abrir (la vigente comparte la caché con Estadísticas)
    const players = usePlayers(league, player.season !== player.currentSeason ? player.season : undefined, open);
    const [search, setSearch] = useState('');
    const [otherId, setOtherId] = useState<number | null>(null);
    useResetOnOpen(open, () => {
        setOtherId(null);
        setSearch('');
    });
    const list = useMemo(() => players.data?.players ?? [], [players.data]);
    const teams = players.data?.teams ?? {};
    const other = list.find((row) => row.id === otherId) ?? null;
    const role = player.role;
    // OPS+, FIP y compañía con los promedios de la liga (sumando las líneas de todos)
    const ctx = useMemo(() => leagueFromPlayers(list)?.ctx ?? null, [list]);
    // Sin buscar: los de su mismo rol que más puntos llevan
    const matches = useMemo(() => {
        const query = normalize(search.trim());
        return list
            .filter((row) => row.role === role && row.id !== player.id && (!query || normalize(row.name).includes(query)))
            .sort((a, b) => b.pts - a.pts)
            .slice(0, query ? 12 : 8);
    }, [list, search, role, player.id]);
    const myColor = player.team?.color || '#2563eb';
    const title = t('compare.playerTitle', { name: player.name });
    // Hoja sin su propio scroll: el de aquí deja tocar un resultado con el teclado abierto
    const body = (children: React.ReactNode) => (
        <Sheet open={open} onClose={onClose} title={title} scroll={false}>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ margin: -16 }} contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
                {children}
            </ScrollView>
        </Sheet>
    );

    if (!other) {
        return body(
            <>
                <Row gap={8} style={[{ height: 48, borderRadius: radius.tile, backgroundColor: colors.surface, paddingHorizontal: 12 }, shadow('card')]}>
                    <Search size={16} color={colors.muted} />
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder={t('compare.searchPlayer')}
                        placeholderTextColor={colors.faint}
                        accessibilityLabel={t('compare.searchPlayer')}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="words"
                        autoFocus
                        style={[{ flex: 1, minWidth: 0, height: 48, fontFamily: fonts.regular, fontSize: 16, color: colors.ink }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
                    />
                    {search ? (
                        <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel={t('statsPage.clear')} hitSlop={8} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                            <X size={14} color={colors.muted} />
                        </Pressable>
                    ) : null}
                </Row>
                <View style={{ gap: 4 }}>
                    <Txt eyebrow>{search.trim() ? t('compare.results') : t(role === 'P' ? 'compare.suggestPitchers' : 'compare.suggestBatters')}</Txt>
                    {matches.map((row, index) => {
                        const team = row.teamId ? teams[row.teamId] : undefined;
                        return (
                            <Pressable
                                key={row.id}
                                onPress={() => setOtherId(row.id)}
                                accessibilityRole="button"
                                accessibilityLabel={[row.name, team?.abbrev, row.pos].filter(Boolean).join(', ')}
                                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, opacity: pressed ? 0.7 : 1 })}
                            >
                                <PlayerPhoto personId={row.id} name={row.name} size={40} team={team ?? null} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Txt weight="bold" numberOfLines={1}>
                                        {row.name}
                                    </Txt>
                                    <Txt size={12} tone="muted" numberOfLines={1}>
                                        {[team?.abbrev, row.pos].filter(Boolean).join(' · ')}
                                    </Txt>
                                </View>
                                <Txt size={18} weight="extrabold" tone="accentInk" tabular>
                                    {Math.round(row.pts * 10) / 10}
                                </Txt>
                            </Pressable>
                        );
                    })}
                    {!matches.length && (
                        <Txt size={14} tone="muted" center style={{ paddingVertical: 24 }}>
                            {players.isPending ? t('compare.loading') : t('compare.none')}
                        </Txt>
                    )}
                </View>
            </>
        );
    }

    const otherTeam = other.teamId ? teams[other.teamId] : undefined;
    // Si son del mismo equipo, el segundo va en gris para que se distingan
    const otherColor = otherTeam?.color && otherTeam.color.toLowerCase() !== myColor.toLowerCase() ? otherTeam.color : '#64748b';
    const left: Side = { name: player.name, color: myColor };
    const right: Side = { name: other.name, color: otherColor };
    const mine = asRow(player);
    const columns = (keys: string[]) =>
        keys
            .map((key) => STAT_COLUMNS[role][key])
            .filter((column): column is StatColumn => !!column)
            // Sin cifra para ninguno de los dos (FIP sin la constante de la liga) no se compara
            .filter((column) => column.value(mine, ctx) !== null || column.value(other, ctx) !== null);
    const rowsOf = (list: StatColumn[], label: (column: StatColumn) => string) =>
        list.map((column, index) => (
            <CompareRow
                key={column.key}
                label={label(column)}
                a={column.value(mine, ctx)}
                b={column.value(other, ctx)}
                aText={column.show(mine, ctx)}
                bText={column.show(other, ctx)}
                higher={!column.asc}
                left={left}
                right={right}
                first={index === 0}
            />
        ));
    // El otro (foto y nombre) lleva a su ficha; las siglas de los dos, a su equipo. El de la izquierda es el de la ficha de atrás
    const side = (row: PlayerRow, team: { id: number; logo: string; color: string; abbrev: string } | null | undefined, color: string, linked = false) => (
        <>
            <PlayerLink player={{ id: row.id, name: row.name, teamId: team?.id }} disabled={!linked} style={{ alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                <PlayerPhoto personId={row.id} name={row.name} size={64} background="rgba(255,255,255,0.3)" team={team ?? null} />
                <Txt size={14} weight="extrabold" color={inkOn(color)} numberOfLines={1} style={{ maxWidth: '100%' }}>
                    {row.name}
                </Txt>
            </PlayerLink>
            <Txt size={12} weight="bold" color={inkOn(color)} numberOfLines={1} style={{ opacity: 0.8 }}>
                {team?.abbrev ? <Text {...teamTextLink(team.id)}>{team.abbrev}</Text> : null}
                {team?.abbrev && row.pos ? ' · ' : ''}
                {row.pos}
            </Txt>
        </>
    );

    return body(
        <>
            <Faceoff leftColor={myColor} rightColor={otherColor} onSwap={() => setOtherId(null)} left={side(mine, player.team, myColor)} right={side(other, otherTeam, otherColor, true)} />
            <Group title={t('compare.fantasy')}>{rowsOf(columns(['pts', 'ppg']), (column) => (column.key === 'pts' ? t('compare.points') : t('compare.perGame')))}</Group>
            <Group title={role === 'P' ? t('statsPage.pitchers') : t('statsPage.batters')}>{rowsOf(columns(PLAYER_METRICS[role]), (column) => t(`pro.short.${column.key}`))}</Group>
        </>
    );
};
