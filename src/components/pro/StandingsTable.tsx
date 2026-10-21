// Tabla de posiciones del modo PRO (igual que la de la web): columna fija con puesto, logo, sigla y estrella; un
// segmentado Resumen · Carreras · Situaciones para no deslizar de lado; PCT con barra, DIF divergente, suerte contra el
// esperado, insignias de clasificado/eliminado y la línea de corte visible. En el Clásico (variant «pool») salen solo
// las columnas con datos. Es una variante de ProTable del kit: las filas con insignia son más altas (ProTable usa un
// alto fijo) y la columna resaltada (PCT, DIF o la ordenada) sigue de corrido por la línea de corte.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Check, Star } from 'lucide-react-native';
import type { SeasonCalendar, SplitType } from '../../types/pro-liga';
import { teamDisplayName } from '../../lib/teams';
import { usePreferences } from '../../state/preferences';
import { useColors } from '../../theme/theme';
import { alpha } from '../../theme/tokens';
import { TeamLogo, Txt } from '../ui';
import {
    Chip,
    DivergingBar,
    GlossaryButton,
    GrowBar,
    MOTION_EASE,
    MOTION_MS,
    ModuleHeader,
    ProSegmented,
    Enter,
    fmtSigned,
    mix,
    teamInk,
    useInView,
    useMotion,
    useProColors,
    useReorder,
    type GlossaryEntry
} from './kit';
import { activeSituations, formResults, gamesOf, joinList, luckOf, runDiffOf, splitsOf, standingBadge, streakParts, winShare, type StandingBadge, type TableRow } from './posiciones/logic';

export type TableView = 'summary' | 'runs' | 'situations';

interface StandingsTableProps {
    rows: TableRow[];
    /** Cuántos pasan (línea de corte); null sin corte */
    advance: number | null;
    /** Texto de la línea de corte («Pasan al Round Robin») */
    cutLabel?: string;
    /** Para los puntos de los últimos 10 */
    calendar?: SeasonCalendar;
    /** full: LIDOM y Serie del Caribe con sus vistas; pool: grupo del Clásico (solo lo que MLB manda) */
    variant?: 'full' | 'pool';
    /** Nombre de la tabla para el lector de pantalla («Tabla de posiciones, Serie regular») */
    caption: string;
    /** Título del módulo (por defecto «Tabla») */
    title?: string;
    /** Botones a la derecha del título (compartir el grupo) */
    actions?: React.ReactNode;
}

interface Column {
    id: string;
    header: string;
    /** Nombre completo (lector de pantalla y «Ordenar por …») */
    title: string;
    width: number;
    align?: 'left' | 'right' | 'center';
    /** Columna resaltada con el acento al 10 % (PCT, DIF, la ordenada) */
    highlight?: boolean;
    sortValue?: (row: TableRow) => number | null;
    cell: (row: TableRow, index: number) => React.ReactNode;
}

const SITUATION_KEY: Record<SplitType, string> = {
    home: 'home',
    away: 'away',
    day: 'day',
    night: 'night',
    left: 'left',
    right: 'right',
    oneRun: 'oneRun',
    extraInning: 'extraInning',
    winners: 'winners',
    leftHome: 'left',
    leftAway: 'left',
    rightHome: 'right',
    rightAway: 'right',
    lastTen: 'lastTen'
};

const HEADER = 40;
const CUT = 28;
const record = (split: { wins: number; losses: number } | null | undefined) => (split ? `${split.wins}-${split.losses}` : '—');

// Brillo verde que se enciende y se apaga una vez al aparecer la insignia de clasificado
const ShineOnce: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const motion = useMotion();
    const pro = useProColors();
    const glow = useSharedValue(0);
    useEffect(() => {
        if (!motion.animate) return;
        glow.set(withSequence(withTiming(0.55, { duration: MOTION_MS.flip, easing: MOTION_EASE }), withTiming(0, { duration: 600, easing: MOTION_EASE })));
        return () => cancelAnimation(glow);
    }, [motion.animate, glow]);
    const halo = useAnimatedStyle(() => ({ opacity: glow.get() }));
    return (
        <View style={{ alignSelf: 'flex-start' }}>
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -3, bottom: -3, left: -3, right: -3, borderRadius: 999, backgroundColor: pro.up }, halo]} />
            {children}
        </View>
    );
};

