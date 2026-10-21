import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import type { HittingLine, PitchingLine, PlayerDetail, StatsTeam } from '../../../lib/stats';
import { numOf } from '../../../lib/advanced';
import { useLeague } from '../../../state/league';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import type { PlayerPro, ProPhaseId } from '../../../types/pro-liga';
import { TeamLogo, Txt } from '../../ui';
import { ChipButton, ChipRow, ModuleHeader, useElementWidth, useGrow, useInView, useProColors } from '../kit';
import { eraOf, ipOf, slashOf, sumHitting, sumPitching, whipOf } from '../estadisticas/logic';
import { era, rate } from './format';

interface CareerLine {
    season: number;
    team: StatsTeam | null;
    hitting: HittingLine | null;
    pitching: PitchingLine | null;
    pts: number;
}

const ROW = 44;
const FIRST = 76;
const shortSeason = (season: number, league: string) => (league === 'lidom' ? `${String(season).slice(2)}-${String(season + 1).slice(2)}` : String(season));

// Carrera en la liga: barras de OPS (o EFE) por temporada en el color de su equipo y la tabla por temporada con la
// fila «Total» fija (el total de carrera de MLB). Con más de una fase (Round Robin, final) se elige cuál ver.
export const CareerPro: React.FC<{ player: PlayerDetail; pro?: PlayerPro }> = ({ player, pro }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const proColors = useProColors();
    const { activeLeague } = useLeague();
    const { width, onLayout } = useElementWidth(358);
    const { setNode, onLayout: look, seen } = useInView();
    const pitcher = player.role === 'P';
    const phases = useMemo(() => [...new Set((pro?.career ?? []).map((row) => row.phase).filter((phase): phase is ProPhaseId => !!phase))], [pro?.career]);
    const [phase, setPhase] = useState<ProPhaseId | null>(null);
    const active = phase && phases.includes(phase) ? phase : (phases[0] ?? null);

    const rows: CareerLine[] = useMemo(() => {
        if (pro?.career?.length) {
            return pro.career
                .filter((row) => row.phase === active)
                .map((row) => ({ season: row.season, team: row.team, hitting: (row.hitting as HittingLine | undefined) ?? null, pitching: (row.pitching as PitchingLine | undefined) ?? null, pts: row.pts }))
                .sort((a, b) => b.season - a.season);
        }
        return player.career.map((row) => ({ season: row.season, team: row.team, hitting: row.hitting ?? null, pitching: row.pitching ?? null, pts: row.pts })).sort((a, b) => b.season - a.season);
    }, [pro?.career, player.career, active]);
    if (!rows.length) return null;

    const valueOf = (row: { hitting: HittingLine | null; pitching: PitchingLine | null }) => (pitcher ? numOf(row.pitching?.era) : numOf(row.hitting?.ops));
    const games = (row: CareerLine) => (pitcher ? row.pitching?.g : row.hitting?.g) ?? 0;
    const totalFromMlb = pro?.careerTotals?.find((row) => row.phase === active);
    const hits = sumHitting(rows.map((row) => row.hitting));
    const pitches = sumPitching(rows.map((row) => row.pitching));
    const mlbHitting = (totalFromMlb?.hitting as HittingLine | undefined) ?? null;
    const mlbPitching = (totalFromMlb?.pitching as PitchingLine | undefined) ?? null;
    const totalPts = totalFromMlb ? totalFromMlb.pts : Math.round(rows.reduce((sum, row) => sum + row.pts, 0) * 10) / 10;
    const totalGames = totalFromMlb ? ((pitcher ? mlbPitching?.g : mlbHitting?.g) ?? 0) : pitcher ? pitches.g : hits.g;
    const teams = new Set(rows.map((row) => row.team?.id).filter(Boolean)).size;
    const slash = slashOf(hits);
    const totalCells = pitcher
        ? [totalGames, mlbPitching ? `${mlbPitching.w}-${mlbPitching.l}` : '—', mlbPitching ? mlbPitching.era : era(eraOf(pitches)), mlbPitching ? mlbPitching.ip : ipOf(pitches.outs), mlbPitching ? mlbPitching.k : pitches.k, mlbPitching ? mlbPitching.whip : era(whipOf(pitches))]
        : [totalGames, mlbHitting ? mlbHitting.avg : rate(slash.avg), mlbHitting ? mlbHitting.obp : rate(slash.obp), mlbHitting ? mlbHitting.ops : rate(slash.ops), mlbHitting ? mlbHitting.hr : hits.hr, mlbHitting ? mlbHitting.sb : hits.sb];
    const cells = (row: CareerLine) =>
        pitcher
            ? [games(row), row.pitching ? `${row.pitching.w}-${row.pitching.l}` : '—', row.pitching?.era ?? '—', row.pitching?.ip ?? '—', row.pitching?.k ?? 0, row.pitching?.whip ?? '—']
            : [games(row), row.hitting?.avg ?? '—', row.hitting?.obp ?? '—', row.hitting?.ops ?? '—', row.hitting?.hr ?? 0, row.hitting?.sb ?? 0];
    const head = pitcher ? ['g', 'wl', 'era', 'ip', 'k', 'whip'] : ['g', 'avg', 'obp', 'ops', 'hr', 'sb'];
    const widths = pitcher ? [28, 40, 42, 42, 30, 42] : [28, 40, 40, 40, 28, 28];
    const teamWidth = 34;
    const ptsWidth = 48;
    const rest = teamWidth + widths.reduce((sum, value) => sum + value, 0) + ptsWidth;
    // Si sobra ancho, las columnas lo reparten; si falta, la tabla se desliza de lado
    const room = Math.max(0, width - FIRST - rest);
    const grow = (value: number) => value + room / (widths.length + 2);
    const label = (key: string) => t(`statsPage.labels.${key}`, { defaultValue: t(`pro.estadisticas.cols.${key}.short`) });

    // Barras de la más vieja a la más nueva
    const chrono = [...rows].reverse();
    const values = chrono.map((row) => valueOf(row));
    const max = Math.max(0.001, ...values.filter((value): value is number => value !== null));
    const totalSeasonsGames = rows.reduce((sum, row) => sum + games(row), 0);
    const seasonCell = (season: number) => (shortSeason(season, activeLeague).length > 4 ? `${season}-${String(season + 1).slice(2)}` : String(season));
    const ptsText = (pts: number) => (pts < 0 ? `−${Math.abs(pts)}` : String(pts));
    const line = { borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.08) };

    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader title={t('pro.ficha.career.title', { league: t(`leagues.${activeLeague}.name`) })} />
            {phases.length > 1 && (
                <ChipRow label={t('pro.ficha.career.phase')} bleed={false}>
                    {phases.map((item) => (
                        <ChipButton key={item} active={item === active} onPress={() => setPhase(item)}>
                            {t(`pro.estadisticas.phases.${item}`)}
                        </ChipButton>
                    ))}
                </ChipRow>
            )}
            <View onLayout={onLayout} style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), overflow: 'hidden' }, shadow('card')]}>
                {chrono.length > 1 && (
                    <View ref={setNode} onLayout={look} style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
                        <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <Txt size={11} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
                                {t(pitcher ? 'pro.ficha.career.barsP' : 'pro.ficha.career.barsB')}
                            </Txt>
                            <Txt size={12} weight="semibold" tone="muted">
                                {t('pro.ficha.career.summary', { count: rows.length, games: totalSeasonsGames })}
                            </Txt>
                        </View>
                        <View
                            accessible
                            accessibilityRole="image"
                            accessibilityLabel={t('pro.ficha.career.barsAria', { metric: t(pitcher ? 'pro.ficha.byRival.era' : 'pro.ficha.byRival.ops'), list: chrono.map((row, index) => `${shortSeason(row.season, activeLeague)}: ${pitcher ? era(values[index]) : rate(values[index])}`).join(', ') })}
                            style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}
                        >
                            {chrono.map((row, index) => (
                                <SeasonBar
                                    key={`${row.season}-${row.team?.id}`}
                                    text={pitcher ? era(values[index]) : rate(values[index])}
                                    share={values[index] === null ? 0 : values[index]! / max}
                                    label={shortSeason(row.season, activeLeague)}
                                    color={row.team?.color || colors.accent}
                                    viewing={row.season === player.season}
                                    index={index}
                                    seen={seen}
                                />
                            ))}
                        </View>
                    </View>
                )}
                <View accessibilityLabel={t('pro.ficha.career.caption')} style={{ flexDirection: 'row' }}>
                    {/* Temporada: columna fija */}
                    <View style={{ width: FIRST, backgroundColor: colors.surface, zIndex: 1 }}>
                        <View style={{ height: 40, justifyContent: 'center', paddingLeft: 16 }}>
                            <Txt size={10} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase' }}>
                                {label('season')}
                            </Txt>
                        </View>
                        {rows.map((row) => {
                            const viewing = row.season === player.season;
                            return (
                                <View key={`${row.season}-${row.team?.id}`} style={[{ height: ROW, justifyContent: 'center', paddingLeft: 16, backgroundColor: viewing ? alpha(colors.accent, 0.06) : undefined }, line]}>
                                    <Txt size={13} weight={viewing ? 'extrabold' : 'bold'} tabular>
                                        {seasonCell(row.season)}
                                    </Txt>
                                </View>
                            );
                        })}
                        <View style={{ height: ROW, justifyContent: 'center', paddingLeft: 16, borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.2) }}>
                            <Txt size={13} weight="extrabold">
                                {t('pro.ficha.career.total')}
                            </Txt>
                        </View>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                        <View>
                            <View style={{ height: 40, flexDirection: 'row', alignItems: 'center' }}>
                                <Txt size={10} weight="extrabold" tone="muted" style={{ width: grow(teamWidth), textTransform: 'uppercase' }}>
                                    {label('team')}
                                </Txt>
                                {head.map((key, index) => (
                                    <Txt key={key} size={10} weight="extrabold" tone="muted" numberOfLines={1} style={{ width: grow(widths[index]), textAlign: 'right', textTransform: 'uppercase' }}>
                                        {label(key)}
                                    </Txt>
                                ))}
                                <Txt size={10} weight="extrabold" tone="muted" style={{ width: grow(ptsWidth), textAlign: 'right', paddingRight: 16, textTransform: 'uppercase' }}>
                                    {label('pts')}
                                </Txt>
                            </View>
                            {rows.map((row) => {
                                const viewing = row.season === player.season;
                                return (
                                    <View
                                        key={`${row.season}-${row.team?.id}`}
                                        accessible
                                        accessibilityLabel={[seasonCell(row.season), row.team?.name, ...head.map((key, index) => `${label(key)} ${cells(row)[index]}`), `${label('pts')} ${ptsText(row.pts)}`].filter(Boolean).join(', ')}
                                        style={[{ height: ROW, flexDirection: 'row', alignItems: 'center', backgroundColor: viewing ? alpha(colors.accent, 0.06) : undefined }, line]}
                                    >
                                        <View style={{ width: grow(teamWidth) }}>{row.team ? <TeamLogo team={row.team} size={18} /> : <Txt size={13}>—</Txt>}</View>
                                        {cells(row).map((value, index) => (
                                            <Txt key={index} size={13} weight={viewing ? 'extrabold' : 'semibold'} tabular numberOfLines={1} style={{ width: grow(widths[index]), textAlign: 'right' }}>
                                                {value}
                                            </Txt>
                                        ))}
                                        <Txt size={13} weight="extrabold" tabular color={row.pts < 0 ? proColors.down : undefined} style={{ width: grow(ptsWidth), textAlign: 'right', paddingRight: 16 }}>
                                            {ptsText(row.pts)}
                                        </Txt>
                                    </View>
                                );
                            })}
                            <View
                                accessible
                                accessibilityLabel={[t('pro.ficha.career.total'), t('pro.ficha.career.teams', { count: teams }), ...head.map((key, index) => `${label(key)} ${totalCells[index]}`), `${label('pts')} ${totalPts}`].join(', ')}
                                style={{ height: ROW, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: alpha(colors.line, 0.2) }}
                            >
                                <Txt size={11} weight="semibold" tone="muted" numberOfLines={1} style={{ width: grow(teamWidth) }}>
                                    {t('pro.ficha.career.teams', { count: teams })}
                                </Txt>
                                {totalCells.map((value, index) => (
                                    <Txt key={index} size={13} weight="extrabold" tabular numberOfLines={1} style={{ width: grow(widths[index]), textAlign: 'right' }}>
                                        {value}
                                    </Txt>
                                ))}
                                <Txt size={13} weight="extrabold" tabular color={proColors.fantasy} style={{ width: grow(ptsWidth), textAlign: 'right', paddingRight: 16 }}>
                                    {ptsText(totalPts)}
                                </Txt>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </View>
    );
};

/** Barra de una temporada en el color de su equipo: crece desde abajo (500 ms, escalonada) */
const SeasonBar: React.FC<{ text: string; share: number; label: string; color: string; viewing: boolean; index: number; seen: boolean }> = ({ text, share, label, color, viewing, index, seen }) => {
    const progress = useGrow(Math.max(0.05, share), seen, index);
    const bar = useAnimatedStyle(() => ({ height: Math.max(4, progress.get() * 86) }));
    return (
        <View style={{ flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
            <Txt size={11} weight={viewing ? 'extrabold' : 'semibold'} tone={viewing ? 'ink' : 'muted'} tabular numberOfLines={1}>
                {text}
            </Txt>
            <Animated.View style={[{ width: '100%', maxWidth: 44, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: color, opacity: viewing ? 1 : 0.72 }, bar]} />
            <Txt size={10} weight={viewing ? 'extrabold' : 'semibold'} tone={viewing ? 'ink' : 'muted'} numberOfLines={1}>
                {label}
            </Txt>
        </View>
    );
};
