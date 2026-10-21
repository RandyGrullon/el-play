import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react-native';
import { useLeague } from '../../../state/league';
import { seasonLabel } from '../../../lib/format';
import { useProSeason, useProTeamStats } from '../../../lib/pro/liga';
import { isPermanent, isRouteMissing } from '../../../lib/pro/http';
import type { StatsTeam } from '../../../lib/stats';
import { useColors } from '../../../theme/theme';
import { alpha, radius, shadow } from '../../../theme/tokens';
import type { ProPhaseId, TeamHitting, TeamPitching, TeamStats } from '../../../types/pro-liga';
import { ErrorState, OfflineState, Skeleton, TeamLogo, Txt, useErrorText } from '../../ui';
import { waitingForNetwork } from '../../stats/common';
import { Chip, HBarChart, ModuleHeader, ProNote, ProSegmented, ScreenTitle, type HBarRow } from '../kit';
import { LEAGUE_PHASES, tooEarly } from './logic';
import { PhaseSelect } from './parts';
import { ProStatsTabs, goToStatsTab } from './ProStatsTabs';
import { ProScroll } from './scroll';

type TeamRow = TeamStats['teams'][number];

interface Metric {
    key: string;
    group: 'hitting' | 'pitching';
    /** Valor del equipo */
    value: (h: TeamHitting, p: TeamPitching, fip: number | null) => number | null;
    /** Valor de la liga con las sumas de los equipos (no el promedio de promedios) */
    league: (rows: TeamRow[], fip: number | null) => number | null;
    write: (value: number) => string;
    lower?: boolean;
}

const sum = (rows: TeamRow[], pick: (row: TeamRow) => number | undefined | null) => rows.reduce((total, row) => total + (pick(row) ?? 0), 0);
const div = (num: number, den: number) => (den > 0 ? num / den : null);
const rate3 = (value: number) => value.toFixed(3).replace(/^0(?=\.)/, '');
const dec = (digits: number) => (value: number) => value.toFixed(digits);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const count = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
const perTeam = (rows: TeamRow[], pick: (row: TeamRow) => number | undefined | null) => (rows.length ? sum(rows, pick) / rows.length : null);
const fipOf = (p: { hr: number; bb: number; hbp?: number; k: number; outs: number }, constant: number | null) =>
    constant === null || p.outs <= 0 ? null : (13 * p.hr + 3 * (p.bb + (p.hbp ?? 0)) - 2 * p.k) / (p.outs / 3) + constant;

const H = (row: TeamRow) => row.hitting;
const P = (row: TeamRow) => row.pitching;
const onBase = (rows: TeamRow[]) => div(sum(rows, (r) => (H(r) ? H(r)!.h + H(r)!.bb + H(r)!.hbp : 0)), sum(rows, (r) => (H(r) ? H(r)!.ab + H(r)!.bb + H(r)!.hbp + (H(r)!.sf ?? 0) : 0)));
const slugging = (rows: TeamRow[]) => div(sum(rows, (r) => H(r)?.tb), sum(rows, (r) => H(r)?.ab));