// Insignia bajo la sigla: «Clasificado ✓», «Eliminado», «N.º elim. 3»
const Badge: React.FC<{ badge: StandingBadge }> = ({ badge }) => {
    const { t } = useTranslation();
    const pro = useProColors();
    if (!badge) return null;
    const small = { height: 18, paddingHorizontal: 6 };
    if (badge.kind === 'clinched')
        return (
            <ShineOnce>
                <Chip tone="up" icon={<Check size={11} color={pro.up} />} style={small}>
                    <Txt size={10} weight="extrabold" color={pro.up}>
                        {t('pro.posiciones.table.badge.clinched')}
                    </Txt>
                </Chip>
            </ShineOnce>
        );
    if (badge.kind === 'eliminated')
        return (
            <Chip tone="neutral" style={[small, { alignSelf: 'flex-start' }]}>
                <Txt size={10} weight="extrabold" tone="muted">
                    {t('pro.posiciones.table.badge.eliminated')}
                </Txt>
            </Chip>
        );
    return (
        <Chip tone="down" style={[small, { alignSelf: 'flex-start' }]}>
            <Txt size={10} weight="extrabold" color={pro.down}>
                {t('pro.posiciones.table.badge.elimination', { count: badge.number })}
            </Txt>
        </Chip>
    );
};

// Últimos 10 en dos filas de 5 puntitos (la de FormDots del kit mide 107 px: no cabe en la tabla)
const MiniForm: React.FC<{ results: ('W' | 'L')[] }> = ({ results }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const shown = results.slice(0, 10);
    const wins = shown.filter((result) => result === 'W').length;
    return (
        <View accessible accessibilityRole="image" accessibilityLabel={t('pro.kit.form.aria', { count: 10, wins, losses: shown.length - wins })} style={{ width: 33, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
            {Array.from({ length: 10 }, (_, index) => {
                const result = shown[index];
                return result ? (
                    <View key={index} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: result === 'W' ? colors.ball : colors.strike }} />
                ) : (
                    <View key={index} style={{ width: 5, height: 5, borderRadius: 3, borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(colors.line, 0.35) }} />
                );
            })}
        </View>
    );
};

