// «Tu temporada» (hoja): tus puntos por día contra el promedio de la liga (la línea se dibuja), tu mejor día,
// pronósticos acertados, cuántas veces tu capitán fue tu mejor pelotero y tu puesto. Hoy, si no ha cerrado, va punteado
// con lo proyectado.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LeagueId } from '../../../types';
import { seasonLabel } from '../../../lib/format';
import { useColors } from '../../../theme/theme';
import { radius, shadow } from '../../../theme/tokens';
import { ErrorState, OfflineState, Sheet, Skeleton, Txt, useErrorText } from '../../ui';
import { LineChart, ModuleHeader, ProNote, StatTile, useProColors, type LineSeries } from '../kit';
import { fmtPts, ordinal } from './bits';
import { seriesOf, useFanProfilePro, useSeasonTable } from './data';
import { alignSeries, shortDayName, topPercent } from './logic';

interface SeasonSheetProps {
    open: boolean;
    league: LeagueId;
    userId: string;
    today: string | null;
    /** Lo que se proyecta hoy si todavía no empezó (punteado al final de la línea) */
    projection: number | null;
    onClose: () => void;
}

export const SeasonSheet: React.FC<SeasonSheetProps> = ({ open, league, userId, today, projection, onClose }) => {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const colors = useColors();
    const pro = useProColors();
    const errorText = useErrorText();
    const fan = useFanProfilePro(userId, league, open);
    const season = useSeasonTable(league, undefined, open);
    const profile = fan.data;
    const mine = season.data?.ranking.find((row) => row.userId === userId);
    const total = season.data?.total ?? 0;
    const seasonName = season.data ? seasonLabel(season.data.season, league) : '';
    const played = (profile?.days ?? []).filter((day) => day.final || day.live || day.total !== 0);
    const team = played.reduce((sum, day) => sum + day.team, 0);
    const picks = played.reduce((sum, day) => sum + day.picks, 0);

    const chart = useMemo(() => {
        const series = seriesOf(profile);
        const daily = (season.data?.daily ?? []).map((item) => ({ date: item.date, total: item.average }));
        const aligned = alignSeries({ me: series, league: daily }, 'daily');
        // Hoy (si todavía no cuenta) va al final como «por jugarse»
        const todayX = today && !aligned.dates.includes(today) && aligned.dates.length ? aligned.dates.length : null;
        const lastIndex = aligned.values.me ? [...aligned.values.me].map((value, index) => (value !== null ? index : -1)).reduce((a, b) => Math.max(a, b), -1) : -1;
        const last = lastIndex >= 0 ? aligned.values.me[lastIndex] : null;
        const lines: LineSeries[] = [];
        if (aligned.dates.length > 1) {
            lines.push({ id: 'league', name: t('pro.fantasy.season.leagueAvg'), color: colors.muted, dashed: true, points: aligned.dates.map((_, i) => ({ x: i, y: aligned.values.league[i] })) });
        }
        lines.push({
            id: 'me',
            name: t('pro.fantasy.season.you'),
            color: pro.fantasy,
            width: 3,
            endDot: true,
            endLabel: todayX === null && last !== null ? fmtPts(last) : undefined,
            points: aligned.dates.map((_, i) => ({ x: i, y: aligned.values.me[i] }))
        });
        // Lo proyectado de hoy, punteado desde tu último día
        if (todayX !== null && projection !== null && last !== null) {
            lines.push({ id: 'proj', name: t('pro.fantasy.season.projection'), color: pro.fantasy, dashed: true, endDot: true, endLabel: t('pro.fantasy.season.projShort', { pts: fmtPts(projection) }), points: [{ x: lastIndex, y: last }, { x: todayX, y: projection }] });
        }
        const avg = daily.length ? daily.reduce((sum, item) => sum + item.total, 0) / daily.length : null;
        const step = aligned.dates.length > 8 ? Math.ceil(aligned.dates.length / 6) : 1;
        const ticks = [
            ...aligned.dates.map((date, i) => ({ value: i, label: String(Number(date.slice(8))) })).filter((_, i) => i % step === 0 || i === aligned.dates.length - 1),
            ...(todayX !== null ? [{ value: todayX, label: t('games.today').toLowerCase(), strong: true }] : [])
        ];
        return { lines, ticks, todayX, max: Math.max(1, todayX !== null ? todayX + 0.5 : aligned.dates.length - 1), avg, single: aligned.dates.length === 1 };
    }, [profile, season.data, today, projection, t, colors.muted, pro.fantasy]);

    const proData = profile?.pro;
    const best = profile?.season.best;
    const bestDay = best ? played.find((day) => day.date === best.date) : undefined;
    const top = mine?.rank ? topPercent(mine.rank, total) : null;
    const summary = chart.lines.map((line) => `${line.name}: ${line.points.filter((point) => point.y !== null).map((point) => fmtPts(point.y)).join(', ')}`).join('. ');
    const pct = (value: number) => `${Math.round(value)}%`;

    return (
        <Sheet open={open} onClose={onClose} title={t('pro.fantasy.season.title', { season: seasonName })}>
            {fan.fetchStatus === 'paused' && !profile ? (
                <OfflineState />
            ) : fan.isPending || season.isPending ? (
                <View style={{ gap: 12 }}>
                    <Skeleton height={20} width={192} round={10} />
                    <Skeleton height={200} />
                    <Skeleton height={180} />
                </View>
            ) : fan.isError && !profile ? (
                <ErrorState message={errorText(fan.error)} onRetry={() => fan.refetch()} />
            ) : !profile || !profile.season.days ? (
                <ProNote tone="pending" title={t('pro.fantasy.season.emptyTitle')}>
                    {t('pro.fantasy.season.empty')}
                </ProNote>
            ) : (
                <>
                    <Txt size={13} tone="muted" style={{ marginTop: -4 }}>
                        {t('pro.fantasy.season.sub', { count: profile.season.days, pts: fmtPts(profile.season.points), team: fmtPts(team), picks: fmtPts(picks) })}
                    </Txt>
                    <View style={[{ gap: 10, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 }, shadow('card')]}>
                        <ModuleHeader title={t('pro.fantasy.season.chartTitle')} aside={t('pro.fantasy.season.chartAside')} />
                        <LineChart
                            series={chart.lines}
                            label={t('pro.fantasy.season.chartLabel', { list: summary })}
                            height={170}
                            formatY={(value) => fmtPts(value)}
                            xTicks={chart.ticks}
                            xDomain={[0, chart.max]}
                            xBand={chart.todayX !== null ? { from: chart.todayX - 0.4, to: chart.todayX + 0.4 } : undefined}
                            reference={chart.single && chart.avg !== null ? { y: chart.avg, label: t('pro.fantasy.season.avgShort', { pts: fmtPts(chart.avg) }) } : undefined}
                        />
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: pro.fantasy }} />
                                <Txt size={11} weight="semibold" tone="muted">
                                    {t('pro.fantasy.season.you')}
                                </Txt>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 16, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.muted }} />
                                <Txt size={11} weight="semibold" tone="muted">
                                    {t('pro.fantasy.season.leagueAvg')}
                                    {chart.avg !== null ? (
                                        <Txt size={11} weight="bold">
                                            {` ${fmtPts(chart.avg)}`}
                                        </Txt>
                                    ) : null}
                                </Txt>
                            </View>
                        </View>
                        {projection !== null && (
                            <Txt size={11} tone="muted">
                                {t('pro.fantasy.season.todayProj', { pts: fmtPts(projection) })}
                            </Txt>
                        )}
                    </View>
                    <View style={{ gap: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <StatTile
                                countTo={best?.points ?? 0}
                                format={(value) => fmtPts(value)}
                                unit={t('pro.fantasy.pts')}
                                label={t('pro.fantasy.season.bestDay')}
                                sub={best ? `${shortDayName(best.date, lang)}${bestDay ? ` · ${t('pro.fantasy.summary.split', { team: fmtPts(bestDay.team), picks: fmtPts(bestDay.picks) })}` : ''}` : undefined}
                                style={{ flex: 1, flexBasis: 0 }}
                            />
                            <StatTile
                                value={mine?.rank ? ordinal(mine.rank, lang) : '—'}
                                label={t('pro.fantasy.season.rank')}
                                sub={mine?.rank ? `${t('pro.fantasy.summary.ofFans', { count: total })}${top !== null ? ` · ${t('pro.fantasy.summary.top', { pct: top })}` : ''}` : t('pro.fantasy.summary.noRank')}
                                style={{ flex: 1, flexBasis: 0 }}
                            />
                        </View>
                        {/* Pronósticos y capitán acertados: solo con el perfil PRO del servidor (sin él no se sabe) */}
                        {proData ? (
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <StatTile
                                    {...(proData.picks.pct !== null ? { countTo: proData.picks.pct, format: pct } : { value: '—' })}
                                    label={t('pro.fantasy.season.picks')}
                                    sub={proData.picks.made ? t('pro.fantasy.season.picksSub', { won: proData.picks.won, count: proData.picks.made }) : t('pro.fantasy.season.picksNone')}
                                    style={{ flex: 1, flexBasis: 0 }}
                                />
                                <StatTile
                                    {...(proData.captain.pct !== null ? { countTo: proData.captain.pct, format: pct } : { value: '—' })}
                                    tone={proData.captain.pct !== null && proData.captain.pct < 50 ? 'down' : 'default'}
                                    label={t('pro.fantasy.season.captain')}
                                    sub={proData.captain.days ? t('pro.fantasy.season.captainSub', { best: proData.captain.best, count: proData.captain.days }) : t('pro.fantasy.season.captainNone')}
                                    style={{ flex: 1, flexBasis: 0 }}
                                />
                            </View>
                        ) : null}
                    </View>
                    {proData?.average !== null && proData?.average !== undefined && profile.season.days > 1 ? (
                        <Txt size={12} tone="muted">
                            {t('pro.fantasy.season.average', { pts: fmtPts(proData.average) })}
                        </Txt>
                    ) : null}
                </>
            )}
        </Sheet>
    );
};