export const TEAM_METRICS: Metric[] = [
    { key: 'avg', group: 'hitting', value: (h) => div(h.h, h.ab), league: (rows) => div(sum(rows, (r) => H(r)?.h), sum(rows, (r) => H(r)?.ab)), write: rate3 },
    { key: 'obp', group: 'hitting', value: (h) => div(h.h + h.bb + h.hbp, h.ab + h.bb + h.hbp + (h.sf ?? 0)), league: onBase, write: rate3 },
    { key: 'slg', group: 'hitting', value: (h) => div(h.tb ?? 0, h.ab), league: slugging, write: rate3 },
    {
        key: 'ops',
        group: 'hitting',
        value: (h) => {
            const obp = div(h.h + h.bb + h.hbp, h.ab + h.bb + h.hbp + (h.sf ?? 0));
            const slg = div(h.tb ?? 0, h.ab);
            return obp === null || slg === null ? null : obp + slg;
        },
        league: (rows) => {
            const obp = onBase(rows);
            const slg = slugging(rows);
            return obp === null || slg === null ? null : obp + slg;
        },
        write: rate3
    },
    { key: 'hr', group: 'hitting', value: (h) => h.hr, league: (rows) => perTeam(rows, (r) => H(r)?.hr), write: count },
    { key: 'rpg', group: 'hitting', value: (h) => div(h.r, h.g), league: (rows) => div(sum(rows, (r) => H(r)?.r), sum(rows, (r) => H(r)?.g)), write: dec(2) },
    { key: 'sb', group: 'hitting', value: (h) => h.sb, league: (rows) => perTeam(rows, (r) => H(r)?.sb), write: count },
    { key: 'kPct', group: 'hitting', value: (h) => div(h.k, h.pa), league: (rows) => div(sum(rows, (r) => H(r)?.k), sum(rows, (r) => H(r)?.pa)), write: pct, lower: true },
    { key: 'bbPct', group: 'hitting', value: (h) => div(h.bb, h.pa), league: (rows) => div(sum(rows, (r) => H(r)?.bb), sum(rows, (r) => H(r)?.pa)), write: pct },
    { key: 'era', group: 'pitching', value: (_, p) => div(27 * p.er, p.outs), league: (rows) => div(27 * sum(rows, (r) => P(r)?.er), sum(rows, (r) => P(r)?.outs)), write: dec(2), lower: true },
    { key: 'whip', group: 'pitching', value: (_, p) => div(3 * (p.h + p.bb), p.outs), league: (rows) => div(3 * sum(rows, (r) => (P(r) ? P(r)!.h + P(r)!.bb : 0)), sum(rows, (r) => P(r)?.outs)), write: dec(2), lower: true },
    { key: 'k', group: 'pitching', value: (_, p) => p.k, league: (rows) => perTeam(rows, (r) => P(r)?.k), write: count },
    { key: 'k9', group: 'pitching', value: (_, p) => div(27 * p.k, p.outs), league: (rows) => div(27 * sum(rows, (r) => P(r)?.k), sum(rows, (r) => P(r)?.outs)), write: dec(2) },
    { key: 'bb9', group: 'pitching', value: (_, p) => div(27 * p.bb, p.outs), league: (rows) => div(27 * sum(rows, (r) => P(r)?.bb), sum(rows, (r) => P(r)?.outs)), write: dec(2), lower: true },
    { key: 'hr9', group: 'pitching', value: (_, p) => div(27 * p.hr, p.outs), league: (rows) => div(27 * sum(rows, (r) => P(r)?.hr), sum(rows, (r) => P(r)?.outs)), write: dec(2), lower: true },
    { key: 'sv', group: 'pitching', value: (_, p) => p.sv, league: (rows) => perTeam(rows, (r) => P(r)?.sv), write: count },
    {
        key: 'fip',
        group: 'pitching',
        value: (_, p, fip) => fipOf(p, fip),
        league: (rows, fip) => fipOf({ hr: sum(rows, (r) => P(r)?.hr), bb: sum(rows, (r) => P(r)?.bb), hbp: sum(rows, (r) => P(r)?.hbp), k: sum(rows, (r) => P(r)?.k), outs: sum(rows, (r) => P(r)?.outs) }, fip),
        write: dec(2),
        lower: true
    }
];

const PREVIEW = ['avg', 'ops', 'hr', 'era', 'whip', 'k'];

/** Filas de una métrica, del mejor al peor */
export const teamMetricRows = (data: TeamStats, metric: Metric) => {
    const fip = data.constants.fip ?? null;
    const rows = data.teams
        .filter((row) => row.hitting && row.pitching)
        .map((row) => ({ team: row.team, value: metric.value(row.hitting!, row.pitching!, fip) }))
        .filter((row): row is { team: StatsTeam; value: number } => row.value !== null && Number.isFinite(row.value));
    rows.sort((a, b) => (metric.lower ? a.value - b.value : b.value - a.value));
    return { rows, league: metric.league(data.teams, fip) };
};