export const StandingsTable: React.FC<StandingsTableProps> = ({ rows, advance, cutLabel, calendar, variant = 'full', caption, title, actions }) => {
    const { t, i18n } = useTranslation();
    const colors = useColors();
    const pro = useProColors();
    const reorder = useReorder();
    const { favoriteTeamId, toggleFavoriteTeam } = usePreferences();
    const narrow = useWindowDimensions().width < 360;
    const [view, setView] = useState<TableView>('summary');
    const [sort, setSort] = useState<{ id: SplitType; dir: 'desc' } | null>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const [scroll, setScroll] = useState({ view: 0, content: 0, x: 0 });
    const { setNode, onLayout: look, seen } = useInView();
    const situations = useMemo(() => activeSituations(rows), [rows]);
    const maxDiff = useMemo(() => Math.max(1, ...rows.map((row) => Math.abs(runDiffOf(row) ?? 0))), [rows]);
    const pool = variant === 'pool';
    const sortedBy = view === 'situations' && sort && situations.includes(sort.id) ? sort.id : null;

    if (!rows.length) {
        return (
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 32, paddingHorizontal: 16 }}>
                <Txt size={14} tone="muted" center>
                    {t('standings.noData')}
                </Txt>
            </View>
        );
    }

    const situationName = (id: SplitType) => t(`pro.posiciones.table.situations.${SITUATION_KEY[id]}`);
    const situationLong = (id: SplitType) => t(`pro.posiciones.table.situationsLong.${SITUATION_KEY[id]}`);
    const showName = view !== 'situations';
    const badgeOf = (row: TableRow) => (pool ? null : standingBadge(row, advance));
    // Alto de cada fila: el mismo en la parte fija y en la que se desliza
    const heightOf = (row: TableRow) => (showName ? 46 : 40) + (badgeOf(row) ? 20 : 0);
    const cutAfter = (index: number) => advance !== null && !sortedBy && index === advance - 1 && rows.length > advance;

    const ordered = sortedBy
        ? rows
              .map((row, index) => ({ row, index, key: winShare(splitsOf(row)[sortedBy]) }))
              .sort((a, b) => (a.key === null ? (b.key === null ? a.index - b.index : 1) : b.key === null ? -1 : b.key - a.key || a.index - b.index))
              .map((item) => item.row)
        : rows;

    const teamWidth = pool ? 132 : view === 'situations' ? 96 : 122;
    // Ancho de una columna según lo más largo que tenga que escribir (cifras de 14 px ≈ 8.2 px cada una): al empezar
    // la temporada el Resumen cabe a 390 px sin deslizar; con «23-19» o JD «10.5» la franja se desliza unos px
    const fit = (texts: string[], extra: number, min: number) => Math.max(min, Math.ceil(Math.max(0, ...texts.map((text) => text.length)) * 8.2 + extra));

    const recordColumn: Column = {
        id: 'record',
        header: t('pro.posiciones.table.cols.record'),
        title: t('pro.posiciones.glossary.record.name'),
        width: fit(rows.map((row) => `${row.wins}-${row.losses}`), 8, 36),
        cell: (row) => (
            <Txt size={14} weight="extrabold" tabular numberOfLines={1}>
                {`${row.wins}-${row.losses}`}
            </Txt>
        )
    };
    const pctColumn: Column = {
        id: 'pct',
        header: t('pro.posiciones.table.cols.pct'),
        title: t('pro.posiciones.glossary.pct.name'),
        width: fit(rows.map((row) => row.pct), 23, 56),
        highlight: true,
        cell: (row, index) => {
            const pct = Number.parseFloat(row.pct);
            return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <GrowBar value={Number.isFinite(pct) ? pct : 0} color={row.team.color} index={index} seen={seen} height={6} style={{ width: 12 }} />
                    <Txt size={14} weight="extrabold" tabular numberOfLines={1}>
                        {row.pct}
                    </Txt>
                </View>
            );
        }
    };
    const gbColumn: Column = {
        id: 'gb',
        header: t('pro.posiciones.table.cols.gb'),
        title: t('pro.posiciones.glossary.gb.name'),
        width: fit(rows.map((row) => (row.gamesBack === '-' ? '' : row.gamesBack)), 8, 26),
        cell: (row) => (
            <Txt size={14} weight="semibold" tone="muted" tabular numberOfLines={1}>
                {row.gamesBack === '-' ? '—' : row.gamesBack}
            </Txt>
        )
    };
    const diffColumn: Column = {
        id: 'diff',
        header: t('pro.posiciones.table.cols.diff'),
        title: t('pro.posiciones.glossary.diff.name'),
        width: 70,
        highlight: view === 'runs',
        cell: (row, index) => {
            const diff = runDiffOf(row);
            if (diff === null)
                return (
                    <Txt size={14} tone="muted">
                        —
                    </Txt>
                );
            return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <DivergingBar value={diff} spread={maxDiff} index={index} seen={seen} height={6} style={{ width: 24 }} />
                    <Txt size={14} weight="extrabold" tabular color={diff > 0 ? pro.up : diff < 0 ? pro.down : undefined} numberOfLines={1} style={{ minWidth: 28, textAlign: 'right' }}>
                        {fmtSigned(diff)}
                    </Txt>
                </View>
            );
        }
    };

    const columns: Column[] = (() => {
        if (pool) {
            // Clásico: MLB manda G-P, PCT, JD y la diferencia de carreras; lo vacío no sale
            const list = [recordColumn, pctColumn];
            if (rows.some((row) => row.gamesBack && row.gamesBack !== '-')) list.push(gbColumn);
            if (rows.some((row) => runDiffOf(row) !== null)) list.push(diffColumn);
            return list;
        }
        if (view === 'runs') {
            return [
                { id: 'rs', header: t('pro.posiciones.table.cols.rs'), title: t('pro.posiciones.glossary.rs.name'), width: 36, cell: (row) => <Txt size={14} weight="semibold" tabular>{row.runsScored ?? '—'}</Txt> },
                { id: 'ra', header: t('pro.posiciones.table.cols.ra'), title: t('pro.posiciones.glossary.ra.name'), width: 36, cell: (row) => <Txt size={14} weight="semibold" tabular>{row.runsAllowed ?? '—'}</Txt> },
                diffColumn,
                {
                    id: 'expected',
                    header: t('pro.posiciones.table.cols.expected'),
                    title: t('pro.posiciones.glossary.expected.name'),
                    width: 42,
                    cell: (row) => (
                        <Txt size={14} weight="semibold" tabular tone={row.pro?.expected ? 'ink' : 'muted'}>
                            {row.pro?.expected ? `${row.pro.expected.wins}-${row.pro.expected.losses}` : '—'}
                        </Txt>
                    )
                },
                {
                    id: 'luck',
                    header: t('pro.posiciones.table.cols.luck'),
                    title: t('pro.posiciones.glossary.luck.name'),
                    width: 52,
                    align: 'center',
                    cell: (row) => {
                        const luck = luckOf(row);
                        if (luck === null)
                            return (
                                <Txt size={14} tone="muted">
                                    —
                                </Txt>
                            );
                        const tone = luck > 0 ? 'up' : luck < 0 ? 'down' : 'neutral';
                        return (
                            <Chip tone={tone} accessibilityLabel={t('pro.posiciones.table.luckAria', { n: luck === 0 ? '0' : fmtSigned(luck) })} style={{ paddingHorizontal: 7 }}>
                                <Txt size={11} weight="extrabold" color={luck > 0 ? pro.up : luck < 0 ? pro.down : colors.muted}>
                                    {luck === 0 ? '±0' : fmtSigned(luck)}
                                </Txt>
                            </Chip>
                        );
                    }
                }
            ];
        }
        if (view === 'situations') {
            return situations.map<Column>((id) => ({
                id,
                header: situationName(id),
                title: situationLong(id),
                width: 46,
                align: 'center',
                highlight: sortedBy === id,
                sortValue: (row) => winShare(splitsOf(row)[id]),
                cell: (row) => {
                    const split = splitsOf(row)[id];
                    const share = winShare(split);
                    const strength = share === null ? 0 : Math.abs(share - 0.5) * 2;
                    const background = share === null || share === 0.5 ? colors.raised : alpha(share > 0.5 ? pro.up : pro.down, 0.16 + strength * 0.3);
                    return (
                        <View style={{ height: 30, minWidth: 38, paddingHorizontal: 4, borderRadius: 8, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
                            <Txt size={12} weight="extrabold" tabular tone={share === null ? 'muted' : 'ink'}>
                                {gamesOf(split) ? record(split) : '0-0'}
                            </Txt>
                        </View>
                    );
                }
            }));
        }
        return [
            recordColumn,
            pctColumn,
            gbColumn,
            {
                id: 'streak',
                header: t('pro.posiciones.table.cols.streak'),
                title: t('pro.posiciones.glossary.streak.name'),
                width: fit(rows.map((row) => row.streak ?? ''), 20, 38),
                align: 'center',
                cell: (row) => {
                    const streak = streakParts(row.streak);
                    if (!streak)
                        return (
                            <Txt size={14} tone="muted">
                                —
                            </Txt>
                        );
                    return (
                        <Chip
                            tone={streak.won ? 'up' : 'down'}
                            accessibilityLabel={t(streak.won ? 'pro.posiciones.table.streakWon' : 'pro.posiciones.table.streakLost', { count: streak.count })}
                            style={{ paddingHorizontal: 7 }}
                        >
                            <Txt size={11} weight="extrabold" color={streak.won ? pro.up : pro.down}>
                                {`${streak.won ? t('standings.wonShort') : t('standings.lostShort')}${streak.count}`}
                            </Txt>
                        </Chip>
                    );
                }
            },
            {
                id: 'last10',
                header: t('pro.posiciones.table.cols.last10'),
                title: t('pro.posiciones.glossary.last10.name'),
                width: 42,
                align: 'left',
                cell: (row) => {
                    const results = formResults(calendar, row.team.id);
                    if (results) return <MiniForm results={results} />;
                    return (
                        <Txt size={13} weight="semibold" tone="muted" tabular>
                            {record(row.lastTen)}
                        </Txt>
                    );
                }
            }
        ];
    })();

    const situationsEmpty = view === 'situations' && !pool && situations.length === 0;
    const hidden = (['home', 'away', 'day', 'night', 'left', 'right', 'oneRun', 'extraInning', 'winners'] as SplitType[]).filter((id) => !situations.includes(id));

    const glossary: GlossaryEntry[] = ['record', 'pct', 'gb', 'streak', 'last10', 'rs', 'ra', 'diff', 'expected', 'luck', 'homeAway', 'dayNight', 'leftRight', 'oneRunExtra', 'winners', 'elimination', 'clinched', 'eliminated'].map((key) => ({
        term: t(`pro.posiciones.glossary.${key}.term`),
        name: t(`pro.posiciones.glossary.${key}.name`),
        description: i18n.exists(`pro.posiciones.glossary.${key}.description`) ? t(`pro.posiciones.glossary.${key}.description`) : undefined,
        formula: i18n.exists(`pro.posiciones.glossary.${key}.formula`) ? t(`pro.posiciones.glossary.${key}.formula`) : undefined
    }));

    const changeView = (next: TableView) => {
        setView(next);
        setSort(null);
    };
    const toggleSort = (id: SplitType) => setSort((current) => (current?.id === id ? null : { id, dir: 'desc' }));

    const favoriteHere = favoriteTeamId !== null && rows.some((row) => row.team.id === favoriteTeamId);
    const note = pool
        ? null
        : view === 'summary'
          ? [favoriteHere ? t('pro.posiciones.table.noteFavorite') : '', advance !== null && cutLabel ? t('pro.posiciones.table.noteCut') : ''].filter(Boolean).join(' ')
          : view === 'runs'
            ? t('pro.posiciones.table.noteRuns')
            : situationsEmpty
              ? null
              : sortedBy
                ? t('pro.posiciones.table.noteSorted', { name: situationName(sortedBy) })
                : [t('pro.posiciones.table.noteSituations'), hidden.length ? t('pro.posiciones.table.noteHidden', { list: joinList(hidden.map(situationName), t('pro.posiciones.table.and')) }).replace(/\.\.$/, '.') : ''].filter(Boolean).join(' ');

    // ------------------------------------------------------------ piezas de la tabla

    const align = (value: Column['align']): ViewStyle['alignItems'] => (value === 'left' ? 'flex-start' : value === 'center' ? 'center' : 'flex-end');
    const columnBox = (column: Column): ViewStyle => ({ flexGrow: 1, flexBasis: column.width, minWidth: column.width, paddingHorizontal: 3, alignItems: align(column.align), justifyContent: 'center' });
    const tint = (row: TableRow) => (row.team.id === favoriteTeamId ? colors.gold : null);
    const line = { borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08) };

    const head = (column: Column) => {
        const active = sortedBy === column.id;
        const label = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Txt size={10} weight="extrabold" color={active || column.highlight ? colors.accentInk : colors.muted} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {column.header}
                </Txt>
                {(active || (column.id === 'pct' && view === 'summary')) && <ArrowDown size={10} color={colors.accentInk} />}
            </View>
        );
        const box: ViewStyle[] = [columnBox(column), { height: HEADER, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: column.highlight ? alpha(colors.accent, 0.1) : undefined }];
        if (!column.sortValue)
            return (
                <View key={column.id} style={box} accessible accessibilityLabel={column.title}>
                    {label}
                </View>
            );
        return (
            <Pressable
                key={column.id}
                onPress={() => toggleSort(column.id as SplitType)}
                accessibilityRole="button"
                accessibilityLabel={t('pro.kit.table.sortBy', { column: column.title })}
                accessibilityState={{ selected: active }}
                hitSlop={{ top: 2, bottom: 2 }}
                style={box}
            >
                {label}
            </Pressable>
        );
    };

    const teamCell = (row: TableRow) => {
        const favorite = favoriteTeamId === row.team.id;
        const name = teamDisplayName(row.team, i18n.language);
        const badge = badgeOf(row);
        return (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 6, paddingRight: 2 }}>
                <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: row.team.color, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size={10} weight="black" color={teamInk(row.team.color)} tabular>
                        {row.rank}
                    </Txt>
                </View>
                <TeamLogo team={row.team} size={18} />
                <View accessible accessibilityLabel={t('pro.posiciones.table.rowName', { rank: row.rank, name })} style={{ flex: 1, minWidth: 0, marginLeft: 2 }}>
                    <Txt size={15} weight="black" numberOfLines={1}>
                        {row.team.abbrev}
                    </Txt>
                    {showName && (
                        <Txt size={11} weight="semibold" tone="muted" numberOfLines={1}>
                            {row.team.flag ? name : row.team.shortName || name}
                        </Txt>
                    )}
                    {badge && (
                        <View style={{ marginTop: 2 }}>
                            <Badge badge={badge} />
                        </View>
                    )}
                </View>
                {!pool && (
                    <Pressable
                        onPress={() => toggleFavoriteTeam(row.team.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: favorite }}
                        accessibilityLabel={favorite ? t('teams.removeFavorite', { name }) : t('teams.addFavorite', { name })}
                        // 44 px para tocar, pero solo ocupa 22 en la fila
                        hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                        style={{ width: 20, height: 28, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Star size={16} color={favorite ? colors.gold : colors.muted} fill={favorite ? colors.gold : 'transparent'} />
                    </Pressable>
                )}
            </View>
        );
    };

    const cutRow = (
        <View style={{ height: CUT, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }} accessible accessibilityLabel={cutLabel}>
            <View style={{ height: 2, flex: 1, borderRadius: 1, backgroundColor: alpha(colors.accent, 0.4) }} />
            <Txt size={11} weight="extrabold" color={colors.accentInk} numberOfLines={1}>
                {cutLabel}
            </Txt>
            <View style={{ height: 2, flex: 1, borderRadius: 1, backgroundColor: alpha(colors.accent, 0.4) }} />
        </View>
    );

    const part = (fixedPart: boolean) => (
        <>
            {fixedPart ? (
                <View style={{ height: HEADER, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6 }}>
                    <Txt size={10} weight="extrabold" tone="muted">
                        #
                    </Txt>
                    <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        {t('pro.posiciones.table.cols.team')}
                    </Txt>
                </View>
            ) : (
                <View style={{ flexDirection: 'row' }}>{columns.map(head)}</View>
            )}
            {ordered.map((row, index) => {
                const color = tint(row);
                const height = heightOf(row);
                const background = color ? (fixedPart ? mix(colors.surface, color, 0.12) : alpha(color, 0.12)) : fixedPart ? colors.surface : undefined;
                const body = fixedPart ? (
                    <View style={[{ height, flexDirection: 'row', backgroundColor: background }, line]}>
                        {color && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: color }} />}
                        {teamCell(row)}
                    </View>
                ) : (
                    <View style={[{ height, flexDirection: 'row', backgroundColor: background }, line]}>
                        {columns.map((column) => (
                            <View key={column.id} style={[columnBox(column), { backgroundColor: column.highlight ? alpha(colors.accent, 0.1) : undefined }]}>
                                {column.cell(row, index)}
                            </View>
                        ))}
                    </View>
                );
                return (
                    <Animated.View key={row.team.id} layout={reorder}>
                        <Enter index={index}>{body}</Enter>
                        {cutAfter(index) ? (
                            fixedPart ? (
                                // La línea de corte va en la parte fija con el ancho de toda la tabla, encima de lo que se desliza
                                <View style={{ height: CUT, width: tableWidth || undefined, zIndex: 3 }}>{cutRow}</View>
                            ) : (
                                <View style={{ height: CUT, flexDirection: 'row' }}>
                                    {columns.map((column) => (
                                        <View key={column.id} style={[columnBox(column), { backgroundColor: column.highlight ? alpha(colors.accent, 0.1) : undefined }]} />
                                    ))}
                                </View>
                            )
                        ) : null}
                    </Animated.View>
                );
            })}
            {/* Cierre redondeado de la columna resaltada */}
            {!fixedPart && (
                <View style={{ flexDirection: 'row' }}>
                    {columns.map((column) => (
                        <View key={column.id} style={[columnBox(column), { height: 6, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: column.highlight ? alpha(colors.accent, 0.1) : undefined }]} />
                    ))}
                </View>
            )}
            {fixedPart && <View style={{ height: 6 }} />}
        </>
    );

    const more = scroll.content - scroll.view - scroll.x > 4;
    const views: { value: TableView; label: string }[] = [
        { value: 'summary', label: t('pro.posiciones.table.views.summary') },
        { value: 'runs', label: t('pro.posiciones.table.views.runs') },
        { value: 'situations', label: t('pro.posiciones.table.views.situations') }
    ];

    return (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: narrow ? 12 : 16, gap: 10 }}>
            <ModuleHeader
                title={title ?? t('pro.posiciones.table.title')}
                aside={
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: -12, marginRight: -8 }}>
                        {actions}
                        <GlossaryButton title={t('pro.posiciones.glossary.title')} entries={glossary} intro={t('pro.posiciones.glossary.intro')} />
                    </View>
                }
            />
            {!pool && <ProSegmented value={view} onChange={changeView} options={views} label={t('pro.posiciones.table.views.label')} track="raised" />}
            {situationsEmpty ? (
                <View style={{ backgroundColor: colors.raised, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 24 }}>
                    <Txt size={14} tone="muted" center style={{ lineHeight: 19 }}>
                        {t('pro.posiciones.table.situationsEmpty')}
                    </Txt>
                </View>
            ) : (
                // La tabla toma 6 px del margen de la tarjeta a cada lado (como el diseño) para caber sin deslizar
                <View
                    ref={setNode}
                    accessibilityLabel={caption}
                    onLayout={(event) => {
                        setTableWidth(event.nativeEvent.layout.width);
                        look();
                    }}
                    style={{ flexDirection: 'row', marginHorizontal: -6, minWidth: 0 }}
                >
                    <View style={{ width: teamWidth, zIndex: 2, backgroundColor: colors.surface }}>{part(true)}</View>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ flexGrow: 1 }}
                        scrollEventThrottle={32}
                        onLayout={(event) => {
                            const width = event.nativeEvent.layout.width;
                            setScroll((current) => (current.view === width ? current : { ...current, view: width }));
                        }}
                        onContentSizeChange={(content) => setScroll((current) => (current.content === content ? current : { ...current, content }))}
                        onScroll={(event) => {
                            const x = event.nativeEvent.contentOffset.x;
                            setScroll((current) => ({ ...current, x }));
                        }}
                    >
                        <View style={{ flexGrow: 1 }}>{part(false)}</View>
                    </ScrollView>
                    {/* Sombra a la derecha mientras queden columnas por ver */}
                    {more && <LinearGradient pointerEvents="none" colors={[alpha(colors.surface, 0), colors.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 24 }} />}
                </View>
            )}
            {view === 'situations' && !pool && !situationsEmpty && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 6 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Txt size={11} weight="semibold" tone="muted">
                            {t('pro.posiciones.table.legendLow')}
                        </Txt>
                        <LinearGradient colors={[alpha(pro.down, 0.5), colors.raised, alpha(pro.up, 0.5)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 80, height: 8, borderRadius: 4 }} />
                        <Txt size={11} weight="semibold" tone="muted">
                            {t('pro.posiciones.table.legendHigh')}
                        </Txt>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colors.raised, borderWidth: 1, borderColor: alpha(colors.line, 0.2) }} />
                        <Txt size={11} weight="semibold" tone="muted">
                            {t('pro.posiciones.table.legendEmpty')}
                        </Txt>
                    </View>
                </View>
            )}
            {note ? (
                <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
                    {note}
                </Txt>
            ) : null}
        </View>
    );
};