const MetricCard: React.FC<{ data: TeamStats; metric: Metric; style?: object }> = ({ data, metric, style }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { rows, league } = teamMetricRows(data, metric);
    if (!rows.length) return null;
    const long = t(`pro.estadisticas.teams.metrics.${metric.key}.long`);
    const bars: HBarRow[] = rows.map((row, index) => ({
        id: String(row.team.id),
        name: row.team.name,
        label: <TeamLogo team={row.team} size={22} />,
        value: row.value,
        display: metric.write(row.value),
        color: row.team.color,
        emphasis: index === 0
    }));
    return (
        <View style={[{ borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: alpha(colors.line, 0.06), padding: 14 }, shadow('card'), style]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <Txt size={15} weight="black">
                    {t(`pro.estadisticas.teams.metrics.${metric.key}.short`)}
                </Txt>
                {league !== null && (
                    <Txt size={11} weight="bold" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {t('pro.estadisticas.teams.league', { value: metric.write(league) })}
                    </Txt>
                )}
            </View>
            <Txt size={11} tone="muted" style={{ marginBottom: 10, lineHeight: 15 }}>
                {long}
                {metric.lower ? (
                    <Txt size={11} weight="bold">
                        {` · ${t('pro.estadisticas.teams.lower')}`}
                    </Txt>
                ) : null}
            </Txt>
            <HBarChart
                rows={bars}
                label={`${t('pro.estadisticas.teams.chartAria', { metric: long })}${league !== null ? ` (${t('pro.estadisticas.teams.league', { value: metric.write(league) })})` : ''}`}
                center={league ?? undefined}
                lowerIsBetter={metric.lower}
                labelWidth={24}
            />
        </View>
    );
};

/** Tarjetas en dos columnas (una a menos de 360 px) */
const MetricGrid: React.FC<{ data: TeamStats; metrics: Metric[] }> = ({ data, metrics }) => {
    const { width } = useWindowDimensions();
    const two = width >= 360;
    const shown = metrics.filter((metric) => teamMetricRows(data, metric).rows.length > 0);
    if (!two) {
        return (
            <View style={{ gap: 8 }}>
                {shown.map((metric) => (
                    <MetricCard key={metric.key} data={data} metric={metric} />
                ))}
            </View>
        );
    }
    const pairs: Metric[][] = [];
    for (let index = 0; index < shown.length; index += 2) pairs.push(shown.slice(index, index + 2));
    return (
        <View style={{ gap: 8 }}>
            {pairs.map((pair) => (
                <View key={pair[0].key} style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
                    {pair.map((metric) => (
                        <MetricCard key={metric.key} data={data} metric={metric} style={{ flex: 1, flexBasis: 0, minWidth: 0 }} />
                    ))}
                    {pair.length === 1 && <View style={{ flex: 1, flexBasis: 0 }} />}
                </View>
            ))}
        </View>
    );
};

const NewChip: React.FC = () => {
    const { t } = useTranslation();
    return (
        <Chip tone="accent" style={{ height: 20, paddingHorizontal: 8 }}>
            <Txt size={10} weight="extrabold" color={useColors().accentInk} style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
                {t('pro.estadisticas.teams.new')}
            </Txt>
        </Chip>
    );
};

/** Vista previa dentro de Estadísticas: 6 métricas y «Abrir» */
export const TeamsPreview: React.FC<{ season?: number; phase?: ProPhaseId }> = ({ season, phase }) => {
    const { t } = useTranslation();
    const colors = useColors();
    const { activeLeague } = useLeague();
    const phases = LEAGUE_PHASES[activeLeague];
    const current = phase ?? phases[0];
    const query = useProTeamStats(activeLeague, current === phases[0] ? undefined : current, season);
    const data = query.data;
    const metrics = useMemo(() => PREVIEW.map((key) => TEAM_METRICS.find((metric) => metric.key === key)!), []);
    if (!data || !data.teams.some((row) => row.hitting && row.hitting.g > 0)) return null;
    return (
        <View style={{ gap: 12 }}>
            <ModuleHeader
                title={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                        <Txt eyebrow accessibilityRole="header">
                            {t('pro.estadisticas.teams.title')}
                        </Txt>
                        <NewChip />
                    </View>
                }
                aside={
                    <Pressable
                        onPress={() => goToStatsTab('equipos')}
                        accessibilityRole="button"
                        accessibilityLabel={t('pro.estadisticas.teams.openAria')}
                        style={({ pressed }) => ({ height: 44, marginVertical: -14, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 8, opacity: pressed ? 0.7 : 1 })}
                    >
                        <Txt size={13} weight="bold" color={colors.accentInk}>
                            {t('pro.estadisticas.teams.open')}
                        </Txt>
                        <ChevronRight size={16} color={colors.accentInk} />
                    </Pressable>
                }
            />
            <Txt size={13} tone="muted" style={{ lineHeight: 18 }}>
                {t('pro.estadisticas.teams.previewIntro', { phase: t(`pro.estadisticas.phases.${current}`).toLowerCase(), season: seasonLabel(data.season, activeLeague) })}
            </Txt>
            <MetricGrid data={data} metrics={metrics} />
        </View>
    );
};

// Equipos del modo PRO (la pestaña nueva): tarjetas por métrica con los 6 equipos en barras de su color, del mejor al
// peor. Cada barra sale del promedio de la liga (a la derecha, mejor). Con menos de 5 juegos por equipo en la vigente
// se ve la pasada completa (como Estadísticas).
export const TeamsScreen: React.FC = () => {
    const { t } = useTranslation();
    const errorText = useErrorText();
    const { activeLeague } = useLeague();
    const phases = LEAGUE_PHASES[activeLeague];
    // null = la temporada la decide la pantalla (la vigente, o la pasada si la vigente apenas empieza)
    const [seasonChoice, setSeasonChoice] = useState<number | null>(null);
    const [phaseChoice, setPhaseChoice] = useState<ProPhaseId>(phases[0]);
    const [shownLeague, setShownLeague] = useState(activeLeague);
    if (shownLeague !== activeLeague) {
        setShownLeague(activeLeague);
        setSeasonChoice(null);
        setPhaseChoice(LEAGUE_PHASES[activeLeague][0]);
    }
    const phase = phases.includes(phaseChoice) ? phaseChoice : phases[0];
    const overview = useProSeason(activeLeague);
    const base = useProTeamStats(activeLeague);
    const baseGames = base.data ? Math.max(0, ...base.data.teams.map((row) => row.hitting?.g ?? 0)) : 0;
    const autoPrevious = seasonChoice === null && !!base.data && !base.data.isPreviousSeason && tooEarly(baseGames);
    // La elegida a mano se respeta aunque sea la vigente con pocos juegos (sale con su nota de muestra pequeña)
    const season = seasonChoice !== null ? (seasonChoice === base.data?.season ? undefined : seasonChoice) : autoPrevious ? base.data!.season - 1 : undefined;
    const query = useProTeamStats(activeLeague, phase === phases[0] ? undefined : phase, season, !base.isPending && !isPermanent(base.error));
    const data = query.data;
    const missing = isRouteMissing(base.error);
    const phaseText = t(`pro.estadisticas.phases.${phase}`).toLowerCase();
    const seasonText = data ? seasonLabel(data.season, activeLeague) : '';
    const hasData = !!data && data.teams.some((row) => row.hitting && row.hitting.g > 0);
    const current = overview.data?.season ?? base.data?.season ?? data?.season;
    const games = data ? Math.max(0, ...data.teams.map((row) => row.hitting?.g ?? 0)) : 0;
    const tiny = !autoPrevious && !!data && !data.isPreviousSeason && data.season === current && tooEarly(games) && games > 0;
    const eyebrow = [t(`leagues.${activeLeague}.name`), seasonText ? t('pro.estadisticas.seasonEyebrow', { season: seasonText }) : null, t(`pro.estadisticas.phases.${phase}`)].filter(Boolean).join(' · ');
    const pending = base.isPending || (query.isPending && query.fetchStatus !== 'idle');

    return (
        <ProScroll onRefresh={() => Promise.all([base.refetch(), query.refetch()])}>
            <ProStatsTabs active="equipos" />
            <ScreenTitle eyebrow={eyebrow} title={t('pro.estadisticas.teams.title')} subtitle={t('pro.estadisticas.teams.intro')} />
            {!missing && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    {current ? (
                        <ProSegmented<string>
                            style={{ flexGrow: 1, flexBasis: 170 }}
                            track="surface"
                            label={t('statsPage.seasonPicker')}
                            value={String(data?.season ?? current)}
                            onChange={(value) => setSeasonChoice(Number(value))}
                            options={[current, current - 1].map((year) => ({ value: String(year), label: seasonLabel(year, activeLeague) }))}
                        />
                    ) : null}
                    {phases.length > 1 && <PhaseSelect value={phase} phases={phases} onChange={setPhaseChoice} />}
                </View>
            )}
            {autoPrevious && data && base.data && <ProNote>{t('pro.estadisticas.notes.autoPrevious', { count: baseGames, current: seasonLabel(base.data.season, activeLeague), previous: seasonText, games })}</ProNote>}
            {tiny && <ProNote tone="warn">{t('pro.estadisticas.notes.tinySample', { count: games })}</ProNote>}
            {missing ? (
                <ProNote tone="pending">{t('pro.estadisticas.teams.missing')}</ProNote>
            ) : waitingForNetwork(base) ? (
                <OfflineState />
            ) : pending ? (
                <View style={{ gap: 8 }} accessibilityLabel={t('pro.estadisticas.loading')}>
                    <Skeleton height={220} />
                    <Skeleton height={220} />
                </View>
            ) : (query.isError || base.isError) && !data ? (
                <ErrorState message={errorText((query.error ?? base.error) as Error)} onRetry={() => (base.isError ? base.refetch() : query.refetch())} />
            ) : !hasData ? (
                <ProNote tone="neutral">{t('pro.estadisticas.teams.empty', { phase: phaseText })}</ProNote>
            ) : (
                (['hitting', 'pitching'] as const).map((group) => (
                    <View key={group} style={{ gap: 12 }}>
                        <ModuleHeader title={t(`pro.estadisticas.teams.${group}`)} aside={t('pro.estadisticas.teams.games', { count: games })} />
                        <MetricGrid data={data!} metrics={TEAM_METRICS.filter((metric) => metric.group === group)} />
                    </View>
                ))
            )}
            {hasData && (
                <Txt size={12} tone="muted">
                    {t('pro.estadisticas.teams.note', { fip: data!.constants.fip !== null && data!.constants.fip !== undefined ? data!.constants.fip.toFixed(2) : '—' })}
                </Txt>
            )}
        </ProScroll>
    );
};
